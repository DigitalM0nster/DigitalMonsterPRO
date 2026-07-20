import * as THREE from "three";
import {
	getCasePanelHudEnterProgress,
	getCasePanelHudEnterTravelSign,
	getCasePanelHudState,
} from "@/portfolio/core/casePanelHudBridge.js";
import {
	getAboutPanelHudEnterProgress,
	getAboutPanelHudEnterTravelSign,
	getAboutPanelHudMixProgress,
	getAboutPanelHudState,
} from "@/about/aboutPanelHudBridge.js";
import { getCaseStageClickMosaicProgress } from "@/portfolio/core/caseStageClickMosaic.js";
import { getCasePanelHudLocaleMixProgress } from "@/portfolio/core/casePanelHudLocaleMix.js";
import { getStageProgress } from "@/portfolio/core/stageProgress.js";
import {
	createHexGridCutUniforms,
	HEX_GRID_CUT_CORE_GLSL,
	HEX_GRID_CUT_SOURCE_VISIBLE_GLSL,
	HEX_GRID_CUT_UNIFORMS_GLSL,
	syncHexGridCutFromHexMaterial,
} from "@/three/render/overlay/hexGridCutGlsl.js";

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Left content HUD fragment (always screen overlay after bloom).
 * Hex leave: same per-cell UV shrink/wave as HexGridOverlayPass (hexCutHudSourceWarp).
 * Mosaic runs inside uMosaicRect via enterProgress / mixProgress.
 */
const fragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D mapFrom;
uniform sampler2D mapTo;
uniform float mixProgress;
uniform float uEnterProgress;
uniform float opacity;
uniform float uWorkingLinear;
uniform float uLayerMode;
uniform float uFollowEnter;
uniform vec2 uGrid;
uniform float uLiftStrength;
uniform float uRandomLiftPx;
uniform float uScatterPx;
uniform float uDelay;
uniform float uTravelSign;
uniform vec2 uTexelSize;
uniform vec4 uMosaicRect;
uniform vec4 uClipRect;
varying vec2 vUv;

${HEX_GRID_CUT_UNIFORMS_GLSL}
${HEX_GRID_CUT_CORE_GLSL}
${HEX_GRID_CUT_SOURCE_VISIBLE_GLSL}

vec3 sRGBToLinear(vec3 c) {
	bvec3 cutoff = lessThanEqual(c, vec3(0.04045));
	vec3 higher = pow((c + vec3(0.055)) / vec3(1.055), vec3(2.4));
	vec3 lower = c / vec3(12.92);
	return mix(higher, lower, vec3(cutoff));
}

vec4 sampleHud(sampler2D map, vec2 uv) {
	vec4 color = texture2D(map, uv);
	if (uWorkingLinear > 0.5) {
		color.rgb = sRGBToLinear(color.rgb);
	}
	return color;
}

float jsNoise(float seed) {
	float n = sin(seed * 12.9898) * 43758.5453;
	return n - floor(n);
}

bool inTex(vec2 uv) {
	return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
}

bool inRect(vec2 uv, vec4 rect) {
	return uv.x >= rect.x && uv.x <= rect.z && uv.y >= rect.y && uv.y <= rect.w;
}

bool inClip(vec2 uv) {
	return inRect(uv, uClipRect);
}

bool inMosaic(vec2 uv) {
	return inRect(uv, uMosaicRect);
}

vec2 toLocal(vec2 uv) {
	vec2 size = max(uMosaicRect.zw - uMosaicRect.xy, vec2(0.0001));
	return (uv - uMosaicRect.xy) / size;
}

