import * as THREE from "three";

/**
 * Closed-shell stand-in for NutBodyMain: surface points that hold until the
 * crack beat, then burst outward / fade so cracked cells + SeamRay can read.
 */

function createSoftDiscTexture() {
	const size = 64;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	g.addColorStop(0, "rgba(255,240,210,1)");
	g.addColorStop(0.35, "rgba(180,120,70,0.85)");
	g.addColorStop(0.7, "rgba(60,35,18,0.25)");
	g.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, size, size);
	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.needsUpdate = true;
	return tex;
}

function hash01(i) {
	const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
}

/**
 * Area-weighted triangle surface samples → world positions + outward normals.
 * @param {THREE.Mesh} mesh
 * @param {number} count
 */
function sampleMeshSurface(mesh, count) {
	const geo = mesh.geometry;
	const pos = geo?.attributes?.position;
	if (!pos || pos.count < 3) return null;

	mesh.updateWorldMatrix(true, false);
	const mw = mesh.matrixWorld;
	const normalMatrix = new THREE.Matrix3().getNormalMatrix(mw);

	const indexed = geo.index;
	const triCount = indexed ? indexed.count / 3 : pos.count / 3;
	if (triCount < 1) return null;

	const a = new THREE.Vector3();
	const b = new THREE.Vector3();
	const c = new THREE.Vector3();
	const ab = new THREE.Vector3();
	const ac = new THREE.Vector3();
	const n = new THREE.Vector3();
	const p = new THREE.Vector3();

	/** Prefix areas → O(log tris) pick instead of O(tris) walk per sample. */
	const prefix = new Float32Array(triCount);
	let total = 0;
	for (let t = 0; t < triCount; t += 1) {
		const i0 = indexed ? indexed.getX(t * 3) : t * 3;
		const i1 = indexed ? indexed.getX(t * 3 + 1) : t * 3 + 1;
		const i2 = indexed ? indexed.getX(t * 3 + 2) : t * 3 + 2;
		a.fromBufferAttribute(pos, i0);
		b.fromBufferAttribute(pos, i1);
		c.fromBufferAttribute(pos, i2);
		ab.subVectors(b, a);
		ac.subVectors(c, a);
		total += ab.cross(ac).length() * 0.5;
		prefix[t] = total;
	}
	if (total < 1e-10) return null;

	const pickTriangle = (r) => {
		let lo = 0;
		let hi = triCount - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (prefix[mid] < r) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	};

	const positions = new Float32Array(count * 3);
	const normals = new Float32Array(count * 3);
	const seeds = new Float32Array(count);

	for (let i = 0; i < count; i += 1) {
		const t = pickTriangle(hash01(i * 3.17) * total);
		const i0 = indexed ? indexed.getX(t * 3) : t * 3;
		const i1 = indexed ? indexed.getX(t * 3 + 1) : t * 3 + 1;
		const i2 = indexed ? indexed.getX(t * 3 + 2) : t * 3 + 2;
		a.fromBufferAttribute(pos, i0);
		b.fromBufferAttribute(pos, i1);
		c.fromBufferAttribute(pos, i2);

		let u = hash01(i * 5.91 + 1.3);
		let v = hash01(i * 9.27 + 2.1);
		if (u + v > 1) {
			u = 1 - u;
			v = 1 - v;
		}
		/** barycentric: (1-u-v)A + uB + vC */
		p.copy(a)
			.multiplyScalar(1 - u - v)
			.addScaledVector(b, u)
			.addScaledVector(c, v);
		p.applyMatrix4(mw);

		ab.subVectors(b, a);
		ac.subVectors(c, a);
		n.copy(ab).cross(ac).applyMatrix3(normalMatrix).normalize();
		if (n.lengthSq() < 1e-8) n.set(0, 1, 0);

		positions[i * 3] = p.x;
		positions[i * 3 + 1] = p.y;
		positions[i * 3 + 2] = p.z;
		normals[i * 3] = n.x;
		normals[i * 3 + 1] = n.y;
		normals[i * 3 + 2] = n.z;
		seeds[i] = hash01(i * 13.7 + 0.4);
	}

	return { positions, normals, seeds, count };
}

