import type { RequestHandler } from './$types';
import { v1 } from '#lib/server/api.js';
import { hashtagPosts } from '#lib/server/search.js';
import { tagParam } from '#lib/server/hashtagParam.js';

/** A hashtag (normalized: lowercase, no "#") and how many posts have it. */
export const GET: RequestHandler = v1(async ({ params }) => {
	const tag = tagParam(params.tag);
	return { tag, posts: await hashtagPosts(tag) };
});
