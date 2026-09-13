/** CSS-pixel layout; changing the viewport only moves/scales prepared glyphs. */
export function getHeroResponsiveLayout(width, height) {
	const landscape = width <= 1024 && height < 480 && width > height;
	const compact = width <= 768 || landscape;
	const short = height < 600;
	const titleScale = Math.min(1, (width - (compact ? 40 : width <= 1024 ? 80 : 240)) / 540,
		short ? Math.max(.48, (height - 130) / 430) : 1);
	return { compact, landscape, titleScale: landscape ? .4 : Math.max(.4, titleScale),
		textScale: landscape ? .62 : compact ? Math.min(.86, (width - 40) / 390) : short ? .82 : 1,
		top: landscape ? 64 : compact ? (short ? 76 : 108) : short ? 92 : null,
		gap: landscape ? 8 : compact || short ? 14 : null };
}
