import { store } from "@/store.jsx";
import { getMenuCircleAnchor } from "./leftMenuSnap.js";

/** Прикрепляет HUD-курсор к border круга пункта меню (центр + диаметр после snap). */
export function setMenuCursorAnchor(index, buttonRefs, entry = null) {
	if (index < 0) {
		clearMenuCursorAnchor();
		return;
	}

	const button = buttonRefs.current[index];
	if (!button) {
		return;
	}

	const anchor = entry
		? getMenuCircleAnchor(entry.clientX, entry.clientY, button)
		: (() => {
				const rect = button.getBoundingClientRect();
				return {
					x: rect.left + rect.width / 2,
					y: rect.top + rect.height / 2,
					diameter: rect.width,
				};
			})();
	const anchorKey = `leftMenu:${index}`;
	if (store.cursor.menuAnchorKey !== anchorKey) {
		store.cursor.menuAnchorKey = anchorKey;
		store.cursor.menuAnchorRevision += 1;
	}

	store.cursor.menuAnchorActive = true;
	store.cursor.menuAnchorX = anchor.x;
	store.cursor.menuAnchorY = anchor.y;
	store.cursor.menuAnchorDiameter = anchor.diameter;
	store.cursor.menuAnchorSource = "leftMenu";
	store.cursor.hovered = true;
}

export function clearMenuCursorAnchor() {
	if (store.cursor.menuAnchorSource && store.cursor.menuAnchorSource !== "leftMenu") {
		return;
	}
	store.cursor.menuAnchorActive = false;
	store.cursor.menuAnchorDiameter = 0;
	store.cursor.menuAnchorSource = null;
	store.cursor.menuAnchorKey = null;
	store.cursor.hovered = false;
}
