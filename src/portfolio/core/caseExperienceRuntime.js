/**
 * Case story/wheel owner — same spring *shape* as About, but full carousel feel
 * for interior stages and edge leave (no About-soft slowdown).
 *
 * Interior → store.scroll + stageProgress (arc / HUD / 3D).
 * Edge leave → case-boundary hex (adjacent cases), not ring pages.
 */
import { store } from "@/store.jsx";
import { resolveSceneId } from "@/three/scenes/resolveSceneId.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { CAROUSEL_WHEEL_PROGRESS_FACTOR } from "@/three/render/transition/carouselScroll.js";
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
import { resolveCaseProjectCanvasNavigationData } from "@/portfolio/ui/CaseStudyCanvas/caseProjectCanvasNavigation.js";
import { setPendingCaseChromeNav } from "@/portfolio/core/caseChromePendingNav.js";
import { promoteCasePanelHudCanvases } from "@/portfolio/core/casePanelHudBridge.js";
import { setStageProgressState } from "@/portfolio/core/stageProgress.js";
import { isSceneDevToolsWheelTarget } from "@/three/dev/sceneDevPanelUtils.js";
import { requestCaseStudyScrollRepaint } from "@/portfolio/core/caseStudyAnimationFrame.js";
import { normalizeSitePath, setHexVisualPath } from "@/utils/hexNavigation.js";
import { publishSiteRouteTransition } from "@/three/render/transition/siteTransitionIntent.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { commitCasePanelHudScrollLeave, isCasePanelHudRevealBusy } from "@/portfolio/core/casePanelHudReveal.js";
import { isCaseStageClickMosaicActive } from "@/portfolio/core/caseStageClickMosaic.js";
import { preloadCaseStudyTextTransitionSound, resetCaseStudyTextTransitionSound, updateCaseStudyTextTransitionSound } from "@/sounds/caseStudyTextTransitionSound.js";
import {
	registerSiteNavigationProgressOwner,
	resolveStoryRest,
} from "@/three/render/transition/siteNavigationProgressOwner.js";

/** Default carousel rest rates (empty → segmentScrollSpring defaults). */
const CAROUSEL_SPRING_RATES = {};
const WHEEL_IDLE_MS = 180;
const LINE_HEIGHT_PX = 16;
const MAX_WHEEL_VIEWPORT_RATIO = 0.9;
const TARGET_REST_EPS = 0.00005;

/** @type {null | (() => void)} */
let disposeRuntime = null;
/** @type {null | ((story: number) => void)} */
let liveJumpHandler = null;

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
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

