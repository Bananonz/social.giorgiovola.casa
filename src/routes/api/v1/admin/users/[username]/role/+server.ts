import type { RequestHandler } from './$types';
import { readJson, requireAdmin, usernameParam, v1 } from '#lib/server/api.js';
import { setRole } from '#lib/server/admin.js';

/** Admins: `{ role: "mod" | "user" }`. Admins are made with `bun admin.ts`. */
export const PUT: RequestHandler = v1(async ({ locals, params, request }) => {
	requireAdmin(locals);
	return setRole(locals, usernameParam(params.username), (await readJson(request)).role);
});
