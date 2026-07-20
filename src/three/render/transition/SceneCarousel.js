import { hexGridOverlayDefaults } from "../overlay/hexGridOverlayConfig.js";
import { carouselClickTransitionConfig, easeCarouselClickProgress } from "./carouselClickTransitionConfig.js";
import {
	clampSceneProgress,
	getCarouselSceneRole,
	sceneProgressSnapForRoleChange,
	sceneProgressTargetForRole,
	sceneProgressTargetForRoleChange,
} from "./sceneCarouselSceneProgress.js";
import {
	applyLocalSegmentTargetRest,
	CAROUSEL_PROGRESS_CHASE_FINAL_SMOOTH_MUL,
	CAROUSEL_PROGRESS_CHASE_FINAL_THRESHOLD,
	CAROUSEL_PROGRESS_SEGMENT_BACK_END,
	CAROUSEL_PROGRESS_SEGMENT_END,
	CAROUSEL_PROGRESS_SMOOTH,
	CAROUSEL_PROGRESS_TARGET_ADVANCE_FINAL_THRESHOLD,
	CAROUSEL_PROGRESS_TARGET_ADVANCE_SMOOTH,
	CAROUSEL_PROGRESS_TARGET_ADVANCE_THRESHOLD,
	CAROUSEL_PROGRESS_TARGET_FINAL_SMOOTH_MUL,
	CAROUSEL_PROGRESS_TARGET_FINAL_ZONE,
	CAROUSEL_PROGRESS_TARGET_RETREAT_FINAL_THRESHOLD,
	CAROUSEL_PROGRESS_TARGET_RETREAT_SMOOTH,
	CAROUSEL_PROGRESS_TARGET_RETREAT_THRESHOLD,
	CAROUSEL_PROGRESS_TARGET_RETURN_SMOOTH,
	CAROUSEL_PROGRESS_TARGET_RETURN_THRESHOLD,
	chaseSegmentValue,
	getAbsChaseSmoothMul,
} from "./segmentScrollSpring.js";

/** Бесконечное кольцо: previous ← current → next + scroll progress / progressTarget. */
export const CAROUSEL_SCENE_IDS = ["home", "portfolioHub", "about", "contacts"];

/** Скролл вперёд: target не выше 1.5 (полсегмента overshoot после 1). */
export const CAROUSEL_PROGRESS_TARGET_MAX = 1.5;
/** Скролл назад: target не ниже −1.5 (зеркало +1.5; полный сегмент 0→−1 + overshoot). */
export const CAROUSEL_PROGRESS_TARGET_MIN = -1.5;

/** Re-export spring constants (canonical values live in segmentScrollSpring.js). */
export {
	CAROUSEL_PROGRESS_TARGET_RETURN_THRESHOLD,
	CAROUSEL_PROGRESS_TARGET_RETURN_SMOOTH,
	CAROUSEL_PROGRESS_TARGET_ADVANCE_THRESHOLD,
	CAROUSEL_PROGRESS_TARGET_RETREAT_THRESHOLD,
	CAROUSEL_PROGRESS_TARGET_ADVANCE_SMOOTH,
	CAROUSEL_PROGRESS_TARGET_RETREAT_SMOOTH,
	CAROUSEL_PROGRESS_TARGET_FINAL_ZONE,
	CAROUSEL_PROGRESS_TARGET_ADVANCE_FINAL_THRESHOLD,
	CAROUSEL_PROGRESS_TARGET_RETREAT_FINAL_THRESHOLD,
	CAROUSEL_PROGRESS_TARGET_FINAL_SMOOTH_MUL,
	CAROUSEL_PROGRESS_SMOOTH,
	CAROUSEL_PROGRESS_CHASE_FINAL_THRESHOLD,
	CAROUSEL_PROGRESS_CHASE_FINAL_SMOOTH_MUL,
	CAROUSEL_PROGRESS_SEGMENT_END,
	CAROUSEL_PROGRESS_SEGMENT_BACK_END,
};

/**
 * Скорость догоняния sceneProgress → sceneProgressTarget (камера).
 * Was 1 — too sluggish vs ring chase (PROGRESS_SMOOTH=4). Keep a little
 * smoothing, but camera must track the wheel closely.
 */
