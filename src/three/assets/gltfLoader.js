import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { isMobileGraphicsDevice } from "../../functions/getGraphicsTier.js";

/** Same-origin Draco: model readiness must not depend on an external CDN. */
const DRACO_DECODER_PATH = "/draco/1.5.6/";

let sharedDracoLoader = null;

// Three r155's dispose terminates existing workers but does not cancel an
// in-flight decoder download. Its continuation can create a new worker after
// the app has already failed. Guard that boundary and settle active tasks.
class PreparedDracoLoader extends DRACOLoader {
	_cancelled = false;
	decodeDracoFile(...args) {
		const pending = super.decodeDracoFile(...args);
		// r155 GLTFLoader uses the callback and ignores this returned promise.
		// A disposed app must neither run that callback nor emit one unhandled
		// rejection per primitive. Promise consumers still receive the rejection;
		// genuine decoder failures keep the upstream error behavior.
		pending.catch(error => { if (error.name !== "AbortError") throw error; });
		return pending;
	}
	async _getWorker(taskID, taskCost) {
		if (this._cancelled) throw new DOMException("Model preparation cancelled", "AbortError");
		await this._initDecoder();
		if (this._cancelled) {
			super.dispose(); // Also revoke a blob produced by the late decoder download.
			throw new DOMException("Model preparation cancelled", "AbortError");
		}
		const worker = await super._getWorker(taskID, taskCost);
		if (this._cancelled) {
			super.dispose();
			throw new DOMException("Model preparation cancelled", "AbortError");
		}
		return worker;
	}
	dispose() {
		this._cancelled = true;
		for (const worker of this.workerPool) {
			for (const callback of Object.values(worker._callbacks)) {
				callback.reject(new DOMException("Model preparation cancelled", "AbortError"));
			}
		}
		return super.dispose();
	}
}

function getDracoLoader() {
	if (!sharedDracoLoader) {
		sharedDracoLoader = new PreparedDracoLoader();
		sharedDracoLoader.setDecoderPath(DRACO_DECODER_PATH);
		// Each worker owns a separate WASM heap. Bound mobile peak memory while
		// retaining the same models; decode stays off the rendering thread.
		sharedDracoLoader.setWorkerLimit(isMobileGraphicsDevice() ? 1 : 4);
	}
	return sharedDracoLoader;
}

/** GLTFLoader с поддержкой Draco — для всех сцен проекта. */
export function createGLTFLoader() {
	const loader = new GLTFLoader();
	loader.setDRACOLoader(getDracoLoader());
	return loader;
}

/**
 * GLTFLoader отдаёт scene, но не nodes/materials (как useGLTF в drei).
 * Строим карты по имени — для переноса R3F-моделей.
 */
export function enrichGLTFResult(gltf) {
	const nodes = {};
	const materials = {};

	gltf.scene.traverse((object) => {
		if (object.name) {
			nodes[object.name] = object;
		}
		if (object.isMesh) {
			const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
			for (const material of meshMaterials) {
				if (material?.name) {
					materials[material.name] = material;
				}
			}
		}
	});

	gltf.nodes = nodes;
	gltf.materials = materials;
	return gltf;
}

export function disposeSharedDracoLoader() {
	sharedDracoLoader?.dispose();
	sharedDracoLoader = null;
}
