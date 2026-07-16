import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { RectAreaLightHelper } from "three/examples/jsm/helpers/RectAreaLightHelper.js";
import { isPortfolioHubPath, isPortfolioCasePath, projectsData } from "./hub/projectsData.js";
import { shouldActivateRoutePage } from "../../../utils/shouldActivateRoutePage.js";
import {
	buildPlateGridLayouts,
	portfolioHubPlatesConfig,
	portfolioHubLights,
	getProjectPlateLayout,
	getProjectPlateFlatIndex,
	getGridFocusSlide,
} from "./hub/portfolioHubConfig.js";
import { store as appStore } from "../../../store.jsx";
import { CenterPlateNipigasLogos } from "./hub/CenterPlateNipigasLogos.js";
import { HubPlatesRenderer } from "./hub/HubPlatesRenderer.js";
import { HubPlateProjectLabels } from "./hub/hubPlateProjectLabel.js";
import { HubPlateDetailsButtons } from "./hub/hubPlateDetailsButton.js";
import { HubScreenTitle } from "./hub/hubScreenTitle.js";
import { createPortfolioHubLocaleSwitchController } from "./hub/portfolioHubLocaleSwitch.js";
import { advanceHubMenuAnim, createHubAnimState, getPlateProgressForProject } from "./hub/hubMenuAnimation.js";
import { lerpGridTransform } from "./hub/gridEnterAnimation.js";
import { clamp01, easeInOutCubic } from "./hub/hubMenuAnimation.js";
import { easing } from "maath";
import { fadeOutSound, playHubCardMovementSound, playSound } from "../../../sounds/soundDesign.js";
import { requestPortfolioCaseNavigation } from "../../../utils/portfolioHubNavigate.js";
import { resetPortfolioHubBackgroundFocus, commitPortfolioHubFocusIndex } from "../../../utils/portfolioHubBackground.js";
import { getSceneCarousel } from "../../render/transition/carouselPage.js";
import { getHexShaderProgress } from "../../render/overlay/hexShaderProgress.js";
import { isCarouselProgressAtSegmentStart } from "@/three/scenes/lifecycle/sceneLifecycle.js";
import { applySceneProgressToCamera } from "../utils/applySceneProgressToCamera.js";
import { getLoaderCurtainRemainingMs } from "../../../config/loaderCurtain.js";

function gridSlideForTarget(targetIndex) {
	return targetIndex >= 0 ? getGridFocusSlide(targetIndex) : { y: 0, z: 0 };
}

/** В r155 DirectionalLightHelper убрали из examples — стрелка к target. */
function createDirectionalDevHelper(light) {
	const origin = light.position.clone();
	const target = light.target.position.clone();
	const direction = target.sub(origin);
	const length = Math.max(direction.length(), 2);
	direction.normalize();

	const arrow = new THREE.ArrowHelper(direction, origin, length, light.color.getHex(), length * 0.12, length * 0.06);
	arrow.userData.devLight = light;
	arrow.userData.devLightKind = "directional";
	return arrow;
}

function updateDirectionalDevHelper(arrow, light) {
	const origin = light.position;
	const target = light.target.position;
	const direction = new THREE.Vector3().subVectors(target, origin);
	const length = Math.max(direction.length(), 2);
	direction.normalize();

	arrow.position.copy(origin);
	arrow.setDirection(direction);
	arrow.setColor(light.color);
	arrow.setLength(length, length * 0.12, length * 0.06);
}

function disposeObject3D(root) {
	root.traverse((node) => {
		node.geometry?.dispose?.();
		if (node.material) {
			if (Array.isArray(node.material)) {
				for (const material of node.material) {
					material.dispose?.();
				}
			} else {
				node.material.dispose?.();
			}
		}
	});
}

let hubRectAreaUniformsReady = false;

function ensureHubRectAreaUniforms() {
	if (!hubRectAreaUniformsReady) {
		RectAreaLightUniformsLib.init();
		hubRectAreaUniformsReady = true;
	}
}

/**
 * Сцена хаба портфолио (/portfolio): 5×60 плит (InstancedMesh + 7 project mesh).
 */
export class PortfolioHubScene {
	constructor() {
		this.threeScene = new THREE.Scene();
		this.root = new THREE.Group();
		/** Сдвиг всех плит по локальной Z при фокусе на проекте. */
		this.platesGroup = new THREE.Group();
		this.root.add(this.platesGroup);
		this.threeScene.add(this.root);

		this.showHub = false;
		this.enterActive = false;
		/** dormant — плиты в enter-позе, invisible; entering/active/exiting — анимации. */
		this._hubLifecycle = "dormant";
		this.lastRouteKey = "";
		/** Текущий отображаемый роут — для HUD списка проектов (только /portfolio). */
		this._routeDisplayedPage = "/";
		this._routeTeleportPage = "/";
		this._routePhase = "idle";
		/** Enter-анимация hub отложена до кнопки «Начать» на прелоадере. */
		this._pendingHubEnter = false;
		/** Enter отложен до ухода чёрных блоков прелоадера (первый заход на /portfolio). */
		this._hubEnterDelayTimer = 0;
		/** Список проектов стартует после начала grid enter (плиты первыми). */
		this._projectsIntroDelayTimer = 0;
		this._appStarted = false;
		this._lastAppStarted = false;
		this._lastHudTitleVisibility = -1;
		/** Сглаженный множитель bloom (0…1), без скачка при смене lifecycle. */
		this._hubBloomRevealCurrent = 0;
		this.centerPlateLogos = new CenterPlateNipigasLogos();
		this.plateProjectLabels = new HubPlateProjectLabels();
		this.plateDetailsButtons = new HubPlateDetailsButtons();
		this.screenTitle = new HubScreenTitle(this.threeScene);
		this._portfolioLocaleSwitch = createPortfolioHubLocaleSwitchController({
			getProjectsColumn: () => this.screenTitle?.projectsColumn,
			getPlateLabels: () => this.plateProjectLabels,
			getPlateDetailsButtons: () => this.plateDetailsButtons,
		});
		this._logoRevealAlpha = 0;
		this._devPlateLabelRevealOverride = null;
		this._devPlateLabelRevealRaf = 0;
		/** Последний видимый логотип (для fade-out при exit). */
		this._lastVisibleLogo = {
			projectIndex: -1,
			alpha: 0,
			partLinear: 0,
			entering: false,
		};
		this._logoExitSnapshot = null;
		this._lookAtTarget = new THREE.Vector3(portfolioHubPlatesConfig.camera.lookAt[0], portfolioHubPlatesConfig.camera.lookAt[1], portfolioHubPlatesConfig.camera.lookAt[2]);
		/** Сетка → карточка (30%) → логотип (30%); per-project прерывания. */
		this._hubAnim = createHubAnimState();
		this._plateByProjectIndex = new Map();
		this.platesRenderer = new HubPlatesRenderer(this.platesGroup);
		this.plates = this.platesRenderer.plates;
		this.sharedPlateMaterial = null;
		/** Last applied plate visibility (avoid per-frame opacity writes when idle). */
		this._lastPlateVisibilityMul = -1;
		/** Last focus logo sync signature. */
		this._lastFocusLogoSig = "";
		/** Last platesGroup Y/Z from menu anim. */
		this._lastMenuGridY = Number.NaN;
		this._lastMenuGridZ = Number.NaN;
		/** true после resetCarouselState — без reset enter не запускаем. */
		this._carouselEnterPending = false;
		/** 0…1: анимация gridOffset/gridRotation при заходе на hub; 1 = покой. */
		this._gridEnterProgress = 1;
		this._gridEnterStartedAt = 0;
		/** Исчезновение сетки при уходе с hub. */
		this._gridExitActive = false;
		this._gridExitProgress = 0;
		this._gridExitStartedAt = 0;
		/** Снимок root в момент старта exit (реальная позиция, не конфиг). */
		this._gridExitFromOffset = null;
		this._gridExitFromRotation = null;
		/** Доп. поворот сетки от курсора (градусы), поверх gridRotation. */
		this._cursorTiltRotX = 0;
		this._cursorTiltRotY = 0;
		this._plateHoverRaycaster = new THREE.Raycaster();
		this._plateHoverPointer = new THREE.Vector2();
		this._plateHovered = false;
		this._lastPlateHoverPointerX = Number.NaN;
		this._lastPlateHoverPointerY = Number.NaN;
		this._lastPlateHoverFocusIndex = -2;
		this._lastPlateHoverCanHover = false;
		this._plateHoverNeedsRaycast = true;
		this._pointerDown = false;
		this._pointerClickPending = false;
		/** Dev: override Z камеры (null = из конфига). */
		this._devCameraZ = null;

		this.lightHelpersGroup = new THREE.Group();
		this.threeScene.add(this.lightHelpersGroup);
		this._lightHelpersVisible = false;

		ensureHubRectAreaUniforms();
		this._buildLights();
		this.readyPromise = this._buildPlates();
		this.applyFogFromConfig();
		this._ensureDormantState();
	}

