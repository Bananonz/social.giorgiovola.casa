<script lang="ts">
	type Props = {
		/** share uploaded, 0 to 1; at 1 the ring spins while the server compresses the image */
		progress: number;
		/** width and height in px */
		size?: number;
	};

	let { progress, size = 28 }: Props = $props();

	const R = 10;
	const CIRCUMFERENCE = 2 * Math.PI * R;
	const processing = $derived(progress >= 1);
	// a small visible arc from the start, so a slow connection doesn't look stuck
	const shown = $derived(processing ? 0.25 : Math.max(0.05, progress));
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	role="progressbar"
	aria-label={processing ? 'Processing image' : 'Uploading image'}
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuenow={processing ? undefined : Math.round(progress * 100)}
	class={processing ? 'animate-spin' : ''}
>
	<circle cx="12" cy="12" r={R} stroke="#d9d9d9" stroke-opacity="0.25" stroke-width="2.5" />
	<circle
		cx="12"
		cy="12"
		r={R}
		stroke="#799a74"
		stroke-width="2.5"
		stroke-linecap="round"
		stroke-dasharray={CIRCUMFERENCE}
		stroke-dashoffset={CIRCUMFERENCE * (1 - shown)}
		transform="rotate(-90 12 12)"
		class="transition-[stroke-dashoffset] duration-200"
	/>
</svg>