void tileMotion(vec2 cell, float p, out float localProgress, out vec2 fromOffsetUv, out vec2 toOffsetUv) {
	float columns = max(uGrid.x, 1.0);
	float rows = max(uGrid.y, 1.0);
	float seed = cell.y * columns + cell.x;
	float randomA = abs(jsNoise(seed * 7.13 + 3.7));
	float randomB = jsNoise(seed * 11.91 + 9.2);
	float randomC = abs(jsNoise(seed * 19.37 + 5.4));
	float maxDelay = clamp(uDelay, 0.0, 0.999);
	float delay = randomA * maxDelay;
	float delayedProgress = clamp((p - delay) / max(1.0 - delay, 0.0001), 0.0, 1.0);
	// Collapse late tile delays before enter→idle so the last frames do not snap.
	float settle = smoothstep(0.82, 1.0, p);
	delayedProgress = mix(delayedProgress, 1.0, settle);
	localProgress = clamp(p * 0.15 + delayedProgress * 0.85, 0.0, 1.0);
	localProgress = mix(localProgress, 1.0, settle);
	float remaining = 1.0 - localProgress;

	float rectH = max(uMosaicRect.w - uMosaicRect.y, 0.0001);
	float tileHUv = rectH / rows;
	float travelUv = (rectH + tileHUv) * uLiftStrength + randomC * uRandomLiftPx * uTexelSize.y;
	float scatterUv = randomB * uScatterPx * uTexelSize.x;
	float travelY = travelUv * uTravelSign;

	fromOffsetUv = vec2(-scatterUv * localProgress, -travelY * localProgress);
	toOffsetUv = vec2(scatterUv * remaining, travelY * remaining);
}

vec2 cellId(vec2 uv) {
	return floor(clamp(toLocal(uv), 0.0, 0.99999) * uGrid);
}

/**
 * Mosaic / crossfade must match idle lighting: vec4(sampled.rgb, sampled.a * cover).
 * Never reconstruct rgb via /alpha — that turns AA coverage greys into bright white.
 */
vec4 hudIdleStyle(vec4 color, float alphaScale) {
	return vec4(color.rgb, color.a * alphaScale * opacity);
}

vec4 hudOverIdle(vec4 fromColor, float fromCover, vec4 toColor, float toCover) {
	float aFrom = fromColor.a * fromCover;
	float aTo = toColor.a * toCover;
	if (aTo > aFrom) {
		return vec4(toColor.rgb, aTo * opacity);
	}
	return vec4(fromColor.rgb, aFrom * opacity);
}

/**
 * Enter/exit mosaic must show the same stage the idle path shows.
 * Idle at mix≈1 samples mapTo (next stage); enter used to always sample mapFrom,
 * so case→case leave from a late stage-mix animated the *previous* stage text.
 * Note: never ternary-select samplers — WebGL rejects cond ? mapTo : mapFrom.
 */
vec4 sampleEnterHud(vec2 uv) {
	float p = clamp(mixProgress, 0.0, 1.0);
	float mixIdleEps = 0.04;
	if (p >= 1.0 - mixIdleEps) {
		return sampleHud(mapTo, uv);
	}
	if (p <= mixIdleEps) {
		return sampleHud(mapFrom, uv);
	}
	if (p >= 0.5) {
		return sampleHud(mapTo, uv);
	}
	return sampleHud(mapFrom, uv);
}

void mosaicReveal(float ep) {
	float lpGuess;
	vec2 fromOffGuess;
	vec2 toOffGuess;
	tileMotion(cellId(vUv), ep, lpGuess, fromOffGuess, toOffGuess);

	vec2 toSrcGuess = vUv + toOffGuess;
	float lpTo;
	vec2 fromOffUnused;
	vec2 toOff;
	tileMotion(cellId(toSrcGuess), ep, lpTo, fromOffUnused, toOff);
	vec2 toSample = vUv + toOff;
	vec4 toColor = (inTex(toSample) && inMosaic(toSample)) ? sampleEnterHud(toSample) : vec4(0.0);
	gl_FragColor = hudIdleStyle(toColor, lpTo);
}

/** Idle / stage content at a UV (no enter mosaic). */
vec4 sampleIdleHudAt(vec2 uv) {
	float p = clamp(mixProgress, 0.0, 1.0);
	float mixIdleEps = 0.04;
	if (p <= mixIdleEps) {
		return sampleHud(mapFrom, uv);
	}
	if (p >= 1.0 - mixIdleEps) {
		return sampleHud(mapTo, uv);
	}
	if (p >= 0.5) {
		return sampleHud(mapTo, uv);
	}
	return sampleHud(mapFrom, uv);
}

