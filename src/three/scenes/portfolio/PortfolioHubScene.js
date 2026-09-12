import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { RectAreaLightHelper } from "three/examples/jsm/helpers/RectAreaLightHelper.js";
import { getPortfolioProjectByPath, isPortfolioHubPath, isPortfolioCasePath, projectsData } from "./hub/projectsData.js";
import { shouldActivateRoutePage } from "@/functions/shouldActivateRoutePage.js";
import {
	buildPlateGridLayouts,
	portfolioHubPlatesConfig,
	portfolioHubLights,
	getProjectPlateLayout,
	getProjectPlateFlatIndex,
	getGridFocusSlide,
} from "./hub/portfolioHubConfig.js";
import { store as appStore } from "@/app/store.jsx";
import { CenterPlateNipigasLogos } from "./hub/CenterPlateNipigasLogos.js";
import { HubPlatesRenderer } from "@/three/objects/plates/HubPlatesRenderer.js";
import { createPlateGeometry, createPlateMaterial, createPlateMaterials } from "@/three/objects/plates/createPlate.js";
import { HubPlateInnerPanels } from "./hub/HubPlateInnerPanels.js";
import { splitPlateMaterialGroups } from "@/three/objects/plates/splitPlateMaterialGroups.js";
import { HubPlateProjectLabels } from "./hub/hubPlateProjectLabel.js";
import { HubPlateDetailsButtons } from "./hub/hubPlateDetailsButton.js";
import { HubScreenTitle } from "./hub/hubScreenTitle.js";
import { createPortfolioHubLocaleSwitchController } from "./hub/portfolioHubLocaleSwitch.js";
import { advanceHubMenuAnim, createHubAnimState, getPlateProgressForProject, settleHubMenuAnimAtFocus } from "./hub/hubMenuAnimation.js";
import {
	applyHubCaseColumnProgress,
	advanceHubCaseSelection,
	beginHubCaseSelection,
	beginHubCaseReturn,
	createHubCaseSelectionState,
	prepositionHubCaseSelectionAtTarget,
	resetHubCaseSelection,
	retargetHubCaseSelection,
} from "./hub/hubCaseSelectionMotion.js";
import { lerpGridTransform } from "./hub/gridEnterAnimation.js";
import { clamp01, easeInOutCubic } from "./hub/hubMenuAnimation.js";
import { easing } from "maath";
import { fadeOutSound, playHubCardMovementSound, playSound } from "../../../sounds/soundDesign.js";
import { resetPortfolioHubBackgroundFocus, commitPortfolioHubFocusIndex } from "@/functions/portfolioHubBackground.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { getHexShaderProgress } from "../../render/overlay/hexShaderProgress.js";
import { shouldAnimateSiteLocaleForRingScene } from "@/functions/siteLocaleSwitch.js";
import { isCarouselProgressAtSegmentStart, isRingDormantReason } from "@/three/scenes/lifecycle/sceneLifecycle.js";
import { applySceneProgressToCamera } from "../utils/applySceneProgressToCamera.js";
import { getLoaderCurtainRemainingMs } from "@/app/config/loaderCurtain.js";
import { PortfolioFreeCameraController } from "./hub/PortfolioFreeCameraController.js";
import { commitPortfolioHubCaseRoute } from "@/functions/portfolioHubNavigate.js";
import {
	consumeHubPlateCaseOpenRequest,
	getHubPlateCaseState,
	resetHubPlateCaseColumnMotion,
	syncHubPlateCaseFromScene,
} from "@/pages/portfolio/hubPlateCase/hubPlateCaseStore.js";


/** В r155 DirectionalLightHelper убрали из examples — стрелка к target. */
function createDirectionalDevHelper(light) {
	const direction = new THREE.Vector3().subVectors(light.target.position, light.position);
	const length = Math.max(direction.length(), 2);
	direction.normalize();

	const helper = new THREE.Group();
	const sourceMarker = new THREE.Mesh(
		new THREE.SphereGeometry(0.18, 12, 8),
		new THREE.MeshBasicMaterial({ color: light.color, depthTest: false }),
	);
	sourceMarker.renderOrder = 1000;
	const arrow = new THREE.ArrowHelper(direction, new THREE.Vector3(), length, light.color.getHex(), length * 0.12, length * 0.06);
	arrow.traverse((node) => {
		if (node.material) {
			node.material.depthTest = false;
			node.material.depthWrite = false;
		}
	});
	sourceMarker.material.depthWrite = false;
	helper.position.copy(light.position);
	helper.add(sourceMarker, arrow);
	helper.userData.devLight = light;
	helper.userData.devLightKind = "directional";
	helper.userData.devLightArrow = arrow;
	helper.userData.devLightMarker = sourceMarker;
	return helper;
}

