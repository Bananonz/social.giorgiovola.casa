import type { RequestHandler } from './$types';
import { requireUser, v1 } from '#lib/server/api.js';
import { readGroup } from '#lib/server/chat.js';
import { parseId } from '#lib/server/validation.js';

/** Marks the whole group read for you. */
export const POST: RequestHandler = v1(({ locals, params }) =>
	readGroup(requireUser(locals), parseId(params.id))
);
