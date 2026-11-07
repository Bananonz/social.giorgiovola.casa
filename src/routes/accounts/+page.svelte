<script lang="ts">
	import Button from '#lib/components/Button.svelte';
	import type { PageProps } from './$types';
	import type { SwitcherAccount, SwitcherProfile } from '#lib/types.js';
	import Avatar from '#lib/components/Avatar.svelte';
	import UnreadBadges from '#lib/components/UnreadBadges.svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { api, messageOf } from '#lib/api.js';
	import { switchTo } from '#lib/accounts.js';

	let { data }: PageProps = $props();

	const sectionClass = 'mb-10 flex flex-col gap-3';
	const hintClass = 'text-[0.85em] text-muted';
	const rowClass = 'flex flex-col gap-2.5 rounded-md border p-2';

	let accounts = $derived(data.accounts as SwitcherAccount[]);
	let error = $state<string | null>(null);
	let busy = $state(false);
	let current = $derived(accounts.find((a) => a.active || a.identities.some((i) => i.active)));
	let others = $derived(accounts.filter((a) => a !== current));
	let owned = $derived(current?.identities.filter((i) => !i.sharedBy).length ?? 0);
	let canCreate = $derived(!!current && owned < data.maxIdentities);
	// a failed share keeps its form open with what was typed
	let shareError = $state<{ id: number; error: string } | null>(null);
	let shareOpen = $state<number | null>(null);

	const membersOf = (profile: SwitcherProfile) =>
		data.owned.find((o) => o.username === profile.username)?.members ?? [];

	/** Runs an API call; the page reloads its data afterwards, or shows the error. */
	async function run(action: () => Promise<unknown>) {
		busy = true;
		error = null;
		try {
			await action();
			await invalidateAll();
		} catch (e) {
			error = messageOf(e);
		} finally {
			busy = false;
		}
	}

	function deleteIdentity(profile: SwitcherProfile) {
		const ok = confirm(
			`Delete @${profile.username}? Its posts, likes and notifications will be deleted too. This can't be undone.`
		);
		if (ok) run(() => api(`me/identities/${profile.username}`, { method: 'DELETE' }));
	}

	function leave(profile: SwitcherProfile) {
		const ok = confirm(
			`Stop using @${profile.username}? You will need @${profile.sharedBy} to share it again.`
		);
		if (ok) run(() => api(`me/identities/${profile.username}/leave`, { method: 'POST' }));
	}

	function unshare(profile: SwitcherProfile, username: string) {
		if (confirm(`Stop sharing @${profile.username} with @${username}?`))
			run(() => api(`me/identities/${profile.username}/members/${username}`, { method: 'DELETE' }));
	}

	async function share(e: SubmitEvent, profile: SwitcherProfile) {
		e.preventDefault();
		const form = e.currentTarget as HTMLFormElement;
		const username = String(new FormData(form).get('username') ?? '');
		busy = true;
		try {
			await api(`me/identities/${profile.username}/members`, {
				method: 'POST',
				json: { username }
			});
			shareError = null;
			form.reset();
			await invalidateAll();
		} catch (err) {
			shareError = { id: profile.id, error: messageOf(err) };
		} finally {
			busy = false;
		}
	}

	async function create(e: SubmitEvent) {
		e.preventDefault();
		const form = new FormData(e.currentTarget as HTMLFormElement);
		busy = true;
		error = null;
		try {
			const identity = await api<{ username: string }>('me/identities', {
				method: 'POST',
				json: { name: form.get('fullName'), username: form.get('username') }
			});
			await switchTo(identity.username, `/@${identity.username}`);
		} catch (err) {
			error = messageOf(err);
			busy = false;
		}
	}

	async function switchProfile(username: string, redirectTo: string) {
		busy = true;
		try {
			await switchTo(username, redirectTo);
		} catch (err) {
			error = messageOf(err);
			busy = false;
		}
	}
</script>

