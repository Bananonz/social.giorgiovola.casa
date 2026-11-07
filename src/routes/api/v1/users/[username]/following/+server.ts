import type { RequestHandler } from './$types';
import { fail, offsetPage, offsetParams, usernameParam, v1 } from '#lib/server/api.js';
import { followList } from '#lib/server/follows.js';

/** The profiles a profile follows, most recent first. Each entry says whether you follow it and it follows you. */
export const GET: RequestHandler = v1(async ({ locals, params, url }) => {
	const { limit, offset } = offsetParams(url);
	const rows =
		(await followList(
			usernameParam(params.username),
			'following',
			locals.user?.id,
			limit,
			offset
		)) ?? fail(404, 'User not found');
	return offsetPage(rows, limit, offset);
});
