import * as THREE from "three";
import { store } from "@/store.jsx";
import { getStageProgress } from "@/portfolio/core/stageProgress.js";
import {
	createCaseStudyPanelHud,
	disposeCaseStudyPanelHud,
	syncCaseStudyPanelHud,
} from "@/three/scenes/portfolio/caseStudyText/caseStudyPanelHudHost.js";
import { createCaseSceneLifecycle } from "@/three/scenes/portfolio/caseLifecycle/caseSceneLifecycle.js";
import {
	BELKA_CAMERA,
	BELKA_SCENE_ID,
	belkaGodrayTune,
	belkaNeonTune,
	belkaSceneTune,
	isBelkaPath,
} from "./belkaSceneConfig.js";
import { createBelkaNutAssembly } from "./createBelkaNutAssembly.js";
import { createBelkaHaloField } from "./createBelkaHaloField.js";
import { applyBelkaEmeraldTune, belkaEmeraldTune } from "./belkaEmeraldMaterial.js";

/** Two rAFs — preloader UI can paint between heavy prepare chunks. */
function yieldForPrepareBreath() {
	return new Promise((resolve) => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => resolve());
		});
	});
}

/**
 * Belka Production (/portfolio/06): authored nut crack + emerald + neon orbits.
 *
 * Always prepares under the preloader curtain via `readyPromise` (honest warm).
 * Work is chunked across frames so the loader chrome stays live — no lazy skip.
 */