	_buildLights() {
		this.lights = [];
		this.directionalLightsById = new Map();
		this.rectAreaLightsById = new Map();
		const { ambient, directionals, rectAreas = [] } = portfolioHubLights;

		this.ambientLight = new THREE.AmbientLight(ambient.color, ambient.intensity);
		this.threeScene.add(this.ambientLight);

		for (const def of directionals) {
			this._addDirectionalLight(def);
		}

		for (const def of rectAreas) {
			this._addRectAreaLight(def);
		}
	}

	_addDirectionalLight(def) {
		if (this.directionalLightsById.has(def.id)) {
			return this.directionalLightsById.get(def.id);
		}

		const light = new THREE.DirectionalLight(def.color, def.intensity);
		light.position.set(def.position[0], def.position[1], def.position[2]);
		light.target.position.set(0, 0, 0);
		this.threeScene.add(light);
		this.threeScene.add(light.target);
		this.directionalLightsById.set(def.id, light);
		this.lights.push(light);

		return light;
	}

	_addRectAreaLight(def) {
		if (this.rectAreaLightsById.has(def.id)) {
			return this.rectAreaLightsById.get(def.id);
		}

		const light = new THREE.RectAreaLight(def.color, def.intensity, def.width ?? 1, def.height ?? 1);
		this._applyRectAreaLightDef(light, def);
		this.threeScene.add(light);
		this.rectAreaLightsById.set(def.id, light);
		this.lights.push(light);

		return light;
	}

	_applyRectAreaLightDef(light, def) {
		light.color.set(def.color);
		light.intensity = def.intensity;
		light.width = def.width ?? 1;
		light.height = def.height ?? 1;
		light.position.set(def.position[0], def.position[1], def.position[2]);
		const rotation = def.rotation ?? [0, 0, 0];
		light.rotation.set(THREE.MathUtils.degToRad(rotation[0]), THREE.MathUtils.degToRad(rotation[1]), THREE.MathUtils.degToRad(rotation[2]));
	}

	/** Dev-панель (D): применить portfolioHubLights к сцене. */
	applyLightsFromDev() {
		const { ambient, directionals, rectAreas = [] } = portfolioHubLights;

		this.ambientLight.color.set(ambient.color);
		this.ambientLight.intensity = ambient.intensity;

		for (const def of directionals) {
			let light = this.directionalLightsById.get(def.id);
			if (!light) {
				light = this._addDirectionalLight(def);
			}

			light.color.set(def.color);
			light.intensity = def.intensity;
			light.position.set(def.position[0], def.position[1], def.position[2]);
		}

		for (const def of rectAreas) {
			let light = this.rectAreaLightsById.get(def.id);
			if (!light) {
				light = this._addRectAreaLight(def);
			} else {
				this._applyRectAreaLightDef(light, def);
			}
		}

		if (this._lightHelpersVisible) {
			this._syncLightHelpers();
		}
	}

	setDevLightHelpersVisible(visible) {
		this._lightHelpersVisible = visible === true;
		this._syncLightHelpers();
	}

	_syncLightHelpers() {
		while (this.lightHelpersGroup.children.length > 0) {
			const child = this.lightHelpersGroup.children[0];
			this.lightHelpersGroup.remove(child);
			disposeObject3D(child);
		}

		if (!this._lightHelpersVisible) {
			return;
		}

		for (const light of this.directionalLightsById.values()) {
			this.lightHelpersGroup.add(createDirectionalDevHelper(light));
		}

		for (const light of this.rectAreaLightsById.values()) {
			this.lightHelpersGroup.add(new RectAreaLightHelper(light));
		}
	}

	_updateDevLightHelpers() {
		if (!this._lightHelpersVisible) {
			return;
		}

		for (const helper of this.lightHelpersGroup.children) {
			if (helper.userData.devLightKind === "directional") {
				updateDirectionalDevHelper(helper, helper.userData.devLight);
				continue;
			}

			helper.update?.();
		}
	}

	_removeRectAreaLight(id) {
		const light = this.rectAreaLightsById.get(id);
		if (!light) {
			return;
		}

		this.threeScene.remove(light);
		this.rectAreaLightsById.delete(id);
		this.lights = this.lights.filter((entry) => entry !== light);
	}

	_removeDirectionalLight(id) {
		const light = this.directionalLightsById.get(id);
		if (!light) {
			return;
		}

		this.threeScene.remove(light);
		this.threeScene.remove(light.target);
		this.directionalLightsById.delete(id);
		this.lights = this.lights.filter((entry) => entry !== light);
	}

	_buildPlateGeometry(cfg) {
		return new RoundedBoxGeometry(cfg.plateSize, cfg.plateSize, cfg.depth, cfg.cornerSegments, cfg.cornerRadius);
	}

	_buildProjectIndexLookup() {
		const lookup = new Map();
		for (let index = 0; index < projectsData.length; index += 1) {
			const layout = getProjectPlateLayout(index);
			lookup.set(`${layout.rowIndex},${layout.plateIndex}`, index);
		}
		return lookup;
	}

