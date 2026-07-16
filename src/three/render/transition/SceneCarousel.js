import { hexGridOverlayDefaults } from "../overlay/hexGridOverlayConfig.js";
import { logCarouselProgressCommit, logCarouselProgressFrame, logCarouselProgressWheel } from "@/three/dev/carouselProgressTargetLogger.js";
import {
	carouselClickTransitionConfig,
	easeCarouselClickProgress,
} from "./carouselClickTransitionConfig.js";
import {
	clampSceneProgress,
	getCarouselSceneRole,
	sceneProgressSnapForRoleChange,
	sceneProgressTargetForRole,
	sceneProgressTargetForRoleChange,
} from "./sceneCarouselSceneProgress.js";

/** Бесконечное кольцо: previous ← current → next + scroll progress / progressTarget. */
export const CAROUSEL_SCENE_IDS = ["home", "portfolioHub", "about", "contacts"];

/** Скролл вперёд: target не выше 1.5 (полсегмента «вперёд» до коммита). */
export const CAROUSEL_PROGRESS_TARGET_MAX = 1.5;
/** Скролл назад: target не ниже -0.5. */
export const CAROUSEL_PROGRESS_TARGET_MIN = -0.5;
/**
 * Если progressTarget ниже этого порога — плавно возвращается к 0 (без скролла).
 */
export const CAROUSEL_PROGRESS_TARGET_RETURN_THRESHOLD = 0.5;
/** Скорость возврата progressTarget → 0 (exp decay, 1/с). Меньше = медленнее. */
export const CAROUSEL_PROGRESS_TARGET_RETURN_SMOOTH = 1.5;
/**
 * Если progressTarget не ниже этого порога — плавно возвращается к 1 (без скролла).
 */
export const CAROUSEL_PROGRESS_TARGET_ADVANCE_THRESHOLD = 0.5;
/** Скорость возврата progressTarget → 1 (exp decay, 1/с). Меньше = медленнее. */
export const CAROUSEL_PROGRESS_TARGET_ADVANCE_SMOOTH = 1.5;
/** Финальная зона дотягивания progressTarget → 0 (≤ zone). */
export const CAROUSEL_PROGRESS_TARGET_FINAL_ZONE = 0.02;
/** ×15 rest progressTarget → 1, когда target > этого порога. */
export const CAROUSEL_PROGRESS_TARGET_ADVANCE_FINAL_THRESHOLD = 0.92;
/** Ускорение spring rest progressTarget в финальной зоне. */
export const CAROUSEL_PROGRESS_TARGET_FINAL_SMOOTH_MUL = 15;
/** Скорость догоняния progress → progressTarget (exp decay, 1/с). */
export const CAROUSEL_PROGRESS_SMOOTH = 4;
/** ×2 догоняние progress, когда progress > этого порога. */
export const CAROUSEL_PROGRESS_CHASE_FINAL_THRESHOLD = 0.96;
export const CAROUSEL_PROGRESS_CHASE_FINAL_SMOOTH_MUL = 2;
/** Скорость догоняния sceneProgress → sceneProgressTarget. */
export const CAROUSEL_SCENE_PROGRESS_SMOOTH = 1;

/** Конец сегмента вперёд: коммит при progress >= 1 (не > 1). */
export const CAROUSEL_PROGRESS_SEGMENT_END = 1;
/** Начало сегмента назад: коммит при progress <= 0, если шли в минус (idle 0,0 — нет). */
export const CAROUSEL_PROGRESS_SEGMENT_START = 0;
/** Spring не доходит до ровно 1/0 — коммит и snap по epsilon (toFixed(4) в debug врёт). */
export const CAROUSEL_PROGRESS_COMMIT_EPS = 1e-4;
/** Автодогонка progress → 1: добить progress до коммита, если target уже на конце сегмента. */
export const CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE = 0.005;

export const SCENE_ID_TO_PAGE = {
	home: "/",
	portfolioHub: "/portfolio",
	about: "/about",
	contacts: "/contacts",
};

