import * as THREE from "three";
import { applyDeviceTiltCamera } from "../../interaction/deviceTiltCamera.js";
import { getScenePixelRatio } from "../../renderer/renderResolution.js";

import { digitalWhaleConfig } from "./digitalWhaleConfig.js";
import { getHeroCameraForSceneProgress, heroCamera, HERO_LOOK_AT, smoothSinePhase } from "./heroCamera.js";
import { WhaleEntrance } from "./whaleEntrance.js";
import { getHeroSceneProgressDrift } from "./heroSceneProgressDrift.js";
import { shouldActivateRoutePage } from "@/functions/shouldActivateRoutePage.js";
import { store as appStore } from "@/app/store.jsx";
import { createAmbientEffects } from "./utils/createAmbientEffects.js";
import {
	createOceanGridLines,
	createOceanParticles,
	createOceanSurface,
	getOceanTileScrollX,
	resolveOceanTileSlotCount,
	OCEAN_SURFACE_Z_NEAR,
} from "./utils/createOceanParticles.js";
import { applyWhaleVisuals, disposeWhaleRoot, loadAnimatedWhale, rebuildWhaleParticles } from "./utils/loadAnimatedWhale.js";
import { createWhaleWake } from "./utils/createWhaleWake.js";
import { applyWhaleHologramVisuals } from "./utils/whaleHologramMaterial.js";
import { getUnderwaterGrainBlurRadius } from "./utils/applyUnderwaterGrainBlur.js";
import {
	buildTierScaledWhaleConfig,
	getOceanTileCountCap,
	resolveOceanGridSize,
	resolveOceanMeshSegments,
	shouldUseShaderOceanSurface,
	shouldUseWhaleHologram,
} from "./utils/heroSceneTierScale.js";
import { getGraphicsTier } from "@/functions/getGraphicsTier.js";
import { createHeroTitleText } from "./heroText/createHeroTitleText.js";
import { isRingDormantReason } from "@/three/scenes/lifecycle/sceneLifecycle.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { LowWhaleBloom } from "./utils/LowWhaleBloom.js";
import { WhaleCursorReaction, whaleCursorReactionConfig } from "./whaleCursorReaction.js";
import { sampleWhaleGesture, sampleWhaleReactions } from "./mobileWhale/whaleSkeletalReactions.js";
import { applyMobileWhaleVisuals } from "./mobileWhale/mobileWhaleMaterial.js";
import { setWhaleViewRotation } from "./mobileWhale/whaleComposition.js";
import { WhaleSurfaceHit, WhaleSurfaceInteraction } from "./whaleSurfaceInteraction.js";
import { sceneOwnsHexHitAtClientY } from "@/three/render/overlay/hexHitOwnership.js";

/**
 * Hero-сцена: цифровой океан + FBX кит.
 * Low — shader-плоскость; Medium/High — Points + LineSegments.
 */
export class DigitalWhaleScene {
	constructor() {
		this._disposed = false;
		this.oceanDisposables = [];

		this.threeScene = new THREE.Scene();
		this.elapsed = 0;
		this.smoothPointer = new THREE.Vector2(0, 0);
		this.cursorReaction = new WhaleCursorReaction();
		this.surfaceInteraction = new WhaleSurfaceInteraction({ canInteract: event =>
			this._appStarted && this.whaleReady && sceneOwnsHexHitAtClientY("home", event.clientY)
			&& !event.target?.closest?.('[data-canvas-pointer-blocker="true"]') });
		this.cameraPos = new THREE.Vector3();
		this.lookAtTarget = new THREE.Vector3();
		this._soundSnapshot = {
			whaleWorld: new THREE.Vector3(),
			cameraWorld: new THREE.Vector3(),
			lookAtWorld: new THREE.Vector3(),
			distance: 0,
		};
		this._gridCols = 0;
		this._gridRows = 0;
		this._meshSegX = 0;
		this._meshSegZ = 0;
		this._oceanRenderMode = null;
		this._builtOceanTileCount = 0;
		/** Горизонтальный сдвиг сетки под камеру (без пересборки геометрии). */
		this._oceanCoverageOffsetX = 0;
		this._coverageCamScratch = new THREE.Vector3();
		this.oceanScrollAccum = 0;
		this.oceanScrollAuto = 0;
		this.oceanScrollAutoZ = 0;
		this._oceanScrollPhase = new THREE.Vector2();
		this._deepScrollAuto = 0;
		this._whaleAmbientScrollAuto = 0;
		this._whaleLocalFlow = new THREE.Vector3(1, 0, 0);
		this._whaleLocalFlowTarget = new THREE.Vector3(1, 0, 0);
		this._whaleAmbientFlow = new THREE.Vector3(1, 0, 0);
		this._whaleAmbientFlowTarget = new THREE.Vector3(1, 0, 0);
		this._whaleWorldFlow = new THREE.Vector3(1, 0, 0);
		this._whaleFlowParentInverse = new THREE.Matrix4();
		this._lastSceneProgress = 0;
		this._wakeCameraWorld = new THREE.Vector3();
		this._whaleViewportOffset = new THREE.Vector3();
		this._whaleViewportFit = 1;
		this._compactHighHome = false;
		this._compactMediumOcean = false;
		this._whaleBodyBounds = new THREE.Box3();
		this._whaleLocalCenter = new THREE.Vector3();

		this.oceanGroup = new THREE.Group();
		this.threeScene.add(this.oceanGroup);

		// Сетка скроллится отдельно — кит остаётся на месте, создаётся иллюзия плавания.
		this.oceanSurfaceGroup = new THREE.Group();
		this.oceanGroup.add(this.oceanSurfaceGroup);

		this._rippleWorld = new THREE.Vector3();
		this._rippleLocalOffset = new THREE.Vector3();
		this._rippleWakeDir = new THREE.Vector2(-1, 0);
		this._swimForward = new THREE.Vector3(1, 0, 0);

		// Компенсирует scaleX/scaleZ океана — кит не наследует масштаб сетки.
		this.whaleScaleNeutralizer = new THREE.Group();
		this.oceanGroup.add(this.whaleScaleNeutralizer);

		this.deepOceanAnchor = new THREE.Group();
		this.whaleScaleNeutralizer.add(this.deepOceanAnchor);

		this.whaleGroup = new THREE.Group();
		this.whaleGroup.renderOrder = 1;
		this.whaleScaleNeutralizer.add(this.whaleGroup);

		this.whaleAmbientGroup = new THREE.Group();
		this.whaleScaleNeutralizer.add(this.whaleAmbientGroup);

		this.whaleMixer = null;
		this.whaleSwimAction = null;
		this.whaleReactionActions = null;
		this.whaleClickActions = null;
		this.whaleEntranceAction = null;
		this.whaleParticles = null;
		this.whaleParticleMeshes = null;
		this.whaleHologramMaterial = null;
		this.whaleRenderMode = shouldUseWhaleHologram() ? "hologram" : "particles";
		this._whaleEdgeSpacing = null;
		this.whaleReady = false;
		this._whaleLoadToken = 0;
		this._whaleBasePos = new THREE.Vector3();
		this._whaleBaseRot = new THREE.Euler();
		this._whaleConfigRotationOrigin = new THREE.Euler(
			digitalWhaleConfig.whale.rotationX,
			digitalWhaleConfig.whale.rotationY,
			digitalWhaleConfig.whale.rotationZ,
		);
		this._whaleEntrance = new WhaleEntrance();
		this._whaleEnterCompleted = false;
		this._whaleEnterActive = false;
		this._whaleEnterStartedAt = 0;
		this._pendingWhaleEnter = false;
		this._appStarted = false;
		this._lastAppStarted = false;
		this._carouselEnterPending = false;
		this._heroTitleIntroShown = false;
		this._heroTitleHiddenForLeave = false;
		this._heroShowRaf = 0;
		this._lastDisplayedPage = "/";
		this.lastRouteKey = "";
		this.whaleWake = null;
		this.whaleTrail = null;
		this._heroRenderer = null;
		this.heroTitle = null;

		this.oceanMesh = null;
		this.oceanParticles = null;
		this.oceanGridLines = null;
		this.oceanMaterial = null;
		this.oceanGridMaterial = null;

		this.ambientEffects = createAmbientEffects();
		this.deepOceanAnchor.add(this.ambientEffects.deepOcean.points);
		this.whaleAmbientGroup.add(this.ambientEffects.whaleAmbient.points);
		this.ambientDisposables = this.ambientEffects.disposables;

		this._rebuildOceanGrid();
		this._applyWhaleIntroPose();
		this.applyConfig();
		this.readyPromise = this._loadWhale();
	}

