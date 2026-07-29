import * as THREE from "three";

/**
 * Futuristic Belka crystal — dark body, electric rim, dual shell, facet fire.
 * No MeshPhysical transmission.
 */

export const belkaEmeraldTuneDefaults = {
	coreColor: "#00aaff",
	midColor: "#01dcf9",
	rimColor: "#00fbff",
	sparkleColor: "#ffffff",
	fireColor: "#00ccff",
	opacity: 0.9,
	fresnelPower: 2.35,
	fresnelStrength: 1.55,
	internalDepth: 0.9,
	facetSharp: 1,
	specularPower: 280,
	specularStrength: 2.2,
	sparkleStrength: 1.85,
	iridescence: 0.45,
	dispersion: 0.32,
	causticStrength: 0.38,
	glowBoost: 1.08,
	innerGlow: 0.9,
	scanStrength: 0,
	edgeEnergy: 0.7,
	parallax: 0.4,
	reflectStrength: 1.2,
};

export const belkaEmeraldTune = { ...belkaEmeraldTuneDefaults };

export function resetBelkaEmeraldTune() {
	Object.assign(belkaEmeraldTune, belkaEmeraldTuneDefaults);
}

Object.assign(belkaEmeraldTune, belkaEmeraldTuneDefaults);

/** One shared studio matcap (full 256² — 128 looked soft/cheap). */
let _studioMatcap = null;

/** High-contrast studio matcap — sharp white reflections like cut glass. */
function createStudioMatcap() {
	if (_studioMatcap) return _studioMatcap;
	const size = 256;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	const img = ctx.createImageData(size, size);
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			const u = (x + 0.5) / size;
			const v = (y + 0.5) / size;
			const dx = u * 2 - 1;
			const dy = v * 2 - 1;
			const rr = Math.sqrt(dx * dx + dy * dy);
			const edge = Math.max(0, 1 - rr);
			/** Dark studio void — reflections read as bright flashes. */
			let r = 6 * edge;
			let g = 14 * edge;
			let b = 16 * edge;
			/** Primary hot specular (sharp). */
			const key = Math.exp(-((dx - 0.28) ** 2 * 55 + (dy - 0.42) ** 2 * 70));
			r += key * 255;
			g += key * 255;
			b += key * 255;
			/** Secondary white flash. */
			const key2 = Math.exp(-((dx + 0.15) ** 2 * 90 + (dy - 0.55) ** 2 * 110));
			r += key2 * 200;
			g += key2 * 210;
			b += key2 * 220;
			/** Soft cool window. */
			const win = Math.exp(-((dx + 0.5) ** 2 * 12 + (dy + 0.05) ** 2 * 8));
			r += win * 40;
			g += win * 110;
			b += win * 140;
			/** Thin horizon strip. */
			const band = Math.pow(Math.max(0, 1 - Math.abs(dy - 0.05) * 9), 14) * edge;
			r += band * 90;
			g += band * 160;
			b += band * 170;
			/** Rim light ring. */
			const rim = Math.pow(Math.max(0, 1 - Math.abs(rr - 0.82) * 8), 4);
			r += rim * 50;
			g += rim * 120;
			b += rim * 130;
			const i = (y * size + x) * 4;
			img.data[i] = Math.min(255, r);
			img.data[i + 1] = Math.min(255, g);
			img.data[i + 2] = Math.min(255, b);
			img.data[i + 3] = 255;
		}
	}
	ctx.putImageData(img, 0, 0);
	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.needsUpdate = true;
	_studioMatcap = tex;
	return tex;
}

const VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vLocalPos;
varying vec3 vViewNormal;
varying vec3 vReflect;

