import test from "node:test";
import assert from "node:assert/strict";
import { Bone, Box3, Matrix4, Vector2, Vector3 } from "three";
import { WhaleSurfaceHit, WhaleSurfaceInteraction } from "./whaleSurfaceInteraction.js";

function fixture() {
	const events = new EventTarget(); let allowed = true;
	const effect = new WhaleSurfaceInteraction({ eventTarget: events, canInteract: () => allowed, viewport: () => [1000, 800] });
	effect.surface = { contains: p => Math.abs(p.x) < .5 && Math.abs(p.y) < .5 };
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

test("touch and curiosity are live as soon as the prepared whale appears", () => {
	const f = fixture(); f.run(.5, true, false, false); assert.equal(f.effect.touch, 0);
	f.run(.1); assert.ok(f.effect.touch > .4, "no wait for intro completion");
	f.run(1.2); assert.equal(f.effect.curiosityWeight, 1);
	assert.ok(f.effect.curiosityTime > 0 && f.effect.curiosityTime < 1);
	f.run(2.2); assert.equal(f.effect.curiosityWeight, 0);
	f.run(1); assert.equal(f.effect.curiosityWeight, 0, "dwell does not loop continuously");
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
		assert.equal(f.effect.sonarAge, 3, cancellation); f.effect.dispose();
	}
	const f = fixture(); f.send("pointerdown"); f.send("pointerup"); f.run(1 / 60);
	assert.equal(f.effect.sonarAge, 0); assert.equal(f.effect.sonarStrength, 1);
	f.run(.2); f.send("pointerdown"); f.send("pointerup"); f.run(1 / 60);
	assert.ok(f.effect.sonarAge > .2, "repeated taps cannot stack pulses");
	f.effect.dispose(); f.send("pointerdown"); f.send("pointerup");
	assert.equal(f.effect.pendingSonar, false, "listeners are removed");
});

test("slow continuous stroking is not mistaken for stationary curiosity", () => {
	const f = fixture();
	for (let i = 0; i < 240; i++) {
		f.frame.pointer.x = Math.sin(i / 60) * .3;
		f.run(1 / 60);
	}
	assert.equal(f.effect.curiosityWeight, 0);
	f.effect.dispose();
});

test("Y-band and DOM blockers fade effects; reduced motion keeps only a subdued sonar", () => {
	const f = fixture(); f.run(.5); f.frame.interactionEnabled = false; f.run(2);
	assert.ok(f.effect.touch < .00001); assert.equal(f.effect.curiosityWeight, 0);
	f.frame.interactionEnabled = true; f.run(2, true, true);
	assert.ok(f.effect.touch < .00001); assert.equal(f.effect.curiosityWeight, 0);
	f.send("pointerdown"); f.send("pointerup"); f.run(1 / 60, false, true);
	assert.equal(f.effect.sonarStrength, .25);
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
