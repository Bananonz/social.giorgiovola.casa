import { api } from './api.js';

/**
 * Switches the browser to another profile (an account signed in here, or an identity), then
 * reloads: the realtime stream, push and every page belong to the profile in use.
 */
export async function switchTo(username: string, redirectTo = location.pathname) {
	await api('auth/switch', { method: 'POST', json: { username } });
	// same-site paths only
	location.href = redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/';
}
