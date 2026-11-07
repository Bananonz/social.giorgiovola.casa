import type { Cookies } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, users } from './db/index.js';
import { fail } from './api.js';
import { findSessionFor } from './accounts.js';
import { unreadCounts } from './notifications.js';
import { activateSession, setActing } from './session.js';

/**
 * The signed in profile as GET /api/v1/me shows it: the profile in use (`user`), the account
 * behind it (null for bots), moderation state and unread counts. `profileId` defaults to the
 * account itself.
 */
export async function getMe(accountId: number | null, profileId: number = accountId!) {
	const account = alias(users, 'account');
	const [row] = await db
		.select({
			user: {
				id: users.id,
				username: users.username,
				name: users.name,
				avatar: users.avatar,
				bio: users.bio,
				website: users.website,
				email: users.email,
				bot: users.bot,
				owner_id: users.owner_id,
				created_at: users.created_at
			},
			account: {
				id: account.id,
				username: account.username,
				role: account.role,
				muted_at: account.muted_at,
				mute_reason: account.mute_reason
			}
		})
		.from(users)
		.leftJoin(account, eq(account.id, accountId ?? -1))
		.where(eq(users.id, profileId));
	if (!row) fail(401, 'Sign in first');
	const { owner_id, ...user } = row.user;
	const acct = accountId === null ? null : row.account;
	return {
		user: { ...user, identity: owner_id !== null && !user.bot },
		account: acct ? { id: acct.id, username: acct.username } : null,
		role: acct?.role ?? 'user',
		muted: !!acct?.muted_at,
		mute_reason: acct?.mute_reason ?? null,
		unread: await unreadCounts(profileId)
	};
}

/** GET /api/v1/me: like getMe, with the moderation state the request was authenticated with. */
export async function meOf(locals: App.Locals) {
	if (!locals.user) fail(401, 'Sign in first: send a bearer token or a session cookie');
	const me = await getMe(locals.accountId, locals.user.id);
	// a shared identity is muted when its owner is, bots follow their owner (see auth.ts)
	return { ...me, muted: locals.muted, mute_reason: locals.muteReason, auth: locals.auth };
}

/**
 * Switches the profile in use to `username`: the account, one of its identities or one shared
 * with it. For the web UI also any other account signed in on the browser.
 */
export async function switchProfile(locals: App.Locals, cookies: Cookies, username: string) {
	const [target] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.username, username));
	if (!target) fail(404, 'User not found');
	if (locals.auth === 'cookie') {
		const found = await findSessionFor(locals, target.id);
		if (!found) fail(403, "You can't switch to that profile.");
		await activateSession(cookies, locals.sessions, found.session.token, found.actingId);
		return meOfSession(found.session.accountId, found.actingId);
	}
	// a token belongs to one account: it can only move between that account's profiles
	if (!locals.sessionKey || locals.accountId === null) fail(403, "Bots can't switch profiles");
	const own = { ...locals, sessions: [{ token: locals.sessionKey, accountId: locals.accountId }] };
	const found = await findSessionFor(own, target.id);
	if (!found) fail(403, "You can't switch to that profile.");
	await setActing(locals.sessionKey, found.actingId);
	return meOfSession(locals.accountId, found.actingId);
}

const meOfSession = (accountId: number, actingId: number | null) =>
	getMe(accountId, actingId ?? accountId);
