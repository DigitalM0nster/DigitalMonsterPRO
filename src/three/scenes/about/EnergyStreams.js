import * as THREE from "three";
import { ABOUT_COLORS, ABOUT_ENERGY, ABOUT_GEOMETRY } from "./aboutSceneConfig.js";

function seededRandom(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

function buildStreamCurve(index, rand, throughHole) {
	const geo = ABOUT_GEOMETRY;
	const yBase = (rand() - 0.5) * geo.outerSize * 0.85;
	const yBend = yBase + (rand() - 0.5) * 0.55;
	const zLane = throughHole
		? (rand() - 0.5) * 0.25
		: (rand() > 0.5 ? 1 : -1) * (geo.depth * (0.55 + rand() * 0.7));
	const wrap = !throughHole && rand() > 0.45;
	const wrapSide = rand() > 0.5 ? 1 : -1;
	const span = 5.5 + rand() * 2.2;

	const pts = [];
	const steps = 5;
	for (let i = 0; i <= steps; i += 1) {
		const t = i / steps;
		let x = THREE.MathUtils.lerp(-span * 0.5, span * 0.5, t);
		let y = THREE.MathUtils.lerp(yBase, yBend, Math.sin(t * Math.PI));
		let z = zLane;
		if (wrap) {
			const bulge = Math.sin(t * Math.PI) * (geo.outerSize * 0.55 + rand() * 0.35);
			if (wrapSide > 0) y += bulge * 0.35;
			else y -= bulge * 0.25;
			z += Math.sin(t * Math.PI) * wrapSide * 0.35;
		}
		if (throughHole && t > 0.35 && t < 0.65) {
			z *= 0.35;
			y *= 0.55;
		}
		pts.push(new THREE.Vector3(x, y, z));
	}
	return new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.35);
}

/**
 * Horizontal energy streams + particles traveling along splines.
 * One LineSegments draw + one Points draw.
 */
