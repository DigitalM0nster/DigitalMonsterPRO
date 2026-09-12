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
	child.visible = false;
	second.visible = false;
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

test("reflection warmup skips hidden branches/materials and restores the active cube face after a compile error", async () => {
	const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry();
	const visible = new THREE.MeshBasicMaterial(), hidden = visible.clone();
	hidden.visible = false;
	const hiddenBranch = new THREE.Group();
	hiddenBranch.visible = false;
	hiddenBranch.add(new THREE.Mesh(geometry, visible));
	scene.add(hiddenBranch, new THREE.Mesh(geometry, [hidden, visible]));
	const target = {}, previousTarget = {};
	let binding = [previousTarget, 4, 2];
	const calls = [];
	const renderer = {
		getRenderTarget: () => binding[0],
		getActiveCubeFace: () => binding[1],
		getActiveMipmapLevel: () => binding[2],
		setRenderTarget: (value, face = 0, mip = 0) => { binding = [value, face, mip]; },
		compile(context) {
			calls.push(context.children.at(-1).material);
			assert.equal(binding[0], target);
			throw new Error("compile failed");
		},
	};
	const scheduler = new PreparationScheduler({ nextFrame: async () => {} });
	await assert.rejects(compileSceneChunked(renderer, scene, new THREE.Camera(), scheduler, target,
		{ visibleOnly: true }), /compile failed/);
	assert.deepEqual(calls, [visible]);
	assert.deepEqual(binding, [previousTarget, 4, 2]);
	assert.equal(hiddenBranch.visible, false);
	assert.equal(hidden.visible, false);
	geometry.dispose(); visible.dispose(); hidden.dispose();
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

test("async compile submits all material variants before waiting and restores RT while they compile", async () => {
	const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry();
	const first = new THREE.MeshBasicMaterial(), second = first.clone();
	scene.add(new THREE.Mesh(geometry, [first, second]));
	const previousTarget = {}, target = {}, submitted = [], releases = [];
	let currentTarget = previousTarget, settled = false;
	const scheduler = new PreparationScheduler({ nextFrame: async () => {} });
	const renderer = {
		getRenderTarget: () => currentTarget,
		setRenderTarget: value => { currentTarget = value; },
		compileAsync(context) {
			assert.equal(currentTarget, target);
			submitted.push(context.children.at(-1).material);
			return new Promise((resolve, reject) => releases.push({ resolve, reject }));
		},
	};
	const done = compileSceneChunked(renderer, scene, new THREE.Camera(), scheduler, target);
	done.then(() => { settled = true; }, () => {});
	for (let i = 0; i < 10; i++) await Promise.resolve();
	assert.deepEqual(submitted, [first, second]);
	assert.equal(currentTarget, previousTarget);
	assert.equal(settled, false);
	releases[1].resolve();
	await Promise.resolve();
	assert.equal(settled, false);
	releases[0].reject(new Error("bad shader"));
	await assert.rejects(done, /bad shader/);
	geometry.dispose(); first.dispose(); second.dispose();
});

test("model decorations join the existing RT draw, then return to their exact scene order", async () => {
	const models = new THREE.Scene(), overlayScene = new THREE.Scene(), target = {};
	const geometry = new THREE.PlaneGeometry(), material = new THREE.MeshBasicMaterial();
	const a = new THREE.Mesh(geometry, material), b = a.clone(), sibling = new THREE.Group(), label = a.clone();
	a.visible = false; b.visible = false;
	models.add(a, sibling, b); overlayScene.add(label);
	const originalChildren = [...models.children], draws = [];
	let binding = null;
	const renderer = { autoClear: true, getRenderTarget: () => binding, setRenderTarget: value => { binding = value; },
		compile() {}, render(scene) {
			draws.push(binding);
			if (binding === target) {
				assert.equal(a.parent, scene); assert.equal(b.parent, scene);
				assert.equal(a.visible, true); assert.equal(b.visible, true);
			} else {
				assert.deepEqual(models.children, originalChildren);
				assert.deepEqual(scene.children, [label]);
				assert.equal(a.visible, false); assert.equal(b.visible, false);
			}
		} };
	await warmScreenOverlay({ overlayScene, getWarmupModelMeshes: () => [b, a] }, renderer, new THREE.Camera(),
		new PreparationScheduler({ nextFrame: async () => {} }), [target, null], models);
	assert.deepEqual(draws, [target, null]);
	assert.deepEqual(models.children, originalChildren);
	assert.equal(binding, null); assert.equal(renderer.autoClear, true);
	geometry.dispose(); material.dispose();
});

test("failed model-decoration warm restores ownership after compile or GPU draw failure", async () => {
	for (const failure of ["compile", "render"]) {
		const models = new THREE.Scene(), overlayScene = new THREE.Scene();
		const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
		mesh.visible = false; models.add(mesh);
		const previous = {}, target = {}; let binding = previous;
		const renderer = { autoClear: true, getRenderTarget: () => binding, setRenderTarget: value => { binding = value; },
			compile() {}, render() {}, [failure]() { throw new Error(failure); } };
		await assert.rejects(warmScreenOverlay({ overlayScene, getWarmupModelMeshes: () => [mesh] }, renderer,
			new THREE.Camera(), new PreparationScheduler({ nextFrame: async () => {} }), [target], models), new RegExp(failure));
		assert.equal(mesh.parent, models); assert.equal(mesh.visible, false);
		assert.equal(overlayScene.children.length, 0); assert.equal(binding, previous);
		assert.equal(renderer.autoClear, true);
		mesh.geometry.dispose(); mesh.material.dispose();
	}
});