export function pageToCarouselSceneId(page) {
	const normalized = String(page ?? "/").replace(/\/+$/, "") || "/";
	if (normalized === "/" || normalized === "") {
		return "home";
	}
	if (normalized === "/portfolio") {
		return "portfolioHub";
	}
	if (normalized.startsWith("/about")) {
		return "about";
	}
	if (normalized.startsWith("/contacts")) {
		return "contacts";
	}
	return null;
}

export function isCarouselRoutePage(page) {
	return pageToCarouselSceneId(page) !== null;
}

/** @deprecated — используй isCarouselRoutePage */
export function isCarouselHubPage(page) {
	return isCarouselRoutePage(page);
}

function nextInCycle(sceneId) {
	const index = CAROUSEL_SCENE_IDS.indexOf(sceneId);
	if (index < 0) {
		return CAROUSEL_SCENE_IDS[0];
	}
	return CAROUSEL_SCENE_IDS[(index + 1) % CAROUSEL_SCENE_IDS.length];
}

function prevInCycle(sceneId) {
	const index = CAROUSEL_SCENE_IDS.indexOf(sceneId);
	if (index < 0) {
		return CAROUSEL_SCENE_IDS[0];
	}
	return CAROUSEL_SCENE_IDS[(index - 1 + CAROUSEL_SCENE_IDS.length) % CAROUSEL_SCENE_IDS.length];
}

function clampProgressTarget(value) {
	return Math.max(CAROUSEL_PROGRESS_TARGET_MIN, Math.min(CAROUSEL_PROGRESS_TARGET_MAX, value));
}

function createSceneProgressEntry(role, progressTarget) {
	const sceneProgressTarget = sceneProgressTargetForRole(role, progressTarget);
	const snap = sceneProgressSnapForRoleChange(role, "off");
	return {
		sceneProgress: snap ?? sceneProgressTarget,
		sceneProgressTarget,
		role,
	};
}

/**
 * Карусель сцен: progressTarget от скролла, progress догоняет.
 * У каждой сцены: sceneProgressTarget от роли + progressTarget, sceneProgress догоняет.
 */
export class SceneCarousel {
	constructor() {
		this.currentId = "home";
		this.previousId = prevInCycle("home");
		this.nextId = nextInCycle("home");
		this.progress = 0;
		this.progressTarget = 0;
		// Wheel intent that crossed the Portfolio/Contacts boundary into About.
		// It must survive the outer target's automatic rest while the visual
		// progress catches up, otherwise the inner scene starts with a dead zone.
		this._aboutBoundaryOverflowProgress = 0;
		/**
		 * Намерение последнего wheel: forward = вниз (→ next), backward = вверх (→ previous).
		 * Коммит сегмента только при совпадении intent и границы progress.
		 * @type {'forward' | 'backward' | null}
		 */
		this.scrollIntent = null;
		/** @type {Record<string, { sceneProgress: number, sceneProgressTarget: number, role: import('./sceneCarouselSceneProgress.js').CarouselSceneRole }>} */
		this._sceneProgressById = {};
		this._initSceneProgressStates();
		/** @type {((payload: { fromId: string, toId: string, direction: 'forward' | 'backward', boundaryOverflowProgress: number }) => void) | null} */
		this._onCommit = null;
		/** @type {((payload: { path: string }) => void) | null} */
		this._onHexNavigate = null;
		/** @type {((payload: { sourceId: string, targetId: string }) => void) | null} */
		this._onHexLifecycleStart = null;
		/** @type {((payload: { path: string, sceneId: string }) => void) | null} */
		this._onHexRouteConfirmed = null;
		/** @type {'idle' | 'settling' | 'enter' | 'awaitingRoute'} */
		this._clickPhase = "idle";
		/** @type {string | null} */
		this._hexTargetSceneId = null;
		/** @type {string | null} */
		this._hexTargetPath = null;
		/** @type {string | null} */
		this._hexMixSourceId = null;
		this._hexSourceSceneProgress = 0;
		this._clickEnterElapsed = 0;
		this._settleStartProgress = 0;
		this._settleEndProgress = 0;
		this._settleElapsed = 0;
	}

