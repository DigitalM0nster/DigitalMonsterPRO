import test from "node:test";
import assert from "node:assert/strict";
import { Bone, Box3, BufferGeometry, Float32BufferAttribute, Matrix4, MeshBasicMaterial,
	Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector2, Vector3 } from "three";
import { WhaleSurfaceHit, WhaleSurfaceInteraction } from "./whaleSurfaceInteraction.js";

function fixture() {
	const events = new EventTarget(); let allowed = true;
	const effect = new WhaleSurfaceInteraction({ eventTarget: events, canInteract: () => allowed, viewport: () => [1000, 800] });
	effect.surface = { contains: p => Math.abs(p.x) < .5 && Math.abs(p.y) < .5,
		pick: (p, position, normal) => { position.set(p.x, p.y, 1); normal.set(0, 0, 1); return true; } };
	const frame = { pointer: new Vector2(), interactionEnabled: true, pointerBlocked: false, pointerDown: false };
	const run = (seconds, hover = true, reduced = false, ready = true) => {
		for (let i = 0; i < seconds * 60; i++) effect.update(1 / 60, frame, ready, hover, reduced);
	};
	const send = (type, x = 500, y = 400) => {
		const event = new Event(type);
		Object.assign(event, { button: 0, pointerId: 1, pointerType: "touch", clientX: x, clientY: y });
		events.dispatchEvent(event);
	};
	return { effect, frame, run, send, block: () => { allowed = false; } };
}

test("hover light is live immediately, but holding never launches a gesture", () => {
	const f = fixture(); f.run(.5, true, false, false); assert.equal(f.effect.touch, 0);
	f.run(.1); assert.ok(f.effect.touch > .4, "no wait for intro completion");
	f.run(4); assert.equal(f.effect.responseWeight, 0, "press-and-hold interaction was removed");
	assert.equal(f.effect.responseEnergy, 0);
	f.effect.dispose();
});

test("only a short body tap launches sonar; drags, scroll, menu and background do not", () => {
	for (const cancellation of ["drag", "wheel", "pointercancel", "blur", "menu", "background"]) {
		const f = fixture(); f.send("pointerdown");
		if (cancellation === "drag") f.send("pointermove", 530);
		else if (cancellation === "menu") f.block();
		else if (cancellation === "background") f.send("pointermove", 900);
		else f.send(cancellation);
		f.send("pointerup"); f.run(1 / 60);
		assert.equal(f.effect.sonarAge, 3, cancellation);
		assert.equal(f.effect.responseWeight, 0, cancellation); f.effect.dispose();
	}
	const f = fixture(); f.send("pointerdown"); f.send("pointerup"); f.run(1 / 60);
	assert.equal(f.effect.sonarAge, 0); assert.equal(f.effect.sonarStrength, 1);
	assert.equal(f.effect.responseWeight, 1); assert.ok(f.effect.responseEnergy > 0);
	assert.deepEqual(f.effect.sonarPosition.toArray(), [0, 0, 1], "tap uses a 3D surface point");
	f.run(.2); const firstAge = f.effect.sonarAges[0];
	f.send("pointerdown"); f.send("pointerup"); f.run(1 / 60);
	assert.ok(f.effect.sonarAges[0] > firstAge, "the first pulse remains continuous");
	assert.equal(f.effect.sonarAges[1], 0, "the repeat pulse starts on the prepared second channel");
	f.effect.dispose(); f.send("pointerdown"); f.send("pointerup");
	assert.equal(f.effect.pendingSonar, false, "listeners are removed");
});

test("repeated taps blend immediately without resetting the active wave or body gesture", () => {
	const f = fixture();
	f.send("pointerdown"); f.send("pointerup"); f.run(1 / 60);
	f.run(.8);
	const age = f.effect.sonarAges[0], progress = f.effect.responseProgresses[0];
	f.send("pointerdown", 600, 400); f.send("pointerup", 600, 400); f.run(1 / 60);
	assert.ok(f.effect.sonarAges[0] > age, "the first visible wave radius stays monotonic");
	assert.ok(f.effect.responseProgresses[0] > progress, "the first authored gesture keeps advancing");
	assert.equal(f.effect.sonarAges[1], 0, "the second wave starts immediately");
	assert.ok(f.effect.responseProgresses[1] > 0 && f.effect.responseProgresses[1] < .02,
		"the second gesture blends in from its neutral frame");
	assert.ok(f.effect.responseEnergies[0] > 0 && f.effect.responseEnergies[1] > 0,
		"both prepared reactions overlap");
	assert.ok(f.effect.responseEnergy <= 1, "rapid input cannot amplify the directional reaction");
	f.effect.dispose();
});

