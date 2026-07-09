import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

/** Декодер Draco (GLB с KHR_draco_mesh_compression). */
const DRACO_DECODER_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.6/";

let sharedDracoLoader = null;

function getDracoLoader() {
	if (!sharedDracoLoader) {
		sharedDracoLoader = new DRACOLoader();
		sharedDracoLoader.setDecoderPath(DRACO_DECODER_PATH);
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
