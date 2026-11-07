<script lang="ts">
	import Post from '#lib/components/Post.svelte';
	import type { Post as PostType } from '#lib/types.js';
	import { tick, untrack } from 'svelte';
	import { api, withCursor, type Page } from '#lib/api.js';
	import { snapshot } from '$app/navigation';
	import { onRealtime } from '#lib/realtime.js';

	type Props = {
		posts: PostType[];
		/** the API list `posts` is the first page of: the infinite scroll continues it */
		source?: string | null;
		/** the cursor of the next page, null when there is none */
		next?: string | null;
		loadReplies?: boolean;
		scrollToNew?: boolean;
		replies?: boolean;
		showThread?: boolean;
		showReplyTo?: boolean;
	};

	let {
		posts,
		source = null,
		next = null,
		loadReplies = false,
		scrollToNew = false,
		replies = false,
		showThread = false,
		showReplyTo = false
	}: Props = $props();

	/** The post at the top of the viewport and its distance from it, to come back to it. */
	type Anchor = { key: string; top: number };
	type Saved = {
		posts: PostType[];
		cursor: string | null;
		done: boolean;
		removed: number[];
		anchor: Anchor | null;
	};

	// pages loaded by the infinite scroll, kept apart from the parent's list so a realtime post
	// prepended there doesn't drop them
	let older: PostType[] = $state([]);
	let removed: number[] = $state([]);
	const shouldLoadMore = untrack(() => !!source);
	let cursor = untrack(() => next);
	let loading = $state(false);
	let done = $state(untrack(() => next === null));
	let listElement: HTMLDivElement;
	let sentinel: HTMLDivElement | undefined = $state();

	// a regiorg shows the same post again, so the regiorger is part of the identity
	const keyOf = (post: PostType) => `${post.id}:${post.regiorged_by?.username ?? ''}`;

	// pages overlap when posts arrive in the meantime: the first copy (the freshest) wins
	const list = $derived.by(() => {
		const seen = new Set<string>();
		return [...posts, ...older].filter((post) => {
			const key = keyOf(post);
			if (seen.has(key) || removed.includes(post.id)) return false;
			seen.add(key);
			return true;
		});
	});

	$effect(() =>
		onRealtime('post_deleted', ({ id }) => {
			if (list.some((p) => p.id === id)) removed.push(id);
		})
	);

	const handleDeletedPost = (id: number) => removed.push(id);

	// the open post's replies: follow new ones to the bottom, but not on the first render
	let alreadyScrolled = false;
	$effect(() => {
		void posts;
		if (!scrollToNew) return;
		untrack(async () => {
			if (!alreadyScrolled) {
				alreadyScrolled = true;
				return;
			}
			await tick();
			scroll({ top: listElement.scrollHeight, behavior: 'smooth' });
		});
	});

	async function loadMore() {
		if (loading || done) return;
		loading = true;
		try {
			const page = await api<Page<PostType>>(withCursor(source!, cursor!));
			older.push(...page.items);
			cursor = page.next_cursor;
			if (cursor === null) done = true;
		} catch {
			// tried again when the end of the list comes into view again
		} finally {
			loading = false;
		}
	}

	// load the next page when the end of the list comes near
	$effect(() => {
		if (!shouldLoadMore || !sentinel || done || loading) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) loadMore();
			},
			{ rootMargin: '0px 0px 400px 0px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	function postElements() {
		return listElement.querySelectorAll<HTMLElement>(':scope > [data-key]');
	}

	function captureAnchor(): Anchor | null {
		for (const element of postElements()) {
			const rect = element.getBoundingClientRect();
			if (rect.bottom > 0) return { key: element.dataset.key ?? '', top: rect.top };
		}
		return null;
	}

	function scrollToAnchor(anchor: Anchor) {
		const element = [...postElements()].find((e) => e.dataset.key === anchor.key);
		if (element) scrollBy(0, element.getBoundingClientRect().top - anchor.top);
	}

	// keeps the anchored post in place while images and embeds above it load, until the
	// viewer scrolls by themselves
	function holdAnchor(anchor: Anchor) {
		scrollToAnchor(anchor);
		const resize = new ResizeObserver(() => scrollToAnchor(anchor));
		resize.observe(listElement);
		const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
		const stop = () => {
			resize.disconnect();
			clearTimeout(timeout);
			events.forEach((e) => removeEventListener(e, stop));
		};
		const timeout = setTimeout(stop, 3000);
		events.forEach((e) => addEventListener(e, stop, { passive: true }));
	}

	// back from a post: the server only sends the first page again, so bring back the pages
	// loaded before and the post that was at the top of the screen (the prop never changes on a
	// mounted list)
	if (shouldLoadMore)
		snapshot<Saved>({
			id: 'timeline',
			capture: () => ({
				posts: $state.snapshot(list),
				cursor,
				done,
				removed: $state.snapshot(removed),
				anchor: captureAnchor()
			}),
			restore: async (saved) => {
				older = saved.posts;
				cursor = saved.cursor;
				done = saved.done;
				removed = saved.removed;
				if (!saved.anchor) return;
				await tick();
				holdAnchor(saved.anchor);
			}
		});
</script>

<div class="flex flex-col" bind:this={listElement} data-replies={replies}>
	{#each list as post (keyOf(post))}
		<div data-key={keyOf(post)}>
			<Post onpostdeleted={handleDeletedPost} {loadReplies} {post} {showThread} {showReplyTo} />
		</div>
	{/each}
</div>
{#if shouldLoadMore && !done}
	<div bind:this={sentinel}>
		{#if loading}Loading...{/if}
	</div>
{/if}
