import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
	getRequestedSignalFieldFormIndex,
	publishSignalFieldMorphState,
	subscribeSignalFieldFormRequest,
} from "@/functions/signalFieldFormBridge.js";
import { createCase3FakeLitMaterial } from "../../portfolio/case3/case3FakeLitMaterial.js";

const TEMPLATE_CONFIG = {
	syntheticCore: {
		color: 0x33d6ff,
		camera: [0, 0.7, 11],
		build: "core",
	},
	signalField: {
		color: 0x8e6dff,
		camera: [0.5, 1.1, 12],
		build: "field",
	},
};

const SIGNAL_FIELD_MODEL_SCALE = 1.75;
const SIGNAL_FIELD_MORPH_DURATION = 1.45;
const SIGNAL_FIELD_FORM_BOUNDS = [
	new THREE.Vector2(2.52, 2.52),
	new THREE.Vector2(2.72, 2.72),
	new THREE.Vector2(1.78, 2.92),
	new THREE.Vector2(2.78, 2.68),
];

function createGlowMaterial(color, opacity = 0.8, wireframe = false) {
	const glow = new THREE.Color(color).multiplyScalar(1.8);
	return new THREE.MeshBasicMaterial({
		color: glow,
		wireframe,
		transparent: true,
		opacity,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		toneMapped: false,
	});
}

function createPlasmaMaterial(color) {
	return new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uColor: { value: new THREE.Color(color).multiplyScalar(1.55) },
			uHotColor: { value: new THREE.Color(0xe8fcff).multiplyScalar(1.35) },
			uInteraction: { value: 0 },
			uBurst: { value: 0 },
		},
		vertexShader: `
			varying vec3 vNormal;
			varying vec3 vWorldPosition;
			varying vec3 vLocalPosition;
			void main() {
				vNormal = normalize(normalMatrix * normal);
				vLocalPosition = position;
				vec4 worldPosition = modelMatrix * vec4(position, 1.0);
				vWorldPosition = worldPosition.xyz;
				gl_Position = projectionMatrix * viewMatrix * worldPosition;
			}
		`,
		fragmentShader: `
			uniform float uTime;
			uniform float uInteraction;
			uniform float uBurst;
			uniform vec3 uColor;
			uniform vec3 uHotColor;
			varying vec3 vNormal;
			varying vec3 vWorldPosition;
			varying vec3 vLocalPosition;
			vec3 safeNormalize(vec3 value) {
				return value * inversesqrt(max(dot(value, value), 0.000001));
			}
			void main() {
				vec3 p = safeNormalize(vLocalPosition);
				float flowA = sin(p.x * 8.0 + p.z * 5.0 + uTime * 1.7);
				float flowB = sin(p.y * 11.0 - p.x * 4.0 - uTime * 1.25);
				float flowC = sin((p.x + p.y + p.z) * 15.0 + uTime * 2.1);
				float field = flowA * 0.38 + flowB * 0.34 + flowC * 0.28;
				float veins = pow(clamp(field * 0.5 + 0.5, 0.0, 1.0), 6.0);
				vec3 viewDirection = safeNormalize(cameraPosition - vWorldPosition);
				float facing = clamp(abs(dot(safeNormalize(vNormal), viewDirection)), 0.0, 1.0);
				float fresnel = pow(max(0.0, 1.0 - facing), 2.6);
				float interaction = clamp(uInteraction, 0.0, 1.0);
				float burst = clamp(uBurst, 0.0, 1.0);
				float heartbeat = 0.82
					+ sin(uTime * (2.0 + interaction * 2.4)) * (0.08 + interaction * 0.05)
					+ burst * 0.16;
				vec3 plasmaColor = mix(uColor * 0.3, uHotColor, veins * 0.78 + fresnel * 0.42);
				plasmaColor += uHotColor * (interaction * 0.14 + burst * 0.42);
				float alpha = clamp((0.22 + veins * 0.36 + fresnel * 0.42) * heartbeat, 0.0, 1.0);
				gl_FragColor = vec4(clamp(plasmaColor, vec3(0.0), vec3(16.0)), alpha);
			}
		`,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		side: THREE.DoubleSide,
		toneMapped: false,
	});
}

function createCircuitConduitMaterial(color) {
	return new THREE.ShaderMaterial({
		uniforms: {
			uColor: { value: new THREE.Color(color).multiplyScalar(1.1) },
			uPointerWorld: { value: new THREE.Vector3(100, 100, 100) },
			uPointerStrength: { value: 0 },
			uBurstOrigin: { value: new THREE.Vector3() },
			uBurstAge: { value: 10 },
			uBurstStrength: { value: 0 },
		},
		vertexShader: `
			attribute float aAlong;
			attribute float aSeed;
			uniform vec3 uPointerWorld;
			uniform float uPointerStrength;
			varying vec3 vNormal;
			varying vec3 vWorldPosition;
			varying float vAlong;
			varying float vSeed;
			void main() {
				vec4 initialWorldPosition = modelMatrix * vec4(position, 1.0);
				float pointerDistance = distance(initialWorldPosition.xyz, uPointerWorld);
				float magneticField = exp(-pointerDistance * pointerDistance * 1.35)
					* uPointerStrength;
				vec3 displaced = position + normal * magneticField * 0.035;
				vNormal = normalize(normalMatrix * normal);
				vAlong = aAlong;
				vSeed = aSeed;
				vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
				vWorldPosition = worldPosition.xyz;
				gl_Position = projectionMatrix * viewMatrix * worldPosition;
			}
		`,
		fragmentShader: `
			uniform vec3 uColor;
			uniform vec3 uPointerWorld;
			uniform float uPointerStrength;
			uniform vec3 uBurstOrigin;
			uniform float uBurstAge;
			uniform float uBurstStrength;
			varying vec3 vNormal;
			varying vec3 vWorldPosition;
			varying float vAlong;
			varying float vSeed;
			vec3 safeNormalize(vec3 value) {
				return value * inversesqrt(max(dot(value, value), 0.000001));
			}
			void main() {
				vec3 normal = safeNormalize(vNormal);
				vec3 viewDirection = safeNormalize(cameraPosition - vWorldPosition);
				float facing = clamp(abs(dot(normal, viewDirection)), 0.0, 1.0);
				float fresnel = pow(max(0.0, 1.0 - facing), 2.2);
				float machining = 0.88 + sin(vAlong * 54.0 + vSeed * 23.0) * 0.12;
				float pointerDistance = distance(vWorldPosition, uPointerWorld);
				float magneticGlow = exp(-pointerDistance * pointerDistance * 1.5)
					* uPointerStrength;
				float waveRadius = uBurstAge * 3.2;
				float waveDelta = distance(vWorldPosition, uBurstOrigin) - waveRadius;
				float burstWave = exp(-waveDelta * waveDelta * 18.0)
					* uBurstStrength * max(0.0, 1.0 - uBurstAge * 0.42);
				float shell = 0.025 + fresnel * 0.18 + magneticGlow * 0.16 + burstWave * 0.34;
				vec3 shellColor = uColor * shell * machining;
				float alpha = clamp(0.09 + fresnel * 0.28, 0.0, 0.42);
				gl_FragColor = vec4(clamp(shellColor, vec3(0.0), vec3(4.0)), alpha);
			}
		`,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		depthTest: true,
		toneMapped: false,
	});
}

function createCircuitEnergyMaterial(color) {
	return new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uColor: { value: new THREE.Color(color).multiplyScalar(1.35) },
			uHotColor: { value: new THREE.Color(0xeaffff).multiplyScalar(1.25) },
			uPointerWorld: { value: new THREE.Vector3(100, 100, 100) },
			uPointerStrength: { value: 0 },
			uBurstOrigin: { value: new THREE.Vector3() },
			uBurstAge: { value: 10 },
			uBurstStrength: { value: 0 },
		},
		vertexShader: `
			attribute float aAlong;
			attribute float aSeed;
			uniform vec3 uPointerWorld;
			uniform float uPointerStrength;
			varying float vAlong;
			varying float vSeed;
			varying vec3 vNormal;
			varying vec3 vWorldPosition;
			void main() {
				vec4 initialWorldPosition = modelMatrix * vec4(position, 1.0);
				float pointerDistance = distance(initialWorldPosition.xyz, uPointerWorld);
				float magneticField = exp(-pointerDistance * pointerDistance * 1.35)
					* uPointerStrength;
				vec3 displaced = position + normal * magneticField * 0.035;
				vAlong = aAlong;
				vSeed = aSeed;
				vNormal = normalize(normalMatrix * normal);
				vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
				vWorldPosition = worldPosition.xyz;
				gl_Position = projectionMatrix * viewMatrix * worldPosition;
			}
		`,
		fragmentShader: `
			uniform float uTime;
			uniform vec3 uColor;
			uniform vec3 uHotColor;
			uniform vec3 uPointerWorld;
			uniform float uPointerStrength;
			uniform vec3 uBurstOrigin;
			uniform float uBurstAge;
			uniform float uBurstStrength;
			varying float vAlong;
			varying float vSeed;
			varying vec3 vNormal;
			varying vec3 vWorldPosition;
			vec3 safeNormalize(vec3 value) {
				return value * inversesqrt(max(dot(value, value), 0.000001));
			}
			void main() {
				float speed = 0.1 + vSeed * 0.08;
				float travel = fract(vAlong - uTime * speed + vSeed);
				float headDelta = abs(travel - 0.68);
				float wrappedHeadDelta = min(headDelta, 1.0 - headDelta);
				float hotCore = exp(-wrappedHeadDelta * wrappedHeadDelta * 520.0);
				float tailPhase = fract(0.68 - travel);
				float electricTail = exp(-tailPhase * 7.2)
					* (1.0 - smoothstep(0.3, 0.66, tailPhase));
				float circuitWave = 0.5 + sin(uTime * 0.72 + vSeed * 37.0) * 0.5;
				float activeCircuit = smoothstep(0.48, 0.82, circuitWave);
				hotCore *= activeCircuit;
				electricTail *= activeCircuit;
				float microCurrent = 0.5 + sin(vAlong * 20.0 - uTime * 1.4 + vSeed * 19.0) * 0.5;
				float stableNeon = 0.42 + microCurrent * 0.035;
				float charge = clamp(hotCore + electricTail * 0.62, 0.0, 1.0);
				float pointerDistance = distance(vWorldPosition, uPointerWorld);
				float magneticGlow = exp(-pointerDistance * pointerDistance * 1.6)
					* uPointerStrength;
				float waveRadius = uBurstAge * 3.2;
				float waveDelta = distance(vWorldPosition, uBurstOrigin) - waveRadius;
				float burstWave = exp(-waveDelta * waveDelta * 24.0)
					* uBurstStrength * max(0.0, 1.0 - uBurstAge * 0.42);
				vec3 normal = safeNormalize(vNormal);
				vec3 viewDirection = safeNormalize(cameraPosition - vWorldPosition);
				float fresnel = pow(max(0.0, 1.0 - clamp(abs(dot(normal, viewDirection)), 0.0, 1.0)), 1.8);
				vec3 lineColor = uColor * stableNeon;
				lineColor += uColor * electricTail * 1.7;
				lineColor += mix(uColor, uHotColor, 0.82) * hotCore * 2.7;
				lineColor += uHotColor * (magneticGlow * 0.72 + burstWave * 3.4);
				lineColor *= 0.88 + fresnel * 0.32;
				lineColor = clamp(lineColor, vec3(0.0), vec3(12.0));
				float alpha = clamp(0.54 + charge * 0.46, 0.0, 1.0);
				gl_FragColor = vec4(lineColor, alpha);
			}
		`,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		depthTest: true,
		toneMapped: false,
	});
}

