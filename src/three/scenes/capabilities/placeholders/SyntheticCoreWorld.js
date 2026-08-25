import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createCase3FakeLitMaterial } from "../../portfolio/case3/case3FakeLitMaterial.js";

const SYNTHETIC_CORE_CONFIG = {
	color: 0x33d6ff,
	camera: [0, 0.7, 11],
	build: "core",
};

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

/** Prepared world for the synthetic-core capability stage. */
export class SyntheticCoreWorld {
	constructor(scene) {
		this.variant = "syntheticCore";
		this.config = SYNTHETIC_CORE_CONFIG;
		this.group = new THREE.Group();
		this.group.name = "capability-synthetic-core";
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
		this._buildSyntheticCore();
		scene.add(this.group);
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
		return hovered;
	}

	dispose(scene) {
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
