import type { RequestHandler } from './$types';
import { created, readJson, stringField, v1 } from '#lib/server/api.js';
import { registerAccount, startSession } from '#lib/server/login.js';
import { getMe } from '#lib/server/me.js';

/**
 * Creates an account and signs it in: `{ signup_password, email, name, username, password,
 * session?, client_name? }`. Answers like POST /auth/login, with 201.
 */
export const POST: RequestHandler = v1(async (event) => {
	const body = await readJson(event.request);
	const accountId = await registerAccount(
		{
			signupPassword: stringField(body, 'signup_password'),
			email: stringField(body, 'email'),
			name: stringField(body, 'name'),
			username: stringField(body, 'username'),
			password: stringField(body, 'password')
		},
		event.getClientAddress
	);
	const session = await startSession(event, accountId, body.session, body.client_name);
	return created({ ...session, me: await getMe(accountId) });
});
