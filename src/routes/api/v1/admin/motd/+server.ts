import type { RequestHandler } from './$types';
import { readJson, requireAdmin, stringField, v1 } from '#lib/server/api.js';
import { updateMotd } from '#lib/server/admin.js';
import { DEFAULT_MOTD, MAX_MOTD, getMotd } from '#lib/server/motd.js';

/** Admins only: the message of the day (`custom` is false while the default is shown). */
export const GET: RequestHandler = v1(async ({ locals }) => {
	requireAdmin(locals);
	const motd = await getMotd();
	return { motd, custom: motd !== DEFAULT_MOTD, default: DEFAULT_MOTD, max: MAX_MOTD };
});

/** Admins only: sets the message of the day: `{ motd }`; empty goes back to the default. */
export const PUT: RequestHandler = v1(async ({ locals, request }) =>
	updateMotd(locals, stringField(await readJson(request), 'motd'))
);
