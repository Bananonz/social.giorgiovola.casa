import type { RequestHandler } from './$types';
import { fail, requireUser, v1 } from '#lib/server/api.js';
import { deleteDirect } from '#lib/server/chat.js';
import { parseId } from '#lib/server/validation.js';

/** Deletes one of your own messages, for both sides. */
export const DELETE: RequestHandler = v1(({ locals, params }) =>
	deleteDirect(requireUser(locals), parseId(params.id) ?? fail(404, 'Message not found'))
);