export function createEnergyStreams({ mobile = false } = {}) {
	const counts = mobile ? ABOUT_ENERGY.mobile : ABOUT_ENERGY.desktop;
	const rand = seededRandom(0xE7E6);
	const curvePointCount = ABOUT_ENERGY.curvePoints;

	const curves = [];
	const speeds = [];
	const opacities = [];

	for (let i = 0; i < counts.streams; i += 1) {
		const throughHole = i % 3 !== 2;
		curves.push(buildStreamCurve(i, rand, throughHole));
		speeds.push(0.12 + rand() * 0.28);
		opacities.push(0.25 + rand() * 0.55);
	}

	// Merged line positions: each curve contributes (curvePointCount-1)*2 vertices
	const segmentsPerCurve = curvePointCount - 1;
	const lineFloats = new Float32Array(curves.length * segmentsPerCurve * 2 * 3);
	const lineAlphas = new Float32Array(curves.length * segmentsPerCurve * 2);
	const tmp = new THREE.Vector3();
	const tmp2 = new THREE.Vector3();

	for (let c = 0; c < curves.length; c += 1) {
		const curve = curves[c];
		const base = c * segmentsPerCurve * 2;
		for (let s = 0; s < segmentsPerCurve; s += 1) {
			const t0 = s / segmentsPerCurve;
			const t1 = (s + 1) / segmentsPerCurve;
			curve.getPoint(t0, tmp);
			curve.getPoint(t1, tmp2);
			const vi = (base + s * 2) * 3;
			lineFloats[vi] = tmp.x;
			lineFloats[vi + 1] = tmp.y;
			lineFloats[vi + 2] = tmp.z;
			lineFloats[vi + 3] = tmp2.x;
			lineFloats[vi + 4] = tmp2.y;
			lineFloats[vi + 5] = tmp2.z;
			const fade = Math.sin(t0 * Math.PI);
			lineAlphas[base + s * 2] = opacities[c] * fade;
			lineAlphas[base + s * 2 + 1] = opacities[c] * Math.sin(t1 * Math.PI);
		}
	}

	const lineGeo = new THREE.BufferGeometry();
	lineGeo.setAttribute("position", new THREE.BufferAttribute(lineFloats, 3));
	lineGeo.setAttribute("aAlpha", new THREE.BufferAttribute(lineAlphas, 1));

	const lineMat = new THREE.ShaderMaterial({
		uniforms: {
			uVisibility: { value: 0 },
			uTime: { value: 0 },
			uColor: { value: new THREE.Color(ABOUT_COLORS.energy) },
		},
		vertexShader: `
			attribute float aAlpha;
			varying float vAlpha;
			uniform float uTime;
			void main() {
				float dash = 0.55 + 0.45 * sin(position.x * 1.8 - uTime * 2.4);
				vAlpha = aAlpha * dash;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: `
			uniform vec3 uColor;
			uniform float uVisibility;
			varying float vAlpha;
			void main() {
				float a = vAlpha * uVisibility;
				if (a < 0.01) discard;
				vec3 col = uColor * (1.1 + a * 1.4);
				gl_FragColor = vec4(col, a);
			}
		`,
		transparent: true,
		depthWrite: false,
		depthTest: true,
		blending: THREE.AdditiveBlending,
		toneMapped: false,
	});

	const lines = new THREE.LineSegments(lineGeo, lineMat);
	lines.renderOrder = 9;
	lines.frustumCulled = false;

	// Particles
	const particleCount = counts.particles;
	const particlePositions = new Float32Array(particleCount * 3);
	const particleMeta = new Float32Array(particleCount * 3); // curveIndex, offset, speed
	for (let i = 0; i < particleCount; i += 1) {
		const curveIndex = Math.floor(rand() * curves.length);
		particleMeta[i * 3] = curveIndex;
		particleMeta[i * 3 + 1] = rand();
		particleMeta[i * 3 + 2] = speeds[curveIndex] * (0.7 + rand() * 0.8);
		curves[curveIndex].getPoint(particleMeta[i * 3 + 1], tmp);
		particlePositions[i * 3] = tmp.x;
		particlePositions[i * 3 + 1] = tmp.y;
		particlePositions[i * 3 + 2] = tmp.z;
	}

	const particleGeo = new THREE.BufferGeometry();
	particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
	particleGeo.setAttribute("aMeta", new THREE.BufferAttribute(particleMeta, 3));

	const particleMat = new THREE.ShaderMaterial({
		uniforms: {
			uVisibility: { value: 0 },
			uSize: { value: ABOUT_ENERGY.particleSize * (mobile ? 0.8 : 1) },
			uColor: { value: new THREE.Color(ABOUT_COLORS.rimCyan) },
		},
		vertexShader: `
			attribute vec3 aMeta;
			uniform float uSize;
			uniform float uVisibility;
			varying float vAlpha;
			void main() {
				vAlpha = uVisibility;
				vec4 mv = modelViewMatrix * vec4(position, 1.0);
				gl_PointSize = uSize * (280.0 / -mv.z);
				gl_Position = projectionMatrix * mv;
			}
		`,
		fragmentShader: `
			uniform vec3 uColor;
			varying float vAlpha;
			void main() {
				vec2 uv = gl_PointCoord * 2.0 - 1.0;
				float d = dot(uv, uv);
				if (d > 1.0) discard;
				float glow = exp(-d * 2.8);
				gl_FragColor = vec4(uColor * (1.3 + glow), glow * vAlpha);
			}
		`,
		transparent: true,
		depthWrite: false,
		depthTest: true,
		blending: THREE.AdditiveBlending,
		toneMapped: false,
	});

	const particles = new THREE.Points(particleGeo, particleMat);
	particles.renderOrder = 10;
	particles.frustumCulled = false;

	const group = new THREE.Group();
	group.name = "EnergyStreams";
	group.add(lines);
	group.add(particles);

	const positionAttr = particleGeo.getAttribute("position");
	const scratch = new THREE.Vector3();

	return {
		group,
		applyMotion(motion) {
			const vis = motion.energyVisibility;
			lineMat.uniforms.uVisibility.value = vis;
			particleMat.uniforms.uVisibility.value = vis;
			group.visible = vis > 0.01;
		},
		updateIdle(elapsed, delta) {
			if (!group.visible) return;
			lineMat.uniforms.uTime.value = elapsed;
			const safeDelta = Math.min(delta || 0.016, 0.05);
			for (let i = 0; i < particleCount; i += 1) {
				const curveIndex = particleMeta[i * 3] | 0;
				let t = particleMeta[i * 3 + 1] + particleMeta[i * 3 + 2] * safeDelta;
				if (t > 1) t -= 1;
				particleMeta[i * 3 + 1] = t;
				curves[curveIndex].getPoint(t, scratch);
				positionAttr.setXYZ(i, scratch.x, scratch.y, scratch.z);
			}
			positionAttr.needsUpdate = true;
		},
		dispose() {
			lineGeo.dispose();
			lineMat.dispose();
			particleGeo.dispose();
			particleMat.dispose();
		},
	};
}
