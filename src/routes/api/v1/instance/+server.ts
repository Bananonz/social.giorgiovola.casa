import type { RequestHandler } from './$types';
import { v1 } from '#lib/server/api.js';
import { MAX_BOTS, MAX_PROFILE_UPDATES } from '#lib/server/bots.js';
import { registrationOpen } from '#lib/server/login.js';
import { getMotd } from '#lib/server/motd.js';
import { LIMITS } from '#lib/server/validation.js';
import { version } from '$app/env';

/** Public facts about this instance: the message of the day, whether signing up is open, limits. */
export const GET: RequestHandler = v1(async () => ({
	api_version: 1,
	version,
	motd: await getMotd(),
	registration_open: registrationOpen(),
	limits: { ...LIMITS, maxBots: MAX_BOTS, maxProfileUpdates: MAX_PROFILE_UPDATES }
}));
