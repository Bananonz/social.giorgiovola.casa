import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, identity_members, sessions, users } from './db/index.js';
import { fail, rateLimit } from './api.js';
import { MAX_IDENTITIES, MAX_MEMBERS, removeAvatarFiles } from './accounts.js';
import { imagesOfPostTrees, removeUploads } from './images.js';
import { isUniqueViolation, validateName, validateUsername } from './validation.js';

/**
 * Identities: extra profiles an account owns and can act as. The owner can share one with other
 * accounts, which can then act as it too (but not delete or share it).
 */

/** The identities an account owns, with who each is shared with, and the ones shared with it. */
export async function listIdentities(accountId: number) {
	const owned = await db
		.select({
			id: users.id,
			name: users.name,
			username: users.username,
			avatar: users.avatar,
			created_at: users.created_at
		})
		.from(users)
		.where(and(eq(users.owner_id, accountId), eq(users.bot, false)))
		.orderBy(asc(users.created_at), asc(users.id));
	const members =
		owned.length === 0
			? []
			: await db
					.select({
						identity_id: identity_members.identity_id,
						name: users.name,
						username: users.username,
						avatar: users.avatar
					})
					.from(identity_members)
					.innerJoin(users, eq(users.id, identity_members.account_id))
					.where(
						inArray(
							identity_members.identity_id,
							owned.map((i) => i.id)
						)
					)
					.orderBy(asc(identity_members.created_at));

	const owner = alias(users, 'owner');
	const shared = await db
		.select({
			name: users.name,
			username: users.username,
			avatar: users.avatar,
			created_at: users.created_at,
			owner: owner.username
		})
		.from(identity_members)
		.innerJoin(users, eq(users.id, identity_members.identity_id))
		.innerJoin(owner, eq(owner.id, users.owner_id))
		// shared identities stop showing up while their owner is banned
		.where(and(eq(identity_members.account_id, accountId), isNull(owner.banned_at)))
		.orderBy(asc(identity_members.created_at));

	return {
		max_identities: MAX_IDENTITIES,
		max_members: MAX_MEMBERS,
		owned: owned.map(({ id, ...identity }) => ({
			...identity,
			members: members
				.filter((m) => m.identity_id === id)
				.map(({ name, username, avatar }) => ({ name, username, avatar }))
		})),
		shared_with_me: shared
	};
}

/** An identity the account owns, by username, or a 404. */
async function ownedIdentity(accountId: number, username: string) {
	const [identity] = await db
		.select({ id: users.id, username: users.username })
		.from(users)
		.where(and(eq(users.username, username), eq(users.owner_id, accountId), eq(users.bot, false)));
	if (!identity) fail(404, 'Identity not found');
	return identity;
}

/** Creates an identity owned by the account. Returns its id and username. */
export async function createIdentity(accountId: number, rawName: string, rawUsername: string) {
	const name = rawName.trim();
	const username = rawUsername.trim().replace(/^@/, '').toLowerCase();
	const invalid = validateName(name) ?? validateUsername(username);
	if (invalid) fail(400, invalid);

	let created;
	try {
		created = await db.transaction(async (tx) => {
			// serialises concurrent creations so the limit can't be raced past
			await tx.select({ id: users.id }).from(users).where(eq(users.id, accountId)).for('update');
			const [{ n }] = await tx
				.select({ n: count() })
				.from(users)
				.where(and(eq(users.owner_id, accountId), eq(users.bot, false)));
			if (n >= MAX_IDENTITIES) return null;
			const [identity] = await tx
				.insert(users)
				.values({ name, username, owner_id: accountId })
				.returning({
					id: users.id,
					name: users.name,
					username: users.username,
					avatar: users.avatar
				});
			return identity;
		});
	} catch (e) {
		if (isUniqueViolation(e)) fail(400, 'Username already in use.');
		throw e;
	}
	if (!created) fail(400, `You can have at most ${MAX_IDENTITIES} identities.`);
	return created;
}

/** Permanently deletes one of the account's identities, with its posts. Owner only. */
export async function deleteIdentity(accountId: number, username: string) {
	const identity = await ownedIdentity(accountId, username);
	// collect the images first: the posts (and replies to them) go away with the identity
	const images = await imagesOfPostTrees(sql`user_id = ${identity.id}`);
	await db.delete(users).where(eq(users.id, identity.id));
	await removeAvatarFiles(identity.id);
	await removeUploads(images);
	// sessions acting as it fall back to the account (acting_id is ON DELETE SET NULL)
}

// sharing looks accounts up by username, so it shouldn't be usable to probe for them quickly
const SHARE_WINDOW_MS = 60_000;
const MAX_SHARES = 20;

/** Shares one of the account's identities with another account, by username. */
export async function shareIdentity(
	accountId: number,
	identityUsername: string,
	rawMember: string
) {
	const identity = await ownedIdentity(accountId, identityUsername);
	rateLimit(`identity:share:${accountId}`, MAX_SHARES, SHARE_WINDOW_MS, 'Too many attempts');

	const username = rawMember.trim().replace(/^@/, '').toLowerCase();
	if (validateUsername(username)) fail(400, 'Enter a valid username.');
	// only accounts can be given an identity: identities have no sessions of their own
	const [account] = await db
		.select({ id: users.id, name: users.name, username: users.username, avatar: users.avatar })
		.from(users)
		.where(and(eq(users.username, username), isNull(users.owner_id), isNull(users.banned_at)));
	if (!account) fail(404, `No account named @${username}.`);
	if (account.id === accountId) fail(400, 'You already own this identity.');

	const added = await db.transaction(async (tx) => {
		// serialises concurrent shares so the limit can't be raced past
		await tx.select({ id: users.id }).from(users).where(eq(users.id, identity.id)).for('update');
		const [{ n }] = await tx
			.select({ n: count() })
			.from(identity_members)
			.where(eq(identity_members.identity_id, identity.id));
		if (n >= MAX_MEMBERS) return null;
		return tx
			.insert(identity_members)
			.values({ identity_id: identity.id, account_id: account.id })
			.onConflictDoNothing()
			.returning({ account_id: identity_members.account_id });
	});
	if (!added) fail(400, `An identity can be shared with at most ${MAX_MEMBERS} accounts.`);
	if (added.length === 0) fail(400, `@${identity.username} is already shared with @${username}.`);
	return { name: account.name, username: account.username, avatar: account.avatar };
}

/** Stops `accountId` from using the identity: its sessions acting as it go back to the account. */
async function removeMember(identityId: number, accountId: number) {
	const removed = await db
		.delete(identity_members)
		.where(
			and(eq(identity_members.identity_id, identityId), eq(identity_members.account_id, accountId))
		)
		.returning({ account_id: identity_members.account_id });
	await db
		.update(sessions)
		.set({ acting_id: null })
		.where(and(eq(sessions.user_id, accountId), eq(sessions.acting_id, identityId)));
	return removed.length > 0;
}

/** Stops sharing one of the account's identities with another account. */
export async function unshareIdentity(accountId: number, identityUsername: string, member: string) {
	const identity = await ownedIdentity(accountId, identityUsername);
	const [account] = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.username, member.replace(/^@/, '').toLowerCase()), isNull(users.owner_id)));
	if (!account || !(await removeMember(identity.id, account.id)))
		fail(404, 'That account has no access to this identity.');
}

/** Gives back an identity someone else shared with the account. */
export async function leaveIdentity(accountId: number, username: string) {
	const [identity] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.username, username));
	if (!identity || !(await removeMember(identity.id, accountId))) fail(404, 'Identity not found');
}
