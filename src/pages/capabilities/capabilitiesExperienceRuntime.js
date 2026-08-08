import { store } from "@/app/store.jsx";
import { CAROUSEL_WHEEL_PROGRESS_FACTOR } from "@/three/render/transition/carouselScroll.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import {
	CAROUSEL_PROGRESS_CHASE_FINAL_SMOOTH_MUL,
	CAROUSEL_PROGRESS_CHASE_FINAL_THRESHOLD,
	CAROUSEL_PROGRESS_SMOOTH,
	applyLocalSegmentTargetRest,
	chaseSegmentValue,
	getAbsChaseSmoothMul,
} from "@/three/render/transition/segmentScrollSpring.js";
import {
	CAROUSEL_PROGRESS_COMMIT_EPS,
	CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE,
	CAROUSEL_PROGRESS_SEGMENT_BACK_END,
	CAROUSEL_PROGRESS_TARGET_MAX,
	CAROUSEL_PROGRESS_TARGET_MIN,
	SCENE_ID_TO_PAGE,
} from "@/three/render/transition/SceneCarousel.js";
import {
	registerSiteNavigationProgressOwner,
	resolveStoryRest,
} from "@/three/render/transition/siteNavigationProgressOwner.js";
import { publishSiteRouteTransition } from "@/three/render/transition/siteTransitionIntent.js";
import { isSceneDevToolsWheelTarget } from "@/three/dev/sceneDevPanelUtils.js";
import { CAPABILITIES as states } from "./data/capabilities.js";
import mmk1TextStates from "@/pages/portfolio/projects/mmk1/states.js";
import lightTrailsHudProject from "./lightTrails/lightTrailsHudProject.js";
import { setStageProgressState } from "@/pages/portfolio/core/stageProgress.js";
import { setCasePanelHudEnterProgress } from "@/pages/portfolio/core/casePanelHudBridge.js";
import {
	resetCapabilitiesInternalHex,
	setCapabilitiesInternalHexProgress,
} from "@/three/render/transition/capabilitiesInternalHex.js";
import {
	requestCaseStudyScrollRepaint,
	requestSiteArcScrollRepaint,
} from "@/pages/portfolio/core/caseStudyAnimationFrame.js";

// Story stops are capability indices. Two capabilities have one internal
// segment (0 -> 1); the next segment is already the route boundary.
const STORY_MAX = Math.max(1, states.length - 1);
const CAPABILITY_STAGE_INTERVALS = Math.max(1, states.length - 1);
const CAPABILITIES_WHEEL_STRENGTH = 1.5;
const CAPABILITIES_SPRING_RATES = {
	returnSmooth: 0.7,
	advanceSmooth: 0.7,
	retreatSmooth: 0.7,
	finalMul: 6,
};
const CAPABILITIES_PROGRESS_SMOOTH = 2.2;
const CAPABILITIES_PROGRESS_CHASE_FINAL_SMOOTH_MUL = 1.35;
const WHEEL_IDLE_MS = 180;
const LINE_HEIGHT_PX = 16;
const MAX_WHEEL_VIEWPORT_RATIO = 0.9;
const TARGET_REST_EPS = 0.00005;
const STORY_TARGET_MIN = CAROUSEL_PROGRESS_TARGET_MIN;
const STORY_TARGET_MAX = STORY_MAX + CAROUSEL_PROGRESS_TARGET_MAX;

let disposeRuntime = null;
let liveResetHandler = null;

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function clampStoryTarget(value) {
	return clamp(value, STORY_TARGET_MIN, STORY_TARGET_MAX);
}

function clampStoryVisual(value) {
	return clamp(value, 0, STORY_MAX);
}

function storyToStageIndex(story) {
	const visual = clampStoryVisual(story);
	if (visual >= STORY_MAX - 1e-9) return states.length - 1;
	return clamp(Math.floor(visual), 0, states.length - 1);
}

function storyToStageLocal(story) {
	const visual = clampStoryVisual(story);
	if (visual >= STORY_MAX - 1e-9) return 1;
	return clamp(visual - storyToStageIndex(visual), 0, 1);
}

function getPixelsPerStoryUnit(storyTarget, deltaPixels) {
	const isEdge = storyTarget < 0 || storyTarget > STORY_MAX;
	const leavesBackward = deltaPixels < 0 && storyTarget <= CAROUSEL_PROGRESS_COMMIT_EPS;
	const leavesForward = deltaPixels > 0 && storyTarget >= STORY_MAX - CAROUSEL_PROGRESS_COMMIT_EPS;
	if (isEdge || leavesBackward || leavesForward) {
		return 1 / CAROUSEL_WHEEL_PROGRESS_FACTOR;
	}
	return CAPABILITY_STAGE_INTERVALS
		/ (CAROUSEL_WHEEL_PROGRESS_FACTOR * CAPABILITIES_WHEEL_STRENGTH);
}

