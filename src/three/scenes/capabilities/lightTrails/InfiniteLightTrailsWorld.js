import * as THREE from "three";
import { createLightTrailsEnvironment, TUNNEL_LENGTH, ENVIRONMENT_FLIGHT_SPEED } from "./createLightTrailsEnvironment.js";
import { ReferenceTrailMotion } from "./ReferenceTrailMotion.js";
import { createReferenceNoise } from "./referenceTrailNoise.js";

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smooth01 = (value) => {
	const t = clamp01(value);
	return t * t * (3 - 2 * t);
};
const MAIN_TRAIL_COUNT = 7;
const MAIN_TRAIL_SEGMENTS = 39;
const TRAIL_CHAIN_POINT_COUNT = 42;
const SECONDARY_TRAIL_COUNT = 56;
const SECONDARY_TRAIL_SEGMENTS = 32;
// The camera flies slightly to the right of the tunnel axis while the light
// bundle enters from the lower-left edge and keeps its tunnel-space heading.
const CAMERA_POSITION = new THREE.Vector3(0.72, 0.25, 6.2);
const CAMERA_FOV = 80;

// The reference MeshLine profile: 40 samples, constant world width, projected
// previous/next tangents. Perspective alone makes the bundle narrow in depth.
const mainTrailVertexShader = /* glsl */ `
 attribute float aT;
 attribute float aPrevious;
 attribute float aNext;
 attribute float aSide;
 attribute float aHue;
 attribute float aTrailIndex;
 uniform sampler2D uChainMap;
 varying float vT;
 varying float vHue;
 vec3 readPoint(float u) {
  return texture2D(uChainMap, vec2(u, (aTrailIndex + 1.0) / 7.0)).xyz;
 }
 vec2 projectPoint(vec4 point, float aspect) {
  return point.xy / point.w * vec2(aspect, 1.0);
 }
 vec2 direction(vec2 delta) {
  return length(delta) > 0.000001 ? normalize(delta) : vec2(1.0, 0.0);
 }
 void main() {
  mat4 m = projectionMatrix * modelViewMatrix;
  vec4 current = m * vec4(readPoint(aT), 1.0);
  vec4 previous = m * vec4(readPoint(aPrevious), 1.0);
  vec4 next = m * vec4(readPoint(aNext), 1.0);
  float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
  vec2 p = projectPoint(current, aspect);
  vec2 before = projectPoint(previous, aspect);
  vec2 after = projectPoint(next, aspect);
  vec2 dir;
  if (distance(after, p) < 0.000001) dir = direction(p - before);
  else if (distance(before, p) < 0.000001) dir = direction(after - p);
  else dir = direction(direction(p - before) + direction(after - p));
  vec2 normal = vec2(-dir.y, dir.x) * (0.5 * 0.56 * 0.095);
  normal *= vec2(projectionMatrix[0][0], projectionMatrix[1][1]);
  current.xy += normal * aSide;
  gl_Position = current;
  vT = aT;
  vHue = aHue;
 }
`;

const mainTrailFragmentShader = /* glsl */ `
 uniform float uReveal;
 uniform vec3 uColorA;
 uniform vec3 uColorB;
 varying float vT;
 varying float vHue;
 void main() {
  float reveal = smoothstep(1.0 - uReveal, 1.04 - uReveal, vT);
  if (uReveal < 0.002) discard;
  // Keep a restrained HDR halo while preserving the reference line profile and opacity.
  gl_FragColor = vec4(mix(uColorA, uColorB, vHue) * 1.25, uReveal > 0.999 ? 1.0 : reveal);
 }
`;

