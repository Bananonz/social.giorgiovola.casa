import type { RequestHandler } from './$types';
import { created, rateLimit, requireUnmuted, v1 } from '#lib/server/api.js';
import { readPostBody, submitPost } from '#lib/server/postInput.js';

const MAX_POSTS = 30;
// the bot API's limit, so bots can't get more by using v1
const MAX_BOT_POSTS = 20;

/**
 * Posts, replies (`reply_to`) or quote regiorgs (`quote_of`), optionally with images (`uploads`:
 * ids from POST /uploads) and a poll. JSON, or multipart with `images` files for browsers.
 */
export const POST: RequestHandler = v1(async ({ locals, request }) => {
	const user = requireUnmuted(locals);
	const body = await readPostBody(request);
	rateLimit(
		`posts:${user.id}`,
		locals.auth === 'bot' ? MAX_BOT_POSTS : MAX_POSTS,
		60_000,
		'Posting too fast'
	);
	return created(await submitPost(user, body));
});
