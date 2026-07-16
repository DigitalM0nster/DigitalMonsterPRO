import * as THREE from "three";
import {
	getCasePanelHudEnterProgress,
	getCasePanelHudEnterTravelSign,
	getCasePanelHudState,
	registerCasePanelHudSyncListener,
} from "@/portfolio/core/casePanelHudBridge.js";
import { getCaseStageClickMosaicProgress } from "@/portfolio/core/caseStageClickMosaic.js";
import { getStageProgress } from "@/portfolio/core/stageProgress.js";

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Shared HUD fragment:
 * uLayerMode 0 = left content (may live in models RT during hex).
 * uLayerMode 1 = project nav chrome (always screen overlay — never hex).
 * uClipRect discards outside the layer band. Mosaic runs inside uMosaicRect.
 * uFollowEnter: chrome only — when 0, ignore enterProgress (case→case keep nav).
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
	localProgress = clamp(p * 0.15 + delayedProgress * 0.85, 0.0, 1.0);
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
	vec4 toColor = (inTex(toSample) && inMosaic(toSample)) ? sampleHud(mapFrom, toSample) : vec4(0.0);
	float aOut = lpTo * toColor.a;
	gl_FragColor = vec4(toColor.rgb, aOut * opacity);
}

void main() {
	if (!inClip(vUv)) {
		discard;
	}

	bool useEnter = uEnterProgress >= 0.0 && (uLayerMode < 0.5 || uFollowEnter > 0.5);

	if (useEnter) {
		float ep = clamp(uEnterProgress, 0.0, 1.0);
		if (ep <= 0.0001) {
			gl_FragColor = vec4(0.0);
			return;
		}
		if (ep >= 0.9999) {
			vec4 color = sampleHud(mapFrom, vUv);
			gl_FragColor = vec4(color.rgb, color.a * opacity);
			return;
		}
		if (!inMosaic(vUv)) {
			vec4 color = sampleHud(mapFrom, vUv);
			gl_FragColor = vec4(color.rgb, color.a * ep * opacity);
			return;
		}
		mosaicReveal(ep);
		return;
	}

	float p = clamp(mixProgress, 0.0, 1.0);
	if (uLayerMode > 0.5) {
		// Chrome: no stage mosaic — always show from (or crossfade if needed).
		if (p <= 0.0001) {
			vec4 color = sampleHud(mapFrom, vUv);
			gl_FragColor = vec4(color.rgb, color.a * opacity);
			return;
		}
		if (p >= 0.9999) {
			vec4 color = sampleHud(mapTo, vUv);
			gl_FragColor = vec4(color.rgb, color.a * opacity);
			return;
		}
		vec4 fromColor = sampleHud(mapFrom, vUv);
		vec4 toColor = sampleHud(mapTo, vUv);
		float aFrom = fromColor.a * (1.0 - p);
		float aTo = toColor.a * p;
		float aOut = aFrom + aTo * (1.0 - aFrom);
		vec3 rgb = vec3(0.0);
		if (aOut > 0.0001) {
			rgb = (fromColor.rgb * aFrom + toColor.rgb * aTo * (1.0 - aFrom)) / aOut;
		}
		gl_FragColor = vec4(rgb, aOut * opacity);
		return;
	}

	if (p <= 0.0001) {
		vec4 color = sampleHud(mapFrom, vUv);
		gl_FragColor = vec4(color.rgb, color.a * opacity);
		return;
	}
	if (p >= 0.9999) {
		vec4 color = sampleHud(mapTo, vUv);
		gl_FragColor = vec4(color.rgb, color.a * opacity);
		return;
	}

	if (!inMosaic(vUv)) {
		vec4 fromColor = sampleHud(mapFrom, vUv);
		vec4 toColor = sampleHud(mapTo, vUv);
		float aFrom = fromColor.a * (1.0 - p);
		float aTo = toColor.a * p;
		float aOut = aFrom + aTo * (1.0 - aFrom);
		vec3 rgb = vec3(0.0);
		if (aOut > 0.0001) {
			rgb = (fromColor.rgb * aFrom + toColor.rgb * aTo * (1.0 - aFrom)) / aOut;
		}
		gl_FragColor = vec4(rgb, aOut * opacity);
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

	float aFrom = (1.0 - lpFrom) * fromColor.a;
	float aTo = lpTo * toColor.a;
	float aOut = aFrom + aTo * (1.0 - aFrom);
	vec3 rgb = vec3(0.0);
	if (aOut > 0.0001) {
		rgb = (fromColor.rgb * aFrom + toColor.rgb * aTo * (1.0 - aFrom)) / aOut;
	}
	gl_FragColor = vec4(rgb, aOut * opacity);
}
`;

function syncTexture(existing, canvas, needsUpload) {
	if (!canvas?.width || !canvas?.height) {
		existing?.dispose();
		return null;
	}
	if (existing && existing.image === canvas) {
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
			uWorkingLinear: { value: layerMode === 1 ? 0 : 1 },
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
 * never uploaded here, never hex-embedded.
 */
export class CaseStudyPanelHudMesh {
	/**
	 * @param {THREE.Scene | THREE.Object3D} modelsParent — case threeScene for hex participation
	 */
	constructor(modelsParent) {
		this.modelsParent = modelsParent;
		this.parent = modelsParent;
		this.overlayScene = new THREE.Scene();
		this.overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
		/** @type {'models' | 'screen'} */
		this.composeMode = "models";
		this.revision = -1;
		this.fromTexture = null;
		this.toTexture = null;
		this.visible = true;

		this.contentMaterial = createHudMaterial(0);

		const geo = new THREE.PlaneGeometry(2, 2);
		this.contentMesh = new THREE.Mesh(geo, this.contentMaterial);
		this.contentMesh.frustumCulled = false;
		this.contentMesh.renderOrder = 1200;
		this.contentMesh.visible = false;

		// Back-compat alias used by older call sites.
		this.mesh = this.contentMesh;
		this.material = this.contentMaterial;

		this.modelsParent.add(this.contentMesh);

		this._unmapSync = registerCasePanelHudSyncListener(() => {
			this.syncFromBridge();
		});
	}

	setVisible(visible) {
		this.visible = Boolean(visible);
		this.contentMesh.visible = this.visible && Boolean(this.fromTexture);
	}

	setOpacity(opacity) {
		this.contentMaterial.uniforms.opacity.value = Math.max(0, Math.min(1, opacity));
	}

	/**
	 * Models during hex (left text cuttable), screen idle (after bloom).
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
			this.modelsParent.add(this.contentMesh);
			this.contentMaterial.uniforms.uWorkingLinear.value = 1;
		}
	}

	/** After final frame — left content when composeMode === "screen". */
	renderScreenOverlay(renderer) {
		if (this.composeMode !== "screen" || !this.contentMesh.visible) {
			return;
		}

		const prevAutoClear = renderer.autoClear;
		const prevOutputColorSpace = renderer.outputColorSpace;
		renderer.autoClear = false;
		renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
		renderer.render(this.overlayScene, this.overlayCamera);
		renderer.outputColorSpace = prevOutputColorSpace;
		renderer.autoClear = prevAutoClear;
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

	syncFromBridge() {
		const state = getCasePanelHudState();
		const fromCanvas = state.fromCanvas;
		const toCanvas = state.toCanvas;

		if (!fromCanvas?.width || !fromCanvas?.height) {
			if (this.fromTexture || this.toTexture) {
				this.fromTexture?.dispose();
				this.toTexture?.dispose();
				this.fromTexture = null;
				this.toTexture = null;
				this.contentMaterial.uniforms.mapFrom.value = null;
				this.contentMaterial.uniforms.mapTo.value = null;
				this.revision = state.revision;
			}
			this.contentMesh.visible = false;
			return;
		}

		if (state.revision !== this.revision) {
			const fromC = fromCanvas;
			const toC = toCanvas ?? fromCanvas;
			const dirty = state.dirtyCanvases;
			const fromDirty = !dirty || dirty.has(fromC);
			const toDirty = !dirty || dirty.has(toC);

			const pickExisting = (canvas) => {
				if (this.fromTexture?.image === canvas) {
					return this.fromTexture;
				}
				if (this.toTexture?.image === canvas) {
					return this.toTexture;
				}
				return null;
			};

			const nextFrom = syncTexture(pickExisting(fromC), fromC, fromDirty);
			const nextTo = toC === fromC
				? nextFrom
				: syncTexture(pickExisting(toC), toC, toDirty);

			for (const tex of [this.fromTexture, this.toTexture]) {
				if (tex && tex !== nextFrom && tex !== nextTo) {
					tex.dispose();
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

		this._applyLayerUniforms(
			this.contentMaterial,
			mosaic,
			fromCanvas,
			contentRect,
			contentRect,
		);

		const enter = getCasePanelHudEnterProgress();
		const enterValue = enter == null ? -1 : enter;
		const travel = getCasePanelHudEnterTravelSign();
		const clickMix = getCaseStageClickMosaicProgress();
		const mix = clickMix != null ? clickMix : getStageProgress();

		this.contentMaterial.uniforms.uEnterProgress.value = enterValue;
		this.contentMaterial.uniforms.uTravelSign.value = travel;
		this.contentMaterial.uniforms.mixProgress.value = mix;

		this.contentMesh.visible = this.visible && Boolean(this.fromTexture);
	}

	dispose() {
		this._unmapSync?.();
		this._unmapSync = null;
		this.contentMesh.removeFromParent();
		this.fromTexture?.dispose();
		this.toTexture?.dispose();
		this.contentMaterial.dispose();
		this.contentMesh.geometry.dispose();
		this.fromTexture = null;
		this.toTexture = null;
	}
}
