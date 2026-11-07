import type { User } from '#lib/types.js';
import { mutedMessage, isStaff } from './moderation.js';
import { hit, isLimited } from './ratelimit.js';

/**
 * Shared plumbing of the /api/v1 endpoints: the error shape, authentication requirements, body
 * parsing, pagination and rate limits. Endpoints stay thin: they call these, then a service.
 */

/** Thrown by endpoints and helpers; `v1()` turns it into `{ "error": message }`. */
export class ApiError extends Error {
	constructor(public status: number, message: string, public headers?: HeadersInit) {
		super(message);
	}
}

export const apiError = (status: number, error: string, headers?: HeadersInit) =>
	Response.json({ error }, { status, headers });

/** Throws an ApiError: `fail(404, 'Post not found')`. */
export function fail(status: number, message: string, headers?: HeadersInit): never {
	throw new ApiError(status, message, headers);
}

const STATUS_TEXT: Record<number, string> = {
	400: 'Bad request',
	401: 'Unauthorized',
	403: 'Forbidden',
	404: 'Not found',
	405: 'Method not allowed',
	409: 'Conflict',
	413: 'Payload too large',
	429: 'Too many requests'
};

/**
 * Error responses made by older services (`new Response('text', { status })`) get the standard
 * JSON shape, so every v1 endpoint answers errors the same way.
 */
async function normalize(res: Response): Promise<Response> {
	if (res.status < 400 || res.headers.get('content-type')?.includes('application/json')) return res;
	const text = (await res.text()).trim();
	const headers = new Headers(res.headers);
	headers.delete('content-type');
	headers.delete('content-length');
	return apiError(res.status, text || STATUS_TEXT[res.status] || 'Error', headers);
}

/**
 * Wraps a v1 handler: a returned Response is sent as is (errors normalized), any other value is
 * sent as JSON, `undefined` as 204. ApiErrors become `{ error }`, anything else a logged 500.
 */
export const v1 =
	<E>(fn: (event: E) => unknown) =>
	async (event: E): Promise<Response> => {
		try {
			const result = await fn(event);
			if (result instanceof Response) return normalize(result);
			if (result === undefined) return new Response(null, { status: 204 });
			return Response.json(result);
		} catch (e) {
			if (e instanceof ApiError) return apiError(e.status, e.message, e.headers);
			// services that answer with a ready-made error response throw it
			if (e instanceof Response) return normalize(e);
			// SvelteKit's redirect() / error() from shared helpers
			if (e && typeof e === 'object' && 'status' in e && 'body' in e) {
				const { status, body } = e as { status: number; body: { message?: string } };
				return apiError(status, body?.message ?? STATUS_TEXT[status] ?? 'Error');
			}
			console.error('api: unhandled error', e);
			return apiError(500, 'Internal error');
		}
	};

/** `201 Created` with a JSON body. */
export const created = (body: unknown) => Response.json(body, { status: 201 });

// ---------------------------------------------------------------------------------------------
// authentication requirements (locals are filled by authenticate() in auth.ts)

/** The profile in use, or a 401. Bots count: they act as their own profile. */
export function requireUser(locals: App.Locals): User {
	if (!locals.user) fail(401, 'Sign in first: send a bearer token or a session cookie', AUTH);
	return locals.user;
}

const AUTH = { 'WWW-Authenticate': 'Bearer' };

/** A human account (not a bot), with the account id. */
export function requireAccount(locals: App.Locals): { user: User; accountId: number } {
	const user = requireUser(locals);
	if (locals.accountId === null) fail(403, "Bots can't use this endpoint, sign in as a person");
	return { user, accountId: locals.accountId };
}

/** The profile in use, unless its account is muted (muted accounts can't post or message). */
export function requireUnmuted(locals: App.Locals): User {
	const user = requireUser(locals);
	if (locals.muted) fail(403, mutedMessage(locals));
	return user;
}

/** Bots can't do this (it is account-level or human-only in the bot API too). */
export function refuseBots(locals: App.Locals, message: string) {
	if (locals.auth === 'bot') fail(403, message);
}

/** Mods and admins. Everyone else gets a 403. */
export function requireStaff(locals: App.Locals) {
	const account = requireAccount(locals);
	if (!isStaff(locals.role)) fail(403, 'Only moderators and admins can do this');
	return account;
}

export function requireAdmin(locals: App.Locals) {
	const account = requireAccount(locals);
	if (locals.role !== 'admin') fail(403, 'Only admins can do this');
	return account;
}

