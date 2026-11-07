import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
	ImageError,
	POST_IMAGE_SIZE,
	UPLOAD_DIR,
	removeUploads,
	sniffImage,
	toWebp
} from './images.js';
import { LIMITS } from './validation.js';

/**
 * Images uploaded as soon as they're picked in the composer, so posting only has to move them in
 * place. They're processed like any upload but kept out of the served directory and owned by
 * their uploader until a post or message claims them; unclaimed ones are deleted after a while.
 * Kept in memory: the app runs as a single process (like the rate limits).
 */

// inside UPLOAD_DIR so claiming is a rename on the same filesystem. The uploads route only serves
// files directly in UPLOAD_DIR, so these can't be fetched
const STAGING_DIR = path.join(UPLOAD_DIR, 'staged');
const TTL_MS = 24 * 60 * 60 * 1000;

type Staged = { userId: number; expires: number };
const staged = new Map<string, Staged>();

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fileOf = (id: string) => path.join(STAGING_DIR, `${id}.webp`);

async function drop(id: string) {
	staged.delete(id);
	await fs.promises.rm(fileOf(id), { force: true }).catch(() => {});
}

// what a previous run left behind can't be claimed any more
const ready = fs.promises
	.rm(STAGING_DIR, { recursive: true, force: true })
	.then(() => fs.promises.mkdir(STAGING_DIR, { recursive: true }));

setInterval(() => {
	const now = Date.now();
	for (const [id, entry] of staged) if (entry.expires <= now) void drop(id);
}, 10 * 60_000).unref?.();

/** Validates and compresses an image and holds it for `userId`. Returns its id, or the error. */
export async function stageImage(userId: number, file: File): Promise<string | Response> {
	if (file.size > LIMITS.imageBytes) {
		return new Response('Image too big, max size is 10mb', { status: 400 });
	}
	const buffer = Buffer.from(await file.arrayBuffer());
	const ext = sniffImage(buffer);
	if (!ext) {
		return new Response('Unsupported image type, use PNG, JPEG, GIF, WebP, AVIF, BMP, ICO or SVG', {
			status: 400
		});
	}
	let webp: Buffer;
	try {
		webp = await toWebp(buffer, ext, { size: POST_IMAGE_SIZE });
	} catch (e) {
		if (e instanceof ImageError) return new Response(e.message, { status: 400 });
		throw e;
	}
	await ready;
	const id = crypto.randomUUID();
	await fs.promises.writeFile(fileOf(id), webp);
	staged.set(id, { userId, expires: Date.now() + TTL_MS });
	return id;
}

/** Deletes one of `userId`'s staged images (removed from the composer). False when not found. */
export async function discardStaged(userId: number, id: string): Promise<boolean> {
	if (staged.get(id)?.userId !== userId) return false;
	await drop(id);
	return true;
}

/** The ids sent with a post or message (`uploads`), or the error when they aren't valid. */
export function parseStagedIds(raw: unknown): string[] | Response {
	if (raw === undefined || raw === null) return [];
	const ids = Array.isArray(raw) ? raw : [raw];
	if (!ids.every((id): id is string => typeof id === 'string' && ID_RE.test(id))) {
		return new Response('Invalid uploads', { status: 400 });
	}
	return [...new Set(ids)];
}

/**
 * Checks that every id is one of `userId`'s staged images. Separate from claimStaged so a request
 * can be rejected before anything is moved. 410 tells the client to upload them again.
 */
export function checkStaged(userId: number, ids: string[]): Response | null {
	for (const id of ids) {
		if (staged.get(id)?.userId !== userId) {
			return new Response('An image expired, upload it again', { status: 410 });
		}
	}
	return null;
}

/**
 * Moves staged images in with the other uploads, in order, and returns their URL paths (as
 * saveUpload does), or the 410 when one is gone. Delete them with removeUploads if the post or
 * message they're for then fails.
 */
export async function claimStaged(userId: number, ids: string[]): Promise<string[] | Response> {
	const missing = checkStaged(userId, ids);
	if (missing) return missing;
	// taken off the map first, so two concurrent requests can't both claim one
	for (const id of ids) staged.delete(id);
	const urls: string[] = [];
	try {
		for (const id of ids) {
			const file = `${crypto.randomUUID()}.webp`;
			await fs.promises.rename(fileOf(id), path.join(UPLOAD_DIR, file));
			urls.push(`/uploads/${file}`);
		}
	} catch (e) {
		await removeUploads(urls);
		await Promise.all(ids.map(drop));
		throw e;
	}
	return urls;
}