function updateDirectionalDevHelper(helper, light) {
	const origin = light.position;
	const target = light.target.position;
	const direction = new THREE.Vector3().subVectors(target, origin);
	const length = Math.max(direction.length(), 2);
	direction.normalize();
	const arrow = helper.userData.devLightArrow;
	const marker = helper.userData.devLightMarker;

	helper.position.copy(origin);
	arrow.position.set(0, 0, 0);
	arrow.setDirection(direction);
	arrow.setColor(light.color);
	arrow.setLength(length, length * 0.12, length * 0.06);
	marker?.material?.color?.copy(light.color);
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
	constructor(options = {}) {
		this.store = options.store ?? appStore;
		this.projects = options.projects ?? projectsData;
		this.sceneId = options.sceneId ?? "portfolioHub";
		this.isHubPath = options.isHubPath ?? isPortfolioHubPath;
		this.isCasePath = options.isCasePath ?? isPortfolioCasePath;
		this.getProjectByPath = options.getProjectByPath ?? getPortfolioProjectByPath;
		this.externalLinks = options.externalLinks === true;
		this._gridSlideForTarget = (index) => getGridFocusSlide(index, this.projects.length);
		this.threeScene = new THREE.Scene();
		this.root = new THREE.Group();
		/** Сдвиг всех плит по локальной Z при фокусе на проекте. */
		this.platesGroup = new THREE.Group();
		this.root.add(this.platesGroup);
		this.threeScene.add(this.root);

		this.showHub = false;
		this.enterActive = false;
		/** dormant — стартовая поза, opacity 0, HUD спрятан; entering — opacity 0→1. */
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
		/** double-rAF: logos/locale after plate wake (spread enter CPU/GPU). */
		this._enterChromeRaf = 0;
		/**
		 * Hex target prepared with plates at rest opacity 1 (HUD still stashed).
		 * Enter skips `_wakeHub` grid ramp — only logos + list chrome.
		 */
		this._mixTargetPrepared = false;
		this._appStarted = false;
		this._lastAppStarted = false;
		this._lastHudTitleVisibility = -1;
		/** Сглаженный множитель bloom (0…1), без скачка при смене lifecycle. */
		this._hubBloomRevealCurrent = 0;
		this.centerPlateLogos = new CenterPlateNipigasLogos(this.projects, options.logoOptions);
		this.plateProjectLabels = new HubPlateProjectLabels(this.projects, this.store);
		this.plateDetailsButtons = new HubPlateDetailsButtons(this.store, options.getActionLabel);
		this.screenTitle = new HubScreenTitle(this.threeScene, {
			projects: this.projects, store: this.store, sceneId: this.sceneId,
			createProjectsTextLayer: options.createProjectsTextLayer,
		});
		this._portfolioLocaleSwitch = createPortfolioHubLocaleSwitchController({
			getProjectsColumn: () => this.screenTitle?.projectsColumn,
			getPlateLabels: () => this.plateProjectLabels,
			getPlateDetailsButtons: () => this.plateDetailsButtons,
			getInnerPanels: () => this.innerPanels,
			// Animate only while hub is the current page — previous/next stay warm.
			shouldAnimateLocale: () => shouldAnimateSiteLocaleForRingScene(this.sceneId) && (this._hubLifecycle === "active" || this._hubLifecycle === "entering"),
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
		this._caseSelection = createHubCaseSelectionState();
		this._caseSelectionTargetLocal = new THREE.Vector3();
		this._caseSelectionCameraFromPosition = new THREE.Vector3();
		this._caseSelectionCameraTargetPosition = new THREE.Vector3();
		this._caseSelectionCameraFromQuaternion = new THREE.Quaternion();
		this._caseSelectionCameraTargetQuaternion = new THREE.Quaternion();
		this._caseSelectionCameraFromFov = portfolioHubPlatesConfig.camera.fov;
		this._caseReturnCameraFromPosition = new THREE.Vector3();
		this._caseReturnCameraFromQuaternion = new THREE.Quaternion();
		this._caseReturnCameraFromFov = portfolioHubPlatesConfig.camera.fov;
		this._caseReturnCameraTargetPosition = new THREE.Vector3().fromArray(portfolioHubPlatesConfig.camera.position);
		this._caseReturnCameraTargetQuaternion = new THREE.Quaternion().fromArray(portfolioHubPlatesConfig.camera.quaternion).normalize();
		this._caseSelectionRect2FromPosition = new THREE.Vector3();
		this._caseSelectionRect2TargetPosition = new THREE.Vector3();
		this._caseSelectionContentProjectIndex = -1;
		this._caseSelectionContentFromAlpha = 0;
		this._caseSelectionContentPartLinear = 0;
		this._caseReturnGroupFromY = 0;
		this._caseReturnGroupFromZ = 0;
		this._caseReturnGroupTargetY = 0;
		this._caseReturnGroupTargetZ = 0;
		/** Cold case route: final column is prepared under the loader, reveal starts afterwards. */
		this._directCaseEnterPrepared = false;
		this._directCaseEnterPlaying = false;
		/** Case pathname waiting for the warmed grid to be ready for selection. */
		this._pendingRouteCaseProjectIndex = -1;
		this._plateByProjectIndex = new Map();
		this.platesRenderer = new HubPlatesRenderer(this.platesGroup);
		this.innerPanels = new HubPlateInnerPanels();
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
		this._cursorParallaxYaw = 0;
		this._cursorParallaxPitch = 0;
		this._parallaxPivot = new THREE.Vector3();
		this._parallaxOrbitOffset = new THREE.Vector3();
		this._parallaxCameraRight = new THREE.Vector3();
		this._parallaxCameraUp = new THREE.Vector3();
		this._parallaxBaseForward = new THREE.Vector3();
		this._parallaxNewForward = new THREE.Vector3();
		this._parallaxYawRotation = new THREE.Quaternion();
		this._parallaxPitchRotation = new THREE.Quaternion();
		this._parallaxLookRotation = new THREE.Quaternion();
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
		this._freeCamera = import.meta.env.DEV && options.inputElement
			? new PortfolioFreeCameraController(options.inputElement)
			: null;

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
		this._applyDirectionalLightDef(light, def);
		this.threeScene.add(light);
		this.threeScene.add(light.target);
		this.directionalLightsById.set(def.id, light);
		this.lights.push(light);

		return light;
	}

	_applyDirectionalLightDef(light, def) {
		light.color.set(def.color);
		light.intensity = def.intensity;
		light.position.fromArray(def.position);
		light.target.position.fromArray(def.target ?? [0, 0, 0]);
		light.target.updateMatrixWorld();
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

			this._applyDirectionalLightDef(light, def);
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
			this._updateDevLightHelpers();
		}
	}

	setDevLightHelpersVisible(visible) {
		this._lightHelpersVisible = visible === true;
		this._syncLightHelpers();
	}

	areDevLightHelpersVisible() {
		return this._lightHelpersVisible;
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
		return createPlateGeometry(cfg);
	}

	_buildProjectPlateGeometry(cfg) {
		const geometry = this._buildPlateGeometry(cfg);
		const aspectRatio = Math.max(cfg.caseSelection?.aspectRatio ?? 1, 1);
		const wideGeometry = splitPlateMaterialGroups(new RoundedBoxGeometry(
			cfg.plateSize * aspectRatio,
			cfg.plateSize,
			cfg.depth,
			cfg.cornerSegments,
			cfg.cornerRadius,
		));
		const position = wideGeometry.getAttribute("position");
		const normal = wideGeometry.getAttribute("normal");

		if (
			position?.count !== geometry.getAttribute("position")?.count ||
			normal?.count !== geometry.getAttribute("normal")?.count
		) {
			wideGeometry.dispose();
			throw new Error("Portfolio plate morph geometries must have matching topology");
		}

		geometry.morphAttributes.position = [position.clone()];
		geometry.morphAttributes.normal = [normal.clone()];
		geometry.morphTargetsRelative = false;
		wideGeometry.dispose();
		return geometry;
	}

	_buildProjectIndexLookup() {
		const lookup = new Map();
		for (let index = 0; index < this.projects.length; index += 1) {
			const layout = getProjectPlateLayout(index, this.projects.length);
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
			buildProjectGeometry: (c) => this._buildProjectPlateGeometry(c),
			createProjectMaterial: () => this._createPlateMaterials(),
			createDecorMaterial: () => this._createDecorPlateMaterials(),
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
		const innerPanelsReady = this.externalLinks ? Promise.resolve() : this.innerPanels.attachToPlates(this.plates, cfg);
		const screenTitleReady = this.screenTitle.init(cfg).then(() => {
			this._syncScreenTitleVisibility();
		});

		return Promise.all([this.centerPlateLogos.readyPromise, labelsReady, detailsReady, innerPanelsReady, screenTitleReady])
			.then(([logosReady]) => {
				if (logosReady !== true) {
					throw new Error("Portfolio hub logos were not prepared");
				}
				return true;
			});
	}

	_getScreenTitleVisibility() {
		if (portfolioHubPlatesConfig.hubScreenTitle?.enabled === false) {
			return 0;
		}

		// Список проектов — только на /portfolio; на кейсе HUD не рисуем и не кликаем.
		if (this.isCasePath(this._routeDisplayedPage)) {
			return 0;
		}

		if (!this.isHubPath(this._routeDisplayedPage)) {
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
		this._cursorParallaxYaw = 0;
		this._cursorParallaxPitch = 0;
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

		this._resetCaseSelection({ restorePlates: true });

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
		this._resetCaseSelection({ restorePlates: true });
		this._gridEnterProgress = 0;
		this._gridEnterStartedAt = performance.now() / 1000;
		this._applyGridTransformAtProgress(0);
		this.platesRenderer.resetProjectPlatePositions();
		this._applyPlateOpacity(0);
	}

	_resetCaseSelection({ restorePlates = false } = {}) {
		resetHubCaseSelection(this._caseSelection);
		this._directCaseEnterPrepared = false;
		this._directCaseEnterPlaying = false;
		if (!this.externalLinks) {
			resetHubPlateCaseColumnMotion();
			syncHubPlateCaseFromScene({ open: false, projectIndex: -1, progress: 0 });
		}
		this._caseSelectionContentProjectIndex = -1;
		this._caseSelectionContentFromAlpha = 0;
		this._caseSelectionContentPartLinear = 0;
		this.innerPanels.reset();
		this.store.cursor.screenGalleryHovered = false;
		this.store.cursor.screenGalleryDragging = false;
		this.store.cursor.caseNavHovered = false;
		const rect2 = this.rectAreaLightsById?.get("rect2");
		const rect2Def = portfolioHubLights.rectAreas?.find((entry) => entry.id === "rect2");
		if (rect2 && rect2Def?.position) {
			rect2.position.fromArray(rect2Def.position);
		}
		this.platesRenderer.resetDecorMosaic();
		if (!restorePlates) {
			return;
		}

		this.platesRenderer.resetProjectPlatePositions();
		const visibility = Math.max(0, this._lastPlateVisibilityMul);
		this.platesRenderer.setDecorMaterialOpacity(portfolioHubPlatesConfig.material.opacity * visibility);
	}

	/**
	 * Dormant: стартовая поза, opacity 0, HUD спрятан.
	 * Cheap on purpose — runs on the same commit frame as home land; no plate
	 * position loops / texture uploads here.
	 */
	_ensureDormantState() {
		if (this._hubLifecycle === "dormant" && this._gridEnterProgress <= 0 && this._carouselEnterPending && !this._mixTargetPrepared) {
			return;
		}

		resetPortfolioHubBackgroundFocus(this.store);
		this.screenTitle?.stashProjectsHiddenForDormant?.();
		this._clearHubEnterDelayTimer();
		this._mixTargetPrepared = false;
		this._resetCaseSelection();
		this._gridExitActive = false;
		this._gridExitProgress = 0;
		this._hubLifecycle = "dormant";
		this.showHub = true;
		this.enterActive = true;
		this.root.visible = true;
		this._logoRevealAlpha = 0;
		this._cursorTiltRotX = 0;
		this._cursorTiltRotY = 0;
		this._cursorParallaxYaw = 0;
		this._cursorParallaxPitch = 0;
		this._resetPlateElementHover();
		this._gridEnterProgress = 0;
		this._applyGridTransformAtProgress(0);
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
		this._resetCaseSelection({ restorePlates: true });
		this._mixTargetPrepared = false;
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
	 * Hex target: plates at rest opacity 1 (GPU warm + visible wipe), HUD list stashed.
	 * Logos/focus wait for enter chrome — not on the hex-start frame.
	 */
	_prepareHubForMixTarget() {
		this._resetCaseSelection({ restorePlates: true });
		this.screenTitle?.stashProjectsHiddenForDormant?.();
		this._lastHudTitleVisibility = 0;
		this.screenTitle?.setVisibility(0);

		this._gridExitActive = false;
		this._gridExitProgress = 0;
		this._hubLifecycle = "active";
		this.showHub = true;
		this.enterActive = true;
		this.root.visible = true;
		this.root.scale.set(1, 1, 1);
		this._logoRevealAlpha = 0;
		this._cursorTiltRotX = 0;
		this._cursorTiltRotY = 0;
		this._cursorParallaxYaw = 0;
		this._cursorParallaxPitch = 0;
		this._resetPlateElementHover();
		this._hubAnim = createHubAnimState();
		this._gridEnterProgress = 1;
		this._applyGridTransformAtProgress(1);
		this.platesRenderer.resetProjectPlatePositions();
		this._applyPlateOpacity(1);
		this.centerPlateLogos?.updatePlate?.(null);
		this.centerPlateLogos?.setRevealAlpha?.(0, { entering: false });
		this.plateProjectLabels?.setFocusReveal?.(-1, 0, { entering: false });
		this.plateDetailsButtons?.setFocusReveal?.(-1, 0, { entering: false });
		this._mixTargetPrepared = true;
		this._carouselEnterPending = true;
	}

	/**
	 * Ring dormant (next-only): start pose, opacity 0, HUD stashed.
	 * Ignore leave-pose / route — page stays live as `previous` for reverse.
	 */
	resetCarouselState(ctx = {}) {
		const { reason, carouselProgress, role, prevRole } = ctx;

		if (!isRingDormantReason(reason)) {
			return;
		}

		if (Number.isFinite(carouselProgress) && !isCarouselProgressAtSegmentStart(carouselProgress)) {
			return;
		}

		// Defense in depth: never dormant on current→next commit frame.
		if (role === "next" && prevRole === "current") {
			return;
		}

		// Still the live hub page in the ring — never wipe mid-stay.
		if (role === "current" || getSceneCarousel().currentId === this.sceneId) {
			return;
		}

		this._ensureDormantState();
	}

	/** Уходящий hub в hex-mix: сетка видима для scroll-out. */
	prepareCarouselMixSource() {
		if (this._hubLifecycle === "dormant") {
			this._restoreActiveHubForMixOut();
		}
	}

	/**
	 * Incoming hub in hex-mix: plates visible at rest (not opacity-0 dormant).
	 * Called after hex-target dormant reset on the same frame.
	 */
	prepareCarouselMixTarget() {
		this._prepareHubForMixTarget();
	}

	/** Анимация появления — после carousel dormant, или list-only при reverse как previous. */
	playEnterAnimation() {
		if (this._gridExitActive || this._hubLifecycle === "exiting") {
			this._cancelGridExitForReenter();
		}

		if (this._directCaseEnterPrepared) {
			this._playDirectCaseEnter();
			return;
		}

		if (this._caseSelection.active) {
			this._syncScreenTitleVisibility();
			return;
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
			// About→hub (and any reverse while hub stayed live as `previous`): plates stay up,
			// route only hid the list — re-snake without grid enter / dormant wake.
			if (this._hubLifecycle === "active" && this._gridEnterProgress >= 1 && this.isHubPath(this._routeDisplayedPage)) {
				this._playProjectsListReenterOnly();
			}
			return;
		}

		if (this._hubEnterDelayTimer) {
			return;
		}

		const loaderDelayMs = this._appStarted ? getLoaderCurtainRemainingMs(this.store.appStartedAt) : 0;
		if (loaderDelayMs > 0) {
			this._hubEnterDelayTimer = setTimeout(() => {
				this._hubEnterDelayTimer = 0;
				this._playEnterAnimationImmediate();
			}, loaderDelayMs);
			return;
		}

		this._playEnterAnimationImmediate();
	}

	_playDirectCaseEnter() {
		if (!this._directCaseEnterPrepared || this._directCaseEnterPlaying) {
			return;
		}
		if (this._hubEnterDelayTimer) {
			return;
		}

		const loaderDelayMs = this._appStarted ? getLoaderCurtainRemainingMs(this.store.appStartedAt) : 0;
		if (loaderDelayMs > 0) {
			this._hubEnterDelayTimer = setTimeout(() => {
				this._hubEnterDelayTimer = 0;
				this._playDirectCaseEnterImmediate();
			}, loaderDelayMs);
			return;
		}

		this._playDirectCaseEnterImmediate();
	}

	_playDirectCaseEnterImmediate() {
		if (!this._directCaseEnterPrepared || !this._caseSelection.active) {
			return;
		}

		this._carouselEnterPending = false;
		this._mixTargetPrepared = false;
		this._hubLifecycle = "entering";
		this.showHub = true;
		this.enterActive = true;
		this.root.visible = true;
		this.root.scale.set(1, 1, 1);
		this._gridEnterProgress = 1;
		this._applyGridTransformAtProgress(1);
		this._caseSelection.phase = "entering";
		this._caseSelection.startedAt = performance.now() / 1000;
		this._caseSelection.progress = 0;
		this._directCaseEnterPrepared = false;
		this._directCaseEnterPlaying = true;
		this._applyPlateOpacity(0);
		playHubCardMovementSound(portfolioHubPlatesConfig.caseSelection?.durationMs ?? 1350);
	}

	/**
	 * List snake only — hub already live (previous for reverse). Do not wake plates / grid enter.
	 */
	_playProjectsListReenterOnly() {
		this._clearHubEnterDelayTimer();
		this.screenTitle?.stashProjectsHiddenForDormant?.({ preserveFocus: true });
		this._lastHudTitleVisibility = 0;
		this.screenTitle?.setVisibility(0);
		this._scheduleEnterChromeSpread();
	}

	_scheduleProjectsIntro() {
		this._clearProjectsIntroDelayTimer();
		const listDelayMs = Math.max(0, portfolioHubPlatesConfig.gridEnter?.listIntroDelayMs ?? 0);
		if (listDelayMs > 0) {
			this._projectsIntroDelayTimer = setTimeout(() => {
				this._projectsIntroDelayTimer = 0;
				this.screenTitle?.requestProjectsIntro?.();
			}, listDelayMs);
			return;
		}
		this.screenTitle?.requestProjectsIntro?.();
	}

	_clearEnterChromeRaf() {
		if (this._enterChromeRaf) {
			cancelAnimationFrame(this._enterChromeRaf);
			this._enterChromeRaf = 0;
		}
	}

	/**
	 * Spread enter chrome off the wake/commit frame:
	 * plates (already waking) → double-rAF → focus logos + locale → list intro delay.
	 */
	_scheduleEnterChromeSpread() {
		this._clearEnterChromeRaf();
		this._enterChromeRaf = requestAnimationFrame(() => {
			this._enterChromeRaf = requestAnimationFrame(() => {
				this._enterChromeRaf = 0;
				if (this._hubLifecycle === "dormant") {
					return;
				}
				if ((this.store.portfolioHubFocusIndex ?? -1) < 0) {
					commitPortfolioHubFocusIndex(this.store, 0);
				}
				void this.plateProjectLabels?.playPendingLocaleReveal?.(portfolioHubPlatesConfig);
				void this.plateDetailsButtons?.playPendingLocaleReveal?.(portfolioHubPlatesConfig);
				this._scheduleProjectsIntro();
			});
		});
	}

	/**
	 * Plate wake on this frame (or skip if hex already warmed plates);
	 * logos / locale / list intro on later frames.
	 */
	_playEnterAnimationImmediate() {
		if (!this._carouselEnterPending) {
			return;
		}

		this._carouselEnterPending = false;
		this._cancelGridExitForReenter();
		this.screenTitle?.stashProjectsHiddenForDormant?.();
		this._lastHudTitleVisibility = 0;
		this.screenTitle?.setVisibility(0);

		const platesAlreadyWarm = this._mixTargetPrepared && this._gridEnterProgress >= 1;
		this._mixTargetPrepared = false;

		if (platesAlreadyWarm) {
			// Hex wipe already drew opaque InstancedMesh — no second opacity/transform ramp.
			this._hubLifecycle = "active";
			this.enterActive = true;
			this.root.visible = true;
			this.root.scale.set(1, 1, 1);
		} else {
			this._hubLifecycle = "entering";
			this._wakeHub();
		}

		this._scheduleEnterChromeSpread();
	}

	_clearHubEnterDelayTimer() {
		if (this._hubEnterDelayTimer) {
			clearTimeout(this._hubEnterDelayTimer);
			this._hubEnterDelayTimer = 0;
		}
		this._clearEnterChromeRaf();
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
		// Dormant is always opacity 0 — enter eases 0→1 (ignore mid-start fromOpacity).
		const t = easeInOutCubic(clamp01(progress));
		return t;
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
		if (!this.isHubPath(this._routeDisplayedPage) && !this.isCasePath(this._routeDisplayedPage) && this._freeCamera?.enabled) {
			this._freeCamera.setEnabled(false);
		}
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

		const displayedCase = this.getProjectByPath(currentPage);
		const targetCase = this.getProjectByPath(teleportPage);
		const routeCase = targetCase ?? displayedCase;
		const displayedCaseIndex = displayedCase ? this.projects.indexOf(displayedCase) : -1;
		// URL intent arrives in teleportPage while currentPage deliberately remains
		// /portfolio until the route hand-off. Start the gathered-column animation from
		// that intent instead of waiting for a reload or display-path commit.
		this._pendingRouteCaseProjectIndex = routeCase ? this.projects.indexOf(routeCase) : -1;
		const hubDisplayed = this.isHubPath(currentPage) || displayedCaseIndex >= 0;
		const hubTarget = this.isHubPath(teleportPage) || this.isCasePath(teleportPage);

		// A case and /portfolio are two states of this same warmed scene. Start the
		// reverse motion as soon as the hub becomes the browser target; never snap
		// the gathered column back to its layout on the display-path hand-off.
		// During hub -> case the displayed route intentionally stays `/portfolio`
		// for the first frame. Only the navigation target can tell us that this is
		// a real return; using currentPage here immediately reversed a just-started
		// case selection as soon as its URL was committed.
		const returningToPortfolioHub = this._caseSelection.active && this.isHubPath(teleportPage);
		if (returningToPortfolioHub && this._caseSelection.phase !== "returning") {
			this._beginCaseReturn();
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

		const shouldPrepareDirectCase = Boolean(
			appStarted &&
			appStartedChanged &&
			routePhase === "idle" &&
			displayedCaseIndex >= 0 &&
			!this._caseSelection.active
		);
		if (shouldPrepareDirectCase) {
			this._prepareDirectCaseEnter(displayedCaseIndex);
		}

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
		// Never clear an empty RT for dormant hub — that cold-started plates on return.
		return Boolean(this.showHub && this.root.visible);
	}

	/**
	 * Preloader: force a real plates draw (opacity 1), then restore prior state.
	 * Dormant hub skips shouldRender — first hex to/from hub would cold-start InstancedMesh.
	 */
	getWarmupDetachedRoots() {
		return [this.centerPlateLogos?.anchor];
	}

	async prepareResourcesUnderCurtain(renderer, scheduler) {
		for (const texture of this.centerPlateLogos?.textures.values() ?? []) {
			await scheduler.run(() => renderer.initTexture(texture), { gpu: true });
		}
	}

	beginWarmupDraw() {
		const token = {
			showHub: this.showHub,
			rootVisible: this.root?.visible === true,
			gridEnterProgress: this._gridEnterProgress,
			hubLifecycle: this._hubLifecycle,
			logoRevealAlpha: this._logoRevealAlpha,
			innerPanels: this.innerPanels.beginWarmupDraw(),
		};
		this.showHub = true;
		if (this.root) {
			this.root.visible = true;
		}
		this._gridEnterProgress = 1;
		this._applyGridTransformAtProgress(1);
		this._applyPlateOpacity(1);
		this._logoRevealAlpha = 1;
		this.centerPlateLogos?.setRevealAlpha?.(1, { entering: false });
		return token;
	}

	endWarmupDraw(token) {
		if (!token) {
			return;
		}
		this.showHub = token.showHub;
		if (this.root) {
			this.root.visible = token.rootVisible;
		}
		this._gridEnterProgress = token.gridEnterProgress;
		this._hubLifecycle = token.hubLifecycle;
		this._logoRevealAlpha = token.logoRevealAlpha;
		this._applyGridTransformAtProgress(token.gridEnterProgress);
		this._applyPlateOpacity(token.gridEnterProgress > 0.001 && token.hubLifecycle !== "dormant" ? 1 : 0);
		this.centerPlateLogos?.setRevealAlpha?.(token.logoRevealAlpha, { entering: false });
		this.innerPanels.endWarmupDraw(token.innerPanels);
		if (!token.showHub) {
			this.showHub = false;
			if (this.root) {
				this.root.visible = false;
			}
		}
	}

	/** Хаб всегда в dual-render паре с соседями кольца. */
	shouldKeepUpdating() {
		return this.showHub;
	}

	/** Keep-alive full-scene draws were removed — they hitch home. Meshes stay in graph. */
	needsRenderKeepAlive() {
		return false;
	}

	getScene() {
		return this.threeScene;
	}

	applyCamera(camera, frame) {
		this.applyScrollCamera(camera, frame);
	}

	/** Анимация скролла — камера при role current|next (sceneProgress). */
	applyScrollCamera(camera, frame) {
		if (this._freeCamera?.apply(camera)) {
			this.screenTitle?.syncRootToCamera?.(camera);
			return;
		}

		const cam = portfolioHubPlatesConfig.camera;
		const sceneProgress = frame?.sceneProgress ?? 0;
		const baseZ = this._devCameraZ ?? cam.position[2];

		applySceneProgressToCamera(
			camera,
			{
				position: [cam.position[0], cam.position[1], baseZ],
				lookAt: cam.lookAt,
				quaternion: cam.quaternion,
				fov: cam.fov,
				/** +sceneProgress → content rises (scroll down). */
				scrollY: 2.1,
				scrollZ: 2.0,
			},
			sceneProgress,
		);

		// Камера общая у всех сцен карусели — HUD синхронизируем здесь, перед render слоя hub.
		if (this._caseSelection.active) {
			this._applyCaseSelectionCamera(camera);
			this._applyCursorCameraParallax(camera);
		} else {
			this._applyCursorCameraParallax(camera);
		}
		this.screenTitle?.syncRootToCamera?.(camera);
	}

	_captureCaseSelectionCamera(camera) {
		const baseCamera = portfolioHubPlatesConfig.camera;
		const targetCamera = portfolioHubPlatesConfig.caseSelection?.camera;
		if (!targetCamera) {
			return;
		}

		if (camera) {
			this._caseSelectionCameraFromPosition.copy(camera.position);
			this._caseSelectionCameraFromQuaternion.copy(camera.quaternion).normalize();
			this._caseSelectionCameraFromFov = camera.fov;
		} else {
			this._caseSelectionCameraFromPosition.fromArray(baseCamera.position);
			this._caseSelectionCameraFromQuaternion.fromArray(baseCamera.quaternion).normalize();
			this._caseSelectionCameraFromFov = baseCamera.fov;
		}

		this._caseSelectionCameraTargetPosition.fromArray(targetCamera.position);
		this._caseSelectionCameraTargetQuaternion.fromArray(targetCamera.quaternion).normalize();
	}

	_applyCaseSelectionCamera(camera) {
		const targetCamera = portfolioHubPlatesConfig.caseSelection?.camera;
		if (!targetCamera) {
			return;
		}
		if (this._caseSelection.phase === "returning") {
			const baseCamera = portfolioHubPlatesConfig.camera;
			const fromProgress = Math.max(this._caseSelection.returnFromProgress, 0.000001);
			const returnProgress = clamp01(1 - this._caseSelection.progress / fromProgress);
			camera.position.lerpVectors(
				this._caseReturnCameraFromPosition,
				this._caseReturnCameraTargetPosition,
				returnProgress,
			);
			camera.quaternion.slerpQuaternions(
				this._caseReturnCameraFromQuaternion,
				this._caseReturnCameraTargetQuaternion,
				returnProgress,
			);
			camera.fov = this._caseReturnCameraFromFov +
				(baseCamera.fov - this._caseReturnCameraFromFov) * returnProgress;
			camera.updateProjectionMatrix();
			camera.updateMatrixWorld();
			return;
		}

		const progress = easeInOutCubic(this._caseSelection.progress);
		camera.position.lerpVectors(
			this._caseSelectionCameraFromPosition,
			this._caseSelectionCameraTargetPosition,
			progress,
		);
		camera.quaternion.slerpQuaternions(
			this._caseSelectionCameraFromQuaternion,
			this._caseSelectionCameraTargetQuaternion,
			progress,
		);
		camera.fov = this._caseSelectionCameraFromFov + (targetCamera.fov - this._caseSelectionCameraFromFov) * progress;
		camera.updateProjectionMatrix();
		camera.updateMatrixWorld();
	}

	_captureCaseReturnCamera() {
		const baseCamera = portfolioHubPlatesConfig.camera;
		this._caseReturnCameraTargetPosition.fromArray(baseCamera.position);
		this._caseReturnCameraTargetPosition.z = this._devCameraZ ?? baseCamera.position[2];
		this._caseReturnCameraTargetQuaternion.fromArray(baseCamera.quaternion).normalize();
		const progress = easeInOutCubic(this._caseSelection.progress);
		this._caseReturnCameraFromPosition.lerpVectors(
			this._caseSelectionCameraFromPosition,
			this._caseSelectionCameraTargetPosition,
			progress,
		);
		this._caseReturnCameraFromQuaternion.slerpQuaternions(
			this._caseSelectionCameraFromQuaternion,
			this._caseSelectionCameraTargetQuaternion,
			progress,
		).normalize();
		const targetFov = portfolioHubPlatesConfig.caseSelection?.camera?.fov ?? this._caseSelectionCameraFromFov;
		this._caseReturnCameraFromFov = this._caseSelectionCameraFromFov +
			(targetFov - this._caseSelectionCameraFromFov) * progress;
	}

	_captureCaseSelectionLights() {
		const rect2 = this.rectAreaLightsById.get("rect2");
		const targetPosition = portfolioHubPlatesConfig.caseSelection?.lights?.rect2?.position;
		if (!rect2 || !targetPosition) {
			return;
		}

		this._caseSelectionRect2FromPosition.copy(rect2.position);
		this._caseSelectionRect2TargetPosition.fromArray(targetPosition);
	}

	_applyCaseSelectionLights(linearProgress) {
		const rect2 = this.rectAreaLightsById.get("rect2");
		const targetPosition = portfolioHubPlatesConfig.caseSelection?.lights?.rect2?.position;
		if (!rect2 || !targetPosition) {
			return;
		}

		rect2.position.lerpVectors(
			this._caseSelectionRect2FromPosition,
			this._caseSelectionRect2TargetPosition,
			easeInOutCubic(clamp01(linearProgress)),
		);
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

	isFreeCameraEnabled() {
		return this._freeCamera?.enabled === true;
	}

	setFreeCameraEnabled(enabled, camera) {
		if (!this._freeCamera) {
			return false;
		}
		if (enabled && !this.isHubPath(this._routeDisplayedPage) && !this.isCasePath(this._routeDisplayedPage)) {
			return false;
		}
		this._freeCamera.setEnabled(enabled, camera);
		return this._freeCamera.enabled;
	}

	resetFreeCamera(camera) {
		this._freeCamera?.reset(camera, portfolioHubPlatesConfig.camera);
	}

	getFreeCameraSnapshot(camera) {
		return this._freeCamera?.getSnapshot(camera) ?? null;
	}

	getFreeCameraSnapshotText(camera) {
		return this._freeCamera?.getSnapshotText(camera) ?? "";
	}

	copyFreeCameraSnapshot(camera) {
		return this._freeCamera?.copySnapshot(camera) ?? Promise.resolve(false);
	}

	/** Dev / конфиг: HUD-подпись на проектных плитах. */
	applyPlateLabelFromConfig(options = {}) {
		this.plateProjectLabels.applyFromConfig(portfolioHubPlatesConfig);
		void this.plateDetailsButtons.applyFromConfig(portfolioHubPlatesConfig);
		const focusIndex = this.store.portfolioHubFocusIndex ?? -1;
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

	applyPlateSpacingFromDev() {
		this._resetCaseSelection({ restorePlates: true });
		const layouts = buildPlateGridLayouts();
		const layoutByKey = new Map(layouts.map((layout) => [`${layout.rowIndex},${layout.plateIndex}`, layout]));
		this.platesRenderer.updateLayoutPositions(layoutByKey);
		this._plateHoverNeedsRaycast = true;
		if (this._hubLifecycle !== "dormant") {
			this._updateMenuInteraction();
		}
	}

	_createPlateMaterial(m = portfolioHubPlatesConfig.material, role = "project") {
		return createPlateMaterial(m, role);
	}

	_createPlateMaterials(m = portfolioHubPlatesConfig.material, role = "project") {
		return createPlateMaterials(m, role);
	}

	/** DEV material tuner: transform uniforms live; recreate only when material class changes. */
	applyPlateMaterialFromDev({ recreate = false } = {}) {
		const materialConfig = portfolioHubPlatesConfig.material;
		if (recreate) {
			this.platesRenderer.replaceMaterials(
				this._createPlateMaterials(materialConfig, "project"),
				this._createDecorPlateMaterials(materialConfig),
			);
		}

		const visibility = Math.max(0, this._lastPlateVisibilityMul);
		this.platesRenderer.applyMaterialConfig({
			...materialConfig,
			opacity: materialConfig.opacity * visibility,
		});
		this.sharedPlateMaterial = this.platesRenderer.getMaterial();
	}

	/** Декоративные плиты (InstancedMesh) — могут быть lighter (decorType). */
	_createDecorPlateMaterials(m = portfolioHubPlatesConfig.material) {
		return this._createPlateMaterials(m, "decor");
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
		this.store.cursor.caseHovered = false;
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

	/**
	 * Hub plates/list: SceneManager assigns interactionEnabled for the Y-band owner
	 * during hex/carousel mix (source or target). Do not re-ban on hex progress here.
	 */
	_canAcceptHubInteraction(frame) {
		if (frame?.pointerBlocked || frame?.interactionEnabled === false) {
			return false;
		}
		return Boolean(this.showHub && this.root.visible && !this._caseSelection.active && !this._freeCamera?.enabled);
	}

	/** Hit-test активной плитки: один Raycaster по одному mesh, recursive=false. */
	_updatePlateElementHover(delta, frame) {
		const hoverCfg = portfolioHubPlatesConfig.interaction?.hoverMotion;
		const focusIndex = this.store.portfolioHubFocusIndex ?? -1;
		const minReveal = hoverCfg?.minRevealAlpha ?? 0.55;
		const canHover = this._canAcceptHubInteraction(frame) && focusIndex >= 0 && this._logoRevealAlpha >= minReveal && this._gridEnterProgress >= 1 && !this._gridExitActive;

		if (!canHover || !frame?.camera || !frame?.pointer) {
			this._plateHovered = false;
			this._lastPlateHoverCanHover = canHover;
			this._plateHoverNeedsRaycast = true;
			this.centerPlateLogos.setLogoHover(false);
			this.centerPlateLogos.updateHover(delta);
			this.plateDetailsButtons.setDetailsHover(false);
			this.plateDetailsButtons.updateHover(delta);
			this.store.cursor.caseHovered = false;
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
		this.store.cursor.caseHovered = this._plateHovered;
	}

	setPointerState({ pointerDown, pointerBlocked = false }) {
		if (pointerBlocked) {
			this._pointerDown = false;
			this._pointerClickPending = false;
			this._plateHovered = false;
			this._plateHoverNeedsRaycast = true;
			this.screenTitle.clearProjectsPointerHit?.();
			this.store.cursor.caseHovered = false;
			this.store.cursor.screenGalleryHovered = false;
			this.store.cursor.screenGalleryDragging = false;
			this.store.cursor.caseNavHovered = false;
			this.innerPanels.clearGalleryHover();
			this.innerPanels.clearGalleryPointer();
			return;
		}
		if (this._pointerDown && !pointerDown) {
			this._pointerClickPending = true;
		}
		this._pointerDown = pointerDown;
	}

	_updateInnerPanelGalleryHover(frame) {
		const canHover = Boolean(
			this._caseSelection.active &&
			Math.abs(getHubPlateCaseState().columnProgress) < 0.03 &&
			!this._freeCamera?.enabled &&
			!frame?.pointerBlocked &&
			frame?.interactionEnabled !== false &&
			frame?.camera &&
			frame?.pointer
		);
		if (!canHover) {
			this.innerPanels.clearGalleryHover();
			this.store.cursor.screenGalleryHovered = false;
			this.store.cursor.screenGalleryDragging = false;
			this.store.cursor.caseNavHovered = false;
			return;
		}

		const galleryHovered = this.innerPanels.updateGalleryHover(
			frame.camera,
			frame.pointer,
		);
		const galleryDragging = this.innerPanels.updateGalleryDrag(
			frame.camera,
			frame.pointer,
			this._pointerDown,
			performance.now() / 1000,
		);
		const galleryNavigationHovered = this.innerPanels.isGalleryNavigationHovered();
		this.store.cursor.caseNavHovered = galleryNavigationHovered;
		this.store.cursor.screenGalleryHovered =
			(galleryHovered && !galleryNavigationHovered) || galleryDragging;
		this.store.cursor.screenGalleryDragging = galleryDragging && this._pointerDown;
	}

	/** Project cases are route states rendered by this same warmed scene. */
	_createCaseSelectionTargetResolver(projectIndex) {
		const activePlate = this._getPlateByProjectIndex(projectIndex);
		if (!activePlate?.mesh) {
			return null;
		}

		const selectedAnchor = this._caseSelection.active
			? this._caseSelection.entries.find((entry) => entry.plate.projectIndex === this._caseSelection.activeIndex)
			: null;
		let anchorX;
		let anchorY;
		let anchorZ;
		if (selectedAnchor) {
			anchorX = selectedAnchor.toX;
			anchorY = selectedAnchor.toY;
			anchorZ = selectedAnchor.toZ;
		} else {
			// A click may arrive while the project-focus animation is still moving
			// both the parent grid and the selected plate. Keep that painted pose as
			// the gather animation's `from`, but always finish at the fully focused
			// world-space anchor. Expressing it through the current parent transform
			// avoids a snap and makes the result independent of the click timing.
			const [baseX, baseY, baseZ] = activePlate.basePosition;
			const gridTarget = getGridFocusSlide(projectIndex);
			const slideX = portfolioHubPlatesConfig.interaction?.plateSlideX ?? 0;
			anchorX = baseX + slideX - this.platesGroup.position.x;
			anchorY = baseY + gridTarget.y - this.platesGroup.position.y;
			anchorZ = baseZ + gridTarget.z - this.platesGroup.position.z;
		}
		const spacing = portfolioHubPlatesConfig.caseSelection?.plateColumnSpacing ??
			portfolioHubPlatesConfig.caseSelection?.plateSpacing ??
			2.25;
		return (_plate, offset) => {
			return this._caseSelectionTargetLocal.set(
				anchorX,
				anchorY - offset * spacing,
				anchorZ,
			);
		};
	}

	/**
	 * A cold case route is prepared while the loader still covers the canvas.
	 * The selected project is first aligned with project 01's world-space anchor,
	 * then every project mesh is placed directly into the final column. Runtime
	 * clicks keep using the ordinary gather animation.
	 */
	_prepareDirectCaseEnter(projectIndex) {
		if (
			projectIndex < 0 ||
			!this.projects[projectIndex] ||
			this._caseSelection.active ||
			!this._getPlateByProjectIndex(projectIndex)?.mesh
		) {
			return false;
		}

		this._clearHubEnterDelayTimer();
		this._resetCaseSelection({ restorePlates: true });
		this._hubAnim = createHubAnimState();
		this._gridExitActive = false;
		this._gridExitProgress = 0;
		this._gridEnterProgress = 1;
		this._applyGridTransformAtProgress(1);
		this.platesRenderer.resetProjectPlatePositions();

		const gridTarget = getGridFocusSlide(projectIndex);
		this.platesGroup.position.y = gridTarget.y;
		this.platesGroup.position.z = gridTarget.z;
		this._lastMenuGridY = gridTarget.y;
		this._lastMenuGridZ = gridTarget.z;
		settleHubMenuAnimAtFocus(this._hubAnim, projectIndex, this._gridSlideForTarget);
		const slideX = portfolioHubPlatesConfig.interaction?.plateSlideX ?? 0;
		this.platesRenderer.setProjectPlatePositions(
			(index) => (index === projectIndex ? 1 : 0),
			slideX,
		);

		this._lastVisibleLogo = {
			projectIndex: -1,
			alpha: 0,
			partLinear: 0,
			entering: false,
		};
		this._logoRevealAlpha = 0;
		this._syncFocusPlateLogos(-1, 0, { entering: false });

		const started = this._beginCaseSelection(projectIndex, null, {
			commitRoute: false,
			playMovementSound: false,
			exitProjects: false,
		});
		if (!started || !prepositionHubCaseSelectionAtTarget(this._caseSelection)) {
			this._resetCaseSelection({ restorePlates: true });
			return false;
		}

		const targetCamera = portfolioHubPlatesConfig.caseSelection?.camera;
		if (targetCamera) {
			this._caseSelectionCameraFromPosition.fromArray(targetCamera.position);
			this._caseSelectionCameraFromQuaternion.fromArray(targetCamera.quaternion).normalize();
			this._caseSelectionCameraFromFov = targetCamera.fov;
		}
		const rect2 = this.rectAreaLightsById.get("rect2");
		const rect2Target = portfolioHubPlatesConfig.caseSelection?.lights?.rect2?.position;
		if (rect2 && rect2Target) {
			rect2.position.fromArray(rect2Target);
			this._caseSelectionRect2FromPosition.copy(rect2.position);
			this._caseSelectionRect2TargetPosition.copy(rect2.position);
		}

		this.platesRenderer.setDecorMosaicProgress(1, portfolioHubPlatesConfig.caseSelection?.decorMosaic);
		this._applyPlateOpacity(0);
		this.screenTitle?.stashProjectsHiddenForDormant?.();
		this._lastHudTitleVisibility = 0;
		this.screenTitle?.setVisibility(0);
		this._hubLifecycle = "dormant";
		this.showHub = true;
		this.enterActive = true;
		this.root.visible = true;
		this.root.scale.set(1, 1, 1);
		this._pendingRouteCaseProjectIndex = -1;
		this._directCaseEnterPrepared = true;
		this._directCaseEnterPlaying = false;
		this._carouselEnterPending = true;
		return true;
	}

	_switchCaseSelectionProject(projectIndex, { playSound: shouldPlaySound = true } = {}) {
		if (
			!this._caseSelection.active ||
			this._caseSelection.phase === "returning" ||
			projectIndex < 0 ||
			!this.projects[projectIndex]
		) {
			return false;
		}
		if (this._caseSelection.activeIndex === projectIndex) {
			return true;
		}

		const switched = retargetHubCaseSelection(
			this._caseSelection,
			projectIndex,
			portfolioHubPlatesConfig.caseSelection,
			this._createCaseSelectionTargetResolver(projectIndex),
		);
		if (!switched) {
			return false;
		}

		commitPortfolioHubFocusIndex(this.store, projectIndex);
		this._caseSelectionContentProjectIndex = -1;
		this._caseSelectionContentFromAlpha = 0;
		this._caseSelectionContentPartLinear = 0;
		this.innerPanels.switchActiveProject(projectIndex);
		this._pointerClickPending = false;
		this._resetPlateElementHover();
		if (shouldPlaySound) {
			playHubCardMovementSound(720);
		}
		return true;
	}

	_syncRequestedCaseSelection() {
		if (this.externalLinks) return;
		const requestedIndex = consumeHubPlateCaseOpenRequest();
		if (requestedIndex === null) {
			return;
		}
		if (this._caseSelection.active) {
			this._switchCaseSelectionProject(requestedIndex);
		}
	}

	_createCaseReturnTargetResolver(projectIndex) {
		const slideX = portfolioHubPlatesConfig.interaction?.plateSlideX ?? 0;
		return (plate) => {
			const [baseX, baseY, baseZ] = plate.basePosition;
			return this._caseSelectionTargetLocal.set(
				baseX + (plate.projectIndex === projectIndex ? slideX : 0),
				baseY,
				baseZ,
			);
		};
	}

	_beginCaseReturn() {
		const projectIndex = this._caseSelection.activeIndex;
		if (projectIndex < 0 || this._caseSelection.phase === "returning") {
			return false;
		}

		this._captureCaseReturnCamera();
		const started = beginHubCaseReturn(
			this._caseSelection,
			this.plates,
			performance.now() / 1000,
			this._createCaseReturnTargetResolver(projectIndex),
		);
		if (!started) {
			return false;
		}
		this._directCaseEnterPrepared = false;
		this._directCaseEnterPlaying = false;

		const gridTarget = getGridFocusSlide(projectIndex);
		this._caseReturnGroupFromY = this.platesGroup.position.y;
		this._caseReturnGroupFromZ = this.platesGroup.position.z;
		this._caseReturnGroupTargetY = gridTarget.y;
		this._caseReturnGroupTargetZ = gridTarget.z;
		this._caseSelectionContentProjectIndex = projectIndex;
		this._caseSelectionContentFromAlpha = 1;
		this._caseSelectionContentPartLinear = 1;
		this.innerPanels.showOnlyActiveProject();
		this._pointerClickPending = false;
		this._resetPlateElementHover();
		playHubCardMovementSound(
			portfolioHubPlatesConfig.caseSelection?.returnDurationMs ??
			portfolioHubPlatesConfig.caseSelection?.durationMs ??
			1350,
		);
		return true;
	}

	_finishCaseReturn() {
		const projectIndex = this._caseSelection.activeIndex;
		if (projectIndex < 0) {
			this._resetCaseSelection({ restorePlates: true });
			return;
		}

		commitPortfolioHubFocusIndex(this.store, projectIndex);
		this.platesGroup.position.y = this._caseReturnGroupTargetY;
		this.platesGroup.position.z = this._caseReturnGroupTargetZ;
		settleHubMenuAnimAtFocus(this._hubAnim, projectIndex, this._gridSlideForTarget);
		this._resetCaseSelection();
		this._updateMenuInteraction();
		this._plateHoverNeedsRaycast = true;
		this._scheduleProjectsIntro();
	}

	_beginCaseSelection(
		projectIndex,
		camera = null,
		{ commitRoute = true, playMovementSound = true, exitProjects = true } = {},
	) {
		if (this.externalLinks) return false;
		if (this._caseSelection.active || projectIndex < 0 || !this.projects[projectIndex]) {
			return false;
		}

		const visibleLogo = this._lastVisibleLogo;
		this._caseSelectionContentProjectIndex = visibleLogo?.projectIndex >= 0
			? visibleLogo.projectIndex
			: projectIndex;
		this._caseSelectionContentFromAlpha = clamp01(
			Math.max(this._logoRevealAlpha, visibleLogo?.alpha ?? 0),
		);
		this._caseSelectionContentPartLinear = clamp01(
			visibleLogo?.partLinear ?? this._caseSelectionContentFromAlpha,
		);

		commitPortfolioHubFocusIndex(this.store, projectIndex);
		const started = beginHubCaseSelection(
			this._caseSelection,
			this.plates,
			projectIndex,
			performance.now() / 1000,
			portfolioHubPlatesConfig.caseSelection,
			this._createCaseSelectionTargetResolver(projectIndex),
		);
		if (!started) {
			return false;
		}
		this._captureCaseSelectionCamera(camera);
		this._captureCaseSelectionLights();
		this._cursorParallaxYaw = 0;
		this._cursorParallaxPitch = 0;
		this.innerPanels.setActiveProject(projectIndex);

		this._pointerClickPending = false;
		this._resetPlateElementHover();
		this.platesRenderer.setDecorMosaicProgress(0, portfolioHubPlatesConfig.caseSelection?.decorMosaic);
		if (exitProjects) {
			this.screenTitle?.playProjectsExitGlitch?.({ preserveFocus: true });
		}
		if (playMovementSound) {
			playHubCardMovementSound(portfolioHubPlatesConfig.caseSelection?.durationMs ?? 1350);
		}
		if (commitRoute) {
			commitPortfolioHubCaseRoute(
				this.projects[projectIndex].path,
				this._routeDisplayedPage,
			);
		}
		return true;
	}

	_syncCaseSelectionToRoute(camera = null) {
		const projectIndex = this._pendingRouteCaseProjectIndex;
		if (projectIndex < 0 || this._hubLifecycle === "dormant" || this._gridEnterProgress < 1 || this._gridExitActive) {
			return;
		}

		if (this._caseSelection.active && this._caseSelection.activeIndex === projectIndex) {
			this._pendingRouteCaseProjectIndex = -1;
			return;
		}

		if (this._caseSelection.active) {
			if (this._switchCaseSelectionProject(projectIndex, { playSound: false })) {
				this._pendingRouteCaseProjectIndex = -1;
			}
			return;
		}

		if (this._beginCaseSelection(projectIndex, camera, { commitRoute: false })) {
			this._pendingRouteCaseProjectIndex = -1;
		}
	}

	_updateCaseSelection(nowSeconds) {
		if (!this._caseSelection.active) {
			return;
		}

		const motion = advanceHubCaseSelection(
			this._caseSelection,
			nowSeconds,
			portfolioHubPlatesConfig.caseSelection,
		);
		if (motion.returning) {
			const returnProgress = motion.transitionProgress;
			this.platesGroup.position.y = this._caseReturnGroupFromY +
				(this._caseReturnGroupTargetY - this._caseReturnGroupFromY) * returnProgress;
			this.platesGroup.position.z = this._caseReturnGroupFromZ +
				(this._caseReturnGroupTargetZ - this._caseReturnGroupFromZ) * returnProgress;
		}
		this._applyCaseSelectionLights(motion.linearProgress);
		this.innerPanels.setRevealProgress(
			motion.linearProgress,
			portfolioHubPlatesConfig.caseSelection?.innerPanel,
		);
		const columnProgress = getHubPlateCaseState().columnProgress;
		const columnActive = applyHubCaseColumnProgress(
			this._caseSelection,
			columnProgress,
			portfolioHubPlatesConfig.caseSelection,
		);
		if (columnActive) {
			this.innerPanels.setColumnProjectProgress(
				this._caseSelection.activeIndex,
				columnProgress,
				portfolioHubPlatesConfig.caseSelection?.columnPanels,
			);
		}
		this.innerPanels.update(nowSeconds);
		const exitFraction = Math.max(
			portfolioHubPlatesConfig.caseSelection?.contentExitFraction ?? 0.32,
			0.001,
		);
		const contentExitProgress = easeInOutCubic(clamp01(motion.linearProgress / exitFraction));
		const contentAlpha = this._caseSelectionContentFromAlpha * (1 - contentExitProgress);
		if (this._caseSelectionContentProjectIndex >= 0 && contentAlpha > 0.001) {
			this._syncFocusPlateLogos(
				this._caseSelectionContentProjectIndex,
				contentAlpha,
				{
					partLinear: motion.returning
						? 1 - contentExitProgress
						: this._caseSelectionContentPartLinear,
					entering: motion.returning,
				},
			);
		} else {
			this._syncFocusPlateLogos(-1, 0, { entering: false });
		}
		this._logoRevealAlpha = contentAlpha;
		if (this._directCaseEnterPlaying) {
			this._applyPlateOpacity(motion.progress);
			this.platesRenderer.setDecorMosaicProgress(1, portfolioHubPlatesConfig.caseSelection?.decorMosaic);
		} else {
			this.platesRenderer.setDecorMosaicProgress(motion.progress, portfolioHubPlatesConfig.caseSelection?.decorMosaic);
		}
		syncHubPlateCaseFromScene({
			open: !motion.returning,
			projectIndex: this._caseSelection.activeIndex,
			progress: motion.linearProgress,
		});

		if (motion.returning && motion.finished) {
			this._finishCaseReturn();
		} else if (this._directCaseEnterPlaying && motion.finished) {
			this._directCaseEnterPlaying = false;
			this._hubLifecycle = "active";
			this._applyPlateOpacity(1);
		}
	}

	_trySelectFocusedPlateOnClick(frame) {
		if (!this._canAcceptHubInteraction(frame) || !frame?.camera || !frame?.pointer) {
			return false;
		}

		const focusIndex = this.store.portfolioHubFocusIndex ?? -1;
		if (focusIndex < 0) {
			return false;
		}

		const hoverCfg = portfolioHubPlatesConfig.interaction?.hoverMotion;
		const minReveal = hoverCfg?.minRevealAlpha ?? 0.55;
		if (this._logoRevealAlpha < minReveal || this._gridEnterProgress < 1 || this._gridExitActive) {
			return false;
		}

		this._raycastPlateHover(frame, focusIndex);
		if (!this._plateHovered) {
			return false;
		}

		const project = this.projects[focusIndex];
		if (!project?.path) {
			return false;
		}

		return this._beginCaseSelection(focusIndex, frame.camera);
	}

	/** pointer.y → rotX, pointer.x → rotY; сглаживание поверх gridRotation. @returns {boolean} changed */
	_updateCursorGridTilt(delta, pointer, frame = null) {
		const cfg = portfolioHubPlatesConfig.interaction?.cursorGridTilt;
		const canTilt = cfg?.enabled !== false && cfg && this._canAcceptHubInteraction(frame) && this._gridEnterProgress >= 1 && !this._gridExitActive && !this._carouselEnterPending;

		// Left menu / chrome sets pointerBlocked → target 0, but still ease back.
		// Hard-zero on !canTilt snapped the hub when hovering the menu.
		const targetX = canTilt ? pointer.y * cfg.rotXRange : 0;
		const targetY = canTilt ? pointer.x * cfg.rotYRange : 0;
		const smooth = Math.max(cfg?.smoothDuration ?? 0.22, 0.001);
		const t = 1 - Math.exp(-delta / smooth);

		const prevX = this._cursorTiltRotX;
		const prevY = this._cursorTiltRotY;
		this._cursorTiltRotX += (targetX - this._cursorTiltRotX) * t;
		this._cursorTiltRotY += (targetY - this._cursorTiltRotY) * t;

		if (Math.abs(this._cursorTiltRotX) < 0.0001 && Math.abs(this._cursorTiltRotY) < 0.0001 && Math.abs(targetX) < 0.0001 && Math.abs(targetY) < 0.0001) {
			this._cursorTiltRotX = 0;
			this._cursorTiltRotY = 0;
		}

		return Math.abs(this._cursorTiltRotX - prevX) > 0.00005 || Math.abs(this._cursorTiltRotY - prevY) > 0.00005;
	}

	_updateCursorParallax(delta, pointer, frame = null) {
		const cfg = portfolioHubPlatesConfig.interaction?.cursorParallax;
		const canUseParallax = this._caseSelection.active || this._canAcceptHubInteraction(frame);
		const canMove =
			cfg?.enabled !== false &&
			cfg &&
			!this._freeCamera?.enabled &&
			canUseParallax &&
			this._gridEnterProgress >= 1 &&
			!this._gridExitActive &&
			!this._carouselEnterPending;
		const pointerX = THREE.MathUtils.clamp(pointer.x, -1, 1);
		const pointerY = THREE.MathUtils.clamp(pointer.y, -1, 1);
		const targetYaw = canMove ? pointerX * (cfg.orbitYawDeg ?? 0) : 0;
		const targetPitch = canMove ? -pointerY * (cfg.orbitPitchDeg ?? 0) : 0;
		const smooth = Math.max(cfg?.smoothDuration ?? 0.4, 0.001);
		const t = 1 - Math.exp(-delta / smooth);
		const prevYaw = this._cursorParallaxYaw;
		const prevPitch = this._cursorParallaxPitch;

		this._cursorParallaxYaw += (targetYaw - this._cursorParallaxYaw) * t;
		this._cursorParallaxPitch += (targetPitch - this._cursorParallaxPitch) * t;

		if (
			Math.abs(this._cursorParallaxYaw) < 0.0001 &&
			Math.abs(this._cursorParallaxPitch) < 0.0001 &&
			Math.abs(targetYaw) < 0.0001 &&
			Math.abs(targetPitch) < 0.0001
		) {
			this._cursorParallaxYaw = 0;
			this._cursorParallaxPitch = 0;
		}

		return (
			Math.abs(this._cursorParallaxYaw - prevYaw) > 0.00005 ||
			Math.abs(this._cursorParallaxPitch - prevPitch) > 0.00005
		);
	}

	_applyCursorCameraParallax(camera) {
		if (!camera || this._freeCamera?.enabled) {
			return;
		}

		const cfg = portfolioHubPlatesConfig.interaction?.cursorParallax;
		const yaw = THREE.MathUtils.degToRad(this._cursorParallaxYaw);
		const pitch = THREE.MathUtils.degToRad(this._cursorParallaxPitch);
		if (Math.abs(yaw) < 0.000001 && Math.abs(pitch) < 0.000001) {
			return;
		}

		const pivotDistance = Math.max(cfg?.pivotDistance ?? 5.5, 0.001);
		this._parallaxBaseForward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
		this._parallaxCameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
		this._parallaxCameraUp.set(0, 1, 0);
		this._parallaxPivot.copy(camera.position).addScaledVector(this._parallaxBaseForward, pivotDistance);
		this._parallaxOrbitOffset.copy(camera.position).sub(this._parallaxPivot);

		this._parallaxYawRotation.setFromAxisAngle(this._parallaxCameraUp, yaw);
		this._parallaxOrbitOffset.applyQuaternion(this._parallaxYawRotation);
		this._parallaxCameraRight.applyQuaternion(this._parallaxYawRotation).normalize();

		this._parallaxPitchRotation.setFromAxisAngle(this._parallaxCameraRight, pitch);
		this._parallaxOrbitOffset.applyQuaternion(this._parallaxPitchRotation);
		camera.position.copy(this._parallaxPivot).add(this._parallaxOrbitOffset);

		this._parallaxNewForward.copy(this._parallaxPivot).sub(camera.position).normalize();
		this._parallaxLookRotation.setFromUnitVectors(this._parallaxBaseForward, this._parallaxNewForward);
		camera.quaternion.premultiply(this._parallaxLookRotation).normalize();
		camera.updateMatrixWorld();
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
			flatIndex: getProjectPlateFlatIndex(focusIndex, this.projects.length),
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
		const focusIndex = this.store.portfolioHubFocusIndex ?? -1;
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
		if (this._caseSelection.active) {
			return;
		}

		const timing = portfolioHubPlatesConfig.interaction;
		const slideX = timing.plateSlideX;
		const now = performance.now() / 1000;
		const storeTarget = this.store.portfolioHubFocusIndex ?? -1;
		const enterPlateGate = timing.gridEnterStartPlateFraction ?? timing.gridStartPlateFraction ?? 0.4;
		const logosAllowed = !this._gridExitActive && (this._gridEnterProgress >= 1 || this._gridEnterProgress >= enterPlateGate);

		const visuals = advanceHubMenuAnim(this._hubAnim, storeTarget, now, timing, this._gridSlideForTarget, logosAllowed);

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
			if (targetId === this.sceneId && this._hubLifecycle === "dormant") {
				// Fallback if mix-target prepare did not run — dormant plates are opacity 0.
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

		// Dormant: plates opacity 0 — skip tilt/hover/enter. Mix-target prepare
		// leaves lifecycle active so InstancedMesh stays warm during hex wipe.
		if (this._hubLifecycle === "dormant") {
			return;
		}

		if (this.showHub && this.root.visible) {
			const nowSeconds = performance.now() / 1000;
			const pointer = frame?.pointer ?? { x: 0, y: 0 };
			const tiltChanged = this._updateCursorGridTilt(_delta, pointer, frame);
			this._updateCursorParallax(_delta, pointer, frame);

			if ((this.isHubPath(this._routeDisplayedPage) || this.isCasePath(this._routeDisplayedPage)) && frame?.camera) {
				this._freeCamera?.update(_delta, frame.camera);
			}

			if (frame?.camera) {
				this.applyCamera(frame.camera);
			}

			this._updateDevLightHelpers();
			this._updatePlateElementHover(_delta, frame);
			this._updateInnerPanelGalleryHover(frame);

			if (this._pointerClickPending) {
				this._pointerClickPending = false;
				if (this._caseSelection.active) {
					this.innerPanels.trySelectGalleryAtPointer(
						frame?.camera,
						frame?.pointer,
						nowSeconds,
					);
				} else {
					const canPickProjectsList = this._canAcceptHubInteraction(frame) && this.isHubPath(this._routeDisplayedPage) && (this._lastHudTitleVisibility ?? 0) > 0.001;
					if (!canPickProjectsList) {
						this.screenTitle.clearProjectsPointerHit?.();
					} else {
						const projectIndex = this.screenTitle.takeProjectSelectionOnClick?.() ?? -1;
						if (projectIndex >= 0) {
							this._beginCaseSelection(projectIndex, frame?.camera);
						} else {
							this._trySelectFocusedPlateOnClick(frame);
						}
					}
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

			this._syncRequestedCaseSelection();
			this._syncCaseSelectionToRoute(frame?.camera);
			this._updateCaseSelection(nowSeconds);

			if (frame?.camera) {
				this.screenTitle.update(frame);
			}
			this._syncScreenTitleVisibility();
		}
	}

	dispose() {
		this.store.cursor.screenGalleryHovered = false;
		this.store.cursor.screenGalleryDragging = false;
		this.store.cursor.caseNavHovered = false;
		this._clearHubEnterDelayTimer();
		this._mixTargetPrepared = false;
		this._lightHelpersVisible = false;
		this._syncLightHelpers();
		this._portfolioLocaleSwitch?.dispose();
		this._portfolioLocaleSwitch = null;
		this._freeCamera?.dispose();
		this._freeCamera = null;
		this.centerPlateLogos.dispose();
		this.plateProjectLabels.dispose();
		this.plateDetailsButtons.dispose();
		this.innerPanels.dispose();
		this.screenTitle.dispose();
		this.platesRenderer.dispose();
		this.sharedPlateMaterial = null;
		this.plates = [];
		this._plateByProjectIndex.clear();
		this.threeScene.fog = null;
	}
}