function isEditableTarget(target) {
	return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

/**
 * @param {{
 *   project: import('./types.js').PortfolioProjectModule,
 *   commitStageStep: (direction: 'forward' | 'backward') => boolean,
 *   allowCaseLeave?: boolean,
 * }} args
 */
function createCaseExperienceRuntime({ project, commitStageStep, allowCaseLeave = true }) {
	const states = project.states ?? [];
	const lastIndex = Math.max(0, states.length - 1);
	/** Last state is terminal content at penultimate@1 — story span matches About stages. */
	const STORY_MAX = Math.max(1, lastIndex);
	const STORY_TARGET_MIN = allowCaseLeave ? CAROUSEL_PROGRESS_TARGET_MIN : 0;
	const STORY_TARGET_MAX = allowCaseLeave ? STORY_MAX + CAROUSEL_PROGRESS_TARGET_MAX : STORY_MAX;

	let current = 0;
	let target = 0;
	let rafId = 0;
	let snapTimerId = 0;
	let previousFrameAt = performance.now();
	let lastPublishedStage = -1;
	let touchId = null;
	let touchY = 0;
	let disposed = false;
	/** @type {'forward' | 'backward' | null} */
	let scrollIntent = null;
	let boundaryPairReady = false;
	// At STORY_MAX the shader normally shows the terminal state as mapTo@1.
	// Before a forward boundary owns the frame, commit it to mapFrom@0 so the
	// exact visible terminal content is also the texture baked into hex.
	let terminalHudCommitted = false;
	/** Cached once per boundary pair — avoid resolveCaseProjectCanvasNavigationData every spring tick. */
	let cachedBoundaryChrome = null;

	/** Same px → unit as SceneCarousel (~1000px per story segment). */
	const getPixelsPerStoryUnit = () => 1 / CAROUSEL_WHEEL_PROGRESS_FACTOR;

	const clampStoryTarget = (value) => clamp(value, STORY_TARGET_MIN, STORY_TARGET_MAX);
	const clampStoryVisual = (value) => clamp(value, 0, STORY_MAX);

	const storyToStageIndex = (story) => {
		const visual = clampStoryVisual(story);
		if (terminalHudCommitted && visual >= STORY_MAX - 1e-9) return lastIndex;
		if (visual >= STORY_MAX - 1e-9) return Math.max(0, STORY_MAX - 1);
		return clamp(Math.floor(visual), 0, Math.max(0, STORY_MAX - 1));
	};

	const storyToStageLocal = (story) => {
		const visual = clampStoryVisual(story);
		if (terminalHudCommitted && visual >= STORY_MAX - 1e-9) return 0;
		if (visual >= STORY_MAX - 1e-9) return 1;
		const index = storyToStageIndex(visual);
		return clamp(visual - index, 0, 1);
	};

	const applyStageTargetRest = (storyTarget, delta) => {
		const story = clampStoryTarget(storyTarget);
		if (story < 0) {
			return applyLocalSegmentTargetRest(story, delta, CAROUSEL_SPRING_RATES);
		}
		if (story >= STORY_MAX) {
			const local = applyLocalSegmentTargetRest(story - STORY_MAX, delta, CAROUSEL_SPRING_RATES);
			return STORY_MAX + local;
		}
		if (story <= CAROUSEL_PROGRESS_COMMIT_EPS) return 0;
		const segment = Math.floor(story + 1e-12);
		let local = story - segment;
		if (local <= TARGET_REST_EPS) return segment;
		if (local >= 1 - TARGET_REST_EPS) return Math.min(STORY_MAX, segment + 1);
		local = applyLocalSegmentTargetRest(local, delta, CAROUSEL_SPRING_RATES);
		return clamp(segment + local, 0, STORY_TARGET_MAX);
	};

	const getStoryChaseConfig = (storyProgress, storyTarget = storyProgress) => {
		let absLocal;
		if (storyProgress < 0) absLocal = Math.abs(storyProgress);
		else if (storyProgress >= STORY_MAX) absLocal = storyProgress - STORY_MAX;
		else if (storyTarget < 0) absLocal = Math.abs(storyTarget);
		else if (storyTarget > STORY_MAX) absLocal = storyTarget - STORY_MAX;
		else absLocal = storyToStageLocal(storyProgress);
		return {
			smooth: CAROUSEL_PROGRESS_SMOOTH,
			chaseMul: getAbsChaseSmoothMul(absLocal, {
				threshold: CAROUSEL_PROGRESS_CHASE_FINAL_THRESHOLD,
				mul: CAROUSEL_PROGRESS_CHASE_FINAL_SMOOTH_MUL,
			}),
		};
	};

	const snapStoryPair = (cur, tgt) => {
		const eps = CAROUSEL_PROGRESS_COMMIT_EPS;
		let nextTarget = tgt;
		let nextCurrent = cur;
		const restPoints = [CAROUSEL_PROGRESS_SEGMENT_BACK_END];
		for (let i = 0; i <= STORY_MAX; i += 1) restPoints.push(i);
		restPoints.push(STORY_MAX + 1);
		for (let i = 0; i < restPoints.length; i += 1) {
			const rest = restPoints[i];
			if (Math.abs(nextTarget - rest) < eps) {
				nextTarget = rest;
				if (Math.abs(nextCurrent - nextTarget) < eps) {
					nextCurrent = nextTarget;
				} else if (rest === CAROUSEL_PROGRESS_SEGMENT_BACK_END && nextCurrent <= rest + CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE) {
					nextCurrent = rest;
				} else if (rest > 0 && nextTarget === rest && nextCurrent >= rest - CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE) {
					nextCurrent = rest;
				}
				break;
			}
		}
		return { current: nextCurrent, target: nextTarget };
	};

	const storyNeedsAnimation = (cur, tgt) => {
		const eps = CAROUSEL_PROGRESS_COMMIT_EPS;
		if (Math.abs(tgt - cur) > eps) return true;
		if (tgt < -eps || tgt > STORY_MAX + eps) return true;
		if (tgt <= eps || Math.abs(tgt - STORY_MAX) <= eps) return false;
		if (tgt >= STORY_MAX) {
			const local = tgt - STORY_MAX;
			return local > eps && local < 1 - eps;
		}
		const local = tgt - Math.floor(tgt + 1e-12);
		return local > eps && local < 1 - eps;
	};

	const ownsInput = () => {
		const carousel = getSceneCarousel();
		return (
			store.openedCase === true &&
			!disposed &&
			!carousel.isInteractionLocked() &&
			!carousel.isCaseBoundaryAwaitingRoute() &&
			!isCasePanelHudRevealBusy() &&
			!isCaseStageClickMosaicActive()
		);
	};

	const ensureBoundaryPair = () => {
		if (boundaryPairReady || !allowCaseLeave) {
			return boundaryPairReady;
		}
		const locale = normalizeSiteLocale(store.siteLocale);
		const nav = resolveCaseProjectCanvasNavigationData(project, locale);
		if (!nav?.nextProject || !nav?.previousProject) {
			return false;
		}
		const sourcePath = normalizeSitePath(project.config.route);
		const sourceId = resolveSceneId(sourcePath);
		const forwardPath = normalizeSitePath(nav.nextProject.config.route);
		const backwardPath = normalizeSitePath(nav.previousProject.config.route);
		const forwardId = resolveSceneId(forwardPath);
		const backwardId = resolveSceneId(backwardPath);
		if (!sourceId?.startsWith("case") || !forwardId?.startsWith("case") || !backwardId?.startsWith("case")) {
			return false;
		}
		const started = getSceneCarousel().beginCaseBoundaryDrive({
			sourceId,
			forwardTargetId: forwardId,
			forwardTargetPath: forwardPath,
			backwardTargetId: backwardId,
			backwardTargetPath: backwardPath,
		});
		boundaryPairReady = started;
		if (started) {
			const forwardData = resolveCaseProjectCanvasNavigationData(nav.nextProject, locale);
			const backwardData = resolveCaseProjectCanvasNavigationData(nav.previousProject, locale);
			cachedBoundaryChrome = {
				forward: {
					projectId: nav.nextProject.config.id,
					route: forwardPath,
					data: forwardData,
				},
				backward: {
					projectId: nav.previousProject.config.id,
					route: backwardPath,
					data: backwardData,
				},
			};
			getSceneCarousel().setOnCaseBoundaryCommit((payload) => {
				const from = sourcePath;
				const to = normalizeSitePath(payload.path);
				// One leave decision — chrome band exit + flags (SITE_TRANSITION.md).
				publishSiteRouteTransition(from, to, { mode: "case-boundary" });
				if (getSceneCarousel().isNavigationSettleAwaitingRoute()) {
					store.sceneCarouselSkipHtmlExit = true;
					store.sceneCarouselDisplayPath = to;
					return;
				}
				setHexVisualPath(to);
				// Same as ring scroll commit — skip HTML exiting wipe (kills Case1 activePage/bloom).
				store.sceneCarouselSkipHtmlExit = true;
				store.sceneCarouselNavigatePath = to;
			});
		}
		return boundaryPairReady;
	};

	const syncPendingChrome = () => {
		if (!allowCaseLeave || !cachedBoundaryChrome) return;
		const leaveDir = current < -CAROUSEL_PROGRESS_COMMIT_EPS || target < -CAROUSEL_PROGRESS_COMMIT_EPS ? "backward" : "forward";
		const payload = leaveDir === "backward" ? cachedBoundaryChrome.backward : cachedBoundaryChrome.forward;
		if (payload) {
			setPendingCaseChromeNav(payload);
		}
	};

	const clearBoundaryPair = () => {
		boundaryPairReady = false;
		cachedBoundaryChrome = null;
	};

	/** Ignore 1px edge peek — adopting drive starts hex; translucent HUD over
	 *  hex-border glow reads as a brightness jump (opaque models do not). */
	const LEAVE_ADOPT_EPS = 0.03;

	const syncBoundaryDrive = () => {
		const carousel = getSceneCarousel();
		if (!allowCaseLeave) {
			carousel.clearCaseBoundaryDrive();
			clearBoundaryPair();
			return;
		}
		if (current < -LEAVE_ADOPT_EPS || target < -LEAVE_ADOPT_EPS) {
			if (!ensureBoundaryPair()) return;
			syncPendingChrome();
			carousel.adoptCaseBoundaryDrive(clamp(Math.min(current, 0), CAROUSEL_PROGRESS_TARGET_MIN, 0), clamp(Math.min(target, 0), CAROUSEL_PROGRESS_TARGET_MIN, 0), "backward");
			return;
		}
		if (current > STORY_MAX + LEAVE_ADOPT_EPS || target > STORY_MAX + LEAVE_ADOPT_EPS) {
			if (!ensureBoundaryPair()) return;
			terminalHudCommitted = true;
			syncPendingChrome();
			carousel.adoptCaseBoundaryDrive(
				clamp(Math.max(current - STORY_MAX, 0), 0, CAROUSEL_PROGRESS_TARGET_MAX),
				clamp(Math.max(target - STORY_MAX, 0), 0, CAROUSEL_PROGRESS_TARGET_MAX),
				"forward",
			);
			return;
		}
		if (
			terminalHudCommitted
			&& (current < STORY_MAX - CAROUSEL_PROGRESS_COMMIT_EPS || target < STORY_MAX - CAROUSEL_PROGRESS_COMMIT_EPS)
		) {
			// A reversed/cancelled boundary returns through the same ordinary stage
			// commit path, restoring the previous→terminal map pair without a snap.
			terminalHudCommitted = false;
		}
		if (carousel.isCaseBoundaryDrive() && !carousel.isCaseBoundaryAwaitingRoute()) {
			// clearCaseBoundaryDrive zeros progress — required so HUD hex-cut / hex
			// shader do not keep a stale leave progress after cancel.
			carousel.clearCaseBoundaryDrive();
			clearBoundaryPair();
		}
	};

	const tryCommitRouteLeave = () => {
		if (!allowCaseLeave) return false;
		const eps = CAROUSEL_PROGRESS_COMMIT_EPS;
		const carousel = getSceneCarousel();
		if (scrollIntent === "backward" && current <= CAROUSEL_PROGRESS_SEGMENT_BACK_END + eps) {
			syncBoundaryDrive();
			const payload = carousel.commitCaseBoundaryLeave("backward");
			if (payload) {
				commitCasePanelHudScrollLeave();
				current = 0;
				target = 0;
				scrollIntent = null;
				clearBoundaryPair();
				publish();
				return true;
			}
		}
		if (scrollIntent === "forward" && current >= STORY_MAX + 1 - eps) {
			syncBoundaryDrive();
			const payload = carousel.commitCaseBoundaryLeave("forward");
			if (payload) {
				commitCasePanelHudScrollLeave();
				current = STORY_MAX;
				target = STORY_MAX;
				scrollIntent = null;
				clearBoundaryPair();
				publish();
				return true;
			}
		}
		return false;
	};

	const publish = () => {
		const visualCurrent = clampStoryVisual(current);
		const visualTarget = clampStoryVisual(target);
		const stageIndex = storyToStageIndex(visualCurrent);
		const stageLocal = storyToStageLocal(visualCurrent);
		const stageLocalTarget = storyToStageLocal(visualTarget);
		const scrollNorm = visualCurrent / STORY_MAX;
		const scrollNormTarget = visualTarget / STORY_MAX;
		const stateId = states[stageIndex]?.id ?? null;

		if (stageIndex !== lastPublishedStage) {
			const direction = stageIndex > lastPublishedStage ? "forward" : "backward";
			if (lastPublishedStage >= 0) {
				const steps = Math.abs(stageIndex - lastPublishedStage);
				for (let i = 0; i < steps; i += 1) {
					commitStageStep(direction);
					promoteCasePanelHudCanvases(direction);
				}
			}
			lastPublishedStage = stageIndex;
			store.portfolioExperience.activeStateIndex = stageIndex;
			store.portfolioExperience.activeStateId = stateId;
		}

		setStageProgressState(stageLocal);
		if (store.scroll !== scrollNorm) {
			store.scroll = scrollNorm;
		}
		if (store.caseScrollTarget !== scrollNormTarget) {
			store.caseScrollTarget = scrollNormTarget;
		}
		if (store.portfolioExperience.storyProgress !== current) {
			store.portfolioExperience.storyProgress = current;
		}
		if (store.portfolioExperience.storyProgressTarget !== target) {
			store.portfolioExperience.storyProgressTarget = target;
		}
		if (store.portfolioExperience.stageProgress !== stageLocal) {
			store.portfolioExperience.stageProgress = stageLocal;
		}
		if (store.portfolioExperience.stageProgressTarget !== stageLocalTarget) {
			store.portfolioExperience.stageProgressTarget = stageLocalTarget;
		}
		requestCaseStudyScrollRepaint();
	};

	const stopAnimation = () => {
		if (rafId) {
			window.cancelAnimationFrame(rafId);
			rafId = 0;
		}
	};

	const tick = (now) => {
		rafId = 0;
		if (disposed) return;
		if (!ownsInput()) {
			if (getSceneCarousel().isNavigationSettleActive("case")) {
				return;
			}
			getSceneCarousel().clearCaseBoundaryDrive();
			clearBoundaryPair();
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

		if (target >= STORY_MAX + 1 - CAROUSEL_PROGRESS_COMMIT_EPS && current >= STORY_MAX + 1 - CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE) {
			current = STORY_MAX + 1;
			target = STORY_MAX + 1;
		}

		syncBoundaryDrive();
		if (tryCommitRouteLeave()) {
			return;
		}

		publish();
		const stageLocal = store.portfolioExperience.stageProgress;
		const stageLocalTarget = store.portfolioExperience.stageProgressTarget;
		updateCaseStudyTextTransitionSound(dt, stageLocal, stageLocalTarget);
		if (storyNeedsAnimation(current, target)) {
			rafId = window.requestAnimationFrame(tick);
		}
	};

	const startAnimation = () => {
		if (rafId || disposed) return;
		previousFrameAt = performance.now();
		rafId = window.requestAnimationFrame(tick);
	};

	const scheduleBoundaryIdle = () => {
		if (snapTimerId) window.clearTimeout(snapTimerId);
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
		if (rawDeltaPixels > 0) scrollIntent = "forward";
		else if (rawDeltaPixels < 0) scrollIntent = "backward";

		const pixelsPerUnit = getPixelsPerStoryUnit();
		target = clampStoryTarget(target + rawDeltaPixels / pixelsPerUnit);
		syncBoundaryDrive();
		publish();
		startAnimation();
		scheduleBoundaryIdle();
		return true;
	};

	const jumpToStory = (nextStory) => {
		scrollIntent = null;
		terminalHudCommitted = false;
		getSceneCarousel().clearCaseBoundaryDrive();
		clearBoundaryPair();
		target = clamp(nextStory, 0, STORY_MAX);
		current = target;
		lastPublishedStage = -1;
		publish();
		startAnimation();
	};

	const jumpByStage = (direction) => {
		const stageIndex = storyToStageIndex(clampStoryVisual(target));
		const nextStageIndex = stageIndex + direction;
		if (nextStageIndex >= 0 && nextStageIndex < STORY_MAX) {
			jumpToStory(nextStageIndex);
			return;
		}
		if (!allowCaseLeave) {
			jumpToStory(direction < 0 ? 0 : STORY_MAX);
			return;
		}
		scrollIntent = direction > 0 ? "forward" : "backward";
		target = direction < 0 ? STORY_TARGET_MIN : STORY_TARGET_MAX;
		publish();
		startAnimation();
	};

	const onWheel = (event) => {
		if (!ownsInput() || event.defaultPrevented || isSceneDevToolsWheelTarget(event) || Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
			return;
		}
		const delta = normalizeWheelDelta(event);
		if (delta === 0) return;
		event.preventDefault();
		applyInputPixels(delta);
	};

	const onKeyDown = (event) => {
		if (!ownsInput() || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) {
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
		if (direction === 0) return;
		event.preventDefault();
		jumpByStage(direction);
	};

	const onTouchStart = (event) => {
		if (!ownsInput()) return;
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
		if (!ownsInput() || touchId === null) return;
		if (event.touches.length !== 1) {
			touchId = null;
			scheduleBoundaryIdle();
			return;
		}
		const touch = Array.from(event.touches).find((item) => item.identifier === touchId);
		if (!touch) return;
		const delta = touchY - touch.clientY;
		touchY = touch.clientY;
		if (Math.abs(delta) < 0.1) return;
		event.preventDefault();
		applyInputPixels(delta * 1.12);
	};

	const onTouchEnd = (event) => {
		if (touchId === null) return;
		const remains = Array.from(event.touches).some((item) => item.identifier === touchId);
		if (!remains) {
			touchId = null;
			scheduleBoundaryIdle();
		}
	};

	liveJumpHandler = (story) => {
		if (disposed) return;
		jumpToStory(Number(story) || 0);
	};

	const sourcePath = normalizeSitePath(project.config.route);
	const sourceSceneId = resolveSceneId(sourcePath);
	const navigationOwner = {
		id: "case",
		sceneId: sourceSceneId,
		snapshot: () => {
			const rest = resolveStoryRest(target, STORY_MAX);
			if (rest < 0 || rest > STORY_MAX) {
				if (!ensureBoundaryPair() || !cachedBoundaryChrome) {
					return null;
				}
				const boundary = rest < 0 ? cachedBoundaryChrome.backward : cachedBoundaryChrome.forward;
				return {
					current,
					target,
					rest,
					restPath: boundary.route,
					restSceneId: resolveSceneId(boundary.route),
					routeChanged: true,
				};
			}
			return {
				current,
				target,
				rest,
				restPath: sourcePath,
				restSceneId: sourceSceneId,
				routeChanged: false,
			};
		},
		apply: (value, delta) => {
			current = value;
			target = value;
			scrollIntent = value < 0 ? "backward" : value > STORY_MAX ? "forward" : null;
			syncBoundaryDrive();
			publish();
			updateCaseStudyTextTransitionSound(
				delta,
				store.portfolioExperience.stageProgress,
				store.portfolioExperience.stageProgressTarget,
			);
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

	getSceneCarousel().setOnCaseBoundaryCommit((payload) => {
		const from = normalizeSitePath(project.config.route);
		const to = normalizeSitePath(payload.path);
		publishSiteRouteTransition(from, to, { mode: "case-boundary" });
		if (getSceneCarousel().isNavigationSettleAwaitingRoute()) {
			store.sceneCarouselSkipHtmlExit = true;
			store.sceneCarouselDisplayPath = to;
			return;
		}
		setHexVisualPath(to);
		// Wheel/spring case→case — no HTML exiting stagger (parity with carouselPage commit).
		store.sceneCarouselSkipHtmlExit = true;
		store.sceneCarouselNavigatePath = to;
	});

	void preloadCaseStudyTextTransitionSound();
	publish();
	window.addEventListener("wheel", onWheel, { passive: false, capture: true });
	window.addEventListener("keydown", onKeyDown);
	window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
	window.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
	window.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
	window.addEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });

	return () => {
		disposed = true;
		unregisterNavigationOwner();
		liveJumpHandler = null;
		getSceneCarousel().clearCaseBoundaryDrive();
		clearBoundaryPair();
		// After commit, band is held at 0 for the next case enter — do not restore idle.
		stopAnimation();
		resetCaseStudyTextTransitionSound();
		if (snapTimerId) window.clearTimeout(snapTimerId);
		window.removeEventListener("wheel", onWheel, { capture: true });
		window.removeEventListener("keydown", onKeyDown);
		window.removeEventListener("touchstart", onTouchStart, { capture: true });
		window.removeEventListener("touchmove", onTouchMove, { capture: true });
		window.removeEventListener("touchend", onTouchEnd, { capture: true });
		window.removeEventListener("touchcancel", onTouchEnd, { capture: true });
	};
}

export function isCaseExperienceRuntimeActive() {
	return disposeRuntime != null;
}

/**
 * @param {{
 *   project: import('./types.js').PortfolioProjectModule,
 *   commitStageStep: (direction: 'forward' | 'backward') => boolean,
 *   allowCaseLeave?: boolean,
 * }} args
 */
export function startCaseExperienceRuntime(args) {
	stopCaseExperienceRuntime();
	disposeRuntime = createCaseExperienceRuntime(args);
}

export function stopCaseExperienceRuntime() {
	if (!disposeRuntime) return;
	disposeRuntime();
	disposeRuntime = null;
}

/** Jump interior story (0…STORY_MAX). Used by arc / goToState. */
export function jumpCaseExperienceToStory(story) {
	liveJumpHandler?.(story);
}

/** Map normalized scroll 0…1 or state index onto story and jump. */
export function jumpCaseExperienceToStateIndex(stateIndex, statesLength) {
	const lastIndex = Math.max(0, (statesLength ?? 1) - 1);
	const storyMax = Math.max(1, lastIndex);
	if (lastIndex > 0 && stateIndex >= lastIndex) {
		liveJumpHandler?.(storyMax);
		return;
	}
	liveJumpHandler?.(clamp(stateIndex, 0, storyMax));
}
