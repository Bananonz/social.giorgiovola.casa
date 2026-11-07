import type { RequestHandler } from './$types';
import { readJson, requireAccount, stringField, v1 } from '#lib/server/api.js';
import { changePassword } from '#lib/server/login.js';

/**
 * Changes the account's password: `{ current_password, password }`. Every other session and
 * token of the account is signed out; the one making the request stays.
 */
export const PUT: RequestHandler = v1(async ({ locals, request }) => {
	const { accountId } = requireAccount(locals);
	const body = await readJson(request);
	await changePassword(
		accountId,
		stringField(body, 'current_password'),
		stringField(body, 'password'),
		locals.sessionKey
	);
});