{#if error}
	<p class="mb-5 rounded-[5px] bg-danger p-[5px]">{error}</p>
{/if}

{#if current}
	<section class={sectionClass}>
		<h2>Identities</h2>
		<p class={hintClass}>
			Identities are extra profiles of <b>@{current.username}</b>: they post, like and get
			notifications on their own, but have no email or password. Nobody can see they belong to you,
			except the accounts you share one with: those can switch to it and use it too.
		</p>

		<ul class="flex flex-col gap-2">
			{#each [current, ...current.identities] as profile (profile.id)}
				{@const members = membersOf(profile)}
				<li class="{rowClass} {profile.active ? 'border-accent' : 'border-line'}">
					<div class="flex items-center gap-2.5">
						<Avatar user={profile} size={40} />
						<div class="flex min-w-0 flex-1 flex-col">
							<a class="truncate font-bold text-foreground" href={'/@' + profile.username}
								>{profile.name}</a
							>
							<span class="truncate text-[0.8em] text-muted">
								@{profile.username}
								{#if profile === current}
									· account
								{:else if profile.sharedBy}
									· shared by @{profile.sharedBy}
								{:else if members.length > 0}
									· shared with {members.length}
								{/if}
							</span>
						</div>
						<UnreadBadges notifications={profile.unread} messages={profile.unreadMessages} />
						<div class="flex flex-wrap items-center justify-end gap-1.5">
							{#if profile.active}
								<span class="text-[0.8em] text-accent">in use</span>
							{:else}
								<Button
									size="sm"
									disabled={busy}
									onclick={() => switchProfile(profile.username, page.url.pathname)}>Switch</Button
								>
							{/if}
							{#if profile.sharedBy}
								<Button variant="danger" size="sm" disabled={busy} onclick={() => leave(profile)}
									>Leave</Button
								>
							{:else if profile !== current}
								<Button
									size="sm"
									variant={shareOpen === profile.id ? 'primary' : 'default'}
									aria-expanded={shareOpen === profile.id}
									onclick={() => (shareOpen = shareOpen === profile.id ? null : profile.id)}
									>Share</Button
								>
								<Button
									variant="danger"
									size="sm"
									disabled={busy}
									onclick={() => deleteIdentity(profile)}>Delete</Button
								>
							{/if}
						</div>
					</div>

					{#if shareOpen === profile.id}
						<div class="flex flex-col gap-2.5 border-t border-line pt-2.5">
							<p class={hintClass}>
								Accounts you share <b>@{profile.username}</b> with can switch to it, post, reply, send
								messages and edit its profile. Only you can delete it or change who it is shared with.
							</p>
							{#if members.length > 0}
								<ul class="flex flex-col gap-1.5">
									{#each members as member (member.username)}
										<li class="flex items-center gap-2.5">
											<Avatar user={member} size={24} />
											<a class="min-w-0 flex-1 truncate text-[0.9em]" href={'/@' + member.username}
												>{member.name} <span class="opacity-70">@{member.username}</span></a
											>
											<Button
												variant="danger"
												size="sm"
												disabled={busy}
												onclick={() => unshare(profile, member.username)}>Remove</Button
											>
										</li>
									{/each}
								</ul>
							{/if}
							{#if shareError?.id === profile.id}
								<p class="rounded-[5px] bg-danger p-[5px]">{shareError.error}</p>
							{/if}
							{#if members.length < data.maxMembers}
								<form
									method="POST"
									class="flex items-center gap-2.5"
									onsubmit={(e) => share(e, profile)}
								>
									<input
										class="input min-w-0 flex-1"
										type="text"
										name="username"
										placeholder="Username of an account"
										maxlength="33"
										autocomplete="off"
										required
									/>
									<Button type="submit" size="sm" disabled={busy}>Share</Button>
								</form>
							{:else}
								<p class={hintClass}>
									You can share an identity with at most {data.maxMembers} accounts.
								</p>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		{#if canCreate}
			<form method="POST" class="mt-2.5 flex flex-col gap-3" onsubmit={create}>
				<h3>New identity</h3>
				<input
					class="input"
					type="text"
					name="fullName"
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
					required
				/>
				<Button class="self-start" type="submit" disabled={busy}>Create and switch</Button>
			</form>
		{:else}
			<p class={hintClass}>You reached the limit of {data.maxIdentities} identities.</p>
		{/if}
	</section>
{/if}

<section class={sectionClass}>
	<h2>Other accounts</h2>
	{#if others.length > 0}
		<ul class="flex flex-col gap-2">
			{#each others as account (account.id)}
				{@const notifications =
					account.unread + account.identities.reduce((n, i) => n + i.unread, 0)}
				{@const messages =
					account.unreadMessages + account.identities.reduce((n, i) => n + i.unreadMessages, 0)}
				<li class="{rowClass} border-line">
					<div class="flex items-center gap-2.5">
						<Avatar user={account} size={40} />
						<div class="flex min-w-0 flex-1 flex-col">
							<a class="truncate font-bold text-foreground" href={'/@' + account.username}
								>{account.name}</a
							>
							<span class="text-[0.8em] text-muted">
								@{account.username}
								{#if account.identities.length > 0}
									· {account.identities.length}
									{account.identities.length === 1 ? 'identity' : 'identities'}
								{/if}
							</span>
						</div>
						<UnreadBadges {notifications} {messages} />
						<Button
							size="sm"
							disabled={busy}
							onclick={() => switchProfile(account.username, '/accounts')}>Switch</Button
						>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<p class={hintClass}>No other accounts are signed in on this browser.</p>
	{/if}
	<div class="flex flex-wrap gap-2.5">
		<Button href="/login">Sign in to another account</Button>
		<Button variant="danger" href="/logout">Log out</Button>
	</div>
</section>
