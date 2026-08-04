import { commitPortfolioHubCaseRoute } from "@/functions/portfolioHubNavigate.js";
import { isSceneDevToolsWheelTarget } from "@/three/dev/sceneDevPanelUtils.js";
import { CAROUSEL_WHEEL_PROGRESS_FACTOR } from "@/three/render/transition/carouselScroll.js";
import {
	CAROUSEL_PROGRESS_CHASE_FINAL_SMOOTH_MUL,
	CAROUSEL_PROGRESS_CHASE_FINAL_THRESHOLD,
	CAROUSEL_PROGRESS_SMOOTH,
	applyLocalSegmentTargetRest,
	chaseSegmentValue,
	getAbsChaseSmoothMul,
} from "@/three/render/transition/segmentScrollSpring.js";
import { getPortfolioProjectByPath, projectsData } from "@/three/scenes/portfolio/hub/projectsData.js";
import {
	getHubPlateCaseState,
	requestHubPlateCaseSwitch,
	resetHubPlateCaseColumnMotion,
	setHubPlateCaseColumnMotion,
} from "./hubPlateCaseStore.js";

const LINE_HEIGHT_PX = 16;
const COMMIT_EPS = 0.0001;
const COMMIT_SNAP_ZONE = 0.005;
const TARGET_LIMIT = 1.5;
const POST_COMMIT_LIMIT = 0.5 - COMMIT_EPS;

function clampTarget(value) {
	return Math.max(-TARGET_LIMIT, Math.min(TARGET_LIMIT, value));
}

function clampPostCommitTarget(value) {
	return Math.max(-POST_COMMIT_LIMIT, Math.min(POST_COMMIT_LIMIT, value));
}

function normalizeWheelDelta(event) {
	let delta = event.deltaY;
	if (event.deltaMode === 1) {
		delta *= LINE_HEIGHT_PX;
	} else if (event.deltaMode === 2) {
		delta *= window.innerHeight;
	}
	return delta;
}

function getCurrentProjectIndex() {
	const project = getPortfolioProjectByPath(window.location.pathname);
	return project ? projectsData.indexOf(project) : -1;
}

function isResponsiveCaseUiTarget(target) {
	return Boolean(target?.closest?.('[data-hub-case-responsive="true"]'));
}

/**
 * The selected hub case owns wheel only after its opening animation is settled.
 * It reuses the canonical site segment spring and publishes only transform progress;
 * PortfolioHubScene keeps ownership of the already-warmed plate meshes.
 */
