import { subscribeKey } from "valtio/utils";
import { store } from "@/store.jsx";
import { CAROUSEL_WHEEL_PROGRESS_FACTOR } from "@/three/render/transition/carouselScroll.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import {
	CAROUSEL_PROGRESS_COMMIT_EPS,
	CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE,
	CAROUSEL_PROGRESS_SEGMENT_BACK_END,
	CAROUSEL_PROGRESS_TARGET_MAX,
	CAROUSEL_PROGRESS_TARGET_MIN,
} from "@/three/render/transition/SceneCarousel.js";
import {
	applyLocalSegmentTargetRest,
	CAROUSEL_PROGRESS_CHASE_FINAL_SMOOTH_MUL,
	CAROUSEL_PROGRESS_CHASE_FINAL_THRESHOLD,
	CAROUSEL_PROGRESS_SMOOTH,
	chaseSegmentValue,
	getAbsChaseSmoothMul,
} from "@/three/render/transition/segmentScrollSpring.js";
import states, { ABOUT_STAGE_COUNT } from "./states.js";
import { isSceneDevToolsWheelTarget } from "@/three/dev/sceneDevPanelUtils.js";
import {
	armAboutPanelHudForRoute,
	isAboutPanelHudVisitArmed,
	resetAboutPanelHudStorySession,
	syncAboutPanelHudFromStory,
	ensureAboutPanelHudCanvases,
	publishAboutPanelHudPair,
	resolveAboutPanelHudStoryPair,
} from "@/about/aboutPanelHudStory.js";
import { reuploadAboutPanelHudWarmPool } from "@/about/warmAboutPanelHudUnderCurtain.js";
import {
	cancelAboutPanelHudLocaleMix,
	playAboutPanelHudLocaleMix,
} from "@/about/aboutPanelHudLocaleMix.js";
import { SCENE_ID_TO_PAGE } from "@/three/render/transition/SceneCarousel.js";
import { publishSiteRouteTransition } from "@/three/render/transition/siteTransitionIntent.js";
import {
	preloadCaseStudyTextTransitionSound,
	resetCaseStudyTextTransitionSound,
	updateCaseStudyTextTransitionSound,
} from "@/sounds/caseStudyTextTransitionSound.js";
import {
	aboutStoryToFrontDissolve,
	preloadAboutFrontDissolveSound,
	resetAboutFrontDissolveSound,
	updateAboutFrontDissolveSound,
} from "@/sounds/aboutFrontDissolveSound.js";
import {
	aboutStoryToBackDissolve,
	preloadAboutBackDissolveSound,
	resetAboutBackDissolveSound,
	updateAboutBackDissolveSound,
} from "@/sounds/aboutBackDissolveSound.js";
import {
	preloadAboutParticleSound,
	resetAboutParticleSound,
	updateAboutParticleSound,
} from "@/sounds/aboutParticleSound.js";
import {
	aboutStoryToPcbReveal,
	preloadAboutPcbAppearSound,
	resetAboutPcbAppearSound,
	updateAboutPcbAppearSound,
} from "@/sounds/aboutPcbAppearSound.js";
import { isAboutPanelHudLocaleMixBusy } from "@/about/aboutPanelHudBridge.js";
import {
	registerSiteNavigationProgressOwner,
	resolveStoryRest,
} from "@/three/render/transition/siteNavigationProgressOwner.js";

/**
 * Imperative About story/wheel owner.
 *
 * Interior stages: same spring shape as SceneCarousel, softer rates.
 * Route-edge leave (−1.5…0 / STORY_MAX…STORY_MAX+1.5): full carousel feel
 * (wheel factor + rest/chase) — must match portfolio↔home page transitions.
 * Commit leave when rendered `current` reaches −1 or STORY_MAX+1.
 */

