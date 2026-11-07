import type { RequestHandler } from './$types';
import {
	fail,
	rateLimit,
	readJson,
	requireUnmuted,
	requireUser,
	stringField,
	v1
} from '#lib/server/api.js';
import { getPost } from '#lib/server/feeds.js';
import { deletePostAs, editPost } from '#lib/server/postInput.js';
import { parseId } from '#lib/server/validation.js';

const postId = (raw: string) => parseId(raw) ?? fail(404, 'Post not found');

/** A post, with its counts and, signed in, whether you liked and regiorged it. */
export const GET: RequestHandler = v1(async ({ locals, params }) => {
	return (await getPost(postId(params.id), locals.user)) ?? fail(404, 'Post not found');
});

/** Edits the text of one of your own posts: `{ content }`. Sets `edited_at`. */
export const PATCH: RequestHandler = v1(async ({ locals, params, request }) => {
	const user = requireUnmuted(locals);
	const id = postId(params.id);
	const body = await readJson(request);
	if (typeof body.content !== 'string') fail(400, 'content must be a string');
	rateLimit(`edits:${user.id}`, 30, 60_000, 'Editing too fast');
	return editPost(user, id, stringField(body, 'content'));
});

/** Deletes a post with its replies: your own, or (staff) one of an account you outrank. */
export const DELETE: RequestHandler = v1(async ({ locals, params }) => {
	requireUser(locals);
	await deletePostAs(locals, postId(params.id));
});
