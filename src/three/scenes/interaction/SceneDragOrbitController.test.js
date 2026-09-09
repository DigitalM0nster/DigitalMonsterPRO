import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { SceneDragOrbitController } from "./SceneDragOrbitController.js";

const cityOptions = { sceneId: "city", enabled: true, verticalEnabled: true, maxVerticalOrbit: Math.PI / 18 };

test("city grab bounds both axes and returns continuously to its authored view", () => {
  const orbit = new SceneDragOrbitController();
  const drag = { ...cityOptions, pointerDown: true };
  orbit.update(1 / 60, { ...drag, pointer: { x: -0.8, y: -0.8 } });
  assert.equal(orbit.currentVerticalOrbit, 0, "pointer-down must not change the camera pose");
  for (let i = 0; i < 90; i++) orbit.update(1 / 60, { ...drag, pointer: { x: 0.8, y: 0.8 } });
  assert.equal(orbit.targetVerticalOrbit, Math.PI / 18);
  assert.ok(Math.abs(orbit.currentOrbit * 180 / Math.PI + 25) < 0.01);
  assert.ok(Math.abs(orbit.currentVerticalOrbit * 180 / Math.PI - 10) < 0.01);
  const target = new THREE.Vector3(0, 0, 0);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(4, 3, 5); camera.lookAt(target);
  const distance = camera.position.length();
  orbit.apply(camera, "city", { orbitTarget: target });
  assert.ok(Math.abs(camera.position.length() - distance) < 1e-9, "orbit preserves the pivot distance");
  assert.ok(camera.position.y > 0, "small tilt remains above the city ground");
  const pitchBeforeRelease = orbit.currentVerticalOrbit;
  orbit.update(1 / 60, cityOptions);
  assert.ok(orbit.currentVerticalOrbit > 0 && orbit.currentVerticalOrbit < pitchBeforeRelease);
  assert.equal(orbit.isBlockingScenePointer(), true, "release cannot click a building after dragging");
  for (let i = 0; i < 180; i++) orbit.update(1 / 60, cityOptions);
  assert.equal(orbit.currentOrbit, 0);
  assert.equal(orbit.currentVerticalOrbit, 0);
  assert.equal(orbit.isBlockingScenePointer(), false);
});

test("opposite vertical drag is bounded and flight/scene change clears ownership", () => {
  const orbit = new SceneDragOrbitController();
  orbit.update(1 / 60, { ...cityOptions, pointerDown: true, pointer: { x: 0, y: 0.8 } });
  orbit.update(1 / 60, { ...cityOptions, pointerDown: true, pointer: { x: 0, y: -0.8 } });
  assert.equal(orbit.targetVerticalOrbit, -Math.PI / 18);
  orbit.update(1 / 60, { ...cityOptions, enabled: false });
  assert.equal(orbit.currentVerticalOrbit, 0);
  assert.equal(orbit.sceneId, null);
  assert.equal(orbit.isBlockingScenePointer(), false);
  orbit.update(1 / 60, { ...cityOptions, sceneId: "another" });
  assert.equal(orbit.currentVerticalOrbit, 0);
});

test("existing scene default vertical range and horizontal-only behavior are preserved", () => {
  const orbit = new SceneDragOrbitController();
  const options = { sceneId: "other", enabled: true, verticalEnabled: true, pointerDown: true };
  orbit.update(1 / 60, { ...options, pointer: { x: 0, y: -1 } });
  orbit.update(1 / 60, { ...options, pointer: { x: 0, y: 1 } });
  assert.ok(Math.abs(orbit.targetVerticalOrbit * 180 / Math.PI - 35) < 1e-9);
  orbit.dispose();
  orbit.update(1 / 60, { ...options, verticalEnabled: false, pointer: { x: 0, y: -1 } });
  orbit.update(1 / 60, { ...options, verticalEnabled: false, pointer: { x: 0, y: 1 } });
  assert.equal(orbit.currentVerticalOrbit, 0);
  assert.equal(orbit.isBlockingScenePointer(), false);
});
