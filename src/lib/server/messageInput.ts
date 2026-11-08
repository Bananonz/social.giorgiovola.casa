import {
	ImageError,
	POST_IMAGE_SIZE,
	removeUploads,
	saveUpload,
	sniffImage,
	toWebp
} from './images.js';
import { readJson } from './api.js';
import { checkStaged, claimStaged, parseStagedIds } from './stagedUploads.js';
import { hit, isLimited } from './ratelimit.js';
import { LIMITS, parseId } from './validation.js';

/** Shared by direct and group messages: reading the body, validating it and saving its images. */

// Sending is limited per sender over direct and group messages together, and messages carrying
// images (the expensive ones to process and store) have a tighter limit of their own.
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
	/** ids of images uploaded beforehand (api/uploads), attached after `files` */
	uploads: string[];
};

/** Multipart when the message has images, plain JSON otherwise. */
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
			files: form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0),
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

/** Whether the message carries images, uploaded with it or beforehand. */
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
		return new Response(`Messages can have at most ${LIMITS.messageImages} images`, {
			status: 400
		});
	}
	return checkStaged(userId, uploads);
}

/**
 * Validates every image before anything is written to disk, then saves them as WebP and claims
 * the ones uploaded beforehand. Returns their URL paths, or the error to send back.
 */
export async function saveMessageImages(
	{ files, uploads: staged }: MessageBody,
	userId: number
): Promise<string[] | Response> {
	const uploads: { buffer: Buffer; ext: string }[] = [];
	for (const file of files) {
		if (file.size > LIMITS.imageBytes) {
			return new Response('Image too big, max size is 10mb', { status: 400 });
		}
		const buffer = Buffer.from(await file.arrayBuffer());
		const ext = sniffImage(buffer);
		if (!ext) {
			return new Response(
				'Unsupported image type, use PNG, JPEG, GIF, WebP, AVIF, BMP, ICO or SVG',
				{ status: 400 }
			);
		}
		uploads.push({ buffer, ext });
	}

	let optimized: Buffer[];
	try {
		optimized = await Promise.all(
			uploads.map((u) => toWebp(u.buffer, u.ext, { size: POST_IMAGE_SIZE }))
		);
	} catch (e) {
		if (e instanceof ImageError) return new Response(e.message, { status: 400 });
		throw e;
	}
	const saved = await Promise.all(optimized.map(saveUpload));
	const claimed = await claimStaged(userId, staged);
	if (claimed instanceof Response) {
		await removeUploads(saved);
		return claimed;
	}
	return [...saved, ...claimed];
}
