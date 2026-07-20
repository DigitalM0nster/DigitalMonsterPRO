const STYLE_MARKER = "sceneDevToolsV6";

/** Wheel над dev-панелью — не отдавать карусели (capture на window иначе блокирует scroll). */
export function isSceneDevToolsWheelTarget(event) {
	const target = event.target;
	return target instanceof Element && Boolean(target.closest(".sceneDevTools"));
}

/** Стили dev-панели сцен. column-flex — иначе глобальный div { display:flex } ломает вёрстку. */
export function injectSceneDevToolsStyles() {
	if (document.querySelector(`style[data-${STYLE_MARKER}]`)) {
		return;
	}

	const style = document.createElement("style");
	style.dataset[STYLE_MARKER] = "1";
	style.textContent = `
		.sceneDevTools {
			position: fixed;
			right: 16px;
			bottom: 16px;
			left: auto;
			z-index: 100050;
			display: flex !important;
			flex-direction: column;
			align-items: stretch;
			width: min(440px, calc(100vw - 32px));
			max-height: min(82vh, 760px);
			min-height: 0;
			overflow-x: hidden;
			overflow-y: auto;
			overscroll-behavior: contain;
			-webkit-overflow-scrolling: touch;
			touch-action: pan-y;
			padding: 14px 16px;
			border-radius: 12px;
			border: 1px solid rgba(255, 255, 255, 0.16);
			background: rgba(6, 10, 16, 0.94);
			color: #e8eef5;
			font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
			backdrop-filter: blur(10px);
			pointer-events: auto;
			box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
		}

		.sceneDevTools.hidden {
			display: none !important;
		}

		.sceneDevTools.bloomDevTools {
			left: 16px;
			right: auto;
		}

		.sceneDevTools .title {
			margin: 0 0 6px;
			font: 600 14px/1.3 system-ui, sans-serif;
		}

		.sceneDevTools .legend {
			display: block;
			margin: 0 0 12px;
			padding: 8px 10px;
			border-radius: 8px;
			background: rgba(255, 255, 255, 0.05);
			color: rgba(232, 238, 245, 0.82);
			font: 11px/1.45 system-ui, sans-serif;
		}

		.sceneDevTools .section {
			display: flex !important;
			flex-direction: column;
			align-items: stretch;
			gap: 8px;
			margin: 0 0 14px;
			padding: 0 0 14px;
			border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		}

		.sceneDevTools .section:last-child {
			margin-bottom: 0;
			padding-bottom: 0;
			border-bottom: none;
		}

		.sceneDevTools .sectionTitle {
			margin: 0;
			font: 600 12px/1.2 system-ui, sans-serif;
			color: #9fd4ff;
			text-transform: uppercase;
			letter-spacing: 0.06em;
		}

		.sceneDevTools .field {
			display: flex !important;
			flex-direction: row;
			align-items: center;
			gap: 8px;
		}

		.sceneDevTools .field label {
			flex: 0 0 118px;
			font: 11px/1.25 system-ui, sans-serif;
		}

		.sceneDevTools .field input[type="range"] {
			flex: 1 1 auto;
			min-width: 0;
		}

		.sceneDevTools .field input[type="color"] {
			flex: 0 0 40px;
			width: 40px;
			height: 28px;
			padding: 0;
			border: 1px solid rgba(255, 255, 255, 0.18);
			border-radius: 6px;
			background: transparent;
			cursor: pointer;
		}

		.sceneDevTools .field input[type="number"] {
			flex: 0 0 68px;
			width: 68px;
			padding: 4px 6px;
			border: 1px solid rgba(255, 255, 255, 0.18);
			border-radius: 6px;
			background: rgba(255, 255, 255, 0.06);
			color: inherit;
			font: inherit;
		}

		.sceneDevTools .field input[type="text"] {
			flex: 1 1 auto;
			min-width: 0;
			padding: 4px 8px;
			border: 1px solid rgba(255, 255, 255, 0.18);
			border-radius: 6px;
			background: rgba(255, 255, 255, 0.06);
			color: inherit;
			font: inherit;
		}

		.sceneDevTools .fieldToggle {
			display: flex !important;
			flex-direction: row;
			align-items: center;
			gap: 8px;
			margin: 0;
			font: 11px/1.3 system-ui, sans-serif;
			cursor: pointer;
		}

		.sceneDevTools .fieldToggle input {
			flex: 0 0 auto;
		}

		.sceneDevTools .actions {
			display: flex !important;
			flex-direction: row;
			flex-wrap: wrap;
			gap: 8px;
		}

		.sceneDevTools button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			padding: 6px 10px;
			border: 1px solid rgba(255, 255, 255, 0.18);
			border-radius: 6px;
			background: rgba(255, 255, 255, 0.08);
			color: inherit;
			cursor: pointer;
			font: 11px/1 system-ui, sans-serif;
		}

		.sceneDevTools button:hover {
			background: rgba(255, 255, 255, 0.14);
		}

		.sceneDevTools button.active {
			border-color: rgba(127, 212, 255, 0.55);
			background: rgba(0, 140, 220, 0.28);
			color: #9fd4ff;
		}

		.sceneDevTools .checkRow {
			display: flex !important;
			flex-direction: row;
			align-items: center;
			gap: 8px;
			margin: 0;
			font: 11px/1.3 system-ui, sans-serif;
			color: rgba(232, 238, 245, 0.85);
			cursor: pointer;
		}

		.sceneDevTools .checkRow input {
			flex: 0 0 auto;
		}

		.sceneDevTools .status {
			margin: 0 0 10px;
			font: 11px/1.3 system-ui, sans-serif;
			color: #7dffb2;
		}

		.sceneDevTools .readout {
			display: flex !important;
			flex-direction: row;
			align-items: baseline;
			justify-content: space-between;
			gap: 10px;
			margin: 0;
			font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		}

		.sceneDevTools .readout .k {
			flex: 0 1 auto;
			color: rgba(232, 238, 245, 0.62);
		}

		.sceneDevTools .readout .v {
			flex: 0 0 auto;
			color: #e8eef5;
			text-align: right;
			white-space: nowrap;
		}

		.sceneDevTools .readout.dim .v {
			color: rgba(232, 238, 245, 0.4);
		}
	`;
	document.head.appendChild(style);
}

export function shouldOpenProgressDevFromUrl() {
	const params = new URLSearchParams(window.location.search);
	return params.has("progressDev");
}

export function formatConfigNumber(value) {
	return Number(value.toFixed(3));
}

export function shouldOpenCase1DevFromUrl() {
	const params = new URLSearchParams(window.location.search);
	return params.has("case1Dev") || params.has("case1Post") || params.has("bloomDev");
}

export function shouldOpenHubDevFromUrl() {
	const params = new URLSearchParams(window.location.search);
	return params.has("hubDev") || params.has("portfolioDev");
}

export function shouldOpenWhaleDevFromUrl() {
	const params = new URLSearchParams(window.location.search);
	return params.has("whaleDev") || params.has("heroDev");
}
