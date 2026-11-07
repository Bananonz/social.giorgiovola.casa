import type { RequestHandler } from './$types';
import { fail, offsetPage, offsetParams, v1 } from '#lib/server/api.js';
import { postQuotes } from '#lib/server/feeds.js';
import { parseId } from '#lib/server/validation.js';

/** The quote regiorgs of a post, latest first: who quoted it and what they wrote. */
export const GET: RequestHandler = v1(async ({ params, url }) => {
	const id = parseId(params.id) ?? fail(404, 'Post not found');
	const { limit, offset } = offsetParams(url, 50, 200);
	const rows = (await postQuotes(id, limit, offset)) ?? fail(404, 'Post not found');
	return offsetPage(rows, limit, offset);
});
