import type { RequestHandler } from './$types';
import { offsetPage, offsetParams, v1 } from '#lib/server/api.js';
import { hashtagPosts } from '#lib/server/feeds.js';
import { tagParam } from '#lib/server/hashtagParam.js';

/** Posts and replies with a hashtag, newest first. */
export const GET: RequestHandler = v1(async ({ locals, params, url }) => {
	const tag = tagParam(params.tag);
	const { limit, offset } = offsetParams(url);
	return offsetPage(await hashtagPosts(tag, locals.user, limit, offset), limit, offset);
});
