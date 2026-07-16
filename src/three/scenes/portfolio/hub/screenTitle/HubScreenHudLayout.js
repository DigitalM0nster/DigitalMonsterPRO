import * as THREE from "three";
import { store } from "@/store.jsx";
import { requestPortfolioCaseNavigation } from "../../../../../utils/portfolioHubNavigate.js";
import { commitPortfolioHubFocusIndex } from "../../../../../utils/portfolioHubBackground.js";
import { projectsData } from "../projectsData.js";
import { portfolioHubPlatesConfig } from "../portfolioHubConfig.js";
import { normalizeHubScreenHudConfig } from "./hubScreenTextConfig.js";
import { HubScreenProjectsColumn } from "./HubScreenProjectsColumn.js";
import { HubScreenTextColumn } from "./HubScreenTextColumn.js";
import { logPortfolioActiveDebug, resetPortfolioActiveDebug } from "./portfolioActiveDebug.js";

/** Змейка сразу; сдвиг плиты / звук — после паузы на пункте (мс). */
const PLATE_FOCUS_DEBOUNCE_MS = 100;

/**
 * HUD-хаб: слева — тексты из конфига, справа — список проектов.
 * Список: enter/exit по роуту; active держится до другого проекта или ухода со страницы.
 */
export class HubScreenHudLayout {
	constructor(parent) {
		this.parent = parent;
		this.root = new THREE.Group();
		this.root.name = "hubScreenHud";
		this.leftGroup = new THREE.Group();
		this.leftGroup.name = "hubScreenHudLeft";
		this.rightGroup = new THREE.Group();
		this.rightGroup.name = "hubScreenHudProjects";
		this.root.add(this.leftGroup, this.rightGroup);

		this.leftColumn = new HubScreenTextColumn(this.leftGroup, "left");
		this.projectsColumn = new HubScreenProjectsColumn(this.rightGroup);

		this.hudCfg = null;
		this.baseOpacity = 1;
		this._visibilityMultiplier = 0;
		this._worldPosition = new THREE.Vector3();
		this._projectsEnterPending = false;
		this._projectsIntroExpectHidden = false;
		this._textHoverRaycaster = new THREE.Raycaster();
		this._textHoverPointer = new THREE.Vector2();
		this._projectsHoverLocalPoint = new THREE.Vector3();
		/** Индекс под курсором (для клика). */
		this._pointerHitIndex = -1;
		/** Raycast списка — только при сдвиге pointer (как hover плиты). */
		this._lastProjectsHoverPointerX = Number.NaN;
		this._lastProjectsHoverPointerY = Number.NaN;
		this._lastProjectsHoverCanPick = false;
		this._projectsHoverNeedsRaycast = true;
		/** Выбранный hover-проект — держится, пока не сменится или не уйдём с /portfolio. */
		this._activeProjectIndex = -1;
		this._projectsSingleActivePending = false;
		this._plateFocusDebounceTimer = null;
		/** Индекс для отложенного commitPortfolioHubFocusIndex (плита + звук). */
		this._pendingPlateFocusIndex = -1;
		this.parent?.add(this.root);
	}

	_applyColumnOffsets() {
		const leftOffset = this.hudCfg?.left?.offset ?? [0, 0, 0];
		const projectsOffset = this.hudCfg?.projects?.offset ?? [5.8, 0, 0];
		this.leftGroup.position.set(leftOffset[0], leftOffset[1], leftOffset[2]);
		this.rightGroup.position.set(projectsOffset[0], projectsOffset[1], projectsOffset[2]);
	}

	_applyVisibility() {
		const stackAlpha = this.baseOpacity * this._visibilityMultiplier;
		const hasContent =
			this.leftColumn.layers.length > 0 ||
			(this.hudCfg?.projects?.enabled !== false && this.projectsColumn.layers.length > 0);
		this.root.visible = stackAlpha > 0.001 && hasContent;

		this.leftColumn.setStackVisibility(stackAlpha);
		this.projectsColumn.setStackVisibility(stackAlpha);
	}

