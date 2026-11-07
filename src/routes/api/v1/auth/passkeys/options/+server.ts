import type { RequestHandler } from './$types';
import { v1 } from '#lib/server/api.js';
import { loginOptions } from '#lib/server/passkeyAuth.js';

/** Starts a passkey sign-in: WebAuthn request options plus a `challenge_id` to send back. */
export const POST: RequestHandler = v1(({ cookies, url, getClientAddress }) =>
	loginOptions(cookies, url, getClientAddress)
);
