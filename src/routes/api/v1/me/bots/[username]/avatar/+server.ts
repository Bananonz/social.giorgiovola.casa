import type { RequestHandler } from './$types';
import { requireAccount, usernameParam, v1 } from '#lib/server/api.js';
import { editBot } from '#lib/server/bots.js';
import { readImageBody } from '#lib/server/uploadInput.js';
import { LIMITS } from '#lib/server/validation.js';

/** Replaces a bot's avatar: the image as the body, or multipart with an `avatar` file. */
export const PUT: RequestHandler = v1(async ({ locals, params, request }) => {
	const { accountId } = requireAccount(locals);
	const image = await readImageBody(request, LIMITS.avatarBytes, ['avatar', 'image']);
	return editBot(accountId, usernameParam(params.username), {}, image);
});

/** Removes a bot's avatar. */
export const DELETE: RequestHandler = v1(({ locals, params }) =>
	editBot(requireAccount(locals).accountId, usernameParam(params.username), {}, null)
);