// ---------------------------------------------------------------------------------------------
// input

/**
 * The JSON object body of a request. An empty body is `{}` (clients send `Content-Type:
 * application/json` on every write, see /api.txt), anything that isn't an object is a 400.
 */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
	const text = await request.text();
	if (!text.trim()) return {};
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		fail(400, 'Invalid JSON body');
	}
	if (!value || typeof value !== 'object' || Array.isArray(value))
		fail(400, 'The body must be a JSON object');
	return value as Record<string, unknown>;
}

/** A string field: '' when missing, a 400 when it is something else. */
export function stringField(body: Record<string, unknown>, name: string): string {
	const value = body[name];
	if (value === undefined || value === null) return '';
	if (typeof value !== 'string') fail(400, `${name} must be a string`);
	return value;
}

/** An optional boolean field. */
export function boolField(body: Record<string, unknown>, name: string): boolean | undefined {
	const value = body[name];
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'boolean') fail(400, `${name} must be true or false`);
	return value;
}

/** A usernames from a path: lowercased, without a leading @. */
export const usernameParam = (raw: string) => raw.replace(/^@/, '').toLowerCase();

// ---------------------------------------------------------------------------------------------
// pagination: every list answers { items, next_cursor } and takes ?limit= and ?cursor=

export type Page<T> = { items: T[]; next_cursor: string | null };

const MAX_OFFSET = 100_000;

/**
 * `?limit=` and `?cursor=` of a list ranked by position (timelines, followers…). The cursor is
 * opaque to clients; here it is the offset of the next page.
 */
export function offsetParams(url: URL, defaultLimit = 20, maxLimit = 100) {
	const limit = limitParam(url, defaultLimit, maxLimit);
	const raw = url.searchParams.get('cursor');
	if (raw === null || raw === '') return { limit, offset: 0 };
	if (!/^\d{1,6}$/.test(raw) || Number(raw) > MAX_OFFSET) fail(400, 'Invalid cursor');
	return { limit, offset: Number(raw) };
}

export function limitParam(url: URL, defaultLimit = 20, maxLimit = 100) {
	const raw = url.searchParams.get('limit');
	if (raw === null || raw === '') return defaultLimit;
	const limit = Number(raw);
	if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit)
		fail(400, `limit must be between 1 and ${maxLimit}`);
	return limit;
}

/**
 * A page from `limit + 1` rows fetched at `offset`: the extra row only tells there is more.
 */
export function offsetPage<T>(rows: T[], limit: number, offset: number): Page<T> {
	return {
		items: rows.slice(0, limit),
		next_cursor: rows.length > limit ? String(offset + limit) : null
	};
}

/** `?cursor=` of a list paged by id (chat threads): the id to continue before. */
export function idCursor(url: URL): number | null {
	const raw = url.searchParams.get('cursor');
	if (raw === null || raw === '') return null;
	if (!/^\d{1,10}$/.test(raw) || Number(raw) < 1 || Number(raw) > 2147483647)
		fail(400, 'Invalid cursor');
	return Number(raw);
}

// ---------------------------------------------------------------------------------------------
// rate limits

/** Counts a hit on `key`, or throws a 429 when it is over `max` in the window. */
export function rateLimit(key: string, max: number, windowMs = 60_000, message = 'Slow down') {
	if (isLimited(key, max))
		fail(429, `${message}, try again ${waitText(windowMs)}`, {
			'Retry-After': String(Math.ceil(windowMs / 1000))
		});
	hit(key, windowMs);
}

/** "in a minute" / "in an hour": the window is the longest a client may have to wait. */
function waitText(windowMs: number) {
	const minutes = Math.ceil(windowMs / 60_000);
	if (minutes <= 1) return 'in a minute';
	if (minutes < 60) return `in ${minutes} minutes`;
	const hours = Math.ceil(minutes / 60);
	return hours === 1 ? 'in an hour' : `in ${hours} hours`;
}

// ---------------------------------------------------------------------------------------------
// CORS: bearer tokens work from any origin; cookies are never sent or honoured cross-origin
// (no Allow-Credentials, and authenticate() ignores cookies on foreign-origin requests)

export const CORS_HEADERS: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Expose-Headers': 'Retry-After, WWW-Authenticate'
};

export const PREFLIGHT_HEADERS: Record<string, string> = {
	...CORS_HEADERS,
	'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Authorization, Content-Type',
	'Access-Control-Max-Age': '86400'
};
