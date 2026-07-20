import * as THREE from "three";
import { ABOUT_MATERIALS, cloneAboutMaterialsConfig } from "./aboutSceneConfig.js";
import { createAboutFrontGlassMaterial } from "./aboutFrontGlassMaterial.js";
import { createAboutSideHudMaterial } from "./aboutSideHudMaterial.js";
import { createAboutHeartBodyMaterial } from "./aboutHeartBodyMaterial.js";
import {
	bakeOuterCellRibAttribute,
	createAboutOuterCellMaterial,
} from "./aboutOuterCellMaterial.js";
import { ABOUT_DISSOLVE_GLSL } from "./aboutDissolveShader.js";
import {
	createAboutNeonLineMaterial,
	createAboutNeonMaterial,
	isAboutHeartMetalMeshName,
	isAboutHeartNeonMeshName,
	isAboutNeonMaterialName,
	isAboutOuterCellMeshName,
	logAboutHeartGeometryReport,
} from "./aboutNeonMaterial.js";

function asColor(value) {
	return new THREE.Color(value);
}

export function createAboutPlateGlassMaterial(cfg, { depthWrite = false, side = THREE.DoubleSide } = {}) {
	return new THREE.MeshStandardMaterial({
		color: asColor(cfg.color),
		transparent: true,
		opacity: cfg.opacity ?? 1,
		roughness: cfg.roughness ?? 0.07,
		metalness: cfg.metalness ?? 0,
		fog: false,
		depthWrite,
		depthTest: true,
		side,
		envMapIntensity: cfg.envMapIntensity ?? 0.85,
	});
}

/** Dark clearcoated body for the main frame meshes (BaseMaterial / InsideSmall). */
export function createAboutDarkMaterial(cfg = ABOUT_MATERIALS.dark) {
	return new THREE.MeshPhysicalMaterial({
		color: asColor(cfg.color),
		metalness: cfg.metalness,
		roughness: cfg.roughness,
		clearcoat: cfg.clearcoat,
		clearcoatRoughness: cfg.clearcoatRoughness,
		emissive: asColor(cfg.emissive),
		emissiveIntensity: cfg.emissiveIntensity,
		envMapIntensity: cfg.envMapIntensity,
		transparent: false,
		opacity: 1,
		side: THREE.DoubleSide,
	});
}

function frontDissolveConfig(dissolve = {}) {
	return { ...dissolve, mode: dissolve.mode ?? 0 };
}

function cellDissolveConfig(dissolve = {}) {
	return { ...dissolve, mode: dissolve.cellMode ?? 1 };
}

export function createAboutModelMaterials(config = ABOUT_MATERIALS) {
	const cfg = cloneAboutMaterialsConfig(config);
	/** Front plate (dissolves). Back gets its own clone with uDissolve locked at 0. */
	const plateGlass = createAboutFrontGlassMaterial({
		...cfg.frontGlass,
		dissolve: frontDissolveConfig(cfg.stage2Dissolve),
	});
	/** Shared by BackBackSide (no dissolve). FrontBackSide gets its own dissolving clone. */
	const sideHud = createAboutSideHudMaterial({
		...cfg.sideHud,
		dissolve: frontDissolveConfig(cfg.stage2Dissolve),
	});
	/**
	 * InsideLarge is a particle host only — no crystal/glass draw.
	 * (Kept as a material slot so applyConfig / dispose paths stay stable.)
	 */
	const insideHostHidden = new THREE.MeshBasicMaterial({
		visible: false,
		transparent: true,
		opacity: 0,
		depthWrite: false,
		depthTest: false,
		colorWrite: false,
	});
	insideHostHidden.userData.isAboutInsideHostHidden = true;
	/** Authoring guide for the neon lattice — never drawn as glass. */
	const edgeGuideHidden = new THREE.MeshBasicMaterial({
		visible: false,
		transparent: true,
		opacity: 0,
		depthWrite: false,
		depthTest: false,
		colorWrite: false,
	});
	/** Heart neon matches EdgeForParticles lattice color. */
	const neonCfg = {
		...cfg.neon,
		color: cfg.edgeParticles?.color ?? cfg.neon?.color ?? "#00b3ff",
	};
	const neon = createAboutNeonMaterial(neonCfg);
	const neonLine = createAboutNeonLineMaterial(neonCfg);
	const heartBody = createAboutHeartBodyMaterial(cfg.heartBody);
	const outerCell = createAboutOuterCellMaterial({
		...cfg.outerCell,
		dissolve: cellDissolveConfig(cfg.stage2Dissolve),
	});
	return {
		frontGlass: plateGlass,
		sideHud,
		GlassMaterial: insideHostHidden,
		EdgeMaterial: edgeGuideHidden,
		edgeGuideHidden,
		BaseMaterial: createAboutDarkMaterial(cfg.dark),
		heartBody,
		outerCell,
		/** GLTF material name from Heart collection. */
		NeonMaterial: neon,
		neon,
		NeonLineMaterial: neonLine,
		neonLine,
	};
}