function addCircuitTubeAttributes(geometry, seed) {
	const uv = geometry.getAttribute("uv");
	const along = new Float32Array(uv.count);
	const seeds = new Float32Array(uv.count);
	for (let index = 0; index < uv.count; index += 1) {
		along[index] = uv.getX(index);
		seeds[index] = seed;
	}
	geometry.setAttribute("aAlong", new THREE.BufferAttribute(along, 1));
	geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
	return geometry;
}

function particleHash(index, salt = 0) {
	const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;
	return value - Math.floor(value);
}

function particleNoise(index, salt = 0) {
	return particleHash(index, salt) * 2 - 1;
}

function writeParticlePosition(buffer, index, x, y, z) {
	buffer[index * 3] = x;
	buffer[index * 3 + 1] = y;
	buffer[index * 3 + 2] = z;
}

function writePlanetParticle(buffer, index, selector, seedA, seedB, seedC) {
	const surfaceRadius = 2.24;
	if (selector < 0.5) {
		// Equal-area base shell: this is the body below the authored relief,
		// not a THREE.SphereGeometry vertex distribution.
		const cosPhi = seedA * 2 - 1;
		const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
		const theta = seedB * Math.PI * 2;
		const radius = surfaceRadius + (seedC - 0.5) * 0.035;
		writeParticlePosition(
			buffer,
			index,
			Math.cos(theta) * sinPhi * radius,
			cosPhi * radius,
			Math.sin(theta) * sinPhi * radius,
		);
		return 0;
	}
	if (selector < 0.73) {
		// Raised latitude bands. Their spacing follows the reference globe:
		// tighter near the poles and wider around the equator.
		const latitudeCount = 13;
		const latitudeIndex = 1 + (Math.floor(seedA * latitudeCount) % latitudeCount);
		const polarAngle = (latitudeIndex / (latitudeCount + 1)) * Math.PI;
		const longitude = seedB * Math.PI * 2;
		const raisedRadius = surfaceRadius + 0.055 + (seedC - 0.5) * 0.018;
		writeParticlePosition(
			buffer,
			index,
			Math.sin(polarAngle) * Math.cos(longitude) * raisedRadius,
			Math.cos(polarAngle) * raisedRadius,
			Math.sin(polarAngle) * Math.sin(longitude) * raisedRadius,
		);
		return 1;
	}
	if (selector < 0.97) {
		// Raised meridians use continuous polar sampling, so every line meets
		// cleanly at both poles instead of revealing a stock UV-sphere mesh.
		const meridianCount = 18;
		const meridianIndex = Math.floor(seedA * meridianCount) % meridianCount;
		const longitude = (meridianIndex / meridianCount) * Math.PI * 2;
		const polarAngle = seedB * Math.PI;
		const raisedRadius = surfaceRadius + 0.065 + (seedC - 0.5) * 0.018;
		writeParticlePosition(
			buffer,
			index,
			Math.sin(polarAngle) * Math.cos(longitude) * raisedRadius,
			Math.cos(polarAngle) * raisedRadius,
			Math.sin(polarAngle) * Math.sin(longitude) * raisedRadius,
		);
		return 1;
	}
	const pole = seedA > 0.5 ? 1 : -1;
	const capRadius = Math.sqrt(seedB) * 0.2;
	const capAngle = seedC * Math.PI * 2;
	writeParticlePosition(
		buffer,
		index,
		Math.cos(capAngle) * capRadius,
		pole * Math.sqrt(Math.max(0, surfaceRadius * surfaceRadius - capRadius * capRadius)),
		Math.sin(capAngle) * capRadius,
	);
	return 1.35;
}

function writeToroidalReactorParticle(buffer, index, selector, seedA, seedB, seedC) {
	const tau = Math.PI * 2;
	if (selector < 0.54) {
		// A genuine 3D toroidal shell. Particles occupy a thin volume around the
		// surface, so the silhouette retains depth from every camera angle.
		const majorAngle = seedA * tau;
		const tubeAngle = seedB * tau;
		const majorRadius = 1.78;
		const tubeRadius = 0.58 + (seedC - 0.5) * 0.14;
		const radial = majorRadius + Math.cos(tubeAngle) * tubeRadius;
		writeParticlePosition(
			buffer,
			index,
			Math.cos(majorAngle) * radial,
			Math.sin(majorAngle) * radial,
			Math.sin(tubeAngle) * tubeRadius,
		);
		return 0.64;
	}
	if (selector < 0.76) {
		// Four coherent energy rails wrap the torus instead of random dust.
		const rail = Math.floor(seedC * 4) % 4;
		const majorAngle = seedA * tau;
		const tubeAngle = (rail / 4) * tau + Math.sin(majorAngle * 3) * 0.055;
		const tubeRadius = 0.61;
		const radial = 1.78 + Math.cos(tubeAngle) * tubeRadius;
		writeParticlePosition(
			buffer,
			index,
			Math.cos(majorAngle) * radial,
			Math.sin(majorAngle) * radial,
			Math.sin(tubeAngle) * tubeRadius,
		);
		return 1.35;
	}
	if (selector < 0.87) {
		// A 2:3 magnetic knot makes the reactor unmistakably volumetric.
		const knotTime = seedA * tau;
		const majorAngle = knotTime * 2;
		const tubeAngle = knotTime * 3;
		const radial = 1.78 + Math.cos(tubeAngle) * 0.72;
		writeParticlePosition(
			buffer,
			index,
			Math.cos(majorAngle) * radial,
			Math.sin(majorAngle) * radial,
			Math.sin(tubeAngle) * 0.72,
		);
		return 1.42;
	}
	// Suspended equal-area energy core inside the toroidal chamber.
	const cosPhi = seedA * 2 - 1;
	const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
	const angle = seedB * tau;
	const radius = 0.68 + (seedC - 0.5) * 0.16;
	writeParticlePosition(
		buffer,
		index,
		Math.cos(angle) * sinPhi * radius,
		cosPhi * radius,
		Math.sin(angle) * sinPhi * radius,
	);
	return 1.55;
}

function writeDnaParticle(buffer, index, selector, seedA, seedB, seedC) {
	const tau = Math.PI * 2;
	const turns = 1.75;
	const helixRadius = 1.4;
	const helixHeight = 5.05;
	if (selector < 0.7) {
		const strand = index % 2;
		const t = seedA;
		const organicPhase = Math.sin(t * tau * 2.6 + strand * 1.7) * 0.032
			+ particleNoise(index, 12.7) * 0.018;
		const angle = t * tau * turns + strand * Math.PI + organicPhase;
		const tubeAngle = seedB * tau;
		const tubeRadius = 0.04 + seedC * 0.078;
		const radiusBreath = Math.sin(t * tau * 1.35 + strand * 2.1) * 0.038;
		const strandRadius = helixRadius + radiusBreath
			+ Math.cos(tubeAngle) * tubeRadius
			+ particleNoise(index, 13.3) * 0.018;
		writeParticlePosition(
			buffer,
			index,
			Math.cos(angle) * strandRadius,
			(t - 0.5) * helixHeight
				+ Math.sin(tubeAngle) * tubeRadius
				+ particleNoise(index, 14.1) * 0.024,
			Math.sin(angle) * strandRadius,
		);
		return 1.42;
	}
	if (selector < 0.96) {
		const rungCount = 11;
		const rung = Math.floor(seedA * rungCount);
		const t = (rung + 0.5) / rungCount;
		const rungOffset = particleNoise(rung, 15.2);
		const angle = t * tau * turns + rungOffset * 0.075;
		const across = seedB * 2 - 1;
		const radial = helixRadius * across;
		const bow = (1 - across * across) * rungOffset * 0.105;
		const rungY = (t - 0.5) * helixHeight
			+ particleNoise(rung, 16.4) * 0.07
			+ (seedC - 0.5) * 0.034;
		writeParticlePosition(
			buffer,
			index,
			Math.cos(angle) * radial - Math.sin(angle) * bow,
			rungY,
			Math.sin(angle) * radial + Math.cos(angle) * bow,
		);
		return 1.06;
	}
	// Dense terminal nodes close the molecule cleanly; no free central dust.
	const top = seedA > 0.5;
	const t = top ? 1 : 0;
	const strand = index % 2;
	const angle = t * tau * turns + strand * Math.PI;
	const nodeAngle = seedB * tau;
	const nodeRadius = Math.sqrt(seedC) * (0.11 + particleHash(index, 17.8) * 0.055);
	writeParticlePosition(
		buffer,
		index,
		Math.cos(angle) * helixRadius + Math.cos(nodeAngle) * nodeRadius
			+ particleNoise(index, 18.3) * 0.025,
		(t - 0.5) * helixHeight + Math.sin(nodeAngle) * nodeRadius
			+ particleNoise(index, 18.9) * 0.02,
		Math.sin(angle) * helixRadius + (seedC - 0.5) * 0.18,
	);
	return 1.52;
}