	isInteractionLocked() {
		return this._clickPhase !== "idle";
	}

	isHexNavigationActive() {
		return this._clickPhase !== "idle";
	}

	getHexNavigationPhase() {
		return this._clickPhase;
	}

	getHexTargetSceneId() {
		return this._hexTargetSceneId;
	}

	/** @deprecated */
	isPortfolioMixTransition() {
		return this.isHexNavigationActive();
	}

	/**
	 * Hex-переход между любыми сценами сайта (клик / меню / портфолио).
	 * @param {string} fromPath
	 * @param {string} toPath
	 * @param {string} sourceSceneId
	 * @param {string} targetSceneId
	 * @returns {boolean}
	 */
	startHexNavigation(fromPath, toPath, sourceSceneId, targetSceneId) {
		if (!fromPath || !toPath || !sourceSceneId || !targetSceneId || this._clickPhase !== "idle") {
			return false;
		}

		if (sourceSceneId === targetSceneId) {
			return false;
		}

		this._hexTargetSceneId = targetSceneId;
		this._hexTargetPath = toPath;
		this.scrollIntent = null;

		const sourceInCarousel = CAROUSEL_SCENE_IDS.includes(sourceSceneId);
		const distanceFromStart = Math.abs(this.progress);
		const distanceFromEnd = Math.abs(1 - this.progress);
		const isBetweenEndpoints = sourceInCarousel
			&& distanceFromStart > CAROUSEL_PROGRESS_COMMIT_EPS
			&& distanceFromEnd > CAROUSEL_PROGRESS_COMMIT_EPS;

		if (isBetweenEndpoints) {
			this._clickPhase = "settling";
			this._settleStartProgress = this.progress;
			this._settleEndProgress = distanceFromStart <= distanceFromEnd ? 0 : 1;
			this._settleElapsed = 0;
			this.progressTarget = this._settleEndProgress;
			return true;
		}

		this._beginHexEnter(sourceSceneId);
		return true;
	}

	_beginHexEnter(sourceSceneId) {
		this._hexMixSourceId = sourceSceneId;
		// Freeze the source camera at the exact pose visible after scroll settling.
		this._hexSourceSceneProgress = CAROUSEL_SCENE_IDS.includes(sourceSceneId)
			? this.getSceneProgress(sourceSceneId)
			: 0;
		this._clickEnterElapsed = 0;
		this._clickPhase = "enter";
		this.progress = 0;
		this.progressTarget = 0;
		this._onHexLifecycleStart?.({ sourceId: sourceSceneId, targetId: this._hexTargetSceneId });
	}

	/** id кейса-цели для mix-preview во время enter. */
	getHexMixTargetSceneId() {
		if (this._clickPhase === "idle" || !this._hexTargetSceneId?.startsWith("case")) {
			return null;
		}

		return this._hexTargetSceneId;
	}

	/** @deprecated */
	getCaseMixPreviewSceneId() {
		return this.getHexMixTargetSceneId();
	}

	_cancelHexNavigation() {
		this._clickPhase = "idle";
		this._hexTargetSceneId = null;
		this._hexTargetPath = null;
		this._hexMixSourceId = null;
		this._hexSourceSceneProgress = 0;
		this._clickEnterElapsed = 0;
		this._settleElapsed = 0;
	}

