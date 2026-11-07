import type { RequestHandler } from './$types';
import { requireUser, v1 } from '#lib/server/api.js';
import { typingInGroup } from '#lib/server/chat.js';
import { parseId } from '#lib/server/validation.js';

/** Shows a typing indicator to the group's members. */
export const POST: RequestHandler = v1(({ locals, params }) =>
	typingInGroup(locals, requireUser(locals), parseId(params.id))
);
