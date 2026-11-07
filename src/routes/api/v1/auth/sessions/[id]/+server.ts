import type { RequestHandler } from './$types';
import { fail, requireAccount, v1 } from '#lib/server/api.js';
import { revokeSession } from '#lib/server/session.js';
import { parseId } from '#lib/server/validation.js';

/** Revokes a session or token of the account: it is signed out right away. */
export const DELETE: RequestHandler = v1(async ({ locals, params }) => {
	const { accountId } = requireAccount(locals);
	const id = parseId(params.id);
	if (id === null || !(await revokeSession(accountId, id))) fail(404, 'Session not found');
});
