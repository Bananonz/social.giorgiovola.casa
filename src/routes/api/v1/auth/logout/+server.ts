import type { RequestHandler } from './$types';
import { boolField, fail, readJson, requireUser, v1 } from '#lib/server/api.js';
import { destroyAllSessions, destroySession, revokeSessionKey } from '#lib/server/session.js';

/**
 * Signs out. A token is revoked. In the browser the active account is signed out (the next one
 * signed in becomes active), or every account with `{ all: true }`.
 */
export const POST: RequestHandler = v1(async ({ locals, request, cookies }) => {
	const body = await readJson(request);
	if (locals.auth === 'cookie') {
		if (boolField(body, 'all')) await destroyAllSessions(cookies);
		else await destroySession(cookies, locals.sessions);
		return;
	}
	requireUser(locals);
	if (locals.auth === 'bot') fail(400, "Bot tokens can't sign out, regenerate the token instead");
	if (locals.sessionKey) await revokeSessionKey(locals.sessionKey);
});
