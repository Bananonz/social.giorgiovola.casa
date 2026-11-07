import type { RequestHandler } from './$types';
import { fail, rateLimit, requireUnmuted, requireUser, v1 } from '#lib/server/api.js';
import { setRegiorged } from '#lib/server/posts.js';
import { parseId } from '#lib/server/validation.js';

const MAX_REGIORGS = 30;

const regiorg = (regiorged: boolean): RequestHandler =>
	v1(async ({ locals, params }) => {
		// a regiorg puts the post in followers' feeds, like posting does: muted profiles can only undo
		const user = regiorged ? requireUnmuted(locals) : requireUser(locals);
		const id = parseId(params.id) ?? fail(404, 'Post not found');
		rateLimit(`regiorg:${user.id}`, MAX_REGIORGS, 60_000, 'Regiorging too fast');
		return (await setRegiorged(user.id, id, regiorged)) ?? fail(404, 'Post not found');
	});

/** Regiorgs (reshares) the post. Idempotent. */
export const PUT = regiorg(true);
/** Undoes your regiorg. */
export const DELETE = regiorg(false);
