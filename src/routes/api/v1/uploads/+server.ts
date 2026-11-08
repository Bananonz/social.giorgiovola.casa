import type { RequestHandler } from './$types';
import { created, rateLimit, refuseBots, requireUnmuted, v1 } from '#lib/server/api.js';
import { stageUpload } from '#lib/server/stagedUploads.js';
import { readUploadBody } from '#lib/server/uploadInput.js';
import { LIMITS } from '#lib/server/validation.js';

// a post or message holds at most 5 media files; this leaves room for swapping some out
const MAX_UPLOADS = 30;

/**
 * Uploads one file (image, video or audio) for a post or message being written: the raw bytes
 * as the body, or multipart with a `file` or `image` field for browsers. Images are compressed
 * now; video and audio are forwarded to S3. Answers `{ id }`, to pass in `uploads`. Unused
 * uploads expire after a day.
 */
export const POST: RequestHandler = v1(async ({ locals, request }) => {
	refuseBots(locals, "Bots can't attach files");
	const user = requireUnmuted(locals);
	// count before reading the body, so a client over the limit doesn't get its bytes buffered
	rateLimit(`uploads:${user.id}`, MAX_UPLOADS, 60_000, 'You are uploading too fast');
	const body = await readUploadBody(request, LIMITS.mediaBytes, ['file', 'image']);
	const id = await stageUpload(user.id, new File([new Uint8Array(body)], 'upload'));
	if (id instanceof Response) return id;
	return created({ id });
});