void main() {
	if (!inClip(vUv)) {
		discard;
	}

	// Hex owns the fragment while a cell is wiping — same UV warp as models overlay.
	// Hard-threshold keep: soft alpha over bloom reads as filled black/ghost hexes on text.
	vec3 hexWarp = hexCutHudSourceWarpPack(vUv);
	if (hexWarp.z >= 0.0) {
		if (hexWarp.z < 0.5) {
			discard;
		}
		vec2 sampleUv = hexWarp.xy;
		vec4 color = inTex(sampleUv) ? sampleIdleHudAt(sampleUv) : vec4(0.0);
		color.rgb *= color.a;
		gl_FragColor = vec4(color.rgb, color.a * opacity);
		return;
	}

	bool useEnter = uEnterProgress >= 0.0 && (uLayerMode < 0.5 || uFollowEnter > 0.5);

	if (useEnter) {
		float ep = clamp(uEnterProgress, 0.0, 1.0);
		if (ep <= 0.0001) {
			gl_FragColor = vec4(0.0);
			return;
		}
		if (ep >= 0.9999) {
			gl_FragColor = hudIdleStyle(sampleEnterHud(vUv), 1.0);
			return;
		}
		if (!inMosaic(vUv)) {
			gl_FragColor = hudIdleStyle(sampleEnterHud(vUv), ep);
			return;
		}
		mosaicReveal(ep);
		return;
	}

	float p = clamp(mixProgress, 0.0, 1.0);
	// Deadzone: tiny wheel must stay on the idle sample path (same as models —
	// no brightness shift). Mosaic only moves tiles; it must not re-light glyphs.
	float mixIdleEps = 0.04;
	if (uLayerMode > 0.5) {
		// Chrome path unused for WebGL left band — keep for shader symmetry.
		if (p <= mixIdleEps) {
			gl_FragColor = hudIdleStyle(sampleHud(mapFrom, vUv), 1.0);
			return;
		}
		if (p >= 1.0 - mixIdleEps) {
			gl_FragColor = hudIdleStyle(sampleHud(mapTo, vUv), 1.0);
			return;
		}
		gl_FragColor = hudOverIdle(
			sampleHud(mapFrom, vUv),
			1.0 - p,
			sampleHud(mapTo, vUv),
			p
		);
		return;
	}

	if (p <= mixIdleEps) {
		gl_FragColor = hudIdleStyle(sampleHud(mapFrom, vUv), 1.0);
		return;
	}
	if (p >= 1.0 - mixIdleEps) {
		gl_FragColor = hudIdleStyle(sampleHud(mapTo, vUv), 1.0);
		return;
	}

	if (!inMosaic(vUv)) {
		gl_FragColor = hudOverIdle(
			sampleHud(mapFrom, vUv),
			1.0 - p,
			sampleHud(mapTo, vUv),
			p
		);
		return;
	}

	float lpGuess;
	vec2 fromOffGuess;
	vec2 toOffGuess;
	tileMotion(cellId(vUv), p, lpGuess, fromOffGuess, toOffGuess);

	vec2 fromSrcGuess = vUv + fromOffGuess;
	float lpFrom;
	vec2 fromOff;
	vec2 toOffUnused;
	tileMotion(cellId(fromSrcGuess), p, lpFrom, fromOff, toOffUnused);
	vec2 fromSample = vUv + fromOff;
	vec4 fromColor = (inTex(fromSample) && inMosaic(fromSample)) ? sampleHud(mapFrom, fromSample) : vec4(0.0);

	vec2 toSrcGuess = vUv + toOffGuess;
	float lpTo;
	vec2 fromOffUnused;
	vec2 toOff;
	tileMotion(cellId(toSrcGuess), p, lpTo, fromOffUnused, toOff);
	vec2 toSample = vUv + toOff;
	vec4 toColor = (inTex(toSample) && inMosaic(toSample)) ? sampleHud(mapTo, toSample) : vec4(0.0);

	gl_FragColor = hudOverIdle(fromColor, 1.0 - lpFrom, toColor, lpTo);
}
`;

function syncTexture(existing, canvas, needsUpload) {
	if (!canvas?.width || !canvas?.height) {
		existing?.dispose();
		return null;
	}
	if (existing && existing.image === canvas) {
		// Repair if hex-bake / compositor briefly stamped sRGB onto this UI map.
		if (existing.colorSpace !== THREE.NoColorSpace) {
			existing.colorSpace = THREE.NoColorSpace;
		}
		if (needsUpload) {
			existing.needsUpdate = true;
		}
		return existing;
	}
	existing?.dispose();
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.NoColorSpace;
	texture.minFilter = THREE.NearestFilter;
	texture.magFilter = THREE.NearestFilter;
	texture.generateMipmaps = false;
	texture.wrapS = THREE.ClampToEdgeWrapping;
	texture.wrapT = THREE.ClampToEdgeWrapping;
	return texture;
}

const DEFAULT_MOSAIC = {
	columns: 28,
	rows: 24,
	liftStrength: 0.005,
	randomLift: 150,
	scatterX: 0,
	delay: 0.75,
};

function createHudMaterial(layerMode) {
	return new THREE.ShaderMaterial({
		uniforms: {
			mapFrom: { value: null },
			mapTo: { value: null },
			mixProgress: { value: 0 },
			uEnterProgress: { value: -1 },
			opacity: { value: 1 },
			// Screen overlay path — never Linear models RT for left HUD.
			uWorkingLinear: { value: 0 },
			uLayerMode: { value: layerMode },
			uFollowEnter: { value: 1 },
			uGrid: { value: new THREE.Vector2(DEFAULT_MOSAIC.columns, DEFAULT_MOSAIC.rows) },
			uLiftStrength: { value: DEFAULT_MOSAIC.liftStrength },
			uRandomLiftPx: { value: DEFAULT_MOSAIC.randomLift },
			uScatterPx: { value: DEFAULT_MOSAIC.scatterX },
			uDelay: { value: DEFAULT_MOSAIC.delay },
			uTravelSign: { value: 1 },
			uTexelSize: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
			uMosaicRect: { value: new THREE.Vector4(0, 0, 1, 1) },
			uClipRect: { value: new THREE.Vector4(0, 0, 1, 1) },
			...createHexGridCutUniforms(),
		},
		vertexShader,
		fragmentShader,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
		blending: THREE.NormalBlending,
	});
}

function setRectUniform(uniform, rect, fallback = { minX: 0, minY: 0, maxX: 1, maxY: 1 }) {
	const src = rect ?? fallback;
	uniform.value.set(
		src.minX ?? 0,
		src.minY ?? 0,
		src.maxX ?? 1,
		src.maxY ?? 1,
	);
}

/**
 * Left-panel HUD only (WebGL).
 * Project nav / all-projects chrome is pure DOM in CaseStudyPanelHudPainter —
 * never uploaded here, never hex-embedded in models RT.
 */
export class CaseStudyPanelHudMesh {
	/**
	 * @param {THREE.Scene | THREE.Object3D} modelsParent — retained for API compat; mesh lives in overlay
	 */
	constructor(modelsParent) {
		this.modelsParent = modelsParent;
		this.parent = modelsParent;
		this.overlayScene = new THREE.Scene();
		this.overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
		/** @type {'models' | 'screen'} Always screen while case open; models only when hidden. */
		this.composeMode = "screen";
		this.revision = -1;
		/** Layout fingerprint — avoid rewriting static mosaic uniforms every frame. */
		this._layoutKey = "";
		this.fromTexture = null;
		this.toTexture = null;
		this.visible = true;
		/** When true, empty bridge must not dispose GPU textures (preloader warm). */
		this.keepAliveTextures = false;
		/**
		 * Session GPU maps keyed by canvas element. With keepAlive, pair swaps only
		 * rebind uniforms — never dispose/recreate mid-scroll.
		 * @type {Map<HTMLCanvasElement, THREE.CanvasTexture>}
		 */
		this._texturePool = new Map();
		/**
		 * About left HUD — read About bridge via this module's import (same singleton as
		 * DigitalMonsterThreeApp). Avoid setBridgeSource closures from a duplicated chunk.
		 */
		this._useAboutBridge = false;

		this.contentMaterial = createHudMaterial(0);

		const geo = new THREE.PlaneGeometry(2, 2);
		this.contentMesh = new THREE.Mesh(geo, this.contentMaterial);
		this.contentMesh.frustumCulled = false;
		this.contentMesh.renderOrder = 1200;
		this.contentMesh.visible = false;

		// Back-compat alias used by older call sites.
		this.mesh = this.contentMesh;
		this.material = this.contentMaterial;

		this.overlayScene.add(this.contentMesh);
		// No bridge sync listener — active HUD polls enter/mix in syncAnimUniforms
		// (avoids every dormant case mesh waking on enterProgress ticks).
		/** @type {null | {
		 *   getState: () => ReturnType<typeof getCasePanelHudState>,
		 *   getEnterProgress: () => number | null,
		 *   getEnterTravelSign: () => number,
		 *   getMixProgress?: () => number,
		 * }} */
		this._bridgeSource = null;
	}

	/**
	 * Bind this mesh to the About-owned HUD bridge (not the case bridge).
	 * Prefer this over setBridgeSource so readers share one module instance.
	 * @param {boolean} enabled
	 */
	setUseAboutBridge(enabled) {
		this._useAboutBridge = Boolean(enabled);
		this._bridgeSource = null;
		this.revision = -1;
		this._layoutKey = "";
	}

	/**
	 * Override case bridge readers (legacy). Prefer setUseAboutBridge for About.
	 * @param {null | {
	 *   getState: () => ReturnType<typeof getCasePanelHudState>,
	 *   getEnterProgress: () => number | null,
	 *   getEnterTravelSign: () => number,
	 *   getMixProgress?: () => number,
	 * }} source
	 */
	setBridgeSource(source) {
		this._bridgeSource = source ?? null;
		if (source) {
			this._useAboutBridge = false;
		}
		this.revision = -1;
		this._layoutKey = "";
	}

	_bridgeGetState() {
		if (this._useAboutBridge) {
			return getAboutPanelHudState();
		}
		return this._bridgeSource?.getState?.() ?? getCasePanelHudState();
	}

	_bridgeGetEnterProgress() {
		if (this._useAboutBridge) {
			return getAboutPanelHudEnterProgress();
		}
		return this._bridgeSource?.getEnterProgress?.() ?? getCasePanelHudEnterProgress();
	}

	_bridgeGetEnterTravelSign() {
		if (this._useAboutBridge) {
			return getAboutPanelHudEnterTravelSign();
		}
		return this._bridgeSource?.getEnterTravelSign?.() ?? getCasePanelHudEnterTravelSign();
	}

	_bridgeGetMixProgress() {
		if (this._useAboutBridge) {
			return getAboutPanelHudMixProgress();
		}
		if (typeof this._bridgeSource?.getMixProgress === "function") {
			return this._bridgeSource.getMixProgress();
		}
		const localeMix = getCasePanelHudLocaleMixProgress();
		if (localeMix != null) {
			return localeMix;
		}
		const clickMix = getCaseStageClickMosaicProgress();
		return clickMix != null ? clickMix : getStageProgress();
	}

	setVisible(visible) {
		this.visible = Boolean(visible);
		this.contentMesh.visible = this.visible && Boolean(this.fromTexture);
	}

	/**
	 * Acquire / refresh a pooled CanvasTexture for a warm canvas.
	 * @param {HTMLCanvasElement} canvas
	 * @param {boolean} needsUpload
	 * @param {import('three').WebGLRenderer | null} [renderer]
	 */
	_poolTexture(canvas, needsUpload, renderer = null) {
		if (!canvas?.width || !canvas?.height) {
			return null;
		}
		let texture = this._texturePool.get(canvas) ?? null;
		const created = !texture;
		texture = syncTexture(texture, canvas, needsUpload || created);
		if (!texture) {
			return null;
		}
		this._texturePool.set(canvas, texture);
		if (created && renderer?.initTexture) {
			renderer.initTexture(texture);
		} else if (needsUpload && renderer?.initTexture) {
			renderer.initTexture(texture);
		}
		return texture;
	}

	/**
	 * Drop pooled textures whose canvases are no longer in the session set.
	 * @param {Iterable<HTMLCanvasElement>} keepCanvases
	 */
	_pruneTexturePool(keepCanvases) {
		const keep = new Set(keepCanvases);
		for (const [canvas, texture] of this._texturePool) {
			if (keep.has(canvas)) {
				continue;
			}
			texture.dispose();
			this._texturePool.delete(canvas);
		}
	}

	/**
	 * GPU-upload canvases into the keepAlive pool (no visibility / bind changes).
	 * @param {HTMLCanvasElement[]} canvases
	 * @param {import('three').WebGLRenderer | null} [renderer]
	 */
	warmTexturePool(canvases, renderer = null) {
		const poolCanvases = (canvases ?? []).filter((c) => c?.width && c?.height);
		if (!poolCanvases.length) {
			return;
		}
		this.keepAliveTextures = true;
		this._pruneTexturePool(poolCanvases);
		for (const canvas of poolCanvases) {
			this._poolTexture(canvas, true, renderer);
		}
	}

	/**
	 * Upload prepared from/to canvases under the preloader. Meshes stay hidden
	 * until the case is active; textures survive bridge clears.
	 * Optional `extraCanvases` are GPU-warmed into the keepAlive pool so later
	 * pair swaps (About text3/empty) never first-touch upload mid-scroll.
	 * @param {HTMLCanvasElement} fromCanvas
	 * @param {HTMLCanvasElement} toCanvas
	 * @param {object | null} mosaic
	 * @param {import('three').WebGLRenderer | null} [renderer]
	 * @param {HTMLCanvasElement[]} [extraCanvases]
	 */
	applyWarmCanvases(fromCanvas, toCanvas, mosaic, renderer = null, extraCanvases = []) {
		if (!fromCanvas?.width || !fromCanvas?.height) {
			return;
		}

		const toC = toCanvas?.width ? toCanvas : fromCanvas;
		this.warmTexturePool([fromCanvas, toC, ...extraCanvases], renderer);

		const nextFrom = this._poolTexture(fromCanvas, false, renderer);
		const nextTo = toC === fromCanvas
			? nextFrom
			: this._poolTexture(toC, false, renderer);

		this.fromTexture = nextFrom;
		this.toTexture = nextTo;
		this.contentMaterial.uniforms.mapFrom.value = this.fromTexture;
		this.contentMaterial.uniforms.mapTo.value = this.toTexture ?? this.fromTexture;

		const contentRect = mosaic?.contentRectUv ?? mosaic?.rectUv ?? null;
		this._applyLayerUniforms(this.contentMaterial, mosaic, fromCanvas, contentRect, contentRect);

		this.contentMesh.visible = false;
		this.visible = false;
	}

	setOpacity(opacity) {
		this.contentMaterial.uniforms.opacity.value = Math.max(0, Math.min(1, opacity));
	}

	/**
	 * Idle + hex: screen overlay (after bloom). Models only when case closed/hidden.
	 * Hex cut is shader-side via setHexCutFromPass — do not reparent into models RT.
	 * @param {'models' | 'screen'} mode
	 */
	setComposeMode(mode) {
		const next = mode === "screen" ? "screen" : "models";
		if (next === this.composeMode) {
			return;
		}
		this.composeMode = next;
		this.contentMesh.removeFromParent();
		if (next === "screen") {
			this.overlayScene.add(this.contentMesh);
			this.contentMaterial.uniforms.uWorkingLinear.value = 0;
		} else {
			// Hidden / inactive — keep mesh out of models RT (no bloom path for glyphs).
			this.overlayScene.add(this.contentMesh);
			this.contentMaterial.uniforms.uWorkingLinear.value = 0;
		}
	}

	/**
	 * Sync hex wipe cut from the live HexGridOverlayPass material.
	 * @param {THREE.ShaderMaterial | null | undefined} hexMaterial
	 * @param {number} progressAbs
	 * @param {boolean} revealFromTop
	 */
	setHexCutFromPass(hexMaterial, progressAbs, revealFromTop) {
		syncHexGridCutFromHexMaterial(
			this.contentMaterial,
			hexMaterial,
			progressAbs,
			revealFromTop,
		);
	}

	/** Clear hex cut (full HUD visible). */
	clearHexCut() {
		const u = this.contentMaterial.uniforms;
		if (u.uHexProgress) {
			u.uHexProgress.value = 0;
		}
	}

	/**
	 * After final frame — left content when composeMode === "screen".
	 * Keep renderer.outputColorSpace as-is (SRGB after drawToScreen).
	 * Forcing LinearSRGB made canvas rgba(255,255,255,α) textMuted read as
	 * full-bright white — and it stuck looking wrong after the first leave scroll.
	 */
	renderScreenOverlay(renderer) {
		if (this.composeMode !== "screen" || !this.contentMesh.visible) {
			return;
		}

		const prevAutoClear = renderer.autoClear;
		renderer.autoClear = false;
		renderer.render(this.overlayScene, this.overlayCamera);
		renderer.autoClear = prevAutoClear;
	}

	_layoutFingerprint(mosaic, canvas, clipRect) {
		const cfg = mosaic ?? DEFAULT_MOSAIC;
		const width = Math.max(1, canvas?.width || cfg.canvasWidth || 1920);
		const height = Math.max(1, canvas?.height || cfg.canvasHeight || 1080);
		const rect = clipRect ?? {};
		return [
			width,
			height,
			cfg.columns ?? DEFAULT_MOSAIC.columns,
			cfg.rows ?? DEFAULT_MOSAIC.rows,
			cfg.liftStrength ?? DEFAULT_MOSAIC.liftStrength,
			cfg.randomLift ?? DEFAULT_MOSAIC.randomLift,
			cfg.scatterX ?? DEFAULT_MOSAIC.scatterX,
			cfg.delay ?? DEFAULT_MOSAIC.delay,
			rect.minX ?? 0,
			rect.minY ?? 0,
			rect.maxX ?? 1,
			rect.maxY ?? 1,
		].join("|");
	}

	_applyLayerUniforms(material, mosaic, canvas, clipRect, mosaicRect) {
		const cfg = mosaic ?? DEFAULT_MOSAIC;
		const width = Math.max(1, canvas?.width || cfg.canvasWidth || 1920);
		const height = Math.max(1, canvas?.height || cfg.canvasHeight || 1080);
		material.uniforms.uGrid.value.set(
			Math.max(1, cfg.columns ?? DEFAULT_MOSAIC.columns),
			Math.max(1, cfg.rows ?? DEFAULT_MOSAIC.rows),
		);
		material.uniforms.uLiftStrength.value = Math.max(0, cfg.liftStrength ?? DEFAULT_MOSAIC.liftStrength);
		material.uniforms.uRandomLiftPx.value = Math.max(0, cfg.randomLift ?? DEFAULT_MOSAIC.randomLift);
		material.uniforms.uScatterPx.value = cfg.scatterX ?? DEFAULT_MOSAIC.scatterX;
		material.uniforms.uDelay.value = Math.max(0, Math.min(0.999, cfg.delay ?? DEFAULT_MOSAIC.delay));
		material.uniforms.uTexelSize.value.set(1 / width, 1 / height);
		setRectUniform(material.uniforms.uClipRect, clipRect);
		setRectUniform(material.uniforms.uMosaicRect, mosaicRect ?? clipRect);
		material.uniforms.uFollowEnter.value = 1;
	}

	/**
	 * Textures + static mosaic layout — only when bridge revision / layout changes.
	 * @returns {boolean} true when bridge has drawable content (or keepAlive warm)
	 */
	syncContentIfNeeded() {
		const state = this._bridgeGetState();
		const fromCanvas = state.fromCanvas;
		const toCanvas = state.toCanvas;

		if (!fromCanvas?.width || !fromCanvas?.height) {
			if (this.keepAliveTextures && this.fromTexture) {
				this.revision = state.revision;
				this.contentMesh.visible = this.visible && Boolean(this.fromTexture);
				return true;
			}
			if (this.fromTexture || this.toTexture) {
				this.fromTexture?.dispose();
				this.toTexture?.dispose();
				this.fromTexture = null;
				this.toTexture = null;
				this.contentMaterial.uniforms.mapFrom.value = null;
				this.contentMaterial.uniforms.mapTo.value = null;
				this.revision = state.revision;
				this._layoutKey = "";
			}
			this.contentMesh.visible = false;
			return false;
		}

		if (state.revision !== this.revision) {
			const fromC = fromCanvas;
			const toC = toCanvas ?? fromCanvas;
			const dirty = state.dirtyCanvases;
			const fromDirty = !dirty || dirty.has(fromC);
			const toDirty = !dirty || dirty.has(toC);

			let nextFrom;
			let nextTo;
			if (this.keepAliveTextures) {
				// Rebind from the warm pool — never dispose the outgoing map mid-scroll.
				nextFrom = this._poolTexture(fromC, fromDirty);
				nextTo = toC === fromC ? nextFrom : this._poolTexture(toC, toDirty);
			} else {
				const pickExisting = (canvas) => {
					if (this.fromTexture?.image === canvas) {
						return this.fromTexture;
					}
					if (this.toTexture?.image === canvas) {
						return this.toTexture;
					}
					return null;
				};

				nextFrom = syncTexture(pickExisting(fromC), fromC, fromDirty);
				nextTo = toC === fromC
					? nextFrom
					: syncTexture(pickExisting(toC), toC, toDirty);

				for (const tex of [this.fromTexture, this.toTexture]) {
					if (tex && tex !== nextFrom && tex !== nextTo) {
						tex.dispose();
					}
				}
			}

			this.fromTexture = nextFrom;
			this.toTexture = nextTo;
			this.contentMaterial.uniforms.mapFrom.value = this.fromTexture;
			this.contentMaterial.uniforms.mapTo.value = this.toTexture ?? this.fromTexture;
			this.revision = state.revision;
		}

		const mosaic = state.mosaic;
		const contentRect = mosaic?.contentRectUv ?? mosaic?.rectUv ?? null;
		const layoutKey = this._layoutFingerprint(mosaic, fromCanvas, contentRect);
		if (layoutKey !== this._layoutKey) {
			this._layoutKey = layoutKey;
			this._applyLayerUniforms(
				this.contentMaterial,
				mosaic,
				fromCanvas,
				contentRect,
				contentRect,
			);
		}

		this.contentMesh.visible = this.visible && Boolean(this.fromTexture);
		return Boolean(this.fromTexture);
	}

	/** Per-frame scalars only — mosaic motion / enter reveal. */
	syncAnimUniforms() {
		const enter = this._bridgeGetEnterProgress();
		// null = idle full show (−1 disables enter path). 0 = hidden for appear/leave.
		// Do NOT map null→0 when keepAlive lacks a bridge canvas — that permanently
		// hides warm glyphs after a cleared bridge / botched locale reveal.
		const enterValue = enter == null ? -1 : enter;
		const travel = this._bridgeGetEnterTravelSign();
		const mix = this._bridgeGetMixProgress();

		this.contentMaterial.uniforms.uEnterProgress.value = enterValue;
		this.contentMaterial.uniforms.uTravelSign.value = travel;
		this.contentMaterial.uniforms.mixProgress.value = Number.isFinite(mix) ? mix : 0;
		this.contentMesh.visible = this.visible && Boolean(this.fromTexture);
	}

	/** Active HUD: content (if dirty) + anim uniforms. */
	syncFromBridge() {
		if (!this.syncContentIfNeeded()) {
			return;
		}
		// Hex-bake blit must not leave sRGB stamped on these maps for the screen pass.
		for (const tex of [this.fromTexture, this.toTexture]) {
			if (tex && tex.colorSpace !== THREE.NoColorSpace) {
				tex.colorSpace = THREE.NoColorSpace;
			}
		}
		this.syncAnimUniforms();
	}

	dispose() {
		this.contentMesh.removeFromParent();
		for (const texture of this._texturePool.values()) {
			texture.dispose();
		}
		this._texturePool.clear();
		if (!this.keepAliveTextures) {
			this.fromTexture?.dispose();
			this.toTexture?.dispose();
		}
		this.contentMaterial.dispose();
		this.contentMesh.geometry.dispose();
		this.fromTexture = null;
		this.toTexture = null;
	}
}
