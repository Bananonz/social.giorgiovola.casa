import type { RequestHandler } from './$types';
import { created, readJson, requireAccount, v1 } from '#lib/server/api.js';
import { listPasskeys, registerPasskey } from '#lib/server/passkeyAuth.js';

/** The account's passkeys. */
export const GET: RequestHandler = v1(({ locals, url }) =>
	listPasskeys(requireAccount(locals).accountId, url)
);

/** Finishes registering a passkey: `{ challenge_id?, name?, response }`. */
export const POST: RequestHandler = v1(async ({ locals, cookies, url, request }) => {
	const { accountId } = requireAccount(locals);
	return created(await registerPasskey(accountId, cookies, url, await readJson(request)));
});