	_buildPlates() {
		const cfg = portfolioHubPlatesConfig;
		const layouts = buildPlateGridLayouts();
		const projectLookup = this._buildProjectIndexLookup();

		this.platesRenderer.build({
			cfg,
			layouts,
			projectLookup,
			buildGeometry: (c) => this._buildPlateGeometry(c),
			createProjectMaterial: () => this._createPlateMaterial(),
			createDecorMaterial: () => this._createDecorPlateMaterial(),
		});

		this.plates = this.platesRenderer.plates;
		this.sharedPlateMaterial = this.platesRenderer.getMaterial();
		this._plateByProjectIndex.clear();

		for (const plate of this.plates) {
			if (plate.projectIndex >= 0) {
				this._plateByProjectIndex.set(plate.projectIndex, plate);
			}
		}

		this._plateGeometryKey = `${cfg.plateSize}:${cfg.depth}`;
		this._applyGridTransformAtProgress(1);
		const labelsReady = this.plateProjectLabels.attachToPlates(this.plates, cfg);
		const detailsReady = this.plateDetailsButtons.attachToPlates(this.plates, cfg);
		const screenTitleReady = this.screenTitle.init(cfg).then(() => {
			this._syncScreenTitleVisibility();
		});

		return Promise.allSettled([
			this.centerPlateLogos.readyPromise,
			labelsReady,
			detailsReady,
			screenTitleReady,
		]);
	}

	_getScreenTitleVisibility() {
		if (portfolioHubPlatesConfig.hubScreenTitle?.enabled === false) {
			return 0;
		}

		// Список проектов — только на /portfolio; на кейсе HUD не рисуем и не кликаем.
		if (isPortfolioCasePath(this._routeDisplayedPage)) {
			return 0;
		}

		if (!isPortfolioHubPath(this._routeDisplayedPage)) {
			return 0;
		}

		if (!this._appStarted) {
			return 0;
		}

		if (!this.showHub || !this.root.visible) {
			return 0;
		}

		if (this._hubLifecycle === "dormant") {
			return 0;
		}

		// До старта enter-змейки HUD не поднимаем — иначе кадр со stale-текстурой «весь список».
		if (this.screenTitle?.isProjectsIntroExpectHidden?.()) {
			return 0;
		}

		if (this._gridExitActive) {
			return this._getGridExitVisibility(this._gridExitProgress);
		}

		return 1;
	}

	_syncScreenTitleVisibility() {
		const visibility = this._getScreenTitleVisibility();
		if (this._lastHudTitleVisibility === visibility) {
			return;
		}
		this._lastHudTitleVisibility = visibility;
		this.screenTitle?.setVisibility(visibility);
	}

	_hideRoot() {
		this._resetPlateElementHover();
		this.root.visible = false;
		this.root.scale.set(1, 1, 1);
		this.enterActive = false;
	}

	/** Показ hub: сразу scale 1, appear — только gridOffset/gridRotation. */
	_wakeHub() {
		this._gridExitActive = false;
		this._gridExitProgress = 0;
		this._gridExitFromOffset = null;
		this._gridExitFromRotation = null;
		this._logoExitSnapshot = null;
		this._hubAnim = createHubAnimState();
		this._logoRevealAlpha = 0;
		this._cursorTiltRotX = 0;
		this._cursorTiltRotY = 0;
		this._resetPlateElementHover();
		this._startGridEnterAnimation();
		this.centerPlateLogos?.updatePlate?.(null);
		this.centerPlateLogos?.setRevealAlpha?.(0, { entering: false });
		this.plateProjectLabels?.setFocusReveal?.(-1, 0, { entering: false });
		this.plateDetailsButtons?.setFocusReveal?.(-1, 0, { entering: false });
		this.enterActive = true;
		this.root.visible = true;
		this.root.scale.set(1, 1, 1);
	}

	_startGridExitAnimation() {
		// От текущего кадра — без сброса platesGroup / плит / root.
		// Exit-glitch списка — только по carousel reset, не по смене роута.
		this._clearHubEnterDelayTimer();

		this._gridExitFromOffset = [this.root.position.x, this.root.position.y, this.root.position.z];
		this._gridExitFromRotation = [
			THREE.MathUtils.radToDeg(this.root.rotation.x),
			THREE.MathUtils.radToDeg(this.root.rotation.y),
			THREE.MathUtils.radToDeg(this.root.rotation.z),
		];

		this._gridExitActive = true;
		this._gridExitProgress = 0;
		this._gridExitStartedAt = performance.now() / 1000;
		this._gridEnterProgress = 1;
		this._logoExitSnapshot = { ...this._lastVisibleLogo };
		this.enterActive = false;
		this.root.visible = true;
	}

	_finishGridExit() {
		this._gridExitActive = false;
		this._gridExitProgress = 1;
		this._gridExitFromOffset = null;
		this._gridExitFromRotation = null;
		this._logoExitSnapshot = null;
	}

	/** Повторный заход на hub во время grid exit — сброс exit без dormant. */
	_cancelGridExitForReenter() {
		if (!this._gridExitActive && this._hubLifecycle !== "exiting") {
			return;
		}

		// Сначала спрятать canvas и HUD — иначе кадр с буквами при opacity > 0.
		this.screenTitle?.stashProjectsHiddenForDormant?.();
		this._lastHudTitleVisibility = 0;
		this.screenTitle?.setVisibility(0);

		this._gridExitActive = false;
		this._gridExitProgress = 0;
		this._gridExitFromOffset = null;
		this._gridExitFromRotation = null;
		this._logoExitSnapshot = null;
		this._hubLifecycle = "dormant";
	}

	_getGridExitVisibility(progress) {
		const exit = portfolioHubPlatesConfig.gridExit;
		const toOpacity = exit?.toOpacity ?? 0;
		const t = easeInOutCubic(clamp01(progress));
		return 1 + (toOpacity - 1) * t;
	}

	/** Fade-out логотипа синхронно с gridExit (0.5 с). */
	_updateGridExitLogos(progress) {
		const snap = this._logoExitSnapshot;
		const fromAlpha = snap?.alpha ?? 0;
		const logoAlpha = fromAlpha * this._getGridExitVisibility(progress);

		if (logoAlpha > 0.001 && snap?.projectIndex >= 0) {
			this._syncFocusPlateLogos(snap.projectIndex, logoAlpha, {
				partLinear: snap.partLinear,
				entering: false,
			});
		} else {
			this._syncFocusPlateLogos(-1, 0, { entering: false });
		}

		this._logoRevealAlpha = logoAlpha;
	}

	_updateGridExitAnimation(nowSeconds) {
		if (!this._gridExitActive) {
			return;
		}

		const durationMs = portfolioHubPlatesConfig.gridExit?.durationMs ?? 500;
		const duration = Math.max(durationMs / 1000, 0.001);
		const linear = clamp01((nowSeconds - this._gridExitStartedAt) / duration);
		this._gridExitProgress = linear;
		this._applyGridExitTransform(linear);
		this._applyPlateOpacity(this._getGridExitVisibility(linear));
		this._updateGridExitLogos(linear);

		if (linear >= 1) {
			this._finishGridExit();
		}
	}

