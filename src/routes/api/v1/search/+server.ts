import type { RequestHandler } from './$types';
import { limitParam, requireUser, v1 } from '#lib/server/api.js';
import { search } from '#lib/server/search.js';

/**
 * Searches profiles and hashtags: `?q=` ("#…" only hashtags, "@…" only users; empty lists the
 * trending hashtags) and `?limit=` (per kind, default 5, at most 20). Signed in only, so the user
 * list can't be scraped anonymously.
 */
export const GET: RequestHandler = v1(async ({ locals, url }) => {
	requireUser(locals);
	return search(url.searchParams.get('q') ?? '', limitParam(url, 5, 20));
});