const CRYSTAL_SHARDS = [
	[0, 0, 0, 1.15, 2.2, 1.08, 0.08, 0.16],
	[-1.82, 0.72, 0.18, 0.5, 1.08, 0.46, 0.48, -0.32],
	[1.78, 0.42, -0.3, 0.46, 0.94, 0.5, -0.52, 0.28],
	[-1.55, -1.28, -0.16, 0.34, 0.72, 0.36, -0.72, 0.18],
	[1.48, -1.36, 0.22, 0.31, 0.68, 0.35, 0.68, -0.26],
	[0.88, 1.62, -0.42, 0.27, 0.62, 0.3, 0.25, 0.44],
];

function writeCrystalShardParticle(buffer, index, seedA, seedB, seedC, shard, edge) {
	const [centerX, centerY, centerZ, scaleX, scaleY, scaleZ, rotateZ, rotateY] = shard;
	const sideCount = 6;
	const waistY = -0.08;
	let localX;
	let localY;
	let localZ;
	if (edge) {
		const side = Math.floor(seedA * sideCount) % sideCount;
		const angle = (side / sideCount) * Math.PI * 2 + particleNoise(side, 40.2) * 0.08;
		const t = seedB;
		if (t < 0.5) {
			const edgeT = t * 2;
			localX = Math.cos(angle) * 0.72 * edgeT;
			localY = THREE.MathUtils.lerp(-1, waistY, edgeT);
			localZ = Math.sin(angle) * 0.72 * edgeT;
		} else {
			const edgeT = (t - 0.5) * 2;
			localX = Math.cos(angle) * 0.72 * (1 - edgeT);
			localY = THREE.MathUtils.lerp(waistY, 1, edgeT);
			localZ = Math.sin(angle) * 0.72 * (1 - edgeT);
		}
		const chip = particleHash(index, 41.1) > 0.955 ? 0.095 : 0.026;
		localX += particleNoise(index, 41.8) * chip;
		localZ += particleNoise(index, 42.3) * chip;
	} else {
		localY = seedA * 2 - 1;
		const radius = localY < waistY
			? ((localY + 1) / (waistY + 1)) * 0.72
			: ((1 - localY) / (1 - waistY)) * 0.72;
		const side = Math.floor(seedB * sideCount) % sideCount;
		const angleA = (side / sideCount) * Math.PI * 2;
		const angleB = ((side + 1) / sideCount) * Math.PI * 2;
		const scaleA = 1 + particleNoise(side, 43.7) * 0.11;
		const scaleB = 1 + particleNoise(side + 1, 43.7) * 0.11;
		localX = THREE.MathUtils.lerp(
			Math.cos(angleA) * scaleA,
			Math.cos(angleB) * scaleB,
			seedC,
		) * radius;
		localZ = THREE.MathUtils.lerp(
			Math.sin(angleA) * scaleA,
			Math.sin(angleB) * scaleB,
			seedC,
		) * radius;
		localY += particleNoise(index, 44.6) * 0.018;
	}

	localX *= scaleX;
	localY *= scaleY;
	localZ *= scaleZ;
	const cosZ = Math.cos(rotateZ);
	const sinZ = Math.sin(rotateZ);
	const rotatedX = localX * cosZ - localY * sinZ;
	const rotatedY = localX * sinZ + localY * cosZ;
	const cosY = Math.cos(rotateY);
	const sinY = Math.sin(rotateY);
	writeParticlePosition(
		buffer,
		index,
		rotatedX * cosY + localZ * sinY + centerX,
		rotatedY + centerY,
		-rotatedX * sinY + localZ * cosY + centerZ,
	);
}

function writeCrystalParticle(buffer, index, selector, seedA, seedB, seedC) {
	if (selector < 0.48) {
		writeCrystalShardParticle(
			buffer,
			index,
			seedA,
			seedB,
			seedC,
			CRYSTAL_SHARDS[0],
			false,
		);
		return 0.48;
	}
	if (selector < 0.66) {
		writeCrystalShardParticle(
			buffer,
			index,
			seedA,
			seedB,
			seedC,
			CRYSTAL_SHARDS[0],
			true,
		);
		return 1.7;
	}
	if (selector < 0.92) {
		const shardIndex = 1 + (Math.floor(seedA * (CRYSTAL_SHARDS.length - 1))
			% (CRYSTAL_SHARDS.length - 1));
		const shardSeedA = particleHash(index, 45.4);
		const shardEdge = particleHash(index, 46.1) > 0.64;
		writeCrystalShardParticle(
			buffer,
			index,
			shardSeedA,
			seedB,
			seedC,
			CRYSTAL_SHARDS[shardIndex],
			shardEdge,
		);
		return shardEdge ? 1.45 : 0.72;
	}
	// A broken luminous seam runs through the main crystal instead of a
	// perfectly centred caustic axis.
	const fractureT = seedA;
	const fractureStep = Math.floor(fractureT * 9);
	const fractureX = particleNoise(fractureStep, 47.2) * 0.22
		+ Math.sin(fractureT * Math.PI * 7) * 0.055;
	const fractureZ = particleNoise(fractureStep, 48.4) * 0.16
		+ Math.cos(fractureT * Math.PI * 5) * 0.045;
	writeParticlePosition(
		buffer,
		index,
		fractureX + particleNoise(index, 49.1) * 0.035,
		THREE.MathUtils.lerp(-2.02, 2.12, fractureT),
		fractureZ + particleNoise(index, 49.8) * 0.03,
	);
	return 1.82;
}

function createSignalParticleGeometry(count = 18000) {
	const planetPositions = new Float32Array(count * 3);
	const reactorPositions = new Float32Array(count * 3);
	const dnaPositions = new Float32Array(count * 3);
	const crystalPositions = new Float32Array(count * 3);
	const sizes = new Float32Array(count);
	const phases = new Float32Array(count);
	const flows = new Float32Array(count);
	const arms = new Float32Array(count);
	const colorMixes = new Float32Array(count);
	const layers = new Float32Array(count);
	const reliefs = new Float32Array(count);
	const formFeatures = new Float32Array(count * 3);
	const armCount = 9;

	for (let index = 0; index < count; index += 1) {
		const selector = particleHash(index, 0.7);
		const seedA = particleHash(index, 1.3);
		const seedB = particleHash(index, 2.9);
		const seedC = particleHash(index, 4.1);
		reliefs[index] = writePlanetParticle(planetPositions, index, selector, seedA, seedB, seedC);
		formFeatures[index * 3] = writeToroidalReactorParticle(
			reactorPositions,
			index,
			selector,
			seedA,
			seedB,
			seedC,
		);
		formFeatures[index * 3 + 1] = writeDnaParticle(
			dnaPositions,
			index,
			selector,
			seedA,
			seedB,
			seedC,
		);
		formFeatures[index * 3 + 2] = writeCrystalParticle(
			crystalPositions,
			index,
			selector,
			seedA,
			seedB,
			seedC,
		);

		const flow = seedA;
		const arm = index % armCount;
		// The same authored particle cohorts carry structural accents in every
		// form: globe grid, reactor rails, DNA base pairs and gem facet ribs.
		const layer = selector < 0.68 ? 1 : selector < 0.98 ? 2 : 0;
		sizes[index] = layer === 0
			? 0.9 + seedB * 1.2
			: layer === 2
				? 1.15 + seedC * 1.75
				: 0.75 + seedC * 1.35;
		phases[index] = seedA * Math.PI * 2;
		flows[index] = flow;
		arms[index] = arm / armCount;
		colorMixes[index] = Math.pow(seedB, 1.45);
		layers[index] = layer;
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(planetPositions, 3));
	geometry.setAttribute("aPositionReactor", new THREE.BufferAttribute(reactorPositions, 3));
	geometry.setAttribute("aPositionDna", new THREE.BufferAttribute(dnaPositions, 3));
	geometry.setAttribute("aPositionCrystal", new THREE.BufferAttribute(crystalPositions, 3));
	geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
	geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
	geometry.setAttribute("aFlow", new THREE.BufferAttribute(flows, 1));
	geometry.setAttribute("aArm", new THREE.BufferAttribute(arms, 1));
	geometry.setAttribute("aColorMix", new THREE.BufferAttribute(colorMixes, 1));
	geometry.setAttribute("aLayer", new THREE.BufferAttribute(layers, 1));
	geometry.setAttribute("aRelief", new THREE.BufferAttribute(reliefs, 1));
	geometry.setAttribute("aFormFeatures", new THREE.BufferAttribute(formFeatures, 3));
	geometry.computeBoundingSphere();
	return geometry;
}