	_startGridEnterAnimation() {
		this._gridEnterProgress = 0;
		this._gridEnterStartedAt = performance.now() / 1000;
		this._applyGridTransformAtProgress(0);
		this.platesRenderer.resetProjectPlatePositions();
		this._applyPlateOpacity(0);
	}

	/** Плиты в сцене, но invisible — для постоянного dual-render без пересоздания. */
	_ensureDormantState() {
		resetPortfolioHubBackgroundFocus(appStore);
		this.screenTitle?.stashProjectsHiddenForDormant?.();
		this._clearHubEnterDelayTimer();
		this._gridExitActive = false;
		this._gridExitProgress = 0;
		this._hubLifecycle = "dormant";
		this.showHub = true;
		this.enterActive = true;
		this.root.visible = true;
		this._gridEnterProgress = 0;
		this._logoRevealAlpha = 0;
		this._cursorTiltRotX = 0;
		this._cursorTiltRotY = 0;
		this._resetPlateElementHover();
		this._applyGridTransformAtProgress(0);
		this.platesRenderer.resetProjectPlatePositions();
		this._applyPlateOpacity(0);
		this.centerPlateLogos?.updatePlate?.(null);
		this.centerPlateLogos?.setRevealAlpha?.(0, { entering: false });
		this.plateProjectLabels?.setFocusReveal?.(-1, 0, { entering: false });
		this.plateDetailsButtons?.setFocusReveal?.(-1, 0, { entering: false });
		this._syncScreenTitleVisibility();
		this._carouselEnterPending = true;
	}

	/** Хаб как source в mix (уход с /portfolio): плиты и курсор активны, список проектов — нет. */
	_restoreActiveHubForMixOut() {
		this._gridExitActive = false;
		this._gridExitProgress = 0;
		this._hubLifecycle = "active";
		this.showHub = true;
		this.enterActive = true;
		this.root.visible = true;
		this._gridEnterProgress = 1;
		this._applyGridTransformAtProgress(1);
		this._applyPlateOpacity(1);
		this._syncScreenTitleVisibility();
	}

	/**
	 * Reset — dormant: плиты в enter-позе, HUD спрятан.
	 * next-reset только при progress≈0; на активном /portfolio не трогаем список.
	 */
	resetCarouselState(ctx = {}) {
		const { reason, carouselProgress } = ctx;

		if (reason === "became-next-at-rest" || reason === "hex-target-at-rest") {
			if (Number.isFinite(carouselProgress) && !isCarouselProgressAtSegmentStart(carouselProgress)) {
				return;
			}

			if (isPortfolioHubPath(this._routeDisplayedPage) && (this._hubLifecycle === "active" || this._hubLifecycle === "entering")) {
				return;
			}
		}

		// returned-to-rest-as-next / became-previous — всегда сбрасываем (уже ушли с hub).
		this._ensureDormantState();
	}

	/** Уходящий hub в hex-mix: сетка видима для scroll-out. */
	prepareCarouselMixSource() {
		if (this._hubLifecycle === "dormant") {
			this._restoreActiveHubForMixOut();
		}
	}

	/** Анимация появления — только после carousel reset (dormant). */
	playEnterAnimation() {
		if (this._gridExitActive || this._hubLifecycle === "exiting") {
			this._cancelGridExitForReenter();
		}

		const gridEnterInProgress = this._hubLifecycle === "entering" && this._gridEnterProgress < 1;
		if (gridEnterInProgress) {
			this.screenTitle?.stashProjectsHiddenForDormant?.();
			this._lastHudTitleVisibility = 0;
			this.screenTitle?.setVisibility(0);
			this.screenTitle?.requestProjectsIntro?.();
			return;
		}

		if (!this._carouselEnterPending) {
			return;
		}

		if (this._hubEnterDelayTimer) {
			return;
		}

		const loaderDelayMs = this._appStarted ? getLoaderCurtainRemainingMs(appStore.appStartedAt) : 0;
		if (loaderDelayMs > 0) {
			this._hubEnterDelayTimer = setTimeout(() => {
				this._hubEnterDelayTimer = 0;
				this._playEnterAnimationImmediate();
			}, loaderDelayMs);
			return;
		}

		this._playEnterAnimationImmediate();
	}

	/** Сетка сразу; фокус первой плиты сразу; список — чуть позже. */
	_playEnterAnimationImmediate() {
		if (!this._carouselEnterPending) {
			return;
		}

		this._carouselEnterPending = false;
		this._cancelGridExitForReenter();
		this.screenTitle?.stashProjectsHiddenForDormant?.();
		this._lastHudTitleVisibility = 0;
		this.screenTitle?.setVisibility(0);
		this._hubLifecycle = "entering";
		this._wakeHub();
		// Plate slide + logo/label reveal — сразу, не ждать змейку списка.
		commitPortfolioHubFocusIndex(appStore, 0);

		this._clearProjectsIntroDelayTimer();
		const listDelayMs = Math.max(0, portfolioHubPlatesConfig.gridEnter?.listIntroDelayMs ?? 0);
		if (listDelayMs > 0) {
			this._projectsIntroDelayTimer = setTimeout(() => {
				this._projectsIntroDelayTimer = 0;
				this.screenTitle?.requestProjectsIntro?.();
			}, listDelayMs);
		} else {
			this.screenTitle?.requestProjectsIntro?.();
		}
	}

	_clearHubEnterDelayTimer() {
		if (this._hubEnterDelayTimer) {
			clearTimeout(this._hubEnterDelayTimer);
			this._hubEnterDelayTimer = 0;
		}
		this._clearProjectsIntroDelayTimer();
	}

	_clearProjectsIntroDelayTimer() {
		if (this._projectsIntroDelayTimer) {
			clearTimeout(this._projectsIntroDelayTimer);
			this._projectsIntroDelayTimer = 0;
		}
	}

	/** @deprecated — используй playEnterAnimation */
	commitScrollTransitionEnter() {
		this.playEnterAnimation();
	}

	_getGridEnterVisibility(progress) {
		const enter = portfolioHubPlatesConfig.gridEnter;
		const fromOpacity = enter?.fromOpacity ?? 0;
		const t = easeInOutCubic(clamp01(progress));
		return fromOpacity + (1 - fromOpacity) * t;
	}

	_updateGridEnterAnimation(nowSeconds) {
		if (this._gridEnterProgress >= 1) {
			return;
		}

		const durationMs = portfolioHubPlatesConfig.gridEnter?.durationMs ?? 2000;
		const duration = Math.max(durationMs / 1000, 0.001);
		const linear = clamp01((nowSeconds - this._gridEnterStartedAt) / duration);
		this._gridEnterProgress = linear;
		this._applyGridTransformAtProgress(linear);
		this._applyPlateOpacity(this._getGridEnterVisibility(linear));
		this._syncScreenTitleVisibility();

		if (linear >= 1) {
			this._gridEnterProgress = 1;
			this._hubLifecycle = "active";
		}
	}

