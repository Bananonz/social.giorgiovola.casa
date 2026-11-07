<script lang="ts">
	import Post from '#lib/components/Post.svelte';
	import type { Post as PostType } from '#lib/types.js';
	import type { PageProps } from './$types';
	import Posts from '#lib/components/Posts.svelte';
	import PostComposer from '#lib/components/PostComposer.svelte';
	import { user } from '#lib/store.js';
	import LoadingScreen from '#lib/components/LoadingScreen.svelte';
	import { onRealtime } from '#lib/realtime.js';

	let { data }: PageProps = $props();

	let replies: PostType[] = $state([]);
	let loaded = $state(false);

	// the streamed replies of the open post: navigating to another post starts over
	$effect(() => {
		const pending = data.streamed.replies;
		let current = true;
		loaded = false;
		replies = [];
		pending.then((list) => {
			if (!current) return;
			replies = list;
			loaded = true;
		});
		return () => (current = false);
	});

	$effect(() =>
		onRealtime('post', (post) => {
			if (post.reply_to?.id !== data.post.id || replies.some((r) => r.id === post.id)) return;
			replies = [...replies, post];
		})
	);

	function onCreated(post: PostType) {
		if (!replies.some((r) => r.id === post.id)) replies = [...replies, post];
	}
</script>

<Post post={data.post} showReplyTo={true} isPostOpen={true} loadReplies={false} />

{#if !loaded}
	<div class="mt-5 flex items-center justify-center">
		<LoadingScreen size={64} />
	</div>
{:else}
	<div class="mt-5">
		{#if $user}
			<PostComposer replyTo={data.post.id} oncreated={onCreated} />
		{/if}
		<Posts scrollToNew={true} loadReplies={true} replies={true} posts={replies} />
	</div>
{/if}
