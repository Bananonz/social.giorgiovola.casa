import type { RequestHandler } from './$types';
import { requireUser, v1 } from '#lib/server/api.js';
import { listConversations } from '#lib/server/chat.js';

/** Your conversations, latest first: `direct` (with `muted`) and `groups`, each with a preview. */
export const GET: RequestHandler = v1(({ locals }) => listConversations(requireUser(locals).id));
