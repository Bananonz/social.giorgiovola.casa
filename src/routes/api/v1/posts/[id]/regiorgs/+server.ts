import type { RequestHandler } from './$types';
import { fail, offsetPage, offsetParams, v1 } from '#lib/server/api.js';
import { postRegiorgs } from '#lib/server/feeds.js';
import { parseId } from '#lib/server/validation.js';

/** Who regiorged a post, latest first. */
export const GET: RequestHandler = v1(async ({ params, url }) => {
	const id = parseId(params.id) ?? fail(404, 'Post not found');
	const { limit, offset } = offsetParams(url, 50, 200);
	const rows = (await postRegiorgs(id, limit, offset)) ?? fail(404, 'Post not found');
	return offsetPage(rows, limit, offset);
});
