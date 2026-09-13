/** CSS-pixel composition for the prepared contacts list; no rasterization on resize. */
export function resolveContactsResponsiveLayout(width, height) {
	if (width > 1024 && height > 600) return null;
	const dock = width <= 1024;
	const short = height <= 480;
	const top = short ? 66 : 84;
	const bottom = dock ? (short ? 50 : 64) : 28;
	const portrait = height > width;
	const left = dock ? (width < 640 ? 20 : 32) : Math.max(144, (width - 1100) / 2 + 40);
	const available = height - top - bottom;
	const columns = !portrait && height <= 600 ? 2 : 1;
	const rows = Math.ceil(8 / columns);
	const rowHeight = width >= 768 && height > 600 ? 50 : 44;
	const listWidth = portrait ? width * (width < 480 ? .46 : .40) : Math.min(width * .52 - left, 420);
	const listHeight = rowHeight * rows;
	const titleY = top + Math.max(0, (available - listHeight - 54) / 2);
	const listX = left, listY = titleY + 54;
	const modelLeft = portrait ? width * .48 : Math.max(left + listWidth + 28, width * .52);
	const modelRight = portrait ? width * 1.10 : Math.min(width - (dock ? 16 : 80), modelLeft + 520);
	const modelTop = portrait ? listY - 12 : top + 12;
	const modelBottom = portrait ? Math.min(height - bottom - 16, listY + listHeight + 14) : height - bottom - 16;
	return { portrait, columns, rows, rowHeight, listX, listY, listWidth, listHeight, top, bottom,
		titleY, fontSize: width < 480 ? 17 : width < 768 ? 21 : 25,
		modelRect: { left: modelLeft, right: modelRight, top: modelTop, bottom: modelBottom },
		// Existing 30px glyphs occupy 30/42 of their prepared texture's height.
		glyphPlanePx: width < 480 ? 25 : 30,
		modelCenterY: (modelTop + modelBottom) / 2,
	};
}

export function resolveContactsResponsiveHit(layout, x, y) {
	if (!layout || x < layout.listX || x >= layout.listX + layout.listWidth
		|| y < layout.listY || y >= layout.listY + layout.listHeight) return -1;
	const col = Math.floor((x - layout.listX) / (layout.listWidth / layout.columns));
	const row = Math.floor((y - layout.listY) / layout.rowHeight);
	return Math.min(7, row * layout.columns + col);
}
