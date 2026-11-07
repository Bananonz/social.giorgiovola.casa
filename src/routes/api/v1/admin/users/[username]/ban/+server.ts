import type { RequestHandler } from './$types';
import { readJson, requireStaff, stringField, usernameParam, v1 } from '#lib/server/api.js';
import { ban, unban } from '#lib/server/admin.js';

/** Staff: bans the account behind a profile (`{ reason? }`) and signs it out everywhere. */
export const PUT: RequestHandler = v1(async ({ locals, params, request }) => {
	requireStaff(locals);
	return ban(
		locals,
		usernameParam(params.username),
		stringField(await readJson(request), 'reason')
	);
});

/** Staff: lifts the ban. */
export const DELETE: RequestHandler = v1(({ locals, params }) => {
	requireStaff(locals);
	return unban(locals, usernameParam(params.username));
});