test("sonar origin picks the nearest animated triangle and stays in bind space across viewpoints", () => {
	const geometry = new BufferGeometry();
	geometry.setAttribute("position", new Float32BufferAttribute([
		-1,-1,0, 1,-1,0, 0,1,0, -1,-1,-2, 1,-1,-2, 0,1,-2,
	], 3));
	geometry.computeVertexNormals();
	geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Uint16Array(24), 4));
	geometry.setAttribute("skinWeight", new Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0], 4));
	const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial()), bone = new Bone();
	mesh.add(bone); mesh.bind(new Skeleton([bone]));
	const surface = new WhaleSurfaceHit({ surfaceMesh: mesh,
		boneBounds: [new Box3(new Vector3(-1,-1,-2),new Vector3(1,1,0))],
		skeleton: mesh.skeleton, bindMatrix: mesh.bindMatrix });
	const anchor = new Vector3(.1,-.1,0), position = new Vector3(), normal = new Vector3();
	for (const cameraX of [-2,0,2]) {
		bone.rotation.z = .4; bone.position.set(.3,.2,.1);
		mesh.rotation.y = .3; mesh.scale.setScalar(1.5); mesh.updateMatrixWorld(true);
		const world = mesh.applyBoneTransform(0, anchor.clone()).applyMatrix4(mesh.matrixWorld);
		surface.syncCamera(new Vector3(cameraX,1,6), world, 50, 1.5);
		assert.equal(surface.pick(new Vector2(), position, normal), true);
		assert.ok(position.distanceTo(anchor) < .00001, "animation/camera cannot move the wave's attachment point");
		assert.ok(normal.distanceTo(new Vector3(0,0,1)) < .00001);
	}
	assert.equal(surface.pick(new Vector2(.99,.99), position, normal), false);
	mesh.material.dispose(); geometry.dispose(); mesh.skeleton.dispose();
});

test("a proxy hit without a real surface hit cannot launch a floating wave", () => {
	const f = fixture(); f.effect.surface.pick = () => false;
	f.send("pointerdown"); f.send("pointerup"); f.run(1/60);
	assert.equal(f.effect.sonarAge, 3); assert.equal(f.effect.pendingSonar, false);
	assert.equal(f.effect.pendingResponse, false); assert.equal(f.effect.responseWeight, 0);
	f.effect.dispose();
});

test("slow continuous stroking is not mistaken for a click response", () => {
	const f = fixture();
	for (let i = 0; i < 240; i++) {
		f.frame.pointer.x = Math.sin(i / 60) * .3;
		f.run(1 / 60);
	}
	assert.equal(f.effect.responseWeight, 0);
	f.effect.dispose();
});

test("Y-band and DOM blockers fade effects; reduced motion keeps only a subdued sonar", () => {
	const f = fixture(); f.run(.5); f.frame.interactionEnabled = false; f.run(2);
	assert.ok(f.effect.touch < .00001); assert.equal(f.effect.responseWeight, 0);
	f.frame.interactionEnabled = true; f.run(2, true, true);
	assert.ok(f.effect.touch < .00001); assert.equal(f.effect.responseWeight, 0);
	f.send("pointerdown"); f.send("pointerup"); f.run(1 / 60, false, true);
	assert.equal(f.effect.sonarStrength, .25);
	assert.ok(Math.abs(f.effect.responseWeight - .16) < 1e-6);
	f.effect.dispose();
});

test("prepared body proxies follow bones and reject empty space without vertex skinning", () => {
	const bone = new Bone(); bone.updateMatrixWorld();
	const hit = new WhaleSurfaceHit({ boneBounds: [new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1))],
		skeleton: { bones: [bone], boneInverses: [new Matrix4()] }, bindMatrix: new Matrix4() });
	hit.syncCamera(new Vector3(0, 0, 5), new Vector3(), 45, 1);
	assert.equal(hit.contains(new Vector2()), true);
	assert.equal(hit.contains(new Vector2(.95, .95)), false);
	bone.position.x = 10; bone.updateMatrixWorld();
	assert.equal(hit.contains(new Vector2()), false, "hit region follows swimming skeleton");
});
