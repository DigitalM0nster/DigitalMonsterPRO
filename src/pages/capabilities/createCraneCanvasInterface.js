import { SceneCanvasInterface } from "@/three/objects/sceneHud/SceneCanvasInterface.js";
import { LinearFilter } from "three";
import { createSceneHudAtlasChunked } from "@/three/objects/sceneHud/sceneHudAtlas.js";
import { requestMmk1ReturnToOverview } from "./mmk1SceneBridge.js";
import { store } from "@/app/store.jsx";
import { getMmk1DetailLayout } from "@/three/scenes/capabilities/mmk1/mmk1HotspotDetailsConfig.js";
import { updateCraneReturn, craneReturnLayout, createCraneReturnStates, CRANE_RETURN_COPY, CRANE_RETURN_FRAGMENT, CRANE_RETURN_SIZE } from "./craneReturnControl.js";

export function createCraneCanvasInterface(renderer, scene) {
	const ui = new SceneCanvasInterface("capabilities:mmk1", renderer);
	const isDetailOpen = () => !!scene._cameraHotspots?.selectedId && scene._cameraHotspots.selectedId !== "__overview__";
	const back = ui.add("back", {
		values: CRANE_RETURN_COPY, ...CRANE_RETURN_SIZE,
		action: () => isDetailOpen() && requestMmk1ReturnToOverview(),
	});
	back.material.fragmentShader = CRANE_RETURN_FRAGMENT;
	const uniforms = back.material.uniforms;
	uniforms.uHover = { value: 0 }; uniforms.uShortcut = { value: 1 }; uniforms.uRuleEnd = { value: 250 };
	for (const name of ["uSnake", "uLocale", "uGlyphCount"]) uniforms[name] = { value: 0 };
	for (const name of ["uLabels", "uLetterOrder", "uGlyphs"]) uniforms[name] = { value: null };
	const motion = { reveal: 0, index: -1, locale: 0 };
	let dt = 0, frame = null, atlas = null, ruleEnds = [250, 250, 250];
	const update = ui.update.bind(ui), prepare = ui.prepare.bind(ui), dispose = ui.dispose.bind(ui), hit = ui.hit.bind(ui);
	ui.prepare = async scheduler => {
		await prepare(scheduler);
		const states = createCraneReturnStates(), ctx = document.createElement("canvas").getContext("2d");
		ruleEnds = states.map(([[line]]) => {
			ctx.font = `500 ${line.size}px ManifoldExtended, "Segoe UI", sans-serif`;
			return line.x + Array.from(line.text).reduce((width, char) => width
				+ (char === " " ? line.space : ctx.measureText(char).width + line.tracking), 0) - line.tracking;
		});
		atlas = await createSceneHudAtlasChunked(2, states, "mmk1-return", CRANE_RETURN_SIZE, () => ui.disposed);
		if (!atlas) return ui;
		atlas.texture.minFilter = atlas.texture.magFilter = LinearFilter;
		uniforms.uLabels.value = atlas.texture;
		uniforms.uLetterOrder.value = atlas.orderTexture;
		uniforms.uGlyphs.value = atlas.glyphTexture;
		uniforms.uGlyphCount.value = atlas.glyphCount;
		for (const texture of [atlas.texture, atlas.orderTexture, atlas.glyphTexture]) {
			if (scheduler) await scheduler.run(() => renderer.initTexture(texture));
			else renderer.initTexture(texture);
		}
		return ui;
	};
	ui.update = (delta = 0, nextFrame = null) => {
		dt = Math.max(0, Math.min(delta, .05)); frame = nextFrame;
		update();
		back.button.disabled = !isDetailOpen() || motion.reveal < 1;
		if (back.button.disabled) back.button.tabIndex = -1;
	};
	ui.hit = (x, y) => motion.reveal >= 1 && isDetailOpen() ? hit(x, y) : null;
	ui.key = key => key === "Escape" && back.action() === true;
	ui.layout = () => {
		const hotspots = scene._cameraHotspots;
		const requested = isDetailOpen();
		const index = requested ? hotspots.markers.findIndex(marker => marker.name === hotspots.selectedId) : -1;
		const details = hotspots?.details;
		const panel = details?.panels[index];
		const locale = store.siteLocale === "en" ? 1 : store.siteLocale === "zh" ? 2 : 0;
		const textReady = panel?.material.uniforms.uSnake.value === 1 && !details.localeMotions[index].busy;
		updateCraneReturn(motion, index, locale, textReady, dt);
		ui.enabled = requested || motion.reveal > 0;
		const layout = craneReturnLayout(ui.width, ui.height, getMmk1DetailLayout(Math.max(0, motion.index), ui.width, ui.height));
		const hovered = requested && motion.reveal === 1 && ((ui.hovered === back && frame?.interactionEnabled !== false && !frame?.pointerBlocked)
			|| document.activeElement === back.button);
		uniforms.uHover.value += (Number(hovered) - uniforms.uHover.value) * (1 - Math.exp(-18 * dt));
		uniforms.uShortcut.value = Number(layout.shortcut);
		uniforms.uSnake.value = motion.reveal;
		uniforms.uLocale.value = motion.locale;
		uniforms.uRuleEnd.value = ruleEnds[motion.locale];
		if (details) details.returnReveal = motion.reveal;
		ui.place("back", layout.x, layout.y, layout.width, layout.height, { key: store.siteLocale, opacity: motion.reveal > 0 ? 1 : 0 });
		if (hovered && frame?.interactionEnabled !== false && !frame?.pointerBlocked) store.cursor.caseHovered = true;
	};
	ui.beginScreenWarmupDraw = () => {
		const opacity = uniforms.opacity.value, snake = uniforms.uSnake.value;
		uniforms.opacity.value = 1; uniforms.uSnake.value = .5;
		return () => { uniforms.opacity.value = opacity; uniforms.uSnake.value = snake; };
	};
	ui.dispose = () => {
		for (const texture of [atlas?.texture, atlas?.orderTexture, atlas?.glyphTexture]) texture?.dispose();
		dispose();
	};
	return ui;
}
