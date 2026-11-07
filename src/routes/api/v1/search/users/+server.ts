import type { RequestHandler } from './$types';
import { limitParam, requireUser, v1 } from '#lib/server/api.js';
import { suggestUsers } from '#lib/server/search.js';

/**
 * Profiles whose username or name starts with `?q=` (letters, digits and _), for @mention and
 * people pickers; the newest profiles when `q` is empty. `?limit=` default 6, at most 20.
 */
export const GET: RequestHandler = v1(async ({ locals, url }) => {
	requireUser(locals);
	return {
		items: await suggestUsers(url.searchParams.get('q') ?? '', limitParam(url, 6, 20)),
		next_cursor: null
	};
});