	/** Measure the visible whale, not the distant intro pose; ordinary warm is unchanged. */
	beginWarmupDraw({ performanceProbe = false } = {}) {
		if (!performanceProbe) return null;
		const token = { position: this._whaleBasePos.clone(),
			active: this._whaleEnterActive, completed: this._whaleEnterCompleted };
		this._whaleEnterActive = false;
		this._whaleEnterCompleted = true;
		const w = digitalWhaleConfig.whale;
		this._whaleBasePos.set(w.posX, w.posY, w.posZ);
		return token;
	}

	endWarmupDraw(token) {
		if (!token) return;
		this._whaleBasePos.copy(token.position);
		this._whaleEnterActive = token.active;
		this._whaleEnterCompleted = token.completed;
		this._updateWhaleBodySway();
	}

	async prepareResourcesUnderCurtain(renderer, scheduler) {
		if (getGraphicsTier() !== "low" || !this.whaleParticles || this.lowWhaleBloom) return;
		this.lowWhaleBloom = new LowWhaleBloom(this.whaleParticles);
		await this.lowWhaleBloom.prepare(renderer, scheduler);
	}

	finishSceneLayer(renderer, camera, target) {
		if (this.whaleParticles) return this.lowWhaleBloom?.render(renderer, camera, target, this.whaleParticles);
	}

	/** Screen-space hero title (digital-monster TextMesh). */
	initHeroText(renderer) {
		this._heroRenderer = renderer;
		this._applyOceanMaterialConfig(digitalWhaleConfig.ocean);
		this._applyWhaleVisuals();
		if (this._appStarted) {
			this._syncHeroTitleRoute(this._lastDisplayedPage);
		}
	}

	/**
	 * Build hero meshes under the preloader (hidden). Programs must be compiled
	 * after this — see DigitalMonsterThreeApp._prepareApplication.
	 */
	prepareHeroTextUnderCurtain() {
		if (!this._heroRenderer || this.heroTitle) {
			return this.heroTitle?.readyPromise;
		}
		this.heroTitle = createHeroTitleText(this._heroRenderer, this.threeScene);
		// Prepared hero meshes stay in the graph for warmupPrograms.
		this.heroTitle.reset();
		this._heroTitleHiddenForLeave = true;
		return this.heroTitle.readyPromise;
	}

	_showHeroTitle({ waitForLoaderCurtain = false } = {}) {
		if (!this._appStarted || !this._heroRenderer) {
			return;
		}
		this._heroTitleHiddenForLeave = false;
		if (!this.heroTitle) {
			this._ensureHeroTitle();
			return;
		}
		this.heroTitle.show({ waitForLoaderCurtain });
		if (waitForLoaderCurtain) {
			this._heroTitleIntroShown = true;
		}
	}

	/**
	 * Hide hero for leave/hex — keep meshes. Dispose+recreate on return was the
	 * hitch when home reappeared after portfolio→home.
	 */
	_resetHeroTitle() {
		this._heroTitleHiddenForLeave = true;
		this.heroTitle?.hide?.();
	}

	/**
	 * Show/position hero when home is the displayed route.
	 * Do NOT wipe hero on leave to portfolio/etc. — home stays live as carousel
	 * `previous` for reverse. Ring dormant (`resetCarouselState` next-*) owns hide.
	 */
	_syncHeroTitleRoute(currentPage) {
		if (!this._appStarted || !this._heroRenderer) {
			return;
		}

		if (!this._isHomePath(currentPage)) {
			// Hero text stays visible while home is still in a live hex mix
			// (otherwise a premature route update blanks the text for a frame).
			const carousel = getSceneCarousel();
			const mixIds = carousel?.getMixSourceTargetIds?.();
			const homeInHexPair = (mixIds?.sourceId === "home" || mixIds?.targetId === "home")
				&& (carousel?.isHexNavigationActive?.()
					|| carousel?.isCaseBoundaryDrive?.());
			if (!homeInHexPair) {
				this.heroTitle?.stashTextOverlay?.();
			}
			return;
		}

		if (this.heroTitle) {
			const localeReady = this.heroTitle.syncLocaleForActivation?.() ?? Promise.resolve();
			if (this._heroTitleHiddenForLeave) {
				// Off the carousel-commit frame — reveal must not stack with hub dormant work.
				void Promise.resolve(localeReady).finally(() => {
					if (this._appStarted && this._isHomePath(this._lastDisplayedPage)) {
						this._scheduleHeroTitleShow();
					}
				});
			} else {
				// Scroll reverse keeps the prepared hero live as `previous`.
				void Promise.resolve(localeReady).finally(() => {
					if (!this._appStarted || !this._isHomePath(this._lastDisplayedPage)) {
						return;
					}
					this.heroTitle?.applyPosition?.();
				});
			}
			return;
		}

		this._ensureHeroTitle();
	}

	_scheduleHeroTitleShow() {
		if (this._heroShowRaf) {
			return;
		}
		this._heroShowRaf = requestAnimationFrame(() => {
			this._heroShowRaf = 0;
			if (!this._appStarted || !this._isHomePath(this._lastDisplayedPage)) {
				return;
			}
			if (!this._heroTitleHiddenForLeave && this.heroTitle) {
				return;
			}
			this._showHeroTitle({ waitForLoaderCurtain: false });
		});
	}

	_ensureHeroTitle() {
		if (this.heroTitle || !this._heroRenderer) {
			return;
		}

		const waitForLoaderCurtain = !this._heroTitleIntroShown;
		this.heroTitle = createHeroTitleText(this._heroRenderer, this.threeScene);
		this.heroTitle.show({ waitForLoaderCurtain });
		if (waitForLoaderCurtain) {
			this._heroTitleIntroShown = true;
		}
	}

	onViewportResize() {
		this._updateWhaleViewportLayout();
		this._updateWhaleBodySway();
		if (!this.heroTitle || !this._heroRenderer) {
			return;
		}

		// Keep prepared glyph atlases, materials and the current reveal state.
		// Recreating the hero here cold-starts its shaders on the next home visit.
		this.heroTitle.resize();
	}

	_isHomePath(pathname) {
		return pathname === "/" || pathname === "";
	}

	_applyWhaleIntroPose() {
		const w = digitalWhaleConfig.whale;
		this._whaleBasePos.set(w.posX, w.posY, w.posZ);
	}

	_playWhaleEnterAnimation() {
		if (this._whaleEnterCompleted || this._whaleEnterActive) {
			return;
		}

		this._applyWhaleIntroPose();
		this._whaleEnterActive = true;
		this._whaleEnterStartedAt = this.elapsed;
		// Capture timing once: rotating the phone must not change progress mid-enter.
		this._whaleEnterDuration = Math.max((digitalWhaleConfig.whaleEnter?.durationMs ?? 6500) / 1000, .001);
	}

	/**
	 * Ring dormant (next-only). Ignore leave-pose / unknown reasons.
	 * Hero hide only here — not from route leave (`_syncHeroTitleRoute`).
	 */
	resetCarouselState(ctx = {}) {
		if (!isRingDormantReason(ctx.reason)) {
			return;
		}
		this._resetHeroTitle();
		this.cursorReaction.reset();
		this.surfaceInteraction.reset();
		this._carouselEnterPending = true;
	}

	/** Анимация появления — после carousel reset; первый whale-enter без reset допустим. */
	playEnterAnimation() {
		if (!this._carouselEnterPending) {
			if (this._whaleEnterCompleted) {
				return;
			}
		} else {
			this._carouselEnterPending = false;
		}

		if (this._appStarted) {
			this._pendingWhaleEnter = false;
			this._playWhaleEnterAnimation();
			this._syncHeroTitleRoute(this._lastDisplayedPage);
			return;
		}

		this._pendingWhaleEnter = true;
		this._applyWhaleIntroPose();
	}