const secondaryTrailVertexShader = /* glsl */ `
	attribute float aT;
	attribute float aPhase;
	attribute float aHue;
	attribute float aSpeed;

	uniform float uTime;
	uniform float uReveal;
	uniform vec2 uPointer;

	varying float vT;
	varying float vPhase;
	varying float vHue;
	varying float vSpeed;
	varying float vReveal;

	void main() {
		float t = aT;
		float envelope = sin(t * 3.1415926);
		vec3 center = position;
		center.x += sin(t * 7.0 + aPhase * 19.0 + uTime * 0.18) * 0.075 * envelope;
		center.y += cos(t * 5.0 + aPhase * 13.0 - uTime * 0.14) * 0.05 * envelope;
		center.x += uPointer.x * mix(0.15, 0.7, t);

		vT = t;
		vPhase = aPhase;
		vHue = aHue;
		vSpeed = aSpeed;
		vReveal = uReveal;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(center, 1.0);
	}
`;

const secondaryTrailFragmentShader = /* glsl */ `
	uniform float uTime;
	uniform vec3 uColorA;
	uniform vec3 uColorB;

	varying float vT;
	varying float vPhase;
	varying float vHue;
	varying float vSpeed;
	varying float vReveal;

	void main() {
		vec3 color = mix(uColorA, uColorB, clamp(vHue, 0.0, 1.0));
		float travel = fract(vT * 1.65 - uTime * vSpeed + vPhase);
		float movingSignal = pow(1.0 - travel, 6.5);
		float ends = smoothstep(0.0, 0.09, vT) * smoothstep(0.0, 0.1, 1.0 - vT);
		float alpha = (0.13 + movingSignal * 0.36) * ends * vReveal;
		if (alpha < 0.002) discard;
		gl_FragColor = vec4(color * (0.98 + movingSignal * 1.7), alpha);
	}
`;