function createSignalParticleMaterial(color) {
	return new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uFormFrom: { value: 0 },
			uFormTo: { value: 0 },
			uMorphProgress: { value: 1 },
			uPointer: { value: new THREE.Vector2() },
			uPointerVelocity: { value: new THREE.Vector2() },
			uPointerInfluence: { value: 0 },
			uColorDeep: { value: new THREE.Color(0x0755cc).multiplyScalar(0.96) },
			uColorSignal: { value: new THREE.Color(color).multiplyScalar(1.0) },
			uColorHot: { value: new THREE.Color(0xcdf7ff).multiplyScalar(1.02) },
		},
		vertexShader: `
			attribute vec3 aPositionReactor;
			attribute vec3 aPositionDna;
			attribute vec3 aPositionCrystal;
			attribute float aSize;
			attribute float aPhase;
			attribute float aFlow;
			attribute float aArm;
			attribute float aColorMix;
			attribute float aLayer;
			attribute float aRelief;
			attribute vec3 aFormFeatures;
			uniform float uTime;
			uniform float uFormFrom;
			uniform float uFormTo;
			uniform float uMorphProgress;
			uniform vec2 uPointer;
			uniform vec2 uPointerVelocity;
			uniform float uPointerInfluence;
			varying float vColorMix;
			varying float vEnergy;
			varying float vOpacity;
			varying float vLayer;
			varying float vMorphEnergy;
			varying float vFeatureEnergy;
			varying float vSparkAngle;

			vec3 safeNormalize(vec3 value) {
				return value * inversesqrt(max(dot(value, value), 0.000001));
			}

			vec3 readFormPosition(float formIndex) {
				if (formIndex < 0.5) return position;
				if (formIndex < 1.5) return aPositionReactor;
				if (formIndex < 2.5) return aPositionDna;
				return aPositionCrystal;
			}

			float readFormFeature(float formIndex) {
				if (formIndex < 0.5) return aRelief;
				if (formIndex < 1.5) return aFormFeatures.x;
				if (formIndex < 2.5) return aFormFeatures.y;
				return aFormFeatures.z;
			}

			void main() {
				float time = uTime;
				vec3 formFrom = readFormPosition(uFormFrom);
				vec3 formTo = readFormPosition(uFormTo);
				float featureFrom = readFormFeature(uFormFrom);
				float featureTo = readFormFeature(uFormTo);
				// A short per-particle delay produces an energy sweep instead of a
				// mechanical all-at-once interpolation. At 1.0 every particle lands.
				float cascade = clamp(uMorphProgress * 1.26 - aFlow * 0.26, 0.0, 1.0);
				float morph = cascade * cascade * cascade
					* (cascade * (cascade * 6.0 - 15.0) + 10.0);
				float featureEnergy = mix(featureFrom, featureTo, morph);
				float globalMorphEnergy = sin(clamp(uMorphProgress, 0.0, 1.0) * 3.14159265);
				float morphEnergy = max(sin(cascade * 3.14159265), globalMorphEnergy * 0.42);
				vec3 transformed = mix(formFrom, formTo, morph);
				vec3 flightDirection = safeNormalize(formTo - formFrom);
				vec3 vortexDirection = safeNormalize(cross(flightDirection, vec3(0.23, 1.0, 0.17)));
				transformed += flightDirection
					* sin(aPhase + morph * 6.2831853)
					* morphEnergy * (0.06 + aLayer * 0.035);
				transformed += vortexDirection
					* sin(aPhase * 1.7 + cascade * 12.56637)
					* morphEnergy * (0.035 + aColorMix * 0.045);
				// A coherent, restrained yaw keeps authored silhouettes readable.
				float rotation = sin(time * 0.22) * 0.11;
				float cs = cos(rotation);
				float sn = sin(rotation);
				transformed.xz = mat2(cs, -sn, sn, cs) * transformed.xz;

				float radialLength = max(length(transformed.xz), 0.001);
				vec2 tangent = vec2(-transformed.z, transformed.x) / radialLength;
				float current = sin(time * (0.72 + aArm * 0.48) + aPhase + aFlow * 18.0);
				// Forms stay engineered and legible at rest. Their ambient motion is
				// microscopic; expressive displacement belongs to morph and pointer.
				transformed.xz += tangent * current * (0.006 + featureEnergy * 0.005);
				transformed.y += sin(time * 0.46 + aPhase + aFlow * 11.0)
					* (0.004 + featureEnergy * 0.004);

				vec2 pointerDelta = transformed.xy - uPointer;
				float pointerField = exp(-dot(pointerDelta, pointerDelta) * 1.18)
					* (0.48 + min(featureEnergy, 1.2) * 0.44) * uPointerInfluence;
				vec2 pointerDirection = pointerDelta * inversesqrt(max(dot(pointerDelta, pointerDelta), 0.0001));
				transformed.xy += pointerDirection * pointerField * 0.11;
				transformed.xy += uPointerVelocity * pointerField * 0.13;

				float runnerPhase = fract(aFlow - time * (0.085 + aArm * 0.035) + aArm * 1.71);
				float runnerDelta = abs(runnerPhase - 0.58);
				runnerDelta = min(runnerDelta, 1.0 - runnerDelta);
				float runner = exp(-runnerDelta * runnerDelta * 520.0)
					* smoothstep(0.48, 1.15, featureEnergy);
				float coreEnergy = featureEnergy
					* (0.34 + sin(time * 1.35 + aPhase) * 0.075);
				float twinkle = 0.76 + sin(time * (0.82 + aColorMix * 1.18) + aPhase) * 0.24;

				vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
				float perspective = clamp(34.0 / max(1.0, -mvPosition.z), 0.7, 4.2);
				gl_PointSize = clamp(
					aSize * perspective * 1.04
						* (1.0 + runner * 1.25 + coreEnergy * 0.42 + morphEnergy * 0.28 + featureEnergy * 0.34),
					1.0,
					12.5
				);
				gl_Position = projectionMatrix * mvPosition;
				vColorMix = aColorMix;
				vEnergy = clamp(
					runner + coreEnergy + pointerField * 0.24 + morphEnergy * 0.38,
					0.0,
					1.65
				);
				vOpacity = twinkle * (0.46 + min(featureEnergy, 1.4) * 0.25);
				vLayer = aLayer;
				vMorphEnergy = morphEnergy;
				vFeatureEnergy = featureEnergy;
				vSparkAngle = aPhase + transformed.z * 0.38;
			}
		`,
		fragmentShader: `
			uniform vec3 uColorDeep;
			uniform vec3 uColorSignal;
			uniform vec3 uColorHot;
			varying float vColorMix;
			varying float vEnergy;
			varying float vOpacity;
			varying float vLayer;
			varying float vMorphEnergy;
			varying float vFeatureEnergy;
			varying float vSparkAngle;

			void main() {
				vec2 point = gl_PointCoord - 0.5;
				float radiusSquared = dot(point, point);
				float radius = sqrt(radiusSquared);
				if (radius > 0.5) discard;
				float cs = cos(vSparkAngle);
				float sn = sin(vSparkAngle);
				vec2 flarePoint = mat2(cs, -sn, sn, cs) * point;
				float atmosphericHalo = exp(-radiusSquared * 12.5);
				float opticalCore = exp(-radiusSquared * 118.0);
				float hotPin = exp(-radiusSquared * 620.0);
				float horizontalFlare = exp(-abs(flarePoint.y) * 82.0)
					* exp(-abs(flarePoint.x) * 7.5);
				float verticalFlare = exp(-abs(flarePoint.x) * 108.0)
					* exp(-abs(flarePoint.y) * 11.0);
				float sparkleNoise = fract(sin(vSparkAngle * 91.7) * 43758.5453);
				float sparkleGate = smoothstep(0.78, 0.96, sparkleNoise);
				float flareMask = smoothstep(0.72, 1.55, vFeatureEnergy) * sparkleGate;
				float diffraction = (horizontalFlare * 0.46 + verticalFlare * 0.25) * flareMask;
				float coronaRing = exp(-abs(radius - 0.29) * 48.0)
					* smoothstep(1.0, 1.65, vFeatureEnergy) * sparkleGate * 0.12;
				float energy = clamp(vEnergy, 0.0, 1.5);
				vec3 baseColor = mix(
					uColorDeep,
					uColorSignal,
					clamp(vColorMix * 0.72 + vLayer * 0.05 + vFeatureEnergy * 0.13, 0.0, 1.0)
				);
				vec3 color = mix(
					baseColor,
					uColorHot,
					clamp(energy * 0.36 + opticalCore * 0.1 + vFeatureEnergy * 0.16, 0.0, 1.0)
				);
				color *= atmosphericHalo * (0.18 + energy * 0.58)
					+ opticalCore * (0.72 + energy * 1.5 + vMorphEnergy * 0.22)
					+ hotPin * (1.35 + energy * 2.25)
					+ diffraction * (0.62 + energy * 1.15)
					+ coronaRing;
				color = clamp(color, vec3(0.0), vec3(18.0));
				float alpha = clamp(
					(atmosphericHalo * 0.38 + opticalCore * 0.82 + hotPin + diffraction * 0.55 + coronaRing)
						* vOpacity * (1.0 + energy * 0.26),
					0.0,
					1.0
				);
				if (alpha < 0.008) discard;
				gl_FragColor = vec4(color, alpha);
			}
		`,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		depthTest: true,
		toneMapped: false,
	});
}

