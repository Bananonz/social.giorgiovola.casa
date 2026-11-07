import type { RequestHandler } from './$types';
import { created, readJson, requireUnmuted, v1 } from '#lib/server/api.js';
import { listConversations, newGroup } from '#lib/server/chat.js';
import { requireUser } from '#lib/server/api.js';

/** The groups you are in, latest activity first (also part of GET /conversations). */
export const GET: RequestHandler = v1(async ({ locals }) => ({
	items: (await listConversations(requireUser(locals).id)).groups,
	next_cursor: null
}));

/** Creates a group chat: `{ name, members: [username, …] }`. You become its owner. */
export const POST: RequestHandler = v1(async ({ locals, request }) =>
	created(await newGroup(requireUnmuted(locals), await readJson(request)))
);
