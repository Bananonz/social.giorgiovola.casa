import type { RequestHandler } from './$types';
import { readJson, stringField, v1 } from '#lib/server/api.js';
import { passwordLogin, startSession } from '#lib/server/login.js';
import { getMe } from '#lib/server/me.js';

/**
 * Signs in with a username (or email) and password: `{ username, password, session?, client_name? }`.
 * Answers a bearer token, or sets the session cookie with `session: "cookie"` (the web UI).
 */
export const POST: RequestHandler = v1(async (event) => {
	const body = await readJson(event.request);
	const accountId = await passwordLogin(
		stringField(body, 'username'),
		stringField(body, 'password'),
		event.getClientAddress
	);
	const session = await startSession(event, accountId, body.session, body.client_name);
	return { ...session, me: await getMe(accountId) };
});
