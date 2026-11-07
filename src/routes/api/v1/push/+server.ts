import type { RequestHandler } from './$types';
import { fail, readJson, requireUser, stringField, v1 } from '#lib/server/api.js';
import { getVapid, subscribePush, unsubscribePush } from '#lib/server/push.js';

/** Web push needs a session or token to hang the subscription off (bots get no push). */
function sessionKey(locals: App.Locals) {
	requireUser(locals);
	if (!locals.sessionKey) fail(403, "Bots can't subscribe to push notifications");
	return locals.sessionKey;
}

/** The public VAPID key to subscribe with. */
export const GET: RequestHandler = v1(async ({ locals }) => {
	sessionKey(locals);
	return { publicKey: (await getVapid()).publicKey };
});

/**
 * Stores (or refreshes) a push subscription for the session or token in use:
 * `{ endpoint, keys: { p256dh, auth } }` (PushSubscription.toJSON()). Signing out stops it.
 */
export const POST: RequestHandler = v1(async ({ locals, request }) => {
	const key = sessionKey(locals);
	if (!(await subscribePush(key, await readJson(request)))) fail(400, 'Invalid push subscription');
});

/** Removes a subscription: `{ endpoint }`. */
export const DELETE: RequestHandler = v1(async ({ locals, request }) => {
	const key = sessionKey(locals);
	const endpoint = stringField(await readJson(request), 'endpoint');
	if (!endpoint) fail(400, 'Missing endpoint');
	await unsubscribePush(key, endpoint);
});
