import type { RequestEvent } from '@sveltejs/kit';
import { and, desc, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { SIGNUP_PASSWORD } from '$app/env/private';
import type { User } from '#lib/types.js';
import { db, users } from './db/index.js';
import { fail } from './api.js';
import { dummyVerify, hashPassword, secretsEqual, verifyPassword } from './password.js';
import { clear, clientIp, hit, isLimited } from './ratelimit.js';
import { TOKEN_DAYS, createSession, createToken, revokeOtherSessions } from './session.js';
import { profileColumns, updateProfile } from './profile.js';
import {
	LIMITS,
	isUniqueViolation,
	validateEmail,
	validateName,
	validatePassword,
	validateUsername
} from './validation.js';

/** Signing in, registering and the account's own credentials. */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_ACCOUNT = 10;
const MAX_FAILS_PER_IP = 30;
const GENERIC_ERROR = 'Wrong username or password.';

/** Checks a username (or email) and password. Returns the account id, or throws the error. */
export async function passwordLogin(
	rawLogin: string,
	password: string,
	getClientAddress: () => string
) {
	if (!rawLogin || !password) fail(400, 'Please fill out all fields.');
	const login = rawLogin.trim().toLowerCase();
	const accountKey = `login:account:${login}`;
	const ip = clientIp(getClientAddress);
	const ipKey = ip ? `login:ip:${ip}` : null;
	if (isLimited(accountKey, MAX_FAILS_PER_ACCOUNT) || (ipKey && isLimited(ipKey, MAX_FAILS_PER_IP)))
		fail(429, 'Too many failed attempts, try again in 15 minutes.', { 'Retry-After': '900' });

	const res = login.includes('@')
		? await db
				.select()
				.from(users)
				.where(and(sql`lower(${users.email}) = ${login}`, isNull(users.owner_id)))
				.orderBy(desc(sql`(${users.email} = ${rawLogin.trim()})`))
				.limit(1)
		: // identities have no password and can't be logged into directly
		  await db
				.select()
				.from(users)
				.where(and(eq(users.username, login), isNull(users.owner_id)));

	let ok = false;
	if (res.length > 0) {
		// accounts (owner_id IS NULL) always have a password and salt, see users_identity_check
		const { valid, needsRehash } = await verifyPassword(
			password,
			res[0].salt ?? '',
			res[0].password ?? ''
		);
		ok = valid;
		if (valid && needsRehash) {
			// upgrade legacy PBKDF2 hashes now that we know the plaintext
			const { salt, hash } = await hashPassword(password);
			await db.update(users).set({ password: hash, salt }).where(eq(users.id, res[0].id));
		}
	} else {
		await dummyVerify(password);
	}

	if (!ok) {
		hit(accountKey, WINDOW_MS);
		if (ipKey) hit(ipKey, WINDOW_MS);
		fail(401, GENERIC_ERROR);
	}
	clear(accountKey);

	// only said after the password checked out, so it can't be used to probe for accounts
	if (res[0].banned_at) {
		const reason = res[0].ban_reason ? ` Reason: ${res[0].ban_reason}` : '';
		fail(403, `This account has been banned.${reason}`);
	}
	return res[0].id;
}

// wrong signup passwords allowed per IP, and across everyone (covers the no-ADDRESS_HEADER case)
const MAX_SIGNUP_FAILS_PER_IP = 10;
const MAX_SIGNUP_FAILS_GLOBAL = 50;

export const registrationOpen = () => !!SIGNUP_PASSWORD;

/** Creates an account. Returns its id, or throws the errors (joined in one message). */
export async function registerAccount(
	fields: {
		signupPassword: string;
		email: string;
		name: string;
		username: string;
		password: string;
	},
	getClientAddress: () => string
) {
	if (!SIGNUP_PASSWORD) fail(403, 'Registration is closed.');
	const email = fields.email.trim();
	const name = fields.name.trim();
	const username = fields.username.trim().toLowerCase();
	const { signupPassword, password } = fields;
	if (!signupPassword || !email || !name || !username || !password)
		fail(400, 'Please fill out all fields.');

	// checked before anything else so the form can't be used to probe for existing accounts
	const ip = clientIp(getClientAddress);
	const ipKey = ip ? `signup:ip:${ip}` : null;
	if (
		isLimited('signup:global', MAX_SIGNUP_FAILS_GLOBAL) ||
		(ipKey && isLimited(ipKey, MAX_SIGNUP_FAILS_PER_IP))
	)
		fail(429, 'Too many attempts, try again later.');
	if (!secretsEqual(signupPassword, SIGNUP_PASSWORD)) {
		hit('signup:global', WINDOW_MS);
		if (ipKey) hit(ipKey, WINDOW_MS);
		fail(403, 'Wrong signup password.');
	}

	const errors = [
		validateEmail(email),
		validateName(name),
		validateUsername(username),
		validatePassword(password)
	].filter((e): e is string => e !== null);
	if (errors.length === 0) {
		const taken = await db
			.select({ username: users.username, email: users.email })
			.from(users)
			.where(or(eq(users.username, username), sql`lower(${users.email}) = lower(${email})`));
		if (taken.some((u) => u.email?.toLowerCase() === email.toLowerCase()))
			errors.push('Email already in use.');
		if (taken.some((u) => u.username === username)) errors.push('Username already in use.');
	}
	if (errors.length > 0) fail(400, errors.join(' '));

	const { salt, hash } = await hashPassword(password);
	try {
		const [created] = await db
			.insert(users)
			.values({ email, name, username, password: hash, salt })
			.returning({ id: users.id });
		return created.id;
	} catch (e) {
		// lost a race with a concurrent registration
		if (isUniqueViolation(e)) fail(400, 'Username or email already in use.');
		throw e;
	}
}

/**
 * Signs an account in after a successful login: the browser gets a session cookie (`cookie`,
 * the web UI), any other client a bearer token (`token`, the default).
 */
export async function startSession(
	event: Pick<RequestEvent, 'cookies' | 'locals' | 'request'>,
	accountId: number,
	mode: unknown,
	clientName: unknown
) {
	const userAgent = event.request.headers.get('user-agent');
	if (mode === 'cookie') {
		await createSession(event.cookies, accountId, event.locals.sessions, userAgent);
		return { session: 'cookie' as const };
	}
	if (mode !== undefined && mode !== null && mode !== 'token')
		fail(400, 'session must be "token" or "cookie"');
	if (clientName != null && typeof clientName !== 'string')
		fail(400, 'client_name must be a string');
	const { token, expires_at } = await createToken(accountId, {
		kind: 'token',
		name: typeof clientName === 'string' ? clientName.trim().slice(0, 64) : null,
		userAgent,
		days: TOKEN_DAYS
	});
	return { session: 'token' as const, token, token_type: 'Bearer', expires_at };
}

/** The account (never an identity) as its owner sees it. */
export async function accountProfile(accountId: number) {
	const [row] = await db
		.select({ ...profileColumns, email: users.email, created_at: users.created_at })
		.from(users)
		.where(eq(users.id, accountId));
	return row;
}

/**
 * Changes the profile in use: name, username, bio, website, and the email for accounts
 * (identities have none). Fields left undefined are kept.
 */
export async function updateMe(
	me: User,
	changes: { name?: string; username?: string; bio?: string; website?: string; email?: string }
) {
	const { email, ...profile } = changes;
	let cleanEmail: string | null = null;
	if (email !== undefined) {
		if (me.owner_id !== null || me.email === null) fail(400, 'Identities have no email');
		cleanEmail = email.trim();
		const invalid = validateEmail(cleanEmail);
		if (invalid) fail(400, invalid);
		const [taken] = await db
			.select({ id: users.id })
			.from(users)
			.where(and(sql`lower(${users.email}) = lower(${cleanEmail})`, ne(users.id, me.id)));
		if (taken) fail(400, 'Email already in use.');
	}
	// the profile first: it is the part that can still fail validation
	if (Object.keys(profile).length > 0) {
		const result = await updateProfile(me.id, me.username, profile);
		if ('error' in result) fail(400, result.error);
	}
	if (cleanEmail !== null) {
		try {
			await db.update(users).set({ email: cleanEmail }).where(eq(users.id, me.id));
		} catch (e) {
			if (isUniqueViolation(e)) fail(400, 'Email already in use.');
			throw e;
		}
	}
	const [row] = await db
		.select({ ...profileColumns, email: users.email, created_at: users.created_at })
		.from(users)
		.where(eq(users.id, me.id));
	return row;
}

/**
 * Changes the account's password once the current one checks out, then signs out every other
 * session and token (`keepKey` is the one making the request).
 */
export async function changePassword(
	accountId: number,
	current: string,
	next: string,
	keepKey: string | null
) {
	const key = `password:${accountId}`;
	if (isLimited(key, MAX_FAILS_PER_ACCOUNT)) fail(429, 'Too many attempts, try again later.');
	const [row] = await db
		.select({ password: users.password, salt: users.salt })
		.from(users)
		.where(eq(users.id, accountId));
	const { valid } = await verifyPassword(current, row?.salt ?? '', row?.password ?? '');
	if (!valid) {
		hit(key, WINDOW_MS);
		fail(403, 'The current password is wrong.');
	}
	if (next.length > LIMITS.passwordMax || validatePassword(next))
		fail(400, validatePassword(next)!);
	const { salt, hash } = await hashPassword(next);
	await db.update(users).set({ password: hash, salt }).where(eq(users.id, accountId));
	await revokeOtherSessions(accountId, keepKey);
}
