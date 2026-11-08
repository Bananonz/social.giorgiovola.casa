/** Shared by the server and the chat: how long after sending a message its text can change. */

export const EDIT_WINDOW_MS = 60 * 60 * 1000;

/** Whether a message sent at `createdAt` can still be edited. */
export const editable = (createdAt: Date | string, now = Date.now()) =>
	now - new Date(createdAt).getTime() < EDIT_WINDOW_MS;

/** the window as a Postgres interval, for the server's queries */
export const EDIT_INTERVAL = `${EDIT_WINDOW_MS} milliseconds`;
