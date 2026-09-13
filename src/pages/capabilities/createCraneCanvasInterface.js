import { SceneCanvasInterface } from "@/three/objects/sceneHud/SceneCanvasInterface.js";
import { requestMmk1ReturnToOverview } from "./mmk1SceneBridge.js";
import { store } from "@/app/store.jsx";
import { getMmk1DetailLayout } from "@/three/scenes/capabilities/mmk1/mmk1HotspotDetailsConfig.js";
import { advanceCraneReturnVisibility, craneReturnLayout, CRANE_RETURN_COPY, CRANE_RETURN_FRAGMENT, CRANE_RETURN_SIZE, paintCraneReturn } from "./craneReturnControl.js";

export function createCraneCanvasInterface(renderer, scene) {
	const ui = new SceneCanvasInterface("capabilities:mmk1", renderer);
	const isDetailOpen = () => !!scene._cameraHotspots?.selectedId && scene._cameraHotspots.selectedId !== "__overview__";
	const back = ui.add("back", {
		values: CRANE_RETURN_COPY, ...CRANE_RETURN_SIZE, paint: paintCraneReturn,
		action: () => isDetailOpen() && requestMmk1ReturnToOverview(),
	});
	back.material.fragmentShader = CRANE_RETURN_FRAGMENT;
	const uniforms = back.material.uniforms;
	uniforms.uHover = { value: 0 }; uniforms.uShortcut = { value: 1 };
	let reveal = 0, dt = 0, frame = null, detailIndex = 0;
	const update = ui.update.bind(ui), prepare = ui.prepare.bind(ui);
	ui.prepare = async scheduler => { await document.fonts.load('400 10px MazzardM'); return prepare(scheduler); };
	ui.update = (delta = 0, nextFrame = null) => {
		dt = Math.max(0, Math.min(delta, .05)); frame = nextFrame;
		update();
		// The fading button cannot restart a return flight or retain keyboard focus.
		back.button.disabled = !isDetailOpen();
		if (back.button.disabled) back.button.tabIndex = -1;
	};
	ui.key = key => key === "Escape" && back.action() === true;
	ui.layout = () => {
		const requested = isDetailOpen();
		if (requested) detailIndex = Math.max(0, scene._cameraHotspots.markers.findIndex(marker => marker.name === scene._cameraHotspots.selectedId));
		reveal = advanceCraneReturnVisibility(reveal, requested, dt);
		ui.enabled = requested || reveal > 0;
		const layout = craneReturnLayout(ui.width, ui.height, getMmk1DetailLayout(detailIndex, ui.width, ui.height));
		const hovered = requested && ((ui.hovered === back && frame?.interactionEnabled !== false && !frame?.pointerBlocked)
			|| document.activeElement === back.button);
		uniforms.uHover.value += (Number(hovered) - uniforms.uHover.value) * (1 - Math.exp(-18 * dt));
		uniforms.uShortcut.value = Number(layout.shortcut);
		const opacity = reveal * reveal * (3 - 2 * reveal);
		ui.place("back", layout.x, layout.y + (1 - opacity) * 8, layout.width, layout.height, { key: store.siteLocale, opacity });
		if (hovered && frame?.interactionEnabled !== false && !frame?.pointerBlocked) store.cursor.caseHovered = true;
	};
	ui.beginScreenWarmupDraw = () => {
		const opacity = uniforms.opacity.value;
		uniforms.opacity.value = 1;
		return () => { uniforms.opacity.value = opacity; };
	};
	return ui;
}
