import type { RequestHandler } from './$types';
import { readJson, requireUser, v1 } from '#lib/server/api.js';
import { addToGroup } from '#lib/server/chat.js';
import { parseId } from '#lib/server/validation.js';

/** Adds people: `{ usernames: [username, …] }`. Any member can. Answers the group. */
export const POST: RequestHandler = v1(async ({ locals, params, request }) =>
	addToGroup(requireUser(locals), parseId(params.id), (await readJson(request)).usernames)
);
