import type { RequestHandler } from './$types';
import { hit, isLimited } from '#lib/server/ratelimit.js';
import { mutedMessage } from '#lib/server/moderation.js';
import { stageImage } from '#lib/server/stagedUploads.js';

// a post or message holds at most 5 images; this leaves room for swapping some out
const WINDOW_MS = 60_000;
const MAX_UPLOADS = 30;

/**
 * Uploads one image (multipart field `image`) for a post or message that's still being written:
 * it's compressed now, so sending only has to attach it. Responds `{ id }`, to pass as `uploads`.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	if (locals.muted) return new Response(mutedMessage(locals), { status: 403 });

	const key = `uploads:${locals.user.id}`;
	if (isLimited(key, MAX_UPLOADS)) {
		return new Response('You are uploading too fast, try again in a minute', { status: 429 });
	}
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return new Response('Upload too big or invalid', { status: 400 });
	}
	const file = form.get('image');
	if (!(file instanceof File) || file.size === 0) {
		return new Response('Missing image', { status: 400 });
	}
	hit(key, WINDOW_MS);
	const id = await stageImage(locals.user.id, file);
	if (id instanceof Response) return id;
	return Response.json({ id });
};