function createMainTrailGeometry() {
	const verticesPerTrail = (MAIN_TRAIL_SEGMENTS + 1) * 2;
	const vertexCount = MAIN_TRAIL_COUNT * verticesPerTrail;
	const positions = new Float32Array(vertexCount * 3);
	const tValues = new Float32Array(vertexCount);
	const previousValues = new Float32Array(vertexCount);
	const nextValues = new Float32Array(vertexCount);
	const sides = new Float32Array(vertexCount);
	const hues = new Float32Array(vertexCount);
	const trailIndices = new Float32Array(vertexCount);
	const indices = new Uint32Array(
		MAIN_TRAIL_COUNT * MAIN_TRAIL_SEGMENTS * 6,
	);
	let vertexIndex = 0;
	let indexIndex = 0;

	for (let trail = 0; trail < MAIN_TRAIL_COUNT; trail += 1) {
		const hue = trail / Math.max(1, MAIN_TRAIL_COUNT - 1);
		const trailStart = vertexIndex;
		for (let segment = 0; segment <= MAIN_TRAIL_SEGMENTS; segment += 1) {
			const t = segment / 40;
			for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
				const offset = vertexIndex * 3;
				positions[offset] = 0;
				positions[offset + 1] = 0;
				positions[offset + 2] = 0;
				tValues[vertexIndex] = t;
				previousValues[vertexIndex] = segment < 39 ? (segment - 1) / 40 : 0;
				nextValues[vertexIndex] = segment > 0 ? (segment + 1) / 40 : 0;
				sides[vertexIndex] = sideIndex === 0 ? -1 : 1;
				hues[vertexIndex] = hue;
				trailIndices[vertexIndex] = trail;
				vertexIndex += 1;
			}
		}
		for (let segment = 0; segment < MAIN_TRAIL_SEGMENTS; segment += 1) {
			const a = trailStart + segment * 2;
			const b = a + 1;
			const c = a + 2;
			const d = a + 3;
			indices[indexIndex++] = a;
			indices[indexIndex++] = c;
			indices[indexIndex++] = b;
			indices[indexIndex++] = c;
			indices[indexIndex++] = d;
			indices[indexIndex++] = b;
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute("aT", new THREE.BufferAttribute(tValues, 1));
	geometry.setAttribute("aPrevious", new THREE.BufferAttribute(previousValues, 1));
	geometry.setAttribute("aNext", new THREE.BufferAttribute(nextValues, 1));
	geometry.setAttribute("aSide", new THREE.BufferAttribute(sides, 1));
	geometry.setAttribute("aHue", new THREE.BufferAttribute(hues, 1));
	geometry.setAttribute("aTrailIndex", new THREE.BufferAttribute(trailIndices, 1));
	geometry.setIndex(new THREE.BufferAttribute(indices, 1));
	geometry.computeBoundingSphere();
	return geometry;
}

function createTrailChainTexture(data) {
	const texture = new THREE.DataTexture(
		data,
		TRAIL_CHAIN_POINT_COUNT,
		MAIN_TRAIL_COUNT,
		THREE.RGBAFormat,
		THREE.FloatType,
	);
	texture.name = "capability-light-trails-chain-map";
	texture.minFilter = THREE.NearestFilter;
	texture.magFilter = THREE.NearestFilter;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	return texture;
}

function createMainTrails(disposables, chainTexture) {
 const geometry = createMainTrailGeometry();
 const material = new THREE.ShaderMaterial({
  uniforms: {
   uReveal: { value: 0 },
   uChainMap: { value: chainTexture },
   uColorA: { value: new THREE.Color(0xd9f8ff) },
   uColorB: { value: new THREE.Color(0x82dcff) },
  },
  vertexShader: mainTrailVertexShader,
  fragmentShader: mainTrailFragmentShader,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  depthTest: false,
  side: THREE.DoubleSide,
  toneMapped: false,
 });
 const core = new THREE.Mesh(geometry, material);
 core.name = "capability-light-trails-core";
 core.frustumCulled = false;
 core.renderOrder = 3;
 disposables.push(geometry, material);
 return { core, materials: [material] };
}

function createSecondaryTrailGeometry(random) {
	const verticesPerTrail = SECONDARY_TRAIL_SEGMENTS * 2;
	const vertexCount = SECONDARY_TRAIL_COUNT * verticesPerTrail;
	const positions = new Float32Array(vertexCount * 3);
	const tValues = new Float32Array(vertexCount);
	const phases = new Float32Array(vertexCount);
	const hues = new Float32Array(vertexCount);
	const speeds = new Float32Array(vertexCount);
	let vertexIndex = 0;

	for (let trail = 0; trail < SECONDARY_TRAIL_COUNT; trail += 1) {
		const depth = 7 + random() * 19;
		const halfHeight = (depth + CAMERA_POSITION.z) * 0.49;
		const halfWidth = halfHeight * 1.78;
		const startX = -halfWidth + random() * halfWidth * 1.65;
		const startY = -halfHeight + random() * halfHeight * 1.78;
		const startZ = -depth;
		const endX = startX + halfWidth * (0.14 + random() * 0.22);
		const endY = startY + halfHeight * (0.08 + random() * 0.2);
		const endZ = startZ - 1.5 - random() * 4;
		const phase = random();
		const hue = random();
		const speed = 0.075 + random() * 0.14;
		const curveX = (random() - 0.5) * 0.42;
		const curveY = (random() - 0.5) * 0.32;

		for (let segment = 0; segment < SECONDARY_TRAIL_SEGMENTS; segment += 1) {
			for (let endpoint = 0; endpoint < 2; endpoint += 1) {
				const t = (segment + endpoint) / SECONDARY_TRAIL_SEGMENTS;
				const curveEnvelope = Math.sin(t * Math.PI);
				const positionOffset = vertexIndex * 3;
				positions[positionOffset] = THREE.MathUtils.lerp(startX, endX, t) + curveX * curveEnvelope;
				positions[positionOffset + 1] = THREE.MathUtils.lerp(startY, endY, t) + curveY * curveEnvelope;
				positions[positionOffset + 2] = THREE.MathUtils.lerp(startZ, endZ, t);
				tValues[vertexIndex] = t;
				phases[vertexIndex] = phase;
				hues[vertexIndex] = hue;
				speeds[vertexIndex] = speed;
				vertexIndex += 1;
			}
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute("aT", new THREE.BufferAttribute(tValues, 1));
	geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
	geometry.setAttribute("aHue", new THREE.BufferAttribute(hues, 1));
	geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
	geometry.computeBoundingSphere();
	return geometry;
}

function createSecondaryTrails(disposables, random) {
	const geometry = createSecondaryTrailGeometry(random);
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uReveal: { value: 0 },
			uPointer: { value: new THREE.Vector2() },
			uColorA: { value: new THREE.Color(0x20cfff) },
			uColorB: { value: new THREE.Color(0x9c36ff) },
		},
		vertexShader: secondaryTrailVertexShader,
		fragmentShader: secondaryTrailFragmentShader,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		depthTest: false,
		toneMapped: false,
	});
	const mesh = new THREE.LineSegments(geometry, material);
	mesh.name = "capability-light-trails-secondary-field";
	mesh.frustumCulled = false;
	mesh.renderOrder = 2;
	disposables.push(geometry, material);
	return { mesh, material };
}