	/** Enter-змейка списка проектов (вместе с grid enter на /portfolio). */
	playProjectsEnter() {
		if (this.hudCfg?.projects?.enabled === false || this.projectsColumn.layers.length === 0) {
			return false;
		}

		resetPortfolioActiveDebug({ itemCount: this.projectsColumn.layers.length });
		this._projectsSingleActivePending = true;
		this._activeProjectIndex = -1;
		this.projectsColumn.setActiveProjectIndex(-1, { skipHoverGlitch: true });
		// Не сбрасывать focus в -1: PortfolioHubScene уже стартовал выезд/логотип первой плиты.
		if ((store.portfolioHubFocusIndex ?? -1) < 0) {
			commitPortfolioHubFocusIndex(store, 0);
		}
		this._projectsIntroExpectHidden = true;
		this.projectsColumn.playEnterGlitch({
			onComplete: () => {
				logPortfolioActiveDebug("INTRO_COMPLETE_CALLBACK", {
					pending: this._projectsSingleActivePending,
					activeIndex: this._activeProjectIndex,
				});
				if (!this._projectsSingleActivePending) {
					return;
				}
				this._projectsSingleActivePending = false;
				this._commitSingleActiveProjectAfterIntro();
			},
		});
		// HUD visibility=1 только после prepareAppear на canvas (следующий microtask).
		queueMicrotask(() => {
			this.clearProjectsIntroExpectHidden();
		});
		return true;
	}

	playProjectsExitGlitch() {
		this._projectsSingleActivePending = false;
		this.clearActiveProject();
		this.projectsColumn.playExitGlitch();
	}

	stashProjectsHiddenForDormant() {
		this._projectsSingleActivePending = false;
		this.clearActiveProject();
		this._projectsIntroExpectHidden = true;
		this.projectsColumn.stashLayersHiddenForDormant();
	}

	clearActiveProject() {
		this._clearPlateFocusDebounceTimer();
		this._activeProjectIndex = -1;
		this._pointerHitIndex = -1;
		this._pendingPlateFocusIndex = -1;
		this.projectsColumn.clearActiveProject();
		commitPortfolioHubFocusIndex(store, -1);
	}

	_clearPlateFocusDebounceTimer() {
		if (this._plateFocusDebounceTimer) {
			clearTimeout(this._plateFocusDebounceTimer);
			this._plateFocusDebounceTimer = null;
		}
	}

	/** Плита / логотип / звук — в store только после debounce. */
	_flushPlateFocusIndex() {
		const next = this._pendingPlateFocusIndex ?? -1;
		if ((store.portfolioHubFocusIndex ?? -1) === next) {
			return;
		}
		logPortfolioActiveDebug("PLATE_FOCUS_COMMIT", {
			from: store.portfolioHubFocusIndex ?? -1,
			to: next,
		});
		commitPortfolioHubFocusIndex(store, next);
	}

	_schedulePlateFocusDebounce() {
		this._clearPlateFocusDebounceTimer();
		this._plateFocusDebounceTimer = setTimeout(() => {
			this._plateFocusDebounceTimer = null;
			this._flushPlateFocusIndex();
		}, PLATE_FOCUS_DEBOUNCE_MS);
	}

	/** Список + змейка сразу; анимация плиты — через PLATE_FOCUS_DEBOUNCE_MS. */
	_applyActiveProjectIndex(
		index = -1,
		{ skipHoverGlitch = false, immediatePlate = false, immediateOpacity = false, reason = "unknown" } = {},
	) {
		const next = index ?? -1;
		if (next === this._activeProjectIndex) {
			return;
		}

		logPortfolioActiveDebug("ACTIVE_APPLY", {
			reason,
			from: this._activeProjectIndex,
			to: next,
			projectId: projectsData[next]?.id ?? null,
			introPending: this._projectsSingleActivePending,
			immediatePlate,
			immediateOpacity,
		});
		this._activeProjectIndex = next;
		this._pendingPlateFocusIndex = next;
		this.projectsColumn.setActiveProjectIndex(next, { skipHoverGlitch, immediateOpacity });

		if (immediatePlate) {
			this._clearPlateFocusDebounceTimer();
			this._flushPlateFocusIndex();
			return;
		}

		this._schedulePlateFocusDebounce();
	}