const LEGACY_STAGE_INTERVALS = Math.max(1, ABOUT_STAGE_COUNT - 1);
const ABOUT_WHEEL_STRENGTH = 1.5;
/** Softer than carousel — interior stages only. */
const ABOUT_SPRING_RATES = {
	returnSmooth: 0.7,
	advanceSmooth: 0.7,
	retreatSmooth: 0.7,
	finalMul: 6,
};
const ABOUT_PROGRESS_SMOOTH = 2.2;
const ABOUT_PROGRESS_CHASE_FINAL_SMOOTH_MUL = 1.35;
/** Route-edge leave uses default carousel rates (empty → segmentScrollSpring defaults). */
const CAROUSEL_EDGE_SPRING_RATES = {};
const WHEEL_IDLE_MS = 180;
const LINE_HEIGHT_PX = 16;
const MAX_WHEEL_VIEWPORT_RATIO = 0.9;
const STORY_MAX = ABOUT_STAGE_COUNT;
/** Leave segment past last stage: story STORY_MAX → STORY_MAX+1, overshoot to +1.5. */
const STORY_TARGET_MIN = CAROUSEL_PROGRESS_TARGET_MIN;
const STORY_TARGET_MAX = STORY_MAX + CAROUSEL_PROGRESS_TARGET_MAX;
const TARGET_REST_EPS = 0.00005;

/** @type {null | (() => void)} */
let disposeRuntime = null;
/** @type {null | ((entryStory: number) => void)} */
let liveResetHandler = null;

/**
 * Dormant pose after leave — same role as home/portfolio `resetCarouselState`.
 * `previous` (left → contacts) → story at end; `next` (left → portfolio / approach) → story 0.
 */
export function resetAboutExperienceState({ entryStory = 0 } = {}) {
	const story = clamp(Number(entryStory) || 0, 0, STORY_MAX);
	const experience = ensureAboutExperience();
	const stageIndex = storyToStageIndex(story);
	const stageLocal = storyToStageLocal(story);
	experience.storyProgress = story;
	experience.storyProgressTarget = story;
	experience.stageProgress = stageLocal;
	experience.stageProgressTarget = stageLocal;
	experience.progress = story / STORY_MAX;
	experience.progressTarget = story / STORY_MAX;
	experience.stagePosition = experience.progress * (ABOUT_STAGE_COUNT - 1);
	experience.activeStageIndex = stageIndex;
	experience.activeStageId = states[stageIndex]?.id ?? states[0].id;
	liveResetHandler?.(story);
}

function getPixelsPerStage() {
	return LEGACY_STAGE_INTERVALS / (CAROUSEL_WHEEL_PROGRESS_FACTOR * ABOUT_WHEEL_STRENGTH);
}

/** Same px → unit as SceneCarousel page transitions. */
function getCarouselPixelsPerSegment() {
	return 1 / CAROUSEL_WHEEL_PROGRESS_FACTOR;
}

/** Route-edge leave segment (not interior stage content). */
function isRouteEdgeStory(story) {
	return story < -CAROUSEL_PROGRESS_COMMIT_EPS || story > STORY_MAX + CAROUSEL_PROGRESS_COMMIT_EPS;
}

/**
 * Wheel → story units. Softer About scale only while moving inside stages;
 * pushing out of 0 / STORY_MAX (or already on leave) matches carousel.
 */
