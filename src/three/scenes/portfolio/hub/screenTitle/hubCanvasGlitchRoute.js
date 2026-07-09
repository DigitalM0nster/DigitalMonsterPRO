import { projectsData } from "../projectsData.js";
import { registerRouteGlitchScope, runRouteGlitchStagger, unregisterRouteGlitchScope } from "@/utils/routeGlitchRegistry.js";

/** Refs для canvas GlitchText — тот же stagger, что у HTML-списка. */
const canvasGlitchRefs = { current: [] };
let routeScopeRegistered = false;
/** До playEnterAnimation — не запускать enter из route navigate (T+0). */
let deferCanvasEnterUntilScene = true;

export function setHubCanvasGlitchLayers(layers = []) {
	canvasGlitchRefs.current = layers.map((layer) => layer.getGlitchHandle()).filter(Boolean);
}

export function setHubCanvasGlitchEnterDeferred(deferred = true) {
	deferCanvasEnterUntilScene = deferred;
}

function playCanvasHubEnter(options = {}) {
	if (deferCanvasEnterUntilScene && !options.fromSceneEnter) {
		return;
	}

	runRouteGlitchStagger("portfolioHub", "enter", canvasGlitchRefs, projectsData.length, options);
}

function playCanvasHubExit(options = {}) {
	runRouteGlitchStagger("portfolioHub", "exit", canvasGlitchRefs, projectsData.length, options);
}

/** Enter-змейка по событию grid enter (PortfolioHubScene.playEnterAnimation). */
export function playHubCanvasEnterFromScene(options = {}) {
	deferCanvasEnterUntilScene = false;
	playCanvasHubEnter({ ...options, fromSceneEnter: true, force: true });
}

/** Регистрирует canvas-проекты в portfolioHub route glitch scope. */
export function ensureHubCanvasGlitchRouteScope() {
	if (routeScopeRegistered) {
		return;
	}

	registerRouteGlitchScope("portfolioHub", {
		onEnter: playCanvasHubEnter,
		onExit: playCanvasHubExit,
	});
	routeScopeRegistered = true;
}

export function disposeHubCanvasGlitchRouteScope() {
	unregisterRouteGlitchScope("portfolioHub");
	routeScopeRegistered = false;
	canvasGlitchRefs.current = [];
	deferCanvasEnterUntilScene = true;
}

/** @param {'enter' | 'exit'} intent @param {{ force?: boolean }} [options] */
export function runHubCanvasGlitchRoute(intent, options = {}) {
	if (intent === "enter") {
		playCanvasHubEnter(options);
		return;
	}
	playCanvasHubExit(options);
}