void main() {
	vec4 worldPos = modelMatrix * vec4(position, 1.0);
	vLocalPos = position;
	vNormal = normalize(mat3(modelMatrix) * normal);
	vViewNormal = normalize(mat3(viewMatrix) * mat3(modelMatrix) * normal);
	vViewDir = normalize(cameraPosition - worldPos.xyz);
	vReflect = reflect(-vViewDir, vNormal);
	gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uCoreColor;
uniform vec3 uMidColor;
uniform vec3 uRimColor;
uniform vec3 uSparkleColor;
uniform vec3 uFireColor;
uniform float uOpacity;
uniform float uFresnelPower;
uniform float uFresnelStrength;
uniform float uInternalDepth;
uniform float uFacetSharp;
uniform float uSpecularPower;
uniform float uSpecularStrength;
uniform float uSparkleStrength;
uniform float uIridescence;
uniform float uDispersion;
uniform float uCausticStrength;
uniform float uGlowBoost;
uniform float uInnerGlow;
uniform float uScanStrength;
uniform float uEdgeEnergy;
uniform float uParallax;
uniform float uReflectStrength;
uniform float uTime;
uniform vec3 uKeyDir;
uniform vec3 uFillDir;
uniform vec3 uRimDir;
uniform sampler2D uMatcap;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vLocalPos;
varying vec3 vViewNormal;
varying vec3 vReflect;

float hash31(vec3 p) {
	p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.23));
	p += dot(p, p.yzx + 19.19);
	return fract(p.x * p.y * p.z);
}