function getPixelsPerStoryUnit(storyTarget, deltaPixels) {
	const pushingBackwardLeave = deltaPixels < 0 && storyTarget <= CAROUSEL_PROGRESS_COMMIT_EPS;
	const pushingForwardLeave = deltaPixels > 0 && storyTarget >= STORY_MAX - CAROUSEL_PROGRESS_COMMIT_EPS;
	if (isRouteEdgeStory(storyTarget) || pushingBackwardLeave || pushingForwardLeave) {
		return getCarouselPixelsPerSegment();
	}
	return getPixelsPerStage();
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function clampStoryTarget(value) {
	return clamp(value, STORY_TARGET_MIN, STORY_TARGET_MAX);
}

function clampStoryVisual(value) {
	return clamp(value, 0, STORY_MAX);
}

function isEditableTarget(target) {
	return (
		target instanceof Element &&
		Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
	);
}

function storyToStageIndex(story) {
	const visual = clampStoryVisual(story);
	if (visual >= STORY_MAX - 1e-9) return ABOUT_STAGE_COUNT - 1;
	return clamp(Math.floor(visual), 0, ABOUT_STAGE_COUNT - 1);
}

function storyToStageLocal(story) {
	const visual = clampStoryVisual(story);
	if (visual >= STORY_MAX - 1e-9) return 1;
	const index = storyToStageIndex(visual);
	return clamp(visual - index, 0, 1);
}

/**
 * Rest story target — map each story range onto a local segment, then run the
 * shared rest formula. Soft rates only for interior stages.
 */
function applyStageTargetRest(storyTarget, delta) {
	const story = clampStoryTarget(storyTarget);

	/** Start-edge leave: (−1.5, 0) — carousel page-leave feel. */
	if (story < 0) {
		return applyLocalSegmentTargetRest(story, delta, CAROUSEL_EDGE_SPRING_RATES);
	}

	/** End-edge leave: local = story − STORY_MAX ∈ [0, 1.5] — carousel feel. */
	if (story >= STORY_MAX) {
		const local = applyLocalSegmentTargetRest(
			story - STORY_MAX,
			delta,
			CAROUSEL_EDGE_SPRING_RATES,
		);
		return STORY_MAX + local;
	}

	/** Interior content stages — softer About rates. */
	if (story <= CAROUSEL_PROGRESS_COMMIT_EPS) return 0;

	const segment = Math.floor(story + 1e-12);
	let local = story - segment;
	if (local <= TARGET_REST_EPS) return segment;
	if (local >= 1 - TARGET_REST_EPS) return Math.min(STORY_MAX, segment + 1);

	local = applyLocalSegmentTargetRest(local, delta, ABOUT_SPRING_RATES);
	return clamp(segment + local, 0, STORY_TARGET_MAX);
}

function getStoryChaseConfig(storyProgress, storyTarget = storyProgress) {
	/** Chase must match leave as soon as target crosses the route edge. */
	const onEdge =
		storyProgress < 0
		|| storyProgress > STORY_MAX
		|| storyTarget < 0
		|| storyTarget > STORY_MAX;
	let absLocal;
	if (storyProgress < 0) {
		absLocal = Math.abs(storyProgress);
	} else if (storyProgress >= STORY_MAX) {
		absLocal = storyProgress - STORY_MAX;
	} else if (storyTarget < 0) {
		absLocal = Math.abs(storyTarget);
	} else if (storyTarget > STORY_MAX) {
		absLocal = storyTarget - STORY_MAX;
	} else {
		absLocal = storyToStageLocal(storyProgress);
	}
	return {
		smooth: onEdge ? CAROUSEL_PROGRESS_SMOOTH : ABOUT_PROGRESS_SMOOTH,
		chaseMul: getAbsChaseSmoothMul(absLocal, {
			threshold: CAROUSEL_PROGRESS_CHASE_FINAL_THRESHOLD,
			mul: onEdge ? CAROUSEL_PROGRESS_CHASE_FINAL_SMOOTH_MUL : ABOUT_PROGRESS_CHASE_FINAL_SMOOTH_MUL,
		}),
	};
}

function snapStoryPair(current, target) {
	const eps = CAROUSEL_PROGRESS_COMMIT_EPS;
	let nextTarget = target;
	let nextCurrent = current;

	const restPoints = [CAROUSEL_PROGRESS_SEGMENT_BACK_END];
	for (let i = 0; i <= STORY_MAX; i += 1) restPoints.push(i);
	restPoints.push(STORY_MAX + 1);

	for (let i = 0; i < restPoints.length; i += 1) {
		const rest = restPoints[i];
		if (Math.abs(nextTarget - rest) < eps) {
			nextTarget = rest;
			if (Math.abs(nextCurrent - nextTarget) < eps) {
				nextCurrent = nextTarget;
			} else if (
				rest === CAROUSEL_PROGRESS_SEGMENT_BACK_END
				&& nextCurrent <= rest + CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE
			) {
				nextCurrent = rest;
			} else if (
				rest > 0
				&& nextTarget === rest
				&& nextCurrent >= rest - CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE
			) {
				nextCurrent = rest;
			}
			break;
		}
	}

	return { current: nextCurrent, target: nextTarget };
}

function storyNeedsAnimation(current, target) {
	const eps = CAROUSEL_PROGRESS_COMMIT_EPS;
	if (Math.abs(target - current) > eps) return true;
	if (target < -eps || target > STORY_MAX + eps) return true;
	if (target <= eps || Math.abs(target - STORY_MAX) <= eps) return false;
	if (target >= STORY_MAX) {
		const local = target - STORY_MAX;
		return local > eps && local < 1 - eps;
	}
	const local = target - Math.floor(target + 1e-12);
	return local > eps && local < 1 - eps;
}

function ensureAboutExperience() {
	if (!store.aboutExperience) {
		store.aboutExperience = {
			active: false,
			progress: 0,
			progressTarget: 0,
			stageProgress: 0,
			stageProgressTarget: 0,
			storyProgress: 0,
			storyProgressTarget: 0,
			stagePosition: 0,
			activeStageIndex: 0,
			activeStageId: states[0].id,
		};
	}
	return store.aboutExperience;
}

function normalizeWheelDelta(event) {
	let delta = event.deltaY;
	if (event.deltaMode === 1) {
		delta *= LINE_HEIGHT_PX;
	} else if (event.deltaMode === 2) {
		delta *= window.innerHeight;
	}
	const limit = Math.max(480, window.innerHeight * MAX_WHEEL_VIEWPORT_RATIO);
	return Math.max(-limit, Math.min(limit, delta));
}

function resolveEntryStory() {
	const isClickEntry =
		store.sceneCarouselClickTargetId === "about" && store.sceneCarouselClickPhase !== "idle";
	const fromContacts =
		!isClickEntry &&
		store.sceneCarouselLastCommitFromId === "contacts" &&
		store.sceneCarouselLastCommitDirection === "backward";
	const initialStory = fromContacts ? STORY_MAX : 0;
	/** Carousel progress units (−1.5…1.5 overshoot) transferred at commit — 1:1 with story. */
	const overflowStory = !isClickEntry
		? Number(store.sceneCarouselLastCommitBoundaryOverflow ?? 0)
		: 0;
	const initialTarget = Number.isFinite(overflowStory) && Math.abs(overflowStory) > 1e-6
		? clampStoryTarget(initialStory + overflowStory)
		: initialStory;
	return { initialStory, initialTarget };
}

function resolveRoot() {
	return document.querySelector("[data-about-experience-root]");
}

function createAboutExperienceRuntime() {
	const experience = ensureAboutExperience();
	const entry = resolveEntryStory();
	let current = entry.initialStory;
	let target = entry.initialTarget;
	let rafId = 0;
	let snapTimerId = 0;
	let previousFrameAt = performance.now();
	let lastPublishedStage = -1;
	let touchId = null;
	let touchY = 0;
	let disposed = false;
	/** @type {'forward' | 'backward' | null} */
	let scrollIntent = null;
	/** About HUD leave published once per route-edge push. */
	let aboutHudLeavePublished = false;

	const ownsInput = () => {
		const carousel = getSceneCarousel();
		return carousel.currentId === "about" && !carousel.isInteractionLocked();
	};

	const publish = () => {
		const visualCurrent = clampStoryVisual(current);
		const visualTarget = clampStoryVisual(target);
		const stageIndex = storyToStageIndex(visualCurrent);
		const stageLocal = storyToStageLocal(visualCurrent);
		const stageLocalTarget = storyToStageLocal(visualTarget);
		const storyNorm = visualCurrent / STORY_MAX;
		const storyNormTarget = visualTarget / STORY_MAX;
		const stagePosition = storyNorm * (ABOUT_STAGE_COUNT - 1);

		experience.storyProgress = current;
		experience.storyProgressTarget = target;
		experience.stageProgress = stageLocal;
		experience.stageProgressTarget = stageLocalTarget;
		experience.progress = storyNorm;
		experience.progressTarget = storyNormTarget;
		experience.stagePosition = stagePosition;

		if (stageIndex !== lastPublishedStage) {
			lastPublishedStage = stageIndex;
			experience.activeStageIndex = stageIndex;
			experience.activeStageId = states[stageIndex].id;
		}

		const root = resolveRoot();
		if (root) {
			root.dataset.aboutStage = String(stageIndex + 1);
			root.style.setProperty("--about-progress", storyNorm.toFixed(6));
			root.style.setProperty("--about-stage-progress", stageLocal.toFixed(6));
			root.style.setProperty("--about-story-progress", visualCurrent.toFixed(6));
			root.style.setProperty("--about-stage-position", stagePosition.toFixed(6));
		}
		syncAboutPanelHudFromStory(visualCurrent);
		// White PCB particle bed — follows painted story even at rest (no blue edge SFX).
		updateAboutParticleSound(current);
	};

	/** Mirror route-edge overshoot onto carousel for mix/cameras (About still owns spring). */
	const syncBoundaryDrive = () => {
		const carousel = getSceneCarousel();
		if (current < 0 || target < 0) {
			if (!aboutHudLeavePublished) {
				aboutHudLeavePublished = true;
				const toPath = SCENE_ID_TO_PAGE[carousel.previousId] ?? "/portfolio";
				publishSiteRouteTransition("/about", toPath, { mode: "about-boundary" });
			}
			carousel.adoptAboutBoundaryDrive(
				clamp(Math.min(current, 0), STORY_TARGET_MIN, 0),
				clamp(Math.min(target, 0), STORY_TARGET_MIN, 0),
				"backward",
			);
			return;
		}
		if (current > STORY_MAX || target > STORY_MAX) {
			if (!aboutHudLeavePublished) {
				aboutHudLeavePublished = true;
				const toPath = SCENE_ID_TO_PAGE[carousel.nextId] ?? "/contacts";
				publishSiteRouteTransition("/about", toPath, { mode: "about-boundary" });
			}
			carousel.adoptAboutBoundaryDrive(
				clamp(Math.max(current - STORY_MAX, 0), 0, CAROUSEL_PROGRESS_TARGET_MAX),
				clamp(Math.max(target - STORY_MAX, 0), 0, CAROUSEL_PROGRESS_TARGET_MAX),
				"forward",
			);
			return;
		}
		if (carousel.isAboutBoundaryDrive()) {
			/** Abort leave: aim ring at rest, chase progress — never hard-zero (camera jump). */
			aboutHudLeavePublished = false;
			carousel.clearAboutBoundaryDrive();
			carousel.progressTarget = 0;
			carousel.scrollIntent = null;
			// Do not force-repaint canvases mid-visit — that raced the first stage mosaic.
			if (isAboutPanelHudVisitArmed()) {
				syncAboutPanelHudFromStory(clampStoryVisual(current));
			} else {
				void armAboutPanelHudForRoute(clampStoryVisual(current));
			}
		}
	};

	/**
	 * Leave when rendered progress finishes the route-edge segment —
	 * carousel commit at progress ≤ −1 / progress ≥ 1.
	 */
	const tryCommitRouteLeave = () => {
		const eps = CAROUSEL_PROGRESS_COMMIT_EPS;
		const carousel = getSceneCarousel();

		if (scrollIntent === "backward" && current <= CAROUSEL_PROGRESS_SEGMENT_BACK_END + eps) {
			syncBoundaryDrive();
			carousel.commitAboutRouteLeave("backward");
			current = 0;
			target = 0;
			scrollIntent = null;
			publish();
			return true;
		}

		if (
			scrollIntent === "forward"
			&& current >= STORY_MAX + 1 - eps
		) {
			syncBoundaryDrive();
			carousel.commitAboutRouteLeave("forward");
			current = STORY_MAX;
			target = STORY_MAX;
			scrollIntent = null;
			publish();
			return true;
		}

		return false;
	};

	const stopAnimation = () => {
		if (rafId) {
			window.cancelAnimationFrame(rafId);
			rafId = 0;
		}
	};

	const tick = (now) => {
		rafId = 0;
		if (disposed) {
			return;
		}
		if (!ownsInput()) {
			if (getSceneCarousel().isNavigationSettleActive("about")) {
				return;
			}
			// Still chasing interior story after commit — don't drop the rAF forever
			// (brief lock / id flicker would freeze mix until the next wheel).
			if (getSceneCarousel().currentId === "about" && storyNeedsAnimation(current, target)) {
				previousFrameAt = now;
				rafId = window.requestAnimationFrame(tick);
				return;
			}
			experience.active = false;
			getSceneCarousel().clearAboutBoundaryDrive();
			return;
		}

		const dt = Math.min(0.05, Math.max(0, (now - previousFrameAt) / 1000));
		previousFrameAt = now;

		target = applyStageTargetRest(target, dt);

		const chase = getStoryChaseConfig(current, target);
		current = chaseSegmentValue(current, target, dt, chase);

		const snapped = snapStoryPair(current, target);
		current = snapped.current;
		target = snapped.target;

		/** Snap forward leave like carousel when target already on segment end. */
		if (
			target >= STORY_MAX + 1 - CAROUSEL_PROGRESS_COMMIT_EPS
			&& current >= STORY_MAX + 1 - CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE
		) {
			current = STORY_MAX + 1;
			target = STORY_MAX + 1;
		}

		syncBoundaryDrive();
		if (tryCommitRouteLeave()) {
			return;
		}

		publish();
		// Front hex dissolve scrub — painted dissolve (story 0.5→1), not wheel.
		updateAboutFrontDissolveSound(dt, aboutStoryToFrontDissolve(current));
		// Back plate disappear — painted dissolve (story 1→2), not wheel.
		updateAboutBackDissolveSound(dt, aboutStoryToBackDissolve(current));
		// White PCB particle appear — painted reveal (story 1.5→2), not wheel.
		updateAboutPcbAppearSound(dt, aboutStoryToPcbReveal(current));
		// Left HUD mosaic scrub — interior stages only (route-edge leave is hexTransition).
		if (
			!isAboutPanelHudLocaleMixBusy()
			&& current >= 0
			&& current <= STORY_MAX
			&& target >= 0
			&& target <= STORY_MAX
		) {
			// Drive SFX from visual HUD mix (front-half wipe), not soft story local.
			updateCaseStudyTextTransitionSound(
				dt,
				resolveAboutPanelHudStoryPair(clampStoryVisual(current)).mix,
				resolveAboutPanelHudStoryPair(clampStoryVisual(target)).mix,
			);
		}
		if (storyNeedsAnimation(current, target)) {
			rafId = window.requestAnimationFrame(tick);
		}
	};

	const startAnimation = () => {
		if (rafId || disposed) {
			return;
		}
		previousFrameAt = performance.now();
		rafId = window.requestAnimationFrame(tick);
	};

	const scheduleBoundaryIdle = () => {
		if (snapTimerId) {
			window.clearTimeout(snapTimerId);
		}
		snapTimerId = window.setTimeout(() => {
			snapTimerId = 0;
			if (!ownsInput()) return;
			startAnimation();
		}, WHEEL_IDLE_MS);
	};

	const applyInputPixels = (rawDeltaPixels) => {
		if (!ownsInput() || !Number.isFinite(rawDeltaPixels) || rawDeltaPixels === 0) {
			return false;
		}

		const carousel = getSceneCarousel();
		if (carousel.isInteractionLocked()) {
			return false;
		}

		if (rawDeltaPixels > 0) {
			scrollIntent = "forward";
		} else if (rawDeltaPixels < 0) {
			scrollIntent = "backward";
		}

		const pixelsPerUnit = getPixelsPerStoryUnit(target, rawDeltaPixels);
		target = clampStoryTarget(target + rawDeltaPixels / pixelsPerUnit);

		publish();
		startAnimation();
		scheduleBoundaryIdle();
		return true;
	};

	const jumpToStory = (nextStory) => {
		scrollIntent = null;
		getSceneCarousel().clearAboutBoundaryDrive();
		target = clamp(nextStory, 0, STORY_MAX);
		current = target;
		publish();
		startAnimation();
	};

	const jumpByStage = (direction) => {
		const stageIndex = storyToStageIndex(clampStoryVisual(target));
		const nextStageIndex = stageIndex + direction;
		if (states[nextStageIndex]) {
			jumpToStory(nextStageIndex);
			return;
		}

		/** Keyboard route leave: push target into overshoot like a strong wheel. */
		scrollIntent = direction > 0 ? "forward" : "backward";
		if (direction < 0) {
			target = STORY_TARGET_MIN;
		} else {
			target = STORY_TARGET_MAX;
		}
		publish();
		startAnimation();
	};

	const onWheel = (event) => {
		if (
			!ownsInput() ||
			event.defaultPrevented ||
			isSceneDevToolsWheelTarget(event) ||
			Math.abs(event.deltaY) < Math.abs(event.deltaX)
		) {
			return;
		}
		const delta = normalizeWheelDelta(event);
		if (delta === 0 || getSceneCarousel().isInteractionLocked()) {
			return;
		}
		event.preventDefault();
		applyInputPixels(delta);
	};

	const onKeyDown = (event) => {
		if (
			!ownsInput() ||
			event.defaultPrevented ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			isEditableTarget(event.target) ||
			getSceneCarousel().isInteractionLocked()
		) {
			return;
		}

		if (event.key === "Home") {
			event.preventDefault();
			jumpToStory(0);
			return;
		}
		if (event.key === "End") {
			event.preventDefault();
			jumpToStory(STORY_MAX);
			return;
		}

		let direction = 0;
		if (event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ") {
			direction = event.shiftKey && event.key === " " ? -1 : 1;
		} else if (event.key === "ArrowUp" || event.key === "PageUp") {
			direction = -1;
		}
		if (direction === 0) {
			return;
		}
		event.preventDefault();
		jumpByStage(direction);
	};

	const onTouchStart = (event) => {
		if (!ownsInput() || getSceneCarousel().isInteractionLocked()) {
			return;
		}
		if (event.touches.length !== 1) {
			touchId = null;
			scheduleBoundaryIdle();
			return;
		}
		touchId = event.touches[0].identifier;
		touchY = event.touches[0].clientY;
		if (snapTimerId) {
			window.clearTimeout(snapTimerId);
			snapTimerId = 0;
		}
	};

	const onTouchMove = (event) => {
		if (!ownsInput() || touchId === null || getSceneCarousel().isInteractionLocked()) {
			return;
		}
		if (event.touches.length !== 1) {
			touchId = null;
			scheduleBoundaryIdle();
			return;
		}
		const touch = Array.from(event.touches).find((item) => item.identifier === touchId);
		if (!touch) {
			return;
		}
		const delta = touchY - touch.clientY;
		touchY = touch.clientY;
		if (Math.abs(delta) < 0.1) {
			return;
		}
		event.preventDefault();
		applyInputPixels(delta * 1.12);
	};

	const onTouchEnd = (event) => {
		if (touchId === null) {
			return;
		}
		const remains = Array.from(event.touches).some((item) => item.identifier === touchId);
		if (!remains) {
			touchId = null;
			scheduleBoundaryIdle();
		}
	};

	const republishHudAfterRepaint = () => {
		const story = clampStoryVisual(current);
		const { from, to } = resolveAboutPanelHudStoryPair(story);
		reuploadAboutPanelHudWarmPool();
		publishAboutPanelHudPair(from, to, { upload: true });
		syncAboutPanelHudFromStory(story);
	};

	const unsubscribeLocale = subscribeKey(store, "siteLocale", () => {
		if (disposed || !ownsInput()) {
			return;
		}
		void playAboutPanelHudLocaleMix({
			getStoryProgress: () => clampStoryVisual(current),
			settleStory: (storyValue) => {
				// Smooth pre-settle may pass in-between values; pin spring to them.
				const next = clamp(Number(storyValue) || 0, 0, STORY_MAX);
				current = next;
				target = next;
				scrollIntent = null;
				publish();
			},
		}).then(() => {
			if (!disposed) {
				publish();
			}
		});
	});

	const onViewportResize = () => {
		if (disposed || !ownsInput()) {
			return;
		}
		void ensureAboutPanelHudCanvases({ force: true }).then((ok) => {
			if (!ok || disposed) {
				return;
			}
			republishHudAfterRepaint();
		});
	};

	liveResetHandler = (entryStory) => {
		if (disposed) return;
		current = clamp(entryStory, 0, STORY_MAX);
		target = current;
		scrollIntent = null;
		getSceneCarousel().clearAboutBoundaryDrive();
		publish();
	};

	experience.active = true;
	store.sceneCarouselLastCommitFromId = null;
	store.sceneCarouselLastCommitDirection = null;
	store.sceneCarouselLastCommitBoundaryOverflow = 0;
	const navigationOwner = {
		id: "about",
		sceneId: "about",
		snapshot: () => {
			const rest = resolveStoryRest(target, STORY_MAX);
			const carousel = getSceneCarousel();
			if (rest < 0) {
				return {
					current,
					target,
					rest,
					restPath: SCENE_ID_TO_PAGE[carousel.previousId] ?? "/portfolio",
					restSceneId: carousel.previousId,
					routeChanged: true,
				};
			}
			if (rest > STORY_MAX) {
				return {
					current,
					target,
					rest,
					restPath: SCENE_ID_TO_PAGE[carousel.nextId] ?? "/contacts",
					restSceneId: carousel.nextId,
					routeChanged: true,
				};
			}
			return {
				current,
				target,
				rest,
				restPath: "/about",
				restSceneId: "about",
				routeChanged: false,
			};
		},
		apply: (value, delta) => {
			current = value;
			target = value;
			scrollIntent = value < 0 ? "backward" : value > STORY_MAX ? "forward" : null;
			syncBoundaryDrive();
			publish();
			updateAboutFrontDissolveSound(delta, aboutStoryToFrontDissolve(current));
			updateAboutBackDissolveSound(delta, aboutStoryToBackDissolve(current));
			updateAboutPcbAppearSound(delta, aboutStoryToPcbReveal(current));
			if (current >= 0 && current <= STORY_MAX) {
				const mix = resolveAboutPanelHudStoryPair(clampStoryVisual(current)).mix;
				updateCaseStudyTextTransitionSound(delta, mix, mix);
			}
		},
		commit: () => {
			if (!tryCommitRouteLeave()) {
				scrollIntent = null;
				syncBoundaryDrive();
				publish();
			}
		},
	};
	const unregisterNavigationOwner = registerSiteNavigationProgressOwner(navigationOwner);

	void preloadCaseStudyTextTransitionSound();
	void preloadAboutFrontDissolveSound();
	void preloadAboutBackDissolveSound();
	void preloadAboutParticleSound();
	void preloadAboutPcbAppearSound();
	publish();
	// Same arm path as AboutScene — once per visit (no double prepare+enter).
	void armAboutPanelHudForRoute(clampStoryVisual(current));
	if (current !== target) {
		startAnimation();
	}

	window.addEventListener("wheel", onWheel, { passive: false, capture: true });
	window.addEventListener("keydown", onKeyDown);
	window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
	window.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
	window.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
	window.addEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });
	window.addEventListener("resize", onViewportResize);

	return () => {
		disposed = true;
		unregisterNavigationOwner();
		liveResetHandler = null;
		experience.active = false;
		getSceneCarousel().clearAboutBoundaryDrive();
		unsubscribeLocale();
		cancelAboutPanelHudLocaleMix();
		resetAboutPanelHudStorySession();
		resetCaseStudyTextTransitionSound();
		resetAboutFrontDissolveSound();
		resetAboutBackDissolveSound();
		resetAboutParticleSound();
		resetAboutPcbAppearSound();
		stopAnimation();
		if (snapTimerId) {
			window.clearTimeout(snapTimerId);
		}
		window.removeEventListener("wheel", onWheel, { capture: true });
		window.removeEventListener("keydown", onKeyDown);
		window.removeEventListener("touchstart", onTouchStart, { capture: true });
		window.removeEventListener("touchmove", onTouchMove, { capture: true });
		window.removeEventListener("touchend", onTouchEnd, { capture: true });
		window.removeEventListener("touchcancel", onTouchEnd, { capture: true });
		window.removeEventListener("resize", onViewportResize);
	};
}

export function isAboutExperienceRuntimeActive() {
	return disposeRuntime != null;
}

export function startAboutExperienceRuntime() {
	if (disposeRuntime) {
		return;
	}
	// Keep hex/warm visit arm — resetting forced a dirty republish that hitch the
	// first stage mosaic under continuous portfolio→about scroll.
	disposeRuntime = createAboutExperienceRuntime();
}

export function stopAboutExperienceRuntime() {
	if (!disposeRuntime) {
		return;
	}
	disposeRuntime();
	disposeRuntime = null;
}