	_commitSingleActiveProjectAfterIntro() {
		if (this.projectsColumn.layers.length === 0) {
			return;
		}

		if (this._activeProjectIndex < 0) {
			this._applyActiveProjectIndex(0, {
				skipHoverGlitch: true,
				immediatePlate: true,
				immediateOpacity: false,
				reason: "intro-default",
			});
		}
	}

	isProjectsIntroExpectHidden() {
		return this._projectsIntroExpectHidden;
	}

	clearProjectsIntroExpectHidden() {
		this._projectsIntroExpectHidden = false;
	}

	isProjectsIntroGlitchActive() {
		return this.projectsColumn.isProjectsIntroGlitchActive?.() ?? false;
	}

	requestProjectsIntro() {
		this._projectsEnterPending = true;
		return this._tryProjectsEnter();
	}

	_tryProjectsEnter() {
		if (!this._projectsEnterPending) {
			return false;
		}

		if (this.playProjectsEnter()) {
			this._projectsEnterPending = false;
			return true;
		}

		return false;
	}

	_updateProjectsPointerHover(frame) {
		const canPick =
			this.root.visible &&
			this._visibilityMultiplier > 0.001 &&
			this.projectsColumn.layers.length > 0;

		if (!canPick || !frame?.camera || !frame?.pointer) {
			store.cursor.projectListHovered = false;
			if (this._pointerHitIndex !== -1) {
				this._pointerHitIndex = -1;
				this.projectsColumn.setPointerHitIndex(-1);
			}
			this._lastProjectsHoverCanPick = false;
			this._projectsHoverNeedsRaycast = true;
			return;
		}

		const pointerChanged =
			frame.pointer.x !== this._lastProjectsHoverPointerX ||
			frame.pointer.y !== this._lastProjectsHoverPointerY;
		const canPickChanged = canPick !== this._lastProjectsHoverCanPick;

		if (!pointerChanged && !canPickChanged && !this._projectsHoverNeedsRaycast) {
			return;
		}

		this._textHoverPointer.set(frame.pointer.x, frame.pointer.y);
		this._textHoverRaycaster.setFromCamera(this._textHoverPointer, frame.camera);

		const meshes = this.projectsColumn.layers.map((layer) => layer.mesh).filter((mesh) => mesh?.visible);
		const hits = this._textHoverRaycaster.intersectObjects(meshes, true);

		let hitIndex = -1;
		if (hits.length > 0) {
			this._projectsHoverLocalPoint.copy(hits[0].point);
			this.rightGroup.worldToLocal(this._projectsHoverLocalPoint);
			hitIndex = this.projectsColumn.resolveProjectIndexAtLocalPoint(
				this._projectsHoverLocalPoint.x,
				this._projectsHoverLocalPoint.y,
			);
		}

		this._lastProjectsHoverPointerX = frame.pointer.x;
		this._lastProjectsHoverPointerY = frame.pointer.y;
		this._lastProjectsHoverCanPick = canPick;
		this._projectsHoverNeedsRaycast = false;

		if (hitIndex !== this._pointerHitIndex) {
			logPortfolioActiveDebug("POINTER_HIT_CHANGED", {
				from: this._pointerHitIndex,
				to: hitIndex,
				projectId: projectsData[hitIndex]?.id ?? null,
			});
			this._pointerHitIndex = hitIndex;
			store.cursor.projectListHovered = hitIndex >= 0;
			this.projectsColumn.setPointerHitIndex(hitIndex);
		}

		if (hitIndex >= 0 && hitIndex !== this._activeProjectIndex) {
			this._projectsSingleActivePending = false;
			this._applyActiveProjectIndex(hitIndex, { immediatePlate: true, reason: "hover" });
		}
	}