export class BelkaScene {
	constructor(renderer, storeRef) {
		this.renderer = renderer;
		this.store = storeRef;

		this.threeScene = new THREE.Scene();
		this.root = new THREE.Group();
		this.root.name = "BelkaRoot";
		this.threeScene.add(this.root);

		this.motion = new THREE.Group();
		this.motion.name = "BelkaMotion";
		this.root.add(this.motion);

		this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.45));
		const key = new THREE.DirectionalLight(0xf0f6ff, 1.15);
		key.position.set(4, 7, 5);
		const fill = new THREE.DirectionalLight(0x88ccff, 0.4);
		fill.position.set(-4, 2, -3);
		const gemLight = new THREE.PointLight(0x01dcf9, 2.4, 6.5, 1.6);
		gemLight.position.set(0.1, 0.05, 0.35);
		gemLight.name = "BelkaGemLight";
		this._gemLight = gemLight;
		this.threeScene.add(key, fill, gemLight);

		this.loaded = false;
		this.showCase = false;
		this.activePage = false;
		this.exitHideComplete = false;
		this._mixPreview = false;
		this._allowExitOverlay = true;
		this._elapsed = 0;
		this._disposed = false;
		this._orbitSpin = belkaSceneTune.orbitSpin ?? 0.14;
		/** Smoothed pointer (−1…1) for camera / model parallax. */
		this._pointerParallax = new THREE.Vector2();

		this._hero = null;
		this._orbits = null;
		this._gemLightWorld = new THREE.Vector3();

		this.panelHud = createCaseStudyPanelHud(this.threeScene);

		this.lifecycle = createCaseSceneLifecycle(this, {
			sceneId: BELKA_SCENE_ID,
			matchPage: isBelkaPath,
			getRoot: () => this.root,
			getStore: () => this.store,
			getPanelHud: () => this.panelHud,
			isLoaded: () => this.loaded,
			hideScale: 0,
			hooks: {
				onEnterShow: () => {
					this.applyTune(belkaSceneTune);
				},
				onMixPreviewShow: () => {
					this.applyTune(belkaSceneTune);
				},
			},
		});
		this.lifecycle.hideRoot();

		this.readyPromise = this._prepare();
	}

	async _prepare() {
		try {
			this._hero = await createBelkaNutAssembly();
			if (this._disposed) {
				this._hero?.dispose();
				return false;
			}

			/** One breath between nut build and halo field. */
			await yieldForPrepareBreath();
			const haloR =
				((belkaSceneTune.orbitRadiusA ?? 2)
					+ (belkaSceneTune.orbitRadiusB ?? 2.4)
					+ (belkaSceneTune.orbitRadiusC ?? 2.8))
				/ 3;
			this._orbits = await createBelkaHaloField({
				radius: haloR,
				radiusInner: belkaSceneTune.orbitRadiusA ?? 2.1,
				radiusOuter: belkaSceneTune.orbitRadiusC ?? 2.8,
				spread: belkaSceneTune.orbitTiltSpread ?? 0.55,
				intensity: belkaNeonTune.intensity ?? 2.8,
				color: belkaNeonTune.color,
				coreColor: belkaNeonTune.coreColor,
				shardScale: belkaSceneTune.beadScale ?? 1,
				shardCount: belkaSceneTune.sphereCount ?? 16,
			});
			this._orbits.attachDecor(this._hero.orbitDecor);
		} catch (err) {
			console.error("[BelkaScene] prepare failed", err);
			return false;
		}

		if (this._disposed) {
			this._hero?.dispose();
			this._orbits?.dispose();
			return false;
		}

		this.motion.add(this._hero.root);
		this.motion.add(this._orbits.root);
		this.applyTune(belkaSceneTune);
		this.loaded = true;

		if (this._mixPreview) {
			this.lifecycle.setMixPreviewActive(true);
		} else if (this.showCase || this.lifecycle.enterPending) {
			this.lifecycle.setEnterPending(true);
			this.playEnterAnimation();
		}

		return true;
	}

	/**
	 * Stage 1→2: seams + shake. Stage 2→3: peel / fall.
	 */
	_resolveStoryMix() {
		const stateIndex = store.portfolioExperience?.activeStateIndex ?? 0;
		const p = THREE.MathUtils.clamp(getStageProgress(), 0, 1);
		if (stateIndex <= 0) {
			return { seam: p, crack: 0 };
		}
		if (stateIndex === 1) {
			return { seam: 1, crack: p };
		}
		return { seam: 1, crack: 1 };
	}

	applyTune(tune = belkaSceneTune) {
		if (!this._hero) return;
		this.root.position.set(tune.rootX ?? 1.55, tune.rootY ?? -0.05, 0);
		this.root.scale.setScalar(tune.rootScale ?? 1.4);
		this._hero.setNutScale?.(tune.nutScale ?? 1);
		this._hero.setEmeraldScale?.(tune.emeraldScale ?? 0.95);
		this._hero.setShellStyle?.(tune.shellStyle ?? "obsidian");
		this._orbits?.setRadii(tune.orbitRadiusA, tune.orbitRadiusB, tune.orbitRadiusC);
		this._orbits?.setHaloSpread?.(tune.orbitTiltSpread ?? 0.55);
		this._orbits?.setOrbitPose({
			tilt: tune.orbitTilt ?? 0.28,
			roll: tune.orbitRoll ?? 0.12,
			yaw: tune.orbitYaw ?? 0,
			x: tune.orbitX ?? 0,
			y: tune.orbitY ?? 0,
			z: tune.orbitZ ?? 0,
		});
		this._orbits?.setTubeRadius(tune.tubeRadius ?? 0.018);
		this._orbits?.setNeonMaterial(belkaNeonTune);
		this._orbits?.setBeadScale(tune.beadScale ?? 1);
		this._orbitSpin = tune.orbitSpin ?? 0.14;
		if (this._hero.emeraldMat) {
			applyBelkaEmeraldTune(this._hero.emeraldMat, belkaEmeraldTune);
		}
		if (this._hero.gem?.innerMat) {
			applyBelkaEmeraldTune(this._hero.gem.innerMat, belkaEmeraldTune);
		}
		this._hero.applyGodrayTune?.(belkaGodrayTune);
	}

	getScene() {
		return this.threeScene;
	}

	shouldRender() {
		return this.lifecycle.shouldRender();
	}

	shouldRenderOverlay() {
		return this.lifecycle.shouldRenderOverlay();
	}

	shouldKeepUpdating() {
		return this.lifecycle.shouldKeepUpdating() || this._mixPreview;
	}

	getModelsBloomLogoReveal() {
		return this.activePage || this._mixPreview ? 1 : 0;
	}

	beginWarmupDraw() {
		return this.lifecycle.beginWarmupDraw?.() ?? null;
	}

	endWarmupDraw(token) {
		this.lifecycle.endWarmupDraw?.(token);
	}

	resetCarouselState() {
		this.lifecycle.resetCarouselState?.();
	}

	playEnterAnimation() {
		this.lifecycle.playEnterAnimation();
	}

	setRouteState(routeState) {
		this.lifecycle.setRouteState(routeState);
	}

	setMixPreviewActive(active) {
		this.lifecycle.setMixPreviewActive(active);
		this._mixPreview = active === true;
	}

	setCarouselRole(role, reason) {
		this.lifecycle.setCarouselRole?.(role, reason);
	}

	applyCamera(camera, frame) {
		const c = BELKA_CAMERA;
		const progress = frame?.sceneProgress ?? 0;
		const px = this._pointerParallax.x;
		const py = this._pointerParallax.y;
		const scrollY = c.scrollY ?? 0;
		const scrollZ = c.scrollZ ?? 0;
		camera.position.set(
			c.position[0] + px * (c.parallaxPosX ?? 0.22),
			c.position[1] - progress * scrollY + py * (c.parallaxPosY ?? 0.14),
			c.position[2] - progress * scrollZ,
		);
		camera.lookAt(
			c.lookAt[0] + px * (c.parallaxLookX ?? 0.1),
			c.lookAt[1] - progress * scrollY + py * (c.parallaxLookY ?? 0.07),
			c.lookAt[2],
		);
		if (c.fov != null) {
			camera.fov = c.fov;
			camera.updateProjectionMatrix();
		}
	}

	update(delta, frame) {
		syncCaseStudyPanelHud(this.panelHud, {
			showCase: this.showCase,
			mixPreview: this._mixPreview,
			store: this.store,
		});

		const phase = this.lifecycle.updateExit(frame);
		if (phase === "hidden") {
			return;
		}

		if (!this.loaded) {
			return;
		}

		const pointer = frame?.pointer ?? { x: 0, y: 0 };
		const targetX = frame?.pointerBlocked ? 0 : THREE.MathUtils.clamp(pointer.x ?? 0, -1, 1);
		const targetY = frame?.pointerBlocked ? 0 : THREE.MathUtils.clamp(pointer.y ?? 0, -1, 1);
		this._pointerParallax.x = THREE.MathUtils.damp(this._pointerParallax.x, targetX, 4.2, delta);
		this._pointerParallax.y = THREE.MathUtils.damp(this._pointerParallax.y, targetY, 4.2, delta);

		const c = BELKA_CAMERA;
		this.motion.rotation.x = -this._pointerParallax.y * (c.parallaxTiltX ?? 0.09);
		this.motion.rotation.y = this._pointerParallax.x * (c.parallaxTiltY ?? 0.14);

		this._elapsed += delta;
		const story = this._resolveStoryMix();
		this._hero?.setStoryMix({ ...story, time: this._elapsed });
		this._hero?.update?.(this._elapsed);
		this._orbits?.update(this._elapsed, this._orbitSpin ?? 0.18);

		if (this._gemLight && this._hero?.cradle) {
			this._hero.cradle.getWorldPosition(this._gemLightWorld);
			this._gemLight.position.copy(this._gemLightWorld);
			const openGlow = 0.35 * story.seam + 0.9 * story.crack;
			this._gemLight.intensity = 1.2 + openGlow * 2.4;
		}
	}

	dispose() {
		this._disposed = true;
		disposeCaseStudyPanelHud(this.panelHud);
		this.panelHud = null;
		this._hero?.dispose();
		this._orbits?.dispose();
		this._hero = null;
		this._orbits = null;
	}
}
