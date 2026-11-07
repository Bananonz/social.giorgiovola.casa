import type { RequestHandler } from './$types';
import { requireAccount, usernameParam, v1 } from '#lib/server/api.js';
import { regenerateBotToken } from '#lib/server/bots.js';

/** Replaces a bot's token; the old one stops working right away. The new one is only shown here. */
export const POST: RequestHandler = v1(({ locals, params }) =>
	regenerateBotToken(requireAccount(locals).accountId, usernameParam(params.username))
);
