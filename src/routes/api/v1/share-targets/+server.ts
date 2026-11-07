import type { RequestHandler } from './$types';
import { requireUser, v1 } from '#lib/server/api.js';
import { shareTargets } from '#lib/server/chat.js';

/** Where a post can be shared: the latest conversations (`recent`) and every group (`groups`). */
export const GET: RequestHandler = v1(({ locals }) => shareTargets(requireUser(locals).id));
