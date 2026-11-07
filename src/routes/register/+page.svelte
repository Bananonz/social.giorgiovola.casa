<script lang="ts">
	import Button from '#lib/components/Button.svelte';
	import type { PageProps } from './$types';
	import { onMount } from 'svelte';
	import { api, messageOf } from '#lib/api.js';

	let { data }: PageProps = $props();

	let error = $state('');
	let busy = $state(false);
	// the form only works through the API, so a submit before hydration would post to nothing
	let hydrated = $state(false);
	onMount(() => (hydrated = true));

	async function register(e: SubmitEvent) {
		e.preventDefault();
		const form = new FormData(e.currentTarget as HTMLFormElement);
		busy = true;
		error = '';
		try {
			await api('auth/register', {
				method: 'POST',
				json: {
					signup_password: form.get('signupPassword'),
					email: form.get('email'),
					name: form.get('fullName'),
					username: form.get('username'),
					password: form.get('password'),
					session: 'cookie'
				}
			});
			// a full reload: the whole page belongs to the account now signed in
			location.href = '/';
		} catch (err) {
			error = messageOf(err, 'Something went wrong, try again.');
			busy = false;
		}
	}
</script>

{#if error}
	<p>{error}</p>
{/if}

{#if data.registrationOpen}
	<form method="POST" class="flex flex-col gap-5" onsubmit={register}>
		<input
			class="input"
			type="password"
			name="signupPassword"
			placeholder="Signup password"
			autocomplete="off"
			required
		/>
		<input class="input" type="email" name="email" placeholder="Email" maxlength="254" required />
		<input
			class="input"
			type="text"
			name="fullName"
			placeholder="Full name"
			maxlength="64"
			required
		/>
		<input
			class="input"
			type="text"
			name="username"
			placeholder="Username (a-z, 0-9, _)"
			pattern={'[a-zA-Z0-9_]{1,32}'}
			maxlength="32"
			required
		/>
		<input
			class="input"
			type="password"
			name="password"
			placeholder="Password (min. 8 characters)"
			minlength="8"
			maxlength="256"
			autocomplete="new-password"
			required
		/>
		<Button class="mt-2.5" size="lg" type="submit" disabled={busy || !hydrated}>Register</Button>
	</form>
{:else}
	<p>Registration is currently closed.</p>
{/if}
