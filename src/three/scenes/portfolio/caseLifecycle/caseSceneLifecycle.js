import { computeRouteSceneVisibility } from "@/three/scenes/utils/routeSceneVisibility.js";
import { freezeHiddenRoot, restoreRootForShow } from "@/three/scenes/utils/sceneRoot.js";
import { hideCaseStudyPanelHud } from "@/three/scenes/portfolio/caseStudyText/caseStudyPanelHudHost.js";
import { isPortfolioCasePath } from "@/three/scenes/portfolio/hub/projectsData.js";
import { getHexShaderProgress } from "@/three/render/overlay/hexShaderProgress.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";

/**
 * Shared enter/exit lifecycle for all portfolio case scenes.
 *
 * Flow is identical for every case:
 *   enter → playEnterAnimation → hooks.onEnterShow
 *   leave → freeze framing → hold while hex → hideRoot
 *
 * Case-specific camera, scale, and model work live in the hooks —
 * not in duplicated setRouteState / update exit branches.
 *
 * @param {object} host Scene instance (Case1Scene, Case3Scene, …)
 * @param {object} options
 * @param {string} options.sceneId e.g. "case01"
 * @param {(pathname: string) => boolean} options.matchPage
 * @param {() => import("three").Object3D | null | undefined} options.getRoot
 * @param {() => { scroll?: number } | null | undefined} [options.getStore]
 * @param {() => unknown} [options.getPanelHud]
 * @param {() => boolean} [options.isLoaded]
 * @param {number} [options.hideScale=0]
 * @param {boolean} [options.resetScrollOnEnter=true]
 * @param {{
 *   onFreshEnter?: () => void,
 *   onEnterShow?: (ctx: { reason: 'route' | 'mix' | 'playEnter' }) => void,
 *   onMixPreviewShow?: () => void,
 *   onExitHold?: (frame: object | null | undefined) => void,
 *   onHide?: () => void,
 *   onReset?: () => void,
 * }} [options.hooks]
 */
