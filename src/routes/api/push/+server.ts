// The original web push route, kept for browsers whose service worker or open page still use it:
// the same handlers as /api/v1/push.
export { GET, POST, DELETE } from '../v1/push/+server.js';
