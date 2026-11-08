import crypto from 'node:crypto';
import {
	ImageError,
	POST_IMAGE_SIZE,
	removeUploads,
	saveUpload,
	sniffImage,
	sniffMedia,
	toWebp,
	uploadToS3
} from './images.js';
import { readJson } from './api.js';
import { checkStaged, claimStaged, parseStagedIds } from './stagedUploads.js';
import { hit, isLimited } from './ratelimit.js';
import { LIMITS, parseId } from './validation.js';

/** Shared by direct and group messages: reading the body, validating it and saving its images. */

// Sending is limited per sender over direct and group messages together, and messages carrying
// media (the expensive ones to process and store) have a tighter limit of their own.
const WINDOW_MS = 60_000;
const MAX_MESSAGES = 70;
const MAX_IMAGE_MESSAGES = 5;

const keys = (userId: number) => ({ message: `dm:${userId}`, image: `dm-images:${userId}` });

/** The 429 to send back when this sender is over the limit, or null. Counts nothing. */
export function messageLimited(userId: number, hasImages: boolean): Response | null {
	const { message, image } = keys(userId);
	if (isLimited(message, MAX_MESSAGES) || (hasImages && isLimited(image, MAX_IMAGE_MESSAGES))) {
		return new Response('You are sending messages too fast, try again in a minute', {
			status: 429
		});
	}
	return null;
}

/** Counts a message. Call before the image processing, so a concurrent burst can't skip the limit. */
export function countMessage(userId: number, hasImages: boolean) {
	const { message, image } = keys(userId);
	hit(message, WINDOW_MS);
	if (hasImages) hit(image, WINDOW_MS);
}

export type MessageBody = {
	/** the other fields: form fields, or the JSON object */
	fields: Record<string, unknown>;
	content: string;
	files: File[];
	/** ids of files uploaded beforehand (api/uploads), attached after `files` */
	uploads: string[];
};

/** Multipart when the message has files, plain JSON otherwise. */
export async function readMessageBody(request: Request): Promise<MessageBody | Response> {
	if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
		let form: FormData;
		try {
			form = await request.formData();
		} catch {
			return new Response('Upload too big or invalid', { status: 400 });
		}
		const raw = form.get('content');
		const uploads = parseStagedIds(form.getAll('uploads'));
		if (uploads instanceof Response) return uploads;
		return {
			fields: Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')),
			content: typeof raw === 'string' ? raw.trim() : '',
			// accept both 'images' (legacy) and 'files' field names
			files: [...form.getAll('images'), ...form.getAll('files')].filter(
				(f): f is File => f instanceof File && f.size > 0
			),
			uploads
		};
	}
	const fields = await readJson(request);
	const uploads = parseStagedIds(fields.uploads);
	if (uploads instanceof Response) return uploads;
	return {
		fields,
		content: typeof fields.content === 'string' ? fields.content.trim() : '',
		files: [],
		uploads
	};
}

/**
 * The message a new one answers (`reply_to`): its id, null when it isn't a reply, or the error.
 * Whether it belongs to the conversation is up to the caller.
 */
export function readReplyTo(fields: Record<string, unknown>): number | null | Response {
	const raw = fields.reply_to;
	if (raw === undefined || raw === null || raw === '') return null;
	return parseId(raw) ?? new Response('Invalid reply_to', { status: 400 });
}

/** Whether the message carries files, uploaded with it or beforehand. */
export const hasImages = (body: MessageBody) => body.files.length + body.uploads.length > 0;

/** The error to send back for a message that can't be sent as is, or null. */
export function checkMessage(body: MessageBody, userId: number): Response | null {
	const { content, files, uploads } = body;
	if (!content && !hasImages(body)) return new Response('Missing content', { status: 400 });
	if (content.length > LIMITS.messageContent) {
		return new Response(`Messages can be at most ${LIMITS.messageContent} characters`, {
			status: 400
		});
	}
	if (files.length + uploads.length > LIMITS.messageImages) {
		return new Response(`Messages can have at most ${LIMITS.messageImages} attachments`, {
			status: 400
		});
	}
	return checkStaged(userId, uploads);
}

/**
 * Validates every file before anything is written to disk, then saves images as WebP, uploads
 * video/audio to S3, and claims the ones uploaded beforehand. Returns their URL paths, or the
 * error to send back.
 */
export async function saveMessageImages(
	{ files, uploads: staged }: MessageBody,
	userId: number
): Promise<string[] | Response> {
	const imageUploads: { buffer: Buffer; ext: string }[] = [];
	const mediaUploads: { buffer: Buffer; ext: string }[] = [];
	for (const file of files) {
		const buffer = Buffer.from(await file.arrayBuffer());
		const imgExt = sniffImage(buffer);
		if (imgExt) {
			if (file.size > LIMITS.imageBytes) {
				return new Response('Image too big, max size is 10mb', { status: 400 });
			}
			imageUploads.push({ buffer, ext: imgExt });
			continue;
		}
		const mediaExt = sniffMedia(buffer);
		if (mediaExt) {
			if (file.size > LIMITS.mediaBytes) {
				const mb = Math.round(LIMITS.mediaBytes / 1024 / 1024);
				return new Response(`File too big, max size is ${mb}mb`, { status: 400 });
			}
			mediaUploads.push({ buffer, ext: mediaExt });
			continue;
		}
		return new Response('Unsupported file type', { status: 400 });
	}

	let optimized: Buffer[];
	try {
		optimized = await Promise.all(
			imageUploads.map((u) => toWebp(u.buffer, u.ext, { size: POST_IMAGE_SIZE }))
		);
	} catch (e) {
		if (e instanceof ImageError) return new Response(e.message, { status: 400 });
		throw e;
	}
	const saved = await Promise.all(optimized.map(saveUpload));
	// upload video/audio to S3
	const s3Urls: string[] = [];
	try {
		for (const u of mediaUploads) {
			const url = await uploadToS3(u.buffer, `${crypto.randomUUID()}.${u.ext}`);
			s3Urls.push(url);
		}
	} catch (e) {
		await removeUploads(saved);
		throw e;
	}
	const claimed = await claimStaged(userId, staged);
	if (claimed instanceof Response) {
		await removeUploads(saved);
		return claimed;
	}
	return [...saved, ...s3Urls, ...claimed];
}