/**
 * Invisible depth-only copy so transparent plate glass still occludes what’s behind it.
 * When `dissolveUniforms` is provided (Front plate), depth is written only where
 * dissolve still keeps the surface — holes must not occlude the heart/cells.
 */
function createPlateDepthPrepass(plateMesh, dissolveUniforms = null) {
	let depthMat;
	if (dissolveUniforms) {
		depthMat = new THREE.ShaderMaterial({
			uniforms: {
				uDissolve: dissolveUniforms.uDissolve,
				uDissolveMode: dissolveUniforms.uDissolveMode,
				uDissolveEdge: dissolveUniforms.uDissolveEdge,
				uDissolveGlow: dissolveUniforms.uDissolveGlow,
				uHexScale: dissolveUniforms.uHexScale,
				uHexFisheye: dissolveUniforms.uHexFisheye,
				uHexRowSoft: dissolveUniforms.uHexRowSoft,
				uHexRowRandom: dissolveUniforms.uHexRowRandom,
				uHexCellSpan: dissolveUniforms.uHexCellSpan,
				uHexInnerMax: dissolveUniforms.uHexInnerMax,
				uHexInnerMin: dissolveUniforms.uHexInnerMin,
				uHexInnerSoft: dissolveUniforms.uHexInnerSoft,
				uHexRevealPower: dissolveUniforms.uHexRevealPower,
				uHexLineWidth: dissolveUniforms.uHexLineWidth,
				uHexLineInset: dissolveUniforms.uHexLineInset,
				uHexLineOpacity: dissolveUniforms.uHexLineOpacity,
				uHexLineGlowBoost: dissolveUniforms.uHexLineGlowBoost,
				uHexLineRandom: dissolveUniforms.uHexLineRandom,
				uHexLineColor: dissolveUniforms.uHexLineColor,
				uTime: dissolveUniforms.uTime,
			},
			vertexShader: /* glsl */ `
				varying vec3 vLocalPos;
				varying vec2 vUv;
				void main() {
					vUv = uv;
					vLocalPos = position;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: /* glsl */ `
				varying vec3 vLocalPos;
				varying vec2 vUv;
				uniform float uTime;

				float hash21(vec2 p) {
					p = fract(p * vec2(123.34, 456.21));
					p += dot(p, p + 45.32);
					return fract(p.x * p.y);
				}

				${ABOUT_DISSOLVE_GLSL}

				void main() {
					vec2 plateUv = vUv;
					if (length(plateUv) < 1e-4) {
						plateUv = vLocalPos.xz * 0.55 + 0.5;
					}
					vec2 dissolve = aboutDissolveSample(plateUv, vLocalPos, uTime);
					if (dissolve.x < 0.45) discard;
					gl_FragColor = vec4(0.0);
				}
			`,
			colorWrite: false,
			depthWrite: true,
			depthTest: true,
			side: THREE.DoubleSide,
			toneMapped: false,
			polygonOffset: true,
			polygonOffsetFactor: 1,
			polygonOffsetUnits: 1,
		});
		depthMat.colorWrite = false;
		depthMat.userData.isAboutFrontDissolveDepth = true;
	} else {
		depthMat = new THREE.MeshBasicMaterial({
			colorWrite: false,
			depthWrite: true,
			depthTest: true,
			side: THREE.DoubleSide,
			polygonOffset: true,
			polygonOffsetFactor: 1,
			polygonOffsetUnits: 1,
		});
	}
	const depthMesh = new THREE.Mesh(plateMesh.geometry, depthMat);
	depthMesh.name = "PlateDepthPrepass";
	depthMesh.frustumCulled = true;
	depthMesh.renderOrder = -20;
	depthMesh.matrixAutoUpdate = false;
	depthMesh.matrix.identity();
	depthMesh.userData.sharesGeometry = true;
	depthMesh.userData.isAboutDissolveDepthPrepass = Boolean(dissolveUniforms);
	plateMesh.add(depthMesh);
	return { depthMesh, depthMat };
}

/** Live-update material instances from an ABOUT_MATERIALS-shaped config. */
export function applyAboutMaterialsConfig(materialsByKey, config) {
	if (!materialsByKey || !config) return;
	const cfg = cloneAboutMaterialsConfig(config);

	const front = materialsByKey.frontGlass;
	if (front?.userData?.isAboutFrontGlass) {
		front.userData.applyConfig({
			...cfg.frontGlass,
			dissolve: frontDissolveConfig(cfg.stage2Dissolve),
		});
	} else if (front) {
		front.color?.copy?.(asColor(cfg.frontGlass.color));
		if (front.opacity != null) front.opacity = cfg.frontGlass.opacity;
		front.needsUpdate = true;
	}

	const sideHud = materialsByKey.sideHud;
	if (sideHud?.userData?.isAboutSideHud) {
		sideHud.userData.applyConfig({
			...cfg.sideHud,
			dissolve: frontDissolveConfig(cfg.stage2Dissolve),
		});
	}

	const inside = materialsByKey.GlassMaterial;
	if (inside) {
		inside.visible = false;
		inside.colorWrite = false;
		inside.depthWrite = false;
	}

	const dark = materialsByKey.BaseMaterial;
	if (dark) {
		dark.color.copy(asColor(cfg.dark.color));
		dark.metalness = cfg.dark.metalness;
		dark.roughness = cfg.dark.roughness;
		dark.clearcoat = cfg.dark.clearcoat;
		dark.clearcoatRoughness = cfg.dark.clearcoatRoughness;
		dark.emissive.copy(asColor(cfg.dark.emissive));
		dark.emissiveIntensity = cfg.dark.emissiveIntensity;
		dark.envMapIntensity = cfg.dark.envMapIntensity;
		dark.needsUpdate = true;
	}

	const heartBody = materialsByKey.heartBody;
	if (heartBody?.userData?.isAboutHeartBody) {
		heartBody.userData.applyConfig(cfg.heartBody);
	}

	const outerCell = materialsByKey.outerCell;
	if (outerCell?.userData?.isAboutOuterCell) {
		outerCell.userData.applyConfig({
			...cfg.outerCell,
			dissolve: cellDissolveConfig(cfg.stage2Dissolve),
		});
	}

	const neonCfg = {
		...cfg.neon,
		color: cfg.edgeParticles?.color ?? cfg.neon?.color ?? "#00b3ff",
	};
	const neon = materialsByKey.NeonMaterial ?? materialsByKey.neon;
	if (neon?.userData?.isAboutNeon) {
		neon.userData.applyConfig(neonCfg);
	}
	const neonLine = materialsByKey.NeonLineMaterial ?? materialsByKey.neonLine;
	if (neonLine?.userData?.isAboutNeonLine) {
		neonLine.userData.applyConfig(neonCfg);
	}
}

/**
 * Swap GLB materials by mesh / authored material name. Disposes replaced originals.
 * @returns {{ materials: THREE.Material[], materialsByKey: object, insideLarge: THREE.Object3D | null, edgeForParticles: THREE.Mesh | null }}
 */
export function applyAboutModelMaterials(root, config = ABOUT_MATERIALS) {
	const byName = createAboutModelMaterials(config);
	const owned = [
		byName.frontGlass,
		byName.sideHud,
		byName.GlassMaterial,
		byName.edgeGuideHidden,
		byName.BaseMaterial,
		byName.heartBody,
		byName.outerCell,
		byName.NeonMaterial,
		byName.NeonLineMaterial,
	].filter(Boolean);
	const replaced = new Set();
	let insideLarge = null;
	let edgeForParticles = null;

	root.traverse((object) => {
		if (object.name === "InsideLarge") {
			insideLarge = object;
		}
		if (object.name === "EdgeForParticles" && object.isMesh) {
			edgeForParticles = object;
		}

		const isDrawable =
			object.isMesh || object.isLine || object.isLineSegments;
		if (!isDrawable) return;
		if (object.name === "PlateDepthPrepass" || object.name === "FrontDepthPrepass") return;

		const isFrontPlate = object.name === "Front" || object.name === "Back";
		const isSideHud =
			object.name === "FrontBackSide" || object.name === "BackBackSide";
		const isEdgeGuide = object.name === "EdgeForParticles";
		const isInsideHost = object.name === "InsideLarge";
		const isHeartNeon = isAboutHeartNeonMeshName(object.name);
		const isHeartMetal = isAboutHeartMetalMeshName(object.name);
		const isOuterCell = isAboutOuterCellMeshName(object.name);
		const isLineObj = object.isLine || object.isLineSegments;

		let target = null;
		if (isFrontPlate) {
			target = byName.frontGlass;
		} else if (isSideHud) {
			target = byName.sideHud;
		} else if (isEdgeGuide) {
			target = byName.edgeGuideHidden;
		} else if (isInsideHost) {
			/** Hidden host — PCB particles only, no crystal shell. */
			target = byName.GlassMaterial;
		} else if (object.name === "InsideSmall") {
			target = byName.BaseMaterial;
		} else if (isOuterCell) {
			target = byName.outerCell;
		} else if (isHeartMetal) {
			target = byName.heartBody;
		} else if (isHeartNeon) {
			target = isLineObj ? byName.NeonLineMaterial : byName.NeonMaterial;
		}

		if (isSideHud || isEdgeGuide) {
			object.userData.sharesGeometry = true;
		}

		const slots = Array.isArray(object.material) ? object.material : [object.material];
		const next = slots.map((material) => {
			if (!material) return material;
			let replacement = target;
			if (!replacement && isAboutNeonMaterialName(material.name)) {
				replacement = isLineObj ? byName.NeonLineMaterial : byName.NeonMaterial;
			}
			if (!replacement) replacement = byName[material.name];
			if (!replacement) return material;
			if (!replaced.has(material)) {
				replaced.add(material);
				material.dispose();
			}
			return replacement;
		});

		object.material = Array.isArray(object.material) ? next : next[0];
		object.visible = true;
		object.frustumCulled = false;

		let primary = Array.isArray(object.material) ? object.material[0] : object.material;

		/**
		 * Back owns a glass clone — dissolve driven later (vapor on stage 2→3), never Front's.
		 */
		if (object.name === "Back" && primary === byName.frontGlass && !object.userData.aboutBackOwned) {
			const cloned = primary.clone();
			const u = cloned.uniforms;
			cloned.userData = {
				isAboutFrontGlass: true,
				isAboutBackGlass: true,
				uniforms: u,
				setTime: (elapsed) => {
					if (u.uTime) u.uTime.value = elapsed;
				},
			};
			if (u.uDissolve) u.uDissolve.value = 0;
			if (u.uDissolveMode) u.uDissolveMode.value = 3;
			/**
			 * Stable transparent pass from frame 0 — never flip depthWrite when dissolve starts
			 * (opaque→transparent list swap was corrupting BackBack / bloom for 1 frame).
			 */
			cloned.transparent = true;
			cloned.depthWrite = false;
			object.material = cloned;
			object.userData.aboutBackOwned = true;
			owned.push(cloned);
			primary = cloned;
		}

		if (object.name === "Front" && primary === byName.frontGlass) {
			object.renderOrder = 4;
			if (!object.getObjectByName("PlateDepthPrepass") && !object.getObjectByName("FrontDepthPrepass")) {
				const prepass = createPlateDepthPrepass(object, byName.frontGlass.userData?.uniforms);
				owned.push(prepass.depthMat);
			}
		} else if (object.name === "Back" && object.userData.aboutBackOwned) {
			object.renderOrder = 4;
			if (object.material) {
				object.material.transparent = true;
				object.material.depthWrite = false;
			}
			if (!object.getObjectByName("PlateDepthPrepass") && !object.getObjectByName("FrontDepthPrepass")) {
				/** Dissolve-aware depth so vapor holes do not occlude the heart. */
				const backU = object.material?.userData?.uniforms ?? object.material?.uniforms;
				const prepass = createPlateDepthPrepass(object, backU);
				owned.push(prepass.depthMat);
			}
		} else if (object.name === "BackBackSide" && primary === byName.sideHud) {
			if (!object.userData.aboutBackSideOwned) {
				const cloned = primary.clone();
				const u = cloned.uniforms;
				cloned.userData = {
					isAboutSideHud: true,
					isAboutBackSideHud: true,
					uniforms: u,
					setTime: (elapsed) => {
						if (u.uTime) u.uTime.value = elapsed;
					},
				};
				if (u.uDissolve) u.uDissolve.value = 0;
				if (u.uDissolveMode) u.uDissolveMode.value = 3;
				cloned.transparent = true;
				cloned.depthWrite = false;
				object.material = cloned;
				object.userData.aboutBackSideOwned = true;
				owned.push(cloned);
			}
			if (object.material) {
				object.material.transparent = true;
				object.material.depthWrite = false;
			}
			object.renderOrder = 0;
			if (!object.getObjectByName("PlateDepthPrepass") && !object.getObjectByName("FrontDepthPrepass")) {
				const backSideU = object.material?.userData?.uniforms ?? object.material?.uniforms;
				const prepass = createPlateDepthPrepass(object, backSideU);
				owned.push(prepass.depthMat);
			}
		} else if (object.name === "FrontBackSide" && primary === byName.sideHud) {
			/**
			 * Own material instance: same dissolve as Front, without affecting BackBackSide.
			 * Rebind userData.uniforms — ShaderMaterial.clone() can leave them pointing at the source.
			 */
			if (!object.userData.aboutFrontSideOwned) {
				const cloned = primary.clone();
				const u = cloned.uniforms;
				cloned.userData = {
					isAboutSideHud: true,
					uniforms: u,
					setTime: (elapsed) => {
						if (u.uTime) u.uTime.value = elapsed;
					},
				};
				if (u.uDissolve) u.uDissolve.value = 0;
				object.material = cloned;
				object.userData.aboutFrontSideOwned = true;
				owned.push(cloned);
			}
			object.renderOrder = 1;
		} else if (isSideHud && primary === byName.sideHud) {
			object.renderOrder = 1;
		} else if (isInsideHost) {
			object.renderOrder = 2;
		} else if (isOuterCell && primary === byName.outerCell) {
			bakeOuterCellRibAttribute(object, root);
			object.renderOrder = 3;
		} else if (isHeartMetal && primary === byName.heartBody) {
			object.renderOrder = 3;
		} else if (
			(isHeartNeon || isAboutNeonMaterialName(primary?.name)) &&
			(primary === byName.NeonMaterial || primary === byName.NeonLineMaterial)
		) {
			object.renderOrder = 8;
		} else if (object.name === "InsideSmall") {
			object.renderOrder = 0;
		} else {
			object.renderOrder = 1;
		}
	});

	if (import.meta.env.DEV) {
		logAboutHeartGeometryReport(root);
	}

	return { materials: owned, materialsByKey: byName, insideLarge, edgeForParticles };
}
