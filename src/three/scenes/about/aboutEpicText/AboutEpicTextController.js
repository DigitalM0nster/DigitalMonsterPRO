import * as THREE from "three";
import { subscribeKey } from "valtio/utils";
import { store } from "@/store.jsx";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { shouldAnimateSiteLocaleForRingScene } from "@/utils/siteLocaleSwitch.js";
import {
	findAllAboutEpicTextPlanes,
	findAboutEpicTextPlane,
	localeFromAboutEpicTextPlaneName,
} from "../normalizeAboutGltfScene.js";
import { aboutEpicTextFragmentShader } from "@/three/shaders/about/aboutEpicTextFragment.glsl.js";
import { aboutEpicTextVertexShader } from "@/three/shaders/about/aboutEpicTextVertex.glsl.js";
import { aboutEpicTextTune } from "./aboutEpicTextConfig.js";
import {
	computeAboutEpicLetterEdgeDistance,
	createAboutEpicOutlineStrokeGeometry,
} from "./aboutEpicTextEdgeDist.js";

/**
 * @typedef {{
 *   locale: string,
 *   root: THREE.Object3D,
 *   mesh: THREE.Mesh,
 *   fillMat: THREE.ShaderMaterial,
 *   stroke: THREE.Mesh | null,
 *   strokeGeo: THREE.BufferGeometry | null,
 *   strokeMat: THREE.ShaderMaterial | null,
 *   bounds: THREE.Vector4,
 *   strokeKey: string,
 * }} EpicLocaleVariant
 */

function makeUniforms(bounds, layer) {
	return {
		uTime: { value: 0 },
		uAppear: { value: 0 },
		uMode: { value: aboutEpicTextTune.mode },
		uIntensity: { value: aboutEpicTextTune.intensity },
		uGlow: { value: aboutEpicTextTune.glow },
		uScanSpeed: { value: aboutEpicTextTune.scanSpeed },
		uGlitch: { value: aboutEpicTextTune.glitch },
		uPointerStrength: { value: aboutEpicTextTune.pointerStrength },
		uOutlineWidth: { value: aboutEpicTextTune.outlineWidth },
		uOutlineBoost: { value: aboutEpicTextTune.outlineBoost },
		uFillDark: { value: aboutEpicTextTune.fillDark },
		uFillOpacity: { value: aboutEpicTextTune.fillOpacity ?? 0 },
		uFlowSpeed: { value: aboutEpicTextTune.flowSpeed },
		uDashCount: { value: aboutEpicTextTune.dashCount ?? 18 },
		uDashLength: { value: aboutEpicTextTune.dashLength ?? 0.22 },
		uDashSoft: { value: aboutEpicTextTune.dashSoft ?? 0.06 },
		uExit: { value: 0 },
		/** Locale signal rewrite: 0 idle · progress 0…1 · role 1=out 2=in */
		uLocale: { value: 0 },
		uLocaleRole: { value: 0 },
		uLayer: { value: layer },
		uPointer: { value: new THREE.Vector2(0, 0) },
		uParallax: { value: aboutEpicTextTune.parallax },
		uBounds: { value: bounds.clone() },
		uTint: { value: new THREE.Color(aboutEpicTextTune.tint) },
		uCore: { value: new THREE.Color(aboutEpicTextTune.core) },
		uOutline: { value: new THREE.Color(aboutEpicTextTune.outline) },
	};
}

function firstMesh(root) {
	if (root?.isMesh) return root;
	let mesh = null;
	root?.traverse?.((obj) => {
		if (mesh || !obj.isMesh) return;
		mesh = obj;
	});
	return mesh;
}

