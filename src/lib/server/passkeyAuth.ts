import type { Cookies } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
	type AuthenticationResponseJSON,
	type RegistrationResponseJSON
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { db, passkeys, users } from './db/index.js';
import { ApiError, fail } from './api.js';
import { clientIp, hit, isLimited } from './ratelimit.js';
import { isUniqueViolation } from './validation.js';
import {
	MAX_PASSKEYS,
	PASSKEY_NAME_MAX,
	isCredentialId,
	parsePasskeyName,
	relyingParty,
	saveChallenge,
	takeChallenge,
	userHandle,
	userHandleBase64
} from './passkeys.js';

/** Passkey ceremonies (WebAuthn) and the account's list of passkeys. */

const WINDOW_MS = 15 * 60 * 1000;

/** The account's passkeys, with what a browser needs to sync its list with ours. */
export async function listPasskeys(accountId: number, url: URL) {
	const list = await db
		.select({
			id: passkeys.id,
			name: passkeys.name,
			backed_up: passkeys.backed_up,
			created_at: passkeys.created_at,
			last_used_at: passkeys.last_used_at
		})
		.from(passkeys)
		.where(eq(passkeys.user_id, accountId))
		.orderBy(asc(passkeys.created_at));
	return {
		items: list,
		max: MAX_PASSKEYS,
		// lets the page tell the browser which passkeys are still valid, so deleted ones disappear
		rp_id: relyingParty(url).rpID,
		user_handle: userHandleBase64(accountId)
	};
}

export async function renamePasskey(accountId: number, id: string, rawName: unknown) {
	if (!isCredentialId(id)) fail(404, 'Passkey not found');
	const name = parsePasskeyName(rawName);
	if (!name) fail(400, `Name must be at most ${PASSKEY_NAME_MAX} characters.`);
	const updated = await db
		.update(passkeys)
		.set({ name })
		.where(and(eq(passkeys.id, id), eq(passkeys.user_id, accountId)))
		.returning({ id: passkeys.id });
	if (updated.length === 0) fail(404, 'Passkey not found');
	return { id, name };
}

/** The password always stays, so deleting the last passkey can't lock anyone out. */
export async function deletePasskey(accountId: number, id: string) {
	if (!isCredentialId(id)) fail(404, 'Passkey not found');
	const deleted = await db
		.delete(passkeys)
		.where(and(eq(passkeys.id, id), eq(passkeys.user_id, accountId)))
		.returning({ id: passkeys.id });
	if (deleted.length === 0) fail(404, 'Passkey not found');
}

const MAX_REGISTER_PER_ACCOUNT = 30;

/** Starts registering a passkey for the account. */
export async function registrationOptions(accountId: number, cookies: Cookies, url: URL) {
	const key = `passkey:register:${accountId}`;
	if (isLimited(key, MAX_REGISTER_PER_ACCOUNT)) fail(429, 'Too many attempts, try again later.');
	hit(key, WINDOW_MS);

	const [account] = await db
		.select({ username: users.username, name: users.name })
		.from(users)
		.where(eq(users.id, accountId));
	if (!account) fail(401, 'You are not signed in.');
	const existing = await db
		.select({ id: passkeys.id, transports: passkeys.transports })
		.from(passkeys)
		.where(eq(passkeys.user_id, accountId));
	if (existing.length >= MAX_PASSKEYS) fail(400, `You can have up to ${MAX_PASSKEYS} passkeys.`);

	const { rpID, rpName } = relyingParty(url);
	const options = await generateRegistrationOptions({
		rpName,
		rpID,
		userID: userHandle(accountId),
		userName: account.username,
		userDisplayName: account.name,
		attestationType: 'none',
		// the authenticator refuses to make a second passkey for this account
		excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
		// discoverable, so signing in needs no username; verified, since it stands in for the password
		authenticatorSelection: { residentKey: 'required', userVerification: 'required' }
	});
	const challenge_id = saveChallenge(cookies, options.challenge, 'register', accountId);
	return { ...options, challenge_id };
}