	setRouteState({ currentPage, teleportPage, routePhase, appStarted = false, suppressSceneEnter = false }) {
		this._routeDisplayedPage = currentPage ?? "/";
		this._routeTeleportPage = teleportPage ?? "/";
		this._routePhase = routePhase ?? "idle";
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

		const hubDisplayed = isPortfolioHubPath(currentPage);
		const hubTarget = isPortfolioHubPath(teleportPage);
		const onCasePage = isPortfolioCasePath(currentPage);

		// На странице кейса хаб dormant — иначе невидимый HUD-список остаётся кликабельным.
		if (onCasePage) {
			this._pendingHubEnter = false;
			if (routePhase === "idle" && this._hubLifecycle !== "dormant") {
				this._ensureDormantState();
			} else {
				this._syncScreenTitleVisibility();
			}
			if (this._gridExitActive) {
				this._finishGridExit();
			}
			return;
		}

		// A newer click is already taking us away. Preserve the exact dormant or
		// partially visible hub frame produced by the completed hex; do not wake
		// plates or the projects HUD for this intermediate route.
		if (suppressSceneEnter && hubDisplayed) {
			this._pendingHubEnter = false;
			this._syncScreenTitleVisibility();
			return;
		}

		// Ушли с /portfolio — reset только из карусели, не из роута.
		if (!hubDisplayed && routePhase === "idle" && !hubTarget) {
			this._pendingHubEnter = false;
			if (this._gridExitActive) {
				this._finishGridExit();
			}
			return;
		}

		// Карусель вернулась на hub во время exit — не ждать idle.
		const abortingHubExit = hubDisplayed && hubTarget && (this._gridExitActive || this._hubLifecycle === "exiting");
		if (abortingHubExit) {
			this._cancelGridExitForReenter();
		}

		const exitInProgress = this._gridExitActive;
		const hubVisibleOnRoute = hubDisplayed || (hubTarget && routePhase !== "exiting") || exitInProgress;
		const shouldPlayEnter = shouldActivateRoutePage(hubDisplayed, routePhase) || (hubTarget && routePhase === "entering");

		if (!hubVisibleOnRoute) {
			this._pendingHubEnter = false;
			return;
		}

		this.showHub = true;
		this.root.visible = true;

		const wantsHubEnter = shouldPlayEnter && hubDisplayed && hubTarget && routePhase !== "exiting";
		if (!wantsHubEnter) {
			return;
		}

		if (appStarted) {
			this._pendingHubEnter = false;
			this.playEnterAnimation();
		} else {
			this._pendingHubEnter = true;
			this._syncScreenTitleVisibility();
		}
	}

	shouldRender() {
		if (!this.showHub || !this.root.visible) {
			return false;
		}

		// Dormant hub как target в паре mix — пустой RT (hex при progress=0 всё равно берёт A).
		if (this._hubLifecycle === "dormant") {
			const { sourceId, targetId } = getSceneCarousel().getMixSourceTargetIds();
			if (targetId === "portfolioHub" && sourceId !== "portfolioHub") {
				return false;
			}
		}

		return true;
	}

	/** Хаб всегда в dual-render паре с главной. */
	shouldKeepUpdating() {
		return this.showHub;
	}

	getScene() {
		return this.threeScene;
	}

	applyCamera(camera, frame) {
		this.applyScrollCamera(camera, frame);
	}

	/** Анимация скролла — камера при role current|next (sceneProgress). */
	applyScrollCamera(camera, frame) {
		const cam = portfolioHubPlatesConfig.camera;
		const sceneProgress = frame?.sceneProgress ?? 0;
		const baseZ = this._devCameraZ ?? cam.position[2];

		applySceneProgressToCamera(
			camera,
			{
				position: [cam.position[0], cam.position[1], baseZ],
				lookAt: cam.lookAt,
				fov: cam.fov,
				scrollZ: 5,
			},
			sceneProgress,
		);

		// Камера общая у всех сцен карусели — HUD синхронизируем здесь, перед render слоя hub.
		this.screenTitle?.syncRootToCamera?.(camera);
	}

	getDevCameraZ() {
		return this._devCameraZ ?? portfolioHubPlatesConfig.camera.position[2];
	}

	setDevCameraZ(z) {
		this._devCameraZ = z;
	}

	resetDevCamera() {
		this._devCameraZ = null;
	}

	/** Dev / конфиг: HUD-подпись на проектных плитах. */
	applyPlateLabelFromConfig(options = {}) {
		this.plateProjectLabels.applyFromConfig(portfolioHubPlatesConfig);
		void this.plateDetailsButtons.applyFromConfig(portfolioHubPlatesConfig);
		const focusIndex = appStore.portfolioHubFocusIndex ?? -1;
		const labelReveal = this._devPlateLabelRevealOverride;
		const alpha = labelReveal?.alpha ?? this._logoRevealAlpha ?? 0;
		const revealState = labelReveal?.state ?? {
			partLinear: this._lastVisibleLogo?.partLinear ?? 0,
			entering: this._lastVisibleLogo?.entering ?? false,
		};

		this.plateProjectLabels.setFocusReveal(focusIndex, alpha, revealState);
		this.plateDetailsButtons.setFocusReveal(focusIndex, alpha, revealState);

		if (options.replayReveal) {
			this.replayPlateLabelReveal();
		}
	}

	/** Dev-панель (D): пересобрать canvas-заголовок хаба без appear-анимации. */
	applyScreenTitleFromConfig() {
		void this.screenTitle.applyFromConfig(portfolioHubPlatesConfig, { glitchIntro: false }).then(() => {
			this._syncScreenTitleVisibility();
		});
	}

	/** Dev-панель: glow / opacity без пересборки. */
	applyScreenTitleLiveDefaults(partial = {}) {
		this.screenTitle?.patchProjectsLayerDefaults?.(partial);
	}

	/** Dev-панель: превью glow на второстепенных буквах. */
	previewScreenTitleGlow(layerIndex) {
		this.screenTitle?.previewGlowOnFocusedLayer?.(layerIndex);
	}

	/** Dev-панель: цвет и сила свечения змейки списка проектов. */
	applyProjectsSnakeGlowConfig(cfg) {
		this.screenTitle?.applyProjectsSnakeGlowConfig?.(cfg);
	}

	/** Dev-панель: live-tune кнопки «Смотреть кейс» на плите. */
	applyDetailsButtonLive(cfg = portfolioHubPlatesConfig) {
		this.plateDetailsButtons?.applyDetailsButtonLive?.(cfg);
	}

	clearScreenTitleGlowPreview() {
		this.screenTitle?.clearGlowPreview?.();
	}

	/** Dev-панель: HUD X/Y/Z, Col offset, gap, opacity. */
	applyScreenTitleLiveLayout() {
		this.screenTitle?.refreshLayoutFromConfig?.(portfolioHubPlatesConfig);
		this._syncScreenTitleVisibility();
	}

