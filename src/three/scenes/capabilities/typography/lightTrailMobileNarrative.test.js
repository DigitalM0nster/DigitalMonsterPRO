import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CapabilityNarrative } from "./CapabilityNarrative.js";
import { trailNarrativeWallPosition } from "./capabilityNarrativeContent.js";

function create() {
	return new CapabilityNarrative(new THREE.Group(), {
		capabilities: { getMaxAnisotropy: () => 4 },
	}, "lightTrails", { width: 3072, height: 2304 }, 6, []);
}

test("mobile captions stay inside the tunnel and the portrait/landscape frustum throughout their approach", () => {
	const owner = create();
	const geometry = owner.mesh.geometry, material = owner.mesh.material, texture = owner.texture;
	for (const [width, height] of [[320, 568], [390, 844], [430, 932], [768, 1024], [844, 390]]) {
		owner.viewport.set(width, height);
		const camera = new THREE.PerspectiveCamera(80, width / height, .5, 2000);
		camera.position.set(.72, .25, 6.2);
		camera.updateMatrixWorld(true);
		for (const side of [-1, 1]) for (const progress of [0, .2, .5, .8, 1]) {
			owner.frame = { side, progress };
			owner.layout();
			assert.equal(owner.uniforms.uScreen.value, false);
			assert.equal(material.depthTest, true, "ribs occlude the letters, as on desktop");
			assert.equal(owner.mesh.scale.x, 52, "mobile inscriptions are 30% larger in world space");
			for (const x of [-.5, .5]) for (const y of [-.5, .5]) {
				const corner = new THREE.Vector3(x, y, 0).applyMatrix4(owner.mesh.matrixWorld);
				assert.ok(Math.abs(corner.x) * Math.sqrt(3) / 2 + corner.y / 2 < 36 * .91 - .4,
					"the larger inscription clears the side ribs");
				corner.project(camera);
				assert.ok(Math.abs(corner.x) < .97, `${width}x${height}: no cropped line endings`);
				assert.ok(Math.abs(corner.y) < .72, "letters occupy the passage, clear of top/bottom chrome");
			}
		}
	}
	assert.equal(owner.mesh.geometry, geometry);
	assert.equal(owner.mesh.material, material);
	assert.equal(owner.texture, texture, "resize and approach reuse the prepared atlas");
	owner.dispose();
});

test("resizing back to desktop restores the original world pose without resetting the reveal", () => {
	const owner = create();
	owner.uniforms.uReveal.value = .47;
	for (const side of [-1, 1]) {
		owner.frame = { side, progress: .5 };
		owner.viewport.set(390, 844);
		owner.layout();
		const mobileZ = owner.mesh.position.z;
		owner.frame.progress = .75;
		owner.layout();
		assert.ok(owner.mesh.position.z > mobileZ, "visible text approaches in depth");
		owner.viewport.set(1440, 900);
		owner.layout();
		const pose = trailNarrativeWallPosition(side, 36);
		assert.deepEqual(owner.mesh.position.toArray(), [pose.x, pose.y, pose.z + .75 * 27]);
		assert.equal(owner.mesh.scale.x, 40);
		assert.ok(owner.mesh.quaternion.equals(owner.wallRotations[side > 0 ? 1 : 0]));
		assert.equal(owner.uniforms.uReveal.value, .47);
	}
	owner.dispose();
});
