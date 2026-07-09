/** Сдвиг кнопки при hover — по стороне входа курсора. */
export const MENU_SNAP_OFFSET = 9;

/** Масштаб круга в покое — через width/height, не transform: scale. */
export const MENU_CIRCLE_IDLE_SCALE = 0.78;

/** Диаметр круга при hover — совпадает с HUD-курсором. */
export const MENU_CIRCLE_HOVER_SCALE = 1.14;

/**
 * Смещение кнопки в сторону, откуда зашёл курсор.
 * @returns {{ x: number, y: number }}
 */
export function getMenuEntrySnapOffset(clientX, clientY, buttonEl) {
	const rect = buttonEl.getBoundingClientRect();
	const cx = rect.left + rect.width / 2;
	const cy = rect.top + rect.height / 2;
	const dx = clientX - cx;
	const dy = clientY - cy;

	if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
		return { x: MENU_SNAP_OFFSET, y: 0 };
	}

	const absDx = Math.abs(dx);
	const absDy = Math.abs(dy);

	if (absDx >= absDy) {
		return { x: dx > 0 ? MENU_SNAP_OFFSET : -MENU_SNAP_OFFSET, y: 0 };
	}

	return { x: 0, y: dy > 0 ? MENU_SNAP_OFFSET : -MENU_SNAP_OFFSET };
}

/** Центр круга и диаметр при hover — для слияния HUD с border. */
export function getMenuCircleAnchor(clientX, clientY, buttonEl) {
	const rect = buttonEl.getBoundingClientRect();
	const snap = getMenuEntrySnapOffset(clientX, clientY, buttonEl);
	const cx = rect.left + rect.width / 2 + snap.x;
	const cy = rect.top + rect.height / 2 + snap.y;
	const diameter = rect.width * MENU_CIRCLE_HOVER_SCALE;

	return { x: cx, y: cy, diameter, snap };
}
