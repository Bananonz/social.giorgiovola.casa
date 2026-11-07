import type { RequestHandler } from './$types';
import { apiError } from '#lib/server/api.js';
import { openBotStream } from '#lib/server/realtime.js';

/**
 * The bot stream (same as /api/bot/stream): `ready`, `mention`, `post`, `message` and
 * `group_message` events. Bot tokens only.
 */
export const GET: RequestHandler = ({ locals, request }) => {
	if (locals.auth !== 'bot' || !locals.user)
		return apiError(403, 'This stream is for bot tokens, use /api/v1/stream');
	return new Response(openBotStream(locals.user, request.signal), {
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			'X-Accel-Buffering': 'no'
		}
	});
};
