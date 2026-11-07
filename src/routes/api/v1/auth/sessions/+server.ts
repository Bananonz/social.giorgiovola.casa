import type { RequestHandler } from './$types';
import { requireAccount, v1 } from '#lib/server/api.js';
import { listSessions } from '#lib/server/session.js';

/** Every browser session, login token and personal access token of the account. */
export const GET: RequestHandler = v1(async ({ locals }) => {
	const { accountId } = requireAccount(locals);
	return { items: await listSessions(accountId, locals.sessionKey) };
});
