import type { RequestHandler } from './$types';
import { fail, offsetPage, offsetParams, v1 } from '#lib/server/api.js';
import { getPost, postReplies } from '#lib/server/feeds.js';
import { parseId } from '#lib/server/validation.js';

/** Replies to a post: the ones that ratio it first, then oldest first. */
export const GET: RequestHandler = v1(async ({ locals, params, url }) => {
	const id = parseId(params.id) ?? fail(404, 'Post not found');
	const { limit, offset } = offsetParams(url, 50, 200);
	if (offset === 0 && !(await getPost(id, null))) fail(404, 'Post not found');
	return offsetPage(await postReplies(id, locals.user, limit, offset), limit, offset);
});