/** Finishes registering a passkey: `{ challenge_id?, name?, response }`. */
export async function registerPasskey(
	accountId: number,
	cookies: Cookies,
	url: URL,
	body: Record<string, unknown>
) {
	const pending = takeChallenge(cookies, 'register', body.challenge_id);
	// the challenge was issued to this account, not to another one signed in on the same browser
	if (!pending || pending.accountId !== accountId) fail(400, 'The request expired, try again.');
	const name = parsePasskeyName(body.name);
	if (!name) fail(400, `Name must be at most ${PASSKEY_NAME_MAX} characters.`);

	const { origin, rpID } = relyingParty(url);
	let info;
	try {
		const result = await verifyRegistrationResponse({
			response: body.response as RegistrationResponseJSON,
			expectedChallenge: pending.challenge,
			expectedOrigin: origin,
			expectedRPID: rpID,
			requireUserVerification: true
		});
		if (!result.verified) throw new Error('not verified');
		info = result.registrationInfo;
	} catch {
		fail(400, 'The passkey could not be verified.');
	}

	if ((await db.$count(passkeys, eq(passkeys.user_id, accountId))) >= MAX_PASSKEYS)
		fail(400, `You can have up to ${MAX_PASSKEYS} passkeys.`);
	try {
		await db.insert(passkeys).values({
			id: info.credential.id,
			user_id: accountId,
			public_key: isoBase64URL.fromBuffer(info.credential.publicKey),
			counter: info.credential.counter,
			transports: info.credential.transports ?? [],
			name,
			backed_up: info.credentialBackedUp
		});
	} catch (e) {
		if (isUniqueViolation(e)) fail(400, 'This passkey is already registered.');
		throw e;
	}
	return { id: info.credential.id, name };
}

const MAX_OPTIONS_PER_IP = 100;
const MAX_LOGIN_FAILS_PER_IP = 30;
const FAILED = 'That passkey could not be verified.';

/** Starts a passkey sign-in. No allowCredentials: the device offers every passkey it has. */
export async function loginOptions(cookies: Cookies, url: URL, getClientAddress: () => string) {
	const ip = clientIp(getClientAddress);
	if (ip) {
		const key = `passkey:options:${ip}`;
		if (isLimited(key, MAX_OPTIONS_PER_IP))
			fail(429, 'Too many attempts, try again in 15 minutes.');
		hit(key, WINDOW_MS);
	}
	const options = await generateAuthenticationOptions({
		rpID: relyingParty(url).rpID,
		userVerification: 'required'
	});
	const challenge_id = saveChallenge(cookies, options.challenge, 'login', null);
	return { ...options, challenge_id };
}

/**
 * Verifies a passkey sign-in: `{ challenge_id?, response }`. Returns the account id. A failure
 * with `unknown: true` means the passkey was deleted here, so the device can forget it.
 */
export async function passkeyLogin(
	cookies: Cookies,
	url: URL,
	getClientAddress: () => string,
	body: Record<string, unknown>
) {
	const ip = clientIp(getClientAddress);
	const ipKey = ip ? `passkey:login:${ip}` : null;
	if (ipKey && isLimited(ipKey, MAX_LOGIN_FAILS_PER_IP))
		fail(429, 'Too many failed attempts, try again in 15 minutes.');
	const failed = (message: string, unknown = false): never => {
		if (ipKey) hit(ipKey, WINDOW_MS);
		throw unknown
			? (Response.json({ error: message, unknown: true }, { status: 400 }) as never)
			: new ApiError(400, message);
	};

	const pending = takeChallenge(cookies, 'login', body.challenge_id);
	if (!pending) failed('The request expired, try again.');
	// the browser library posts the response itself, other clients wrap it in `response`
	const response = (body.response ?? body) as AuthenticationResponseJSON;
	if (!isCredentialId(response?.id)) failed(FAILED);

	const [row] = await db
		.select({ passkey: passkeys, banned_at: users.banned_at, ban_reason: users.ban_reason })
		.from(passkeys)
		.innerJoin(users, eq(users.id, passkeys.user_id))
		.where(eq(passkeys.id, response.id));
	// `unknown` lets the browser hide a passkey that was deleted here but is still on the device
	if (!row) failed('This passkey is no longer registered.', true);

	const { passkey } = row;
	// the authenticator says which account it made the passkey for; it must be the owner
	const handle = response.response?.userHandle;
	if (handle && handle !== userHandleBase64(passkey.user_id)) failed(FAILED);

	const { origin, rpID } = relyingParty(url);
	let info;
	try {
		const result = await verifyAuthenticationResponse({
			response,
			expectedChallenge: pending!.challenge,
			expectedOrigin: origin,
			expectedRPID: rpID,
			requireUserVerification: true,
			credential: {
				id: passkey.id,
				publicKey: isoBase64URL.toBuffer(passkey.public_key),
				counter: passkey.counter,
				transports: passkey.transports
			}
		});
		if (!result.verified) throw new Error('not verified');
		info = result.authenticationInfo;
	} catch {
		return failed(FAILED);
	}

	await db
		.update(passkeys)
		.set({
			counter: info.newCounter,
			backed_up: info.credentialBackedUp,
			last_used_at: sql`NOW()`
		})
		.where(eq(passkeys.id, passkey.id));

	// only said once the passkey checked out, same as the password login
	if (row.banned_at) {
		const reason = row.ban_reason ? ` Reason: ${row.ban_reason}` : '';
		fail(403, `This account has been banned.${reason}`);
	}
	return passkey.user_id;
}