function applyStoryTargetRest(storyTarget, delta) {
	const story = clampStoryTarget(storyTarget);
	if (story < 0) {
		return applyLocalSegmentTargetRest(story, delta);
	}
	if (story >= STORY_MAX) {
		return STORY_MAX + applyLocalSegmentTargetRest(story - STORY_MAX, delta);
	}
	if (story <= CAROUSEL_PROGRESS_COMMIT_EPS) return 0;

	const segment = Math.floor(story + 1e-12);
	let local = story - segment;
	if (local <= TARGET_REST_EPS) return segment;
	if (local >= 1 - TARGET_REST_EPS) return Math.min(STORY_MAX, segment + 1);
	local = applyLocalSegmentTargetRest(local, delta, CAPABILITIES_SPRING_RATES);
	return clamp(segment + local, 0, STORY_TARGET_MAX);
}

function getStoryChaseConfig(current, target) {
	const onEdge = current < 0 || current > STORY_MAX || target < 0 || target > STORY_MAX;
	let local;
	if (current < 0) local = Math.abs(current);
	else if (current >= STORY_MAX) local = current - STORY_MAX;
	else if (target < 0) local = Math.abs(target);
	else if (target > STORY_MAX) local = target - STORY_MAX;
	else local = storyToStageLocal(current);
	return {
		smooth: onEdge ? CAROUSEL_PROGRESS_SMOOTH : CAPABILITIES_PROGRESS_SMOOTH,
		chaseMul: getAbsChaseSmoothMul(local, {
			threshold: CAROUSEL_PROGRESS_CHASE_FINAL_THRESHOLD,
			mul: onEdge
				? CAROUSEL_PROGRESS_CHASE_FINAL_SMOOTH_MUL
				: CAPABILITIES_PROGRESS_CHASE_FINAL_SMOOTH_MUL,
		}),
	};
}

function snapStoryPair(current, target) {
	let nextCurrent = current;
	let nextTarget = target;
	const restPoints = [CAROUSEL_PROGRESS_SEGMENT_BACK_END];
	for (let index = 0; index <= STORY_MAX; index += 1) restPoints.push(index);
	restPoints.push(STORY_MAX + 1);
	for (const rest of restPoints) {
		if (Math.abs(nextTarget - rest) >= CAROUSEL_PROGRESS_COMMIT_EPS) continue;
		nextTarget = rest;
		if (Math.abs(nextCurrent - rest) < CAROUSEL_PROGRESS_COMMIT_EPS) {
			nextCurrent = rest;
		} else if (
			rest === CAROUSEL_PROGRESS_SEGMENT_BACK_END
			&& nextCurrent <= rest + CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE
		) {
			nextCurrent = rest;
		} else if (
			rest > 0
			&& nextCurrent >= rest - CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE
		) {
			nextCurrent = rest;
		}
		break;
	}
	return { current: nextCurrent, target: nextTarget };
}

function storyNeedsAnimation(current, target) {
	if (Math.abs(target - current) > CAROUSEL_PROGRESS_COMMIT_EPS) return true;
	if (target < -CAROUSEL_PROGRESS_COMMIT_EPS || target > STORY_MAX + CAROUSEL_PROGRESS_COMMIT_EPS) return true;
	const local = target >= STORY_MAX ? target - STORY_MAX : target - Math.floor(target + 1e-12);
	return local > CAROUSEL_PROGRESS_COMMIT_EPS && local < 1 - CAROUSEL_PROGRESS_COMMIT_EPS;
}

function normalizeWheelDelta(event) {
	let delta = event.deltaY;
	if (event.deltaMode === 1) delta *= LINE_HEIGHT_PX;
	else if (event.deltaMode === 2) delta *= window.innerHeight;
	const limit = Math.max(480, window.innerHeight * MAX_WHEEL_VIEWPORT_RATIO);
	return clamp(delta, -limit, limit);
}

