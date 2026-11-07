import type { RequestHandler } from './$types';
import { requireUser, v1 } from '#lib/server/api.js';
import { markAllNotificationsRead } from '#lib/server/notifications.js';

/** Marks every notification read. */
export const POST: RequestHandler = v1(({ locals }) =>
	markAllNotificationsRead(requireUser(locals).id)
);
