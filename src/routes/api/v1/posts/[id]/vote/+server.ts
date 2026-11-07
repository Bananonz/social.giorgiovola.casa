import type { RequestHandler } from './$types';
import { fail, rateLimit, readJson, requireUser, v1 } from '#lib/server/api.js';
import { vote } from '#lib/server/polls.js';
import { parseId } from '#lib/server/validation.js';

const MAX_VOTES = 30;

/** Votes in the poll of a post: `{ option }`, the index of the choice. Changeable until it ends. */
export const PUT: RequestHandler = v1(async ({ locals, params, request }) => {
	const user = requireUser(locals);
	const id = parseId(params.id) ?? fail(404, 'Poll not found');
	const option = (await readJson(request)).option;
	if (typeof option !== 'number') fail(400, 'option must be the index of a choice');
	rateLimit(`vote:${user.id}`, MAX_VOTES, 60_000, 'Voting too fast');
	const result = await vote(user.id, id, option);
	if (!result.ok) fail(result.status, result.message);
	return { voted: result.voted, votes: result.votes };
});
