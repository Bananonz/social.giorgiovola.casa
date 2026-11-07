import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, identity_members, sessions, users } from './db/index.js';
import { fail } from './api.js';
import { hashPassword } from './password.js';
import {
	actionsLimited,
	banAccount,
	canModerate,
	findTarget,
	isStaff,
	muteAccount,
	setAccountRole,
	unbanAccount,
	unmuteAccount
} from './moderation.js';
import { validatePassword } from './validation.js';
import { revokeAllSessions } from './session.js';
import { MAX_MOTD, setMotd } from './motd.js';

export const ADMIN_FILTERS = ['all', 'banned', 'muted', 'staff'] as const;
export type AdminFilter = (typeof ADMIN_FILTERS)[number];
export const MAX_REASON = 200;

/**
 * Accounts for the moderation list, newest first (`limit + 1` rows), with what the signed in
 * staff member may do to each. Identities follow the account that owns them, so only accounts are
 * listed, with their identities and the identities shared with them.
 */
export async function listAccounts(
	locals: App.Locals,
	{ q, filter, limit, offset }: { q: string; filter: AdminFilter; limit: number; offset: number }
) {
	const filters: (SQL | undefined)[] = [isNull(users.owner_id)];
	if (q) {
		const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
		filters.push(
			or(
				sql`${users.username} ILIKE ${like}`,
				sql`${users.name} ILIKE ${like}`,
				// searching an identity (or bot) finds the account behind it, and so does one shared
				// with the account; the table names are written out so they can't be mis-qualified
				sql`EXISTS (SELECT 1 FROM users i WHERE i.owner_id = users.id
					AND (i.username ILIKE ${like} OR i.name ILIKE ${like}))`,
				sql`EXISTS (SELECT 1 FROM identity_members m JOIN users i ON i.id = m.identity_id
					WHERE m.account_id = users.id AND (i.username ILIKE ${like} OR i.name ILIKE ${like}))`
			)
		);
	}
	if (filter === 'banned') filters.push(isNotNull(users.banned_at));
	if (filter === 'muted') filters.push(isNotNull(users.muted_at));
	if (filter === 'staff') filters.push(ne(users.role, 'user'));

	const rows = await db
		.select({
			id: users.id,
			username: users.username,
			name: users.name,
			avatar: users.avatar,
			role: users.role,
			banned_at: users.banned_at,
			ban_reason: users.ban_reason,
			muted_at: users.muted_at,
			mute_reason: users.mute_reason,
			created_at: users.created_at
		})
		.from(users)
		.where(and(...filters))
		.orderBy(desc(users.created_at), desc(users.id))
		.limit(limit + 1)
		.offset(offset);

	const identities = await loadIdentities(rows.map((r) => r.id));
	const admin = locals.role === 'admin';
	// ids stay on the server
	return rows.map(({ id, ...row }) => {
		const allowed = canModerate(locals, { id, role: row.role });
		return {
			...row,
			...identities(id),
			self: id === locals.accountId,
			can_moderate: allowed,
			can_manage: admin && allowed
		};
	});
}

/**
 * The identities (and bots) each account owns, with who they are shared with, and the
 * identities of others shared with it, so staff can see who is behind a profile.
 */
async function loadIdentities(accountIds: number[]) {
	if (accountIds.length === 0) return () => ({ identities: [], shared_with: [] });

	const owned = await db
		.select({
			id: users.id,
			owner_id: users.owner_id,
			username: users.username,
			name: users.name,
			avatar: users.avatar,
			bot: users.bot
		})
		.from(users)
		.where(inArray(users.owner_id, accountIds))
		.orderBy(asc(users.created_at), asc(users.id));

	const member = alias(users, 'member');
	const members =
		owned.length === 0
			? []
			: await db
					.select({ identity_id: identity_members.identity_id, username: member.username })
					.from(identity_members)
					.innerJoin(member, eq(member.id, identity_members.account_id))
					.where(
						inArray(
							identity_members.identity_id,
							owned.map((i) => i.id)
						)
					)
					.orderBy(asc(identity_members.created_at));

	const identity = alias(users, 'identity');
	const owner = alias(users, 'owner');
	const shared = await db
		.select({
			account_id: identity_members.account_id,
			username: identity.username,
			name: identity.name,
			avatar: identity.avatar,
			owner_username: owner.username
		})
		.from(identity_members)
		.innerJoin(identity, eq(identity.id, identity_members.identity_id))
		.innerJoin(owner, eq(owner.id, identity.owner_id))
		.where(inArray(identity_members.account_id, accountIds))
		.orderBy(asc(identity_members.created_at));

	return (accountId: number) => ({
		identities: owned
			.filter((i) => i.owner_id === accountId)
			.map((i) => ({
				username: i.username,
				name: i.name,
				avatar: i.avatar,
				bot: i.bot,
				members: members.filter((m) => m.identity_id === i.id).map((m) => m.username)
			})),
		shared_with: shared
			.filter((s) => s.account_id === accountId)
			.map((s) => ({
				username: s.username,
				name: s.name,
				avatar: s.avatar,
				owner_username: s.owner_username
			}))
	});
}