	_updateHexSettling(delta) {
		if (this._clickPhase !== "settling") {
			return;
		}

		const duration = Math.max(1e-4, carouselClickTransitionConfig.resetDurationS);
		this._settleElapsed += delta;
		const linear = Math.min(1, this._settleElapsed / duration);
		const eased = 1 - Math.pow(1 - linear, 3);
		this.progress = this._settleStartProgress
			+ (this._settleEndProgress - this._settleStartProgress) * eased;
		this.progressTarget = this.progress;
		this._syncSettlingSceneProgresses();

		if (linear < 1) {
			return;
		}

		// The scroll is already revealing the route that was clicked. Its move to
		// progress=1 is the required hex transition, so do not start a second wipe
		// from the same scene to itself. Keep the completed frame until the route
		// and its enter lifecycle are confirmed.
		if (this._settleEndProgress === 1 && this._hexTargetSceneId === this.nextId) {
			this.progress = 1;
			this.progressTarget = 1;
			this._finishHexNavigation();
			return;
		}

		let settledSourceId = this.currentId;
		if (this._settleEndProgress === 1) {
			settledSourceId = this.nextId;
			this.previousId = this.currentId;
			this.currentId = settledSourceId;
			this.nextId = nextInCycle(settledSourceId);
		}

		this.progress = 0;
		this.progressTarget = 0;
		this._initSceneProgressStates();
		this._beginHexEnter(settledSourceId);
	}

	_syncSettlingSceneProgresses() {
		for (const sceneId of CAROUSEL_SCENE_IDS) {
			const state = this._sceneProgressById[sceneId];
			const role = getCarouselSceneRole(sceneId, this);
			state.role = role;
			state.sceneProgressTarget = sceneProgressTargetForRole(role, this.progress);
			state.sceneProgress = clampSceneProgress(state.sceneProgressTarget);
		}
	}

	_updateHexNavigation(delta) {
		if (this._clickPhase === "settling") {
			this._updateHexSettling(delta);
			return;
		}

		if (this._clickPhase !== "enter") {
			return;
		}

		const eps = CAROUSEL_PROGRESS_COMMIT_EPS;
		const duration = Math.max(1e-4, carouselClickTransitionConfig.enterDurationS);
		this._clickEnterElapsed += delta;
		const linear = Math.min(1, this._clickEnterElapsed / duration);
		const eased = easeCarouselClickProgress(linear);
		this.progress = eased;
		this.progressTarget = eased;

		if (linear >= 1 - eps) {
			this.progress = 1;
			this.progressTarget = 1;
			this._finishHexNavigation();
		}
	}

	/**
	 * Hex-клик: sceneProgress source/target как при wheel-сегменте, а не по старым слотам карусели.
	 * Иначе при portfolio→home home остаётся previous с target=1 и камера прыгает в конце.
	 */
	_updateHexSceneProgresses() {
		const sourceId = this._hexMixSourceId;
		const targetId = this._hexTargetSceneId;
		if (!sourceId || !targetId) {
			return false;
		}

		const sourceInCarousel = CAROUSEL_SCENE_IDS.includes(sourceId);
		const targetInCarousel = CAROUSEL_SCENE_IDS.includes(targetId);

		// Case/external → carousel: target already has its canonical camera pose.
		// It must not inherit global hex progress and then snap back to zero on route confirm.
		if (!sourceInCarousel && targetInCarousel) {
			for (const sceneId of CAROUSEL_SCENE_IDS) {
				const state = this._sceneProgressById[sceneId];
				state.role = sceneId === targetId ? "current" : "off";
				state.sceneProgress = 0;
				state.sceneProgressTarget = 0;
			}
			return true;
		}

		if (!sourceInCarousel || !targetInCarousel) {
			return false;
		}

		for (const sceneId of CAROUSEL_SCENE_IDS) {
			const state = this._sceneProgressById[sceneId];

			if (sceneId === sourceId) {
				state.role = "current";
				state.sceneProgress = clampSceneProgress(this._hexSourceSceneProgress);
				state.sceneProgressTarget = state.sceneProgress;
				continue;
			}

			if (sceneId === targetId) {
				state.role = "current";
				state.sceneProgress = 0;
				state.sceneProgressTarget = 0;
				continue;
			}

			state.role = "off";
			state.sceneProgress = 0;
			state.sceneProgressTarget = 0;
		}

		return true;
	}

	_finishHexNavigation() {
		const targetPath = this._hexTargetPath;

		// Keep the completed target frame until React and SceneManager confirm the route.
		this._clickPhase = "awaitingRoute";
		this.progress = 1;
		this.progressTarget = 1;

		if (targetPath) {
			this._onHexNavigate?.({ path: targetPath });
		}
	}