	_updateWhaleEnterAnimation() {
		if (!this._whaleEnterActive) {
			return;
		}

		const duration = this._whaleEnterDuration;
		const linear = Math.min(1, (this.elapsed - this._whaleEnterStartedAt) / duration);

		if (linear >= 1) {
			this._whaleEnterActive = false;
			this._whaleEnterCompleted = true;
		}
	}

	setRouteState({ currentPage, teleportPage, routePhase, appStarted = false, suppressSceneEnter = false }) {
		const routeKey = `${currentPage}|${teleportPage}|${routePhase}`;
		const appStartedChanged = appStarted !== this._lastAppStarted;
		if (routeKey === this.lastRouteKey && !appStartedChanged) {
			return;
		}
		if (routeKey !== this.lastRouteKey) {
			this.lastRouteKey = routeKey;
		}
		this._lastAppStarted = appStarted;
		this._appStarted = appStarted;
		this._lastDisplayedPage = currentPage;

		if (appStarted && !suppressSceneEnter) {
			this._syncHeroTitleRoute(currentPage);
		}

		if (suppressSceneEnter) {
			return;
		}

		const homeDisplayed = this._isHomePath(currentPage);
		const homeTarget = this._isHomePath(teleportPage);

		if (this._whaleEnterCompleted) {
			return;
		}

		const shouldPlayEnter = shouldActivateRoutePage(homeDisplayed, routePhase) || (homeTarget && routePhase === "entering");
		const wantsHomeEnter = shouldPlayEnter && homeDisplayed && routePhase !== "exiting";

		if (wantsHomeEnter) {
			this.playEnterAnimation();
			return;
		}

		if (!this._whaleEnterActive) {
			this._applyWhaleIntroPose();
		}
	}

	_loadWhale() {
		const w = digitalWhaleConfig.whale;
		const loadToken = ++this._whaleLoadToken;

		return loadAnimatedWhale({ edgeSpacing: w.edgeSpacing, renderMode: this.whaleRenderMode, wakeConfig: w.wake })
			.then((whale) => {
				if (this._disposed || loadToken !== this._whaleLoadToken) {
					disposeWhaleRoot(whale.root);
					return;
				}

				this.whaleRoot = whale.root;
				this.whaleMixer = whale.mixer;
				this.whaleSwimAction = whale.swimAction;
				this.whaleReactionActions = whale.reactionActions;
				this.whaleClickActions = whale.clickActions ?? [whale.clickAction].filter(Boolean);
				this.whaleEntranceAction = whale.entranceAction;
				this.whaleParticles = whale.particles;
				this.whaleParticleMeshes = whale.particleMeshes;
				this.surfaceInteraction.surface = new WhaleSurfaceHit(whale.particleMeshes[0]);
				this.whaleHologramMaterial = whale.hologramMaterial;
				this.whaleTrail = whale.trail ?? null;
				this.whaleRenderMode = whale.renderMode;
				this._whaleEdgeSpacing = w.edgeSpacing;
				this.whaleGroup.add(whale.root);
				this.whaleReady = true;
				this.whaleMixer?.update(0);
				this.whaleGroup.updateMatrixWorld(true);
				this.whaleParticles?.updatePositions();
				this._measureWhaleBodyBounds();
				// Authored mobile/desktop whale owns one prepared, rigged GPU trail.
				// Keep the CPU fallback only for older assets without surface emitters.
				if (!this.whaleTrail) this._initWhaleWake(whale.root);
				this._applyWhaleTransform();
				this._applyWhaleVisuals();
				this.applyConfig();
			})
			.catch((error) => {
				console.error("[DigitalWhaleScene] whale load failed", error);
				return null;
			});
	}

	_getGridSize() {
		const o = digitalWhaleConfig.ocean;
		const tier = getGraphicsTier();
		return resolveOceanGridSize(o.gridCols, o.gridRows, tier, {
			// Medium tuning must preview the production density and bloom energy.
			bypassTierCap: import.meta.env.DEV && tier === "high",
		});
	}

	_measureWhaleBodyBounds() {
		if (this.whaleRoot?.userData.swimBounds) {
			const bounds = this.whaleRoot.userData.swimBounds;
			this._whaleBodyBounds.set(new THREE.Vector3().fromArray(bounds.min), new THREE.Vector3().fromArray(bounds.max));
			this._whaleBodyBounds.getCenter(this._whaleLocalCenter);
			return;
		}
		// Only prepared body samples: wake/ambient bounds cover the entire ocean.
		// Sampling is bounded and happens once, never during animation or resize.
		const body = this.whaleParticles?.bodySamples;
		if (!body?.getPosition || !body.count) return;
		const point = new THREE.Vector3();
		this.whaleRoot.updateMatrix();
		const count = Math.min(body.count, 1024);
		this._whaleBodyBounds.makeEmpty();
		for (let i = 0; i < count; i++) {
			body.getPosition(Math.floor(i * (body.count - 1) / Math.max(1, count - 1)), point);
			point.applyMatrix4(this.whaleRoot.matrix);
			if (Number.isFinite(point.x + point.y + point.z)) this._whaleBodyBounds.expandByPoint(point);
		}
		this._whaleBodyBounds.getCenter(this._whaleLocalCenter);
	}

