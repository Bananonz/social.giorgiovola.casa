import type { Handle } from '@sveltejs/kit/hooks';
import { CORS_HEADERS, PREFLIGHT_HEADERS, apiError } from '#lib/server/api.js';
import { authenticate, shareAuth } from '#lib/server/auth.js';
import { PUBLIC_URL } from '$app/env/public';

const securityHeaders: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'Referrer-Policy': 'strict-origin-when-cross-origin'
};

function setHeaders(response: Response, headers: Record<string, string>) {
	try {
		for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
	} catch {
		// some responses (e.g. Response.redirect) have immutable headers
	}
}

export const handle = (async ({ event, resolve }) => {
	const api = event.url.pathname.startsWith('/api/v1/') || event.url.pathname === '/api/v1';

	// CORS preflight: bearer tokens may be used from any origin, cookies never are (see api.ts)
	if (api && event.request.method === 'OPTIONS')
		return new Response(null, { status: 204, headers: PREFLIGHT_HEADERS });

	let response = await authenticate(event);
	if (!response) {
		response = await shareAuth(event.locals, () => resolve(event));
		// unknown routes and methods under /api/v1 answer with the API's error shape too
		if (
			api &&
			(response.status === 404 || response.status === 405) &&
			!response.headers.get('content-type')?.includes('application/json')
		)
			response = apiError(
				response.status,
				response.status === 404 ? 'No such endpoint' : 'Method not allowed',
				response.headers.get('allow') ? { Allow: response.headers.get('allow')! } : undefined
			);
	}

	if (api) setHeaders(response, CORS_HEADERS);
	setHeaders(response, securityHeaders);
	if (PUBLIC_URL?.startsWith('https://'))
		setHeaders(response, { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' });
	return response;
}) satisfies Handle;
