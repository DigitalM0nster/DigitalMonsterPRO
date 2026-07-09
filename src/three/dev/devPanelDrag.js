const STYLE_MARKER = "devPanelDragV1";
const STORAGE_PREFIX = "digitalmonster-dev-panel-pos:";

function injectDevPanelDragStyles() {
	if (document.querySelector(`style[data-${STYLE_MARKER}]`)) {
		return;
	}

	const style = document.createElement("style");
	style.dataset[STYLE_MARKER] = "1";
	style.textContent = `
		.devPanelDragHandle {
			cursor: grab;
			user-select: none;
			touch-action: none;
		}

		.devPanelDragging,
		.devPanelDragging .devPanelDragHandle {
			cursor: grabbing;
		}

		.sceneDevTools .devPanelDragHandle {
			margin: -14px -16px 8px;
			padding: 10px 16px 6px;
			border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		}

		.devPanelDraggable .devPanelDragHandle {
			margin: -12px -14px 6px;
			padding: 8px 14px 4px;
			border-bottom: 1px solid rgba(255, 255, 255, 0.1);
			pointer-events: auto;
		}
	`;
	document.head.appendChild(style);
}

function loadPosition(id) {
	try {
		const raw = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
		if (!raw) {
			return null;
		}

		const pos = JSON.parse(raw);
		if (typeof pos.left === "number" && typeof pos.top === "number") {
			return pos;
		}
	} catch {
		// ignore corrupt storage
	}

	return null;
}

function savePosition(id, left, top) {
	localStorage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify({ left, top }));
}

function applyPosition(panel, left, top) {
	panel.style.right = "auto";
	panel.style.bottom = "auto";
	panel.style.left = `${left}px`;
	panel.style.top = `${top}px`;
	panel.dataset.devPanelDragged = "1";
}

function clampPosition(panel, left, top) {
	const margin = 8;
	const width = panel.offsetWidth || 280;
	const height = panel.offsetHeight || 120;
	const maxLeft = Math.max(margin, window.innerWidth - width - margin);
	const maxTop = Math.max(margin, window.innerHeight - height - margin);

	return {
		left: Math.min(Math.max(margin, left), maxLeft),
		top: Math.min(Math.max(margin, top), maxTop),
	};
}

function isInteractiveDragTarget(target) {
	return target instanceof Element && Boolean(target.closest("input, button, select, textarea, label.fieldToggle"));
}

/**
 * Перетаскивание dev-панели за handle. Позиция сохраняется в localStorage.
 * @param {HTMLElement} panel
 * @param {{ id: string, handle?: HTMLElement | null }} options
 * @returns {() => void}
 */
export function attachDevPanelDrag(panel, options = {}) {
	const resolvedId = options.id ?? panel?.dataset?.devPanelId;

	if (!import.meta.env.DEV || !panel || !resolvedId) {
		return () => {};
	}

	injectDevPanelDragStyles();

	const dragHandle =
		options.handle ??
		panel.querySelector("[data-dev-panel-handle]") ??
		panel.querySelector(".devPanelDragHandle") ??
		panel.querySelector(".panelHead") ??
		panel.querySelector(".title");

	if (!dragHandle) {
		return () => {};
	}

	dragHandle.classList.add("devPanelDragHandle");
	panel.classList.add("devPanelDraggable");

	const saved = loadPosition(resolvedId);
	if (saved) {
		applyPosition(panel, saved.left, saved.top);
	}

	let dragging = false;
	let offsetX = 0;
	let offsetY = 0;

	const onPointerDown = (event) => {
		if (event.button !== 0 || isInteractiveDragTarget(event.target)) {
			return;
		}

		dragging = true;
		const rect = panel.getBoundingClientRect();
		applyPosition(panel, rect.left, rect.top);
		offsetX = event.clientX - rect.left;
		offsetY = event.clientY - rect.top;
		panel.classList.add("devPanelDragging");
		dragHandle.setPointerCapture(event.pointerId);
		event.preventDefault();
	};

	const onPointerMove = (event) => {
		if (!dragging) {
			return;
		}

		const next = clampPosition(panel, event.clientX - offsetX, event.clientY - offsetY);
		applyPosition(panel, next.left, next.top);
	};

	const finishDrag = (event) => {
		if (!dragging) {
			return;
		}

		dragging = false;
		panel.classList.remove("devPanelDragging");

		if (dragHandle.hasPointerCapture?.(event.pointerId)) {
			dragHandle.releasePointerCapture(event.pointerId);
		}

		const left = Number.parseFloat(panel.style.left);
		const top = Number.parseFloat(panel.style.top);
		if (Number.isFinite(left) && Number.isFinite(top)) {
			savePosition(resolvedId, left, top);
		}
	};

	dragHandle.addEventListener("pointerdown", onPointerDown);
	window.addEventListener("pointermove", onPointerMove);
	window.addEventListener("pointerup", finishDrag);
	window.addEventListener("pointercancel", finishDrag);

	return () => {
		dragHandle.removeEventListener("pointerdown", onPointerDown);
		window.removeEventListener("pointermove", onPointerMove);
		window.removeEventListener("pointerup", finishDrag);
		window.removeEventListener("pointercancel", finishDrag);
		dragHandle.classList.remove("devPanelDragHandle");
		panel.classList.remove("devPanelDraggable", "devPanelDragging");
	};
}