	_updateWhaleViewportLayout() {
		const width = window.innerWidth, height = window.innerHeight;
		const authoredWhale = !!this.whaleRoot?.userData.authoredWhale;
		this._whaleViewportRotation = null;
		const portrait = width <= 768 && height > width;
		const shortLandscape = width <= 1024 && height < 480 && width > height;
		// Keep the prepared surface for desktop resize; phones draw only the whale
		// and ambient layers. Returning home never rebuilds ocean resources.
		this.oceanSurfaceGroup.visible = !(width <= 768 || shortLandscape);
		this._compactHighHome = getGraphicsTier() === "high" && (portrait || shortLandscape);
		this._compactMediumOcean = getGraphicsTier() === "medium" && (portrait || shortLandscape);
		this._compactOceanPortrait = portrait;
		this._compactOceanLandscape = shortLandscape;
		const keep = this.whaleParticles?.material.uniforms.uSampleKeep;
		if (keep) {
			const budget = Math.min(18000, Math.max(9000, width * height * .04));
			keep.value = this._compactHighHome ? Math.min(1, budget / Math.max(1, this.whaleParticles.sampleCount)) : 1;
		}
		this._applyOceanMaterialConfig(digitalWhaleConfig.ocean);
		this.oceanSurfaceGroup.position.y = portrait
			? THREE.MathUtils.lerp(-11, -10.5, THREE.MathUtils.smoothstep(height, 568, 640))
			: shortLandscape ? -3 : 0;
		this.oceanSurfaceGroup.position.z = portrait || shortLandscape ? -25 : 0;
		this.oceanSurfaceGroup.rotation.z = portrait ? .12 : shortLandscape ? .05 : 0;
		this.oceanSurfaceGroup.scale.z = portrait ? .15 : shortLandscape ? .3 : 1;
		this._whaleViewportFit = portrait ? .7 : shortLandscape ? .7 : 1;
		this._whaleViewportOffset.set(0, 0, 0);
		const desktop = !portrait && !shortLandscape;
		if ((desktop && !authoredWhale) || this._whaleBodyBounds.isEmpty()) return;
		const targetX = authoredWhale ? (desktop ? .14 : shortLandscape ? .40 : height < 640 ? -.35 : 0) : shortLandscape ? .55 : 1.12;
		const targetY = authoredWhale ? (desktop ? -.29 : shortLandscape ? .04 : height < 640 ? -.42 : -.33) : shortLandscape ? -.15 : height < 640 ? -.54 : -.50;
		const maxWidth = authoredWhale ? (desktop ? 1.76 : shortLandscape ? 1.06 : 1.72) : shortLandscape ? 2.2 : 4.2;
		// Portrait echoes the reference close-up: head/fin in frame, tail beyond the right edge.
		const maxHeight = authoredWhale ? (desktop ? 1.26 : shortLandscape ? 1.24 : height < 640 ? .45 : .87) : shortLandscape ? 1.55 : 1.8;
		const w = digitalWhaleConfig.whale, o = digitalWhaleConfig.ocean;
		// Size remains meaningful after resize/reload instead of auto-fit cancelling scale.
		const compositionScale = w.scale / .03;
		// Build a stationary reference from configuration, not the currently swaying,
		// scrolling or entering world. One correction is shared by both intro endpoints.
		const parent = new THREE.Matrix4().compose(
			new THREE.Vector3(o.posX, o.posY, o.posZ),
			new THREE.Quaternion().setFromEuler(new THREE.Euler(o.tiltX, o.rotationY, 0)),
			new THREE.Vector3(o.scaleX, 1, o.scaleZ));
		parent.multiply(new THREE.Matrix4().makeScale(1 / Math.max(o.scaleX, 1e-6), 1, 1 / Math.max(o.scaleZ, 1e-6)));
		const parentInverse = parent.clone().invert();
		const camera = new THREE.PerspectiveCamera(heroCamera.fov, width / height, .1, 2000);
		camera.position.set(heroCamera.x, heroCamera.y, heroCamera.z);
		camera.lookAt(HERO_LOOK_AT.x, HERO_LOOK_AT.y, HERO_LOOK_AT.z);
		camera.updateMatrixWorld();
		const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(w.rotationX, w.rotationY, w.rotationZ));
		if (authoredWhale) {
			setWhaleViewRotation(rotation, parent, camera.quaternion);
			this._whaleViewportRotation = new THREE.Euler().setFromQuaternion(rotation);
		}
		const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
		const projected = new THREE.Box3(), point = new THREE.Vector3(), center = new THREE.Vector3();
		const from = new THREE.Vector3(), to = new THREE.Vector3();
		const headBounds = (portrait || desktop) && this.whaleRoot?.userData.referenceHeadBounds;
		const frameBounds = headBounds
			? new THREE.Box3(new THREE.Vector3().fromArray(headBounds.min), new THREE.Vector3().fromArray(headBounds.max))
			: this._whaleBodyBounds;
		const frameCenter = frameBounds.getCenter(new THREE.Vector3());
		const corners = [];
		for (const x of [frameBounds.min.x, frameBounds.max.x])
			for (const y of [frameBounds.min.y, frameBounds.max.y])
				for (const z of [frameBounds.min.z, frameBounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
		// Frame the huge foreground head; the tail is allowed to recede beyond it.
		// Projections run only on prepare/resize, with the same prepared model.
		const fitPasses = authoredWhale ? 8 : 4;
		for (let pass = 0; pass < fitPasses; pass++) {
			position.set(w.posX, w.posY, w.posZ).add(this._whaleViewportOffset);
			matrix.compose(position, rotation, scale.setScalar(w.scale * this._whaleViewportFit)).premultiply(parent);
			projected.makeEmpty();
			for (const corner of corners) projected.expandByPoint(point.copy(corner).applyMatrix4(matrix).project(camera));
			projected.getCenter(center);
			point.copy(frameCenter).applyMatrix4(matrix).project(camera);
			from.set(center.x, center.y, point.z).unproject(camera).applyMatrix4(parentInverse);
			to.set(targetX, targetY, point.z).unproject(camera).applyMatrix4(parentInverse);
			this._whaleViewportOffset.add(to.sub(from));
			if (pass < fitPasses - 1) {
				const fit = Math.min(authoredWhale ? 1.5 : 1, maxWidth * compositionScale / Math.max(projected.max.x - projected.min.x, 1e-6), maxHeight * compositionScale / Math.max(projected.max.y - projected.min.y, 1e-6));
				this._whaleViewportFit *= fit;
			}
		}
	}

	/** Фактический размер сетки после tier-cap (для dev-панели). */
	getOceanGridSize() {
		return [this._gridCols, this._gridRows];
	}

	/** Сегменты mesh плоскости (только shader-режим). */
	getOceanMeshSegments() {
		return [this._meshSegX, this._meshSegZ];
	}

	/** `shader` — плоскость; `points` — классические Points + линии (high). */
	getOceanRenderMode() {
		return this._oceanRenderMode ?? "shader";
	}

	getOceanTileCount() {
		return this._builtOceanTileCount || getOceanTileCountCap();
	}

	/** Позиция кита и камеры — для spatial underwater-звука. */
	getWhaleSoundSnapshot() {
		const snapshot = this._soundSnapshot;
		const whaleWorld = snapshot.whaleWorld;
		if (this.whaleGroup) {
			this.whaleGroup.updateMatrixWorld(true);
			this.whaleGroup.getWorldPosition(whaleWorld);
		} else {
			whaleWorld.copy(this._whaleBasePos);
		}

		snapshot.cameraWorld.copy(this.cameraPos);
		snapshot.lookAtWorld.copy(this.lookAtTarget);
		snapshot.distance = whaleWorld.distanceTo(this.cameraPos);
		return snapshot;
	}

	_usesShaderOcean() {
		return shouldUseShaderOceanSurface(getGraphicsTier());
	}

	_getMeshSegments() {
		const o = digitalWhaleConfig.ocean;
		return resolveOceanMeshSegments(o.gridCols, o.gridRows, getGraphicsTier(), {
			bypassTierCap: import.meta.env.DEV && getGraphicsTier() !== "low",
		});
	}

	_disposeOceanSurface() {
		if (!this.oceanMesh && !this.oceanParticles) {
			return;
		}

		if (this.oceanSurfaceTiles?.length) {
			for (const tile of this.oceanSurfaceTiles) {
				if (tile.group) {
					this.oceanSurfaceGroup.remove(tile.group);
				}
			}
		}

		if (this.oceanMesh?.parent === this.oceanSurfaceGroup) {
			this.oceanSurfaceGroup.remove(this.oceanMesh);
		}

		for (const item of this.oceanDisposables) {
			item?.dispose?.();
		}

		this.oceanDisposables = [];
		this.oceanSurfaceTiles = [];
		this.oceanMesh = null;
		this.oceanParticles = null;
		this.oceanGridLines = null;
		this.oceanMaterial = null;
		this.oceanGridMaterial = null;
		this._oceanRenderMode = null;
		this._builtOceanTileCount = 0;
	}

	_rebuildOceanGrid() {
		const [cols, rows] = this._getGridSize();
		const useShader = this._usesShaderOcean();
		const mode = useShader ? "shader" : "points";
		const tileCount = getOceanTileCountCap();
		const tileSlots = resolveOceanTileSlotCount(tileCount);

		if (useShader) {
			const [segX, segZ] = this._getMeshSegments();

			if (
				this._oceanRenderMode === mode &&
				this._gridCols === cols &&
				this._gridRows === rows &&
				this._meshSegX === segX &&
				this._meshSegZ === segZ &&
				this._builtOceanTileCount === tileCount
			) {
				return;
			}

			this._disposeOceanSurface();

			const ocean = createOceanSurface([cols, rows], [segX, segZ], tileCount);
			this.oceanMesh = ocean.mesh;
			this.oceanMaterial = ocean.material;
			this.oceanDisposables.push(ocean.geometry, ocean.material);
			this.oceanSurfaceGroup.add(ocean.mesh);
			this.oceanSurfaceTiles = [];
			this._builtOceanTileCount = tileCount;

			this._meshSegX = segX;
			this._meshSegZ = segZ;
		} else {
			if (this._oceanRenderMode === mode && this._gridCols === cols && this._gridRows === rows && this.oceanSurfaceTiles?.length === tileSlots.length) {
				return;
			}

			this._disposeOceanSurface();

			const ocean = createOceanParticles([cols, rows]);
			const grid = createOceanGridLines([cols, rows], ocean.geometry);

			this.oceanParticles = ocean.points;
			this.oceanMaterial = ocean.material;
			this.oceanGridLines = grid.lines;
			this.oceanGridMaterial = grid.material;
			this.oceanDisposables.push(ocean.geometry, ocean.material, grid.geometry, grid.material);

			this.oceanSurfaceTiles = [];
			for (let tileIndex = 0; tileIndex < tileSlots.length; tileIndex++) {
				const tileGroup = new THREE.Group();

				const lines = tileIndex === 0 ? grid.lines : grid.lines.clone();
				const points = tileIndex === 0 ? ocean.points : ocean.points.clone();
				tileGroup.add(lines);
				tileGroup.add(points);
				this.oceanSurfaceGroup.add(tileGroup);
				this.oceanSurfaceTiles.push({ group: tileGroup, points, lines, slot: tileSlots[tileIndex] });
			}

			this._meshSegX = 0;
			this._meshSegZ = 0;
		}

		this._gridCols = cols;
		this._gridRows = rows;
		this._oceanRenderMode = mode;
		this._syncOceanScroll();
		this._syncFogMaterials();
	}

	/** Скролл всегда вправо: shader — uniform; points — бесшовное смещение тайлов. */
	_syncOceanScroll() {
		if (!this.oceanSurfaceGroup.visible) return;
		const phase = this._oceanScrollPhase;
		phase.set(this.oceanScrollAccum, this.oceanScrollAutoZ);

		if (this._oceanRenderMode === "shader") {
			if (this.oceanMaterial?.uniforms?.uScrollPhase) {
				this.oceanMaterial.uniforms.uScrollPhase.value.copy(phase);
			}
			this.oceanSurfaceGroup.position.x = this._oceanCoverageOffsetX;
			return;
		}

		if (!this.oceanSurfaceTiles?.length) {
			return;
		}

		for (const tile of this.oceanSurfaceTiles) {
			tile.group.position.x = getOceanTileScrollX(this.oceanScrollAccum, tile.slot);
		}

		const zPhase = this._oceanScrollPhase;
		if (this.oceanMaterial?.uniforms?.uScrollPhase) {
			this.oceanMaterial.uniforms.uScrollPhase.value.set(0, zPhase.y);
		}
		if (this.oceanGridMaterial?.uniforms?.uScrollPhase) {
			this.oceanGridMaterial.uniforms.uScrollPhase.value.set(0, zPhase.y);
		}

		this.oceanSurfaceGroup.position.x = this._oceanCoverageOffsetX;
	}

	/** Сдвигаем уже построенную сетку под камеру — без dispose/create геометрии. */
	_ensureOceanTileCoverage(camera) {
		if (!this.oceanSurfaceGroup.visible) return;
		if (!camera || (!this.oceanMesh && !this.oceanSurfaceTiles?.length)) {
			return;
		}

		this.oceanGroup.updateMatrixWorld(true);
		// Resolve the desired child offset in the stable parent space. Using
		// oceanSurfaceGroup.worldToLocal() here includes last frame's own offset and
		// creates p(n + 1) = cameraX - p(n): two alternating positions every frame.
		this.oceanGroup.worldToLocal(this._coverageCamScratch.copy(camera.position));
		this._oceanCoverageOffsetX = this._coverageCamScratch.x;
	}

	_getParticleRasterScale() {
		// High was authored at DPR 2; Medium/Low particles were tuned at DPR 1.
		// Use the scene buffer ratio, which can differ from the sharp UI canvas.
		const reference = getGraphicsTier() === "high" ? 2 : 1;
		return this._heroRenderer ? getScenePixelRatio(this._heroRenderer) / reference : 1;
	}

	_applyOceanMaterialConfig(o) {
		this.whaleTrail?.setOceanSurface(this.oceanSurfaceGroup, OCEAN_SURFACE_Z_NEAR);
		if (!this.oceanMaterial) {
			return;
		}

		if (this._oceanRenderMode === "shader") {
			this.oceanMaterial.uniforms.uPointColor.value.set(o.pointColor);
			this.oceanMaterial.uniforms.uGridColor.value.set(o.gridColor);
			this.oceanMaterial.uniforms.uWaveAmp.value = o.waveAmp;
			this.oceanMaterial.uniforms.uRippleAmp.value = o.rippleAmp;
			this.oceanMaterial.uniforms.uPointScale.value = o.pointScale;
			this.oceanMaterial.uniforms.uAlphaMult.value = o.pointAlpha;
			this.oceanMaterial.uniforms.uGlow.value = o.pointGlow;
			this.oceanMaterial.uniforms.uGridAlpha.value = o.gridAlpha;
			this.oceanMaterial.uniforms.uGridCols.value = this._gridCols || o.gridCols;
			this.oceanMaterial.uniforms.uGridRows.value = this._gridRows || o.gridRows;
			return;
		}

		this.oceanMaterial.uniforms.uColor.value.set(o.pointColor);
		this.oceanMaterial.uniforms.uWaveAmp.value = o.waveAmp;
		this.oceanMaterial.uniforms.uRippleAmp.value = o.rippleAmp;
		this.oceanMaterial.uniforms.uPointScale.value = o.pointScale;
		this.oceanMaterial.uniforms.uAlphaMult.value = o.pointAlpha;
		this.oceanMaterial.uniforms.uGlow.value = o.pointGlow;
		this.oceanMaterial.uniforms.uCompactSurface.value = this._compactOceanPortrait || this._compactOceanLandscape ? 1 : 0;
		this.oceanMaterial.uniforms.uSideFade.value = this._compactOceanLandscape ? 1 : 0;
		if (this._compactHighHome) {
			// Twelve-pixel sprites overlap at a compact viewport and flood the HDR
			// bloom with a solid crest. Retain the same hue and prepared grid.
			this.oceanMaterial.uniforms.uPointScale.value = Math.min(o.pointScale, 5.5);
			this.oceanMaterial.uniforms.uAlphaMult.value = o.pointAlpha * .85;
			this.oceanMaterial.uniforms.uGlow.value = o.pointGlow * .65;
		} else if (this._compactMediumOcean) {
			// Medium uses the same additive Points branch. Near the horizon a short
			// viewport stacks its halos; keep the visible crest without bleaching HUD.
			this.oceanMaterial.uniforms.uAlphaMult.value = o.pointAlpha * .3;
			this.oceanMaterial.uniforms.uGlow.value = o.pointGlow * .5;
		}
		if (this._compactOceanPortrait) {
			// The tilted surface is a shallow band. Keep individual dots resolved
			// instead of merging its denser rows into broad luminous stripes.
			this.oceanMaterial.uniforms.uPointScale.value = Math.min(o.pointScale, 3.2);
		}
		if (this._compactOceanLandscape) {
			this.oceanMaterial.uniforms.uPointScale.value = Math.min(o.pointScale, 2.8);
			this.oceanMaterial.uniforms.uAlphaMult.value = getGraphicsTier() === "low" ? .65 : .36;
			this.oceanMaterial.uniforms.uGlow.value = Math.min(o.pointGlow, 2);
		}

		const rasterScale = this._getParticleRasterScale();
		this.oceanMaterial.uniforms.uPointScale.value *= rasterScale;
		if (this.oceanGridMaterial) {
			this.oceanGridMaterial.uniforms.uColor.value.set(o.gridColor);
			this.oceanGridMaterial.uniforms.uWaveAmp.value = o.waveAmp;
			this.oceanGridMaterial.uniforms.uRippleAmp.value = o.rippleAmp;
			// WebGL lines have a one-raster-pixel minimum. Compensate their coverage
			// when that minimum grows in CSS pixels instead of adding extra light.
			this.oceanGridMaterial.uniforms.uGridAlpha.value = this._compactOceanLandscape ? 0 : o.gridAlpha * (this._compactHighHome ? .3 : this._compactMediumOcean ? .5 : 1) * Math.min(1, rasterScale);
		}
	}

	_syncFogMaterials() {
		this.fogMaterials = [];
		if (this.oceanMaterial) {
			this.fogMaterials.push(this.oceanMaterial);
		}
		if (this.oceanGridMaterial) {
			this.fogMaterials.push(this.oceanGridMaterial);
		}
		if (this.whaleHologramMaterial) {
			this.fogMaterials.push(this.whaleHologramMaterial);
		}
		if (this.whaleParticles?.material) {
			this.fogMaterials.push(this.whaleParticles.material);
		}
		if (this.ambientEffects) {
			this.fogMaterials.push(this.ambientEffects.deepOcean.material);
		}
	}

	_rebuildWhaleParticles() {
		if (this.whaleRenderMode === "hologram") {
			return;
		}

		if (!this.whaleReady || !this.whaleRoot || !this.whaleParticleMeshes?.length) {
			return;
		}

		const edgeSpacing = digitalWhaleConfig.whale.edgeSpacing;
		if (this.whaleParticles && this._whaleEdgeSpacing !== null && Math.abs(this._whaleEdgeSpacing - edgeSpacing) < 0.005) {
			return;
		}

		this.whaleParticles = rebuildWhaleParticles(this.whaleRoot, this.whaleParticleMeshes, this.whaleParticles, { edgeSpacing });
		this._whaleEdgeSpacing = edgeSpacing;
		this.whaleRoot.updateMatrixWorld(true);
		this.whaleParticles.updatePositions();
		this._syncFogMaterials();
	}

	shouldRender() {
		return true;
	}

	getScene() {
		return this.threeScene;
	}

	syncCamera(sceneProgress = 0) {
		this._lastSceneProgress = Number.isFinite(sceneProgress) ? sceneProgress : 0;
		const c = getHeroCameraForSceneProgress(this._lastSceneProgress);
		/**
		 * Vertical scroll parallax: +sceneProgress lowers camera (content rises).
		 * lookAt.y follows the same ΔY so the frame translates — not just pitches.
		 */
		const scrollYDelta = c.y - heroCamera.y;

		// Pointer belongs to whale interaction; only route progress drives the camera.
		this.cameraPos.set(c.x, c.y, c.z);
		this.lookAtTarget.set(
			HERO_LOOK_AT.x,
			HERO_LOOK_AT.y + scrollYDelta,
			HERO_LOOK_AT.z,
		);
		this._cameraFov = c.fov;
	}

	/** Автоскролл океана и синхронизация uScrollPhase. */
	_syncOceanScrollState() {
		this.oceanScrollAccum = this.oceanScrollAuto;
		this._syncWhaleAnchorPositions();
		this._syncOceanScroll();
	}

	_accumulateScrollSpeeds(delta, config = digitalWhaleConfig) {
		const ocean = config.ocean ?? {};
		const ambient = config.ambient ?? {};

		// Direction is part of the composition: a negative live/dev value may
		// change the speed, but never reverses the ocean flow.
		this.oceanScrollAuto += Math.abs(ocean.scrollSpeedX ?? 0) * delta;
		this.oceanScrollAutoZ -= (ocean.scrollSpeedZ ?? 0) * delta;
		this._deepScrollAuto += (ambient.deepScrollSpeed ?? 0) * delta;
		this._whaleAmbientScrollAuto += (ambient.whaleAmbientScrollSpeed ?? 0) * delta;
	}

	_applyWhaleTransform() {
		const w = digitalWhaleConfig.whale;

		if (this._whaleEnterCompleted) {
			this._whaleBasePos.set(w.posX, w.posY, w.posZ);
		} else if (!this._whaleEnterActive) {
			this._applyWhaleIntroPose();
		}

		this._whaleBaseRot.set(w.rotationX, w.rotationY, w.rotationZ);
		this.whaleGroup.scale.setScalar(w.scale);

		this._updateWhaleBodySway(0);

		if (this.whaleSwimAction) {
			this.whaleSwimAction.timeScale = this.whaleRoot?.userData.authoredWhale ? 1 : w.swimSpeed;
		}
	}

	_initWhaleWake(whaleRoot) {
		// The mobile asset owns a small prepared GPU trail in its local coordinates.
		if (whaleRoot.userData.authoredWhale) return;
		if (this.whaleWake) {
			this.whaleWake.points.removeFromParent();
			this.whaleWake.dispose();
		}

		this.whaleWake = createWhaleWake({
			config: digitalWhaleConfig.whale.wake,
			whaleRoot,
			getCameraWorldPosition: () => this._wakeCameraWorld,
			getBodySamples: () => {
				if (this.whaleParticles?.bodySamples.count > 0) {
					return this.whaleParticles.bodySamples;
				}

				return { whaleRoot: this.whaleRoot ?? whaleRoot };
			},
		});

		// Тот же локальный space, что у edge-партиклов кита.
		(whaleRoot ?? this.whaleRoot)?.add(this.whaleWake.points);
	}

	/** Лёгкое покачивание тела — крен, тангаж и вертикальный bob поверх базового transform. */
	_updateWhaleBodySway(elapsed = this.elapsed) {
		const w = digitalWhaleConfig.whale;
		const sway = w.sway ?? {};
		const progress = this._whaleEnterCompleted || this.cursorReaction.motionPreference.matches ? 1
			: this._whaleEnterActive ? (this.elapsed - this._whaleEnterStartedAt) / this._whaleEnterDuration : 0;
		const entrance = this._whaleEntrance.sample(progress);

		const bobY = Math.sin(elapsed * (sway.bobSpeed ?? 0.9)) * (sway.bobAmp ?? 0);
		const pitchZ = Math.sin(elapsed * (sway.pitchSpeed ?? 0.72) + 0.4) * (sway.pitchAmp ?? 0);
		const rollX = Math.sin(elapsed * (sway.rollSpeed ?? 0.58) + 1.2) * (sway.rollAmp ?? 0);
		const yawY = smoothSinePhase(elapsed * (sway.yawSpeed ?? 0), sway.yawSmooth ?? 0) * (sway.yawAmp ?? 0);
		const cursorVertical = THREE.MathUtils.clamp(
			-this.cursorReaction.pitch / whaleCursorReactionConfig.pitch, -1, 1,
		);
		const cursorLift = cursorVertical * 1.15 * entrance.sway;

		const rotation = this._whaleViewportRotation ?? this._whaleBaseRot;
		const swayScale = (this._whaleViewportRotation ? .3 : 1) * entrance.sway;
		const devRotationX = this._whaleViewportRotation ? this._whaleBaseRot.x - this._whaleConfigRotationOrigin.x : 0;
		const devRotationY = this._whaleViewportRotation ? this._whaleBaseRot.y - this._whaleConfigRotationOrigin.y : 0;
		const devRotationZ = this._whaleViewportRotation ? this._whaleBaseRot.z - this._whaleConfigRotationOrigin.z : 0;
		this.whaleGroup.scale.setScalar(w.scale * this._whaleViewportFit);
		this.whaleGroup.position.set(
			this._whaleBasePos.x,
			this._whaleBasePos.y + bobY * swayScale + cursorLift,
			this._whaleBasePos.z,
		).add(this._whaleViewportOffset);
		this.whaleGroup.rotation.set(
			rotation.x + devRotationX + rollX * swayScale,
			rotation.y + devRotationY + yawY * swayScale,
			rotation.z + devRotationZ + pitchZ * swayScale,
		);
		if (entrance.progress < 1) {
			this.whaleGroup.parent.updateWorldMatrix(true, false);
			entrance.applyPosition(this.whaleGroup.position, this.whaleGroup.parent.matrixWorld,
				this.cameraPos, this.lookAtTarget, this._cameraFov ?? heroCamera.fov,
				window.innerWidth / window.innerHeight, digitalWhaleConfig.whaleEnter);
		}
		if (this.whaleSwimAction && this.whaleRoot?.userData.authoredWhale) {
			this.whaleSwimAction.timeScale = entrance.swimRate;
		}

		this._syncWhaleAnchorPositions();
	}

	/** Ambient-якоря следуют за китом; горизонтальный поток — в шейдере (uScrollPhase). */
	_syncWhaleAnchorPositions() {
		const { x, y, z } = this.whaleGroup.position;

		this.deepOceanAnchor.position.set(x, y, z);
		this.whaleAmbientGroup.position.set(x, y, z);
	}

	/** Nearby water follows the creature's actual head-to-tail axis. The wake is
	 * the reverse of its travel direction; it never steers independently toward
	 * the camera just because the cursor reaches a screen edge. */
	_updateWhaleLocalFlow(delta) {
		const yaw = this.cursorReaction.yaw / whaleCursorReactionConfig.yaw;
		const pitch = this.cursorReaction.pitch / whaleCursorReactionConfig.pitch;
		this._whaleLocalFlowTarget.set(
			1,
			pitch * .16,
			yaw * .36,
		).normalize();
		this._whaleLocalFlow.lerp(this._whaleLocalFlowTarget, 1 - Math.exp(-3.8 * Math.max(0, delta)));
		this._whaleLocalFlow.normalize();

		// In the authored creature, +X runs from the head towards the tail. That
		// is exactly the direction in which displaced water must travel.
		this._whaleWorldFlow.copy(this._whaleLocalFlow)
			.transformDirection(this.whaleGroup.matrixWorld);
		this.whaleAmbientGroup.parent?.updateWorldMatrix(true, false);
		if (this.whaleAmbientGroup.parent) {
			this._whaleFlowParentInverse.copy(this.whaleAmbientGroup.parent.matrixWorld).invert();
			this._whaleAmbientFlowTarget.copy(this._whaleWorldFlow)
				.transformDirection(this._whaleFlowParentInverse);
		} else {
			this._whaleAmbientFlowTarget.copy(this._whaleWorldFlow);
		}
		this._whaleAmbientFlow.lerp(this._whaleAmbientFlowTarget,
			1 - Math.exp(-3.2 * Math.max(0, delta))).normalize();
	}

	_applyWhaleVisuals() {
		if (!this.whaleReady) {
			return;
		}

		const w = digitalWhaleConfig.whale;

		if (this.whaleRenderMode === "hologram" && this.whaleHologramMaterial) {
			if (this.whaleRoot.userData.authoredWhale) {
				applyMobileWhaleVisuals(this.whaleHologramMaterial,w,getGraphicsTier(),this.elapsed);
				this.whaleHologramMaterial.uniforms.uEntranceReveal.value = this._whaleEntrance.reveal;
				return;
			}
			applyWhaleHologramVisuals(this.whaleHologramMaterial, {
				colorTint: w.colorTint,
				emissiveIntensity: w.emissiveIntensity,
				opacity: w.opacity,
			});
			return;
		}

		if (!this.whaleParticles) {
			return;
		}

		const grainBlurRadius = getUnderwaterGrainBlurRadius();
		this.whaleParticles.material.uniforms.uRasterScale.value = this._getParticleRasterScale();
		applyWhaleVisuals(this.whaleParticles, {
			colorTint: w.colorTint,
			emissiveIntensity: w.emissiveIntensity,
			glowPulse: w.glowPulse,
			elapsed: this.elapsed,
			opacity: w.opacity,
			pointScale: w.pointScale,
			particleScale: w.particleScale,
			particleDensity: w.particleDensity,
			grainBlurRadius,
		});
		if (this._compactHighHome) {
			const u = this.whaleParticles.material.uniforms;
			// High's original HDR hue/pulse, calibrated for the smaller body rather
			// than a desktop-sized sprite. Sharp single-tap cores also save work.
			u.uPointScale.value = Math.min(u.uPointScale.value, 4);
			u.uGlow.value = .7 + (u.uGlow.value - .7) * .7;
			u.uAlphaMult.value *= .85;
			u.uGrainBlurRadius.value = 0;
		}
	}

	applyConfig() {
		const c = digitalWhaleConfig;
		const fogColor = new THREE.Color(c.fog.color);

		this._rebuildOceanGrid();
		this._rebuildWhaleParticles();

		this.threeScene.background = new THREE.Color(c.background.color);

		if (!this.threeScene.fog) {
			this.threeScene.fog = new THREE.Fog(c.fog.color, c.fog.near, c.fog.far);
		} else {
			this.threeScene.fog.color.copy(fogColor);
			this.threeScene.fog.near = c.fog.near;
			this.threeScene.fog.far = c.fog.far;
		}

		for (const mat of this.fogMaterials) {
			mat.uniforms.fogColor.value.copy(fogColor);
			mat.uniforms.fogNear.value = c.fog.near;
			mat.uniforms.fogFar.value = c.fog.far;
		}

		const o = c.ocean;
		this.oceanGroup.position.set(o.posX, o.posY, o.posZ);
		this.oceanGroup.scale.set(o.scaleX, 1, o.scaleZ);
		this.whaleScaleNeutralizer.scale.set(1 / Math.max(o.scaleX, 1e-6), 1, 1 / Math.max(o.scaleZ, 1e-6));

		this._applyOceanMaterialConfig(o);
		this._syncOceanRipple();
		this._syncOceanScrollState();

		this._applyWhaleTransform();
		this._applyWhaleVisuals();
		this.whaleWake?.applyConfig(c.whale.wake);
		this.whaleTrail?.applyConfig?.(c.whale.wake);
		this.ambientEffects?.applyConfig(buildTierScaledWhaleConfig(c));
		this._syncFogMaterials();
		this.syncCamera();
		this._applyOceanTilt();
		this._updateWhaleViewportLayout();
		this._updateWhaleBodySway();
	}

	/** DEV panel: update only ocean transforms/uniforms; rebuild geometry explicitly. */
	applyOceanConfigFromDev(options = {}) {
		if (!import.meta.env.DEV) {
			return;
		}

		const o = digitalWhaleConfig.ocean;
		if (options.rebuildGrid === true) {
			this._rebuildOceanGrid();
		}

		this.oceanGroup.position.set(o.posX, o.posY, o.posZ);
		this.oceanGroup.scale.set(o.scaleX, 1, o.scaleZ);
		this.whaleScaleNeutralizer.scale.set(1 / Math.max(o.scaleX, 1e-6), 1, 1 / Math.max(o.scaleZ, 1e-6));
		this._applyOceanTilt();
		this.oceanGroup.updateMatrixWorld(true);
		this._applyOceanMaterialConfig(o);
		this._syncOceanScrollState();
		this._syncOceanRipple();
	}

	/** DEV panel: live whale tuning (position/rotation/particle params) без пересборки геометрии. */
	applyWhaleConfigFromDev() {
		if (!import.meta.env.DEV) {
			return;
		}

		const w = digitalWhaleConfig.whale;
		this._applyWhaleTransform();
		this._applyWhaleVisuals();
		this.whaleWake?.applyConfig?.(w.wake);
		this.whaleTrail?.applyConfig?.(w.wake);
		this.whaleGroup.updateMatrixWorld(true);
		this._syncWhaleAnchorPositions();
		this._syncOceanRipple();
	}

	/** DEV panel: restart the authored approach from the currently edited origin. */
	restartWhaleEntranceFromDev() {
		if (!import.meta.env.DEV || !this.whaleReady) return;
		this._whaleEnterCompleted = false;
		this._whaleEnterActive = true;
		this._pendingWhaleEnter = false;
		this._whaleEnterStartedAt = this.elapsed;
		this._whaleEnterDuration = Math.max((digitalWhaleConfig.whaleEnter?.durationMs ?? 6500) / 1000, .1);
		this._whaleEntrance.sample(0);
		this._applyWhaleIntroPose();
		this._updateWhaleBodySway(this.elapsed);
		this._applyWhaleVisuals();
	}

	_applyOceanTilt() {
		const o = digitalWhaleConfig.ocean;
		this.oceanGroup.rotation.x = o.tiltX;
		this.oceanGroup.rotation.y = o.rotationY;
	}

	_publishSceneProgressDebug(frame, sceneProgress) {
		if (!import.meta.env.DEV) {
			return;
		}
		const drift = getHeroSceneProgressDrift(sceneProgress);
		appStore.homeSceneProgressDebug = {
			...drift,
			sceneProgressTarget: frame?.sceneProgressTarget ?? sceneProgress,
			role: frame?.sceneRole ?? "off",
		};
	}

	/** След за китом: центр и направление хвоста в мировых XZ. */
	_syncOceanRipple() {
		if (!this.oceanSurfaceGroup.visible) return;
		if (!this.oceanMaterial) {
			return;
		}

		const o = digitalWhaleConfig.ocean;

		if (this.whaleGroup && o.rippleFollowWhale !== false) {
			// localToWorld updates this transform and its parents, without walking
			// the whale skeleton and particle children just to locate the ripple.
			this._rippleLocalOffset.set(o.rippleCenterX, 0, o.rippleCenterZ);
			this._rippleWorld.copy(this._rippleLocalOffset);
			this.whaleGroup.localToWorld(this._rippleWorld);

			// +X модели кита — вперёд; рябь тянется назад (против движения).
			this._swimForward.set(1, 0, 0).transformDirection(this.whaleGroup.matrixWorld);
			this._swimForward.y = 0;
			if (this._swimForward.lengthSq() < 1e-6) {
				this._swimForward.set(1, 0, 0);
			} else {
				this._swimForward.normalize();
			}
			this._rippleWakeDir.set(-this._swimForward.x, -this._swimForward.z);
		} else {
			this._rippleWorld.set(o.rippleCenterX, 0, o.rippleCenterZ);
			this.oceanGroup.localToWorld(this._rippleWorld);

			// Фиксированная рябь: направление = поток океана (вправо +X, от камеры −Z).
			const scrollX = Math.abs(o.scrollSpeedX ?? 0) > 1e-6 ? o.scrollSpeedX : 1;
			const scrollZ = o.scrollSpeedZ ?? 0;
			this._swimForward.set(scrollX, 0, -scrollZ);
			this._swimForward.transformDirection(this.oceanGroup.matrixWorld);
			this._swimForward.y = 0;
			if (this._swimForward.lengthSq() < 1e-6) {
				this._rippleWakeDir.set(1, 0);
			} else {
				this._swimForward.normalize();
				this._rippleWakeDir.set(this._swimForward.x, this._swimForward.z);
			}
		}
		// Rotate the local surface wake with the cursor-driven body turn. This only
		// bends water close to the animal; the ocean grid still travels rightward.
		const localFlow = this._whaleLocalFlow ?? { x: 1, z: 0 };
		const flowAngle = Math.atan2(localFlow.z, localFlow.x) * .72;
		const rippleX = this._rippleWakeDir.x;
		const rippleY = this._rippleWakeDir.y;
		this._rippleWakeDir.set(
			rippleX * Math.cos(flowAngle) - rippleY * Math.sin(flowAngle),
			rippleX * Math.sin(flowAngle) + rippleY * Math.cos(flowAngle),
		).normalize();

		this.oceanMaterial.uniforms.uRippleCenter.value.set(this._rippleWorld.x, this._rippleWorld.z);
		this.oceanMaterial.uniforms.uRippleDir.value.copy(this._rippleWakeDir);
		if (this.oceanGridMaterial) {
			this.oceanGridMaterial.uniforms.uRippleCenter.value.set(this._rippleWorld.x, this._rippleWorld.z);
			this.oceanGridMaterial.uniforms.uRippleDir.value.copy(this._rippleWakeDir);
		}
	}

	applyCamera(camera, frame) {
		this.applyScrollCamera(camera, frame);
	}

	/** Анимация скролла — камера по sceneProgress при role current|next. */
	applyScrollCamera(camera, frame) {
		const sceneProgress = frame?.sceneProgress ?? 0;
		this.syncCamera(sceneProgress);
		this._syncOceanScrollState();
		this._syncOceanRipple();
		this._publishSceneProgressDebug(frame, sceneProgress);

		camera.position.copy(this.cameraPos);
		camera.lookAt(this.lookAtTarget);
		camera.fov = this._cameraFov ?? heroCamera.fov;
		camera.updateProjectionMatrix();
		applyDeviceTiltCamera(camera, frame);
		this._wakeCameraWorld.copy(camera.position);

		this._ensureOceanTileCoverage(camera);
		this._syncOceanScroll();
	}

	update(delta, frame) {
		this.elapsed += delta;
		const c = digitalWhaleConfig;

		const pointer = frame?.visualPointer ?? frame?.pointer ?? { x: 0, y: 0 };
		const sceneProgress = frame?.sceneProgress ?? this._lastSceneProgress;
		this._lastSceneProgress = Number.isFinite(sceneProgress) ? sceneProgress : this._lastSceneProgress;
		this._accumulateScrollSpeeds(delta, c);
		this._syncOceanScrollState();
		this.smoothPointer.x += (pointer.x - this.smoothPointer.x) * 0.08;
		this.smoothPointer.y += (pointer.y - this.smoothPointer.y) * 0.08;

		this._applyOceanTilt();
		this._updateWhaleEnterAnimation();
		this.cursorReaction.update(delta, frame, this._appStarted && this.whaleReady);
		this._updateWhaleBodySway();
		this.whaleGroup.updateMatrixWorld(true);
		this.surfaceInteraction.surface?.syncCamera(this.cameraPos, this.lookAtTarget,
			this._cameraFov ?? heroCamera.fov,
			(frame?.viewportWidth || window.innerWidth) / (frame?.viewportHeight || window.innerHeight));
		if (this.surfaceInteraction.surface) applyDeviceTiltCamera(this.surfaceInteraction.surface.camera, frame);
		this.surfaceInteraction.update(delta, frame, this._appStarted && this.whaleReady,
			this.cursorReaction.hasHoverPointer, this.cursorReaction.motionPreference.matches);
		this._updateWhaleLocalFlow(delta);
		this._syncOceanRipple();

		if (this.whaleMixer) {
			const clickX = this.surfaceInteraction.responseDirection.x * this.surfaceInteraction.responseEnergy * .12;
			const clickY = this.surfaceInteraction.responseDirection.y * this.surfaceInteraction.responseEnergy * .08;
			sampleWhaleReactions(this.whaleReactionActions,
				this.cursorReaction.yaw / whaleCursorReactionConfig.yaw + clickX,
				(-this.cursorReaction.pitch / whaleCursorReactionConfig.pitch + clickY) * .55);
			const clickAmplitude0 = Math.sqrt(this.surfaceInteraction.responseEnergies[0]);
			const clickAmplitude1 = Math.sqrt(this.surfaceInteraction.responseEnergies[1]);
			const clickWeightScale = .3 / Math.max(1, clickAmplitude0 + clickAmplitude1);
			sampleWhaleGesture(this.whaleClickActions?.[0], this.surfaceInteraction.responseProgresses[0],
				clickAmplitude0 * clickWeightScale);
			sampleWhaleGesture(this.whaleClickActions?.[1], this.surfaceInteraction.responseProgresses[1],
				clickAmplitude1 * clickWeightScale);
			sampleWhaleGesture(this.whaleEntranceAction, this._whaleEntrance.strokeProgress,
				this._whaleEnterActive ? this._whaleEntrance.strokeWeight : 0);
			this.whaleMixer.update(delta);
		}

		if (this.whaleRoot) {
			this.whaleRoot.updateMatrixWorld(true);
		}

		if (this.whaleHologramMaterial) {
			this.whaleHologramMaterial.uniforms.uTime.value = this.elapsed;
		}

		if (this.whaleParticles) {
			this.whaleParticles.updatePositions();
			this.whaleParticles.material.uniforms.uTime.value = this.elapsed;
		}

		this._applyWhaleVisuals();
		this.cursorReaction.applyUniforms(this.whaleHologramMaterial?.uniforms,
			(frame?.viewportWidth || window.innerWidth) / (frame?.viewportHeight || window.innerHeight));
		this.surfaceInteraction.applyUniforms(this.whaleHologramMaterial?.uniforms);

		this._wakeCameraWorld.copy(this.cameraPos);
		this.whaleWake?.update(delta, this.elapsed);
		this.ambientEffects?.update(delta, this.elapsed, {
			deep: this._deepScrollAuto,
			whale: this._whaleAmbientScrollAuto,
		}, this._whaleAmbientFlow);

		if (this.oceanMaterial) {
			this.oceanMaterial.uniforms.uTime.value = this.elapsed;
		}

		if (this.oceanGridMaterial) {
			this.oceanGridMaterial.uniforms.uTime.value = this.elapsed;
		}

		this.heroTitle?.update(delta);
	}

	dispose() {
		this._disposed = true;
		this.cursorReaction.dispose();
		this.surfaceInteraction.dispose();
		this._whaleLoadToken += 1;
		if (this._heroShowRaf) {
			cancelAnimationFrame(this._heroShowRaf);
			this._heroShowRaf = 0;
		}
		this.heroTitle?.dispose();
		this.heroTitle = null;

		this.lowWhaleBloom?.dispose();
		this.lowWhaleBloom = null;
		if (this.whaleRoot) {
			disposeWhaleRoot(this.whaleRoot);
		}

		this.whaleParticles = null;
		this.whaleHologramMaterial = null;

		this.whaleMixer = null;
		this.whaleReactionActions = null;
		this.whaleClickActions = null;
		this.whaleEntranceAction = null;
		this.whaleSwimAction = null;
		this.whaleReady = false;

		if (this.whaleWake) {
			this.whaleWake.points.removeFromParent();
			this.whaleWake.dispose();
			this.whaleWake = null;
		}
		this.whaleTrail = null;

		this._disposeOceanSurface();

		for (const item of this.ambientDisposables ?? []) {
			item?.dispose?.();
		}
		this.ambientDisposables = [];
		this.ambientEffects = null;
	}
}
