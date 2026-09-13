import test from "node:test";
import assert from "node:assert/strict";
import { DeviceTiltInput, tiltToPointer } from "./DeviceTiltInput.js";

function environment(permission = "granted") {
	const env = new EventTarget(); env.document = new EventTarget(); env.screen = { orientation: new EventTarget() };
	env.screen.orientation.angle = 0; env.navigator = { maxTouchPoints: 1 }; env.isSecureContext = true;
	env.DeviceOrientationEvent = { requestPermission: () => { env.requested = true; return Promise.resolve(permission); } };
	return env;
}
test("neutral pose, noise dead zone, landscape rotation, wrap and clamping", () => {
	assert.deepEqual(tiltToPointer(40, 5, { beta: 40, gamma: 5 }), { x: 0, y: 0 });
	assert.equal(tiltToPointer(40, 5.2, { beta: 40, gamma: 5 }).x, 0);
	assert.equal(tiltToPointer(40, 80, { beta: 40, gamma: 5 }).x, 1);
	assert.ok(tiltToPointer(62.4, 5, { beta: 40, gamma: 5 }, 90).x > .99);
	assert.ok(Math.abs(tiltToPointer(-179, 0, { beta: 179, gamma: 0 }).y) < .1);
});
test("gesture permission is synchronous, sensor is filtered and recentred after screen rotation", async () => {
	const env = environment(), input = new DeviceTiltInput(env), pending = input.request();
	assert.equal(env.requested, true); assert.equal(await pending, true);
	const send = (beta, gamma) => env.dispatchEvent(Object.assign(new Event("deviceorientation"), { beta, gamma }));
	send(40, 0); send(40, 22.4); input.update(1 / 60);
	assert.ok(input.pointer.x > 0 && input.pointer.x < 1);
	const target = input.target.x; send(null, null); assert.equal(input.target.x, target);
	env.document.hidden = true; send(40, -22); assert.equal(input.target.x, target);
	env.document.hidden = false; env.screen.orientation.dispatchEvent(new Event("change")); send(30, 10);
	assert.equal(input.target.x, 0);
	input.dispose(); send(30, 80); assert.equal(input.target.x, 0);
});
test("denied, insecure, unavailable and disposed inputs do not install sensors", async () => {
	for (const mode of ["denied", "insecure", "desktop", "disposed"]) {
		const env = environment(mode === "denied" ? "denied" : "granted"), input = new DeviceTiltInput(env);
		if (mode === "insecure") env.isSecureContext = false;
		if (mode === "desktop") env.navigator.maxTouchPoints = 0;
		if (mode === "disposed") input.dispose();
		assert.equal(await input.request(), false); assert.equal(input.listening, false); input.dispose();
	}
});
