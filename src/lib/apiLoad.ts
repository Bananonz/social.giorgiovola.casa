import { error, redirect } from '@sveltejs/kit';
import { API } from './api.js';

/**
 * Page loads read their data from /api/v1 through SvelteKit's `fetch`, which forwards the
 * session cookie and runs the endpoint in-process during SSR. No load touches the database.
 */

type Fetch = typeof fetch;

type Options = {
	/** a 401 sends the visitor to the login page (the default) instead of showing an error */
	login?: boolean;
	/** a 404 resolves with null instead of showing the error page */
	optional?: boolean;
};

export async function apiGet<T>(
	fetch: Fetch,
	path: string,
	options?: Options & { optional?: false }
): Promise<T>;
export async function apiGet<T>(
	fetch: Fetch,
	path: string,
	options: Options & { optional: true }
): Promise<T | null>;
export async function apiGet<T>(
	fetch: Fetch,
	path: string,
	{ login = true, optional = false }: Options = {}
): Promise<T | null> {
	const res = await fetch(`${API}${path}`);
	if (res.ok) return res.json();
	if (res.status === 401 && login) redirect(303, '/login');
	if (res.status === 404 && optional) return null;
	const body = await res.json().catch(() => null);
	error(res.status, body?.error ?? 'Something went wrong');
}
