import type { RequestHandler } from './$types';
import { requireUser, usernameParam, v1 } from '#lib/server/api.js';
import { removeFromGroup } from '#lib/server/chat.js';
import { parseId } from '#lib/server/validation.js';

/** Removes someone from the group (owner only), or leaves it with your own username. */
export const DELETE: RequestHandler = v1(({ locals, params }) =>
	removeFromGroup(requireUser(locals), parseId(params.id), usernameParam(params.username))
);
