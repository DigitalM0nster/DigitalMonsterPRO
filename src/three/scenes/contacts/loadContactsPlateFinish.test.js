import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import vm from "node:vm";
import * as THREE from "three";

const packed = readFileSync(new URL("../../../../public/images/contacts/plate-finish.rgba.gz", import.meta.url));
const source = readFileSync(new URL("./loadContactsPlateFinish.js", import.meta.url), "utf8")
	.replace(/^import .*;\s*$/gm, "").replace("export async function", "async function");

function setup({ body = packed, supported = true, status = 200 } = {}) {
	const fallback = {};
	const requests = [];
	const load = vm.runInNewContext(`${source}\nloadContactsPlateFinish`, {
		...THREE, Uint8Array, Blob, Response, DecompressionStream: supported ? DecompressionStream : undefined,
		fetch: async url => { requests.push(url); return new Response(body, { status }); },
		TextureLoader: class { loadAsync(url) { requests.push(url); return fallback; } },
	});
	return { load, fallback, requests };
}

test("prepared texture retains exact RGBA bytes, mipmaps and GPU row orientation", async () => {
	const original = gunzipSync(packed);
	assert.equal(original.length, 1024 * 1024 * 4);
	for (const body of [packed, original]) {
		const { load, requests } = setup({ body });
		const texture = await load("original.svg");
		assert.equal(texture.isDataTexture, true);
		assert.deepEqual(Buffer.from(texture.image.data), original);
		assert.equal(texture.flipY, false);
		assert.equal(texture.generateMipmaps, true);
		assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
		assert.equal(requests.length, 1);
		texture.dispose();
	}
});

test("unsupported decompression, bad responses and corrupt data retain the SVG fallback", async () => {
	for (const options of [{ supported: false }, { status: 404 }, { body: new Uint8Array([1, 2, 3]) }]) {
		const { load, fallback, requests } = setup(options);
		assert.equal(await load("original.svg"), fallback);
		assert.equal(requests.at(-1), "original.svg");
		if (options.supported === false) assert.deepEqual(requests, ["original.svg"]);
	}
});