	confirmHexNavigationRoute(sceneId) {
		if (this._clickPhase !== "awaitingRoute" || sceneId !== this._hexTargetSceneId) {
			return false;
		}

		const targetId = this._hexTargetSceneId;
		const targetPath = this._hexTargetPath;
		this._cancelHexNavigation();
		this.progress = 0;
		this.progressTarget = 0;

		if (targetId && CAROUSEL_SCENE_IDS.includes(targetId)) {
			this.currentId = targetId;
			this.previousId = prevInCycle(targetId);
			this.nextId = nextInCycle(targetId);
			this._initSceneProgressStates();
		}

		if (targetPath && targetId) {
			this._onHexRouteConfirmed?.({ path: targetPath, sceneId: targetId });
		}

		return true;
	}

	setOnHexNavigate(callback) {
		this._onHexNavigate = callback;
	}

	setOnHexLifecycleStart(callback) {
		this._onHexLifecycleStart = callback;
	}

	setOnHexRouteConfirmed(callback) {
		this._onHexRouteConfirmed = callback;
	}

	setOnCommit(callback) {
		this._onCommit = callback;
	}

	_initSceneProgressStates() {
		for (const sceneId of CAROUSEL_SCENE_IDS) {
			const role = getCarouselSceneRole(sceneId, this);
			this._sceneProgressById[sceneId] = createSceneProgressEntry(role, this.progressTarget);
		}
	}

	/** Сдвиг progressTarget от колёсика (в единицах сегмента 0…1). */
	addScrollDelta(delta) {
		if (this.isInteractionLocked()) {
			return;
		}

		if (import.meta.env.DEV && hexGridOverlayDefaults._devOverrideProgress) {
			hexGridOverlayDefaults._devOverrideProgress = false;
		}

		const previousTarget = this.progressTarget;
		const unboundedTarget = previousTarget + delta;
		if (this.currentId === "portfolioHub" && this.nextId === "about" && delta > 0) {
			const addedOverflow = Math.max(0, unboundedTarget - 1) - Math.max(0, previousTarget - 1);
			this._aboutBoundaryOverflowProgress = Math.min(
				CAROUSEL_PROGRESS_TARGET_MAX - 1,
				Math.max(0, this._aboutBoundaryOverflowProgress + Math.max(0, addedOverflow)),
			);
		} else if (this.currentId === "contacts" && this.previousId === "about" && delta < 0) {
			const addedOverflow = Math.min(0, unboundedTarget) - Math.min(0, previousTarget);
			this._aboutBoundaryOverflowProgress = Math.max(
				CAROUSEL_PROGRESS_TARGET_MIN,
				Math.min(0, this._aboutBoundaryOverflowProgress + Math.min(0, addedOverflow)),
			);
		} else {
			this._aboutBoundaryOverflowProgress = 0;
		}

		if (delta > 0) {
			this.scrollIntent = "forward";
		} else if (delta < 0) {
			this.scrollIntent = "backward";
		}

		this.progressTarget = clampProgressTarget(this.progressTarget + delta);
		logCarouselProgressWheel(this, delta);
	}

	/** Dev / ручная подстановка target (G-панель). */
	setProgressTarget(value) {
		this.scrollIntent = null;
		this._aboutBoundaryOverflowProgress = 0;
		this.progressTarget = clampProgressTarget(value);
	}

	/** Dev: мгновенно выставить progress и target. */
	setProgressState(progress, progressTarget = progress) {
		this.scrollIntent = null;
		this._aboutBoundaryOverflowProgress = 0;
		this.progress = progress;
		this.progressTarget = clampProgressTarget(progressTarget);
		this._initSceneProgressStates();
	}

	_clearScrollIntentIfAtRest() {
		const eps = CAROUSEL_PROGRESS_COMMIT_EPS;
		if (Math.abs(this.progress) <= eps && Math.abs(this.progressTarget) <= eps) {
			this.scrollIntent = null;
			this._aboutBoundaryOverflowProgress = 0;
		}
	}