export function createCaseSceneLifecycle(host, options) {
	const {
		sceneId,
		matchPage,
		getRoot,
		getStore = () => host.store ?? null,
		getPanelHud = () => host.panelHud ?? null,
		isLoaded = () => host.loaded !== false,
		hideScale = 0,
		resetScrollOnEnter = true,
		hooks = {},
	} = options;

	if (!sceneId || typeof matchPage !== "function" || typeof getRoot !== "function") {
		throw new Error("[caseSceneLifecycle] sceneId, matchPage, and getRoot are required");
	}

	const state = {
		showCase: false,
		activePage: false,
		exitHideComplete: false,
		mixPreview: false,
		allowExitOverlay: true,
		lastRouteKey: "",
		exitCameraScrollFrozen: false,
		exitCameraScroll: 0,
		enterPending: true,
	};

	function syncHost() {
		host.showCase = state.showCase;
		host.activePage = state.activePage;
		host.exitHideComplete = state.exitHideComplete;
		host._mixPreview = state.mixPreview;
		host._allowExitOverlay = state.allowExitOverlay;
	}

	function freezeExitCameraScroll() {
		if (state.exitCameraScrollFrozen) {
			return;
		}
		state.exitCameraScroll = getStore()?.scroll ?? 0;
		state.exitCameraScrollFrozen = true;
	}

	function clearExitCameraFreeze() {
		state.exitCameraScrollFrozen = false;
		state.exitCameraScroll = 0;
	}

	function resolveCameraScroll() {
		if (state.exitCameraScrollFrozen) {
			return state.exitCameraScroll;
		}
		return getStore()?.scroll ?? 0;
	}

	function isHexMixParticipant() {
		if (getHexShaderProgress() <= 0.0001) {
			return false;
		}
		try {
			const { sourceId, targetId } = getSceneCarousel().getMixSourceTargetIds();
			return sourceId === sceneId || targetId === sceneId;
		} catch {
			return true;
		}
	}

	function hideRoot() {
		const root = getRoot();
		if (root) {
			root.visible = false;
			root.scale.set(hideScale, hideScale, hideScale);
			freezeHiddenRoot(root);
		}
		state.activePage = false;
		state.exitHideComplete = true;
		state.enterPending = true;
		clearExitCameraFreeze();
		hideCaseStudyPanelHud(getPanelHud());
		hooks.onHide?.();
		syncHost();
	}

	/**
	 * Shared enter — wake the case for route enter or hex mix preview.
	 * @param {'route' | 'mix' | 'playEnter'} reason
	 */
	function enterCase(reason = "playEnter") {
		clearExitCameraFreeze();
		state.exitHideComplete = false;
		state.showCase = true;
		state.enterPending = false;

		const root = getRoot();
		if (root) {
			root.visible = true;
			restoreRootForShow(root);
		}
		getPanelHud()?.setVisible?.(true);

		if (reason === "mix") {
			state.mixPreview = true;
			state.activePage = true;
			hooks.onMixPreviewShow?.() ?? hooks.onEnterShow?.({ reason });
		} else {
			hooks.onEnterShow?.({ reason });
		}
		syncHost();
	}

	/**
	 * Shared exit tick — hold framing while hex still shows this case, then hide.
	 * @returns {'active' | 'holding' | 'hidden'}
	 */
	function updateExit(frame) {
		if (state.activePage || state.showCase || state.mixPreview) {
			return "active";
		}

		const root = getRoot();
		if (!root?.visible && state.exitHideComplete) {
			return "hidden";
		}

		freezeExitCameraScroll();
		hooks.onExitHold?.(frame ?? null);

		if (isHexMixParticipant()) {
			if (root) {
				root.visible = true;
				restoreRootForShow(root);
			}
			syncHost();
			return "holding";
		}

		hideRoot();
		return "hidden";
	}

	function setRouteState({ currentPage, teleportPage, routePhase }) {
		const routeKey = `${currentPage}|${teleportPage}|${routePhase}`;
		if (routeKey === state.lastRouteKey) {
			return;
		}
		state.lastRouteKey = routeKey;

		const { show, shouldWake, displayed } = computeRouteSceneVisibility({
			currentPage,
			teleportPage,
			routePhase,
			matchPage,
		});

		const wasShown = state.showCase;
		const leavingWhileDisplayed =
			displayed && !matchPage(teleportPage) && (state.activePage || state.showCase);

		// case→case: never overlay-steal the next case's frame.
		state.allowExitOverlay = !isPortfolioCasePath(currentPage);

		if (leavingWhileDisplayed) {
			freezeExitCameraScroll();
		} else if (displayed && shouldWake && !wasShown) {
			clearExitCameraFreeze();
			if (resetScrollOnEnter) {
				const store = getStore();
				if (store) {
					store.scroll = 0;
				}
			}
			hooks.onFreshEnter?.();
		}

		if (!show) {
			state.activePage = false;
			state.showCase = false;
			hideCaseStudyPanelHud(getPanelHud());
			// Hex already finished when display leaves — hide without scale-out
			// (scale→0 mid-transition reads as a camera pull-back).
			if (!isHexMixParticipant()) {
				hideRoot();
			}
			syncHost();
			return;
		}

		state.showCase = true;
		state.exitHideComplete = false;
		getPanelHud()?.setVisible?.(true);
		syncHost();

		if (shouldWake) {
			playEnterAnimation();
		}
	}

	function playEnterAnimation() {
		if (state.activePage || state.mixPreview) {
			return;
		}
		// Enter already started (e.g. Case1 delayed activate still running).
		if (!state.enterPending && state.showCase) {
			return;
		}
		if (!isLoaded()) {
			state.enterPending = true;
			syncHost();
			return;
		}
		enterCase("playEnter");
	}

	function setMixPreviewActive(active) {
		state.mixPreview = active === true;
		if (!state.mixPreview) {
			syncHost();
			return;
		}
		enterCase("mix");
	}

	function resetCarouselState() {
		state.showCase = false;
		state.exitHideComplete = false;
		hooks.onReset?.();
		hideRoot();
		syncHost();
	}

	function shouldRender() {
		const root = getRoot();
		return Boolean(isLoaded() && root?.visible && (state.showCase || state.mixPreview));
	}

	function shouldRenderOverlay() {
		const root = getRoot();
		return Boolean(
			state.allowExitOverlay
			&& isLoaded()
			&& root?.visible
			&& !state.showCase
			&& !state.mixPreview
			&& !state.exitHideComplete,
		);
	}

	function shouldKeepUpdating() {
		const root = getRoot();
		return Boolean(root?.visible || state.showCase || state.mixPreview);
	}

	function isFramingActive() {
		const root = getRoot();
		return Boolean(
			state.mixPreview
			|| state.activePage
			|| (isLoaded() && root?.visible && !state.exitHideComplete),
		);
	}

	/** Mark the case interactive (after delayed enter, etc.). */
	function setActivePage(active) {
		state.activePage = active === true;
		if (state.activePage) {
			state.exitHideComplete = false;
			const root = getRoot();
			if (root) {
				root.visible = true;
				restoreRootForShow(root);
			}
		}
		syncHost();
	}

	function setEnterPending(pending) {
		state.enterPending = pending === true;
	}

	syncHost();

	return {
		get showCase() {
			return state.showCase;
		},
		get activePage() {
			return state.activePage;
		},
		get exitHideComplete() {
			return state.exitHideComplete;
		},
		get mixPreview() {
			return state.mixPreview;
		},
		get allowExitOverlay() {
			return state.allowExitOverlay;
		},
		get enterPending() {
			return state.enterPending;
		},
		setActivePage,
		setEnterPending,
		resolveCameraScroll,
		freezeExitCameraScroll,
		clearExitCameraFreeze,
		isHexMixParticipant,
		isFramingActive,
		hideRoot,
		enterCase,
		updateExit,
		setRouteState,
		playEnterAnimation,
		setMixPreviewActive,
		resetCarouselState,
		shouldRender,
		shouldRenderOverlay,
		shouldKeepUpdating,
		syncHost,
	};
}