void main() {
	vec3 n = normalize(vNormal);
	vec3 v = normalize(vViewDir);
	vec3 r = normalize(vReflect);
	vec3 keyDir = normalize(uKeyDir);
	vec3 fillDir = normalize(uFillDir);
	vec3 rimL = normalize(uRimDir);

	float facetId = hash31(floor(n * (10.0 + uFacetSharp * 12.0) + 1e-3));

	float ndotv = max(dot(n, v), 0.0);
	float fresnel = pow(1.0 - ndotv, uFresnelPower);
	float fresnelSoft = pow(1.0 - ndotv, uFresnelPower * 0.48);

	/** Parallax interior — fake depth inside the cut. */
	vec3 parallaxPos = vLocalPos - v * (uParallax * (1.0 - ndotv) * 0.35);

	float depth = mix(1.0 - uInternalDepth, 1.0, ndotv);
	vec3 body = mix(uCoreColor, uMidColor * 0.5, depth);
	body = mix(body, uMidColor * 0.7, facetId * 0.22);

	/** Soft internal depth — no grid. */
	vec3 refr = refract(-v, n, 0.62);
	float swirl = sin(dot(parallaxPos + refr * 0.25, vec3(3.2, 4.1, 2.7)) + uTime * 0.35);
	body += uMidColor * swirl * 0.05 * uInnerGlow;

	/** Soft mote sparkles (hash points, not voxel squares). */
	float mote = hash31(parallaxPos * 11.0 + vec3(uTime * 0.15));
	mote = pow(mote, 18.0);
	body += uSparkleColor * mote * 0.55 * uSparkleStrength;
	float mote2 = hash31(parallaxPos * 19.0 - vec3(uTime * 0.22, 0.4, 0.1));
	mote2 = pow(mote2, 22.0);
	body += uFireColor * mote2 * 0.35 * uSparkleStrength;

	float radial = length(parallaxPos);
	float core = exp(-radial * radial * 5.5) * uInnerGlow;
	body += uMidColor * core * 0.45;
	body += uFireColor * core * 0.18;

	float key = max(dot(n, keyDir), 0.0);
	float fill = max(dot(n, fillDir), 0.0);
	float rimLit = pow(max(dot(n, rimL), 0.0), 1.8);
	body *= 0.32 + key * 0.72 + fill * 0.28;
	body += uFireColor * rimLit * uEdgeEnergy * 0.18;

	/** Matcap = primary “environment” reflection (must read clearly). */
	vec3 vn = normalize(vViewNormal);
	vec2 muv = vn.xy * 0.5 + 0.5;
	vec3 matcap = texture2D(uMatcap, muv).rgb;
	/** Also sample reflection-dir matcap for extra bounce. */
	vec3 rv = normalize(mat3(viewMatrix) * r);
	vec2 ruv = rv.xy * 0.5 + 0.5;
	vec3 matcapR = texture2D(uMatcap, ruv).rgb;
	vec3 reflection = matcap * 0.65 + matcapR * 0.55;
	float reflMix = (0.55 + fresnel * 0.4) * uReflectStrength;
	body = mix(body, body * 0.25 + reflection, clamp(reflMix, 0.0, 0.92));
	/** Hot specular flashes on facets (white glass hits). */
	body += reflection * reflection * fresnel * 0.45 * uReflectStrength;

	/** Chromatic rim. */
	vec3 chroma = vec3(pow(fresnel, 1.3), pow(fresnel, 0.85), pow(fresnel, 0.5));
	vec3 rimCol = mix(uMidColor, uRimColor, fresnelSoft);
	rimCol = mix(rimCol, uSparkleColor, fresnel * fresnel);
	body = mix(body, rimCol, fresnel * uIridescence);
	body += chroma * uFireColor * uDispersion * fresnel;

	/** Cut-glass specular lobes. */
	vec3 h1 = normalize(keyDir + v);
	vec3 h2 = normalize(fillDir + v);
	float spec1 = pow(max(dot(n, h1), 0.0), uSpecularPower) * uSpecularStrength;
	float spec2 = pow(max(dot(n, h2), 0.0), uSpecularPower * 0.4) * uSpecularStrength * 0.45;
	float specHot = pow(max(dot(n, h1), 0.0), uSpecularPower * 3.2) * uSpecularStrength * 2.1;
	/** Reflection-based flash. */
	float reflFlash = pow(max(dot(r, keyDir), 0.0), 48.0) * 1.4;

	float twinkle = 0.55 + 0.45 * sin(uTime * (4.0 + facetId * 9.0) + facetId * 55.0);
	float spark = smoothstep(0.8, 0.995, spec1 + specHot * 0.4) * twinkle * uSparkleStrength;

	float caustic = sin(dot(n, vec3(1.4, 2.1, 0.9)) * 4.2 - uTime * 1.4);
	caustic = pow(max(caustic, 0.0), 3.2) * uCausticStrength * (0.35 + fresnelSoft);

	vec3 col = body;
	col += uRimColor * fresnel * uFresnelStrength;
	col += vec3(spec1 + spec2 + reflFlash);
	col += uSparkleColor * (specHot * 1.35 + spark * 1.8);
	col += uFireColor * caustic;
	col *= uGlowBoost;

	float alpha = mix(uOpacity * 0.78, 0.97, fresnel * 0.75 + spark * 0.12);
	gl_FragColor = vec4(col, alpha);
}
`;

/**
 * @param {Partial<typeof belkaEmeraldTuneDefaults>} [overrides]
 * @param {THREE.Texture} [matcap]
 */
export function createBelkaEmeraldMaterial(overrides = {}, matcap = null) {
	const tune = { ...belkaEmeraldTuneDefaults, ...belkaEmeraldTune, ...overrides };
	const map = matcap ?? createStudioMatcap();
	const uniforms = {
		uCoreColor: { value: new THREE.Color(tune.coreColor) },
		uMidColor: { value: new THREE.Color(tune.midColor) },
		uRimColor: { value: new THREE.Color(tune.rimColor) },
		uSparkleColor: { value: new THREE.Color(tune.sparkleColor) },
		uFireColor: { value: new THREE.Color(tune.fireColor) },
		uOpacity: { value: tune.opacity },
		uFresnelPower: { value: tune.fresnelPower },
		uFresnelStrength: { value: tune.fresnelStrength },
		uInternalDepth: { value: tune.internalDepth },
		uFacetSharp: { value: tune.facetSharp },
		uSpecularPower: { value: tune.specularPower },
		uSpecularStrength: { value: tune.specularStrength },
		uSparkleStrength: { value: tune.sparkleStrength },
		uIridescence: { value: tune.iridescence },
		uDispersion: { value: tune.dispersion },
		uCausticStrength: { value: tune.causticStrength },
		uGlowBoost: { value: tune.glowBoost },
		uInnerGlow: { value: tune.innerGlow },
		uScanStrength: { value: tune.scanStrength },
		uEdgeEnergy: { value: tune.edgeEnergy },
		uParallax: { value: tune.parallax },
		uReflectStrength: { value: tune.reflectStrength },
		uTime: { value: 0 },
		uKeyDir: { value: new THREE.Vector3(0.5, 0.85, 0.25).normalize() },
		uFillDir: { value: new THREE.Vector3(-0.55, 0.2, 0.7).normalize() },
		uRimDir: { value: new THREE.Vector3(0.15, -0.2, 0.95).normalize() },
		uMatcap: { value: map },
	};

	const material = new THREE.ShaderMaterial({
		uniforms,
		vertexShader: VERTEX,
		fragmentShader: FRAGMENT,
		transparent: true,
		depthWrite: true,
		depthTest: true,
		toneMapped: false,
		side: THREE.FrontSide,
	});
	material.userData.belkaEmerald = true;
	material.userData.matcap = map;
	return material;
}

/** Inner shell — BackSide, darker absorption for “thickness”. */
export function createBelkaEmeraldInnerMaterial(matcap) {
	return createBelkaEmeraldMaterial(
		{
			coreColor: "#01140c",
			midColor: "#087a48",
			rimColor: "#7dffb8",
			opacity: 0.5,
			fresnelStrength: 1.0,
			glowBoost: 0.8,
			sparkleStrength: 0.45,
			scanStrength: 0,
			innerGlow: 0.5,
			causticStrength: 0.1,
		},
		matcap,
	);
}

export function createBelkaEmeraldCoreMaterial() {
	return new THREE.ShaderMaterial({
		uniforms: {
			uColor: { value: new THREE.Color("#4dffc0") },
			uHot: { value: new THREE.Color("#f2fffb") },
			uTime: { value: 0 },
			uIntensity: { value: 1.35 },
		},
		transparent: true,
		depthWrite: false,
		toneMapped: false,
		blending: THREE.AdditiveBlending,
		side: THREE.FrontSide,
		vertexShader: /* glsl */ `
			varying vec3 vN; varying vec3 vV; varying vec3 vL;
			void main() {
				vec4 wp = modelMatrix * vec4(position, 1.0);
				vL = position;
				vN = normalize(mat3(modelMatrix) * normal);
				vV = normalize(cameraPosition - wp.xyz);
				gl_Position = projectionMatrix * viewMatrix * wp;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor, uHot;
			uniform float uTime, uIntensity;
			varying vec3 vN, vV, vL;
			void main() {
				float fres = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.4);
				float pulse = 0.82 + 0.18 * sin(uTime * 3.4 + length(vL) * 10.0);
				float core = exp(-length(vL) * length(vL) * 10.0);
				vec3 col = mix(uColor, uHot, core * 0.85 + fres * 0.4) * uIntensity * pulse;
				/** HDR tip for bloom. */
				col += uHot * core * 1.2;
				float a = (0.4 + core * 0.7 + fres * 0.35) * pulse;
				gl_FragColor = vec4(col, a);
			}
		`,
	});
}

export function createBelkaEmeraldEdgeMaterial() {
	return new THREE.ShaderMaterial({
		uniforms: {
			uColor: { value: new THREE.Color("#c4fff0") },
			uTime: { value: 0 },
			uIntensity: { value: 1.15 },
		},
		transparent: true,
		depthWrite: false,
		depthTest: true,
		toneMapped: false,
		blending: THREE.AdditiveBlending,
		vertexShader: /* glsl */ `
			void main() {
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform float uTime, uIntensity;
			void main() {
				float pulse = 0.75 + 0.25 * sin(uTime * 2.6);
				vec3 col = uColor * uIntensity * pulse;
				col += vec3(1.0) * 0.35 * pulse;
				gl_FragColor = vec4(col, 0.7 * pulse);
			}
		`,
	});
}

export function createBelkaEmeraldAura() {
	const size = 128;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	g.addColorStop(0, "rgba(160,255,230,0.5)");
	g.addColorStop(0.25, "rgba(0,200,150,0.22)");
	g.addColorStop(0.65, "rgba(0,90,70,0.05)");
	g.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, size, size);
	const map = new THREE.CanvasTexture(canvas);
	map.colorSpace = THREE.SRGBColorSpace;

	const mat = new THREE.SpriteMaterial({
		map,
		transparent: true,
		depthWrite: false,
		depthTest: true,
		toneMapped: false,
		blending: THREE.AdditiveBlending,
		opacity: 0.4,
	});
	const sprite = new THREE.Sprite(mat);
	sprite.scale.set(1.35, 1.35, 1);
	sprite.renderOrder = 4;
	return {
		sprite,
		mat,
		map,
		update(time) {
			const pulse = 0.95 + 0.05 * Math.sin(time * 1.5);
			sprite.scale.setScalar(1.25 * pulse);
			mat.opacity = 0.32 + 0.1 * Math.sin(time * 1.2);
		},
		dispose() {
			mat.dispose();
			map.dispose();
		},
	};
}

export function flattenTriangleNormals(geo) {
	const pos = geo.attributes.position;
	if (!geo.attributes.normal) {
		geo.computeVertexNormals();
	}
	const n = geo.attributes.normal;
	for (let i = 0; i < pos.count; i += 3) {
		const ax = pos.getX(i);
		const ay = pos.getY(i);
		const az = pos.getZ(i);
		const bx = pos.getX(i + 1) - ax;
		const by = pos.getY(i + 1) - ay;
		const bz = pos.getZ(i + 1) - az;
		const cx = pos.getX(i + 2) - ax;
		const cy = pos.getY(i + 2) - ay;
		const cz = pos.getZ(i + 2) - az;
		let nx = by * cz - bz * cy;
		let ny = bz * cx - bx * cz;
		let nz = bx * cy - by * cx;
		const len = Math.hypot(nx, ny, nz) || 1;
		nx /= len;
		ny /= len;
		nz /= len;
		n.setXYZ(i, nx, ny, nz);
		n.setXYZ(i + 1, nx, ny, nz);
		n.setXYZ(i + 2, nx, ny, nz);
	}
	n.needsUpdate = true;
	return geo;
}

/**
 * Faceted DROPLET (капля) — tip UP, fat rounded belly, dense crystal facets.
 * Matches Belka reference pear/teardrop gem (not a stubby cut, not a bulb).
 */
export function createBelkaEmeraldGeometry(radius = 0.55) {
	/**
	 * Droplet profile: sharp tip → long taper → widest in lower half → round bottom.
	 * y in ~[-0.68, +0.72], s = radial scale (1 at belly).
	 */
	const rings = [
		{ y: 0.72, s: 0.0 },
		{ y: 0.6, s: 0.16 },
		{ y: 0.46, s: 0.34 },
		{ y: 0.3, s: 0.52 },
		{ y: 0.12, s: 0.72 },
		{ y: -0.05, s: 0.9 },
		{ y: -0.22, s: 1.0 },
		{ y: -0.38, s: 0.92 },
		{ y: -0.5, s: 0.7 },
		{ y: -0.58, s: 0.4 },
		{ y: -0.64, s: 0.12 },
	];

	const segs = 12;
	const sx = radius * 0.92;
	const sy = radius * 1.22;
	const sz = radius * 0.82;
	const positions = [];
	const pushV = (x, y, z) => positions.push(x, y, z);

	const tip = 0;
	pushV(0, rings[0].y * sy, 0);

	const ringVerts = [];
	for (let r = 1; r < rings.length; r += 1) {
		const ring = rings[r];
		const verts = [];
		const rot = r % 2 === 0 ? 0 : Math.PI / segs;
		for (let i = 0; i < segs; i += 1) {
			const a = (i / segs) * Math.PI * 2 + rot;
			verts.push(positions.length / 3);
			pushV(Math.cos(a) * ring.s * sx, ring.y * sy, Math.sin(a) * ring.s * sz);
		}
		ringVerts.push(verts);
	}

	const bottom = positions.length / 3;
	pushV(0, rings[rings.length - 1].y * sy - 0.015 * sy, 0);

	const indices = [];
	const first = ringVerts[0];
	for (let i = 0; i < segs; i += 1) {
		indices.push(tip, first[i], first[(i + 1) % segs]);
	}
	for (let r = 0; r < ringVerts.length - 1; r += 1) {
		const a = ringVerts[r];
		const b = ringVerts[r + 1];
		for (let i = 0; i < segs; i += 1) {
			const i1 = (i + 1) % segs;
			indices.push(a[i], b[i], a[i1]);
			indices.push(a[i1], b[i], b[i1]);
		}
	}
	const last = ringVerts[ringVerts.length - 1];
	for (let i = 0; i < segs; i += 1) {
		indices.push(bottom, last[(i + 1) % segs], last[i]);
	}

	const indexed = new THREE.BufferGeometry();
	indexed.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	indexed.setIndex(indices);
	const geo = indexed.toNonIndexed();
	indexed.dispose();
	return flattenTriangleNormals(geo);
}

/**
 * Full crystal: outer + inner shell + nucleus + edges + aura.
 * @param {THREE.BufferGeometry} [shellGeoIn] authored droplet from GLB
 */
export function createBelkaEmeraldAssembly(shellGeoIn = null) {
	const root = new THREE.Group();
	root.name = "BelkaEmeraldAssembly";
	const disposables = [];
	/** Shared cache — must not dispose on scene teardown. */
	const matcap = createStudioMatcap();

	const shellGeo = shellGeoIn ?? createBelkaEmeraldGeometry(0.58);
	disposables.push(shellGeo);

	const shellMat = createBelkaEmeraldMaterial({}, matcap);
	disposables.push(shellMat);
	const shell = new THREE.Mesh(shellGeo, shellMat);
	shell.name = "BelkaEmerald";
	shell.renderOrder = 6;
	root.add(shell);

	const innerMat = createBelkaEmeraldInnerMaterial(matcap);
	innerMat.side = THREE.BackSide;
	innerMat.depthWrite = false;
	disposables.push(innerMat);
	const inner = new THREE.Mesh(shellGeo, innerMat);
	inner.scale.setScalar(0.92);
	inner.renderOrder = 5;
	root.add(inner);

	const coreGeo = new THREE.OctahedronGeometry(0.12, 0);
	disposables.push(coreGeo);
	const coreMat = createBelkaEmeraldCoreMaterial();
	coreMat.uniforms.uColor.value.set("#2dff8a");
	coreMat.uniforms.uHot.value.set("#eafff2");
	coreMat.uniforms.uIntensity.value = 0.85;
	disposables.push(coreMat);
	const core = new THREE.Mesh(coreGeo, coreMat);
	core.renderOrder = 5;
	root.add(core);

	const edgeGeo = new THREE.EdgesGeometry(shellGeo, 28);
	disposables.push(edgeGeo);
	const edgeMat = createBelkaEmeraldEdgeMaterial();
	disposables.push(edgeMat);
	const edges = new THREE.LineSegments(edgeGeo, edgeMat);
	edges.renderOrder = 7;
	root.add(edges);

	const aura = createBelkaEmeraldAura();
	aura.sprite.position.set(0, 0, -0.04);
	root.add(aura.sprite);
	disposables.push({ dispose: () => aura.dispose() });

	return {
		root,
		shell,
		shellMat,
		innerMat,
		core,
		coreMat,
		edges,
		edgeMat,
		aura,
		setScale(s) {
			const v = Math.max(0.3, s);
			root.scale.setScalar(v);
			aura.sprite.scale.setScalar(1.15 * v);
		},
		update(time) {
			updateBelkaEmeraldTime(shellMat, time);
			updateBelkaEmeraldTime(innerMat, time);
			if (coreMat.uniforms?.uTime) coreMat.uniforms.uTime.value = time;
			if (edgeMat.uniforms?.uTime) edgeMat.uniforms.uTime.value = time;
			aura.update(time);
			core.rotation.y = -time * 0.8;
			core.rotation.x = time * 0.3;
			core.scale.setScalar(0.92 + 0.06 * Math.sin(time * 2.2));
		},
		dispose() {
			for (const d of disposables) d.dispose?.();
		},
	};
}

/**
 * @param {THREE.ShaderMaterial} material
 * @param {Partial<typeof belkaEmeraldTuneDefaults>} tune
 */
export function applyBelkaEmeraldTune(material, tune = belkaEmeraldTune) {
	if (!material?.uniforms) return;
	const u = material.uniforms;
	const setC = (key, val) => {
		if (val != null && u[key]) u[key].value.set(val);
	};
	const setN = (key, val) => {
		if (val != null && u[key]) u[key].value = val;
	};
	setC("uCoreColor", tune.coreColor);
	setC("uMidColor", tune.midColor);
	setC("uRimColor", tune.rimColor);
	setC("uSparkleColor", tune.sparkleColor);
	setC("uFireColor", tune.fireColor);
	setN("uOpacity", tune.opacity);
	setN("uFresnelPower", tune.fresnelPower);
	setN("uFresnelStrength", tune.fresnelStrength);
	setN("uInternalDepth", tune.internalDepth);
	setN("uFacetSharp", tune.facetSharp);
	setN("uSpecularPower", tune.specularPower);
	setN("uSpecularStrength", tune.specularStrength);
	setN("uSparkleStrength", tune.sparkleStrength);
	setN("uIridescence", tune.iridescence);
	setN("uDispersion", tune.dispersion);
	setN("uCausticStrength", tune.causticStrength);
	setN("uGlowBoost", tune.glowBoost);
	setN("uInnerGlow", tune.innerGlow);
	setN("uScanStrength", tune.scanStrength);
	setN("uEdgeEnergy", tune.edgeEnergy);
	setN("uParallax", tune.parallax);
	setN("uReflectStrength", tune.reflectStrength);
}

export function updateBelkaEmeraldTime(material, time) {
	if (material?.uniforms?.uTime) {
		material.uniforms.uTime.value = time;
	}
}
