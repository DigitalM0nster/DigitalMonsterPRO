import * as THREE from "three";
import {
	ABOUT_DISSOLVE_GLSL,
	applyAboutDissolveConfig,
	createAboutDissolveUniforms,
} from "./aboutDissolveShader.js";

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _localCenter = new THREE.Vector3();
const _worldCenter = new THREE.Vector3();
const _heartCenter = new THREE.Vector3();
const _outwardWorld = new THREE.Vector3();
const _outwardLocal = new THREE.Vector3();
const _thickLocal = new THREE.Vector3();
const _invWorld = new THREE.Matrix4();
const _normal = new THREE.Vector3();

/**
 * Bake per-vertex `aRib`: 1 on thickness edges, 0 on outer/inner faces.
 * Face = normal aligned with heart-outward and/or plate thickness (AABB).
 */
export function bakeOuterCellRibAttribute(mesh, modelRoot = null) {
	const geom = mesh?.geometry;
	if (!geom?.attributes?.normal) return;

	mesh.updateWorldMatrix(true, false);
	if (!geom.boundingBox) geom.computeBoundingBox();
	_box.copy(geom.boundingBox);
	_box.getCenter(_localCenter);
	_box.getSize(_size);
	_worldCenter.copy(_localCenter).applyMatrix4(mesh.matrixWorld);

	if (modelRoot) {
		modelRoot.getWorldPosition(_heartCenter);
	} else {
		_heartCenter.set(0, 0, 0);
	}

	_outwardWorld.copy(_worldCenter).sub(_heartCenter);
	if (_outwardWorld.lengthSq() < 1e-8) {
		_outwardWorld.set(0, 0, 1);
	} else {
		_outwardWorld.normalize();
	}

	_invWorld.copy(mesh.matrixWorld).invert();
	_outwardLocal.copy(_outwardWorld).transformDirection(_invWorld).normalize();

	/** Thinnest local AABB axis ≈ plate thickness. */
	if (_size.x <= _size.y && _size.x <= _size.z) _thickLocal.set(1, 0, 0);
	else if (_size.y <= _size.x && _size.y <= _size.z) _thickLocal.set(0, 1, 0);
	else _thickLocal.set(0, 0, 1);

	const normals = geom.getAttribute("normal");
	const rib = new Float32Array(normals.count);
	let ribCount = 0;
	for (let i = 0; i < normals.count; i += 1) {
		_normal.set(normals.getX(i), normals.getY(i), normals.getZ(i)).normalize();
		const faceAlign = Math.max(
			Math.abs(_normal.dot(_outwardLocal)),
			Math.abs(_normal.dot(_thickLocal)),
		);
		/** Hard cut: faces clean; only near-perpendicular normals = ribs. */
		const isRib = faceAlign < 0.62;
		rib[i] = isRib ? 1 : 0;
		if (isRib) ribCount += 1;
	}

	/**
	 * If almost everything classified as rib, normals/axes are inverted — flip.
	 */
	if (ribCount > normals.count * 0.78) {
		for (let i = 0; i < rib.length; i += 1) rib[i] = 1 - rib[i];
	}

	geom.setAttribute("aRib", new THREE.BufferAttribute(rib, 1));
	geom.userData.aboutRibBaked = true;
}

/**
 * OUTER_cell* — clean face plates; sharp angular fibers only on baked ribs.
 */
