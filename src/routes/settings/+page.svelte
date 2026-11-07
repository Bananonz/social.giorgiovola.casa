<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import Button from '#lib/components/Button.svelte';
	import { page } from '$app/state';
	import type { PageProps } from './$types';
	import { invalidateAll } from '$app/navigation';
	import {
		WebAuthnError,
		browserSupportsWebAuthn,
		sendSignal,
		startRegistration
	} from '@simplewebauthn/browser';
	import { onMount } from 'svelte';
	import { api, messageOf } from '#lib/api.js';

	let { data }: PageProps = $props();

	const sectionClass = 'mb-10 flex flex-col gap-3';
	const hintClass = 'text-[0.85em] text-muted';

	let supported = $state(true);
	let busy = $state(false);
	let error = $state('');
	let newName = $state('');
	let renaming = $state<string | null>(null);

	const canAdd = $derived(data.passkeys.length < data.maxPasskeys);
	const canAddBot = $derived(data.bots.length < data.maxBots);
	// only in the response that created it: a token is never shown again
	let newToken = $state<{ label: string; token: string; bot: boolean } | null>(null);
	let copied = $state(false);
	// the bot whose profile form is open
	let editingBot = $state<number | null>(null);

	/** Runs an API call, then reloads the page's data; failures show at the top. */
	async function run(action: () => Promise<unknown>) {
		busy = true;
		error = '';
		try {
			await action();
			await invalidateAll();
			return true;
		} catch (e) {
			error = messageOf(e, 'Something went wrong, try again.');
			return false;
		} finally {
			busy = false;
		}
	}

	async function copyToken(token: string) {
		await navigator.clipboard.writeText(token);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	onMount(() => {
		supported = browserSupportsWebAuthn();
	});

	// tells the password manager which passkeys are still accepted, so deleted ones go away there too
	$effect(() => {
		if (!supported) return;
		sendSignal({
			signalName: 'allAcceptedCredentials',
			rpID: data.rpID,
			userID: data.userHandle,
			allAcceptedCredentialIDs: data.passkeys.map((p) => p.id)
		}).catch(() => null);
	});

	const date = (d: Date | string) =>
		new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

	async function addPasskey(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			const { challenge_id, ...optionsJSON } = await api<
				Parameters<typeof startRegistration>[0]['optionsJSON'] & { challenge_id: string }
			>('me/passkeys/options', { method: 'POST' });
			let response;
			try {
				response = await startRegistration({ optionsJSON });
			} catch (err) {
				if (
					err instanceof WebAuthnError &&
					err.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'
				)
					throw new Error('This device already has a passkey for your account.');
				// cancelled by the user, or timed out: nothing to report
				if (err instanceof Error && err.name === 'NotAllowedError') return;
				throw err;
			}
			await api('me/passkeys', {
				method: 'POST',
				json: { challenge_id, name: newName, response }
			});
			newName = '';
			await invalidateAll();
		} catch (err) {
			error = messageOf(err, 'Something went wrong, try again.');
		} finally {
			busy = false;
		}
	}

	async function renamePasskey(e: SubmitEvent, id: string) {
		e.preventDefault();
		const name = new FormData(e.currentTarget as HTMLFormElement).get('name');
		if (await run(() => api(`me/passkeys/${id}`, { method: 'PATCH', json: { name } })))
			renaming = null;
	}

	function deletePasskey(id: string, name: string) {
		if (confirm(`Delete the passkey "${name}"? You won't be able to sign in with it anymore.`))
			run(() => api(`me/passkeys/${id}`, { method: 'DELETE' }));
	}

	async function createBot(e: SubmitEvent) {
		e.preventDefault();
		const form = e.currentTarget as HTMLFormElement;
		const fields = new FormData(form);
		let created: { username: string; token: string } | undefined;
		const ok = await run(async () => {
			created = await api('me/bots', {
				method: 'POST',
				json: { name: fields.get('name'), username: fields.get('username') }
			});
		});
		if (ok && created) {
			newToken = { label: `@${created.username}`, token: created.token, bot: true };
			form.reset();
		}
	}

	async function regenerateToken(username: string) {
		if (!confirm(`Regenerate the token of @${username}? The current one stops working right away.`))
			return;
		let created: { username: string; token: string } | undefined;
		if (
			await run(async () => (created = await api(`me/bots/${username}/token`, { method: 'POST' })))
		)
			newToken = { label: `@${created!.username}`, token: created!.token, bot: true };
	}

	function deleteBot(username: string) {
		if (confirm(`Delete @${username} and all of its posts? This can't be undone.`))
			run(() => api(`me/bots/${username}`, { method: 'DELETE' }));
	}

	// keeps the form open when the server refuses the changes, so they can be fixed
	async function saveBot(e: SubmitEvent, username: string) {
		e.preventDefault();
		const form = new FormData(e.currentTarget as HTMLFormElement);
		const avatar = form.get('avatar');
		const ok = await run(async () => {
			await api(`me/bots/${username}`, {
				method: 'PATCH',
				json: {
					name: form.get('name'),
					username: form.get('username'),
					bio: form.get('bio'),
					website: form.get('website')
				}
			});
			// the username may just have changed
			const current = String(form.get('username') ?? username)
				.trim()
				.replace(/^@/, '')
				.toLowerCase();
			if (avatar instanceof File && avatar.size > 0) {
				const upload = new FormData();
				upload.set('avatar', avatar);
				await api(`me/bots/${current}/avatar`, { method: 'PUT', body: upload });
			} else if (form.get('removeAvatar')) {
				await api(`me/bots/${current}/avatar`, { method: 'DELETE' });
			}
		});
		if (ok) editingBot = null;
	}

	const kindLabel = { cookie: 'Browser', token: 'App', personal: 'Personal access token' };

	function revokeSession(id: number, current: boolean) {
		const message = current
			? 'Sign out of this browser?'
			: 'Revoke this session? It is signed out right away.';
		if (!confirm(message)) return;
		run(() => api(`auth/sessions/${id}`, { method: 'DELETE' })).then((ok) => {
			if (ok && current) location.href = '/';
		});
	}

	async function createPersonalToken(e: SubmitEvent) {
		e.preventDefault();
		const form = e.currentTarget as HTMLFormElement;
		const fields = new FormData(form);
		const days = String(fields.get('days'));
		let created: { name: string; token: string } | undefined;
		const ok = await run(async () => {
			created = await api('auth/tokens', {
				method: 'POST',
				json: { name: fields.get('name'), expires_in_days: days === 'never' ? null : Number(days) }
			});
		});
		if (ok && created) {
			newToken = { label: created.name, token: created.token, bot: false };
			form.reset();
		}
	}
