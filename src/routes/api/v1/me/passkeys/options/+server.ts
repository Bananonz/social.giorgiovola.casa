import type { RequestHandler } from './$types';
import { readJson, requireAccount, stringField, v1 } from '#lib/server/api.js';
import { checkCurrentPassword } from '#lib/server/login.js';
import { registrationOptions } from '#lib/server/passkeyAuth.js';

/**
 * Starts registering a passkey: `{ current_password }` → WebAuthn creation options plus a
 * `challenge_id`. A passkey is lasting access, so like a personal access token it needs the
 * password again: a stolen session or token alone can't add one.
 */
export const POST: RequestHandler = v1(async ({ locals, cookies, url, request }) => {
	const { accountId } = requireAccount(locals);
	await checkCurrentPassword(accountId, stringField(await readJson(request), 'current_password'));
	return registrationOptions(accountId, cookies, url);
});
