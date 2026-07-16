import * as THREE from "three";
import { ABOUT_COLORS, ABOUT_GEOMETRY, ABOUT_NETWORK } from "./aboutSceneConfig.js";

function seededRandom(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

/**
 * Irregular triangular network filling the frame volume (not a regular wireframe).
 */
export function createNetworkLayer({ mobile = false } = {}) {
	const cfg = mobile ? ABOUT_NETWORK.mobile : ABOUT_NETWORK.desktop;
	const rand = seededRandom(0xA70B7);
	const geo = ABOUT_GEOMETRY;

	const halfOuter = geo.outerSize * 0.42;
	const halfInner = geo.innerHole * 0.42;
	const depthHalf = geo.depth * 0.38;

	const points = [];
	const isInFrame = (x, y) => {
		const ax = Math.abs(x);
		const ay = Math.abs(y);
		const inOuter = ax < halfOuter && ay < halfOuter;
		const inHole = ax < halfInner && ay < halfInner;
		return inOuter && !inHole;
	};

	let attempts = 0;
	while (points.length < cfg.points && attempts < cfg.points * 40) {
		attempts += 1;
		const x = (rand() * 2 - 1) * halfOuter;
		const y = (rand() * 2 - 1) * halfOuter;
		if (!isInFrame(x, y)) continue;
		const z = (rand() * 2 - 1) * depthHalf;
		// Prefer surface-ish points
		const surfaceBias = rand();
		const zFinal = surfaceBias > 0.55 ? Math.sign(z || 1) * depthHalf * (0.7 + rand() * 0.3) : z;
		points.push(new THREE.Vector3(x, y, zFinal));
	}

	// Connect nearest neighbors with distance cap
	const edges = [];
	const edgeSet = new Set();
	const maxDistSq = cfg.maxDistance * cfg.maxDistance;
	for (let i = 0; i < points.length; i += 1) {
		const distances = [];
		for (let j = 0; j < points.length; j += 1) {
			if (i === j) continue;
			const d = points[i].distanceToSquared(points[j]);
			if (d <= maxDistSq) distances.push({ j, d });
		}
		distances.sort((a, b) => a.d - b.d);
		const linkCount = 2 + Math.floor(rand() * 3);
		for (let k = 0; k < Math.min(linkCount, distances.length); k += 1) {
			const j = distances[k].j;
			const key = i < j ? `${i}-${j}` : `${j}-${i}`;
			if (edgeSet.has(key)) continue;
			edgeSet.add(key);
			edges.push(i, j);
			if (edges.length / 2 >= cfg.maxConnections) break;
		}
		if (edges.length / 2 >= cfg.maxConnections) break;
	}

	const linePositions = new Float32Array(edges.length * 3);
	for (let e = 0; e < edges.length; e += 1) {
		const p = points[edges[e]];
		linePositions[e * 3] = p.x;
		linePositions[e * 3 + 1] = p.y;
		linePositions[e * 3 + 2] = p.z;
	}

	const lineGeo = new THREE.BufferGeometry();
	lineGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));

	const lineMat = new THREE.LineBasicMaterial({
		color: ABOUT_COLORS.networkLine,
		transparent: true,
		opacity: 0.05,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		toneMapped: false,
	});
	const lines = new THREE.LineSegments(lineGeo, lineMat);
	lines.renderOrder = 7;

	const nodePositions = new Float32Array(points.length * 3);
	const nodeSeeds = new Float32Array(points.length);
	for (let i = 0; i < points.length; i += 1) {
		nodePositions[i * 3] = points[i].x;
		nodePositions[i * 3 + 1] = points[i].y;
		nodePositions[i * 3 + 2] = points[i].z;
		nodeSeeds[i] = rand();
	}
	const nodeGeo = new THREE.BufferGeometry();
	nodeGeo.setAttribute("position", new THREE.BufferAttribute(nodePositions, 3));
	nodeGeo.setAttribute("aSeed", new THREE.BufferAttribute(nodeSeeds, 1));

	const nodeMat = new THREE.ShaderMaterial({
		uniforms: {
			uSize: { value: ABOUT_NETWORK.nodeSize * (mobile ? 0.85 : 1) },
			uOpacity: { value: 0.05 },
			uPulse: { value: 1 },
			uTime: { value: 0 },
			uColor: { value: new THREE.Color(ABOUT_COLORS.networkNode) },
		},
		vertexShader: `
			attribute float aSeed;
			uniform float uSize;
			uniform float uPulse;
			uniform float uTime;
			varying float vAlpha;
			void main() {
				float pulse = 0.75 + 0.25 * sin(uTime * (1.2 + aSeed) + aSeed * 6.28);
				vAlpha = pulse * uPulse;
				vec4 mv = modelViewMatrix * vec4(position, 1.0);
				gl_PointSize = uSize * (300.0 / -mv.z) * (0.7 + pulse * 0.5);
				gl_Position = projectionMatrix * mv;
			}
		`,
		fragmentShader: `
			uniform vec3 uColor;
			uniform float uOpacity;
			varying float vAlpha;
			void main() {
				vec2 uv = gl_PointCoord * 2.0 - 1.0;
				float d = dot(uv, uv);
				if (d > 1.0) discard;
				float glow = exp(-d * 3.2);
				vec3 col = uColor * (1.2 + glow * 1.8);
				gl_FragColor = vec4(col, uOpacity * glow * vAlpha);
			}
		`,
		transparent: true,
		depthWrite: false,
		depthTest: true,
		blending: THREE.AdditiveBlending,
		toneMapped: false,
	});
	const nodes = new THREE.Points(nodeGeo, nodeMat);
	nodes.renderOrder = 8;

	const group = new THREE.Group();
	group.name = "NetworkLayer";
	group.add(lines);
	group.add(nodes);
	group.visible = true;

	return {
		group,
		applyMotion(motion) {
			const vis = motion.networkVisibility;
			lineMat.opacity = ABOUT_NETWORK.lineOpacity * vis;
			nodeMat.uniforms.uOpacity.value = ABOUT_NETWORK.nodeOpacity * vis;
			nodeMat.uniforms.uPulse.value = motion.networkPulse;
			group.visible = vis > 0.02;
		},
		updateIdle(elapsed) {
			nodeMat.uniforms.uTime.value = elapsed;
		},
		dispose() {
			lineGeo.dispose();
			lineMat.dispose();
			nodeGeo.dispose();
			nodeMat.dispose();
		},
	};
}
