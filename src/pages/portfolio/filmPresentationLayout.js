/** Shared CSS-pixel reservations for the curved screen and its native controls. */
export function resolveFilmPresentation(width, height) {
	if (width > 1024 && height > 600) return null;
	const wide = width > 1024;
	const landscape = height <= 600 && width / height >= 1.15;
	const top = height <= 480 ? 64 : 84;
	const bottom = wide ? 28 : height <= 480 ? 54 : 72;
	const available = height - top - bottom;
	if (wide) {
		const total = Math.min(width - 248, 1200);
		const left = (width - total) / 2 + 16;
		const right = left + total * .60;
		return { wide, landscape, heading: { left, top: top + 4, width: right - left },
			screen: { left, right, top: top + 48, bottom: height - bottom - 62 },
			panel: { left, top: height - bottom - 56, width: right - left },
			directory: { left: right + 52, top: top + Math.max(0, (available - 352) / 2), width: total * .40 - 68, height: Math.min(352, available) } };
	}
	if (landscape) {
		const left = 16, right = width * .49;
		return { wide, landscape, heading: { left, top: top + 4, width: right - left },
			screen: { left, right, top: top + 28, bottom: height - bottom - 12 },
			panel: { left: width * .53, top: top + Math.max(0, (available - 152) / 2), width: width * .47 - 16 } };
	}
	const screenHeight = Math.min((width - 32) * .5184, Math.max(96, available - 210));
	const blockHeight = screenHeight + 194;
	const start = top + Math.max(0, (available - blockHeight) / 2);
	return { wide, landscape, heading: { left: 20, top: start, width: width - 40 },
		screen: { left: 16, right: width - 16, top: start + 32, bottom: start + 32 + screenHeight },
		panel: { left: 16, top: start + 48 + screenHeight, width: width - 32 } };
}