function computeBounds(geometry) {
	const pos = geometry?.getAttribute?.("position");
	const bounds = new THREE.Vector4(-0.26, 0.26, -0.03, 0.17);
	if (!pos) return bounds;
	let minX = Infinity;
	let maxX = -Infinity;
	let minZ = Infinity;
	let maxZ = -Infinity;
	for (let i = 0; i < pos.count; i += 1) {
		const x = pos.getX(i);
		const z = pos.getZ(i);
		minX = Math.min(minX, x);
		maxX = Math.max(maxX, x);
		minZ = Math.min(minZ, z);
		maxZ = Math.max(maxZ, z);
	}
	bounds.set(minX, maxX, minZ, maxZ);
	return bounds;
}

function smootherstep(edge0, edge1, x) {
	const t = THREE.MathUtils.clamp((x - edge0) / Math.max(edge1 - edge0, 1e-5), 0, 1);
	return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Per-locale letter meshes (RU / EN / ZH) + outline strokes.
 * Locale switch: neon signal rewrite (scan-out / scan-in) — not contacts mosaic.
 */
export class AboutEpicTextController {
	constructor() {
		/** @type {Map<string, EpicLocaleVariant>} */
		this._variants = new Map();
		this._activeLocale = "ru";
		this._appear = 0;
		this._exit = 0;
		this._contentVisible = false;
		this._smoothPointer = new THREE.Vector2(0, 0);
		this._ready = false;
		this._disposed = false;
		this._lastStrokeTuneKey = "";

		/**
		 * Locale signal rewrite — same chain rule as panel HUD locale mix:
		 * never interrupt an in-flight wipe; after it ends, chase store locale.
		 */
		this._localeMixing = false;
		this._localeFrom = "ru";
		this._localeTo = "ru";
		this._localeMixT = 1;
		/** Fully settled language (end of last completed wipe). */
		this._displayedLocale = "ru";
		/** Latest requested language (store). */
		this._desiredLocale = "ru";
		/** @type {(() => void) | null} */
		this._unsubLocale = null;
	}

	/**
	 * @param {THREE.Object3D} modelRoot
	 * @param {string} [locale]
	 * @returns {Promise<boolean>}
	 */
	async attach(modelRoot, locale = "ru") {
		if (this._disposed || !modelRoot) return false;

		const planes = findAllAboutEpicTextPlanes(modelRoot);
		if (planes.length === 0) {
			const fallback = findAboutEpicTextPlane(modelRoot, "ru");
			if (fallback) planes.push(fallback);
		}
		if (planes.length === 0) {
			if (import.meta.env.DEV) {
				console.warn("[AboutEpicText] No AboutEpicTextPlane* meshes in GLB.");
			}
			return false;
		}

		for (const root of planes) {
			const mesh = firstMesh(root);
			if (!mesh?.geometry) continue;

			const localeKey =
				localeFromAboutEpicTextPlaneName(root.name)
				?? localeFromAboutEpicTextPlaneName(mesh.name)
				?? "ru";

			/** Prefer first mesh found per locale (RU default name wins over RU alias). */
			if (this._variants.has(localeKey) && localeKey === "ru" && root.name !== "AboutEpicTextPlane") {
				root.visible = false;
				continue;
			}
			if (this._variants.has(localeKey)) {
				root.visible = false;
				continue;
			}

			root.userData.aboutEpicTextPlane = true;
			mesh.frustumCulled = false;
			mesh.renderOrder = 12;
			mesh.userData.aboutEpicTextPlane = true;

			const bounds = computeBounds(mesh.geometry);
			const edgeAttr = computeAboutEpicLetterEdgeDistance(mesh.geometry);
			if (edgeAttr) {
				mesh.geometry.setAttribute("aEdgeDist", edgeAttr);
			} else {
				const pos = mesh.geometry.getAttribute("position");
				mesh.geometry.setAttribute(
					"aEdgeDist",
					new THREE.BufferAttribute(new Float32Array(pos?.count ?? 0), 1),
				);
			}

			const fillMat = new THREE.ShaderMaterial({
				uniforms: makeUniforms(bounds, 0),
				vertexShader: aboutEpicTextVertexShader,
				fragmentShader: aboutEpicTextFragmentShader,
				transparent: true,
				depthWrite: false,
				depthTest: false,
				side: THREE.DoubleSide,
				blending: THREE.NormalBlending,
				toneMapped: false,
			});
			fillMat.userData.aboutEpicText = true;
			fillMat.needsUpdate = true;

			const prev = mesh.material;
			mesh.material = fillMat;
			if (prev && prev !== fillMat && prev.userData?.aboutEpicText) {
				prev.dispose();
			}

			/** @type {EpicLocaleVariant} */
			const variant = {
				locale: localeKey,
				root,
				mesh,
				fillMat,
				stroke: null,
				strokeGeo: null,
				strokeMat: null,
				bounds,
				strokeKey: "",
			};
			this._buildStroke(variant, true);
			this._variants.set(localeKey, variant);
			root.visible = false;
			mesh.visible = false;

			/** Let the preloader curtain paint between locale meshes. */
			await new Promise((resolve) => requestAnimationFrame(() => resolve()));
		}

		if (this._variants.size === 0) return false;

		if (import.meta.env.DEV) {
			const locales = [...this._variants.keys()].sort();
			console.info(`[AboutEpicText] Locale meshes: ${locales.join(", ")}`);
			for (const need of ["en", "zh"]) {
				if (!this._variants.has(need)) {
					console.warn(
						`[AboutEpicText] Missing AboutEpicTextPlane${need.toUpperCase()} in GLB — `
						+ `convert Text→Mesh in Blender and re-export AboutUsModel.glb.`,
					);
				}
			}
		}

		this._ready = true;
		this.setLocale(locale, { instant: true });
		this._unsubLocale?.();
		this._unsubLocale = subscribeKey(store, "siteLocale", () => {
			if (this._disposed || !this._ready) return;
			/** Off-About: snap without signal rewrite. On-About: normal chase. */
			this.setLocale(store.siteLocale);
		});
		this.syncTuneFromDev();
		return true;
	}

	/**
	 * @param {EpicLocaleVariant} variant
	 * @param {boolean} [force]
	 */
	_buildStroke(variant, force = false) {
		const t = aboutEpicTextTune;
		const width = Math.max(Number(t.outlineWidth) || 0.002, 0.001);
		const outset = Math.max(Number(t.outlineExpand) || 0, 0);
		const key = `${width.toFixed(4)}|${outset.toFixed(4)}`;
		if (!force && key === variant.strokeKey && variant.stroke) return;
		variant.strokeKey = key;

		if (variant.stroke) {
			variant.stroke.parent?.remove(variant.stroke);
			variant.strokeGeo?.dispose();
			variant.strokeMat?.dispose();
			variant.stroke = null;
			variant.strokeGeo = null;
			variant.strokeMat = null;
		}

		const strokeGeo = createAboutEpicOutlineStrokeGeometry(variant.mesh.geometry, width, outset);
		if (!strokeGeo) return;

		const strokeMat = new THREE.ShaderMaterial({
			uniforms: makeUniforms(variant.bounds, 1),
			vertexShader: aboutEpicTextVertexShader,
			fragmentShader: aboutEpicTextFragmentShader,
			transparent: true,
			depthWrite: false,
			depthTest: false,
			side: THREE.DoubleSide,
			blending: THREE.AdditiveBlending,
			toneMapped: false,
		});
		strokeMat.userData.aboutEpicText = true;
		strokeMat.needsUpdate = true;

		const stroke = new THREE.Mesh(strokeGeo, strokeMat);
		stroke.name = "AboutEpicTextOutlineStroke";
		stroke.frustumCulled = false;
		stroke.renderOrder = 14;
		stroke.userData.aboutEpicTextStroke = true;
		stroke.visible = variant.mesh.visible;

		variant.mesh.add(stroke);
		variant.stroke = stroke;
		variant.strokeGeo = strokeGeo;
		variant.strokeMat = strokeMat;
	}

	/**
	 * @param {EpicLocaleVariant | null | undefined} variant
	 * @param {boolean} on
	 */
	_setVariantVisible(variant, on) {
		if (!variant) return;
		variant.root.visible = on;
		variant.mesh.visible = on;
		if (variant.stroke) variant.stroke.visible = on;
	}

	/**
	 * @param {EpicLocaleVariant | null | undefined} variant
	 * @param {{
	 *   appear?: number,
	 *   exit?: number,
	 *   locale?: number,
	 *   role?: number,
	 * }} state
	 */
	_setVariantProgress(variant, state = {}) {
		if (!variant) return;
		const a = THREE.MathUtils.clamp(state.appear ?? 0, 0, 1);
		const e = THREE.MathUtils.clamp(state.exit ?? 0, 0, 1);
		const locale = THREE.MathUtils.clamp(state.locale ?? 0, 0, 1);
		const role = Number(state.role) || 0;
		for (const mat of [variant.fillMat, variant.strokeMat]) {
			if (!mat?.uniforms) continue;
			mat.uniforms.uAppear.value = a;
			mat.uniforms.uExit.value = e;
			if (mat.uniforms.uLocale) mat.uniforms.uLocale.value = locale;
			if (mat.uniforms.uLocaleRole) mat.uniforms.uLocaleRole.value = role;
		}
	}

	/**
	 * Resolve variant for a locale key (fallback ru).
	 * @param {string} locale
	 * @returns {EpicLocaleVariant | null}
	 */
	_resolveVariant(locale) {
		const key = normalizeSiteLocale(locale);
		return this._variants.get(key)
			?? this._variants.get("ru")
			?? this._variants.values().next().value
			?? null;
	}

	_finishLocaleInstant(locale) {
		const active = this._resolveVariant(locale);
		const key = active?.locale ?? "ru";
		this._activeLocale = key;
		this._displayedLocale = key;
		this._desiredLocale = key;
		this._localeFrom = key;
		this._localeTo = key;
		this._localeMixT = 1;
		this._localeMixing = false;
		this._applyLocaleVisuals();
	}

	/**
	 * Start a wipe from → to. Caller must ensure not already mixing.
	 * @param {string} fromLocale
	 * @param {string} toLocale
	 */
	_startLocaleMix(fromLocale, toLocale) {
		const from = this._resolveVariant(fromLocale);
		const to = this._resolveVariant(toLocale);
		if (!to) return;
		const fromKey = from?.locale ?? this._displayedLocale;
		const toKey = to.locale;
		if (fromKey === toKey) {
			this._displayedLocale = toKey;
			this._activeLocale = toKey;
			this._localeFrom = toKey;
			this._localeTo = toKey;
			this._localeMixT = 1;
			this._localeMixing = false;
			this._applyLocaleVisuals();
			return;
		}
		this._localeFrom = fromKey;
		this._localeTo = toKey;
		this._localeMixT = 0;
		this._localeMixing = true;
		this._activeLocale = toKey;
		this._applyLocaleVisuals();
	}

	/**
	 * After a wipe completes: settle displayed, then chain if store moved again.
	 */
	_onLocaleMixComplete() {
		this._localeMixing = false;
		this._localeMixT = 1;
		this._displayedLocale = this._localeTo;
		this._activeLocale = this._localeTo;
		this._localeFrom = this._localeTo;

		const desired = this._resolveVariant(this._desiredLocale)?.locale ?? this._displayedLocale;
		this._desiredLocale = desired;
		if (desired !== this._displayedLocale && this._contentVisible && this._appear >= 0.02) {
			this._startLocaleMix(this._displayedLocale, desired);
			return;
		}
		this._applyLocaleVisuals();
	}

	/**
	 * @param {string} locale
	 * @param {{ instant?: boolean }} [opts]
	 */
	setLocale(locale, opts = {}) {
		const nextKey = normalizeSiteLocale(locale);
		const next = this._resolveVariant(nextKey);
		if (!next) return;

		const resolved = next.locale;
		this._desiredLocale = resolved;

		const instant = opts.instant === true
			|| !this._contentVisible
			|| this._appear < 0.02
			|| !shouldAnimateSiteLocaleForRingScene("about");
		if (instant) {
			this._finishLocaleInstant(resolved);
			return;
		}

		/** In-flight wipe must finish; chain runs in `_onLocaleMixComplete`. */
		if (this._localeMixing) {
			return;
		}

		if (resolved === this._displayedLocale) {
			this._activeLocale = resolved;
			this._applyLocaleVisuals();
			return;
		}

		this._startLocaleMix(this._displayedLocale, resolved);
	}

	/**
	 * Idle: story appear + contacts exit mosaic.
	 * Locale mix: neon signal rewrite (role 1 out / 2 in) — never contacts mosaic.
	 */
	_applyLocaleVisuals() {
		const storyAppear = this._appear;
		const storyExit = this._exit;
		const showContent = this._contentVisible;

		if (!showContent) {
			for (const variant of this._variants.values()) {
				this._setVariantVisible(variant, false);
				this._setVariantProgress(variant, {
					appear: 0,
					exit: storyExit,
					locale: 0,
					role: 0,
				});
			}
			return;
		}

		if (this._localeMixing) {
			const t = this._localeMixT;
			/**
			 * Choreography:
			 *  0…55%  — old language scan-dissolves L→R
			 *  28…100% — new language scan-assembles L→R (overlap = continuous neon blade)
			 */
			const fromLocale = smootherstep(0, 0.55, t);
			const toLocale = smootherstep(0.28, 1, t);
			const from = this._resolveVariant(this._localeFrom);
			const to = this._resolveVariant(this._localeTo);

			for (const variant of this._variants.values()) {
				if (variant === from) {
					const stillVisible = fromLocale < 0.985 && storyAppear > 0.004;
					this._setVariantVisible(variant, stillVisible);
					this._setVariantProgress(variant, {
						appear: storyAppear,
						exit: storyExit,
						locale: fromLocale,
						role: 1,
					});
				} else if (variant === to) {
					const stillVisible = toLocale > 0.02 && storyAppear > 0.004 && storyExit < 0.995;
					this._setVariantVisible(variant, stillVisible);
					this._setVariantProgress(variant, {
						appear: storyAppear,
						exit: storyExit,
						locale: toLocale,
						role: 2,
					});
				} else {
					this._setVariantVisible(variant, false);
					this._setVariantProgress(variant, {
						appear: 0,
						exit: 0,
						locale: 0,
						role: 0,
					});
				}
			}
			return;
		}

		const active = this._resolveVariant(this._activeLocale);
		for (const variant of this._variants.values()) {
			const on = variant === active;
			this._setVariantVisible(variant, on);
			this._setVariantProgress(variant, {
				appear: on ? storyAppear : 0,
				exit: on ? storyExit : 0,
				locale: 0,
				role: 0,
			});
		}
	}

	/** @returns {THREE.Object3D | null} */
	getActiveRoot() {
		return this._variants.get(this._activeLocale)?.root
			?? this._variants.get("ru")?.root
			?? null;
	}

	syncTuneFromDev() {
		const t = aboutEpicTextTune;
		const tuneKey = `${t.outlineWidth}|${t.outlineExpand}`;
		const rebuildStroke = tuneKey !== this._lastStrokeTuneKey;
		this._lastStrokeTuneKey = tuneKey;

		for (const variant of this._variants.values()) {
			if (rebuildStroke) this._buildStroke(variant, true);
			for (const mat of [variant.fillMat, variant.strokeMat]) {
				const u = mat?.uniforms;
				if (!u) continue;
				u.uMode.value = t.mode;
				u.uIntensity.value = t.intensity;
				u.uGlow.value = t.glow;
				u.uScanSpeed.value = t.scanSpeed;
				u.uGlitch.value = t.glitch;
				u.uPointerStrength.value = t.pointerStrength;
				u.uParallax.value = t.parallax;
				u.uOutlineWidth.value = t.outlineWidth;
				u.uOutlineBoost.value = t.outlineBoost;
				u.uFillDark.value = t.fillDark;
				u.uFillOpacity.value = t.fillOpacity ?? 0;
				u.uFlowSpeed.value = t.flowSpeed;
				u.uDashCount.value = t.dashCount ?? 18;
				u.uDashLength.value = t.dashLength ?? 0.22;
				u.uDashSoft.value = t.dashSoft ?? 0.06;
				u.uTint.value.set(t.tint);
				u.uCore.value.set(t.core);
				u.uOutline.value.set(t.outline);
			}
		}
		this._applyLocaleVisuals();
	}

	/**
	 * @param {number} story
	 * @param {number} [exitProgress]
	 */
	setStoryProgress(story, exitProgress = 0) {
		const t = aboutEpicTextTune;
		const start = t.appearStoryStart ?? 3;
		const end = Math.max(start + 1e-4, t.appearStoryEnd ?? 3.35);
		this._appear = THREE.MathUtils.clamp((story - start) / (end - start), 0, 1);
		this._exit = THREE.MathUtils.clamp(Number(exitProgress) || 0, 0, 1);
		this._contentVisible = this._appear > 0.004 && this._exit < 0.995;

		if (!this._contentVisible && this._localeMixing) {
			/** Hidden: drop in-flight wipe and snap to latest desired. */
			this._finishLocaleInstant(this._desiredLocale);
			return;
		}

		this._applyLocaleVisuals();
	}

	/**
	 * @param {number} dt
	 */
	_tickLocaleMix(dt) {
		if (!this._localeMixing) return;
		const ms = Math.max(120, Number(aboutEpicTextTune.localeSwapMs) || 1100);
		this._localeMixT = Math.min(1, this._localeMixT + Math.max(dt, 0) * (1000 / ms));
		if (this._localeMixT >= 1) {
			this._onLocaleMixComplete();
		}
	}

	/**
	 * @param {number} elapsed
	 * @param {{ x?: number, y?: number } | null} pointer
	 * @param {number} [dt]
	 * @param {string} [locale]
	 */
	update(elapsed, pointer, dt = 1 / 60, locale) {
		if (!this._ready) return;
		if (locale != null) {
			this.setLocale(locale);
		}
		this._tickLocaleMix(dt);
		this.syncTuneFromDev();

		const px = Number(pointer?.x) || 0;
		const py = Number(pointer?.y) || 0;
		const damp = 1 - Math.exp(-10 * Math.max(dt, 0));
		this._smoothPointer.x += (px - this._smoothPointer.x) * damp;
		this._smoothPointer.y += (py - this._smoothPointer.y) * damp;

		/** Animate time on every visible locale mesh (crossfade needs both). */
		for (const variant of this._variants.values()) {
			if (!variant.root.visible) continue;
			for (const mat of [variant.fillMat, variant.strokeMat]) {
				const u = mat?.uniforms;
				if (!u) continue;
				u.uTime.value = elapsed;
				u.uPointer.value.copy(this._smoothPointer);
			}
		}
	}

	dispose() {
		this._disposed = true;
		this._ready = false;
		this._localeMixing = false;
		this._unsubLocale?.();
		this._unsubLocale = null;
		for (const variant of this._variants.values()) {
			if (variant.stroke) {
				variant.stroke.parent?.remove(variant.stroke);
			}
			variant.strokeGeo?.dispose();
			variant.strokeMat?.dispose();
			if (variant.mesh.material === variant.fillMat) {
				variant.mesh.material = null;
			}
			variant.fillMat?.dispose();
		}
		this._variants.clear();
	}
}
