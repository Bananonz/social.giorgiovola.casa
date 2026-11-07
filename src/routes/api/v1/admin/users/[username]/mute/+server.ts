import type { RequestHandler } from './$types';
import { readJson, requireStaff, stringField, usernameParam, v1 } from '#lib/server/api.js';
import { mute, unmute } from '#lib/server/admin.js';

/** Staff: mutes the account behind a profile (`{ reason? }`): it can't post or send messages. */
export const PUT: RequestHandler = v1(async ({ locals, params, request }) => {
	requireStaff(locals);
	return mute(
		locals,
		usernameParam(params.username),
		stringField(await readJson(request), 'reason')
	);
});

/** Staff: lifts the mute. */
export const DELETE: RequestHandler = v1(({ locals, params }) => {
	requireStaff(locals);
	return unmute(locals, usernameParam(params.username));
});