export class InfiniteLightTrailsWorld {
	constructor(scene, inputElement = null) {
		this.group = new THREE.Group();
		this.group.name = "capability-light-trails-world";
		this.disposables = [];
		this.elapsed = 0;
		this.travel = 0;
		this.reveal = 0;
		this.renderEnabled = false;
		this.pointer = new THREE.Vector2();
		this.cameraPointer = new THREE.Vector2();
		this.cameraPointerTarget = new THREE.Vector2();
		this.pointerTarget = new THREE.Vector2();
		this._pointerOutside = false;
		this.cameraBank = 0;
		this.cameraBankTarget = 0;
		this._pointerWasDown = false;
		this.trailChainData = new Float32Array(
			TRAIL_CHAIN_POINT_COUNT * MAIN_TRAIL_COUNT * 4,
		);
		this.trailChainTexture = createTrailChainTexture(this.trailChainData);
		this._randomState = 0x7f4a7c15;
		this.trailMotion = new ReferenceTrailMotion(this.trailChainData, () => this._random());
		this._referenceCameraEuler = new THREE.Euler(0, 0, 0, "YXZ");
		this._referenceCameraPosition = new THREE.Vector2();
		this._referenceCameraNoise = createReferenceNoise("camera");
		this._referenceIdleRoll = 0;
		this._referencePreviousPointerX = 0;
		this._warming = false;
		this._cameraLiveQuaternion = new THREE.Quaternion();
		this._cameraLivePosition = new THREE.Vector3();
		this._cameraUp = new THREE.Vector3(0, 1, 0);
		this._cameraBankQuaternion = new THREE.Quaternion();
		this.inputElement = inputElement;
		this.interactionEnabled = true;
		this._onPointerDown = () => {
			if (!this.renderEnabled || !this.interactionEnabled) return;
			this._pointerOutside = false;
			this._pointerWasDown = true;
			this._triggerClickSpin();
		};
		this._onPointerLeave = (event) => {
			// Crossing from canvas onto HTML chrome is still inside the viewport.
			if (event?.type === "pointerleave" && event.relatedTarget) return;
			this._pointerOutside = true;
			this._pointerWasDown = false;
		};
		this._onPointerMove = () => { this._pointerOutside = false; };
		this._onPointerUp = (event) => {
			this._pointerWasDown = false;
			if (event.pointerType === "touch") {
				this._onPointerLeave();
				this.trailMotion.releaseTouch();
			}
		};
		this.inputWindow = inputElement?.ownerDocument?.defaultView;
		this.inputElement?.addEventListener("pointerdown", this._onPointerDown);
		this.inputElement?.addEventListener("pointerleave", this._onPointerLeave);
		this.inputElement?.addEventListener("pointercancel", this._onPointerLeave);
		this.inputElement?.addEventListener("pointermove", this._onPointerMove);
		this.inputElement?.addEventListener("pointerup", this._onPointerUp);
		this.inputWindow?.addEventListener("pointermove", this._onPointerMove, { capture: true });
		this.inputWindow?.addEventListener("blur", this._onPointerLeave);

		this.environment = createLightTrailsEnvironment(this.disposables);
		this.readyPromise = this.environment.userData.readyPromise;
		this.secondaryTrails = createSecondaryTrails(this.disposables, () => this._random());
		// Retire the old tunnel's decorative wire field; retain the main bundle's RNG sequence.
		this.secondaryTrails.mesh.visible = false;
		this.trails = createMainTrails(
			this.disposables,
			this.trailChainTexture,
		);
		this.disposables.push(this.trailChainTexture);
		this.group.add(
			this.environment,
			this.secondaryTrails.mesh,
			this.trails.core,
		);
		scene.add(this.group);
		this.setReveal(0);
	}

