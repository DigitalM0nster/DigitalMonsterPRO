import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { compileSceneChunked } from "./compileSceneChunked.js";
import { warmScreenOverlay } from "./warmScreenOverlay.js";
import { PreparationScheduler } from "../app/preparationScheduler.js";

test("compile chunks preserve instancing, material arrays, nested meshes, fog and lights without reparenting", async () => {
	const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
	const geometry = new THREE.BoxGeometry(), first = new THREE.MeshStandardMaterial(), second = first.clone();
	const mesh = new THREE.InstancedMesh(geometry, [first, second], 2);
	mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(6), 3);
	const child = new THREE.Mesh(geometry, second);
	mesh.add(child);
	const light = new THREE.PointLight();
	scene.add(mesh, light);
	scene.fog = new THREE.Fog(0, 1, 100);
	scene.environment = new THREE.Texture();
	const originalChildren = [...scene.children], calls = [];
	const previousTarget = {}, target = {};
	let currentTarget = previousTarget;
	const renderer = {
		getRenderTarget: () => currentTarget,
		setRenderTarget: value => { currentTarget = value; },
		compile(context, compileCamera) {
			assert.equal(currentTarget, target);
			assert.equal(compileCamera, camera);
			assert.equal(context.environment, scene.environment);
			assert.equal(context.fog, scene.fog);
			const objects = [], lights = [];
			context.traverse(o => { if (o.material) objects.push(o); });
			context.traverseVisible(o => { if (o.isLight) lights.push(o); });
			assert.equal(objects.length, 1);
			assert.equal(lights.length, 1);
			assert.equal(lights[0].uuid, light.uuid);
			assert.equal(objects[0].geometry, geometry);
			calls.push(objects[0]);
		},
	};
	const scheduler = new PreparationScheduler({ nextFrame: async () => {} });
	await compileSceneChunked(renderer, scene, camera, scheduler, target);
	assert.deepEqual(calls.map(o => o.material), [first, second, second]);
	assert.equal(calls[0].isInstancedMesh, true);
	assert.equal(calls[0].instanceColor, mesh.instanceColor);
	assert.equal(mesh.parent, scene);
	assert.equal(child.parent, mesh);
	assert.deepEqual(scene.children, originalChildren);
	assert.deepEqual(mesh.material, [first, second]);
	assert.equal(currentTarget, previousTarget);
	geometry.dispose(); first.dispose(); second.dispose(); scene.environment.dispose();
});

test("failed overlay draw restores render target, visibility and the original composition mode", async () => {
	const parent = new THREE.Group(), overlayScene = new THREE.Scene();
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
	mesh.visible = false;
	parent.add(mesh);
	const overlay = { overlayScene, composeMode: "models", setComposeMode(mode) {
		this.composeMode = mode;
		(mode === "screen" ? overlayScene : parent).add(mesh);
	} };
	const initialTarget = {};
	let currentTarget = initialTarget;
	const renderer = {
		autoClear: true, getRenderTarget: () => currentTarget,
		setRenderTarget: value => { currentTarget = value; }, compile() {},
		render() { assert.equal(mesh.visible, true); throw new Error("context lost"); },
	};
	const scheduler = new PreparationScheduler({ nextFrame: async () => {} });
	await assert.rejects(warmScreenOverlay(overlay, renderer, new THREE.Camera(), scheduler), /context lost/);
	assert.equal(currentTarget, initialTarget);
	assert.equal(renderer.autoClear, true);
	assert.equal(mesh.visible, false);
	assert.equal(mesh.parent, parent);
	assert.equal(overlay.composeMode, "models");
	mesh.geometry.dispose(); mesh.material.dispose();
});

test("a home overlay warms the distinct fog-bearing RT context and clean screen context", async () => {
	const scene = new THREE.Scene(), models = new THREE.Scene();
	models.fog = new THREE.Fog(0, 1, 100);
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
	scene.add(mesh);
	const target = {}, seen = [];
	let currentTarget = null;
	const renderer = {
		autoClear: true, getRenderTarget: () => currentTarget,
		setRenderTarget: value => { currentTarget = value; },
		compile(context) { seen.push([currentTarget, context.fog]); }, render() {},
	};
	const scheduler = new PreparationScheduler({ nextFrame: async () => {} });
	await warmScreenOverlay({ overlayScene: scene }, renderer, new THREE.Camera(), scheduler, [target, null], models);
	assert.deepEqual(seen, [[target, models.fog], [null, null]]);
	assert.equal(scene.fog, null);
	mesh.geometry.dispose(); mesh.material.dispose();
});