	_createPlateMaterial(m = portfolioHubPlatesConfig.material, role = "project") {
		const typeKey = role === "decor" ? (m.decorType ?? m.type) : m.type;
		const type = typeKey === "basic" || typeKey === "standard" || typeKey === "physical"
			? typeKey
			: "standard";
		const color = new THREE.Color(m.color);
		const opacity = m.opacity ?? 1;
		const roughness = m.roughness ?? 0.07;
		const metalness = m.metalness ?? 0;
		const transmission = m.transmission ?? 0;
		// Transparent plates must not write depth — logos/labels sit on the surface and z-fight otherwise.
		const depthWrite = false;

		if (type === "basic") {
			return new THREE.MeshBasicMaterial({
				color,
				transparent: true,
				opacity,
				fog: true,
				depthWrite,
			});
		}

		if (type === "standard") {
			return new THREE.MeshStandardMaterial({
				color,
				transparent: true,
				opacity,
				roughness,
				metalness,
				fog: true,
				depthWrite,
			});
		}

		return new THREE.MeshPhysicalMaterial({
			color,
			transparent: true,
			opacity,
			transmission,
			roughness,
			metalness,
			thickness: m.thickness ?? 0,
			clearcoat: m.clearcoat ?? 0,
			clearcoatRoughness: m.clearcoatRoughness ?? 0.15,
			ior: 1.45,
			fog: true,
			depthWrite,
		});
	}

	/** Декоративные плиты (InstancedMesh) — могут быть lighter (decorType). */
	_createDecorPlateMaterial(m = portfolioHubPlatesConfig.material) {
		return this._createPlateMaterial(m, "decor");
	}

	/** Единый материал всех плит × множитель appear/exit (0…1). */
	_applyPlateOpacity(visibilityMultiplier = 1) {
		const visibility = clamp01(visibilityMultiplier);
		if (Math.abs(visibility - this._lastPlateVisibilityMul) < 0.0005) {
			return;
		}
		this._lastPlateVisibilityMul = visibility;
		const baseOpacity = portfolioHubPlatesConfig.material.opacity;
		this.platesRenderer.setMaterialOpacity(baseOpacity * visibility);
		this.sharedPlateMaterial = this.platesRenderer.getMaterial();
	}

	/** THREE.Fog — дальние плиты растворяются в цвете тумана. */
	applyFogFromConfig() {
		const fog = portfolioHubPlatesConfig.fog;
		if (!fog?.enabled) {
			this.threeScene.fog = null;
			return;
		}

		if (this.threeScene.fog instanceof THREE.Fog) {
			this.threeScene.fog.color.set(fog.color);
			this.threeScene.fog.near = fog.near;
			this.threeScene.fog.far = fog.far;
			return;
		}

		const color = new THREE.Color(fog.color);
		this.threeScene.fog = new THREE.Fog(color, fog.near, fog.far);
	}

	_getPlateByProjectIndex(projectIndex) {
		if (projectIndex < 0) {
			return null;
		}
		return this._plateByProjectIndex.get(projectIndex) ?? null;
	}

	_rebuildPlateByProjectIndex() {
		this._plateByProjectIndex.clear();
		for (const plate of this.plates) {
			if (plate.projectIndex >= 0) {
				this._plateByProjectIndex.set(plate.projectIndex, plate);
			}
		}
	}

	_resetPlateElementHover() {
		this._plateHovered = false;
		this._lastPlateHoverPointerX = Number.NaN;
		this._lastPlateHoverPointerY = Number.NaN;
		this._lastPlateHoverFocusIndex = -2;
		this._lastPlateHoverCanHover = false;
		this._plateHoverNeedsRaycast = true;
		this.centerPlateLogos.setLogoHover(false);
		this.plateDetailsButtons.setDetailsHover(false);
		appStore.cursor.caseHovered = false;
	}

	_getFocusedPlateHoverTarget(focusIndex) {
		const plate = this._getPlateByProjectIndex(focusIndex);
		return plate?.mesh ?? null;
	}

	_raycastPlateHover(frame, focusIndex) {
		const target = this._getFocusedPlateHoverTarget(focusIndex);
		if (!target) {
			this._plateHovered = false;
			this._plateHoverNeedsRaycast = true;
			return;
		}

		this.applyCamera(frame.camera);
		this._plateHoverPointer.set(frame.pointer.x, frame.pointer.y);
		this._plateHoverRaycaster.setFromCamera(this._plateHoverPointer, frame.camera);

		const hits = this._plateHoverRaycaster.intersectObject(target, false);
		this._plateHovered = hits.length > 0;
	}

	/** Hit-test активной плитки: один Raycaster по одному mesh, recursive=false. */
	_updatePlateElementHover(delta, frame) {
		const hoverCfg = portfolioHubPlatesConfig.interaction?.hoverMotion;
		const focusIndex = appStore.portfolioHubFocusIndex ?? -1;
		const minReveal = hoverCfg?.minRevealAlpha ?? 0.55;
		const canHover = focusIndex >= 0 && this._logoRevealAlpha >= minReveal && this._gridEnterProgress >= 1 && !this._gridExitActive;

		if (!canHover || !frame?.camera || !frame?.pointer) {
			this._plateHovered = false;
			this._lastPlateHoverCanHover = canHover;
			this._plateHoverNeedsRaycast = true;
			this.centerPlateLogos.setLogoHover(false);
			this.centerPlateLogos.updateHover(delta);
			this.plateDetailsButtons.setDetailsHover(false);
			this.plateDetailsButtons.updateHover(delta);
			appStore.cursor.caseHovered = false;
			return;
		}

		const pointerChanged = frame.pointer.x !== this._lastPlateHoverPointerX || frame.pointer.y !== this._lastPlateHoverPointerY;
		const focusChanged = focusIndex !== this._lastPlateHoverFocusIndex;
		const canHoverChanged = canHover !== this._lastPlateHoverCanHover;

		if (pointerChanged || focusChanged || canHoverChanged || this._plateHoverNeedsRaycast) {
			this._raycastPlateHover(frame, focusIndex);
			this._lastPlateHoverPointerX = frame.pointer.x;
			this._lastPlateHoverPointerY = frame.pointer.y;
			this._lastPlateHoverFocusIndex = focusIndex;
			this._lastPlateHoverCanHover = canHover;
			this._plateHoverNeedsRaycast = false;
		}

		this.centerPlateLogos.setLogoHover(false);
		this.centerPlateLogos.updateHover(delta);
		this.plateDetailsButtons.setDetailsHover(this._plateHovered);
		this.plateDetailsButtons.updateHover(delta);
		appStore.cursor.caseHovered = this._plateHovered;
	}

	setPointerState({ pointerDown, pointerBlocked = false }) {
		if (pointerBlocked) {
			this._pointerDown = false;
			this._pointerClickPending = false;
			this._plateHovered = false;
			this._plateHoverNeedsRaycast = true;
			this.screenTitle.clearProjectsPointerHit?.();
			appStore.cursor.caseHovered = false;
			return;
		}
		if (this._pointerDown && !pointerDown) {
			this._pointerClickPending = true;
		}
		this._pointerDown = pointerDown;
	}