function createSignalAmbientGeometry(count = 5200) {
	const positions = new Float32Array(count * 3);
	const sizes = new Float32Array(count);
	const phases = new Float32Array(count);
	const drifts = new Float32Array(count);
	for (let index = 0; index < count; index += 1) {
		const seedA = particleHash(index, 51.2);
		const seedB = particleHash(index, 52.4);
		const seedC = particleHash(index, 53.7);
		const cosPhi = seedA * 2 - 1;
		const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
		const angle = seedB * Math.PI * 2;
		const radius = 2.55 + Math.pow(seedC, 0.72) * 1.55;
		writeParticlePosition(
			positions,
			index,
			Math.cos(angle) * sinPhi * radius * 1.08,
			cosPhi * radius * 0.82,
			Math.sin(angle) * sinPhi * radius,
		);
		sizes[index] = 0.58 + particleHash(index, 54.3) * 1.62;
		phases[index] = particleHash(index, 55.1) * Math.PI * 2;
		drifts[index] = 0.55 + particleHash(index, 56.8) * 0.9;
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
	geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
	geometry.setAttribute("aDrift", new THREE.BufferAttribute(drifts, 1));
	geometry.computeBoundingSphere();
	return geometry;
}

function createSignalAmbientMaterial(color) {
	return new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uColorDeep: { value: new THREE.Color(0x0755cc).multiplyScalar(0.95) },
			uColorSignal: { value: new THREE.Color(color).multiplyScalar(1.25) },
		},
		vertexShader: `
			attribute float aSize;
			attribute float aPhase;
			attribute float aDrift;
			uniform float uTime;
			varying float vAlpha;
			varying float vColorMix;
			void main() {
				vec3 transformed = position;
				float angle = uTime * 0.018 * aDrift + sin(uTime * 0.07 + aPhase) * 0.035;
				float cs = cos(angle);
				float sn = sin(angle);
				transformed.xz = mat2(cs, -sn, sn, cs) * transformed.xz;
				transformed += normalize(transformed + vec3(0.0001))
					* sin(uTime * 0.22 + aPhase) * 0.035;
				vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
				float perspective = clamp(27.0 / max(1.0, -mvPosition.z), 0.55, 2.8);
				gl_PointSize = clamp(aSize * perspective * 1.16, 1.2, 5.2);
				gl_Position = projectionMatrix * mvPosition;
				vAlpha = 0.54 + sin(aPhase + uTime * (0.25 + aDrift * 0.08)) * 0.18;
				vColorMix = fract(aPhase * 0.15915);
			}
		`,
		fragmentShader: `
			uniform vec3 uColorDeep;
			uniform vec3 uColorSignal;
			varying float vAlpha;
			varying float vColorMix;
			void main() {
				vec2 point = gl_PointCoord - 0.5;
				float radiusSquared = dot(point, point);
				if (radiusSquared > 0.25) discard;
				float core = exp(-radiusSquared * 92.0);
				float halo = exp(-radiusSquared * 17.0);
				vec3 color = mix(uColorDeep, uColorSignal, vColorMix * 0.65);
				float alpha = (core * 0.94 + halo * 0.34) * vAlpha;
				if (alpha < 0.006) discard;
				gl_FragColor = vec4(color * (core * 4.1 + halo * 0.9), alpha);
			}
		`,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		depthTest: false,
		toneMapped: false,
	});
}

function createSignalOrbitGeometry(radius, ellipticity, phase) {
	const segmentCount = 160;
	const positions = new Float32Array(segmentCount * 3);
	for (let index = 0; index < segmentCount; index += 1) {
		const angle = (index / segmentCount) * Math.PI * 2;
		positions[index * 3] = Math.cos(angle) * radius;
		positions[index * 3 + 1] = Math.sin(angle) * radius * ellipticity;
		positions[index * 3 + 2] = Math.sin(angle * 3 + phase) * 0.12;
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	return geometry;
}

function createCircuitNodeMaterial(color) {
	return new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uColor: { value: new THREE.Color(color).multiplyScalar(1.65) },
		},
		vertexShader: `
			attribute float aSeed;
			varying float vSeed;
			void main() {
				vSeed = aSeed;
				vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
				gl_PointSize = clamp(25.0 / max(1.0, -mvPosition.z), 2.0, 7.0);
				gl_Position = projectionMatrix * mvPosition;
			}
		`,
		fragmentShader: `
			uniform float uTime;
			uniform vec3 uColor;
			varying float vSeed;
			void main() {
				vec2 p = gl_PointCoord - 0.5;
				float radius = length(p);
				if (radius > 0.5) discard;
				float core = 1.0 - smoothstep(0.04, 0.18, radius);
				float halo = 1.0 - smoothstep(0.12, 0.5, radius);
				float pulse = 0.78 + sin(uTime * 2.4 + vSeed * 17.0) * 0.22;
				gl_FragColor = vec4(uColor * (halo * 0.75 + core * 2.4), (halo + core) * pulse);
			}
		`,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		depthTest: true,
		toneMapped: false,
	});
}

/** Prepared worlds for capability stages 03–04. */
export class PlaceholderCapabilityWorld {
	constructor(scene, variant) {
		this.variant = variant;
		this.config = TEMPLATE_CONFIG[variant] ?? TEMPLATE_CONFIG.syntheticCore;
		this.group = new THREE.Group();
		this.group.name = `capability-placeholder-${variant}`;
		this.group.visible = false;
		this.target = new THREE.Vector3(0, 0, 0);
		this.cameraLookAt = null;
		this.cameraPosition = new THREE.Vector3(...this.config.camera);
		this.rotors = [];
		this.pulseMaterials = [];
		this.breathers = [];
		this.timeUniforms = [];
		this.elapsed = 0;
		this.interactionMaterials = [];
		this.interactionAssembly = null;
		this.interactionPlasmaMaterial = null;
		this.interactionHovered = false;
		this.interactionStrength = 0;
		this.interactionCharge = 0;
		this.interactionBurstAge = 10;
		this.interactionBurstStrength = 0;
		this.interactionPressElapsed = 0;
		this.interactionPressActive = false;
		this.interactionPressDragged = false;
		this.interactionPointerWasDown = false;
		this.interactionPointer = new THREE.Vector2();
		this.interactionPressPointer = new THREE.Vector2();
		this.interactionWorldPoint = new THREE.Vector3(100, 100, 100);
		this.interactionPressWorldPoint = new THREE.Vector3();
		this.interactionCenter = new THREE.Vector3();
		this.interactionSphere = new THREE.Sphere(this.interactionCenter, 2.28);
		this.interactionRaycaster = new THREE.Raycaster();
		this.signalField = null;
		this.signalFieldMaterial = null;
		this.signalFieldRaycaster = new THREE.Raycaster();
		this.signalFieldInteractionPlane = new THREE.Plane();
		this.signalFieldPlaneNormal = new THREE.Vector3();
		this.signalFieldWorldCenter = new THREE.Vector3();
		this.signalFieldWorldPoint = new THREE.Vector3();
		this.signalFieldLocalPoint = new THREE.Vector3();
		this.signalFieldBounds = new THREE.Vector2();
		this.signalFieldPointerNdc = new THREE.Vector2();
		this.signalFieldPointerInfluence = 0;
		this.signalFieldPointer = new THREE.Vector2();
		this.signalFieldPointerTarget = new THREE.Vector2();
		this.signalFieldPointerVelocity = new THREE.Vector2();
		this.signalFieldPreviousPointer = new THREE.Vector2();
		this.signalFieldVelocityScratch = new THREE.Vector2();
		this.signalFieldActiveFormIndex = 0;
		this.signalFieldFromFormIndex = 0;
		this.signalFieldTargetFormIndex = 0;
		this.signalFieldQueuedFormIndex = null;
		this.signalFieldMorphElapsed = SIGNAL_FIELD_MORPH_DURATION;
		this.signalFieldMorphProgress = 1;
		this.signalFieldBridgeUnsubscribe = null;
		this._build();
		scene.add(this.group);
	}

	_build() {
		if (this.config.build === "field") this._buildSignalField();
		else this._buildSyntheticCore();
	}