	setReveal(value) {
		this.reveal = smooth01(value);
		this.environment.material.uniforms.uReveal.value = this.reveal;
		this.secondaryTrails.material.uniforms.uReveal.value = this.reveal;
		for (const material of this.trails.materials) material.uniforms.uReveal.value = this.reveal;
		this.group.visible = this._warming || (this.renderEnabled && this.reveal > 0.001);
	}

	setRenderEnabled(enabled, { preserveMotion = false } = {}) {
		this.renderEnabled = Boolean(enabled);
		if (!this.renderEnabled && !preserveMotion) {
			this._pointerWasDown = false;
			this.cameraBank = 0;
			this.cameraBankTarget = 0;
		}
		this.group.visible = this._warming || (this.renderEnabled && this.reveal > 0.001);
	}

	setInteractionEnabled(enabled) {
		this.interactionEnabled = Boolean(enabled);
		if (!this.interactionEnabled) this._pointerWasDown = false;
	}

	_random() {
		this._randomState = (Math.imul(this._randomState, 1664525) + 1013904223) >>> 0;
		return this._randomState / 4294967296;
	}

	_triggerClickSpin() {
		return this.trailMotion.startSpin();
	}

	update(delta, frame, reveal) {
		this.setReveal(reveal);
		if (!this.group.visible && !this._warming) return;
		const dt = Math.max(0, Math.min(delta, 0.05));
		this.elapsed += dt;
		this.travel = (this.travel + dt * ENVIRONMENT_FLIGHT_SPEED) % TUNNEL_LENGTH;
		const clickEnabled = this.interactionEnabled && !this._pointerOutside
			&& frame?.interactionEnabled !== false && !frame?.pointerBlocked && !this._warming;
		// Passive motion follows the viewport signal over HTML menus too. Scene
		// clicks still require the owned interaction pointer and its Y-band.
		const visualPointer = frame?.visualPointer ?? frame?.pointer;
		const steeringEnabled = !this._pointerOutside && !this._warming
			&& (frame?.visualPointer != null || clickEnabled);
		// The camera retains the last owned cursor target. Its orientation is
		// independent of the free-base chains and their touch-release animation.
		if (steeringEnabled && visualPointer) {
			this.cameraPointerTarget.set(
				THREE.MathUtils.clamp(Number(visualPointer.x) || 0, -1, 1),
				THREE.MathUtils.clamp(Number(visualPointer.y) || 0, -1, 1),
			);
		}
		const pointerDown = clickEnabled && Boolean(frame?.pointerDown);
		if (pointerDown && !this._pointerWasDown && this.renderEnabled) {
			this._triggerClickSpin();
		}
		this._pointerWasDown = pointerDown;
		if (this.trailMotion.update(dt, visualPointer, steeringEnabled)) {
			this.trailChainTexture.needsUpdate = true;
		}
		this.pointerTarget.copy(this.trailMotion.pointer);
		this.pointer.x = THREE.MathUtils.damp(this.pointer.x, this.pointerTarget.x, 7.6, dt);
		this.pointer.y = THREE.MathUtils.damp(this.pointer.y, this.pointerTarget.y, 7.6, dt);
		this.cameraPointer.x = THREE.MathUtils.damp(
			this.cameraPointer.x,
			this.cameraPointerTarget.x,
			-60 * Math.log(0.95),
			dt,
		);
		this.cameraPointer.y = THREE.MathUtils.damp(
			this.cameraPointer.y,
			this.cameraPointerTarget.y,
			-60 * Math.log(0.95),
			dt,
		);
  const positionLerp = 1 - Math.pow(0.92, dt * 60);
  this._referenceCameraPosition.lerp(this.cameraPointerTarget, positionLerp);
  const velocity = dt > 0 ? (this.cameraPointerTarget.x - this._referencePreviousPointerX) / dt * 10 : 0;
  this._referencePreviousPointerX = this.cameraPointerTarget.x;
  this.cameraBankTarget = THREE.MathUtils.lerp(this.cameraBankTarget, velocity * -0.006, positionLerp);
  this.cameraBank = THREE.MathUtils.lerp(this.cameraBank, this.cameraBankTarget, positionLerp);
  this._referenceIdleRoll = THREE.MathUtils.damp(this._referenceIdleRoll,
   this._referenceCameraNoise.noise(this.elapsed * 0.1, this.elapsed * 0.1) * Math.PI / 90,
   -60 * Math.log(0.5), dt);

		this.environment.material.uniforms.uTime.value = this.elapsed;
		this.environment.material.uniforms.uTravel.value = this.travel;
		this.secondaryTrails.material.uniforms.uTime.value = this.elapsed;
		this.secondaryTrails.material.uniforms.uPointer.value.copy(this.pointer);
	}

