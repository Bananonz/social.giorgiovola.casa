import type { RequestHandler } from './$types';
import { fail, offsetPage, offsetParams, requireStaff, v1 } from '#lib/server/api.js';
import { ADMIN_FILTERS, listAccounts, type AdminFilter } from '#lib/server/admin.js';

/**
 * Staff only: accounts, newest first, with their identities and what you may do to each.
 * `?q=` searches usernames and names (identities find their account), `?filter=` is all, banned,
 * muted or staff.
 */
export const GET: RequestHandler = v1(async ({ locals, url }) => {
	requireStaff(locals);
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 64);
	const filter = url.searchParams.get('filter') ?? 'all';
	if (!ADMIN_FILTERS.includes(filter as AdminFilter))
		fail(400, `filter must be one of ${ADMIN_FILTERS.join(', ')}`);
	const { limit, offset } = offsetParams(url, 25, 100);
	const rows = await listAccounts(locals, { q, filter: filter as AdminFilter, limit, offset });
	return offsetPage(rows, limit, offset);
});