	/** Клик по активной плитке → страница кейса. */
	_tryOpenFocusedPlateOnClick(frame) {
		if (!this.showHub || !frame?.camera || !frame?.pointer) {
			return;
		}

		const focusIndex = appStore.portfolioHubFocusIndex ?? -1;
		if (focusIndex < 0) {
			return;
		}

		const hoverCfg = portfolioHubPlatesConfig.interaction?.hoverMotion;
		const minReveal = hoverCfg?.minRevealAlpha ?? 0.55;
		if (this._logoRevealAlpha < minReveal || this._gridEnterProgress < 1 || this._gridExitActive) {
			return;
		}

		this._raycastPlateHover(frame, focusIndex);
		if (!this._plateHovered) {
			return;
		}

		const project = projectsData[focusIndex];
		if (!project?.path) {
			return;
		}

		requestPortfolioCaseNavigation(project.path);
	}

	/** pointer.y → rotX, pointer.x → rotY; сглаживание поверх gridRotation. @returns {boolean} changed */
	_updateCursorGridTilt(delta, pointer) {
		const cfg = portfolioHubPlatesConfig.interaction?.cursorGridTilt;
		const canTilt = cfg && this.showHub && this.root.visible && this._gridEnterProgress >= 1 && !this._gridExitActive;

		const targetX = canTilt ? pointer.y * cfg.rotXRange : 0;
		const targetY = canTilt ? pointer.x * cfg.rotYRange : 0;
		const smooth = Math.max(cfg?.smoothDuration ?? 0.22, 0.001);
		const t = 1 - Math.exp(-delta / smooth);

		const prevX = this._cursorTiltRotX;
		const prevY = this._cursorTiltRotY;
		this._cursorTiltRotX += (targetX - this._cursorTiltRotX) * t;
		this._cursorTiltRotY += (targetY - this._cursorTiltRotY) * t;

		if (!canTilt || (Math.abs(this._cursorTiltRotX) < 0.0001 && Math.abs(this._cursorTiltRotY) < 0.0001
			&& Math.abs(targetX) < 0.0001 && Math.abs(targetY) < 0.0001)) {
			this._cursorTiltRotX = 0;
			this._cursorTiltRotY = 0;
		}

		return Math.abs(this._cursorTiltRotX - prevX) > 0.00005 || Math.abs(this._cursorTiltRotY - prevY) > 0.00005;
	}

	_setRootTransform(offset, rotationDeg, applyCursorTilt = false) {
		const tiltX = applyCursorTilt ? this._cursorTiltRotX : 0;
		const tiltY = applyCursorTilt ? this._cursorTiltRotY : 0;

		this.root.position.set(offset[0], offset[1], offset[2]);
		this.root.rotation.set(THREE.MathUtils.degToRad(rotationDeg[0] + tiltX), THREE.MathUtils.degToRad(rotationDeg[1] + tiltY), THREE.MathUtils.degToRad(rotationDeg[2]));
	}

	_applyGridExitTransform(progress) {
		const cfg = portfolioHubPlatesConfig;
		const exit = cfg.gridExit;
		if (!exit) {
			return;
		}

		const fromOffset = this._gridExitFromOffset ?? cfg.gridOffset;
		const fromRotation = this._gridExitFromRotation ?? cfg.gridRotation;

		const { offset, rotation } = lerpGridTransform(progress, fromOffset, fromRotation, exit.toOffset, exit.toRotation);

		this._setRootTransform(offset, rotation, false);
	}

	_applyGridTransformAtProgress(progress) {
		const cfg = portfolioHubPlatesConfig;
		const enter = cfg.gridEnter;
		const applyCursorTilt = progress >= 1;

		if (!enter || progress >= 1) {
			const [x, y, z] = cfg.gridOffset;
			this._setRootTransform([x, y, z], cfg.gridRotation, applyCursorTilt);
			return;
		}

		const { offset, rotation } = lerpGridTransform(progress, enter.fromOffset, enter.fromRotation, cfg.gridOffset, cfg.gridRotation);

		this._setRootTransform(offset, rotation, false);
	}

	_applyGridTransform() {
		if (this._gridExitActive) {
			this._applyGridExitTransform(this._gridExitProgress);
			return;
		}
		this._applyGridTransformAtProgress(this._gridEnterProgress >= 1 ? 1 : this._gridEnterProgress);
	}

	_syncFocusPlateLogos(focusIndex, logoAlpha = 0, revealState = {}) {
		const partLinear = revealState?.partLinear ?? 0;
		const entering = revealState?.entering ? 1 : 0;
		const sig = `${focusIndex}|${logoAlpha.toFixed(4)}|${partLinear.toFixed(4)}|${entering}`;
		if (sig === this._lastFocusLogoSig) {
			return;
		}
		this._lastFocusLogoSig = sig;

		if (focusIndex < 0) {
			this.centerPlateLogos.updatePlate(null);
			this.centerPlateLogos.setRevealAlpha(0, revealState);
			this.plateProjectLabels.setFocusReveal(-1, 0, revealState);
			this.plateDetailsButtons.setFocusReveal(-1, 0, revealState);
			return;
		}

		const plate = this._getPlateByProjectIndex(focusIndex);
		if (!plate) {
			this.centerPlateLogos.updatePlate(null);
			this.centerPlateLogos.setRevealAlpha(0, revealState);
			this.plateProjectLabels.setFocusReveal(-1, 0, revealState);
			this.plateDetailsButtons.setFocusReveal(-1, 0, revealState);
			return;
		}

		const platePayload = {
			mesh: plate.mesh,
			flatIndex: getProjectPlateFlatIndex(focusIndex),
			projectIndex: focusIndex,
		};

		this.centerPlateLogos.updatePlate(platePayload);
		this.centerPlateLogos.setRevealAlpha(logoAlpha, revealState);

		const labelReveal = this._devPlateLabelRevealOverride;
		const labelAlpha = labelReveal?.alpha ?? logoAlpha;
		const labelState = labelReveal?.state ? { ...revealState, ...labelReveal.state } : revealState;
		this.plateProjectLabels.setFocusReveal(focusIndex, labelAlpha, labelState);
		this.plateDetailsButtons.setFocusReveal(focusIndex, labelAlpha, labelState);
	}

	/** Dev: scrub reveal подписи (0…1), логотип не затрагивается. */
	setDevPlateLabelRevealPreview(alpha, entering = true) {
		const progress = Math.max(0, Math.min(1, alpha));
		this._devPlateLabelRevealOverride = {
			alpha: progress,
			state: {
				partLinear: progress,
				entering: entering && progress < 1,
			},
		};
		this.applyPlateLabelFromConfig();
	}

	clearDevPlateLabelRevealOverride() {
		if (this._devPlateLabelRevealRaf) {
			cancelAnimationFrame(this._devPlateLabelRevealRaf);
			this._devPlateLabelRevealRaf = 0;
		}
		this._devPlateLabelRevealOverride = null;
		this.applyPlateLabelFromConfig();
	}

