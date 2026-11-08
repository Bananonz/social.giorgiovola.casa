import { api } from './api.js';
import { dropDrafts, saveDrafts } from './composerDraft.js';

/**
 * Switches the browser to another profile (an account signed in here, or an identity), then
 * reloads: the realtime stream, push and every page belong to the profile in use. What's being
 * written in a post composer is saved first and put back after the reload.
 */
export async function switchTo(username: string, redirectTo = location.pathname) {
	const drafts = await saveDrafts();
	try {
		await api('auth/switch', { method: 'POST', json: { username } });
	} catch (e) {
		await dropDrafts(drafts);
		throw e;
	}
	// same-site paths only
	location.href = redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/';
}