function isEditableTarget(target) {
	return target instanceof Element
		&& Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function resolveEntryStory() {
	const isClickEntry = store.sceneCarouselClickTargetId === "capabilities"
		&& store.sceneCarouselClickPhase !== "idle";
	const fromAbout = !isClickEntry
		&& store.sceneCarouselLastCommitFromId === "about"
		&& store.sceneCarouselLastCommitDirection === "backward";
	const initialStory = fromAbout ? STORY_MAX : 0;
	const overflow = !isClickEntry ? Number(store.sceneCarouselLastCommitBoundaryOverflow ?? 0) : 0;
	const initialTarget = Number.isFinite(overflow) && Math.abs(overflow) > 1e-6
		? clampStoryTarget(initialStory + overflow)
		: initialStory;
	return { initialStory, initialTarget };
}

export function resetCapabilitiesExperienceState({ entryStory = 0 } = {}) {
	const story = clamp(entryStory, 0, STORY_MAX);
	liveResetHandler?.(story);
}

function createRuntime() {
	const entry = resolveEntryStory();
	let current = entry.initialStory;
	let target = entry.initialTarget;
	let rafId = 0;
	let snapTimerId = 0;
	let previousFrameAt = performance.now();
	let touchId = null;
	let touchY = 0;
	let disposed = false;
	let transitionPublished = false;
	let scrollIntent = null;
	let inputBurstAnchor = null;
	let inputBurstDirection = 0;
	let inputBurstAt = 0;
	let publishedStageId = states[storyToStageIndex(current)]?.id ?? null;

	const ownsInput = () => {
		const carousel = getSceneCarousel();
		return carousel.currentId === "capabilities" && !carousel.isInteractionLocked();
	};

	const publish = () => {
		const visualCurrent = clampStoryVisual(current);
		const visualTarget = clampStoryVisual(target);
		const stageIndex = storyToStageIndex(visualCurrent);
		const nextStageId = states[stageIndex]?.id ?? states[0]?.id ?? null;
		const stageChanged = nextStageId !== publishedStageId;
		// Hide the shared HUD before publishing the target identity. Otherwise the
		// prepared target texture can inherit the previous idle-null reveal for a frame.
		if (stageChanged && nextStageId === "light-trails") {
			setCasePanelHudEnterProgress(0);
		}
		const capabilityProgress = visualCurrent / STORY_MAX;
		const capabilityProgressTarget = visualTarget / STORY_MAX;
		store.capabilitiesExperience.active = true;
		store.capabilitiesExperience.activeStageIndex = stageIndex;
		store.capabilitiesExperience.activeStageId = nextStageId;
		store.capabilitiesExperience.storyProgress = visualCurrent;
		store.capabilitiesExperience.storyProgressTarget = visualTarget;
		store.capabilitiesExperience.progress = capabilityProgress;
		store.capabilitiesExperience.progressTarget = capabilityProgressTarget;
		store.capabilitiesExperience.stagePosition = Math.min(states.length - 1, visualCurrent);
		setCapabilitiesInternalHexProgress(visualCurrent);

		// The capability owns one stable primary text. Scene interactions may
		// explicitly replace it later, but page scroll never walks MMK-1 case copy.
		const activeCapability = states[stageIndex];
		const isLightTrails = activeCapability?.id === "light-trails";
		if (stageChanged) {
			publishedStageId = nextStageId;
		}
		const activeTextState = isLightTrails
			? lightTrailsHudProject.states[0]
			: mmk1TextStates[0];
		store.portfolioExperience.slug = isLightTrails
			? lightTrailsHudProject.config.slug
			: "mmk1";
		store.portfolioExperience.activeStateIndex = 0;
		store.portfolioExperience.activeStateId = activeTextState?.id ?? null;
		store.portfolioExperience.storyProgress = visualCurrent;
		store.portfolioExperience.storyProgressTarget = visualTarget;
		store.portfolioExperience.stageProgress = 0;
		store.portfolioExperience.stageProgressTarget = 0;
		store.scroll = capabilityProgress;
		store.caseScrollTarget = capabilityProgressTarget;
		setStageProgressState(0);
		requestCaseStudyScrollRepaint();
		requestSiteArcScrollRepaint();
	};

	const syncBoundaryDrive = () => {
		const carousel = getSceneCarousel();
		if (current < 0 || target < 0) {
			if (!transitionPublished) {
				transitionPublished = true;
				publishSiteRouteTransition("/capabilities", SCENE_ID_TO_PAGE[carousel.previousId] ?? "/portfolio", { mode: "ring" });
			}
			carousel.adoptCapabilitiesBoundaryDrive(
				clamp(Math.min(current, 0), STORY_TARGET_MIN, 0),
				clamp(Math.min(target, 0), STORY_TARGET_MIN, 0),
				"backward",
			);
			return;
		}
		if (current > STORY_MAX || target > STORY_MAX) {
			if (!transitionPublished) {
				transitionPublished = true;
				publishSiteRouteTransition("/capabilities", SCENE_ID_TO_PAGE[carousel.nextId] ?? "/about", { mode: "ring" });
			}
			carousel.adoptCapabilitiesBoundaryDrive(
				clamp(Math.max(current - STORY_MAX, 0), 0, CAROUSEL_PROGRESS_TARGET_MAX),
				clamp(Math.max(target - STORY_MAX, 0), 0, CAROUSEL_PROGRESS_TARGET_MAX),
				"forward",
			);
			return;
		}
		if (carousel.isCapabilitiesBoundaryDrive()) {
			transitionPublished = false;
			carousel.clearCapabilitiesBoundaryDrive();
			carousel.progressTarget = 0;
			carousel.scrollIntent = null;
		}
	};

	const tryCommitLeave = () => {
		const carousel = getSceneCarousel();
		if (scrollIntent === "backward" && current <= CAROUSEL_PROGRESS_SEGMENT_BACK_END + CAROUSEL_PROGRESS_COMMIT_EPS) {
			syncBoundaryDrive();
			carousel.commitCapabilitiesRouteLeave("backward");
			return true;
		}
		if (scrollIntent === "forward" && current >= STORY_MAX + 1 - CAROUSEL_PROGRESS_COMMIT_EPS) {
			syncBoundaryDrive();
			carousel.commitCapabilitiesRouteLeave("forward");
			return true;
		}
		return false;
	};

	const tick = (now) => {
		rafId = 0;
		if (disposed) return;
		if (!ownsInput()) {
			if (getSceneCarousel().currentId === "capabilities" && storyNeedsAnimation(current, target)) {
				previousFrameAt = now;
				rafId = requestAnimationFrame(tick);
			}
			return;
		}

		const dt = Math.min(0.05, Math.max(0, (now - previousFrameAt) / 1000));
		previousFrameAt = now;
		target = applyStoryTargetRest(target, dt);
		current = chaseSegmentValue(current, target, dt, getStoryChaseConfig(current, target));
		({ current, target } = snapStoryPair(current, target));
		if (target >= STORY_MAX + 1 - CAROUSEL_PROGRESS_COMMIT_EPS
			&& current >= STORY_MAX + 1 - CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE) {
			current = STORY_MAX + 1;
			target = STORY_MAX + 1;
		}
		syncBoundaryDrive();
		if (tryCommitLeave()) return;
		publish();
		if (storyNeedsAnimation(current, target)) rafId = requestAnimationFrame(tick);
	};

	const startAnimation = () => {
		if (rafId || disposed) return;
		previousFrameAt = performance.now();
		rafId = requestAnimationFrame(tick);
	};

	const scheduleIdle = () => {
		if (snapTimerId) clearTimeout(snapTimerId);
		snapTimerId = window.setTimeout(() => {
			snapTimerId = 0;
			inputBurstAnchor = null;
			inputBurstDirection = 0;
			if (ownsInput()) startAnimation();
		}, WHEEL_IDLE_MS);
	};

	const applyInputPixels = (deltaPixels) => {
		if (!ownsInput() || !Number.isFinite(deltaPixels) || deltaPixels === 0) return false;
		const direction = deltaPixels > 0 ? 1 : -1;
		const now = performance.now();
		const beginsBurst = inputBurstAnchor == null
			|| inputBurstDirection !== direction
			|| now - inputBurstAt > WHEEL_IDLE_MS;
		if (beginsBurst) {
			const interiorTarget = clamp(target, STORY_TARGET_MIN, STORY_TARGET_MAX);
			inputBurstAnchor = direction > 0
				? Math.floor(interiorTarget + TARGET_REST_EPS)
				: Math.ceil(interiorTarget - TARGET_REST_EPS);
			inputBurstDirection = direction;
		}
		inputBurstAt = now;
		scrollIntent = direction > 0 ? "forward" : "backward";
		const rawTarget = target + deltaPixels / getPixelsPerStoryUnit(target, deltaPixels);
		const burstBoundary = clampStoryTarget(inputBurstAnchor + direction);
		target = direction > 0
			? Math.min(clampStoryTarget(rawTarget), burstBoundary)
			: Math.max(clampStoryTarget(rawTarget), burstBoundary);
		publish();
		startAnimation();
		scheduleIdle();
		return true;
	};

	const jumpToStory = (story) => {
		scrollIntent = null;
		inputBurstAnchor = null;
		inputBurstDirection = 0;
		getSceneCarousel().clearCapabilitiesBoundaryDrive();
		current = clamp(story, 0, STORY_MAX);
		target = current;
		publish();
	};

	const onWheel = (event) => {
		if (!ownsInput() || event.defaultPrevented || isSceneDevToolsWheelTarget(event)
			|| Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
		const delta = normalizeWheelDelta(event);
		if (delta === 0) return;
		event.preventDefault();
		applyInputPixels(delta);
	};

	const onKeyDown = (event) => {
		if (!ownsInput() || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey
			|| isEditableTarget(event.target)) return;
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
		if (event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ") direction = 1;
		else if (event.key === "ArrowUp" || event.key === "PageUp") direction = -1;
		if (!direction) return;
		event.preventDefault();
		const stage = storyToStageIndex(clampStoryVisual(target));
		const next = stage + direction;
		if (next >= 0 && next < states.length) jumpToStory(next);
		else {
			scrollIntent = direction > 0 ? "forward" : "backward";
			target = direction > 0 ? STORY_TARGET_MAX : STORY_TARGET_MIN;
			startAnimation();
		}
	};

	const onTouchStart = (event) => {
		if (!ownsInput() || event.touches.length !== 1) return;
		inputBurstAnchor = null;
		inputBurstDirection = 0;
		touchId = event.touches[0].identifier;
		touchY = event.touches[0].clientY;
	};
	const onTouchMove = (event) => {
		if (!ownsInput() || touchId == null || event.touches.length !== 1) return;
		const touch = Array.from(event.touches).find((item) => item.identifier === touchId);
		if (!touch) return;
		const delta = touchY - touch.clientY;
		touchY = touch.clientY;
		if (Math.abs(delta) < 0.1) return;
		event.preventDefault();
		applyInputPixels(delta * 1.12);
	};
	const onTouchEnd = (event) => {
		if (touchId == null) return;
		if (!Array.from(event.touches).some((item) => item.identifier === touchId)) {
			touchId = null;
			scheduleIdle();
		}
	};

	liveResetHandler = jumpToStory;
	store.sceneCarouselLastCommitFromId = null;
	store.sceneCarouselLastCommitDirection = null;
	store.sceneCarouselLastCommitBoundaryOverflow = 0;
	const unregisterNavigationOwner = registerSiteNavigationProgressOwner({
		id: "capabilities",
		sceneId: "capabilities",
		snapshot: () => {
			const rest = resolveStoryRest(target, STORY_MAX);
			const carousel = getSceneCarousel();
			if (rest < 0) return {
				current, target, rest, storyMax: STORY_MAX, routeChanged: true,
				restPath: SCENE_ID_TO_PAGE[carousel.previousId] ?? "/portfolio",
				restSceneId: carousel.previousId,
			};
			if (rest > STORY_MAX) return {
				current, target, rest, storyMax: STORY_MAX, routeChanged: true,
				restPath: SCENE_ID_TO_PAGE[carousel.nextId] ?? "/about",
				restSceneId: carousel.nextId,
			};
			return {
				current, target, rest, storyMax: STORY_MAX, routeChanged: false,
				restPath: "/capabilities", restSceneId: "capabilities",
			};
		},
		apply: (value) => {
			current = value;
			target = value;
			scrollIntent = value < 0 ? "backward" : value > STORY_MAX ? "forward" : null;
			syncBoundaryDrive();
			publish();
		},
		commit: () => {
			if (!tryCommitLeave()) {
				scrollIntent = null;
				syncBoundaryDrive();
				publish();
			}
		},
	});

	publish();
	if (current !== target) startAnimation();
	window.addEventListener("wheel", onWheel, { passive: false, capture: true });
	window.addEventListener("keydown", onKeyDown);
	window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
	window.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
	window.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
	window.addEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });

	return () => {
		disposed = true;
		resetCapabilitiesInternalHex();
		store.capabilitiesExperience.active = false;
		liveResetHandler = null;
		unregisterNavigationOwner();
		getSceneCarousel().clearCapabilitiesBoundaryDrive();
		if (rafId) cancelAnimationFrame(rafId);
		if (snapTimerId) clearTimeout(snapTimerId);
		window.removeEventListener("wheel", onWheel, { capture: true });
		window.removeEventListener("keydown", onKeyDown);
		window.removeEventListener("touchstart", onTouchStart, { capture: true });
		window.removeEventListener("touchmove", onTouchMove, { capture: true });
		window.removeEventListener("touchend", onTouchEnd, { capture: true });
		window.removeEventListener("touchcancel", onTouchEnd, { capture: true });
	};
}

export function startCapabilitiesExperienceRuntime() {
	if (!disposeRuntime) disposeRuntime = createRuntime();
}

export function stopCapabilitiesExperienceRuntime() {
	if (!disposeRuntime) return;
	disposeRuntime();
	disposeRuntime = null;
}
