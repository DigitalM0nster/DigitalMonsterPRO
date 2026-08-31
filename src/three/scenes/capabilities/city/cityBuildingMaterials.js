import * as THREE from "three";

const SOURCE_BUILDING_MATERIAL = "BuildingMaterial";
const SOURCE_ROOF_MATERIAL = "RoofMaterial";
const SOURCE_DARK_GLASS_MATERIAL = "WindowMaterial2";
const GROUND_MESH_NAMES = new Set(["mainFloor"]);

function createPhysicalMaterial(name, options) {
	return new THREE.MeshPhysicalMaterial({
		name,
		color: options.color,
		metalness: options.metalness,
		roughness: options.roughness,
		clearcoat: options.clearcoat ?? 0,
		clearcoatRoughness: options.clearcoatRoughness ?? 1,
		reflectivity: options.reflectivity ?? 0.25,
		envMapIntensity: options.envMapIntensity ?? 0.18,
		fog: true,
		dithering: true,
		toneMapped: true,
		side: THREE.FrontSide,
	});
}

function createCitySurfaceMaterials() {
	return {
		facades: [
			createPhysicalMaterial("CityFacadeDarkA", {
				color: 0x111820,
				metalness: 0.14,
				roughness: 0.82,
				clearcoat: 0.04,
				clearcoatRoughness: 0.88,
			}),
			createPhysicalMaterial("CityFacadeDarkB", {
				color: 0x0d1319,
				metalness: 0.18,
				roughness: 0.76,
				clearcoat: 0.06,
				clearcoatRoughness: 0.82,
			}),
			createPhysicalMaterial("CityFacadeDarkC", {
				color: 0x151c23,
				metalness: 0.1,
				roughness: 0.86,
				clearcoat: 0.025,
				clearcoatRoughness: 0.92,
			}),
		],
		roof: createPhysicalMaterial("CityRoofDark", {
			color: 0x080b0f,
			metalness: 0.46,
			roughness: 0.66,
			clearcoat: 0.08,
			clearcoatRoughness: 0.74,
		}),
		ground: createPhysicalMaterial("CityGroundDark", {
			color: 0x020304,
			metalness: 0.04,
			roughness: 0.96,
			clearcoat: 0,
			envMapIntensity: 0.08,
		}),
		darkGlass: createPhysicalMaterial("CityDarkGlass", {
			color: 0x061019,
			metalness: 0,
			roughness: 0.2,
			clearcoat: 0.72,
			clearcoatRoughness: 0.18,
			reflectivity: 0.56,
			envMapIntensity: 0.28,
		}),
	};
}

function stableFacadeIndex(name, count) {
	let hash = 2166136261;
	for (const character of String(name ?? "")) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) % Math.max(1, count);
}

/**
 * Replaces the flat Blender materials with a small shared night-city PBR set.
 * The stable facade variants prevent every building from reading as one slab,
 * without textures, per-frame work or extra material allocation at runtime.
 */
export function replaceCitySurfaceMaterials(root) {
	const surface = createCitySurfaceMaterials();
	const createdMaterials = new Set([
		...surface.facades,
		surface.roof,
		surface.ground,
		surface.darkGlass,
	]);
	const replacedMaterials = new Set();
	let meshCount = 0;

	root?.traverse((object) => {
		if (!object.isMesh || !object.material) return;
		const sourceMaterials = Array.isArray(object.material)
			? object.material
			: [object.material];
		let replaced = false;
		const nextMaterials = sourceMaterials.map((sourceMaterial) => {
			let nextMaterial = sourceMaterial;
			switch (sourceMaterial?.name) {
				case SOURCE_BUILDING_MATERIAL:
					nextMaterial = surface.facades[
						stableFacadeIndex(object.name, surface.facades.length)
					];
					break;
				case SOURCE_ROOF_MATERIAL:
					nextMaterial = GROUND_MESH_NAMES.has(object.name)
						? surface.ground
						: surface.roof;
					break;
				case SOURCE_DARK_GLASS_MATERIAL:
					nextMaterial = surface.darkGlass;
					break;
				default:
					break;
			}
			if (nextMaterial !== sourceMaterial) {
				replacedMaterials.add(sourceMaterial);
				replaced = true;
			}
			return nextMaterial;
		});
		if (!replaced) return;

		object.material = Array.isArray(object.material) ? nextMaterials : nextMaterials[0];
		meshCount += 1;
	});

	const stillUsedMaterials = new Set();
	root?.traverse((object) => {
		const materials = Array.isArray(object.material) ? object.material : [object.material];
		for (const material of materials) {
			if (material) stillUsedMaterials.add(material);
		}
	});
	for (const replacedMaterial of replacedMaterials) {
		if (!stillUsedMaterials.has(replacedMaterial)) replacedMaterial.dispose();
	}
	for (const createdMaterial of createdMaterials) {
		if (!stillUsedMaterials.has(createdMaterial)) createdMaterial.dispose();
	}

	return meshCount;
}
