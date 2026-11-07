import { api } from './api.js';

export type ModerationAction = 'ban' | 'unban' | 'mute' | 'unmute' | 'role' | 'password';

/** Runs a staff action on the account behind `username`. Resolves with what to tell the user. */
export function moderate(
	username: string,
	action: ModerationAction,
	fields: { reason?: string; role?: string; password?: string } = {}
) {
	const base = `admin/users/${encodeURIComponent(username)}`;
	const [path, method, json] = {
		ban: [`${base}/ban`, 'PUT', { reason: fields.reason ?? '' }],
		unban: [`${base}/ban`, 'DELETE', undefined],
		mute: [`${base}/mute`, 'PUT', { reason: fields.reason ?? '' }],
		unmute: [`${base}/mute`, 'DELETE', undefined],
		role: [`${base}/role`, 'PUT', { role: fields.role }],
		password: [`${base}/password`, 'PUT', { password: fields.password }]
	}[action] as [string, string, unknown];
	return api<{ message: string }>(path, { method, json });
}
