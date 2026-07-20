import * as THREE from "three";

import { digitalWhaleConfig } from "./digitalWhaleConfig.js";
import { easeLinearBlendOut, getHeroCameraForSceneProgress, heroCamera, HERO_LOOK_AT, smoothSinePhase } from "./heroCamera.js";
import { getHeroSceneProgressDrift } from "./heroSceneProgressDrift.js";
import { shouldActivateRoutePage } from "@/utils/shouldActivateRoutePage.js";
import { store as appStore } from "@/store.jsx";
import { createAmbientEffects } from "./utils/createAmbientEffects.js";
import {
	createOceanGridLines,
	createOceanParticles,
	createOceanSurface,
	getOceanTileScrollX,
	resolveOceanTileSlotCount,
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
import { getGraphicsTier } from "@/utils/getGraphicsTier.js";
import { createHeroTitleText } from "./heroText/createHeroTitleText.js";
import { isRingDormantReason } from "@/three/scenes/lifecycle/sceneLifecycle.js";

/**
 * Hero-сцена: цифровой океан + FBX кит.
 * low/medium — shader-плоскость; high — Points + LineSegments.
 */
export class DigitalWhaleScene {
	constructor() {
		this._disposed = false;
		this.oceanDisposables = [];

		this.threeScene = new THREE.Scene();
		this.elapsed = 0;
		this.smoothPointer = new THREE.Vector2(0, 0);
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
		this._lastSceneProgress = 0;
		this._wakeCameraWorld = new THREE.Vector3();

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
		this.whaleParticles = null;
		this.whaleParticleMeshes = null;
		this.whaleHologramMaterial = null;
		this.whaleRenderMode = shouldUseWhaleHologram() ? "hologram" : "particles";
		this._whaleEdgeSpacing = null;
		this.whaleReady = false;
		this._whaleLoadToken = 0;
		this._whaleBasePos = new THREE.Vector3();
		this._whaleBaseRot = new THREE.Euler();
		this._whaleEnterFrom = new THREE.Vector3();
		this._whaleEnterTo = new THREE.Vector3();
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

	/** Screen-space hero title (digital-monster TextMesh). */
	initHeroText(renderer) {
		this._heroRenderer = renderer;
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
			return;
		}
		this.heroTitle = createHeroTitleText(this._heroRenderer, this.threeScene);
		// prepareHidden / scrollHint reset — meshes stay in the graph for warmupPrograms.
		this.heroTitle.reset();
		this._heroTitleHiddenForLeave = true;
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
			// Page-owned: «листайте вниз» must not linger on hub/case/about.
			this.heroTitle?.hideScrollHint?.();
			return;
		}

		if (this.heroTitle) {
			if (this._heroTitleHiddenForLeave) {
				// Off the carousel-commit frame — reveal must not stack with hub dormant work.
				this._scheduleHeroTitleShow();
			} else {
				this.heroTitle.applyPosition?.();
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
		if (!this.heroTitle || !this._heroRenderer) {
			return;
		}

		this.heroTitle.dispose();
		this.heroTitle = createHeroTitleText(this._heroRenderer, this.threeScene);
		if (this._appStarted) {
			this.heroTitle.show({ waitForLoaderCurtain: false });
		}
	}

	_isHomePath(pathname) {
		return pathname === "/" || pathname === "";
	}

	_applyWhaleIntroPose() {
		const w = digitalWhaleConfig.whale;
		const intro = digitalWhaleConfig.whaleIntro ?? w;
		this._whaleBasePos.set(intro.posX ?? w.posX, intro.posY ?? w.posY, intro.posZ ?? w.posZ);
	}

	_playWhaleEnterAnimation() {
		if (this._whaleEnterCompleted || this._whaleEnterActive) {
			return;
		}

		const w = digitalWhaleConfig.whale;
		const intro = digitalWhaleConfig.whaleIntro ?? w;
		this._whaleEnterFrom.set(intro.posX ?? w.posX, intro.posY ?? w.posY, intro.posZ ?? w.posZ);
		this._whaleEnterTo.set(w.posX, w.posY, w.posZ);
		this._whaleEnterActive = true;
		this._whaleEnterStartedAt = this.elapsed;
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

		const enter = digitalWhaleConfig.whaleEnter ?? {};
		const duration = Math.max((enter.durationMs ?? 4000) / 1000, 0.001);
		const linear = Math.min(1, (this.elapsed - this._whaleEnterStartedAt) / duration);
		const eased = easeLinearBlendOut(linear, enter.endEasePower ?? 5, enter.endEaseBias ?? 2.5);

		this._whaleBasePos.lerpVectors(this._whaleEnterFrom, this._whaleEnterTo, eased);

		if (linear >= 1) {
			this._whaleEnterActive = false;
			this._whaleEnterCompleted = true;
			this._whaleBasePos.copy(this._whaleEnterTo);
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

		return loadAnimatedWhale({ edgeSpacing: w.edgeSpacing, renderMode: this.whaleRenderMode })
			.then((whale) => {
				if (this._disposed || loadToken !== this._whaleLoadToken) {
					disposeWhaleRoot(whale.root);
					return;
				}

				this.whaleRoot = whale.root;
				this.whaleMixer = whale.mixer;
				this.whaleSwimAction = whale.swimAction;
				this.whaleParticles = whale.particles;
				this.whaleParticleMeshes = whale.particleMeshes;
				this.whaleHologramMaterial = whale.hologramMaterial;
				this.whaleRenderMode = whale.renderMode;
				this._whaleEdgeSpacing = w.edgeSpacing;
				this.whaleGroup.add(whale.root);
				this.whaleReady = true;
				this._initWhaleWake(whale.root);
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
		return resolveOceanGridSize(o.gridCols, o.gridRows, getGraphicsTier(), {
			bypassTierCap: import.meta.env.DEV,
		});
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
			bypassTierCap: import.meta.env.DEV,
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

	/** Скролл: shader — uniform vec2; points — тайлы по X, фаза Z в шейдере. */
	_syncOceanScroll() {
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
		if (!camera || (!this.oceanMesh && !this.oceanSurfaceTiles?.length)) {
			return;
		}

		this.oceanGroup.updateMatrixWorld(true);
		this.oceanSurfaceGroup.worldToLocal(this._coverageCamScratch.copy(camera.position));
		this._oceanCoverageOffsetX = this._coverageCamScratch.x;
	}

	_applyOceanMaterialConfig(o) {
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

		if (this.oceanGridMaterial) {
			this.oceanGridMaterial.uniforms.uColor.value.set(o.gridColor);
			this.oceanGridMaterial.uniforms.uWaveAmp.value = o.waveAmp;
			this.oceanGridMaterial.uniforms.uRippleAmp.value = o.rippleAmp;
			this.oceanGridMaterial.uniforms.uGridAlpha.value = o.gridAlpha;
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

	syncCamera(pointer = { x: 0, y: 0 }, sceneProgress = 0) {
		this._lastSceneProgress = Number.isFinite(sceneProgress) ? sceneProgress : 0;
		const c = getHeroCameraForSceneProgress(this._lastSceneProgress);
		const px = pointer.x ?? 0;
		const py = pointer.y ?? 0;
		/**
		 * Vertical scroll parallax: +sceneProgress lowers camera (content rises).
		 * lookAt.y follows the same ΔY so the frame translates — not just pitches.
		 */
		const scrollYDelta = c.y - heroCamera.y;

		this.cameraPos.set(c.x + px * c.parallaxX, c.y + py * c.parallaxY, c.z);
		this.lookAtTarget.set(
			HERO_LOOK_AT.x + px * c.parallaxX * c.parallaxLook,
			HERO_LOOK_AT.y + scrollYDelta + py * c.parallaxY * c.parallaxLook,
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

		this.oceanScrollAuto += (ocean.scrollSpeedX ?? 0) * delta;
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
			this.whaleSwimAction.timeScale = w.swimSpeed;
		}
	}

	_initWhaleWake(whaleRoot) {
		if (this.whaleWake) {
			this.whaleWake.points.removeFromParent();
			this.whaleWake.dispose();
		}

		this.whaleWake = createWhaleWake({
			config: digitalWhaleConfig.whale.wake,
			whaleRoot,
			getCameraWorldPosition: () => this._wakeCameraWorld,
			getBodySamples: () => {
				const positionAttr = this.whaleParticles?.geometry?.attributes?.position;
				if (positionAttr?.array && positionAttr.count > 0) {
					return {
						positions: positionAttr.array,
						count: positionAttr.count,
					};
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

		const bobY = Math.sin(elapsed * (sway.bobSpeed ?? 0.9)) * (sway.bobAmp ?? 0);
		const pitchZ = Math.sin(elapsed * (sway.pitchSpeed ?? 0.72) + 0.4) * (sway.pitchAmp ?? 0);
		const rollX = Math.sin(elapsed * (sway.rollSpeed ?? 0.58) + 1.2) * (sway.rollAmp ?? 0);
		const yawY = smoothSinePhase(elapsed * (sway.yawSpeed ?? 0), sway.yawSmooth ?? 0) * (sway.yawAmp ?? 0);

		this.whaleGroup.position.set(this._whaleBasePos.x, this._whaleBasePos.y + bobY, this._whaleBasePos.z);
		this.whaleGroup.rotation.set(this._whaleBaseRot.x + rollX, this._whaleBaseRot.y + yawY, this._whaleBaseRot.z + pitchZ);

		this._syncWhaleAnchorPositions();
	}

	/** Ambient-якоря следуют за китом; горизонтальный поток — в шейдере (uScrollPhase). */
	_syncWhaleAnchorPositions() {
		const { x, y, z } = this.whaleGroup.position;

		this.deepOceanAnchor.position.set(x, y, z);
		this.whaleAmbientGroup.position.set(x, y, z);
	}

	_applyWhaleVisuals() {
		if (!this.whaleReady) {
			return;
		}

		const w = digitalWhaleConfig.whale;

		if (this.whaleRenderMode === "hologram" && this.whaleHologramMaterial) {
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
		applyWhaleVisuals(this.whaleParticles, {
			colorTint: w.colorTint,
			emissiveIntensity: w.emissiveIntensity,
			glowPulse: w.glowPulse,
			elapsed: this.elapsed,
			opacity: w.opacity,
			pointScale: w.pointScale,
			grainBlurRadius,
		});
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
		this.ambientEffects?.applyConfig(buildTierScaledWhaleConfig(c));
		this._syncFogMaterials();
		this.syncCamera(this.smoothPointer);
		this._applyOceanTilt(this.smoothPointer);
	}

	_applyOceanTilt(pointer = { x: 0, y: 0 }) {
		const o = digitalWhaleConfig.ocean;
		this.oceanGroup.rotation.x = o.tiltX + (pointer.y ?? 0) * o.mouseTiltX;
		this.oceanGroup.rotation.y = o.rotationY + (pointer.x ?? 0) * o.mouseTiltY;
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
		if (!this.oceanMaterial) {
			return;
		}

		const o = digitalWhaleConfig.ocean;

		if (this.whaleGroup && o.rippleFollowWhale !== false) {
			this.whaleGroup.updateMatrixWorld(true);
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
			this.oceanGroup.updateMatrixWorld(true);
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
		this.syncCamera(this.smoothPointer, sceneProgress);
		this._syncOceanScrollState();
		this._syncOceanRipple();
		this._publishSceneProgressDebug(frame, sceneProgress);

		camera.position.copy(this.cameraPos);
		camera.lookAt(this.lookAtTarget);
		this._wakeCameraWorld.copy(camera.position);
		camera.fov = this._cameraFov ?? heroCamera.fov;
		camera.updateProjectionMatrix();

		this._ensureOceanTileCoverage(camera);
		this._syncOceanScroll();
	}

	update(delta, frame) {
		this.elapsed += delta;
		const c = digitalWhaleConfig;

		const pointer = frame?.pointer ?? { x: 0, y: 0 };
		const sceneProgress = frame?.sceneProgress ?? this._lastSceneProgress;
		this._lastSceneProgress = Number.isFinite(sceneProgress) ? sceneProgress : this._lastSceneProgress;
		this._accumulateScrollSpeeds(delta, c);
		this._syncOceanScrollState();
		this.smoothPointer.x += (pointer.x - this.smoothPointer.x) * 0.08;
		this.smoothPointer.y += (pointer.y - this.smoothPointer.y) * 0.08;

		this._applyOceanTilt(this.smoothPointer);
		this._updateWhaleEnterAnimation();
		this._updateWhaleBodySway();
		this._syncOceanRipple();

		if (this.whaleMixer) {
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

		this._wakeCameraWorld.copy(this.cameraPos);
		this.whaleWake?.update(delta, this.elapsed);
		this.ambientEffects?.update(delta, this.elapsed, c, {
			deep: this._deepScrollAuto,
			whale: this._whaleAmbientScrollAuto,
		});

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
		this._whaleLoadToken += 1;
		if (this._heroShowRaf) {
			cancelAnimationFrame(this._heroShowRaf);
			this._heroShowRaf = 0;
		}
		this.heroTitle?.dispose();
		this.heroTitle = null;

		if (this.whaleRoot) {
			disposeWhaleRoot(this.whaleRoot);
		}

		this.whaleParticles = null;
		this.whaleHologramMaterial = null;

		this.whaleMixer = null;
		this.whaleSwimAction = null;
		this.whaleReady = false;

		if (this.whaleWake) {
			this.whaleWake.points.removeFromParent();
			this.whaleWake.dispose();
			this.whaleWake = null;
		}

		this._disposeOceanSurface();

		for (const item of this.ambientDisposables ?? []) {
			item?.dispose?.();
		}
		this.ambientDisposables = [];
		this.ambientEffects = null;
	}
}
