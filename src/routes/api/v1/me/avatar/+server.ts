import type { RequestHandler } from './$types';
import { fail, rateLimit, requireUser, v1 } from '#lib/server/api.js';
import { MAX_PROFILE_UPDATES, PROFILE_WINDOW_MS, botLimited } from '#lib/server/bots.js';
import { readImageBody } from '#lib/server/uploadInput.js';
import { updateProfile } from '#lib/server/profile.js';
import { LIMITS } from '#lib/server/validation.js';

const MAX_AVATAR_CHANGES = 10;

/** Bots count avatar changes with their other profile edits, like in the bot API. */
function limitAvatar(locals: App.Locals, userId: number) {
	if (locals.auth !== 'bot')
		return rateLimit(
			`avatar:${userId}`,
			MAX_AVATAR_CHANGES,
			60 * 60_000,
			'Changing the avatar too often'
		);
	if (botLimited(userId, 'profile', MAX_PROFILE_UPDATES, PROFILE_WINDOW_MS))
		fail(429, 'Updating the profile too often', {
			'Retry-After': String(PROFILE_WINDOW_MS / 1000)
		});
}

/**
 * Replaces the avatar of the profile in use. The body is the image itself (any Content-Type
 * such as image/png), or multipart with an `avatar` (or `image`) file for browsers.
 */
export const PUT: RequestHandler = v1(async ({ locals, request }) => {
	const user = requireUser(locals);
	// count before reading the body, so a client over the limit doesn't get its bytes buffered
	limitAvatar(locals, user.id);
	const image = await readImageBody(request, LIMITS.avatarBytes, ['avatar', 'image']);
	const result = await updateProfile(user.id, user.username, {}, image);
	if ('error' in result) fail(400, result.error);
	return result.profile;
});

/** Removes the avatar: the generated one is shown again. */
export const DELETE: RequestHandler = v1(async ({ locals }) => {
	const user = requireUser(locals);
	limitAvatar(locals, user.id);
	const result = await updateProfile(user.id, user.username, {}, null);
	if ('error' in result) fail(400, result.error);
	return result.profile;
});
