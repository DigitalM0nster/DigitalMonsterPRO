import * as THREE from "three";
import { networkNodeVertex, networkNodeFragment, networkLineVertex, networkLineFragment } from "./syntheticCoreNetworkShaders.js";

const random = n => { const v = Math.sin(n * 127.1 + 81.3) * 43758.5453; return v - Math.floor(v); };

/** Prepare-only geometry. The existing scene clock/assembly spring drive both GPU draws. */
export function createSyntheticCoreNetwork({ time, assembly, detail = 1 }) {
	const rows = detail <= 0.5 ? 7 : detail <= 0.75 ? 9 : 12;
	const positions = [], seeds = [], edges = [];
	for (let row = 0; row < rows; row++) {
		const angle = -1.22 + row / (rows - 1) * 2.44;
		for (let lane = 0; lane < 3; lane++) {
			const id = row * 3 + lane;
			// A narrow crescent outside the right rim; its inner edge can pass behind metal.
			positions.push(2.55 + Math.cos(angle) * 0.6 + lane * 0.36 + (random(id) - 0.5) * 0.22,
				Math.sin(angle) * 2.7 + (random(id + 50) - 0.5) * 0.32,
				-0.25 - random(id + 90) * 0.85);
			seeds.push(random(id + 150));
			if (lane > 0) edges.push([id - 1, id]);
			if (row > 0 && lane !== row % 3) edges.push([id - 3, id]);
		}
		if (row > 0 && row % 2 === 0) edges.push([row * 3 - 2, row * 3 + 2]);
	}
	const nodeGeometry = new THREE.BufferGeometry();
	nodeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	nodeGeometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
	const linePositions = [], lineSeeds = [], along = [], lengths = [], edgeIds = [];
	const others = [], otherSeeds = [], sides = [], indices = [];
	for (const [edge, [start, end]] of edges.entries()) {
		const length = Math.hypot(...[0, 1, 2].map(axis => positions[start * 3 + axis] - positions[end * 3 + axis]));
		for (const [t, id] of [start, end].entries()) {
			for (const side of [-1, 1]) {
				linePositions.push(...positions.slice(id * 3, id * 3 + 3));
				lineSeeds.push(seeds[id]); along.push(t); lengths.push(length); edgeIds.push(edge);
				const other = t === 0 ? end : start;
				others.push(...positions.slice(other * 3, other * 3 + 3));
				otherSeeds.push(seeds[other]); sides.push(side);
			}
		}
		const base = edge * 4;
		indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
	}
	const lineGeometry = new THREE.BufferGeometry();
	for (const [name, values, size] of [["position", linePositions, 3], ["aSeed", lineSeeds, 1],
		["aAlong", along, 1], ["aLength", lengths, 1], ["aEdge", edgeIds, 1],
		["aOther", others, 3], ["aOtherSeed", otherSeeds, 1], ["aSide", sides, 1]]) {
		lineGeometry.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
	}
	lineGeometry.setIndex(indices);
	const uniforms = { uTime: time, uAssembly: assembly, uPixelRatio: { value: 1 },
		uViewport: { value: new THREE.Vector2(1, 1) } };
	const options = { uniforms, transparent: true, depthTest: true, depthWrite: false,
		blending: THREE.AdditiveBlending, toneMapped: false };
	const nodes = new THREE.Points(nodeGeometry, new THREE.ShaderMaterial({ ...options,
		name: "core-network-nodes", vertexShader: networkNodeVertex, fragmentShader: networkNodeFragment }));
	// Thin screen-space ribbons survive render-target downsampling better than GL's one-pixel lines.
	const lines = new THREE.Mesh(lineGeometry, new THREE.ShaderMaterial({ ...options,
		name: "core-network-links", vertexShader: networkLineVertex, fragmentShader: networkLineFragment,
		side: THREE.DoubleSide, extensions: { derivatives: true } }));
	nodes.name = "core-network-nodes"; lines.name = "core-network-links";
	// Vertices spread on the GPU during disassembly; keep their two tiny draws in the graph.
	nodes.frustumCulled = lines.frustumCulled = false;
	nodes.onBeforeRender = renderer => { uniforms.uPixelRatio.value = renderer.getPixelRatio(); };
	const viewport = new THREE.Vector4();
	lines.onBeforeRender = renderer => {
		renderer.getCurrentViewport(viewport);
		uniforms.uViewport.value.set(Math.max(1, viewport.z), Math.max(1, viewport.w));
	};
	const group = new THREE.Group();
	group.name = "core-right-network";
	group.position.set(1.1, 0, 0);
	group.add(lines, nodes);
	return group;
}