export function createAboutOuterCellMaterial(cfg = {}) {
	const uniforms = {
		uColor: { value: new THREE.Color(cfg.color ?? "#070c14") },
		uSheenColor: { value: new THREE.Color(cfg.sheenColor ?? "#1a3348") },
		uRimColor: { value: new THREE.Color(cfg.rimColor ?? "#5ee7ff") },
		uFiberColor: { value: new THREE.Color(cfg.fiberColor ?? "#7adfff") },
		uRimPower: { value: cfg.rimPower ?? 2.8 },
		uRimIntensity: { value: cfg.rimIntensity ?? 0.85 },
		uSheen: { value: cfg.sheen ?? 0.45 },
		/** Same micro-scale as the accidental heartBody rib look. */
		uFiberScale: { value: cfg.fiberScale ?? 56 },
		uFiberDensity: { value: cfg.fiberDensity ?? 0.55 },
		uFiberIntensity: { value: cfg.fiberIntensity ?? 4.2 },
		uTime: { value: 0 },
		...createAboutDissolveUniforms(cfg.dissolve ?? {}),
	};

	const material = new THREE.ShaderMaterial({
		uniforms,
		transparent: true,
		depthWrite: true,
		depthTest: true,
		side: THREE.DoubleSide,
		toneMapped: false,
		blending: THREE.NormalBlending,
		/** Missing aRib → treat as face (no fibers). */
		defaultAttributeValues: {
			aRib: [0],
		},
		vertexShader: /* glsl */ `
			attribute float aRib;

			varying vec3 vWorldNormal;
			varying vec3 vLocalNormal;
			varying vec3 vWorldPos;
			varying vec3 vLocalPos;
			varying float vRib;

			void main() {
				vRib = aRib;
				vLocalPos = position;
				vLocalNormal = normalize(normal);
				vec4 worldPos = modelMatrix * vec4(position, 1.0);
				vWorldPos = worldPos.xyz;
				vWorldNormal = normalize(mat3(modelMatrix) * normal);
				gl_Position = projectionMatrix * viewMatrix * worldPos;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform vec3 uSheenColor;
			uniform vec3 uRimColor;
			uniform vec3 uFiberColor;
			uniform float uRimPower;
			uniform float uRimIntensity;
			uniform float uSheen;
			uniform float uFiberScale;
			uniform float uFiberDensity;
			uniform float uFiberIntensity;
			uniform float uTime;

			varying vec3 vWorldNormal;
			varying vec3 vLocalNormal;
			varying vec3 vWorldPos;
			varying vec3 vLocalPos;
			varying float vRib;

			float hash21(vec2 p) {
				p = fract(p * vec2(123.34, 456.21));
				p += dot(p, p + 45.32);
				return fract(p.x * p.y);
			}

			/**
			 * Green-arrow look: irregular needle clusters — NOT axis-aligned columns.
			 * Short random-angle shards + sparse dots, broken periodicity.
			 */
			float irregularFibers(vec2 uv, float scale, float density) {
				/** Break vertical striping: warp + per-tile rotation. */
				vec2 warp = uv * scale;
				warp += vec2(
					hash21(floor(warp.yx * 0.37) + 2.1) - 0.5,
					hash21(floor(warp.xy * 0.29) + 7.4) - 0.5
				) * 1.35;

				vec2 cell = floor(warp);
				vec2 f = fract(warp) - 0.5;
				float h = hash21(cell);
				float h2 = hash21(cell + 19.7);
				float h3 = hash21(cell + 41.3);

				/** Cluster gate — empty tiles, dense clumps (like top fragments). */
				float cluster = step(1.0 - density * 0.85, h) * step(0.25, h2 + h3);

				/** Random angle needle (not grid-aligned). */
				float ang = h2 * 6.2831853;
				float ca = cos(ang);
				float sa = sin(ang);
				vec2 r = vec2(ca * f.x - sa * f.y, sa * f.x + ca * f.y);
				float halfLen = mix(0.08, 0.28, h3);
				float halfWid = mix(0.012, 0.035, h);
				float needle = step(abs(r.x), halfLen) * step(abs(r.y), halfWid);

				/** Second crossed shard at another angle. */
				float ang2 = h3 * 6.2831853 + 1.1;
				float ca2 = cos(ang2);
				float sa2 = sin(ang2);
				vec2 r2 = vec2(ca2 * f.x - sa2 * f.y, sa2 * f.x + ca2 * f.y);
				float needle2 = step(abs(r2.x), halfLen * 0.65) * step(abs(r2.y), halfWid * 0.9)
					* step(0.45, h2);

				/** Bright micro-dots offset inside the cell. */
				vec2 dotOff = vec2(h, h2) - 0.5;
				float micro = step(length(f - dotOff * 0.35), mix(0.03, 0.07, h3))
					* step(0.35, h);

				return cluster * max(max(needle, needle2), micro);
			}

			${ABOUT_DISSOLVE_GLSL}

			void main() {
				vec3 N = normalize(vWorldNormal);
				vec3 V = normalize(cameraPosition - vWorldPos);
				float ndotv = clamp(abs(dot(N, V)), 0.0, 1.0);
				float fresnel = pow(1.0 - ndotv, uRimPower);

				/** Baked rib weight only — faces get zero fibers. */
				float ribMask = step(0.5, vRib);

				vec3 L = normalize(vec3(0.35, 0.85, 0.4));
				float ndotl = clamp(dot(N, L), 0.0, 1.0);
				float sheen = pow(ndotl, 28.0) * uSheen;

				vec3 col = uColor;
				col = mix(col, uSheenColor, 0.08 + ndotl * 0.12);
				col += uSheenColor * sheen * 0.55;
				col += uRimColor * fresnel * uRimIntensity * 0.28 * (1.0 - ribMask);

				vec2 plateUv = vec2(
					atan(vLocalPos.z, vLocalPos.x) * 0.3183 + 0.5,
					vLocalPos.y * 0.55 + length(vLocalPos.xz) * 0.25 + 0.5
				);

				if (ribMask > 0.5) {
					/**
					 * Triplanar-ish local UV — avoid atan/Y columns on vertical ribs.
					 */
					vec3 Lp = vLocalPos;
					vec3 an = abs(normalize(vLocalNormal));
					vec2 uvA = Lp.zy;
					vec2 uvB = Lp.xz;
					vec2 uvC = Lp.xy;
					float wA = an.x * an.x;
					float wB = an.y * an.y;
					float wC = an.z * an.z;
					float wSum = max(1e-4, wA + wB + wC);
					vec2 fiberUv = (uvA * wA + uvB * wB + uvC * wC) / wSum;
					fiberUv += hash21(floor(Lp.xy * 3.0 + Lp.z * 2.0)) * 0.15;
					plateUv = fiberUv;

					float f1 = irregularFibers(fiberUv, uFiberScale, uFiberDensity);
					float f2 = irregularFibers(fiberUv.yx * 1.13 + 0.37, uFiberScale * 1.35, uFiberDensity * 0.8);
					float fibers = max(f1, f2 * 0.75);
					col += uFiberColor * fibers * uFiberIntensity;
					col += vec3(0.85, 0.97, 1.0) * fibers * uFiberIntensity * 0.55;
				}

				/** Stable surface UV — fiber mapping must not scramble hexTransition tiling. */
				vec2 dissolveUv = vec2(
					atan(vLocalPos.z, vLocalPos.x) * 0.3183 + 0.5,
					vLocalPos.y * 0.55 + length(vLocalPos.xz) * 0.25 + 0.5
				);
				vec2 dissolve = aboutDissolveSample(dissolveUv, vLocalPos, uTime);
				col += aboutDissolveGlow(uRimColor, dissolve.y);
				float alpha = dissolve.x;
				if (alpha < 0.004) discard;

				gl_FragColor = vec4(col, alpha);
			}
		`,
	});

	material.userData.isAboutOuterCell = true;
	material.userData.uniforms = uniforms;

	material.userData.applyConfig = (next) => {
		if (!next) return;
		if (next.color != null) uniforms.uColor.value.set(next.color);
		if (next.sheenColor != null) uniforms.uSheenColor.value.set(next.sheenColor);
		if (next.rimColor != null) uniforms.uRimColor.value.set(next.rimColor);
		if (next.fiberColor != null) uniforms.uFiberColor.value.set(next.fiberColor);
		if (next.rimPower != null) uniforms.uRimPower.value = next.rimPower;
		if (next.rimIntensity != null) uniforms.uRimIntensity.value = next.rimIntensity;
		if (next.sheen != null) uniforms.uSheen.value = next.sheen;
		if (next.fiberScale != null) uniforms.uFiberScale.value = next.fiberScale;
		if (next.fiberDensity != null) uniforms.uFiberDensity.value = next.fiberDensity;
		if (next.fiberIntensity != null) uniforms.uFiberIntensity.value = next.fiberIntensity;
		if (next.dissolve) applyAboutDissolveConfig(uniforms, next.dissolve);
	};

	material.userData.setTime = (elapsed) => {
		uniforms.uTime.value = elapsed;
	};

	return material;
}
