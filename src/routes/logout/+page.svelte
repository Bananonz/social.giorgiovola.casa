<script lang="ts">
	import Button from '#lib/components/Button.svelte';
	import { page } from '$app/state';
	import type { SwitcherAccount } from '#lib/types.js';
	import { api } from '#lib/api.js';

	const accounts = () => (page.data.accounts ?? []) as SwitcherAccount[];
	const current = () => accounts().find((a) => a.active || a.identities.some((i) => i.active));

	let busy = $state(false);

	async function logout(all: boolean) {
		busy = true;
		try {
			await api('auth/logout', { method: 'POST', json: { all } });
		} catch {
			// signed out already
		}
		// a full reload: the next signed in account (if any) takes over the page and its stream
		location.href = '/';
	}
</script>

<div class="flex flex-col items-start gap-2.5">
	{#each [current()].filter((a) => !!a) as account}
		<p>
			Do you want to log out of <b>@{account.username}</b>{#if account.identities.length > 0}
				&nbsp;and its identities{/if}?
		</p>
		<div class="flex flex-wrap gap-2.5">
			<Button disabled={busy} onclick={() => logout(false)}>Log out @{account.username}</Button>
			{#if accounts().length > 1}
				<Button variant="danger" disabled={busy} onclick={() => logout(true)}
					>Log out of all accounts</Button
				>
			{/if}
		</div>
	{:else}
		<p>You are not logged in.</p>
	{/each}
</div>
