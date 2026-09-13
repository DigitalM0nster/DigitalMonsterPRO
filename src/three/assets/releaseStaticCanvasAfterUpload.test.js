import test from "node:test";
import assert from "node:assert/strict";
import { CanvasTexture } from "three";
import { releaseStaticCanvasAfterUpload } from "./releaseStaticCanvasAfterUpload.js";

test("immutable source is released only after upload, without invalidating the prepared GPU texture", () => {
	const canvas = { width: 1800, height: 2400 }, texture = new CanvasTexture(canvas);
	let callbackSize;
	const callback = function (value) { assert.equal(value, this); callbackSize = [canvas.width, canvas.height]; };
	texture.onUpdate = callback;
	const version = texture.version, sourceVersion = texture.source.version;
	releaseStaticCanvasAfterUpload(texture, true);
	assert.deepEqual([canvas.width, canvas.height], [1800, 2400]);
	texture.onUpdate(texture);
	assert.deepEqual(callbackSize, [1800, 2400]);
	assert.deepEqual(texture.userData.releasedCanvasSize, callbackSize);
	assert.deepEqual([canvas.width, canvas.height], [1, 1]);
	assert.equal(texture.version, version); assert.equal(texture.source.version, sourceVersion);
	assert.equal(texture.onUpdate, callback);
	texture.dispose();
	assert.deepEqual(texture.userData.releasedCanvasSize, [1800, 2400]);
});

test("aborted preparation releases the CPU source even if upload never happened", () => {
	const canvas = { width: 1800, height: 2400 }, texture = new CanvasTexture(canvas);
	releaseStaticCanvasAfterUpload(texture, true); texture.dispose();
	assert.deepEqual([canvas.width, canvas.height], [1, 1]);
	assert.equal(texture.onUpdate, null);
});

test("desktop source storage and callbacks stay unchanged", () => {
	const canvas = { width: 1800, height: 2400 }, texture = new CanvasTexture(canvas);
	releaseStaticCanvasAfterUpload(texture, false);
	assert.equal(texture.onUpdate, null);
	texture.dispose(); assert.deepEqual([canvas.width, canvas.height], [1800, 2400]);
});
