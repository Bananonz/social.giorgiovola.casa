<script lang="ts">
	import Button from '#lib/components/Button.svelte';
	import { onMount } from 'svelte';
	import { api, ApiError, messageOf } from '#lib/api.js';
	import {
		WebAuthnAbortService,
		browserSupportsWebAuthn,
		browserSupportsWebAuthnAutofill,
		sendSignal,
		startAuthentication
	} from '@simplewebauthn/browser';

	let error = $state('');
	let busy = $state(false);
	let passkeys = $state(false);
	let passkeyBusy = $state(false);
	let passkeyError = $state('');

	// a full reload: the realtime stream and the whole page belong to the account signed in
	const signedIn = () => (location.href = '/');

	async function signIn(e: SubmitEvent) {
		e.preventDefault();
		const form = new FormData(e.currentTarget as HTMLFormElement);
		busy = true;
		error = '';
		try {
			await api('auth/login', {
				method: 'POST',
				json: {
					username: form.get('username'),
					password: form.get('password'),
					// the web UI signs in with the session cookie, other clients get a token
					session: 'cookie'
				}
			});
			signedIn();
		} catch (err) {
			error = messageOf(err, 'Something went wrong, try again.');
			busy = false;
		}
	}

	onMount(() => {
		passkeys = browserSupportsWebAuthn();
		// offer saved passkeys in the username field's autofill, without a click
		browserSupportsWebAuthnAutofill().then((ok) => {
			if (ok) signInWithPasskey(true);
		});
		return () => WebAuthnAbortService.cancelCeremony();
	});

	async function signInWithPasskey(autofill = false) {
		if (!autofill) {
			passkeyBusy = true;
			passkeyError = '';
		}
		try {
			const { challenge_id, ...optionsJSON } = await api<
				Parameters<typeof startAuthentication>[0]['optionsJSON'] & { challenge_id: string }
			>('auth/passkeys/options', { method: 'POST' });

			let response;
			try {
				response = await startAuthentication({
					optionsJSON,
					useBrowserAutofill: autofill
				});
			} catch (err) {
				// cancelled, timed out, or replaced by another ceremony (the button aborts the autofill one)
				if (err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError'))
					return;
				throw err;
			}

			passkeyBusy = true;
			try {
				await api('auth/passkeys/login', {
					method: 'POST',
					json: { challenge_id, response, session: 'cookie' }
				});
			} catch (err) {
				// deleted here but still on the device: let the device forget it
				if (err instanceof ApiError && err.body.unknown && optionsJSON.rpId)
					sendSignal({
						signalName: 'unknownCredential',
						rpID: optionsJSON.rpId,
						credentialID: response.id
					}).catch(() => null);
				throw err;
			}
			signedIn();
		} catch (err) {
			passkeyError =
				err instanceof Error && err.message ? err.message : 'Something went wrong, try again.';
			passkeyBusy = false;
		}
	}
</script>

{#if error || passkeyError}
	<p>{error || passkeyError}</p>
{/if}

<div class="mb-2.5 rounded-[5px] bg-black/70 p-2 text-[0.8rem]">
	<p>New here? <a href="/register">Register!</a></p>
</div>
<form method="POST" class="flex flex-col gap-5" onsubmit={signIn}>
	<input
		type="text"
		class="input"
		name="username"
		placeholder="Username or Email"
		autocomplete="username webauthn"
		required
	/>
	<input
		type="password"
		class="input"
		name="password"
		placeholder="Password"
		autocomplete="current-password"
		required
	/>
	<Button class="mt-2.5" size="lg" type="submit" disabled={busy}>Login</Button>
</form>
{#if passkeys}
	<Button class="mt-5 w-full" size="lg" disabled={passkeyBusy} onclick={() => signInWithPasskey()}>
		{passkeyBusy ? 'Waiting for your passkey…' : 'Sign in with a passkey'}
	</Button>
{/if}