	tryOpenProjectOnClick() {
		if (this._visibilityMultiplier <= 0.001 || !this.root.visible || this._pointerHitIndex < 0) {
			return false;
		}

		const project = projectsData[this._pointerHitIndex];
		if (!project?.path) {
			return false;
		}

		requestPortfolioCaseNavigation(project.path);
		return true;
	}

	/**
	 * HUD в локальном offset камеры — фиксированное расстояние при sceneProgress.
	 * Вызывать после applySceneProgressToCamera (в т.ч. прямо перед render слоя).
	 */
	syncRootToCamera(camera) {
		if (!camera || !this.hudCfg) {
			return;
		}

		this._worldPosition.copy(this.hudCfg.cameraOffset);
		camera.localToWorld(this._worldPosition);
		this.root.position.copy(this._worldPosition);
		this.root.lookAt(camera.position);
	}

	update(frame) {
		const camera = frame?.camera;
		if (!camera || !this.hudCfg) {
			return;
		}

		this.syncRootToCamera(camera);
		this._updateProjectsPointerHover(frame);
		this.projectsColumn.updateAnimations(performance.now());
	}

	async init(cfg = portfolioHubPlatesConfig, { glitchIntro = true } = {}) {
		this.hudCfg = normalizeHubScreenHudConfig(cfg);
		this.baseOpacity = this.hudCfg.opacity;

		this.leftColumn.dispose();
		this.projectsColumn.dispose();

		if (!this.hudCfg.enabled) {
			this.root.visible = false;
			return;
		}

		await this.leftColumn.build(this.hudCfg.left);

		if (this.hudCfg.projects.enabled !== false) {
			await this.projectsColumn.build(this.hudCfg.projects, { glitchIntro });
			this._projectsHoverNeedsRaycast = true;
		}

		this._applyColumnOffsets();
		this._applyVisibility();
		this._tryProjectsEnter();

		return this;
	}

	applyFromConfig(cfg = portfolioHubPlatesConfig, options = {}) {
		return this.init(cfg, options);
	}

	patchProjectsLayerDefaults(partial = {}) {
		this.projectsColumn.patchLayerDefaults(partial);
	}

	previewGlowOnFocusedLayer(layerIndex = 0) {
		const safeIndex = Math.min(Math.max(layerIndex ?? 0, 0), this.projectsColumn.layers.length - 1);
		this.projectsColumn.startGlowPreview(safeIndex);
	}

	applyProjectsSnakeGlowConfig(cfg) {
		this.projectsColumn.applySnakeGlowConfig(cfg);
	}

	clearGlowPreview() {
		this.projectsColumn.clearGlowPreview();
	}

	refreshLayoutFromConfig(cfg = portfolioHubPlatesConfig) {
		if (!this.hudCfg) {
			return;
		}

		const next = normalizeHubScreenHudConfig(cfg);
		this.hudCfg.cameraOffset.copy(next.cameraOffset);
		this.baseOpacity = next.opacity;
		this.hudCfg.opacity = next.opacity;

		if (next.projects) {
			this.hudCfg.projects.offset = [...next.projects.offset];
			this.hudCfg.projects.lineGap = next.projects.lineGap;
			this.projectsColumn.relayout(next.projects.lineGap);
		}

		this._applyColumnOffsets();
		this._applyVisibility();
	}

	clearProjectsPointerHit() {
		store.cursor.projectListHovered = false;
		if (this._pointerHitIndex === -1) {
			return;
		}

		this._pointerHitIndex = -1;
		this.projectsColumn.setPointerHitIndex(-1);
		this._projectsHoverNeedsRaycast = true;
	}

	setVisibility(multiplier = 0) {
		const next = Math.max(0, Math.min(1, multiplier));
		if (next <= 0.001) {
			this.clearProjectsPointerHit();
		}
		this._visibilityMultiplier = next;
		this._applyVisibility();
	}

	dispose() {
		store.cursor.projectListHovered = false;
		this._projectsSingleActivePending = false;
		this._clearPlateFocusDebounceTimer();
		this.leftColumn.dispose();
		this.projectsColumn.dispose();
		this.parent?.remove(this.root);
	}
}
