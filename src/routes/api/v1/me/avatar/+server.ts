import type { RequestHandler } from './$types';
import { fail, rateLimit, requireUser, v1 } from '#lib/server/api.js';
import { readImageBody } from '#lib/server/uploadInput.js';
import { updateProfile } from '#lib/server/profile.js';
import { LIMITS } from '#lib/server/validation.js';

const MAX_AVATAR_CHANGES = 10;

/**
 * Replaces the avatar of the profile in use. The body is the image itself (any Content-Type
 * such as image/png), or multipart with an `avatar` (or `image`) file for browsers.
 */
export const PUT: RequestHandler = v1(async ({ locals, request }) => {
	const user = requireUser(locals);
	const image = await readImageBody(request, LIMITS.avatarBytes, ['avatar', 'image']);
	rateLimit(`avatar:${user.id}`, MAX_AVATAR_CHANGES, 60 * 60_000, 'Changing the avatar too often');
	const result = await updateProfile(user.id, user.username, {}, image);
	if ('error' in result) fail(400, result.error);
	return result.profile;
});

/** Removes the avatar: the generated one is shown again. */
export const DELETE: RequestHandler = v1(async ({ locals }) => {
	const user = requireUser(locals);
	rateLimit(`avatar:${user.id}`, MAX_AVATAR_CHANGES, 60 * 60_000, 'Changing the avatar too often');
	const result = await updateProfile(user.id, user.username, {}, null);
	if ('error' in result) fail(400, result.error);
	return result.profile;
});
