import type { RequestHandler } from './$types';
import { readJson, v1 } from '#lib/server/api.js';
import { startSession } from '#lib/server/login.js';
import { getMe } from '#lib/server/me.js';
import { passkeyLogin } from '#lib/server/passkeyAuth.js';

/**
 * Finishes a passkey sign-in: `{ challenge_id?, response, session?, client_name? }`, where
 * `response` is the WebAuthn assertion. Answers like POST /auth/login.
 */
export const POST: RequestHandler = v1(async (event) => {
	const body = await readJson(event.request);
	const accountId = await passkeyLogin(event.cookies, event.url, event.getClientAddress, body);
	const session = await startSession(event, accountId, body.session, body.client_name);
	return { ...session, me: await getMe(accountId) };
});
