import * as THREE from "three";

/**
 * Belka nut shell — multi-style shader.
 * Authored maps keep the acorn readable; `uStyle` picks the look.
 * DEV: Belka panel (hotkey 4) → Shell style.
 */

/** @typedef {'classic' | 'obsidian' | 'mercury' | 'ember' | 'ghost' | 'neonCarve'} BelkaShellStyleId */

/** @type {{ id: BelkaShellStyleId, index: number, label: string, blurb: string }[]} */
export const BELKA_SHELL_STYLES = [
	{ id: "classic", index: 0, label: "Classic", blurb: "Authored warm PBR acorn" },
	{ id: "obsidian", index: 1, label: "Obsidian", blurb: "Ceramic black + neon rim / lacquer hat" },
	{ id: "mercury", index: 2, label: "Mercury", blurb: "Liquid chrome metal" },
	{ id: "ember", index: 3, label: "Ember", blurb: "Ash + molten veins / brim glow hat" },
	{ id: "ghost", index: 4, label: "Ghost glass", blurb: "Clean frosted cyan shell" },
	{ id: "neonCarve", index: 5, label: "Neon carve", blurb: "Dark shell, glowing grooves" },
];

/** @type {Record<BelkaShellStyleId, number>} */
export const BELKA_SHELL_STYLE_INDEX = Object.fromEntries(
	BELKA_SHELL_STYLES.map((s) => [s.id, s.index]),
);

/**
 * @param {string | null | undefined} id
 * @returns {BelkaShellStyleId}
 */
export function normalizeBelkaShellStyleId(id) {
	const raw = String(id ?? "").trim();
	if (BELKA_SHELL_STYLE_INDEX[raw] != null) return /** @type {BelkaShellStyleId} */ (raw);
	return "obsidian";
}

/**
 * @param {string | null | undefined} id
 * @returns {number}
 */
export function belkaShellStyleToIndex(id) {
	return BELKA_SHELL_STYLE_INDEX[normalizeBelkaShellStyleId(id)] ?? 1;
}

const SHELL_VERTEX = /* glsl */ `
uniform float uDissolve;
uniform float uTime;
uniform float uDistort;
uniform float uMosaicScale;
uniform float uMeshSize;
uniform vec3 uMeshCenter;

varying vec3 vN;
varying vec3 vV;
varying vec3 vL;
varying vec3 vWorld;
varying vec2 vUv;

float hash31(vec3 p) {
	p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
	vL = position;
	vUv = uv;
	vec3 n = normalize(normal);
	float d = clamp(uDissolve, 0.0, 1.0);

	vec3 npos = (position - uMeshCenter) / max(uMeshSize, 1e-4);
	vec3 cell = floor((npos + 0.5) * uMosaicScale);
	float h = hash31(cell);
	float h2 = hash31(cell + 19.7);

	float pop = smoothstep(0.05, 0.85, d);
	vec3 tangent = normalize(cross(n, vec3(0.0, 1.0, 0.0) + n * 0.01));
	vec3 bitangent = normalize(cross(n, tangent));
	float amp = max(uMeshSize, 1e-4) * 0.045;
	vec3 warp = n * (h * 0.55 + h2 * 0.2)
		+ tangent * ((h2 - 0.5) * 0.4)
		+ bitangent * ((h - 0.5) * 0.35);
	float band = exp(-abs(h - d) * 7.0);
	warp += tangent * sin(uTime * 18.0 + h * 40.0) * band * 0.12;

	vec3 pos = position + warp * amp * pop * uDistort;

	vec4 wp = modelMatrix * vec4(pos, 1.0);
	vWorld = wp.xyz;
	vN = normalize(mat3(modelMatrix) * n);
	vV = normalize(cameraPosition - wp.xyz);
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SHELL_FRAGMENT = /* glsl */ `
uniform int uStyle;
uniform float uPart;
uniform vec3 uGlow;
uniform vec3 uHot;
uniform vec3 uKeyDir;
uniform float uDissolve;
uniform float uOpacity;
uniform float uTime;
uniform float uMosaicScale;
uniform float uMeshSize;
uniform vec3 uMeshCenter;
uniform float uSpec;
uniform float uRoughness;
uniform float uMetalness;
uniform sampler2D uMap;
uniform sampler2D uNormalMap;
uniform sampler2D uRoughnessMap;
uniform float uHasMap;
uniform float uHasNormal;
uniform float uHasRoughnessMap;
uniform float uNormalScale;