export function attachHubPlateCaseColumnRuntime() {
	let current = 0;
	let target = 0;
	let intent = null;
	let frameId = 0;
	let lastFrameAt = 0;
	let pendingProjectIndex = -1;
	let touchId = null;
	let touchStartX = 0;
	let touchStartY = 0;
	let touchLastY = 0;

	const publish = () => {
		setHubPlateCaseColumnMotion({ progress: current, target });
	};

	const isReady = () => {
		const state = getHubPlateCaseState();
		return getCurrentProjectIndex() >= 0 && state.open && state.progress >= 0.999;
	};

	const stopFrame = () => {
		if (frameId) {
			cancelAnimationFrame(frameId);
			frameId = 0;
		}
		lastFrameAt = 0;
	};

	const commitProject = (direction) => {
		const state = getHubPlateCaseState();
		const sourceIndex = state.projectIndex >= 0 ? state.projectIndex : getCurrentProjectIndex();
		if (sourceIndex < 0 || pendingProjectIndex >= 0) {
			return false;
		}

		const nextIndex = (sourceIndex + direction + projectsData.length) % projectsData.length;
		current -= direction;
		target = clampPostCommitTarget(target - direction);
		intent = Math.abs(target) > COMMIT_EPS ? (target > 0 ? "forward" : "backward") : null;
		pendingProjectIndex = nextIndex;
		requestHubPlateCaseSwitch(nextIndex);
		publish();
		commitPortfolioHubCaseRoute(projectsData[nextIndex].path, window.location.pathname);
		return true;
	};

	const update = (now) => {
		frameId = 0;
		const delta = lastFrameAt > 0 ? Math.min((now - lastFrameAt) / 1000, 0.05) : 1 / 60;
		lastFrameAt = now;

		if (!isReady()) {
			current = 0;
			target = 0;
			intent = null;
			pendingProjectIndex = -1;
			publish();
			stopFrame();
			return;
		}

		const sceneIndex = getHubPlateCaseState().projectIndex;
		if (pendingProjectIndex >= 0 && sceneIndex === pendingProjectIndex) {
			pendingProjectIndex = -1;
		}

		target = applyLocalSegmentTargetRest(target, delta);
		const chaseMul = getAbsChaseSmoothMul(Math.abs(current), {
			threshold: CAROUSEL_PROGRESS_CHASE_FINAL_THRESHOLD,
			mul: CAROUSEL_PROGRESS_CHASE_FINAL_SMOOTH_MUL,
		});
		current = chaseSegmentValue(current, target, delta, {
			smooth: CAROUSEL_PROGRESS_SMOOTH,
			chaseMul,
		});

		if (target >= 1 && current > 1 - COMMIT_SNAP_ZONE) {
			current = 1;
		} else if (target <= -1 && current < -1 + COMMIT_SNAP_ZONE) {
			current = -1;
		} else if (Math.abs(target) <= COMMIT_EPS && Math.abs(current) <= COMMIT_EPS) {
			current = 0;
			target = 0;
			intent = null;
		}

		publish();
		if (intent === "forward" && current >= 1 - COMMIT_EPS) {
			commitProject(1);
		} else if (intent === "backward" && current <= -1 + COMMIT_EPS) {
			commitProject(-1);
		}

		if (Math.abs(current) > COMMIT_EPS || Math.abs(target) > COMMIT_EPS || pendingProjectIndex >= 0) {
			frameId = requestAnimationFrame(update);
		} else {
			lastFrameAt = 0;
		}
	};

	const ensureFrame = () => {
		if (!frameId) {
			frameId = requestAnimationFrame(update);
		}
	};

	const addDelta = (deltaPixels) => {
		if (!Number.isFinite(deltaPixels) || deltaPixels === 0 || !isReady()) {
			return false;
		}
		const delta = deltaPixels * CAROUSEL_WHEEL_PROGRESS_FACTOR;
		target = clampTarget(target + delta);
		intent = delta > 0 ? "forward" : "backward";
		ensureFrame();
		return true;
	};

	const onWheel = (event) => {
		if (
			event.defaultPrevented ||
			isResponsiveCaseUiTarget(event.target) ||
			isSceneDevToolsWheelTarget(event) ||
			Math.abs(event.deltaY) < Math.abs(event.deltaX)
		) {
			return;
		}
		if (addDelta(normalizeWheelDelta(event))) {
			event.preventDefault();
			event.stopPropagation();
		}
	};

	const onTouchStart = (event) => {
		if (isResponsiveCaseUiTarget(event.target) || !isReady() || event.touches.length !== 1) {
			return;
		}
		const touch = event.touches[0];
		touchId = touch.identifier;
		touchStartX = touch.clientX;
		touchStartY = touch.clientY;
		touchLastY = touch.clientY;
	};

	const onTouchMove = (event) => {
		if (touchId === null) {
			return;
		}
		const touch = Array.from(event.touches).find((item) => item.identifier === touchId);
		if (!touch) {
			return;
		}
		const deltaY = touchLastY - touch.clientY;
		touchLastY = touch.clientY;
		const totalX = Math.abs(touchStartX - touch.clientX);
		const totalY = Math.abs(touchStartY - touch.clientY);
		if (totalY > 4 && totalY > totalX && addDelta(deltaY)) {
			event.preventDefault();
		}
	};

	const onTouchEnd = (event) => {
		if (touchId === null) {
			return;
		}
		if (!Array.from(event.touches).some((item) => item.identifier === touchId)) {
			touchId = null;
			ensureFrame();
		}
	};

	resetHubPlateCaseColumnMotion();
	window.addEventListener("wheel", onWheel, { passive: false, capture: true });
	window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
	window.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
	window.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
	window.addEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });

	return () => {
		stopFrame();
		resetHubPlateCaseColumnMotion();
		window.removeEventListener("wheel", onWheel, { capture: true });
		window.removeEventListener("touchstart", onTouchStart, { capture: true });
		window.removeEventListener("touchmove", onTouchMove, { capture: true });
		window.removeEventListener("touchend", onTouchEnd, { capture: true });
		window.removeEventListener("touchcancel", onTouchEnd, { capture: true });
	};
}
