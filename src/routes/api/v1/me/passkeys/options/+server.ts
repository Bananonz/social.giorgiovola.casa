import type { RequestHandler } from './$types';
import { requireAccount, v1 } from '#lib/server/api.js';
import { registrationOptions } from '#lib/server/passkeyAuth.js';

/** Starts registering a passkey: WebAuthn creation options plus a `challenge_id`. */
export const POST: RequestHandler = v1(({ locals, cookies, url }) =>
	registrationOptions(requireAccount(locals).accountId, cookies, url)
);
