import type { RequestHandler } from './$types';
import { fail, requireUser, v1 } from '#lib/server/api.js';
import { deleteFromGroup } from '#lib/server/chat.js';
import { parseId } from '#lib/server/validation.js';

/** Deletes one of your own messages in the group, for everyone. */
export const DELETE: RequestHandler = v1(({ locals, params }) =>
	deleteFromGroup(
		requireUser(locals),
		parseId(params.id),
		parseId(params.messageId) ?? fail(404, 'Message not found')
	)
);
