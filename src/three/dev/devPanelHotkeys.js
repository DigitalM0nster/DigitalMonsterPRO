/** Глобальные hotkey для dev-панелей: цифры 1–9 и 0, любой роут. */

/** @typedef {{ label: string, toggle: () => void }} DevPanelHotkeyEntry */

/** @type {Map<string, DevPanelHotkeyEntry>} */
const registry = new Map();

let listening = false;

/** Порядок для подсказок в панелях. */
export const DEV_PANEL_HOTKEY_HINTS = [
	{ key: "1", label: "Progress" },
	{ key: "7", label: "Case Arc" },
	{ key: "8", label: "Liquid BG" },
	{ key: "9", label: "Stage Rail" },
];
export function formatDevPanelHotkeyHints() {
	return DEV_PANEL_HOTKEY_HINTS.map(({ key, label }) => `${key} — ${label}`).join(" · ");
}

export function shouldIgnoreDevPanelHotkey(event) {
	if (event.ctrlKey || event.metaKey || event.altKey) {
		return true;
	}

	const target = event.target;
	if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
		return true;
	}

	if (target instanceof HTMLElement && target.isContentEditable) {
		return true;
	}

	return false;
}

function onKeyDown(event) {
	if (shouldIgnoreDevPanelHotkey(event)) {
		return;
	}

	const entry = registry.get(event.key);
	if (!entry) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();
	entry.toggle();
}

function ensureListener() {
	if (!import.meta.env.DEV || listening) {
		return;
	}

	listening = true;
	window.addEventListener("keydown", onKeyDown, true);
}

/**
 * @param {string} key — одна цифра 0–9
 * @param {DevPanelHotkeyEntry} entry
 */
export function registerDevPanelHotkey(key, entry) {
	if (!import.meta.env.DEV || !key) {
		return;
	}

	registry.set(key, entry);
	ensureListener();
}

export function unregisterDevPanelHotkey(key) {
	registry.delete(key);
}

export function disposeDevPanelHotkeys() {
	window.removeEventListener("keydown", onKeyDown, true);
	registry.clear();
	listening = false;
}
