import type { RequestHandler } from './$types';
import { fail, requireUser, v1 } from '#lib/server/api.js';
import { discardStaged } from '#lib/server/stagedUploads.js';

/** Deletes an upload that was removed before sending. */
export const DELETE: RequestHandler = v1(async ({ locals, params }) => {
	if (!(await discardStaged(requireUser(locals).id, params.id))) fail(404, 'Upload not found');
});