export const CAROUSEL_SCENE_PROGRESS_SMOOTH = 4.2;

/** Покой сегмента (idle / post-commit land). */
export const CAROUSEL_PROGRESS_SEGMENT_START = 0;
/** Spring не доходит до ровно ±1/0 — коммит и snap по epsilon (toFixed(4) в debug врёт). */
export const CAROUSEL_PROGRESS_COMMIT_EPS = 1e-4;
/** Автодогонка progress → ±1: добить progress до коммита, если target уже на конце сегмента. */
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

/**
 * After ±1 commit, leftover overshoot must stay inside (−0.5, 0.5) so rest returns to 0.
 * Landing exactly on ±0.5 would re-arm leave (rest → ±1) and bounce.
 */
function clampPostCommitProgressTarget(value) {
	const limit = CAROUSEL_PROGRESS_TARGET_RETURN_THRESHOLD - CAROUSEL_PROGRESS_COMMIT_EPS;
	return Math.max(-limit, Math.min(limit, value));
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
		/** About route-edge overshoot drive — see adoptAboutBoundaryDrive(). */
		this._aboutBoundaryDrive = false;
		/**
		 * Case content-edge scroll mix (caseA↔caseB) — see beginCaseBoundaryDrive().
		 * Progress-driven hex like the ring; commit swaps case route (not timed click hex).
		 */
		this._caseBoundaryDrive = false;
		/** Hold mix at ±1 until React/SceneManager confirms the new case route. */
		this._caseBoundaryAwaitingRoute = false;
		/** @type {string | null} */
		this._caseBoundarySourceId = null;
		/** @type {string | null} */
		this._caseBoundaryForwardTargetId = null;
		/** @type {string | null} */
		this._caseBoundaryForwardTargetPath = null;
		/** @type {string | null} */
		this._caseBoundaryBackwardTargetId = null;
		/** @type {string | null} */
		this._caseBoundaryBackwardTargetPath = null;
		/** @type {((payload: { path: string, sourceId: string, targetId: string, direction: 'forward' | 'backward' }) => void) | null} */
		this._onCaseBoundaryCommit = null;
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

		// Click hex owns the frame — abort any in-flight case scroll mix.
		if (this._caseBoundaryDrive) {
			this.clearCaseBoundaryDrive();
		}

		this._hexTargetSceneId = targetSceneId;
		this._hexTargetPath = toPath;
		this.scrollIntent = null;

		const sourceInCarousel = CAROUSEL_SCENE_IDS.includes(sourceSceneId);
		const distanceFromStart = Math.abs(this.progress);
		const distanceFromEnd = Math.abs(1 - this.progress);
		const isBetweenEndpoints = sourceInCarousel && distanceFromStart > CAROUSEL_PROGRESS_COMMIT_EPS && distanceFromEnd > CAROUSEL_PROGRESS_COMMIT_EPS;

		if (isBetweenEndpoints) {
			// Arm mix pair during settle so source/target stay held (SITE_TRANSITION.md).
			// Previously _hexMixSourceId was null until enter → early hide / scale pops.
			this._hexMixSourceId = sourceSceneId;
			this._hexSourceSceneProgress = this.getSceneProgress(sourceSceneId);
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
		this._hexSourceSceneProgress = CAROUSEL_SCENE_IDS.includes(sourceSceneId) ? this.getSceneProgress(sourceSceneId) : 0;
		this._clickEnterElapsed = 0;
		this._clickPhase = "enter";
		this.progress = 0;
		this.progressTarget = 0;
		this._onHexLifecycleStart?.({ sourceId: sourceSceneId, targetId: this._hexTargetSceneId });
	}

	/** id кейса-цели для mix-preview во время click-hex enter или case-boundary scroll. */
	getHexMixTargetSceneId() {
		if (this._caseBoundaryDrive || this._caseBoundaryAwaitingRoute) {
			const { targetId } = this.getMixSourceTargetIds();
			return targetId?.startsWith("case") ? targetId : null;
		}
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
		this.progress = this._settleStartProgress + (this._settleEndProgress - this._settleStartProgress) * eased;
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

		if (delta > 0) {
			this.scrollIntent = "forward";
		} else if (delta < 0) {
			this.scrollIntent = "backward";
		}

		this.progressTarget = clampProgressTarget(this.progressTarget + delta);
	}

	/** Manual target override (tests / future tooling). */
	setProgressTarget(value) {
		this.scrollIntent = null;
		this.progressTarget = clampProgressTarget(value);
	}

	/** Dev: мгновенно выставить progress и target. */
	setProgressState(progress, progressTarget = progress) {
		this.scrollIntent = null;
		this.progress = progress;
		this.progressTarget = clampProgressTarget(progressTarget);
		this._initSceneProgressStates();
	}

	_clearScrollIntentIfAtRest() {
		const eps = CAROUSEL_PROGRESS_COMMIT_EPS;
		if (Math.abs(this.progress) <= eps && Math.abs(this.progressTarget) <= eps) {
			this.scrollIntent = null;
		}
	}

	/** Коммит вперёд: progress достиг конца сегмента (в т.ч. после автодогонки target → 1). */
	_shouldCommitForward() {
		const eps = CAROUSEL_PROGRESS_COMMIT_EPS;
		return this.progress >= CAROUSEL_PROGRESS_SEGMENT_END - eps;
	}

	/** Коммит назад: progress достиг конца сегмента −1 (зеркало forward ≥ 1). */
	_shouldCommitBackward() {
		if (this.scrollIntent !== "backward") {
			return false;
		}

		const eps = CAROUSEL_PROGRESS_COMMIT_EPS;
		return this.progress <= CAROUSEL_PROGRESS_SEGMENT_BACK_END + eps;
	}

	/**
	 * When aiming at / past +1 — help progress commit (chase asymptote).
	 * Overshoot target (1…1.5] is kept intact for About/case interior handoff.
	 */
	_snapProgressForForwardCommit() {
		const eps = CAROUSEL_PROGRESS_COMMIT_EPS;
		const end = CAROUSEL_PROGRESS_SEGMENT_END;

		if (this.progressTarget < end - eps) {
			return;
		}

		if (Math.abs(this.progressTarget - end) <= eps) {
			this.progressTarget = end;
		}

		if (this.progress >= end - CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE) {
			this.progress = end;
		}
	}

	/**
	 * When aiming at / past −1 — help progress commit backward.
	 * Overshoot target [−1.5…−1) is kept intact the same way as forward.
	 */
	_snapProgressForBackwardCommit() {
		const eps = CAROUSEL_PROGRESS_COMMIT_EPS;
		const end = CAROUSEL_PROGRESS_SEGMENT_BACK_END;

		if (this.progressTarget > end + eps) {
			return;
		}

		if (Math.abs(this.progressTarget - end) <= eps) {
			this.progressTarget = end;
		}

		if (this.progress <= end + CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE) {
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

		if (Math.abs(this.progressTarget - CAROUSEL_PROGRESS_SEGMENT_BACK_END) < eps) {
			this.progressTarget = CAROUSEL_PROGRESS_SEGMENT_BACK_END;
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
	/**
	 * About mirrors route-edge overshoot onto carousel progress for hex/cameras.
	 * @param {number} progress
	 * @param {number} progressTarget
	 * @param {'forward' | 'backward'} intent
	 */
	adoptAboutBoundaryDrive(progress, progressTarget, intent) {
		this._aboutBoundaryDrive = true;
		this.progress = progress;
		this.progressTarget = clampProgressTarget(progressTarget);
		this.scrollIntent = intent;
	}

	clearAboutBoundaryDrive() {
		if (!this._aboutBoundaryDrive) {
			return;
		}
		this._aboutBoundaryDrive = false;
	}

	isAboutBoundaryDrive() {
		return this._aboutBoundaryDrive === true;
	}

	/**
	 * Case content-edge: scroll-driven hex between two case scenes (not ring neighbors).
	 * @param {{
	 *   sourceId: string,
	 *   forwardTargetId: string,
	 *   forwardTargetPath: string,
	 *   backwardTargetId: string,
	 *   backwardTargetPath: string,
	 * }} pair
	 */
	beginCaseBoundaryDrive(pair) {
		if (!pair?.sourceId || this._clickPhase !== "idle" || this._caseBoundaryAwaitingRoute) {
			return false;
		}
		const sameSource = this._caseBoundarySourceId === pair.sourceId;
		this._caseBoundarySourceId = pair.sourceId;
		this._caseBoundaryForwardTargetId = pair.forwardTargetId ?? null;
		this._caseBoundaryForwardTargetPath = pair.forwardTargetPath ?? null;
		this._caseBoundaryBackwardTargetId = pair.backwardTargetId ?? null;
		this._caseBoundaryBackwardTargetPath = pair.backwardTargetPath ?? null;
		// Case runtime owns the spring (like About) — only reset when switching source.
		if (!sameSource || !this._caseBoundaryDrive) {
			this.progress = 0;
			this.progressTarget = 0;
			this.scrollIntent = null;
		}
		this._caseBoundaryDrive = true;
		return true;
	}

	/**
	 * Case runtime mirrors route-edge overshoot onto carousel progress for hex.
	 * @param {number} progress
	 * @param {number} progressTarget
	 * @param {'forward' | 'backward' | null} intent
	 */
	adoptCaseBoundaryDrive(progress, progressTarget, intent) {
		if (!this._caseBoundarySourceId || this._caseBoundaryAwaitingRoute) {
			return;
		}
		this._caseBoundaryDrive = true;
		this.progress = progress;
		this.progressTarget = clampProgressTarget(progressTarget);
		this.scrollIntent = intent;
	}

	clearCaseBoundaryDrive() {
		if (!this._caseBoundaryDrive && !this._caseBoundaryAwaitingRoute) {
			return;
		}
		this._caseBoundaryDrive = false;
		this._caseBoundaryAwaitingRoute = false;
		this._caseBoundarySourceId = null;
		this._caseBoundaryForwardTargetId = null;
		this._caseBoundaryForwardTargetPath = null;
		this._caseBoundaryBackwardTargetId = null;
		this._caseBoundaryBackwardTargetPath = null;
		this.progress = 0;
		this.progressTarget = 0;
		this.scrollIntent = null;
	}

	isCaseBoundaryDrive() {
		return this._caseBoundaryDrive === true || this._caseBoundaryAwaitingRoute === true;
	}

	isCaseBoundaryAwaitingRoute() {
		return this._caseBoundaryAwaitingRoute === true;
	}

	setOnCaseBoundaryCommit(callback) {
		this._onCaseBoundaryCommit = callback;
	}

	/**
	 * Finished leave segment — freeze mix at ±1 and await case route confirm.
	 * @param {'forward' | 'backward'} direction
	 * @returns {false | { path: string, sourceId: string, targetId: string, direction: 'forward' | 'backward' }}
	 */
	commitCaseBoundaryLeave(direction) {
		if (!this._caseBoundaryDrive || this._caseBoundaryAwaitingRoute) {
			return false;
		}
		const sourceId = this._caseBoundarySourceId;
		const targetId = direction === "backward" ? this._caseBoundaryBackwardTargetId : this._caseBoundaryForwardTargetId;
		const path = direction === "backward" ? this._caseBoundaryBackwardTargetPath : this._caseBoundaryForwardTargetPath;
		if (!path || !targetId || !sourceId) {
			this.clearCaseBoundaryDrive();
			return false;
		}
		this._caseBoundaryAwaitingRoute = true;
		this._caseBoundaryDrive = false;
		this.progress = direction === "backward" ? CAROUSEL_PROGRESS_SEGMENT_BACK_END : CAROUSEL_PROGRESS_SEGMENT_END;
		this.progressTarget = this.progress;
		this.scrollIntent = null;
		const payload = {
			path,
			sourceId,
			targetId,
			direction,
		};
		this._onCaseBoundaryCommit?.(payload);
		return payload;
	}

	/**
	 * After HTML/SceneManager lands on the adjacent case — drop held mix.
	 * @param {string} sceneId
	 */
	confirmCaseBoundaryRoute(sceneId) {
		if (!this._caseBoundaryAwaitingRoute) {
			return false;
		}
		const expected = this.progress < 0 ? this._caseBoundaryBackwardTargetId : this._caseBoundaryForwardTargetId;
		if (!sceneId || sceneId !== expected) {
			return false;
		}
		this.clearCaseBoundaryDrive();
		return true;
	}

	/**
	 * About `current` crossed the route edge — commit leave like a finished carousel segment.
	 * @param {'forward' | 'backward'} direction
	 */
	commitAboutRouteLeave(direction) {
		this._aboutBoundaryDrive = false;
		if (direction === "backward") {
			this.scrollIntent = "backward";
			this.progress = Math.min(this.progress, CAROUSEL_PROGRESS_SEGMENT_BACK_END);
			this.progressTarget = Math.min(this.progressTarget, CAROUSEL_PROGRESS_SEGMENT_BACK_END);
			this._commitBackward();
			return;
		}
		this.scrollIntent = "forward";
		this.progress = Math.max(this.progress, CAROUSEL_PROGRESS_SEGMENT_END);
		this.progressTarget = Math.max(this.progressTarget, CAROUSEL_PROGRESS_SEGMENT_END);
		this._commitForward();
	}

	update(delta) {
		if (!Number.isFinite(delta) || delta <= 0) {
			return;
		}

		if (this._clickPhase !== "idle") {
			this._updateHexNavigation(delta);
			this._updateSceneProgresses(delta);
			return;
		}

		/** About / case-boundary own their spring — do not fight their progress. */
		if (this._aboutBoundaryDrive || this._caseBoundaryDrive || this._caseBoundaryAwaitingRoute) {
			this._updateSceneProgresses(delta);
			return;
		}

		this._applyProgressTargetRest(delta);

		const progressChaseMul = getAbsChaseSmoothMul(Math.abs(this.progress), {
			threshold: CAROUSEL_PROGRESS_CHASE_FINAL_THRESHOLD,
			mul: CAROUSEL_PROGRESS_CHASE_FINAL_SMOOTH_MUL,
		});
		this.progress = chaseSegmentValue(this.progress, this.progressTarget, delta, {
			smooth: CAROUSEL_PROGRESS_SMOOTH,
			chaseMul: progressChaseMul,
		});
		this._snapProgressToRestTarget();
		this._snapProgressForForwardCommit();
		this._snapProgressForBackwardCommit();

		if (this._shouldCommitForward()) {
			this.progress = CAROUSEL_PROGRESS_SEGMENT_END;
			this._commitForward();
		} else if (this._shouldCommitBackward()) {
			this.progress = CAROUSEL_PROGRESS_SEGMENT_BACK_END;
			this._commitBackward();
		} else {
			this._clearScrollIntentIfAtRest();
		}

		this._updateSceneProgresses(delta);
	}

	/**
	 * progressTarget rest via shared segment spring:
	 * (−0.5, 0.5) → 0; ≥ 0.5 → 1; ≤ −0.5 → −1.
	 */
	_applyProgressTargetRest(delta) {
		this.progressTarget = applyLocalSegmentTargetRest(this.progressTarget, delta);
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
		this._aboutBoundaryDrive = false;
		const fromId = this.currentId;
		const enteringAbout = this.nextId === "about";
		// Single overflow source: leftover past +1 before post-commit clamp.
		const rawLeftover = this.progressTarget - CAROUSEL_PROGRESS_SEGMENT_END;
		const boundaryOverflowProgress = enteringAbout ? Math.max(0, Math.min(CAROUSEL_PROGRESS_TARGET_MAX - 1, rawLeftover)) : 0;
		this.previousId = this.currentId;
		this.currentId = this.nextId;
		this.nextId = nextInCycle(this.currentId);
		// About owns interior spring — transfer leftover into story, zero ring target.
		this.progressTarget = enteringAbout ? 0 : clampPostCommitProgressTarget(rawLeftover);
		this.progress = 0;
		this.scrollIntent = null;
		this._onCommit?.({
			fromId,
			toId: this.currentId,
			direction: "forward",
			boundaryOverflowProgress,
		});
	}

	_commitBackward() {
		this._aboutBoundaryDrive = false;
		const fromId = this.currentId;
		const enteringAbout = this.previousId === "about";
		// Mirror forward: leftover past −1 before post-commit clamp.
		const rawLeftover = this.progressTarget - CAROUSEL_PROGRESS_SEGMENT_BACK_END;
		const boundaryOverflowProgress = enteringAbout ? Math.min(0, Math.max(CAROUSEL_PROGRESS_TARGET_MIN + 1, rawLeftover)) : 0;
		this.nextId = this.currentId;
		this.currentId = this.previousId;
		this.previousId = prevInCycle(this.currentId);
		this.progressTarget = enteringAbout ? 0 : clampPostCommitProgressTarget(rawLeftover);
		this.progress = 0;
		this.scrollIntent = null;
		this._onCommit?.({
			fromId,
			toId: this.currentId,
			direction: "backward",
			boundaryOverflowProgress,
		});
	}

	/** 0…1 для mix-шейдера. Backward leave uses |progress| toward previous. */
	getMixProgress() {
		return Math.max(0, Math.min(1, Math.abs(this.progress)));
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

	/**
	 * @param {string} page
	 * @param {{ force?: boolean }} [options]
	 */
	syncFromPage(page, options = {}) {
		const sceneId = pageToCarouselSceneId(page);
		if (!sceneId) {
			return;
		}

		if (sceneId === this.currentId) {
			return;
		}

		const force = options.force === true;
		if (!force && this._clickPhase !== "idle") {
			return;
		}

		/**
		 * HTML can lag or lead a scroll commit by a frame. Never hard-reset
		 * progress/target while a spring is running — that killed the post-commit
		 * chase (e.g. About→Portfolio settle 1→0).
		 * `force` is for deep-link / Start alignment only.
		 */
		if (!force) {
			const eps = CAROUSEL_PROGRESS_COMMIT_EPS;
			const springActive =
				Math.abs(this.progress - this.progressTarget) > eps || Math.abs(this.progress) > eps || Math.abs(this.progressTarget) > eps || this.scrollIntent !== null;
			if (springActive) {
				return;
			}
		}

		this.currentId = sceneId;
		this.previousId = prevInCycle(sceneId);
		this.nextId = nextInCycle(sceneId);
		this.progress = 0;
		this.progressTarget = 0;
		this.scrollIntent = null;
		this._aboutBoundaryDrive = false;
		this._initSceneProgressStates();
	}

	getCarouselSceneIds() {
		return [this.previousId, this.currentId, this.nextId];
	}

	/** Mix: wheel-карусель, case-boundary scroll, или hex-навигация (клик). */
	getMixSourceTargetIds() {
		if ((this._caseBoundaryDrive || this._caseBoundaryAwaitingRoute) && this._caseBoundarySourceId) {
			if (this.progress < 0) {
				return {
					sourceId: this._caseBoundarySourceId,
					targetId: this._caseBoundaryBackwardTargetId ?? this._caseBoundarySourceId,
				};
			}
			return {
				sourceId: this._caseBoundarySourceId,
				targetId: this._caseBoundaryForwardTargetId ?? this._caseBoundarySourceId,
			};
		}

		if (this._clickPhase !== "idle" && this._hexMixSourceId && this._hexTargetSceneId) {
			return { sourceId: this._hexMixSourceId, targetId: this._hexTargetSceneId };
		}

		if (this.progress < 0) {
			return { sourceId: this.currentId, targetId: this.previousId };
		}

		return { sourceId: this.currentId, targetId: this.nextId };
	}

	getActiveSceneIds(mixProgress = this.getMixProgress()) {
		// Hex (в т.ч. case→case): source и target нужны с первого кадра,
		// иначе при progress≈0 остаётся только carousel.currentId и source не обновляется.
		if ((this._caseBoundaryDrive || this._caseBoundaryAwaitingRoute) && this._caseBoundarySourceId) {
			const { sourceId, targetId } = this.getMixSourceTargetIds();
			if (mixProgress <= 0.0001) {
				return [sourceId];
			}
			return sourceId === targetId ? [sourceId] : [sourceId, targetId];
		}

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
