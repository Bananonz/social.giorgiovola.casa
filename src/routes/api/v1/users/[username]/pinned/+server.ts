import type { RequestHandler } from './$types';
import { fail, usernameParam, v1 } from '#lib/server/api.js';
import { pinnedPost } from '#lib/server/feeds.js';

/** The post pinned to a profile: `{ post }`, null when it has none. */
export const GET: RequestHandler = v1(async ({ locals, params }) => {
	const post = await pinnedPost(usernameParam(params.username), locals.user);
	if (post === undefined) fail(404, 'User not found');
	return { post };
});