/**
 * The account behind `username` (an account or one of its identities), once the caller is
 * allowed to act on it.
 */
async function authorize(locals: App.Locals, username: string, adminOnly = false) {
	if (!locals.user || locals.accountId === null || !isStaff(locals.role))
		fail(403, 'Only moderators and admins can do this');
	if (adminOnly && locals.role !== 'admin') fail(403, 'Only admins can do this');
	if (actionsLimited(locals.accountId)) fail(429, 'Too many actions, slow down.');
	const target = await findTarget(username);
	if (!target) fail(404, 'User not found.');
	if (!canModerate(locals, target)) fail(403, `You can't moderate @${target.username}.`);
	return target;
}

const reasonOf = (raw: string) => raw.trim().slice(0, MAX_REASON) || null;

export async function ban(locals: App.Locals, username: string, reason: string) {
	const target = await authorize(locals, username);
	await banAccount(target.id, reasonOf(reason));
	return { message: `Banned @${target.username}.` };
}

export async function unban(locals: App.Locals, username: string) {
	const target = await authorize(locals, username);
	await unbanAccount(target.id);
	return { message: `Unbanned @${target.username}.` };
}

export async function mute(locals: App.Locals, username: string, reason: string) {
	const target = await authorize(locals, username);
	await muteAccount(target.id, reasonOf(reason));
	return { message: `Muted @${target.username}.` };
}

export async function unmute(locals: App.Locals, username: string) {
	const target = await authorize(locals, username);
	await unmuteAccount(target.id);
	return { message: `Unmuted @${target.username}.` };
}

/** Makes an account a mod, or a regular user again. Admins are made with `bun admin.ts`. */
export async function setRole(locals: App.Locals, username: string, role: unknown) {
	if (role !== 'mod' && role !== 'user') fail(400, 'role must be "mod" or "user"');
	const target = await authorize(locals, username, true);
	await setAccountRole(target.id, role);
	return {
		message:
			role === 'mod'
				? `@${target.username} is now a mod.`
				: `@${target.username} is no longer a mod.`
	};
}

/** Sets a new password and signs the account out everywhere. Admin only. */
export async function resetPassword(locals: App.Locals, username: string, password: string) {
	const target = await authorize(locals, username, true);
	const invalid = validatePassword(password);
	if (invalid) fail(400, invalid);
	const { salt, hash } = await hashPassword(password);
	await db.update(users).set({ password: hash, salt }).where(eq(users.id, target.id));
	await revokeAllSessions(target.id);
	return { message: `Password of @${target.username} reset.` };
}

/** Sets the message of the day shown in the post composer; empty resets it. Admin only. */
export async function updateMotd(locals: App.Locals, motd: string) {
	if (locals.role !== 'admin' || locals.accountId === null) fail(403, 'Only admins can do this');
	if (actionsLimited(locals.accountId)) fail(429, 'Too many actions, slow down.');
	// one line: it is an input placeholder
	const clean = motd.replace(/\s+/g, ' ').trim();
	if (clean.length > MAX_MOTD) fail(400, `The message can be at most ${MAX_MOTD} characters.`);
	await setMotd(clean);
	return {
		motd: clean,
		message: clean ? 'Message of the day updated.' : 'Message of the day reset.'
	};
}