varying vec3 vN;
varying vec3 vV;
varying vec3 vL;
varying vec3 vWorld;
varying vec2 vUv;

float hash31(vec3 p) {
	p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

mat3 cotangentFrame(vec3 N, vec3 p, vec2 uv) {
	vec3 dp1 = dFdx(p);
	vec3 dp2 = dFdy(p);
	vec2 duv1 = dFdx(uv);
	vec2 duv2 = dFdy(uv);
	vec3 dp2perp = cross(dp2, N);
	vec3 dp1perp = cross(N, dp1);
	vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
	vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
	float invmax = inversesqrt(max(dot(T, T), dot(B, B)));
	return mat3(T * invmax, B * invmax, N);
}

vec3 applyAuthoredNormal(vec3 N, vec3 worldPos, vec2 uv) {
	vec3 mapN = texture2D(uNormalMap, uv).xyz * 2.0 - 1.0;
	mapN.xy *= uNormalScale;
	return normalize(cotangentFrame(normalize(N), worldPos, uv) * mapN);
}

float sampleRough() {
	float rough = uRoughness;
	if (uHasRoughnessMap > 0.5) {
		rough = texture2D(uRoughnessMap, vUv).g;
	}
	return clamp(rough, 0.04, 1.0);
}

vec3 sampleAlbedo(vec3 fallback) {
	return uHasMap > 0.5 ? texture2D(uMap, vUv).rgb : fallback;
}

float albedoLum(vec3 alb) {
	return dot(alb, vec3(0.299, 0.587, 0.114));
}

struct Surf {
	vec3 n;
	vec3 nFlat;
	vec3 v;
	vec3 albedo;
	float lum;
	float ridge;
	float cavity;
	float micro;
	float brim;
	float rough;
	float ndotv;
	float fresnel;
	float key;
	float wrap;
	float isHat;
};

Surf buildSurf(vec3 nFlat, vec3 v) {
	Surf s;
	s.isHat = step(0.5, uPart);
	s.nFlat = normalize(nFlat);
	s.n = uHasNormal > 0.5 ? applyAuthoredNormal(nFlat, vWorld, vUv) : s.nFlat;
	s.v = v;
	s.albedo = sampleAlbedo(vec3(0.55, 0.38, 0.22));
	s.lum = albedoLum(s.albedo);

	/** Body: albedo ridges. Hat: soft scale micro from normal bend — no blotchy heat. */
	float bodyRidge = smoothstep(0.32, 0.82, s.lum);
	float bodyCavity = 1.0 - smoothstep(0.16, 0.7, s.lum);
	float bend = clamp(1.0 - max(dot(s.n, s.nFlat), 0.0), 0.0, 1.0);
	float hatMicro = smoothstep(0.02, 0.18, bend);
	float hatTone = smoothstep(0.22, 0.78, s.lum);

	s.ridge = mix(bodyRidge, mix(0.25, hatTone, 0.55), s.isHat);
	s.cavity = mix(bodyCavity, mix(0.2, 1.0 - hatTone, 0.35), s.isHat);
	s.micro = mix(bodyRidge * 0.35 + bodyCavity * 0.2, hatMicro, s.isHat);

	float localY = (vL.y - uMeshCenter.y) / max(uMeshSize, 1e-4);
	/** Cap brim / underside — accent ring where hat meets shell. */
	s.brim = mix(0.0, (1.0 - smoothstep(-0.42, 0.12, localY)) * smoothstep(-0.85, -0.2, localY), s.isHat);

	s.rough = sampleRough();
	s.rough = mix(s.rough, clamp(s.rough * 1.2 + 0.08, 0.22, 0.92), s.isHat);
	s.ndotv = max(dot(s.n, s.v), 0.0);
	s.fresnel = pow(1.0 - s.ndotv, mix(2.8, 2.2, s.isHat));
	vec3 keyDir = normalize(uKeyDir);
	s.key = max(dot(s.n, keyDir), 0.0);
	s.wrap = max(dot(s.n, keyDir) * 0.55 + 0.45, 0.0);
	return s;
}

vec3 addSpec(Surf s, vec3 lit, float glossMul, float amtMul, vec3 tint) {
	vec3 keyDir = normalize(uKeyDir);
	vec3 h = normalize(keyDir + s.v);
	float nh = max(dot(s.n, h), 0.0);
	float gloss = mix(140.0, 12.0, s.rough) * glossMul;
	float amt = mix(1.0, 0.1, s.rough) * uSpec * amtMul;
	return lit + tint * pow(nh, gloss) * amt;
}

/** Soft contact AO from cavities — keeps form without blotch. */
float formAo(Surf s) {
	return mix(1.0, 0.62, s.cavity * mix(0.9, 0.45, s.isHat));
}

/** 0 — Classic warm authored PBR. */
vec3 shadeClassic(Surf s) {
	vec3 lit = s.albedo * (0.28 + s.wrap * 0.42 + s.key * 0.45);
	vec3 specCol = mix(vec3(1.0), s.albedo, clamp(uMetalness, 0.0, 1.0));
	lit = addSpec(s, lit, 1.0, 1.0, specCol);
	lit += s.albedo * s.fresnel * (0.03 + (1.0 - s.rough) * 0.04);
	return lit;
}

/**
 * 1 — Obsidian (premium).
 * Body: deep ceramic, ridge sheen, electric rim.
 * Hat: lacquered dome + brim neon ring (no speckled albedo heat).
 */
vec3 shadeObsidian(Surf s) {
	vec3 deep = vec3(0.012, 0.018, 0.028);
	vec3 lift = vec3(0.055, 0.08, 0.1);
	vec3 body = mix(deep, lift, s.wrap * 0.62 + s.key * 0.38);
	body *= formAo(s);

	if (s.isHat < 0.5) {
		/** Body ridges catch soft graphite light. */
		body *= mix(0.88, 1.14, s.ridge);
		body += vec3(0.04, 0.07, 0.09) * s.micro * 0.35;
		body = addSpec(s, body, 1.55, 0.62, vec3(0.45, 0.72, 0.88));
		/** Second cool kick along ridges. */
		body = addSpec(s, body, 3.2, 0.22, uHot);
		float rim = pow(1.0 - s.ndotv, 2.55);
		body += uGlow * rim * (0.72 + s.ridge * 0.4);
		body += uHot * pow(rim, 2.4) * 0.22;
		body += uGlow * s.ridge * 0.07;
		body += uGlow * s.cavity * 0.04;
	} else {
		/** Hat: continuous lacquer — micro only, no ridge blotch. */
		body = mix(body, lift * 1.15, s.key * 0.25);
		body *= mix(1.0, 1.06, s.micro);
		body = addSpec(s, body, 1.15, 0.85, vec3(0.55, 0.78, 0.92));
		body = addSpec(s, body, 2.6, 0.28, uHot);
		float rim = pow(1.0 - s.ndotv, 2.15);
		body += uGlow * rim * 0.85;
		body += uHot * pow(rim, 2.0) * 0.28;
		/** Brim ring — sells the cap as a separate piece. */
		body += uGlow * s.brim * 1.15;
		body += uHot * s.brim * 0.35;
		body += uGlow * s.micro * 0.12;
	}
	return body;
}

/** 2 — Mercury: liquid chrome. */
vec3 shadeMercury(Surf s) {
	vec3 base = mix(vec3(0.12, 0.14, 0.16), vec3(0.55, 0.62, 0.68), s.wrap);
	base = mix(base, vec3(0.75, 0.82, 0.88), s.key * 0.65);
	base *= mix(0.9, 1.12, s.ridge);
	base *= mix(1.0, 0.7, s.cavity * 0.6);
	float streak = pow(abs(s.n.y) * 0.55 + abs(s.n.x) * 0.35, 2.2);
	base += vec3(0.85, 0.95, 1.0) * streak * 0.35;
	base = addSpec(s, base, 2.2, 1.8, vec3(0.95, 0.98, 1.0));
	base += uHot * pow(max(dot(s.n, normalize(uKeyDir + s.v)), 0.0), 180.0) * 1.4;
	base += mix(uGlow, uHot, 0.5) * s.fresnel * 0.45;
	return base;
}

/**
 * 3 — Ember (premium).
 * Body: ash charcoal + molten ridge veins.
 * Hat: slow underglow + brim lava ring (no disco speckles).
 */
vec3 shadeEmber(Surf s) {
	vec3 ash = vec3(0.028, 0.022, 0.02);
	vec3 warm = vec3(0.09, 0.05, 0.035);
	vec3 body = mix(ash, warm, s.wrap * 0.55 + s.key * 0.3);
	body *= formAo(s);

	vec3 heatCool = mix(vec3(1.0, 0.28, 0.04), uGlow, 0.42);
	vec3 heatHot = mix(heatCool, uHot, 0.55);

	if (s.isHat < 0.5) {
		float pulse = 0.78 + 0.22 * sin(uTime * 1.35 + s.lum * 5.5 + vWorld.y * 2.8);
		float vein = pow(s.ridge, 1.85);
		body += heatCool * vein * 0.85 * pulse;
		body += heatHot * pow(s.ridge, 3.2) * 0.55 * pulse;
		body += heatCool * s.cavity * 0.08;
		body = addSpec(s, body, 1.25, 0.75, mix(heatHot, vec3(1.0), 0.25));
		body += uGlow * s.fresnel * 0.42;
		body += heatHot * pow(s.fresnel, 2.0) * 0.18;
	} else {
		/** Hat: soft furnace wash + brim — readable cap, not speckled. */
		float pulse = 0.9 + 0.1 * sin(uTime * 0.9 + vWorld.y * 1.5);
		body = mix(body, warm * 1.2, s.key * 0.2);
		body += heatCool * (0.1 + s.micro * 0.18) * pulse;
		body += heatHot * s.brim * 1.35 * pulse;
		body += heatCool * s.brim * 0.55;
		body = addSpec(s, body, 1.05, 0.7, mix(heatHot, vec3(1.0, 0.9, 0.75), 0.35));
		float rim = pow(1.0 - s.ndotv, 2.0);
		body += heatCool * rim * 0.55;
		body += uGlow * rim * 0.22;
		body += heatHot * pow(rim, 2.2) * 0.12;
	}
	return body;
}

/** 4 — Ghost glass: clean frosted cyan (no scan grid). */
vec3 shadeGhost(Surf s) {
	vec3 body = mix(vec3(0.04, 0.12, 0.16), uGlow * 0.35, s.wrap * 0.4 + s.key * 0.25);
	body *= mix(0.85, 1.1, s.ridge);
	body *= mix(1.0, 0.65, s.cavity * 0.7);
	float frost = pow(1.0 - s.ndotv, 1.6);
	body = mix(body, mix(uGlow, uHot, 0.35), frost * 0.55);
	body += uGlow * s.ridge * 0.22;
	body = addSpec(s, body, 1.6, 0.9, uHot);
	body += uHot * s.fresnel * 0.4;
	body += uGlow * (0.08 + s.cavity * 0.06);
	return body;
}

/** 5 — Neon carve: dark tops, glowing grooves. */
vec3 shadeNeonCarve(Surf s) {
	vec3 body = vec3(0.015, 0.02, 0.028);
	body = mix(body, vec3(0.05, 0.07, 0.09), s.wrap * 0.4);
	body *= mix(1.05, 0.75, s.ridge);
	float groove = pow(s.cavity, 1.35);
	float pulse = 0.75 + 0.25 * sin(uTime * 3.0 + vWorld.y * 8.0);
	body += uGlow * groove * 1.35 * pulse;
	body += uHot * pow(groove, 2.2) * 0.55 * pulse;
	float rimRidge = smoothstep(0.35, 0.55, s.ridge) * (1.0 - smoothstep(0.7, 0.95, s.ridge));
	body += uGlow * rimRidge * 0.25;
	body = addSpec(s, body, 1.2, 0.45, uGlow);
	body += uGlow * s.fresnel * 0.5;
	return body;
}

vec3 shadeByStyle(Surf s) {
	if (uStyle == 0) return shadeClassic(s);
	if (uStyle == 2) return shadeMercury(s);
	if (uStyle == 3) return shadeEmber(s);
	if (uStyle == 4) return shadeGhost(s);
	if (uStyle == 5) return shadeNeonCarve(s);
	return shadeObsidian(s);
}

void main() {
	float d = clamp(uDissolve, 0.0, 1.0);
	float op = clamp(uOpacity, 0.0, 1.0);
	if (op < 0.01) discard;

	vec3 n = normalize(vN);
	vec3 v = normalize(vV);
	Surf s = buildSurf(n, v);
	vec3 lit = shadeByStyle(s);

	float shellAlpha = op;
	if (uStyle == 4) {
		shellAlpha = mix(op * 0.92, min(1.0, op * 1.05), s.fresnel);
	}

	if (d <= 0.001) {
		gl_FragColor = vec4(lit, shellAlpha);
		return;
	}

	vec3 npos = (vL - uMeshCenter) / max(uMeshSize, 1e-4);
	vec3 cell = floor((npos + 0.5) * uMosaicScale);
	float h = hash31(cell);
	float hN = hash31(cell + 3.1);

	float cut = d * 1.18;
	float edge = 0.12 + hN * 0.07;
	float vis = smoothstep(cut - edge, cut + edge * 0.15, h);
	float rim = exp(-abs(h - cut) * 12.0) * smoothstep(0.02, 0.2, d) * (1.0 - smoothstep(0.85, 1.0, d));

	if (vis * shellAlpha < 0.02 && rim < 0.04) discard;

	lit *= mix(1.0, 0.78 + h * 0.3, rim);
	lit += uGlow * (rim * 2.2 + pow(1.0 - max(dot(n, v), 0.0), 2.4) * rim * 1.0);
	lit += uHot * rim * 0.45;

	float alpha = max(vis * shellAlpha, rim * 0.9 * shellAlpha);
	if (alpha < 0.02) discard;

	gl_FragColor = vec4(lit, alpha);
}
`;

const _dummyMap = (() => {
	const data = new Uint8Array([255, 255, 255, 255]);
	const tex = new THREE.DataTexture(data, 1, 1);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.needsUpdate = true;
	return tex;
})();

const _dummyData = (() => {
	const data = new Uint8Array([128, 128, 255, 255]);
	const tex = new THREE.DataTexture(data, 1, 1);
	tex.colorSpace = THREE.NoColorSpace;
	tex.needsUpdate = true;
	return tex;
})();

/**
 * Pull maps from authored GLTF MeshStandardMaterial.
 * @param {THREE.Material | THREE.Material[] | null | undefined} material
 */
export function extractBelkaShellMaps(material) {
	const mat = Array.isArray(material) ? material[0] : material;
	if (!mat) {
		return { map: null, normalMap: null, roughnessMap: null, roughness: 0.7, metalness: 0 };
	}
	return {
		map: mat.map ?? null,
		normalMap: mat.normalMap ?? null,
		roughnessMap: mat.roughnessMap ?? mat.metalnessMap ?? null,
		roughness: Number.isFinite(mat.roughness) ? mat.roughness : 0.7,
		metalness: Number.isFinite(mat.metalness) ? mat.metalness : 0,
	};
}

/**
 * @param {{
 *   map?: THREE.Texture | null,
 *   normalMap?: THREE.Texture | null,
 *   roughnessMap?: THREE.Texture | null,
 *   roughness?: number,
 *   metalness?: number,
 *   normalScale?: number,
 *   mosaicScale?: number,
 *   side?: THREE.Side,
 *   glow?: string,
 *   hot?: string,
 *   style?: BelkaShellStyleId | string,
 *   part?: 'body' | 'hat',
 * }} [opts]
 */
export function createBelkaShellMaterial(opts = {}) {
	const {
		map = null,
		normalMap = null,
		roughnessMap = null,
		roughness = 0.55,
		metalness = 0.15,
		normalScale = 1.2,
		mosaicScale = 14,
		side = THREE.FrontSide,
		glow = "#01dcf9",
		hot = "#c8ffff",
		style = "obsidian",
		part = "body",
	} = opts;

	const isHat = part === "hat";

	const mat = new THREE.ShaderMaterial({
		uniforms: {
			uStyle: { value: belkaShellStyleToIndex(style) },
			uPart: { value: isHat ? 1 : 0 },
			uGlow: { value: new THREE.Color(glow) },
			uHot: { value: new THREE.Color(hot) },
			uKeyDir: { value: new THREE.Vector3(0.55, 0.75, 0.35).normalize() },
			uDissolve: { value: 0 },
			uOpacity: { value: 1 },
			uTime: { value: 0 },
			uDistort: { value: 1 },
			uMosaicScale: { value: mosaicScale },
			uMeshSize: { value: 1 },
			uMeshCenter: { value: new THREE.Vector3() },
			uSpec: { value: isHat ? 1.15 : 1 },
			uRoughness: { value: roughness },
			uMetalness: { value: metalness },
			uMap: { value: _dummyMap },
			uNormalMap: { value: _dummyData },
			uRoughnessMap: { value: _dummyData },
			uHasMap: { value: 0 },
			uHasNormal: { value: 0 },
			uHasRoughnessMap: { value: 0 },
			uNormalScale: { value: normalScale },
		},
		vertexShader: SHELL_VERTEX,
		fragmentShader: SHELL_FRAGMENT,
		transparent: true,
		depthWrite: true,
		side,
		toneMapped: false,
	});

	if (map) {
		map.colorSpace = THREE.SRGBColorSpace;
		map.needsUpdate = true;
		mat.uniforms.uMap.value = map;
		mat.uniforms.uHasMap.value = 1;
	}
	if (normalMap) {
		normalMap.colorSpace = THREE.NoColorSpace;
		normalMap.needsUpdate = true;
		mat.uniforms.uNormalMap.value = normalMap;
		mat.uniforms.uHasNormal.value = 1;
	}
	if (roughnessMap) {
		roughnessMap.colorSpace = THREE.NoColorSpace;
		roughnessMap.needsUpdate = true;
		mat.uniforms.uRoughnessMap.value = roughnessMap;
		mat.uniforms.uHasRoughnessMap.value = 1;
	}

	mat.userData.belkaShellStyle = normalizeBelkaShellStyleId(style);
	mat.userData.belkaShellPart = isHat ? "hat" : "body";
	return mat;
}

/**
 * @param {THREE.ShaderMaterial | null | undefined} mat
 * @param {BelkaShellStyleId | string} styleId
 */
export function setBelkaShellStyle(mat, styleId) {
	if (!mat?.uniforms?.uStyle) return;
	const id = normalizeBelkaShellStyleId(styleId);
	mat.uniforms.uStyle.value = belkaShellStyleToIndex(id);
	mat.userData.belkaShellStyle = id;
}

/**
 * @param {THREE.ShaderMaterial} mat
 * @param {THREE.BufferGeometry} geometry
 */
export function bindBelkaShellMosaic(mat, geometry) {
	if (!mat?.uniforms || !geometry) return;
	geometry.computeBoundingBox();
	const box = geometry.boundingBox;
	if (!box) return;
	const size = new THREE.Vector3();
	const center = new THREE.Vector3();
	box.getSize(size);
	box.getCenter(center);
	mat.uniforms.uMeshCenter.value.copy(center);
	mat.uniforms.uMeshSize.value = Math.max(size.x, size.y, size.z, 1e-4);
}

/**
 * @param {THREE.ShaderMaterial | null | undefined} mat
 * @param {{ dissolve?: number, opacity?: number, time?: number, distort?: number }} [state]
 */
export function applyBelkaShellFx(mat, state = {}) {
	if (!mat?.uniforms) return;
	if (state.dissolve != null) mat.uniforms.uDissolve.value = state.dissolve;
	if (state.opacity != null) mat.uniforms.uOpacity.value = state.opacity;
	if (state.time != null) mat.uniforms.uTime.value = state.time;
	if (state.distort != null) mat.uniforms.uDistort.value = state.distort;
	const d = mat.uniforms.uDissolve.value;
	const op = mat.uniforms.uOpacity.value;
	mat.depthWrite = d < 0.72 && op > 0.2;
	mat.visible = op > 0.01 && d < 0.998;
}