function yieldParticleBreath() {
	return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * @param {THREE.Mesh | THREE.Mesh[] | null} sourceMeshes
 *   NutBodyMain and/or all NutParts — sampled across every mesh.
 * @param {{ count?: number, color?: string, pointSize?: number }} [opts]
 */
export async function createBelkaShellParticles(sourceMeshes, opts = {}) {
	const count = Math.max(200, Math.round(opts.count ?? 3200));
	const color = opts.color ?? "#8a5a32";
	const pointSize = opts.pointSize ?? 0.055;

	const meshes = (Array.isArray(sourceMeshes) ? sourceMeshes : [sourceMeshes]).filter(
		(m) => m?.isMesh,
	);

	if (!meshes.length) {
		return {
			root: new THREE.Group(),
			setProgress() {},
			update() {},
			dispose() {},
		};
	}

	/** Spread samples across all shell pieces so one cell doesn't steal the cloud. */
	const perMesh = Math.max(40, Math.ceil(count / meshes.length));
	const chunks = [];
	let total = 0;
	for (let mi = 0; mi < meshes.length; mi += 1) {
		const sampled = sampleMeshSurface(meshes[mi], perMesh);
		if (sampled) {
			chunks.push(sampled);
			total += sampled.count;
		}
		/** Surface sampling is CPU-heavy — breathe so the preloader stays live. */
		if (mi < meshes.length - 1) {
			await yieldParticleBreath();
		}
	}
	if (!total) {
		return {
			root: new THREE.Group(),
			setProgress() {},
			update() {},
			dispose() {},
		};
	}

	const positions = new Float32Array(total * 3);
	const normals = new Float32Array(total * 3);
	const seeds = new Float32Array(total);
	let o = 0;
	for (const chunk of chunks) {
		positions.set(chunk.positions, o * 3);
		normals.set(chunk.normals, o * 3);
		seeds.set(chunk.seeds, o);
		o += chunk.count;
	}

	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geo.setAttribute("aNormal", new THREE.BufferAttribute(normals, 3));
	geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

	const map = createSoftDiscTexture();
	const mat = new THREE.ShaderMaterial({
		uniforms: {
			uColor: { value: new THREE.Color(color) },
			uMap: { value: map },
			uTime: { value: 0 },
			uBurst: { value: 0 },
			uOpacity: { value: 1 },
			uPointSize: { value: pointSize },
		},
		transparent: true,
		depthWrite: false,
		depthTest: true,
		blending: THREE.NormalBlending,
		toneMapped: false,
		vertexShader: /* glsl */ `
			attribute vec3 aNormal;
			attribute float aSeed;
			uniform float uTime;
			uniform float uBurst;
			uniform float uPointSize;
			varying float vAlpha;
			varying float vSeed;

			void main() {
				vSeed = aSeed;
				float b = clamp(uBurst, 0.0, 1.0);
				/** Scatter mostly outward + slight lift / gravity. */
				vec3 outN = normalize(aNormal + vec3(0.0, 0.15, 0.0));
				float spread = (0.35 + aSeed * 0.9) * b;
				vec3 pos = position
					+ outN * spread * 0.55
					+ vec3(
						sin(aSeed * 40.0 + uTime * 2.0) * 0.02,
						b * b * (0.08 + aSeed * 0.2),
						cos(aSeed * 33.0 + uTime * 1.6) * 0.02
					) * b;

				vec4 mv = modelViewMatrix * vec4(pos, 1.0);
				gl_Position = projectionMatrix * mv;
				float sizeAtten = uPointSize * (180.0 / max(0.1, -mv.z));
				gl_PointSize = clamp(sizeAtten * (1.0 - b * 0.55), 1.0, 48.0);
				vAlpha = 1.0 - smoothstep(0.35, 1.0, b);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform sampler2D uMap;
			uniform float uOpacity;
			varying float vAlpha;
			varying float vSeed;

			void main() {
				vec4 tex = texture2D(uMap, gl_PointCoord);
				float a = tex.a * vAlpha * uOpacity;
				if (a < 0.02) discard;
				vec3 col = mix(uColor * 0.55, uColor * 1.15, vSeed);
				col *= tex.rgb;
				gl_FragColor = vec4(col, a);
			}
		`,
	});

	const points = new THREE.Points(geo, mat);
	points.name = "BelkaShellParticles";
	points.frustumCulled = false;
	points.renderOrder = 2;

	const root = new THREE.Group();
	root.name = "BelkaShellParticleRoot";
	root.add(points);

	return {
		root,
		points,
		/**
		 * @param {{ burst?: number, opacity?: number }} state
		 * burst 0 = closed shell cover, 1 = fully scattered
		 */
		setProgress(state = {}) {
			if (state.burst != null) mat.uniforms.uBurst.value = THREE.MathUtils.clamp(state.burst, 0, 1);
			if (state.opacity != null) mat.uniforms.uOpacity.value = THREE.MathUtils.clamp(state.opacity, 0, 1);
			const op = mat.uniforms.uOpacity.value;
			const burst = mat.uniforms.uBurst.value;
			points.visible = op > 0.02 && burst < 0.98;
		},
		update(time) {
			mat.uniforms.uTime.value = time;
		},
		dispose() {
			geo.dispose();
			mat.dispose();
			map.dispose();
		},
	};
}
