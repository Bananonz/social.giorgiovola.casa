import type { RequestHandler } from './$types';
import { created, readJson, requireAccount, stringField, v1 } from '#lib/server/api.js';
import { createIdentity, listIdentities } from '#lib/server/identities.js';

/** The identities the account owns (with who they are shared with) and the ones shared with it. */
export const GET: RequestHandler = v1(({ locals }) =>
	listIdentities(requireAccount(locals).accountId)
);

/** Creates an identity: `{ name, username }`. Switch to it with POST /auth/switch. */
export const POST: RequestHandler = v1(async ({ locals, request }) => {
	const { accountId } = requireAccount(locals);
	const body = await readJson(request);
	return created(
		await createIdentity(accountId, stringField(body, 'name'), stringField(body, 'username'))
	);
});
