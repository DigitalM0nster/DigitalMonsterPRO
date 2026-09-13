import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers";
import { createGLTFLoader, disposeSharedDracoLoader } from "./gltfLoader.js";

test("disposing while Draco initializes cannot start a worker afterwards", async () => {
	const draco = createGLTFLoader().dracoLoader;
	let finish;
	draco._initDecoder = () => new Promise(resolve => { finish = resolve; });
	const pending = draco._getWorker(1, 100);
	disposeSharedDracoLoader(); finish();
	await assert.rejects(pending, { name: "AbortError" });
	assert.equal(draco.workerPool.length, 0);
});

test("disposing settles active decode jobs and the next app receives a fresh decoder", async () => {
	const draco = createGLTFLoader().dracoLoader;
	let terminated = 0;
	const pending = new Promise((resolve, reject) => {
		draco.workerPool.push({ _callbacks: { 1: { resolve, reject } }, terminate: () => terminated++ });
	});
	disposeSharedDracoLoader();
	await assert.rejects(pending, { name: "AbortError" });
	assert.equal(terminated, 1); assert.equal(draco.workerPool.length, 0);
	assert.notEqual(createGLTFLoader().dracoLoader, draco);
	disposeSharedDracoLoader();
});

test("callback-only glTF callers do not emit unhandled cancellations or receive geometry after disposal", async () => {
	const draco = createGLTFLoader().dracoLoader;
	let callbackCalls = 0;
	disposeSharedDracoLoader();
	// GLTFLoader r155 ignores the return value; node:test reports an unhandled
	// rejection as a failure even though no renderer exists in this test.
	draco.decodeDracoFile(new ArrayBuffer(8), () => callbackCalls++);
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(callbackCalls, 0);
});
