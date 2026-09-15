import test from "node:test";
import assert from "node:assert/strict";
import { createMobileWhaleMaterials, createMobileWhaleTrail, createWhaleDepthOccluder } from "./mobileWhale/mobileWhaleMaterial.js";
import { Mesh, BufferGeometry, Matrix4, PerspectiveCamera, Vector3, Quaternion, Euler } from "three";
import { WhaleEntrance } from "./whaleEntrance.js";

test("whale follows a smooth camera-space arc from soft depth into its exact rest pose", () => {
	const parent = new Matrix4().compose(new Vector3(2, -3, 1),
		new Quaternion().setFromEuler(new Euler(.2, -.4, .1)), new Vector3(2, 2, 2));
	const rest = new Vector3(3, -2, -8);
	const target = new Vector3(10, -1.5, -38);
	for (const aspect of [16 / 9, 9 / 16]) {
		const config = { startX: .79, startY: .18, depth: 33.5, approachPower: 1.35 };
		const camera = new PerspectiveCamera(50, aspect, .1, 2000);
		camera.position.set(-11.5, 1.5, 26.5);
		camera.lookAt(target); camera.updateMatrixWorld();
		const motion = new WhaleEntrance();
		const position = t => motion.sample(t).applyPosition(rest.clone(), parent,
			camera.position, target, camera.fov, aspect, config);
		const start = position(0).applyMatrix4(parent);
		assert.equal(motion.reveal, .22, "visible but soft in the initial depth");
		const projected = start.clone().project(camera);
		assert.ok(Math.abs(projected.x - .79) < 1e-12);
		assert.ok(Math.abs(projected.y - .18) < 1e-12);
		const endView = rest.clone().applyMatrix4(parent).applyMatrix4(camera.matrixWorldInverse);
		let previousDepth = -start.applyMatrix4(camera.matrixWorldInverse).z;
		let previousReveal = motion.reveal;
		assert.ok(Math.abs(previousDepth + endView.z - config.depth) < 1e-10);
		const quarterDepth = -position(.25).applyMatrix4(parent).applyMatrix4(camera.matrixWorldInverse).z;
		assert.ok((previousDepth - quarterDepth) / config.depth < .2,
			"the approach keeps a calm initial pace");
		const destinationScreen = rest.clone().applyMatrix4(parent).project(camera);
		const midpointScreen = position(.5).applyMatrix4(parent).project(camera);
		assert.ok(midpointScreen.x < (config.startX + destinationScreen.x) * .5 - .04,
			"approach bends left instead of following a rigid straight line");
		assert.ok(midpointScreen.y > (config.startY + destinationScreen.y) * .5 + .04,
			"approach carries a gentle vertical swimming arc");
		previousReveal = motion.sample(0).reveal;
		for (let i = 1; i <= 360; i++) {
			const depth = -position(i / 360).applyMatrix4(parent).applyMatrix4(camera.matrixWorldInverse).z;
			assert.ok(depth <= previousDepth + 1e-10 && depth >= -endView.z - 1e-10);
			assert.ok(motion.reveal >= previousReveal && motion.reveal <= 1,
				"light reveal is continuous and never reverses");
			previousDepth = depth;
			previousReveal = motion.reveal;
		}
		assert.equal(motion.reveal, 1, "fully lit in the settled pose");
		assert.deepEqual(position(1).toArray(), rest.toArray());
		assert.ok(position(.999).distanceTo(rest) < .00001, "no final position pop");
		assert.ok(position(.001).distanceTo(position(0)) < .0001, "smooth initial motion");
		const expected = position(.72).toArray();
		for (const t of [0, .1, .4, .6, .2]) position(t);
		assert.deepEqual(position(.72).toArray(), expected, "frame cadence independent");
		assert.deepEqual(position(-1).toArray(), position(0).toArray());
		assert.deepEqual(position(2).toArray(), rest.toArray());
	}
});

test("body, material surface and wake share entrance light without overriding their opacity", () => {
	const { body, shared } = createMobileWhaleMaterials();
	const geometry = new BufferGeometry();
	const skin = createWhaleDepthOccluder(new Mesh(geometry), shared);
	const trail = createMobileWhaleTrail(shared);
	assert.equal(skin.material.uniforms.uEntranceReveal, shared.uEntranceReveal);
	assert.equal(trail.material.uniforms.uEntranceReveal, shared.uEntranceReveal);
	const opacity = shared.uOpacity.value;
	shared.uEntranceReveal.value = .2;
	assert.equal(shared.uOpacity.value, opacity);
	assert.equal(skin.material.depthWrite, false);
	skin.material.uniforms.uModelOpacity.value = 1;
	skin.onBeforeRender();
	assert.equal(skin.material.depthWrite, true, "entrance light does not make solid skin transparent");
	assert.equal(trail.material.uniforms.uEntranceReveal.value, .2);
	for (const material of [body, skin.material, trail.material]) material.dispose();
	geometry.dispose(); trail.geometry.dispose();
});
