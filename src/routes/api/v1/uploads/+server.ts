import type { RequestHandler } from './$types';
import { created, rateLimit, requireUnmuted, v1 } from '#lib/server/api.js';
import { stageImage } from '#lib/server/stagedUploads.js';
import { readImageBody } from '#lib/server/uploadInput.js';
import { LIMITS } from '#lib/server/validation.js';

// a post or message holds at most 5 images; this leaves room for swapping some out
const MAX_UPLOADS = 30;

/**
 * Uploads one image for a post or message being written: the raw bytes as the body (any image
 * Content-Type), or multipart with an `image` file for browsers. It is compressed now, so sending
 * only attaches it. Answers `{ id }`, to pass in `uploads`. Unused uploads expire after a day.
 */
export const POST: RequestHandler = v1(async ({ locals, request }) => {
	const user = requireUnmuted(locals);
	const image = await readImageBody(request, LIMITS.imageBytes, ['image']);
	rateLimit(`uploads:${user.id}`, MAX_UPLOADS, 60_000, 'You are uploading too fast');
	const id = await stageImage(user.id, new File([new Uint8Array(image)], 'upload'));
	if (id instanceof Response) return id;
	return created({ id });
});
