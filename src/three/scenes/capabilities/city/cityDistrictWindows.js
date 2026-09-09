import * as THREE from "three";

/** Bind once after GLB loading. Repeated buildings keep GPU instancing. */
export function bindCityDistrictWindows(model, highlight) {
	model.updateMatrixWorld(true);
	const instance = new THREE.Matrix4(), matrix = new THREE.Matrix4(), bounds = new THREE.Box3();
	const prepared = new Map();
	model.traverse(object => {
		if (!object.isMesh) return;
		const materials = Array.isArray(object.material) ? object.material : [object.material];
		if (!materials.some(m => m.cityWindowMask || m.name === "CityArchitectural-office")) return;
		object.geometry.computeBoundingBox();
		const count = object.isInstancedMesh ? object.count : 1;
		const ids = new Float32Array(count).fill(-1);
		for (let i = 0; i < count; i++) {
			matrix.copy(object.matrixWorld);
			if (object.isInstancedMesh) { object.getMatrixAt(i, instance); matrix.multiply(instance); }
			bounds.copy(object.geometry.boundingBox).applyMatrix4(matrix);
			let best = 0;
			for (const { id, box } of highlight.buildings) {
				const width = Math.max(0, Math.min(box.max.x, bounds.max.x) - Math.max(box.min.x, bounds.min.x));
				const depth = Math.max(0, Math.min(box.max.z, bounds.max.z) - Math.max(box.min.z, bounds.min.z));
				const area = (box.max.x - box.min.x) * (box.max.z - box.min.z);
				const score = width * depth / Math.max(area, 0.001);
				if (score > best) { best = score; ids[i] = id; }
			}
		}
		const previous = prepared.get(object.geometry);
		if (previous && (previous.length !== ids.length || previous.some((id, i) => id !== ids[i]))) object.geometry = object.geometry.clone();
		if (!prepared.has(object.geometry)) {
			const attribute = object.isInstancedMesh ? new THREE.InstancedBufferAttribute(ids, 1)
				: new THREE.Float32BufferAttribute(new Float32Array(object.geometry.attributes.position.count).fill(ids[0]), 1);
			object.geometry.setAttribute("aCityDistrict", attribute);
			prepared.set(object.geometry, ids);
		}
	});
}

export function applyCityDistrictWindowShader(shader, state) {
	const highlight = state?.districtHighlight;
	if (!highlight) return;
	shader.uniforms.uCityDistrictLevels = { value: highlight.levels };
	shader.vertexShader = `attribute float aCityDistrict;
		uniform float uCityDistrictLevels[${highlight.levels.length}];
		varying float vCityDistrictGain;
	` + shader.vertexShader;
	shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
		#include <begin_vertex>
		vCityDistrictGain = 1.0;
		if (aCityDistrict >= 0.0) vCityDistrictGain += 0.65 * uCityDistrictLevels[int(aCityDistrict + 0.5)];
	`);
	shader.fragmentShader = "varying float vCityDistrictGain;\n" + shader.fragmentShader;
	// Only existing occupied panes change; the occupation masks remain untouched.
	shader.fragmentShader = shader.fragmentShader.replace(/\* (uCityWindowIntensity|uOfficeLightIntensity);/g, "* $1 * vCityDistrictGain;");
}
