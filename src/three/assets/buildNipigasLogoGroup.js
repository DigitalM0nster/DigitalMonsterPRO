import * as THREE from "three";
import { createGLTFLoader, enrichGLTFResult } from "./gltfLoader.js";

export const NIPIGAS_LOGO_NODE_NAMES = [
	"logoCircle",
	"logoCircleContour",
	"logoFire",
	"logoFireContour",
	"separator",
	"numberFifty",
	"numberFiftyContour",
];

const NIPIGAS_LOGO_GLB = "/models/case1/NipigasLogoModel.glb";

let loadPromise = null;

/** Один раз загружаем GLB логотипа НИПИГАЗ. */
export function loadNipigasLogoGLTF() {
	if (!loadPromise) {
		const loader = createGLTFLoader();
		loadPromise = loader
			.loadAsync(NIPIGAS_LOGO_GLB)
			.then((gltfRaw) => enrichGLTFResult(gltfRaw));
	}
	return loadPromise;
}

/**
 * Собирает группу мешей логотипа (как в Case1Scene).
 * @param {import("three-stdlib").GLTF} gltf
 * @param {{ logoMaterial?: THREE.Material, contourMat?: THREE.Material }} [shared]
 */
export function buildNipigasLogoGroup(gltf, shared = {}) {
	const group = new THREE.Group();

	const contourMat = shared.contourMat ?? gltf.materials?.contourMat;
	if (contourMat && !shared.contourMat) {
		contourMat.color.setRGB(0, 1, 2);
		contourMat.emissive.setRGB(0, 1, 2);
		contourMat.emissiveIntensity = 0.9;
		contourMat.toneMapped = false;
	}

	const logoMaterial =
		shared.logoMaterial ??
		new THREE.MeshStandardMaterial({
			color: "#008c95",
			roughness: 0,
			metalness: 1,
			transparent: true,
			opacity: 1,
			depthTest: true,
			depthWrite: true,
			side: THREE.DoubleSide,
			toneMapped: true,
		});

	const contourNodes = new Set(["logoCircleContour", "logoFireContour", "numberFiftyContour"]);

	for (const name of NIPIGAS_LOGO_NODE_NAMES) {
		const source = gltf.nodes?.[name] ?? gltf.scene.getObjectByName(name);
		if (!source?.isMesh) {
			if (import.meta.env.DEV) {
				console.warn("[nipigas logo] mesh not found:", name);
			}
			continue;
		}

		const mesh = source.clone();
		if (!contourNodes.has(name)) {
			mesh.material = logoMaterial;
		}

		group.add(mesh);
	}

	return group;
}