	_buildSyntheticCore() {
		const color = this.config.color;
		const cyan = new THREE.Color(color);
		const assembly = new THREE.Group();
		assembly.position.x = 1.65;
		assembly.rotation.set(-0.08, 0.18, -0.04);
		this.target.set(1.65, 0, 0);
		this.cameraLookAt = new THREE.Vector3(0.25, 0, 0);
		this.group.add(assembly);
		this.interactionAssembly = assembly;

		// The crane uses this deterministic fake-lit shader instead of the
		// renderer-dependent physical-lighting path. Keep the same contract here:
		// an opaque depth-writing body with a non-zero ambient floor at every angle.
		const metalMaterial = createCase3FakeLitMaterial("crane", {
			baseColor: 0x0b2634,
			rimColor: color,
			rimStrength: 0.86,
			rimPower: 2.3,
			metalness: 0.84,
			keyStrength: 0.56,
			fillStrength: 0.3,
			ambient: 0.26,
			specularStrength: 0.54,
			roughness: 0.34,
			surfaceVariation: 0.1,
			weathering: 0.035,
			brushing: 0.08,
		});
		const glassMaterial = new THREE.MeshPhysicalMaterial({
			color: 0x061826,
			metalness: 0.05,
			roughness: 0.08,
			transparent: true,
			opacity: 0.24,
			depthWrite: false,
			side: THREE.DoubleSide,
			clearcoat: 1,
			clearcoatRoughness: 0.08,
			emissive: cyan,
			emissiveIntensity: 0.28,
		});
		const coreLight = new THREE.PointLight(0x57dcff, 10, 12, 2);
		const rimLight = new THREE.PointLight(0xd9f9ff, 5, 9, 2);
		rimLight.position.set(-2.4, 2.8, 3.4);
		assembly.add(coreLight, rimLight);

		// Dense glass plasma chamber: layered materials and moving energy filaments
		// preserve the original shimmer but make the centre feel manufactured.
		const chamber = new THREE.Group();
		assembly.add(chamber);
		const glassShell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.48, 4), glassMaterial);
		chamber.add(glassShell);

		const plasmaMaterial = createPlasmaMaterial(color);
		this.interactionPlasmaMaterial = plasmaMaterial;
		const plasma = new THREE.Mesh(new THREE.IcosahedronGeometry(1.02, 5), plasmaMaterial);
		plasma.scale.set(0.92, 1.08, 0.92);
		chamber.add(plasma);
		this.timeUniforms.push(plasmaMaterial.uniforms.uTime);
		this.breathers.push({ object: plasma, base: [0.92, 1.08, 0.92], amount: 0.09, speed: 2.15, phase: 0 });

		const haloMaterial = createGlowMaterial(color, 0.18, false);
		haloMaterial.side = THREE.BackSide;
		const halo = new THREE.Mesh(new THREE.SphereGeometry(1.72, 40, 32), haloMaterial);
		chamber.add(halo);
		this.pulseMaterials.push({ material: haloMaterial, base: 0.1, range: 0.09, phase: 1.7 });

		// Organic micro-circuit shell, derived from the About detail language:
		// sparse traces, luminous nodes and travelling charges. A deformed
		// Fibonacci distribution avoids both square cells and a stock wireframe.
		const network = new THREE.Group();
		const networkNodeCount = 52;
		const networkNodes = [];
		for (let index = 0; index < networkNodeCount; index += 1) {
			const y = 1 - (index / (networkNodeCount - 1)) * 2;
			const radial = Math.sqrt(Math.max(0, 1 - y * y));
			const angle = index * 2.3999632297;
			const deformation = 1.68
				+ Math.sin(index * 12.9898) * 0.075
				+ Math.sin(angle * 3.0) * 0.035;
			networkNodes.push(new THREE.Vector3(
				Math.cos(angle) * radial * deformation,
				y * deformation * (0.92 + Math.sin(angle * 2.0) * 0.04),
				Math.sin(angle) * radial * deformation,
			));
		}

		const conduitGeometries = [];
		const energyGeometries = [];
		const connected = new Set();
		for (let index = 0; index < networkNodes.length; index += 1) {
			const nearest = networkNodes
				.map((point, candidate) => ({
					candidate,
					distance: candidate === index ? Infinity : networkNodes[index].distanceToSquared(point),
				}))
				.sort((a, b) => a.distance - b.distance)
				.slice(0, index % 7 === 0 ? 3 : 2);
			for (const { candidate } of nearest) {
				const a = Math.min(index, candidate);
				const b = Math.max(index, candidate);
				const key = `${a}:${b}`;
				if (connected.has(key)) continue;
				connected.add(key);
				const start = networkNodes[a];
				const end = networkNodes[b];
				const seed = ((a * 17 + b * 31) % 97) / 97;
				const chord = new THREE.Vector3().subVectors(end, start).normalize();
				const midpointNormal = new THREE.Vector3().addVectors(start, end).normalize();
				const side = new THREE.Vector3().crossVectors(midpointNormal, chord).normalize();
				const pathPoints = [];
				const curveSteps = 7;
				for (let step = 0; step <= curveSteps; step += 1) {
					const t = step / curveSteps;
					const arch = Math.sin(t * Math.PI);
					const radius = THREE.MathUtils.lerp(start.length(), end.length(), t)
						+ arch * (0.04 + seed * 0.035);
					const lateral = Math.sin(t * Math.PI * 2 + seed * Math.PI * 2)
						* arch * 0.018;
					const point = new THREE.Vector3()
						.lerpVectors(start, end, t)
						.normalize()
						.multiplyScalar(radius)
						.addScaledVector(side, lateral);
					pathPoints.push(point);
				}
				const curve = new THREE.CatmullRomCurve3(pathPoints, false, "centripetal", 0.5);
				conduitGeometries.push(addCircuitTubeAttributes(
					new THREE.TubeGeometry(curve, 18, 0.028, 7, false),
					seed,
				));
				energyGeometries.push(addCircuitTubeAttributes(
					new THREE.TubeGeometry(curve, 18, 0.011, 6, false),
					seed,
				));
			}
		}

		const networkConduitGeometry = mergeGeometries(conduitGeometries, false);
		const networkEnergyGeometry = mergeGeometries(energyGeometries, false);
		for (const geometry of [...conduitGeometries, ...energyGeometries]) geometry.dispose();
		const networkConduitMaterial = createCircuitConduitMaterial(color);
		const networkEnergyMaterial = createCircuitEnergyMaterial(color);
		this.interactionMaterials.push(networkConduitMaterial, networkEnergyMaterial);
		const networkConduits = new THREE.Mesh(networkConduitGeometry, networkConduitMaterial);
		const networkEnergy = new THREE.Mesh(networkEnergyGeometry, networkEnergyMaterial);
		networkConduits.renderOrder = 3;
		networkEnergy.renderOrder = 4;
		network.add(networkConduits, networkEnergy);

		const networkPointGeometry = new THREE.BufferGeometry();
		networkPointGeometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(networkNodes.flatMap((point) => [point.x, point.y, point.z]), 3),
		);
		networkPointGeometry.setAttribute(
			"aSeed",
			new THREE.Float32BufferAttribute(networkNodes.map((_, index) => ((index * 37) % 101) / 101), 1),
		);
		const networkPointMaterial = createCircuitNodeMaterial(0xbdefff);
		const networkPoints = new THREE.Points(networkPointGeometry, networkPointMaterial);
		network.add(networkPoints);
		chamber.add(network);
		this.rotors.push({ object: network, speed: -0.11, axis: "y" });
		this.rotors.push({ object: network, speed: 0.035, axis: "z" });
		this.timeUniforms.push(
			networkEnergyMaterial.uniforms.uTime,
			networkPointMaterial.uniforms.uTime,
		);

		for (let filamentIndex = 0; filamentIndex < 7; filamentIndex += 1) {
			const points = [];
			for (let pointIndex = 0; pointIndex <= 28; pointIndex += 1) {
				const t = pointIndex / 28;
				const angle = t * Math.PI * 2 + filamentIndex * 0.91;
				const latitude = Math.sin(t * Math.PI * (2 + filamentIndex % 3) + filamentIndex) * 0.72;
				const radial = Math.sqrt(Math.max(0.05, 1 - latitude * latitude)) * (0.62 + (filamentIndex % 2) * 0.16);
				points.push(new THREE.Vector3(
					Math.cos(angle) * radial,
					latitude,
					Math.sin(angle) * radial,
				));
			}
			const curve = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.55);
			const filamentMaterial = createGlowMaterial(
				filamentIndex % 3 === 0 ? 0xffffff : color,
				0.34 + (filamentIndex % 3) * 0.08,
				false,
			);
			const filament = new THREE.Mesh(
				new THREE.TubeGeometry(curve, 80, 0.012 + (filamentIndex % 2) * 0.007, 5, true),
				filamentMaterial,
			);
			chamber.add(filament);
			this.rotors.push({ object: filament, speed: (filamentIndex % 2 ? -1 : 1) * (0.2 + filamentIndex * 0.025), axis: filamentIndex % 3 === 0 ? "x" : "z" });
			this.pulseMaterials.push({ material: filamentMaterial, base: 0.28, range: 0.2, phase: filamentIndex * 0.73 });
		}

		// Three articulated gyroscope assemblies retain the strong original
		// silhouette. Each orbit is split into machined arcs, luminous rails and
		// connector modules, so it no longer reads as a default TorusGeometry.
		const orbitConfigs = [
			{ radius: 2.34, rotation: [0.16, 0.05, 0.34], speed: 0.12, segments: 7 },
			{ radius: 2.92, rotation: [1.02, 0.38, -0.12], speed: -0.085, segments: 8 },
		];
		const electricNodeGeometry = new THREE.SphereGeometry(0.072, 18, 14);
		const electricNodeMaterial = createPlasmaMaterial(0x71e5ff);
		electricNodeMaterial.depthTest = false;
		const electricSparkGeometry = new THREE.SphereGeometry(0.026, 12, 8);
		const electricSparkMaterial = createGlowMaterial(0xf1fdff, 0.98, false);
		electricSparkMaterial.depthTest = false;
		this.timeUniforms.push(electricNodeMaterial.uniforms.uTime);
		this.pulseMaterials.push({ material: electricSparkMaterial, base: 0.88, range: 0.1, phase: 1.1 });
		orbitConfigs.forEach((config, orbitIndex) => {
			const orbit = new THREE.Group();
			orbit.rotation.set(...config.rotation);
			assembly.add(orbit);
			const segmentArc = (Math.PI * 2) / config.segments;
			const gap = 0.16 + orbitIndex * 0.025;
			for (let segmentIndex = 0; segmentIndex < config.segments; segmentIndex += 1) {
				const segment = new THREE.Group();
				segment.rotation.z = segmentIndex * segmentArc + orbitIndex * 0.11;
				orbit.add(segment);

				const railTubeRadius = 0.042 - orbitIndex * 0.005;
				const rail = new THREE.Mesh(
					new THREE.TorusGeometry(config.radius, railTubeRadius, 10, 40, segmentArc - gap),
					metalMaterial,
				);
				segment.add(rail);

				const lightMaterial = createGlowMaterial(
					segmentIndex % 3 === 0 ? 0xd9fbff : color,
					0.64 - orbitIndex * 0.1,
					false,
				);
				const lightRail = new THREE.Mesh(
					new THREE.TorusGeometry(config.radius, 0.01, 5, 40, segmentArc - gap + 0.01),
					lightMaterial,
				);
				lightRail.position.z = railTubeRadius * 0.92;
				const lightRailBack = lightRail.clone();
				lightRailBack.position.z = -railTubeRadius * 0.92;
				segment.add(lightRail, lightRailBack);
				// The energy channel never switches off. Only a restrained shimmer is
				// allowed, so the neon remains continuous inside every metal section.
				this.pulseMaterials.push({ material: lightMaterial, base: 0.9, range: 0.06, phase: orbitIndex * 1.4 + segmentIndex * 0.61 });

				const endpointAngle = segmentArc - gap * 0.5;
				const electricNode = new THREE.Group();
				electricNode.position.set(
					Math.cos(endpointAngle) * config.radius,
					Math.sin(endpointAngle) * config.radius,
					0,
				);
				const electricCore = new THREE.Mesh(electricNodeGeometry, electricNodeMaterial);
				const electricSpark = new THREE.Mesh(electricSparkGeometry, electricSparkMaterial);
				electricCore.renderOrder = 11;
				electricSpark.renderOrder = 12;
				const nodeScale = 0.84 + orbitIndex * 0.13 + (segmentIndex % 3) * 0.035;
				electricNode.scale.setScalar(nodeScale);
				electricNode.add(electricCore, electricSpark);
				segment.add(electricNode);
			}
			this.rotors.push({ object: orbit, speed: config.speed, axis: orbitIndex === 1 ? "x" : "z" });
		});

		const particleCount = 120;
		const particlePositions = new Float32Array(particleCount * 3);
		for (let index = 0; index < particleCount; index += 1) {
			const angle = index * 2.399963;
			const radius = 1.9 + ((index * 23) % 41) * 0.065;
			particlePositions[index * 3] = Math.cos(angle) * radius;
			particlePositions[index * 3 + 1] = Math.sin(index * 1.73) * radius * 0.55;
			particlePositions[index * 3 + 2] = Math.sin(angle) * radius;
		}
		const particleGeometry = new THREE.BufferGeometry();
		particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
		const particleMaterial = new THREE.PointsMaterial({
			color: new THREE.Color(color).multiplyScalar(1.8),
			size: 0.035,
			sizeAttenuation: true,
			transparent: true,
			opacity: 0.64,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			toneMapped: false,
		});
		const particles = new THREE.Points(particleGeometry, particleMaterial);
		assembly.add(particles);
		this.rotors.push({ object: particles, speed: -0.028, axis: "y" });
		this.pulseMaterials.push({ material: particleMaterial, base: 0.42, range: 0.24, phase: 2.2 });

		this.rotors.push({ object: chamber, speed: 0.075, axis: "y" });
	}

	_buildSignalField() {
		const field = new THREE.Group();
		field.position.set(2.05, 0, 0);
		field.scale.setScalar(0.86 * SIGNAL_FIELD_MODEL_SCALE);
		field.rotation.set(-0.08, 0.12, -0.05);
		this.group.add(field);
		this.target.set(2.05, 0, 0);
		this.cameraLookAt = new THREE.Vector3(0.55, 0, 0);

		const ambientGeometry = createSignalAmbientGeometry(5200);
		const ambientMaterial = createSignalAmbientMaterial(this.config.color);
		const ambientParticles = new THREE.Points(ambientGeometry, ambientMaterial);
		ambientParticles.name = "SignalFieldAmbientDepthParticles";
		ambientParticles.frustumCulled = false;
		ambientParticles.renderOrder = 2;
		field.add(ambientParticles);
		this.timeUniforms.push(ambientMaterial.uniforms.uTime);

		const orbitGroup = new THREE.Group();
		orbitGroup.name = "SignalFieldAmbientOrbits";
		const orbitConfigs = [
			[2.82, 0.72, 0.1, [0.28, 0.14, 0.08], 0.007],
			[3.18, 0.58, 1.8, [-0.34, 0.28, -0.16], -0.006],
			[3.54, 0.78, 3.2, [0.18, -0.38, 0.24], 0.0045],
			[3.88, 0.64, 4.6, [-0.16, -0.22, -0.3], -0.0035],
		];
		for (let index = 0; index < orbitConfigs.length; index += 1) {
			const [radius, ellipticity, phase, rotation, speed] = orbitConfigs[index];
			const orbitMaterial = new THREE.LineBasicMaterial({
				color: new THREE.Color(this.config.color).multiplyScalar(1.1),
				transparent: true,
				opacity: 0.13 + index * 0.016,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
				depthTest: false,
				toneMapped: false,
			});
			const orbit = new THREE.LineLoop(
				createSignalOrbitGeometry(radius, ellipticity, phase),
				orbitMaterial,
			);
			orbit.rotation.set(rotation[0], rotation[1], rotation[2]);
			orbit.renderOrder = 3;
			orbitGroup.add(orbit);
			this.rotors.push({ object: orbit, speed, axis: index % 2 === 0 ? "z" : "y" });
			this.pulseMaterials.push({
				material: orbitMaterial,
				base: 0.125 + index * 0.016,
				range: 0.032,
				phase: index * 1.37,
			});
		}
		field.add(orbitGroup);

		const geometry = createSignalParticleGeometry(18000);
		const material = createSignalParticleMaterial(this.config.color);
		const particles = new THREE.Points(geometry, material);
		particles.name = "SignalFieldMorphingParticles";
		particles.frustumCulled = false;
		particles.renderOrder = 6;
		field.add(particles);

		this.signalField = field;
		this.signalFieldMaterial = material;
		const requestedFormIndex = getRequestedSignalFieldFormIndex();
		this.signalFieldActiveFormIndex = requestedFormIndex;
		this.signalFieldFromFormIndex = requestedFormIndex;
		this.signalFieldTargetFormIndex = requestedFormIndex;
		material.uniforms.uFormFrom.value = requestedFormIndex;
		material.uniforms.uFormTo.value = requestedFormIndex;
		material.uniforms.uMorphProgress.value = 1;
		publishSignalFieldMorphState({
			activeIndex: requestedFormIndex,
			fromIndex: requestedFormIndex,
			targetIndex: requestedFormIndex,
			progress: 1,
			transitioning: false,
		});
		this.signalFieldBridgeUnsubscribe = subscribeSignalFieldFormRequest((formIndex) => {
			this._requestSignalFieldForm(formIndex);
		});
		this.timeUniforms.push(material.uniforms.uTime);
		this.rotors.push({ object: field, speed: 0.018, axis: "y" });
	}

	_publishSignalFieldMorphState() {
		publishSignalFieldMorphState({
			activeIndex: this.signalFieldActiveFormIndex,
			fromIndex: this.signalFieldFromFormIndex,
			targetIndex: this.signalFieldTargetFormIndex,
			progress: this.signalFieldMorphProgress,
			transitioning: this.signalFieldMorphProgress < 1,
		});
	}

	_requestSignalFieldForm(formIndex) {
		const nextIndex = THREE.MathUtils.clamp(Math.round(Number(formIndex) || 0), 0, 3);
		if (!this.signalFieldMaterial) return;
		if (this.signalFieldMorphProgress < 1) {
			this.signalFieldQueuedFormIndex = nextIndex === this.signalFieldTargetFormIndex
				? null
				: nextIndex;
			return;
		}
		if (nextIndex === this.signalFieldActiveFormIndex) {
			this._publishSignalFieldMorphState();
			return;
		}

		this.signalFieldFromFormIndex = this.signalFieldActiveFormIndex;
		this.signalFieldTargetFormIndex = nextIndex;
		this.signalFieldMorphElapsed = 0;
		this.signalFieldMorphProgress = 0;
		this.signalFieldMaterial.uniforms.uFormFrom.value = this.signalFieldFromFormIndex;
		this.signalFieldMaterial.uniforms.uFormTo.value = this.signalFieldTargetFormIndex;
		this.signalFieldMaterial.uniforms.uMorphProgress.value = 0;
		this._publishSignalFieldMorphState();
	}

	_updateSignalFieldMorph(delta) {
		if (!this.signalFieldMaterial || this.signalFieldMorphProgress >= 1) return;
		this.signalFieldMorphElapsed += delta;
		this.signalFieldMorphProgress = THREE.MathUtils.clamp(
			this.signalFieldMorphElapsed / SIGNAL_FIELD_MORPH_DURATION,
			0,
			1,
		);
		this.signalFieldMaterial.uniforms.uMorphProgress.value = this.signalFieldMorphProgress;

		if (this.signalFieldMorphProgress >= 1) {
			this.signalFieldActiveFormIndex = this.signalFieldTargetFormIndex;
			this.signalFieldFromFormIndex = this.signalFieldTargetFormIndex;
			this.signalFieldMaterial.uniforms.uFormFrom.value = this.signalFieldActiveFormIndex;
			this.signalFieldMaterial.uniforms.uFormTo.value = this.signalFieldActiveFormIndex;
			this.signalFieldMaterial.uniforms.uMorphProgress.value = 1;
		}
		this._publishSignalFieldMorphState();

		if (this.signalFieldMorphProgress >= 1 && this.signalFieldQueuedFormIndex != null) {
			const queuedIndex = this.signalFieldQueuedFormIndex;
			this.signalFieldQueuedFormIndex = null;
			this._requestSignalFieldForm(queuedIndex);
		}
	}

	_resetInteraction() {
		this.interactionHovered = false;
		this.interactionStrength = 0;
		this.interactionCharge = 0;
		this.interactionBurstAge = 10;
		this.interactionBurstStrength = 0;
		this.interactionPressElapsed = 0;
		this.interactionPressActive = false;
		this.interactionPressDragged = false;
		this.interactionPointerWasDown = false;
		this.interactionWorldPoint.set(100, 100, 100);
		for (const material of this.interactionMaterials) {
			material.uniforms.uPointerWorld.value.copy(this.interactionWorldPoint);
			material.uniforms.uPointerStrength.value = 0;
			material.uniforms.uBurstAge.value = 10;
			material.uniforms.uBurstStrength.value = 0;
		}
		if (this.interactionPlasmaMaterial) {
			this.interactionPlasmaMaterial.uniforms.uInteraction.value = 0;
			this.interactionPlasmaMaterial.uniforms.uBurst.value = 0;
		}
		this.signalFieldPointerInfluence = 0;
		this.signalFieldPointerVelocity.set(0, 0);
		if (this.signalFieldMaterial) {
			this.signalFieldMaterial.uniforms.uPointerInfluence.value = 0;
			this.signalFieldMaterial.uniforms.uPointerVelocity.value.set(0, 0);
		}
	}

	_updateSyntheticInteraction(delta, frame, interactionOwned = true) {
		if (this.config.build !== "core") return false;
		const interactionEnabled = interactionOwned
			&& frame?.interactionEnabled !== false
			&& !frame?.pointerBlocked
			&& Boolean(frame?.camera);
		const pointer = frame?.visualPointer ?? frame?.pointer ?? { x: 0, y: 0 };
		this.interactionPointer.set(
			THREE.MathUtils.clamp(Number(pointer.x) || 0, -1, 1),
			THREE.MathUtils.clamp(Number(pointer.y) || 0, -1, 1),
		);

		let hovered = false;
		if (interactionEnabled && this.interactionAssembly) {
			this.interactionAssembly.updateWorldMatrix(true, false);
			this.interactionCenter.setFromMatrixPosition(this.interactionAssembly.matrixWorld);
			this.interactionRaycaster.setFromCamera(this.interactionPointer, frame.camera);
			hovered = Boolean(this.interactionRaycaster.ray.intersectSphere(
				this.interactionSphere,
				this.interactionWorldPoint,
			));
		}
		if (!hovered) this.interactionWorldPoint.set(100, 100, 100);
		this.interactionHovered = hovered;
		this.interactionStrength = THREE.MathUtils.damp(
			this.interactionStrength,
			hovered ? 1 : 0,
			hovered ? 8.5 : 4.2,
			delta,
		);

		const pointerDown = interactionEnabled && Boolean(frame?.pointerDown);
		if (!interactionEnabled && this.interactionPointerWasDown) {
			this.interactionPressActive = false;
			this.interactionPressDragged = false;
			this.interactionPressElapsed = 0;
			this.interactionPointerWasDown = false;
		}
		if (pointerDown && !this.interactionPointerWasDown) {
			this.interactionPressActive = hovered;
			this.interactionPressDragged = false;
			this.interactionPressElapsed = 0;
			this.interactionPressPointer.copy(this.interactionPointer);
			if (hovered) this.interactionPressWorldPoint.copy(this.interactionWorldPoint);
		}
		if (pointerDown && this.interactionPressActive) {
			this.interactionPressElapsed += delta;
			if (this.interactionPointer.distanceToSquared(this.interactionPressPointer) > 0.0016) {
				this.interactionPressDragged = true;
			}
		}
		if (!pointerDown && this.interactionPointerWasDown) {
			if (this.interactionPressActive && !this.interactionPressDragged) {
				const heldCharge = THREE.MathUtils.clamp(this.interactionPressElapsed / 1.15, 0, 1);
				this.interactionBurstAge = 0;
				this.interactionBurstStrength = 0.62 + heldCharge * 0.78;
				for (const material of this.interactionMaterials) {
					material.uniforms.uBurstOrigin.value.copy(this.interactionPressWorldPoint);
				}
			}
			this.interactionPressActive = false;
			this.interactionPressElapsed = 0;
		}
		this.interactionPointerWasDown = pointerDown;

		const chargeTarget = pointerDown
			&& this.interactionPressActive
			&& !this.interactionPressDragged
			? THREE.MathUtils.clamp(0.3 + this.interactionPressElapsed / 1.15, 0, 1)
			: 0;
		this.interactionCharge = THREE.MathUtils.damp(
			this.interactionCharge,
			chargeTarget,
			chargeTarget > this.interactionCharge ? 5.8 : 3.6,
			delta,
		);
		if (this.interactionBurstStrength > 0) {
			this.interactionBurstAge += delta;
			if (this.interactionBurstAge >= 2.45) {
				this.interactionBurstAge = 10;
				this.interactionBurstStrength = 0;
			}
		}
		const burstVisual = this.interactionBurstStrength
			* Math.max(0, 1 - this.interactionBurstAge * 0.42);
		for (const material of this.interactionMaterials) {
			material.uniforms.uPointerWorld.value.copy(this.interactionWorldPoint);
			material.uniforms.uPointerStrength.value = Math.max(
				this.interactionStrength,
				this.interactionCharge,
			);
			material.uniforms.uBurstAge.value = this.interactionBurstAge;
			material.uniforms.uBurstStrength.value = this.interactionBurstStrength;
		}
		if (this.interactionPlasmaMaterial) {
			this.interactionPlasmaMaterial.uniforms.uInteraction.value = Math.max(
				this.interactionStrength * 0.42,
				this.interactionCharge,
			);
			this.interactionPlasmaMaterial.uniforms.uBurst.value = burstVisual;
		}
		return hovered;
	}

	_updateSignalField(delta, frame, interactionOwned = true) {
		if (!this.signalFieldMaterial || !this.signalField) return false;
		this._updateSignalFieldMorph(delta);
		const enabled = interactionOwned
			&& frame?.interactionEnabled !== false
			&& !frame?.pointerBlocked
			&& Boolean(frame?.camera);
		const pointer = frame?.visualPointer ?? frame?.pointer ?? { x: 0, y: 0 };
		let hovered = false;
		if (enabled) {
			this.signalFieldPointerNdc.set(
				THREE.MathUtils.clamp(Number(pointer.x) || 0, -1, 1),
				THREE.MathUtils.clamp(Number(pointer.y) || 0, -1, 1),
			);
			this.signalField.updateWorldMatrix(true, false);
			this.signalFieldWorldCenter.setFromMatrixPosition(this.signalField.matrixWorld);
			frame.camera.getWorldDirection(this.signalFieldPlaneNormal);
			this.signalFieldInteractionPlane.setFromNormalAndCoplanarPoint(
				this.signalFieldPlaneNormal,
				this.signalFieldWorldCenter,
			);
			this.signalFieldRaycaster.setFromCamera(this.signalFieldPointerNdc, frame.camera);
			if (this.signalFieldRaycaster.ray.intersectPlane(
				this.signalFieldInteractionPlane,
				this.signalFieldWorldPoint,
			)) {
				this.signalFieldLocalPoint
					.copy(this.signalFieldWorldPoint);
				this.signalField.worldToLocal(this.signalFieldLocalPoint);
				const linearMorph = this.signalFieldMorphProgress;
				const morph = linearMorph * linearMorph * linearMorph
					* (linearMorph * (linearMorph * 6 - 15) + 10);
				const fromBounds = SIGNAL_FIELD_FORM_BOUNDS[this.signalFieldFromFormIndex];
				const toBounds = SIGNAL_FIELD_FORM_BOUNDS[this.signalFieldTargetFormIndex];
				this.signalFieldBounds.set(
					THREE.MathUtils.lerp(fromBounds.x, toBounds.x, morph) * 1.12,
					THREE.MathUtils.lerp(fromBounds.y, toBounds.y, morph) * 1.12,
				);
				const normalizedX = this.signalFieldLocalPoint.x / this.signalFieldBounds.x;
				const normalizedY = this.signalFieldLocalPoint.y / this.signalFieldBounds.y;
				hovered = normalizedX * normalizedX + normalizedY * normalizedY <= 1;
				if (hovered) {
					this.signalFieldPointerTarget.set(
						this.signalFieldLocalPoint.x,
						this.signalFieldLocalPoint.y,
					);
				}
			}
		}
		this.signalFieldPreviousPointer.copy(this.signalFieldPointer);
		if (hovered) {
			this.signalFieldPointer.x = THREE.MathUtils.damp(
				this.signalFieldPointer.x,
				this.signalFieldPointerTarget.x,
				10.5,
				delta,
			);
			this.signalFieldPointer.y = THREE.MathUtils.damp(
				this.signalFieldPointer.y,
				this.signalFieldPointerTarget.y,
				10.5,
				delta,
			);
		}
		this.signalFieldPointerInfluence = THREE.MathUtils.damp(
			this.signalFieldPointerInfluence,
			hovered ? 1 : 0,
			hovered ? 12 : 18,
			delta,
		);
		const safeDelta = Math.max(delta, 1 / 240);
		const instantaneousVelocity = this.signalFieldVelocityScratch
			.copy(this.signalFieldPointer)
			.sub(this.signalFieldPreviousPointer)
			.multiplyScalar(Math.min(1.5, 1 / safeDelta) * 0.22 * (hovered ? 1 : 0));
		this.signalFieldPointerVelocity.x = THREE.MathUtils.damp(
			this.signalFieldPointerVelocity.x,
			instantaneousVelocity.x,
			8.5,
			delta,
		);
		this.signalFieldPointerVelocity.y = THREE.MathUtils.damp(
			this.signalFieldPointerVelocity.y,
			instantaneousVelocity.y,
			8.5,
			delta,
		);
		this.signalFieldMaterial.uniforms.uPointer.value.copy(this.signalFieldPointer);
		this.signalFieldMaterial.uniforms.uPointerVelocity.value.copy(this.signalFieldPointerVelocity);
		this.signalFieldMaterial.uniforms.uPointerInfluence.value = this.signalFieldPointerInfluence;
		return hovered;
	}

	setRenderEnabled(enabled) {
		const nextVisible = enabled === true;
		if (!nextVisible && this.group.visible) this._resetInteraction();
		this.group.visible = nextVisible;
	}

	getOrbitTarget(target = new THREE.Vector3()) {
		// The orbit controller derives its pivot from the current view ray. Return
		// the exact authored look-at point so the radius cannot jump for one frame
		// when drag begins or reverses.
		return target.copy(this.cameraLookAt ?? this.target);
	}

	applyCamera(camera, parallax) {
		camera.position.copy(this.cameraPosition);
		camera.position.x += (Number(parallax?.x) || 0) * 0.65;
		camera.position.y += (Number(parallax?.y) || 0) * 0.45;
		camera.fov = 43;
		camera.updateProjectionMatrix();
		camera.lookAt(this.cameraLookAt ?? this.target);
		camera.updateMatrixWorld(true);
	}

	update(delta, active = false, frame = null, interactionOwned = true) {
		if (!active) return false;
		const dt = Math.max(0, Math.min(0.05, Number(delta) || 0));
		const hovered = this._updateSyntheticInteraction(dt, frame, interactionOwned);
		const signalFieldHovered = this._updateSignalField(dt, frame, interactionOwned);
		this.elapsed += dt;
		const burstEnergy = this.interactionBurstStrength
			* Math.max(0, 1 - this.interactionBurstAge * 0.42);
		const interactionEnergy = Math.max(
			this.interactionStrength * 0.28,
			this.interactionCharge,
			burstEnergy,
		);
		for (const rotor of this.rotors) {
			rotor.object.rotation[rotor.axis] += rotor.speed * dt * (1 + interactionEnergy * 2.4);
		}
		for (const pulse of this.pulseMaterials) {
			pulse.material.opacity = pulse.base
				+ Math.sin(this.elapsed * 1.6 + pulse.phase) * pulse.range;
		}
		for (const uniform of this.timeUniforms) {
			uniform.value = this.elapsed;
		}
		for (const breather of this.breathers) {
			const scale = 1 + Math.sin(this.elapsed * breather.speed + breather.phase) * breather.amount;
			breather.object.scale.set(
				breather.base[0] * scale,
				breather.base[1] * scale,
				breather.base[2] * scale,
			);
		}
		return hovered || signalFieldHovered;
	}

	dispose(scene) {
		this.signalFieldBridgeUnsubscribe?.();
		this.signalFieldBridgeUnsubscribe = null;
		scene?.remove(this.group);
		const geometries = new Set();
		const materials = new Set();
		this.group.traverse((object) => {
			if (object.geometry) geometries.add(object.geometry);
			const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
			for (const material of objectMaterials) {
				if (material) materials.add(material);
			}
		});
		for (const geometry of geometries) geometry.dispose();
		for (const material of materials) material.dispose();
		this.group.clear();
	}
}
