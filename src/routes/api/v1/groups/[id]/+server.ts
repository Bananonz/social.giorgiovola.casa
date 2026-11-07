import type { RequestHandler } from './$types';
import { readJson, requireUnmuted, requireUser, v1 } from '#lib/server/api.js';
import { getGroupInfo, renameGroupAs } from '#lib/server/chat.js';
import { parseId } from '#lib/server/validation.js';

/** The group's name, owner, members, and whether you muted it. */
export const GET: RequestHandler = v1(({ locals, params }) =>
	getGroupInfo(requireUser(locals), parseId(params.id))
);

/** Renames the group: `{ name }`. Any member can. */
export const PATCH: RequestHandler = v1(async ({ locals, params, request }) =>
	renameGroupAs(requireUnmuted(locals), parseId(params.id), (await readJson(request)).name)
);
