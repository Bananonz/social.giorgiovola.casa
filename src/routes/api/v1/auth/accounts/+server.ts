import type { RequestHandler } from './$types';
import { requireAccount, v1 } from '#lib/server/api.js';
import { getSwitcher } from '#lib/server/accounts.js';

/**
 * The accounts signed in (every account of this browser for the web UI, the token's account
 * otherwise), each with the identities it can act as and their unread counts.
 */
export const GET: RequestHandler = v1(async ({ locals }) => {
	requireAccount(locals);
	return { items: await getSwitcher(locals) };
});