	/** Коммит вперёд: progress достиг конца сегмента (в т.ч. после автодогонки target → 1). */
	_shouldCommitForward() {
		const eps = CAROUSEL_PROGRESS_COMMIT_EPS;
		return this.progress >= CAROUSEL_PROGRESS_SEGMENT_END - eps;
	}

	_shouldCommitBackward(prevProgress) {
		if (this.scrollIntent !== "backward") {
			return false;
		}

		const start = CAROUSEL_PROGRESS_SEGMENT_START;
		const eps = CAROUSEL_PROGRESS_COMMIT_EPS;

		if (this.progress < start - eps) {
			return true;
		}

		if (this.progress <= start + eps && prevProgress < start - eps) {
			return true;
		}

		return this.progressTarget <= start + eps && this.progress <= this.progressTarget + eps && prevProgress < start - eps;
	}

	/** progressTarget на 1 — дотянуть progress до коммита (spring не доходит до ровно 1). */
	_snapProgressForForwardCommit() {
		const eps = CAROUSEL_PROGRESS_COMMIT_EPS;
		const end = CAROUSEL_PROGRESS_SEGMENT_END;

		if (this.progressTarget < end - eps) {
			return;
		}

		this.progressTarget = end;

		if (this.progress >= end - CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE) {
			this.progress = end;
		}
	}

	_snapProgressToRestTarget() {
		const eps = CAROUSEL_PROGRESS_COMMIT_EPS;

		if (Math.abs(this.progressTarget - CAROUSEL_PROGRESS_SEGMENT_END) < eps) {
			this.progressTarget = CAROUSEL_PROGRESS_SEGMENT_END;
			if (Math.abs(this.progress - this.progressTarget) < eps) {
				this.progress = this.progressTarget;
			}
			return;
		}

		if (Math.abs(this.progressTarget - CAROUSEL_PROGRESS_SEGMENT_START) < eps) {
			this.progressTarget = CAROUSEL_PROGRESS_SEGMENT_START;
			if (Math.abs(this.progress - this.progressTarget) < eps) {
				this.progress = this.progressTarget;
			}
		}
	}

	/**
	 * Каждый кадр: progressTarget → 0 (если < порога), progress → progressTarget, коммит, sceneProgress.
	 * @param {number} delta
	 */
	update(delta) {
		if (!Number.isFinite(delta) || delta <= 0) {
			return;
		}

		if (this._clickPhase !== "idle") {
			this._updateHexNavigation(delta);
			logCarouselProgressFrame(this, delta);
			this._updateSceneProgresses(delta);
			return;
		}

		this._applyProgressTargetRest(delta);

		const prevProgress = this.progress;
		const progressChaseMul = this._getProgressChaseSmoothMul();
		const t = 1 - Math.exp(-CAROUSEL_PROGRESS_SMOOTH * progressChaseMul * delta);
		this.progress += (this.progressTarget - this.progress) * t;
		this._snapProgressToRestTarget();
		this._snapProgressForForwardCommit();

		if (this._shouldCommitForward()) {
			this.progress = CAROUSEL_PROGRESS_SEGMENT_END;
			this._commitForward();
		} else if (this._shouldCommitBackward(prevProgress)) {
			this._commitBackward();
		} else {
			this._clearScrollIntentIfAtRest();
		}

		logCarouselProgressFrame(this, delta);

		this._updateSceneProgresses(delta);
	}

	/** ×2 догоняние progress → target в хвосте сегмента (progress > 0.96). */
	_getProgressChaseSmoothMul() {
		if (this.progress > CAROUSEL_PROGRESS_CHASE_FINAL_THRESHOLD) {
			return CAROUSEL_PROGRESS_CHASE_FINAL_SMOOTH_MUL;
		}

		return 1;
	}

