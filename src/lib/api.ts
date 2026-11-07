/**
 * Calling /api/v1 from the browser. Everything the web UI does goes through the same documented
 * API third-party clients use (see /api.txt); the session cookie authenticates it.
 */

export const API = '/api/v1';

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
		/** the whole error body, for endpoints that add fields to it */
		public body: Record<string, unknown> = {}
	) {
		super(message);
	}
}

/** Every list of the API answers a page: follow `next_cursor` with `?cursor=` for the next one. */
export type Page<T> = { items: T[]; next_cursor: string | null };

/** Every item of a paged list: follows `next_cursor` until it ends (or `maxPages` pages). */
export async function allPages<T>(
	load: (cursor: string | null) => Promise<Page<T>>,
	maxPages = 25
): Promise<T[]> {
	const items: T[] = [];
	let cursor: string | null = null;
	for (let i = 0; i < maxPages; i++) {
		const page: Page<T> = await load(cursor);
		items.push(...page.items);
		if (!page.next_cursor) break;
		cursor = page.next_cursor;
	}
	return items;
}

type Options = Omit<RequestInit, 'body'> & {
	/** sent as JSON */
	json?: unknown;
	/** sent as is (FormData, a File…) */
	body?: BodyInit;
};

/** The error message of a failed API response. */
export async function errorOf(res: Response): Promise<ApiError> {
	const body = await res.json().catch(() => ({}));
	const message =
		typeof body?.error === 'string' && body.error ? body.error : `Request failed (${res.status})`;
	return new ApiError(res.status, message, body ?? {});
}

/** Calls the API: resolves with the JSON answer (undefined for 204), throws an ApiError. */
export async function api<T = unknown>(
	path: string,
	{ json, body, ...init }: Options = {}
): Promise<T> {
	const headers = new Headers(init.headers);
	// writes always say they are JSON, even without a body: SvelteKit's CSRF check refuses
	// cross-site writes that have no content type, and the API documents it for every client
	if (json !== undefined || (body === undefined && init.method && init.method !== 'GET'))
		headers.set('Content-Type', 'application/json');
	const res = await fetch(path.startsWith('/') ? path : `${API}/${path}`, {
		...init,
		headers,
		body: json !== undefined ? JSON.stringify(json) : body
	});
	if (!res.ok) throw await errorOf(res);
	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

/** `path` with the cursor of the next page. */
export const withCursor = (path: string, cursor: string) =>
	`${path}${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cursor)}`;

/** The message of anything thrown by `api`. */
export const messageOf = (e: unknown, fallback = 'Something went wrong') =>
	e instanceof Error && e.message ? e.message : fallback;
