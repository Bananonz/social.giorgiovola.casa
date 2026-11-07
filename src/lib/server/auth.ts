import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestEvent } from '@sveltejs/kit';
import { and, eq, exists, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { PUBLIC_URL } from '$app/env/public';
import { db, identity_members, sessions, users } from './db/index.js';
import { authenticateBot } from './bots.js';
import { apiError } from './api.js';
import { USER_TOKEN_RE, cookieTokens, hashToken, setSessionCookies } from './session.js';

/**
 * The one way a request is authenticated, whatever the client: the web UI (session cookie), a
 * third-party client (`Authorization: Bearer sgu_…`, a human token) or a bot (`Bearer sgc_…`).
 * Every route reads the result from `locals`, which has the same shape for all of them.
 */

const publicOrigin = PUBLIC_URL ? new URL(PUBLIC_URL).origin : null;

function anonymous(locals: App.Locals) {
	locals.user = null;
	locals.accountId = null;
	locals.sessions = [];
	locals.role = 'user';
	locals.muted = false;
	locals.muteReason = null;
	locals.auth = 'anonymous';
	locals.sessionKey = null;
}

/**
 * During SSR, page loads call /api/v1 through `event.fetch`, which runs each endpoint in-process
 * with the page's cookies. Those subrequests reuse the page request's resolved session instead
 * of looking it up (and touching last_used_at) again: `cookieKeys` remembers which cookies a
 * request was authenticated from, and `shareAuth` makes it visible to the requests it spawns.
 */
const cookieKeys = new WeakMap<App.Locals, string>();
const parentAuth = new AsyncLocalStorage<{ key: string; locals: App.Locals }>();

/** Runs `fn` (the rest of the request) so its in-process subrequests can reuse its session. */
export function shareAuth<T>(locals: App.Locals, fn: () => T): T {
	const key = cookieKeys.get(locals);
	return key === undefined ? fn() : parentAuth.run({ key, locals }, fn);
}

/** Writes at most one last_used_at every few minutes per session. */
const TOUCH_MS = 5 * 60_000;

/**
 * Looks up session rows by key (`sessions.token`) with the account, the identity in use and the
 * moderation state that applies, in the order of `keys`. Expired, banned and wrong-kind rows are
 * left out.
 */
async function loadSessions(keys: string[], kind: 'cookie' | 'api') {
	// role, ban and mute belong to the account, whichever of its profiles is in use
	const account = alias(users, 'account');
	// the identity the session is acting as, if the account owns it or it is shared with it
	const profile = alias(users, 'profile');
	const owner = alias(users, 'owner');
	const rows = await db
		.select({
			token: sessions.token,
			last_used_at: sessions.last_used_at,
			account: {
				id: account.id,
				email: account.email,
				name: account.name,
				username: account.username,
				avatar: account.avatar,
				created_at: account.created_at,
				role: account.role,
				muted_at: account.muted_at,
				mute_reason: account.mute_reason
			},
			profile: {
				id: profile.id,
				email: profile.email,
				name: profile.name,
				username: profile.username,
				avatar: profile.avatar,
				created_at: profile.created_at,
				owner_id: profile.owner_id
			},
			owner_banned_at: owner.banned_at,
			owner_muted_at: owner.muted_at,
			owner_mute_reason: owner.mute_reason
		})
		.from(sessions)
		.innerJoin(account, eq(account.id, sessions.user_id))
		.leftJoin(
			profile,
			and(
				eq(profile.id, sessions.acting_id),
				or(
					eq(profile.owner_id, sessions.user_id),
					exists(
						db
							.select({ one: sql`1` })
							.from(identity_members)
							.where(
								and(
									eq(identity_members.identity_id, profile.id),
									eq(identity_members.account_id, sessions.user_id)
								)
							)
					)
				)
			)
		)
		.leftJoin(owner, eq(owner.id, profile.owner_id))
		.where(
			and(
				inArray(sessions.token, keys),
				kind === 'cookie' ? eq(sessions.kind, 'cookie') : ne(sessions.kind, 'cookie'),
				// banned accounts are signed out when banned, this covers any session left behind
				isNull(account.banned_at),
				sql`(${sessions.expires_at} IS NULL OR ${sessions.expires_at} > NOW())`
			)
		);
	return keys
		.map((key) => rows.find((r) => r.token === key))
		.filter((r): r is (typeof rows)[number] => !!r);
}

type SessionRow = Awaited<ReturnType<typeof loadSessions>>[number];

/** Fills locals from the active session row. */
function fromSession(locals: App.Locals, row: SessionRow) {
	const { account: a, profile: p, ...o } = row;
	// an identity that is no longer shared with the account, or whose owner was banned,
	// falls back to the account itself
	const acting = p && !o.owner_banned_at ? p : null;
	// a shared identity is muted when its owner is, so sharing it can't dodge a mute
	const mute = a.muted_at
		? a.mute_reason
		: acting && o.owner_muted_at
		? o.owner_mute_reason
		: undefined;
	locals.accountId = a.id;
	locals.role = a.role;
	locals.muted = mute !== undefined;
	locals.muteReason = mute ?? null;
	locals.sessionKey = row.token;
	locals.user = acting ?? {
		id: a.id,
		email: a.email,
		name: a.name,
		username: a.username,
		avatar: a.avatar,
		created_at: a.created_at,
		owner_id: null
	};

	if (!row.last_used_at || Date.now() - row.last_used_at.getTime() > TOUCH_MS)
		void db
			.update(sessions)
			.set({ last_used_at: sql`NOW()` })
			.where(eq(sessions.token, row.token))
			.catch((e) => console.error('auth: last_used_at failed', e));
}

const unauthorized = (message: string) => apiError(401, message, { 'WWW-Authenticate': 'Bearer' });

/** Whether the request comes from a page of another site (browsers send Origin cross-origin). */
function foreignOrigin(event: RequestEvent) {
	const origin = event.request.headers.get('origin');
	return origin !== null && origin !== event.url.origin && origin !== publicOrigin;
}

/**
 * Authenticates the request and fills `event.locals`. Returns an error response when a bearer
 * token was sent but is invalid (a wrong token never silently falls back to anonymous).
 *
 * The bot API (`/api/bot/*`) authenticates on its own, so bearer tokens are only read elsewhere
 * under `/api/`.
 */
export async function authenticate(event: RequestEvent): Promise<Response | null> {
	const { locals, request, url, cookies } = event;
	anonymous(locals);

	const header = request.headers.get('authorization');
	// only our schemes count: another one (Basic auth from a proxy) is not ours to refuse
	const isOurs = header !== null && /^(?:Bearer|Bot)(?: |$)/i.test(header);
	if (isOurs && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/bot/')) {
		const match = /^(?:Bearer|Bot) (\S+)$/i.exec(header);
		const token = match?.[1] ?? '';
		if (token.startsWith('sgc_')) {
			const bot = await authenticateBot(request);
			if (bot instanceof Response) return bot;
			// bots act as their own profile; they are no account, so account endpoints refuse them
			locals.user = bot.user;
			locals.muted = bot.muted;
			locals.muteReason = bot.muteReason;
			locals.auth = 'bot';
			return null;
		}
		if (!USER_TOKEN_RE.test(token)) return unauthorized('Missing or invalid token');
		const [row] = await loadSessions([hashToken(token)], 'api');
		if (!row) return unauthorized('Invalid or expired token, sign in again');
		fromSession(locals, row);
		locals.auth = 'token';
		return null;
	}

	// a page of another site can make the browser send our cookies along (same-site subdomains,
	// or a JSON request SvelteKit's form check doesn't cover): those requests are anonymous
	if (foreignOrigin(event)) return null;

	const tokens = cookieTokens(cookies);
	if (tokens.length === 0) return null;
	const key = tokens.join(' ');
	const parent = parentAuth.getStore();
	// a subrequest of a page with the same cookies: the page already resolved them
	if (parent?.key === key) {
		Object.assign(locals, parent.locals, { sessions: [...parent.locals.sessions] });
		cookieKeys.set(locals, key);
		return null;
	}
	const valid = await loadSessions(tokens, 'cookie');
	cookieKeys.set(locals, key);

	// the active session expired (or a token went stale): fall back to the next signed in account
	if (valid.length !== tokens.length)
		setSessionCookies(
			cookies,
			valid.map((r) => r.token)
		);

	locals.sessions = valid.map((r) => ({ token: r.token, accountId: r.account.id }));
	if (valid.length > 0) {
		fromSession(locals, valid[0]);
		locals.auth = 'cookie';
	}
	return null;
}
