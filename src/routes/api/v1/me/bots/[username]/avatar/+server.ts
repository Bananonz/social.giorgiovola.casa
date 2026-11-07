import type { RequestHandler } from './$types';
import { requireAccount, usernameParam, v1 } from '#lib/server/api.js';
import { editBot, manageLimited } from '#lib/server/bots.js';
import { readImageBody } from '#lib/server/uploadInput.js';
import { LIMITS } from '#lib/server/validation.js';

/** Replaces a bot's avatar: the image as the body, or multipart with an `avatar` file. */
export const PUT: RequestHandler = v1(async ({ locals, params, request }) => {
	const { accountId } = requireAccount(locals);
	const username = usernameParam(params.username);
	// counted before the body is read, so requests over the limit aren't buffered first
	manageLimited(accountId);
	const image = await readImageBody(request, LIMITS.avatarBytes, ['avatar', 'image']);
	return editBot(accountId, username, {}, image, true);
});

/** Removes a bot's avatar. */
export const DELETE: RequestHandler = v1(({ locals, params }) =>
	editBot(requireAccount(locals).accountId, usernameParam(params.username), {}, null)
);
