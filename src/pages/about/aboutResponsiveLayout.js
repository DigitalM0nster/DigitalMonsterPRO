export const ABOUT_COMPACT_QUERY = "(max-width: 1024px), (max-height: 600px)";

/** Shared CSS-pixel safe areas for the prepared headline and the reading control. */
export function resolveAboutResponsiveLayout(width, height) {
	if (width > 1024 && height > 600) return null;
	const short = height < 480;
	const dock = width <= 1024;
	const portrait = height > width * 0.9;
	const top = short ? 66 : 84;
	const bottom = dock ? (short ? 50 : 64) : 28;
	const x = dock ? 20 : Math.max(144, (width - 1280) * 0.5 + 100);
	const textWidth = portrait ? width - x * 2 : Math.min(460, width * 0.43 - (dock ? 20 : 44));
	const actionY = height - bottom - 56;
	// Keep the portrait headline and object together, including short phones.
	const portraitTextHeight = width < 480 ? 152 : 132;
	const modelHeight = portrait ? Math.min(width * 0.9, Math.max(180, actionY - top - portraitTextHeight - 12)) : Math.max(180, height - top - bottom + 44);
	const groupTop = portrait ? Math.max(top, (top + actionY - portraitTextHeight - 12 - modelHeight) * 0.5) : top;
	const modelTop = groupTop + portraitTextHeight + 12;
	return { portrait, top, bottom, x, textWidth, actionY,
		textTop: groupTop,
		textCenterY: portrait ? null : height * 0.5,
		modelHeight,
		titleSize: portrait ? Math.min(32, Math.max(24, width * 0.064)) : 27,
		bodySize: width < 480 ? 15 : 16,
		modelCenterX: portrait ? width * 0.5 : Math.min(width * 0.72, x + textWidth + modelHeight * 0.55),
		modelCenterY: portrait ? modelTop + modelHeight * 0.5 : height * 0.5,
	};
}
