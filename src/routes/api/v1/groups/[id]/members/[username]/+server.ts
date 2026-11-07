import type { RequestHandler } from './$types';
import { fail, requireUser, usernameParam, v1 } from '#lib/server/api.js';
import { removeFromGroup } from '#lib/server/chat.js';
import { parseId } from '#lib/server/validation.js';

/** Removes someone from the group (owner only), or leaves it with your own username. */
export const DELETE: RequestHandler = v1(({ locals, params }) => {
	const user = requireUser(locals);
	const username = usernameParam(params.username);
	// bots can leave, not remove others
	if (locals.auth === 'bot' && username !== user.username) fail(403, "Bots can't remove people");
	return removeFromGroup(user, parseId(params.id), username);
});
