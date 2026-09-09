// The site wheel listener delegates to one current scene; no competing wheel listener.
const handlers = new Map();
export function registerLocalSceneScroll(sceneId, handler) {
	handlers.set(sceneId, handler);
	return () => { if (handlers.get(sceneId) === handler) handlers.delete(sceneId); };
}
export function dispatchLocalSceneScroll(sceneId, delta) {
	return handlers.get(sceneId)?.(delta) === true;
}