	applyCamera(camera, blend) {
		const eased = smooth01(blend);
  this.trailMotion.screenOffsetX = (this.inputElement?.clientWidth || 1440) < 768 ? -20 : -45;
  this._cameraLivePosition.set(
   CAMERA_POSITION.x - this._referenceCameraPosition.x * 5 * 0.095,
   CAMERA_POSITION.y - this._referenceCameraPosition.y * 3 * 0.095,
   CAMERA_POSITION.z,
  );
  this._referenceCameraEuler.set(this.cameraPointer.y * Math.PI / 5,
   -this.cameraPointer.x * Math.PI / 5, 0, "YXZ");
  this._cameraLiveQuaternion.setFromEuler(this._referenceCameraEuler);
  this._cameraBankQuaternion.setFromAxisAngle(this._cameraUp.set(0, 0, 1),
   this.cameraBank + this._referenceIdleRoll);
  this._cameraLiveQuaternion.premultiply(this._cameraBankQuaternion);

		camera.position.lerp(this._cameraLivePosition, eased);
		camera.quaternion.slerp(this._cameraLiveQuaternion, eased);
		camera.fov = THREE.MathUtils.lerp(camera.fov, CAMERA_FOV, eased);
		camera.updateProjectionMatrix();
		camera.updateMatrixWorld(true);
	}

	beginWarmupDraw() {
		this._warming = true;
		this.group.visible = true;
		this.setReveal(0.01);
	}

	endWarmupDraw() {
		this._warming = false;
		this.setReveal(this.reveal);
	}

	dispose(scene) {
		this.inputElement?.removeEventListener("pointerdown", this._onPointerDown);
		this.inputElement?.removeEventListener("pointerleave", this._onPointerLeave);
		this.inputElement?.removeEventListener("pointercancel", this._onPointerLeave);
		this.inputElement?.removeEventListener("pointermove", this._onPointerMove);
		this.inputElement?.removeEventListener("pointerup", this._onPointerUp);
		this.inputWindow?.removeEventListener("pointermove", this._onPointerMove, { capture: true });
		this.inputWindow?.removeEventListener("blur", this._onPointerLeave);
		scene?.remove(this.group);
		for (const disposable of this.disposables) disposable?.dispose?.();
		this.disposables = [];
		this.group.clear();
	}
}
