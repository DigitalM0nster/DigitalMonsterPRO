export function resolveFilmPresentation(width, height, info = 0) {
 const layout = resolveFilmVideoPresentation(width, height);
 if (!layout || info <= 0) return layout;
 const progress = Math.max(0, Math.min(1, info));
 const mix = (from, to) => from + (to - from) * progress;
 const short = height <= 480, top = short ? 64 : 84, bottom = layout.wide ? 28 : short ? 54 : 72;
 if (!layout.wide) {
  const screenBottom = height - bottom - 64;
  return { ...layout,
   heading: { ...layout.heading, top: mix(layout.heading.top, top) },
   screen: { ...layout.screen, top: mix(layout.screen.top, top + 56), bottom: mix(layout.screen.bottom, screenBottom) },
   panel: { ...layout.panel, top: mix(layout.panel.top, screenBottom + 10) },
  };
 }
 const portrait = !layout.landscape && !layout.wide;
 const panelTop = portrait ? height - bottom - 60 : (layout.screen.top + layout.screen.bottom) / 2 - 22;
 const screenTop = portrait ? top + 48 : layout.screen.top + 10;
 const screenBottom = portrait ? panelTop - 44 : layout.screen.bottom - 8;
 return { ...layout,
  heading: { ...layout.heading, top: mix(layout.heading.top, top) },
  screen: { ...layout.screen, top: mix(layout.screen.top, screenTop), bottom: mix(layout.screen.bottom, screenBottom) },
  panel: { ...layout.panel, top: mix(layout.panel.top, panelTop) },
 };
}

/** Shared CSS-pixel reservations for the curved screen and its native controls. */
function resolveFilmVideoPresentation(width, height) {
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
	const screenHeight = Math.min((width - 32) * .5184, Math.max(80, available - 120));
	const screenWidth = Math.min(width - 32, screenHeight / .5184);
	const left = (width - screenWidth) / 2, right = width - left;
	const controlsWidth = Math.max(screenWidth, Math.min(width - 32, 320));
	const controlsLeft = (width - controlsWidth) / 2;
	const blockHeight = screenHeight + 120;
	const start = top + Math.max(0, (available - blockHeight) / 2);
	return { wide, landscape, heading: { left: controlsLeft, top: start, width: controlsWidth },
		screen: { left, right, top: start + 56, bottom: start + 56 + screenHeight },
		panel: { left: controlsLeft, top: start + 66 + screenHeight, width: controlsWidth } };
}

/** Information stays inside the video on desktop; phones use a compact reading card. */
export function resolveFilmInfoPresentation(width, height, projected, info = 0) {
	const mobile = resolveFilmPresentation(width, height, info);
	if (mobile) {
		const { panel, screen, wide } = mobile;
		const cardTop = mobile.landscape ? Math.max(76, screen.top) : Math.max(76, screen.bottom - 310);
		const cardBottom = Math.min(screen.bottom, height - 76);
		const cardWidth = Math.min(420, mobile.landscape ? screen.right - screen.left : width - 24);
		return {
			anchorX: panel.left + panel.width / 2,
			anchorY: Math.min(height - 36, panel.top + (wide ? 46 : 112) * (1 - info) + 22 * info),
			left: mobile.landscape ? screen.left + (screen.right - screen.left - cardWidth) / 2 : (width - cardWidth) / 2,
			top: cardTop, width: cardWidth,
			height: Math.max(100, Math.min(390, cardBottom - cardTop)),
		};
	}
	const cardWidth = Math.min(460, (projected.right - projected.left) * .7);
	return { anchorX: projected.anchorX, anchorY: projected.anchorY,
		left: (projected.left + projected.right - cardWidth) / 2,
		top: projected.top + 12, width: cardWidth, height: Math.max(100, projected.bottom - projected.top - 24) };
}
