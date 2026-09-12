import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import * as THREE from "three";

const source = readFileSync(new URL("./syntheticCoreHardware.js", import.meta.url), "utf8");
const patch = vm.runInNewContext(source.slice(source.indexOf("function createShellPatch("), source.indexOf("function irisBlade(")) + ";createShellPatch", {
	THREE, point: (r,p,t) => new THREE.Vector3(r*Math.sin(t)*Math.cos(p),r*Math.sin(t)*Math.sin(p),r*Math.cos(t)),
});

// Recorded from the original implementation before optimization: position,
// normal and UV bytes, in triangle order. Covers armour, channels and shields.
const reference = [
	"39dd4f5a5baf2f002a028ed36f1a4f28cfccf169ba3908bb50df556fe523b670",
	"37b46dc7a60877d9d5dc206b6cf90d0309c401a316eee07e6055c9d4d2545931",
	"ecfc448aadde79d9f92a4be78f8c3baad1acd1fd03370c627c3efd005647e6d3",
	"c5c77571701260ade35452853f998e9f516338e3acf97ae4527219c12e758b46",
	"8644fab94b7698c5052ba84e9732cc521e679c99ba6d55007ae4809594d71e04",
	"94e9299d4d65c7c35e345f620b40f396ebbe7662091bea03e5766050222ad9ae",
	"9eb3f3006501ac6720b9c65c509847cca2a3fb984048fdbfe3f57acd77c8cdc9",
	"e0553d5122d9a8b31995713b2bfc5eff3f4220addc40a04ee31bfb44836e09b9",
	"4f4162376a100801a3cc6e18f0de5052791b91d0e357b66b5b9d0cf3bb458a6c",
];
test("cached shell corners preserve the original geometry byte for byte", () => {
	let index = 0;
	for (const detail of [.45,.7,1]) {
		for (const args of [[2.08,0,.57,.74,.39,.1],[2.3,.13,.3,.9,.011,.012],[2.2,1.2,.37,.8,.64,.1]]) {
			const geometry = patch(...args,detail), hash = createHash("sha256");
			for (const name of ["position","normal","uv"]) hash.update(new Uint8Array(geometry.attributes[name].array.buffer));
			assert.equal(hash.digest("hex"),reference[index++]);
			geometry.dispose();
		}
	}
});
