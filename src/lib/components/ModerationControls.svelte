<script lang="ts">
	import Button from '#lib/components/Button.svelte';
	import { invalidateAll } from '$app/navigation';
	import { messageOf } from '#lib/api.js';
	import { moderate, type ModerationAction } from '#lib/moderation.js';

	type Props = {
		username: string;
		banned: boolean;
		muted: boolean;
		banReason: string | null;
		muteReason: string | null;
		identity: boolean;
	};

	let { username, banned, muted, banReason, muteReason, identity }: Props = $props();

	let message = $state<string | null>(null);
	let failed = $state(false);
	let busy = $state(false);

	// shows the outcome of the last action, the profile reloads with the new state
	const act = (action: ModerationAction, ask?: string) => async (e: SubmitEvent) => {
		e.preventDefault();
		if (ask && !confirm(ask)) return;
		const reason = String(new FormData(e.currentTarget as HTMLFormElement).get('reason') ?? '');
		busy = true;
		try {
			message = (await moderate(username, action, { reason })).message;
			failed = false;
			await invalidateAll();
		} catch (err) {
			message = messageOf(err);
			failed = true;
		} finally {
			busy = false;
		}
	};
</script>

<div class="mb-5 flex flex-col gap-2 rounded-md border border-line p-2.5">
	<div class="flex items-center justify-between gap-2.5">
		<b class="text-[0.9em]">Moderation</b>
		<a class="text-[0.85em]" href="/admin">Panel</a>
	</div>
	{#if identity}
		<p class="text-[0.8em] text-muted">
			This profile is an identity: actions apply to the whole account behind it.
		</p>
	{/if}
	{#if banned}
		<p class="text-[0.85em] text-danger">Banned{banReason ? `: ${banReason}` : ''}</p>
	{/if}
	{#if muted}
		<p class="text-[0.85em] text-danger">Muted{muteReason ? `: ${muteReason}` : ''}</p>
	{/if}
	{#if message}
		<p class="rounded-[5px] p-[5px] {failed ? 'bg-danger' : 'bg-accent text-background'}">
			{message}
		</p>
	{/if}

	<div class="flex flex-wrap items-center gap-2">
		{#if banned}
			<form method="POST" onsubmit={act('unban')}>
				<Button type="submit" disabled={busy}>Unban</Button>
			</form>
		{:else}
			<form
				class="flex flex-wrap items-center gap-2"
				method="POST"
				onsubmit={act('ban', `Ban @${username}? They will be signed out everywhere.`)}
			>
				<input
					class="input w-auto! min-w-0 flex-1 p-[5px]!"
					type="text"
					name="reason"
					placeholder="Ban reason (optional)"
					maxlength="200"
				/>
				<Button variant="danger" type="submit">Ban</Button>
			</form>
		{/if}
		{#if muted}
			<form method="POST" onsubmit={act('unmute')}>
				<Button type="submit" disabled={busy}>Unmute</Button>
			</form>
		{:else}
			<form class="flex flex-wrap items-center gap-2" method="POST" onsubmit={act('mute')}>
				<input
					class="input w-auto! min-w-0 flex-1 p-[5px]!"
					type="text"
					name="reason"
					placeholder="Mute reason (optional)"
					maxlength="200"
				/>
				<Button type="submit">Mute</Button>
			</form>
		{/if}
	</div>
</div>