	/** ×15 rest progressTarget → 1 (target > 0.92) и → 0 (target ≤ zone). */
	_getProgressTargetFinalSmoothMul() {
		const zone = CAROUSEL_PROGRESS_TARGET_FINAL_ZONE;
		const mul = CAROUSEL_PROGRESS_TARGET_FINAL_SMOOTH_MUL;
		const target = this.progressTarget;

		if (target > CAROUSEL_PROGRESS_TARGET_ADVANCE_FINAL_THRESHOLD && target >= CAROUSEL_PROGRESS_TARGET_ADVANCE_THRESHOLD) {
			return mul;
		}

		if (target <= zone && target < CAROUSEL_PROGRESS_TARGET_RETURN_THRESHOLD) {
			return mul;
		}

		return 1;
	}

	/** progressTarget вне «покоя» — плавно к 0 или к 1. */
	_applyProgressTargetRest(delta) {
		const finalMul = this._getProgressTargetFinalSmoothMul();

		if (this.progressTarget < CAROUSEL_PROGRESS_TARGET_RETURN_THRESHOLD) {
			const t = 1 - Math.exp(-CAROUSEL_PROGRESS_TARGET_RETURN_SMOOTH * finalMul * delta);
			this.progressTarget += (0 - this.progressTarget) * t;

			if (Math.abs(this.progressTarget) < 0.00005) {
				this.progressTarget = 0;
			}
			return;
		}

		if (this.progressTarget >= CAROUSEL_PROGRESS_TARGET_ADVANCE_THRESHOLD) {
			const t = 1 - Math.exp(-CAROUSEL_PROGRESS_TARGET_ADVANCE_SMOOTH * finalMul * delta);
			this.progressTarget += (1 - this.progressTarget) * t;

			if (Math.abs(this.progressTarget - 1) < 0.00005) {
				this.progressTarget = 1;
			}
		}
	}

	_updateSceneProgresses(delta) {
		// Settling writes exact scene progress values itself so camera motion follows
		// the pre-transition return curve without a second smoothing layer.
		if (this._clickPhase === "settling") {
			return;
		}

		// `_updateHexNavigation()` may switch `enter` to `awaitingRoute` earlier in
		// this same frame. Keep the completed target camera pose locked until the
		// displayed route confirms it; falling through to carousel roles here
		// produces a single frame rendered with the previous camera state.
		if (this._clickPhase !== "idle" && this._updateHexSceneProgresses()) {
			return;
		}

		const t = 1 - Math.exp(-CAROUSEL_SCENE_PROGRESS_SMOOTH * delta);

		for (const sceneId of CAROUSEL_SCENE_IDS) {
			const state = this._sceneProgressById[sceneId];
			const prevRole = state.role;
			const role = getCarouselSceneRole(sceneId, this);
			const snap = sceneProgressSnapForRoleChange(role, prevRole);
			const roleChanged = role !== prevRole;

			state.role = role;
			state.sceneProgressTarget = roleChanged
				? sceneProgressTargetForRoleChange(role, prevRole, this.progress, this.progressTarget)
				: sceneProgressTargetForRole(role, this.progressTarget);

			if (snap !== null) {
				state.sceneProgress = snap;
			}

			if (role === "off") {
				continue;
			}

			// previous: кадр snap без lerp; next/current — всегда догоняют target.
			if (snap === null) {
				state.sceneProgress += (state.sceneProgressTarget - state.sceneProgress) * t;
				state.sceneProgress = clampSceneProgress(state.sceneProgress);
			}
		}
	}

	_commitForward() {
		const fromId = this.currentId;
		this.previousId = this.currentId;
		this.currentId = this.nextId;
		this.nextId = nextInCycle(this.currentId);
		const nextProgressTarget = this.progressTarget - 1;
		const boundaryOverflowProgress = this.currentId === "about"
			? Math.max(0, nextProgressTarget, this._aboutBoundaryOverflowProgress)
			: 0;
		this._aboutBoundaryOverflowProgress = 0;
		this.progressTarget = nextProgressTarget;
		this.progress = 0;
		if (this.currentId === "about") {
			this.progressTarget = 0;
		}
		this.scrollIntent = null;
		this._onCommit?.({
			fromId,
			toId: this.currentId,
			direction: "forward",
			boundaryOverflowProgress,
		});
		logCarouselProgressCommit(this, "forward");
	}

