import type { RequestHandler } from './$types';
import { discardStaged } from '#lib/server/stagedUploads.js';

/** Deletes an uploaded image that was removed before sending. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	if (!(await discardStaged(locals.user.id, params.id))) {
		return new Response('Upload not found', { status: 404 });
	}
	return new Response(null, { status: 204 });
};
