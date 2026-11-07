import crypto from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { and, eq, inArray, isNotNull, lt, ne, sql, type SQL } from 'drizzle-orm';
import { db, sessions } from './db/index.js';
import { closeSessionStreams } from './realtime.js';

/** Token of the session currently in use. */
export const SESSION_COOKIE = 'social.giorgiovola.casa-token';
/** Tokens of every account signed in on this browser, active one included, most recent first. */
export const ACCOUNTS_COOKIE = 'social.giorgiovola.casa-accounts';
export const SESSION_DAYS = 30;
/** How long a token from POST /api/v1/auth/login lasts. */
export const TOKEN_DAYS = 90;
/** How many different accounts can be signed in at once on one browser. */
export const MAX_SESSIONS = 5;
/** How many personal access tokens one account can have. */
export const MAX_PERSONAL_TOKENS = 20;

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' } as const;

export type SessionRef = { token: string; accountId: number };

/** Every well formed token the browser holds, active first. Not checked against the database. */
export function cookieTokens(cookies: Cookies): string[] {
	const active = cookies.get(SESSION_COOKIE);
	const list = (cookies.get(ACCOUNTS_COOKIE) ?? '').split('.');
	const tokens = [...(active ? [active] : []), ...list].filter((t) => TOKEN_RE.test(t));
	return [...new Set(tokens)].slice(0, MAX_SESSIONS + 1);
}

/** Writes the cookies; `tokens[0]` becomes the active session. Clears them when empty. */
export function setSessionCookies(cookies: Cookies, tokens: string[]) {
	if (tokens.length === 0) {
		cookies.delete(SESSION_COOKIE, cookieOptions);
		cookies.delete(ACCOUNTS_COOKIE, cookieOptions);
		return;
	}
	const opts = { ...cookieOptions, maxAge: 60 * 60 * 24 * SESSION_DAYS };
	cookies.set(SESSION_COOKIE, tokens[0], opts);
	cookies.set(ACCOUNTS_COOKIE, tokens.join('.'), opts);
}

/**
 * Deletes sessions and ends the event streams opened with them: a stream is only authenticated
 * when it opens, so it would otherwise outlive a revoked session or token. Every deletion of
 * sessions goes through here. Returns how many were deleted.
 */
export async function deleteSessions(where: SQL | undefined) {
	// `and()` is typed as possibly undefined; a missing filter must never wipe every session
	if (!where) throw new Error('deleteSessions needs a filter');
	const deleted = await db.delete(sessions).where(where).returning({ token: sessions.token });
	closeSessionStreams(deleted.map((d) => d.token));
	return deleted.length;
}

/** Signs an account out everywhere (ban, password reset by an admin). */
export const revokeAllSessions = (accountId: number) =>
	deleteSessions(eq(sessions.user_id, accountId));

// opportunistic cleanup so expired sessions don't pile up
const removeExpired = () =>
	deleteSessions(and(isNotNull(sessions.expires_at), lt(sessions.expires_at, sql`NOW()`)));

const shortAgent = (userAgent: string | null | undefined) => userAgent?.slice(0, 200) || null;

/** Signs `userId` in on top of the accounts already signed in, and makes it the active one. */
export async function createSession(
	cookies: Cookies,
	userId: number,
	signedIn: SessionRef[] = [],
	userAgent?: string | null
) {
	await removeExpired();
	const [created] = await db
		.insert(sessions)
		.values({
			user_id: userId,
			kind: 'cookie',
			user_agent: shortAgent(userAgent),
			expires_at: sql`NOW() + make_interval(days => ${SESSION_DAYS})`
		})
		.returning({ token: sessions.token });

	// signing in to an account that is already signed in replaces its old session,
	// and the oldest account is signed out once there are too many
	const others = signedIn.filter((s) => s.accountId !== userId);
	const dropped = [
		...signedIn.filter((s) => s.accountId === userId),
		...others.slice(MAX_SESSIONS - 1)
	].map((s) => s.token);
	if (dropped.length > 0) await deleteSessions(inArray(sessions.token, dropped));

	setSessionCookies(cookies, [
		created.token,
		...others.slice(0, MAX_SESSIONS - 1).map((s) => s.token)
	]);
}

