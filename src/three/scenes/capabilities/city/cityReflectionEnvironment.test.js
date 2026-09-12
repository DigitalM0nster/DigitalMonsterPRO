import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { setImmediate } from "node:timers";
import { prepareCityOfficeReflections } from "./cityReflectionEnvironment.js";

test("cancelling reflection compilation restores materials/bindings and releases temporary resources before any draw", async () => {
 const previousRaf = globalThis.requestAnimationFrame;
 globalThis.requestAnimationFrame = callback => setImmediate(callback);
 const geometry = new THREE.BoxGeometry(), facade = new THREE.MeshStandardMaterial();
 const office = facade.clone(); office.name = "CityArchitectural-office";
 const model = new THREE.Group(), city = new THREE.Group();
 model.add(new THREE.Mesh(geometry, facade), new THREE.Mesh(geometry, office));
 city.add(model);
 const previousTarget = {};
 let binding = [previousTarget, 3, 1], cancelled = false, draws = 0;
 const disposed = [];
 const renderer = {
  coordinateSystem: THREE.WebGLCoordinateSystem,
  getRenderTarget: () => binding[0], getActiveCubeFace: () => binding[1],
  getActiveMipmapLevel: () => binding[2],
  setRenderTarget(target, face = 0, mip = 0) {
   binding = [target, face, mip];
   if (target?.isWebGLCubeRenderTarget) target.addEventListener("dispose", () => disposed.push("cube"));
  },
  compile() {
   assert.equal(office.visible, false);
   // The model's temporary capture scene also owns the temporary sky.
   const capture = model.parent.parent;
   const sky = capture.children.find(child => child.isMesh);
   sky.geometry.addEventListener("dispose", () => disposed.push("sky geometry"));
   sky.material.addEventListener("dispose", () => disposed.push("sky material"));
   cancelled = true;
  },
  render() { draws++; },
 };
 try {
  const target = await prepareCityOfficeReflections(renderer, model, city, null, () => cancelled);
  assert.equal(target, null);
  assert.equal(draws, 0);
  assert.equal(office.visible, true);
  assert.equal(model.parent, null);
  assert.deepEqual(binding, [previousTarget, 3, 1]);
  assert.deepEqual(disposed.sort(), ["cube", "sky geometry", "sky material"]);
 } finally {
  globalThis.requestAnimationFrame = previousRaf;
  geometry.dispose(); facade.dispose(); office.dispose();
 }
});
