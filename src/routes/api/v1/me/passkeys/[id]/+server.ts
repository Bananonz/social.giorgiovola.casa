import type { RequestHandler } from './$types';
import { readJson, requireAccount, v1 } from '#lib/server/api.js';
import { deletePasskey, renamePasskey } from '#lib/server/passkeyAuth.js';

/** Renames a passkey: `{ name }`. */
export const PATCH: RequestHandler = v1(async ({ locals, params, request }) => {
	const { accountId } = requireAccount(locals);
	return renamePasskey(accountId, params.id, (await readJson(request)).name);
});

/** Deletes a passkey. The password always stays. */
export const DELETE: RequestHandler = v1(({ locals, params }) =>
	deletePasskey(requireAccount(locals).accountId, params.id)
);
