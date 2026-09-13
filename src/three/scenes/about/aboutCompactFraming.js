import * as THREE from "three";

/** Cache rigid authored parts once. Dissolved covers must not frame empty space. */
export function createAboutCompactFraming(model) {
	const asset = model.getObjectByName("AboutModelAsset") ?? model;
	const parts = new Map();
	const inverse = new THREE.Matrix4();
	const transform = new THREE.Matrix4();
	const localBox = new THREE.Box3();
	model.updateWorldMatrix(true, true);
	model.traverse((mesh) => {
		if (!mesh.isMesh || !mesh.geometry || /Prepass|OutlineStroke/.test(mesh.name)) return;
		let node = mesh, owner = asset, role = "core";
		while (node && node !== model) {
			if (/^AboutEpicTextPlane/i.test(node.name)) { owner = node; role = "epic"; break; }
			if (/^(Front|FrontBackSide)$/.test(node.name)) { owner = node; role = "front"; break; }
			if (/^OUTER_cell/i.test(node.name)) {
				owner = node;
				while (/^OUTER_cell/i.test(owner.parent?.name ?? "")) owner = owner.parent;
				role = "front"; break;
			}
			if (/^(Back|BackBackSide)$/.test(node.name)) { owner = node; role = "back"; break; }
			if (node.name === "EdgeForParticles") { owner = node; role = "edge"; break; }
			if (node.name === "InsideLarge") { owner = node.getObjectByName("AboutPcbYaw") ?? node; role = "pcb"; break; }
			node = node.parent;
		}
		if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
		if (!mesh.geometry.boundingBox || mesh.geometry.boundingBox.isEmpty()) return;
		let part = parts.get(owner);
		if (!part) { part = { node: owner, role, box: new THREE.Box3() }; parts.set(owner, part); }
		inverse.copy(owner.matrixWorld).invert();
		transform.multiplyMatrices(inverse, mesh.matrixWorld);
		part.box.union(localBox.copy(mesh.geometry.boundingBox).applyMatrix4(transform));
	});
	return {
		parts: [...parts.values()],
		box: new THREE.Box3(), baseBox: new THREE.Box3(), partBox: new THREE.Box3(), epicBox: new THREE.Box3(),
		corner: new THREE.Vector3(),
	};
}

function partWeight(role, story) {
	if (role === "front") return 1 - THREE.MathUtils.smoothstep(story, 0.5, 1);
	if (role === "back") return 1 - THREE.MathUtils.smoothstep(story, 1, 1.84);
	if (role === "edge") return 1 - THREE.MathUtils.smoothstep(story, 1, 2);
	if (role === "pcb") return THREE.MathUtils.smoothstep(story, 1.5, 2);
	if (role === "epic") return THREE.MathUtils.smoothstep(story, 3, 3.35);
	return 1;
}

/** No scene traversal, geometry reads, allocations, or texture work in a frame. */
export function fitAboutCompactCamera(framing, camera, viewport, layout, story, sceneProgress) {
	if (!framing || !layout) return;
	const { box, baseBox, partBox, epicBox, corner, parts } = framing;
	baseBox.makeEmpty();
	for (const part of parts) {
		if (part.role === "core") baseBox.union(partBox.copy(part.box).applyMatrix4(part.node.matrixWorld));
	}
	if (baseBox.isEmpty()) return;
	box.copy(baseBox);
	for (const part of parts) {
		if (part.role === "core") continue;
		const weight = partWeight(part.role, story);
		if (weight <= 0) continue;
		partBox.copy(part.box).applyMatrix4(part.node.matrixWorld);
		// Retreat the bounds with the same continuous dissolve, avoiding a camera
		// jump on the frame where a fully transparent cover becomes invisible.
		partBox.min.lerpVectors(baseBox.min, partBox.min, weight);
		partBox.max.lerpVectors(baseBox.max, partBox.max, weight);
		box.union(partBox);
	}
	// The closing words become the subject of the final camera move. Framing
	// the surrounding assembly here makes their letters only a few pixels tall.
	// Include all prepared locales so switching language cannot jump the camera.
	const finale = THREE.MathUtils.smootherstep(story, 3.55, 4);
	if (finale > 0) {
		epicBox.makeEmpty();
		for (const part of parts) {
			if (part.role === "epic") epicBox.union(partBox.copy(part.box).applyMatrix4(part.node.matrixWorld));
		}
		if (!epicBox.isEmpty()) {
			box.min.lerp(epicBox.min, finale);
			box.max.lerp(epicBox.max, finale);
		}
	}
	const { width, height } = viewport;
	const availableWidth = THREE.MathUtils.lerp(layout.portrait ? width - 40 : width * 0.51, width - layout.x * 2, finale);
	const availableHeight = layout.modelHeight;
	camera.updateMatrixWorld(true);
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (let i = 0; i < 8; i += 1) {
		corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
		corner.applyMatrix4(camera.matrixWorldInverse);
		const depth = Math.max(0.01, -corner.z);
		const x = corner.x / depth, y = corner.y / depth;
		minX = Math.min(minX, x); maxX = Math.max(maxX, x);
		minY = Math.min(minY, y); maxY = Math.max(maxY, y);
	}
	// Fit perspective extents (including depth), not a diameter at the initial pivot.
	const tanHalfFov = Math.max(0.01,
		(maxX - minX) * width / (2 * availableWidth * camera.aspect),
		(maxY - minY) * height / (2 * availableHeight)) / 0.94;
	camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanHalfFov));
	camera.updateProjectionMatrix();
	const centerX = THREE.MathUtils.lerp(layout.modelCenterX, width * 0.5, finale);
	const centerY = THREE.MathUtils.lerp(layout.modelCenterY, (layout.top + height - layout.bottom) * 0.5, finale);
	camera.projectionMatrix.elements[8] = (minX + maxX) / (2 * tanHalfFov * camera.aspect) - (centerX / width * 2 - 1);
	camera.projectionMatrix.elements[9] = (minY + maxY) / (2 * tanHalfFov) - (1 - 2 * centerY / height - (Number(sceneProgress) || 0) * 0.24);
	camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
