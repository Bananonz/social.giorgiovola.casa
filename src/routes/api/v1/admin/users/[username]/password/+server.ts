import type { RequestHandler } from './$types';
import { readJson, requireAdmin, stringField, usernameParam, v1 } from '#lib/server/api.js';
import { resetPassword } from '#lib/server/admin.js';

/** Admins: sets a new password (`{ password }`) and signs the account out everywhere. */
export const PUT: RequestHandler = v1(async ({ locals, params, request }) => {
	requireAdmin(locals);
	return resetPassword(
		locals,
		usernameParam(params.username),
		stringField(await readJson(request), 'password')
	);
});