/** Human API tokens look like bot tokens with another prefix. */
export const USER_TOKEN_PREFIX = 'sgu_';
export const USER_TOKEN_RE = /^sgu_[A-Za-z0-9_-]{43}$/;

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Creates an API token for an account: `token` from a login, or a `personal` access token.
 * Only its hash is stored; the token itself is returned once. `days` null never expires.
 */
export async function createToken(
	userId: number,
	{
		kind,
		name,
		userAgent,
		days
	}: {
		kind: 'token' | 'personal';
		name?: string | null;
		userAgent?: string | null;
		days: number | null;
	}
) {
	await removeExpired();
	const token = USER_TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
	const [row] = await db
		.insert(sessions)
		.values({
			token: hashToken(token),
			user_id: userId,
			kind,
			name: name || null,
			user_agent: shortAgent(userAgent),
			expires_at: days === null ? null : sql`NOW() + make_interval(days => ${days})`
		})
		.returning({ id: sessions.id, expires_at: sessions.expires_at });
	return { token, id: row.id, expires_at: row.expires_at };
}

/** Revokes one session or token of an account by its public id. False when there is none. */
export async function revokeSession(accountId: number, id: number) {
	return (await deleteSessions(and(eq(sessions.id, id), eq(sessions.user_id, accountId)))) > 0;
}

/** Revokes the session or token behind a request (its primary key). */
export const revokeSessionKey = (key: string) => deleteSessions(eq(sessions.token, key));

/** Every session and token of an account, newest first. Secrets are never part of it. */
export async function listSessions(accountId: number, currentKey: string | null) {
	const rows = await db
		.select({
			id: sessions.id,
			token: sessions.token,
			kind: sessions.kind,
			name: sessions.name,
			user_agent: sessions.user_agent,
			created_at: sessions.created_at,
			expires_at: sessions.expires_at,
			last_used_at: sessions.last_used_at
		})
		.from(sessions)
		.where(
			and(
				eq(sessions.user_id, accountId),
				sql`(${sessions.expires_at} IS NULL OR ${sessions.expires_at} > NOW())`
			)
		)
		.orderBy(sql`${sessions.created_at} DESC`);
	return rows.map(({ token, ...row }) => ({ ...row, current: token === currentKey }));
}

/** How many personal access tokens an account has. */
export const countPersonalTokens = (accountId: number) =>
	db.$count(sessions, and(eq(sessions.user_id, accountId), eq(sessions.kind, 'personal')));

/** Signs out every session of an account except `keepKey` (after a password change). */
export const revokeOtherSessions = (accountId: number, keepKey: string | null) =>
	deleteSessions(
		and(eq(sessions.user_id, accountId), keepKey ? ne(sessions.token, keepKey) : undefined)
	);

/** Signs out the active account; the next signed in account (if any) becomes active. */
export async function destroySession(cookies: Cookies, signedIn: SessionRef[]) {
	const token = cookies.get(SESSION_COOKIE);
	if (token) await deleteSessions(eq(sessions.token, token));
	setSessionCookies(
		cookies,
		signedIn.map((s) => s.token).filter((t) => t !== token)
	);
}

/** Signs out every account on this browser. */
export async function destroyAllSessions(cookies: Cookies) {
	const tokens = cookieTokens(cookies);
	if (tokens.length > 0) await deleteSessions(inArray(sessions.token, tokens));
	setSessionCookies(cookies, []);
}

/** Makes `token` the active browser session, acting as `actingId` (null = the account itself). */
export async function activateSession(
	cookies: Cookies,
	signedIn: SessionRef[],
	token: string,
	actingId: number | null
) {
	await db.update(sessions).set({ acting_id: actingId }).where(eq(sessions.token, token));
	setSessionCookies(cookies, [token, ...signedIn.map((s) => s.token).filter((t) => t !== token)]);
}

/** Changes which profile a token acts as. */
export const setActing = (key: string, actingId: number | null) =>
	db.update(sessions).set({ acting_id: actingId }).where(eq(sessions.token, key));
