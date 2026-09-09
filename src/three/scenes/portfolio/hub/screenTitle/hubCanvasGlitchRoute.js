import { registerRouteGlitchScope, runRouteGlitchStagger, unregisterRouteGlitchScope } from "@/functions/routeGlitchRegistry.js";

/** Each scene owns its refs and deferred enter; preparing contacts cannot replace portfolio's snake. */
export function createHubCanvasGlitchRouteScope(scope) {
	const refs = { current: [] };
	let registered = false;
	let deferred = true;
	const enter = (options = {}) => {
		if (deferred && !options.fromSceneEnter) return;
		runRouteGlitchStagger(scope, "enter", refs, refs.current.length, options);
	};
	const exit = (options = {}) => runRouteGlitchStagger(scope, "exit", refs, refs.current.length, options);
	return {
		setLayers(layers) { refs.current = layers.map((layer) => layer.getGlitchHandle()).filter(Boolean); },
		setDeferred(value) { deferred = value; },
		ensureRegistered() {
			if (registered) return;
			registerRouteGlitchScope(scope, { onEnter: enter, onExit: exit });
			registered = true;
		},
		playEnterFromScene(options = {}) { deferred = false; enter({ ...options, fromSceneEnter: true, force: true }); },
		run(intent, options = {}) { (intent === "enter" ? enter : exit)(options); },
		dispose() {
			if (registered) unregisterRouteGlitchScope(scope);
			registered = false;
			refs.current = [];
			deferred = true;
		},
	};
}