	/** Dev: проиграть reveal подписи заново для превью параметров. */
	replayPlateLabelReveal() {
		const focusIndex = appStore.portfolioHubFocusIndex ?? -1;
		if (focusIndex < 0) {
			return false;
		}

		if (this._devPlateLabelRevealRaf) {
			cancelAnimationFrame(this._devPlateLabelRevealRaf);
			this._devPlateLabelRevealRaf = 0;
		}

		const durationMs = (portfolioHubPlatesConfig.interaction?.logoAppearDuration ?? 0.75) * 1000;
		const startedAt = performance.now();

		const tick = () => {
			const linear = Math.min(1, (performance.now() - startedAt) / Math.max(durationMs, 1));
			this.setDevPlateLabelRevealPreview(linear, true);
			if (linear < 1) {
				this._devPlateLabelRevealRaf = requestAnimationFrame(tick);
			} else {
				this._devPlateLabelRevealRaf = 0;
			}
		};

		this.setDevPlateLabelRevealPreview(0, true);
		this._devPlateLabelRevealRaf = requestAnimationFrame(tick);
		return true;
	}

	getPlateLabelRevealPreviewAlpha() {
		return this._devPlateLabelRevealOverride?.alpha ?? this._logoRevealAlpha ?? 0;
	}

	_updateMenuInteraction() {
		const timing = portfolioHubPlatesConfig.interaction;
		const slideX = timing.plateSlideX;
		const now = performance.now() / 1000;
		const storeTarget = appStore.portfolioHubFocusIndex ?? -1;
		const enterPlateGate = timing.gridEnterStartPlateFraction ?? timing.gridStartPlateFraction ?? 0.4;
		const logosAllowed = !this._gridExitActive && (this._gridEnterProgress >= 1 || this._gridEnterProgress >= enterPlateGate);

		const visuals = advanceHubMenuAnim(this._hubAnim, storeTarget, now, timing, gridSlideForTarget, logosAllowed);

		const { gridY, gridZ, logoProjectIndex, logoProgress, logoPartLinear, logoEntering, logoRevealJustStarted, logoRevealJustPaused, plateMovementJustStarted } = visuals;

		if (logosAllowed && plateMovementJustStarted) {
			playHubCardMovementSound(timing.plateSlideDuration * 1000);
		}

		if (logoRevealJustStarted) {
			playSound("logo_reveal");
		}
		if (logoRevealJustPaused) {
			fadeOutSound("logo_reveal");
		}

		this.platesGroup.position.y = gridY;
		this.platesGroup.position.z = gridZ;
		this._lastMenuGridY = gridY;
		this._lastMenuGridZ = gridZ;

		this.platesRenderer.setProjectPlatePositions((projectIndex) => getPlateProgressForProject(visuals, projectIndex), slideX);

		if (logosAllowed && logoProjectIndex >= 0) {
			this._syncFocusPlateLogos(logoProjectIndex, logoProgress, {
				partLinear: logoPartLinear,
				entering: logoEntering,
			});
		} else {
			this._syncFocusPlateLogos(-1, 0, { entering: false });
		}

		if (logosAllowed && logoProjectIndex >= 0 && logoProgress > 0.001) {
			this._lastVisibleLogo = {
				projectIndex: logoProjectIndex,
				alpha: logoProgress,
				partLinear: logoPartLinear,
				entering: logoEntering,
			};
		}

		this._logoRevealAlpha = logosAllowed ? logoProgress : 0;
	}

	/** Целевой множитель bloom: mix → grid enter, без привязки к logo. */
	_getHubBloomRevealTarget() {
		if (!this._appStarted || !this.showHub) {
			return 0;
		}

		const mixProgress = getHexShaderProgress();
		if (mixProgress > 0.0001) {
			const { targetId } = getSceneCarousel().getMixSourceTargetIds();
			if (targetId === "portfolioHub" && this._hubLifecycle === "dormant") {
				return clamp01(mixProgress);
			}
		}

		if (this._hubLifecycle === "dormant") {
			return 0;
		}

		if (this._gridExitActive) {
			return this._getGridExitVisibility(this._gridExitProgress);
		}

		if (this._gridEnterProgress < 1) {
			const plateVisibility = this._getGridEnterVisibility(this._gridEnterProgress);
			// Enter-каскад змейки стартует сразу; bloom плит ещё на 0 — не гасить HDR змейки.
			if (this.screenTitle?.isProjectsIntroGlitchActive?.()) {
				return 1;
			}
			return plateVisibility;
		}

		return 1;
	}

	_syncHubBloomReveal(delta) {
		let target = this._getHubBloomRevealTarget();

		// После mix bloom уже высокий — не сбрасываем в 0 на старте grid enter.
		if (this._hubLifecycle === "entering" && target < this._hubBloomRevealCurrent) {
			target = this._hubBloomRevealCurrent;
		}

		easing.damp(this, "_hubBloomRevealCurrent", target, 0.28, delta);
	}

	getModelsBloomLogoReveal() {
		return this._hubBloomRevealCurrent;
	}

	update(_delta, frame) {
		this._syncHubBloomReveal(_delta);

		// Dormant (hex-in): плиты невидимы — не крутим tilt/hover/enter-анимации.
		if (this._hubLifecycle === "dormant") {
			return;
		}

		if (this.showHub && this.root.visible) {
			if (frame?.camera) {
				this.applyCamera(frame.camera);
			}

			this._updateDevLightHelpers();

			const nowSeconds = performance.now() / 1000;
			const pointer = frame?.pointer ?? { x: 0, y: 0 };

			const tiltChanged = this._updateCursorGridTilt(_delta, pointer);
			this._updatePlateElementHover(_delta, frame);

			if (this._pointerClickPending) {
				this._pointerClickPending = false;
				const canPickProjectsList =
					isPortfolioHubPath(this._routeDisplayedPage) && (this._lastHudTitleVisibility ?? 0) > 0.001;
				if (!canPickProjectsList) {
					this.screenTitle.clearProjectsPointerHit?.();
				} else if (!this.screenTitle.tryOpenProjectOnClick()) {
					this._tryOpenFocusedPlateOnClick(frame);
				}
			}

			if (this._gridExitActive) {
				this._updateGridExitAnimation(nowSeconds);
			} else if (this._gridEnterProgress < 1) {
				this._updateGridEnterAnimation(nowSeconds);
				this._updateMenuInteraction();
			} else {
				// Enter done: skip per-frame opacity/transform spam; transform only when tilt moves.
				this._updateMenuInteraction();
				if (tiltChanged) {
					this._applyGridTransform();
				}
			}

			if (frame?.camera) {
				this.screenTitle.update(frame);
			}
			this._syncScreenTitleVisibility();
		}
	}

	dispose() {
		this._clearHubEnterDelayTimer();
		this._portfolioLocaleSwitch?.dispose();
		this._portfolioLocaleSwitch = null;
		this.centerPlateLogos.dispose();
		this.plateProjectLabels.dispose();
		this.plateDetailsButtons.dispose();
		this.screenTitle.dispose();
		this.platesRenderer.dispose();
		this.sharedPlateMaterial = null;
		this.plates = [];
		this._plateByProjectIndex.clear();
		this.threeScene.fog = null;
	}
}
