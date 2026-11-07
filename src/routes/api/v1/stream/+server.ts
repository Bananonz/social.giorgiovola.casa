import type { RequestHandler } from './$types';
import { openStream } from '#lib/server/realtime.js';

const SSE_HEADERS = {
	'Content-Type': 'text/event-stream; charset=utf-8',
	'Cache-Control': 'no-cache, no-transform',
	'X-Accel-Buffering': 'no'
};

/**
 * Server-sent events: new posts, deletions, edits, counts and polls for everyone, plus your
 * unread counts, direct and group messages, reactions and typing when signed in (token or
 * cookie). Anonymous streams get the public events only.
 */
export const GET: RequestHandler = ({ locals, request }) => {
	const userId = locals.user?.id ?? null;
	const botId = locals.auth === 'bot' ? userId : null;
	return new Response(openStream(userId, locals.sessionKey, botId, request.signal), {
		headers: SSE_HEADERS
	});
};
