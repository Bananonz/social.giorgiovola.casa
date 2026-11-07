import type { RequestHandler } from './$types';
import { fail, rateLimit, requireUser, v1 } from '#lib/server/api.js';
import { setLiked } from '#lib/server/posts.js';
import { parseId } from '#lib/server/validation.js';

const MAX_LIKES = 60;

// idempotent: liking twice keeps one like. Answers the absolute count, since the realtime
// `counts` event may reach the client before the response does
const like = (liked: boolean): RequestHandler =>
	v1(async ({ locals, params }) => {
		const user = requireUser(locals);
		const id = parseId(params.id) ?? fail(404, 'Post not found');
		rateLimit(`likes:${user.id}`, MAX_LIKES, 60_000, 'Liking too fast');
		return (await setLiked(user.id, id, liked)) ?? fail(404, 'Post not found');
	});

/** Likes the post. */
export const PUT = like(true);
/** Removes your like. */
export const DELETE = like(false);
