import type { RequestHandler } from './$types';
import { created, readJson, requireAccount, stringField, v1 } from '#lib/server/api.js';
import { MAX_BOTS, createBot, listBots } from '#lib/server/bots.js';

/** The bots the account owns. */
export const GET: RequestHandler = v1(async ({ locals }) => ({
	items: await listBots(requireAccount(locals).accountId),
	max: MAX_BOTS
}));

/** Creates a bot: `{ name, username }`. Its token is only in this response. */
export const POST: RequestHandler = v1(async ({ locals, request }) => {
	const { accountId } = requireAccount(locals);
	const body = await readJson(request);
	return created(
		await createBot(accountId, stringField(body, 'name'), stringField(body, 'username'))
	);
});