	_commitBackward() {
		const fromId = this.currentId;
		this.nextId = this.currentId;
		this.currentId = this.previousId;
		this.previousId = prevInCycle(this.currentId);
		const nextProgressTarget = this.progressTarget + 1;
		const boundaryOverflowProgress = this.currentId === "about"
			? Math.min(0, nextProgressTarget - 1, this._aboutBoundaryOverflowProgress)
			: 0;
		this._aboutBoundaryOverflowProgress = 0;
		// After reindexing, progress=1 is the old page and progress=0 is the new
		// previous page. Always chase zero. Keeping `nextProgressTarget` here made
		// the clamped -0.5 boundary become exactly +0.5; the rest rule then chased
		// one and immediately committed forward, bouncing About back onto itself.
		this.progressTarget = 0;
		this.progress = 1;
		this.scrollIntent = null;
		this._onCommit?.({
			fromId,
			toId: this.currentId,
			direction: "backward",
			boundaryOverflowProgress,
		});
		logCarouselProgressCommit(this, "backward");
	}

	/** 0…1 для mix-шейдера (current → next). */
	getMixProgress() {
		return Math.max(0, Math.min(1, this.progress));
	}

	getSceneProgress(sceneId) {
		return this._sceneProgressById[sceneId]?.sceneProgress ?? 0;
	}

	getSceneProgressTarget(sceneId) {
		return this._sceneProgressById[sceneId]?.sceneProgressTarget ?? 0;
	}

	getSceneProgressRole(sceneId) {
		return this._sceneProgressById[sceneId]?.role ?? "off";
	}

	/** Для debug/store: снимок по всем сценам карусели. */
	getSceneProgressSnapshot() {
		const out = {};
		for (const sceneId of CAROUSEL_SCENE_IDS) {
			const state = this._sceneProgressById[sceneId];
			out[sceneId] = {
				sceneProgress: state?.sceneProgress ?? 0,
				sceneProgressTarget: state?.sceneProgressTarget ?? 0,
				role: state?.role ?? "off",
			};
		}
		return out;
	}

	syncFromPage(page) {
		const sceneId = pageToCarouselSceneId(page);
		if (!sceneId) {
			return;
		}

		if (sceneId !== this.currentId) {
			if (this._clickPhase !== "idle") {
				return;
			}

			this.currentId = sceneId;
			this.previousId = prevInCycle(sceneId);
			this.nextId = nextInCycle(sceneId);
			this.progress = 0;
			this.progressTarget = 0;
			this.scrollIntent = null;
			this._aboutBoundaryOverflowProgress = 0;
			this._initSceneProgressStates();
		}
	}

	getCarouselSceneIds() {
		return [this.previousId, this.currentId, this.nextId];
	}

	/** Mix: wheel-карусель или hex-навигация (клик). */
	getMixSourceTargetIds() {
		if (this._clickPhase !== "idle" && this._hexMixSourceId && this._hexTargetSceneId) {
			return { sourceId: this._hexMixSourceId, targetId: this._hexTargetSceneId };
		}

		return { sourceId: this.currentId, targetId: this.nextId };
	}

	getActiveSceneIds(mixProgress = this.getMixProgress()) {
		// Hex (в т.ч. case→case): source и target нужны с первого кадра,
		// иначе при progress≈0 остаётся только carousel.currentId и source не обновляется.
		if (this._clickPhase !== "idle" && this._hexMixSourceId && this._hexTargetSceneId) {
			const { sourceId, targetId } = this.getMixSourceTargetIds();
			return sourceId === targetId ? [sourceId] : [sourceId, targetId];
		}

		if (mixProgress <= 0.0001) {
			return [this.currentId];
		}

		const { sourceId, targetId } = this.getMixSourceTargetIds();
		return sourceId === targetId ? [sourceId] : [sourceId, targetId];
	}
}