</script>

<svelte:head>
	<title>Settings</title>
</svelte:head>

{#if error}
	<p class="mb-5 rounded-[5px] bg-danger p-[5px]">{error}</p>
{/if}

{#if newToken}
	<div class="mb-10 flex flex-col gap-2.5 rounded-[10px] bg-black/70 p-2.5">
		<p>
			Token for <b>{newToken.label}</b>. Copy it now: you won't be able to see it again.
		</p>
		<code class="break-all select-all">{newToken.token}</code>
		<div class="flex items-center gap-2.5">
			<Button size="sm" onclick={() => copyToken(newToken!.token)}>
				{copied ? 'Copied' : 'Copy token'}
			</Button>
		</div>
		<p class={hintClass}>
			Try it: <code class="break-all"
				>curl -H "Authorization: Bearer {newToken.token}" {page.url.origin}{newToken.bot
					? '/api/bot/me'
					: '/api/v1/me'}</code
			>
		</p>
	</div>
{/if}

<section class={sectionClass}>
	<h2>Passkeys</h2>
	<p class={hintClass}>
		Passkeys let you sign in to <b>@{data.account}</b> with your fingerprint, face, screen lock or a
		security key instead of typing your password. They are optional: your password keeps working either
		way.
	</p>

	{#if data.passkeys.length > 0}
		<ul class="flex flex-col gap-2">
			{#each data.passkeys as passkey (passkey.id)}
				<li class="flex items-center gap-2.5 rounded-md border border-line p-2">
					{#if renaming === passkey.id}
						<form
							method="POST"
							class="flex flex-1 items-center gap-1.5"
							onsubmit={(e) => renamePasskey(e, passkey.id)}
						>
							<!-- svelte-ignore a11y_autofocus -->
							<input
								class="input flex-1"
								type="text"
								name="name"
								value={passkey.name}
								maxlength="64"
								aria-label="Passkey name"
								autofocus
							/>
							<Button type="submit" disabled={busy}>Save</Button>
							<Button type="button" onclick={() => (renaming = null)}>Cancel</Button>
						</form>
					{:else}
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="truncate font-bold">{passkey.name}</span>
							<span class="text-[0.8em] text-muted">
								Added {date(passkey.created_at)} · {passkey.last_used_at
									? `last used ${date(passkey.last_used_at)}`
									: 'never used'}{passkey.backed_up ? ' · synced' : ''}
							</span>
						</div>
						<div class="flex items-center gap-1.5">
							<Button type="button" onclick={() => (renaming = passkey.id)}>Rename</Button>
							<Button
								variant="danger"
								disabled={busy}
								onclick={() => deletePasskey(passkey.id, passkey.name)}>Delete</Button
							>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class={hintClass}>You have no passkeys yet.</p>
	{/if}

	{#if !supported}
		<p class={hintClass}>This browser doesn't support passkeys.</p>
	{:else if canAdd}
		<form class="mt-2.5 flex flex-col gap-3" onsubmit={addPasskey}>
			<h3>Add a passkey</h3>
			<input
				class="input"
				type="text"
				bind:value={newName}
				placeholder="Name (e.g. My phone)"
				maxlength="64"
				aria-label="Passkey name"
			/>
			<Button class="self-start" type="submit" disabled={busy}>
				{busy ? 'Waiting for your device…' : 'Add passkey'}
			</Button>
		</form>
	{:else}
		<p class={hintClass}>You reached the limit of {data.maxPasskeys} passkeys.</p>
	{/if}
</section>

<section class={sectionClass}>
	<h2>OAuth</h2>
	<p class={hintClass}>
		Bots are profiles you drive from your own code through the bot API: they can post, reply, like,
		follow people, send direct messages and track their mentions and the posts of who they follow.
		Every bot has a secret token; send it as <code>Authorization: Bearer &lt;token&gt;</code>. The
		full API guide, written so you can hand it to an AI agent, is at
		<a href="/api.txt">/api.txt</a>; the developer documentation is at
		<a href="/developers">/developers</a>.
	</p>

	{#if data.bots.length > 0}
		<ul class="flex flex-col gap-2">
			{#each data.bots as bot (bot.id)}
				<li class="flex flex-col gap-2.5 rounded-md border border-line p-2">
					<div class="flex items-center gap-2.5">
						<Avatar size={45} user={bot} />
						<div class="flex min-w-0 flex-1 flex-col">
							<a class="truncate font-bold text-inherit" href="/@{bot.username}">
								{bot.name} <span class="opacity-80">@{bot.username}</span>
							</a>
							<span class="text-[0.8em] text-muted">
								Created {date(bot.created_at)} · {bot.last_used_at
									? `last used ${date(bot.last_used_at)}`
									: 'never used'}
							</span>
						</div>
						<div class="flex items-center gap-1.5">
							<Button
								onclick={() => (editingBot = editingBot === bot.id ? null : bot.id)}
								aria-expanded={editingBot === bot.id}
							>
								Edit
							</Button>
							<Button disabled={busy} onclick={() => regenerateToken(bot.username)}
								>New token</Button
							>
							<Button variant="danger" disabled={busy} onclick={() => deleteBot(bot.username)}
								>Delete</Button
							>
						</div>
					</div>
					{#if editingBot === bot.id}
						<form
							class="flex flex-col gap-2.5"
							method="POST"
							onsubmit={(e) => saveBot(e, bot.username)}
						>
							<div class="flex flex-col">
								<label class="text-[0.8em] opacity-80" for="bot-avatar-{bot.id}">Picture</label>
								<input
									class="border-b border-line outline-none file:mr-1 file:cursor-pointer file:rounded-sm file:border file:border-line file:px-1.5"
									id="bot-avatar-{bot.id}"
									name="avatar"
									type="file"
									accept="image/*"
								/>
							</div>
							{#if bot.avatar}
								<label class="flex items-center gap-1.5 text-[0.85em]">
									<input type="checkbox" name="removeAvatar" value="1" />
									Remove the current picture
								</label>
							{/if}
							<div class="flex flex-col">
								<label class="text-[0.8em] opacity-80" for="bot-name-{bot.id}">Name</label>
								<input
									class="border-b border-line outline-none"
									id="bot-name-{bot.id}"
									name="name"
									type="text"
									maxlength="64"
									value={bot.name}
									required
								/>
							</div>
							<div class="flex flex-col">
								<label class="text-[0.8em] opacity-80" for="bot-username-{bot.id}">Username</label>
								<input
									class="border-b border-line outline-none"
									id="bot-username-{bot.id}"
									name="username"
									type="text"
									maxlength="32"
									value={bot.username}
									autocapitalize="none"
									autocomplete="off"
									required
								/>
							</div>
							<div class="flex flex-col">
								<label class="text-[0.8em] opacity-80" for="bot-bio-{bot.id}">Bio</label>
								<!-- prettier 2 would self-close it -->
								<!-- prettier-ignore -->
								<textarea
									class="resize-none border-b border-line outline-none"
									id="bot-bio-{bot.id}"
									name="bio"
									rows="3"
									maxlength="160"
									placeholder="What this bot does"
									value={bot.bio}
								></textarea>
							</div>
							<div class="flex flex-col">
								<label class="text-[0.8em] opacity-80" for="bot-website-{bot.id}">Website</label>
								<input
									class="border-b border-line outline-none"
									id="bot-website-{bot.id}"
									name="website"
									type="text"
									inputmode="url"
									maxlength="200"
									placeholder="github.com/you/your-bot"
									value={bot.website}
								/>
							</div>
							<div class="flex items-center gap-1.5">
								<Button type="submit" disabled={busy}>Save</Button>
								<Button onclick={() => (editingBot = null)}>Cancel</Button>
							</div>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class={hintClass}>You have no bots yet.</p>
	{/if}

	{#if canAddBot}
		<form class="mt-2.5 flex flex-col gap-3" method="POST" onsubmit={createBot}>
			<h3>Create a bot</h3>
			<input
				class="input"
				type="text"
				name="name"
				placeholder="Display name"
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
				autocapitalize="none"
				autocomplete="off"
				required
			/>
			<Button class="self-start" type="submit" disabled={busy}>Create bot</Button>
		</form>
	{:else}
		<p class={hintClass}>You reached the limit of {data.maxBots} bots.</p>
	{/if}
</section>

<section class={sectionClass}>
	<h2>Sessions and API tokens</h2>
	<p class={hintClass}>
		Everywhere <b>@{data.account}</b> is signed in: browsers, apps that signed in with your password
		or a passkey, and personal access tokens. A personal access token lets your own scripts and apps
		use the <a href="/api.txt">API</a> as you; send it as
		<code>Authorization: Bearer &lt;token&gt;</code>. Revoking signs it out right away.
	</p>

	<ul class="flex flex-col gap-2">
		{#each data.sessions as session (session.id)}
			<li
				class="flex items-center gap-2.5 rounded-md border p-2 {session.current
					? 'border-accent'
					: 'border-line'}"
			>
				<div class="flex min-w-0 flex-1 flex-col">
					<span class="truncate font-bold">
						{session.name || kindLabel[session.kind]}
						{#if session.current}<span class="text-[0.8em] font-medium text-accent">· this one</span
							>{/if}
					</span>
					<span class="truncate text-[0.8em] text-muted">
						{kindLabel[session.kind]} · signed in {date(session.created_at)} · {session.last_used_at
							? `last used ${date(session.last_used_at)}`
							: 'never used'} · {session.expires_at
							? `expires ${date(session.expires_at)}`
							: 'never expires'}
					</span>
					{#if session.user_agent}
						<span class="truncate text-[0.75em] text-muted" title={session.user_agent}
							>{session.user_agent}</span
						>
					{/if}
				</div>
				<Button
					variant="danger"
					size="sm"
					disabled={busy}
					onclick={() => revokeSession(session.id, session.current)}
					>{session.current ? 'Sign out' : 'Revoke'}</Button
				>
			</li>
		{/each}
	</ul>

	<form class="mt-2.5 flex flex-col gap-3" method="POST" onsubmit={createPersonalToken}>
		<h3>New personal access token</h3>
		<input
			class="input"
			type="text"
			name="name"
			placeholder="Name (e.g. My script)"
			maxlength="64"
			required
		/>
		<label class="flex flex-col text-[0.8em] opacity-80">
			Expires
			<select
				class="border-b border-line bg-background p-2.5 text-[1.25em] outline-none"
				name="days"
			>
				<option value="30">in 30 days</option>
				<option value="90" selected>in 90 days</option>
				<option value="365">in a year</option>
				<option value="never">never</option>
			</select>
		</label>
		<Button class="self-start" type="submit" disabled={busy}>Create token</Button>
	</form>
</section>
