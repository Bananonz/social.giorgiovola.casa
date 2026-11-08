<script lang="ts">
	import { page } from '$app/state';
	import Button from '#lib/components/Button.svelte';
	import ConversationList from '#lib/components/ConversationList.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let list = $state<ReturnType<typeof ConversationList>>();

	const chat = $derived(
		page.route.id === '/messages/[username]' || page.route.id === '/messages/groups/[id]'
	);
	const index = $derived(page.route.id === '/messages');
</script>

{#if (chat || index) && data.conversations && data.groups}
	<!-- wide screens keep the list beside the open chat (or an empty one); narrow ones show only
		the list on the index and only the chat in a chat. The list reaches 10px past the column on
		both sides (room for its rows' hover background), so alone it is 20px wider than the column -->
	<div class="flex gap-5">
		<aside
			class="-ml-2.5 min-w-0 shrink-0 px-2.5 {chat
				? 'hidden h-[calc(100dvh-120px)] w-85 overflow-y-auto overscroll-contain lg:block'
				: 'w-[calc(100%+20px)] lg:h-[calc(100dvh-120px)] lg:w-85 lg:overflow-y-auto lg:overscroll-contain'}"
		>
			<ConversationList bind:this={list} conversations={data.conversations} groups={data.groups} />
		</aside>
		{#if index}
			<div
				class="hidden h-[calc(100dvh-120px)] min-w-0 flex-1 flex-col items-center justify-center gap-2.5 text-center lg:flex"
			>
				<svg
					class="mb-2.5 size-12"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="#d9d9d9"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z" /></svg
				>
				<h2 class="text-[1.3em] font-extrabold">Start Conversation</h2>
				<p class="text-muted">
					Choose from your existing conversations,<br />or start a new one.
				</p>
				<Button class="mt-2.5" onclick={() => list?.focusSearch()}>New chat</Button>
			</div>
		{:else}
			<div class="min-w-0 flex-1">
				{@render children()}
			</div>
		{/if}
	</div>
{:else}
	{@render children()}
{/if}
