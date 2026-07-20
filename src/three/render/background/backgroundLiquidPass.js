import * as THREE from "three";
import { backgroundLiquidTune } from "./backgroundLiquidTune.js";

/**
 * Site liquid background — Balatro-style spin paint (Shadertoy XXtBRr / localthunk),
 * adapted: no pixel filter, red → black, site brightness/tint uniforms.
 */
export const backgroundLiquidVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const backgroundLiquidFragmentShader = /* glsl */ `
uniform float liquidScale;
uniform float brightness;
uniform vec3 distortionColor;
uniform vec2 iResolution;
uniform float iTime;
uniform float skipLiquid;

uniform float uSpinRotation;
uniform float uSpinSpeed;
uniform float uContrast;
uniform float uLighting;
uniform float uSpinAmount;
uniform float uSpinEase;
uniform float uPaintZoom;
uniform float uRotate;
uniform vec3 uColour1;
uniform vec3 uColour2;
uniform vec3 uColour3;

varying vec2 vUv;

vec4 balatroEffect(vec2 screenSize, vec2 screenCoords) {
	// Smooth UV — no floor()/PIXEL_FILTER (Balatro pixel look removed).
	vec2 uv = (screenCoords - 0.5 * screenSize) / length(screenSize);
	float uvLen = length(uv);

	float speed = uSpinRotation * uSpinEase * 0.2;
	if (uRotate > 0.5) {
		speed *= iTime;
	}
	speed += 302.2;
	float newAngle =
		atan(uv.y, uv.x) + speed - uSpinEase * 20.0 * (uSpinAmount * uvLen + (1.0 - uSpinAmount));
	vec2 mid = (screenSize / length(screenSize)) * 0.5;
	uv = vec2(uvLen * cos(newAngle) + mid.x, uvLen * sin(newAngle) + mid.y) - mid;

	uv *= uPaintZoom * max(liquidScale, 0.05);
	speed = iTime * uSpinSpeed;
	vec2 uv2 = vec2(uv.x + uv.y);

	for (int i = 0; i < 5; i++) {
		uv2 += sin(max(uv.x, uv.y)) + uv;
		uv += 0.5 * vec2(
			cos(5.1123314 + 0.353 * uv2.y + speed * 0.131121),
			sin(uv2.x - 0.113 * speed)
		);
		uv -= cos(uv.x + uv.y) - sin(uv.x * 0.711 - uv.y);
	}

	float contrastMod = 0.25 * uContrast + 0.5 * uSpinAmount + 1.2;
	float paintRes = min(2.0, max(0.0, length(uv) * 0.035 * contrastMod));
	float c1p = max(0.0, 1.0 - contrastMod * abs(1.0 - paintRes));
	float c2p = max(0.0, 1.0 - contrastMod * abs(paintRes));
	float c3p = 1.0 - min(1.0, c1p + c2p);
	float light =
		(uLighting - 0.2) * max(c1p * 5.0 - 4.0, 0.0) + uLighting * max(c2p * 5.0 - 4.0, 0.0);

	vec3 base =
		(0.3 / max(uContrast, 0.01)) * uColour1
		+ (1.0 - 0.3 / max(uContrast, 0.01)) * (uColour1 * c1p + uColour2 * c2p + uColour3 * c3p);
	return vec4(base + light, 1.0);
}

void main() {
	if (skipLiquid > 0.5) {
		gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
		return;
	}

	vec2 screenSize = max(iResolution, vec2(1.0));
	vec4 col = balatroEffect(screenSize, vUv * screenSize);
	col.rgb *= distortionColor * brightness;
	gl_FragColor = col;
}
`;

/** Full compositor buffer — half-res underlay looked soft after hex split. */
export const LIQUID_RT_SCALE = 1;
export const LIQUID_FRAME_STRIDE = 3;

function tuneUniform(name, fallback) {
	return { value: backgroundLiquidTune[name] ?? fallback };
}

function tuneColor(hex, fallback) {
	return new THREE.Color(hex || fallback);
}

export function createBackgroundLiquidMaterial() {
	const t = backgroundLiquidTune;
	return new THREE.ShaderMaterial({
		uniforms: {
			liquidScale: { value: t.liquidScale ?? 1 },
			brightness: { value: t.brightness ?? 1 },
			distortionColor: { value: new THREE.Color(t.distortionColor ?? "#1b476f") },
			iResolution: { value: new THREE.Vector2(1, 1) },
			iTime: { value: 0 },
			skipLiquid: { value: 0 },
			uSpinRotation: tuneUniform("spinRotation", -2),
			uSpinSpeed: tuneUniform("spinSpeed", 7),
			uContrast: tuneUniform("contrast", 3.5),
			uLighting: tuneUniform("lighting", 0.4),
			uSpinAmount: tuneUniform("spinAmount", 0.25),
			uSpinEase: tuneUniform("spinEase", 1),
			uPaintZoom: tuneUniform("paintZoom", 30),
			uRotate: { value: t.rotate ? 1 : 0 },
			uColour1: { value: tuneColor(t.colour1, "#000000") },
			uColour2: { value: tuneColor(t.colour2, "#006bb4") },
			uColour3: { value: tuneColor(t.colour3, "#161f25") },
		},
		vertexShader: backgroundLiquidVertexShader,
		fragmentShader: backgroundLiquidFragmentShader,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
	});
}

/** Push live tune object into material uniforms. */
export function syncBackgroundLiquidTuneUniforms(material) {
	if (!material?.uniforms) {
		return;
	}
	const u = material.uniforms;
	const t = backgroundLiquidTune;
	u.uSpinRotation.value = t.spinRotation;
	u.uSpinSpeed.value = t.spinSpeed;
	u.uContrast.value = t.contrast;
	u.uLighting.value = t.lighting;
	u.uSpinAmount.value = t.spinAmount;
	u.uSpinEase.value = t.spinEase;
	u.uPaintZoom.value = t.paintZoom;
	u.uRotate.value = t.rotate ? 1 : 0;
	u.uColour1.value.set(t.colour1);
	u.uColour2.value.set(t.colour2);
	u.uColour3.value.set(t.colour3);
	if (t.distortionColor) {
		u.distortionColor.value.set(t.distortionColor);
	}
}

export function createBackgroundLiquidDraw(material) {
	const scene = new THREE.Scene();
	const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	const geometry = new THREE.BufferGeometry();
	const vertices = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);
	const uvs = new Float32Array([0, 0, 2, 0, 0, 2]);
	geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
	geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
	const mesh = new THREE.Mesh(geometry, material);
	scene.add(mesh);
	return { scene, camera, mesh, geometry };
}

export function createBackgroundLiquidTarget(width, height) {
	const w = Math.max(1, Math.round(width));
	const h = Math.max(1, Math.round(height));
	const target = new THREE.WebGLRenderTarget(w, h, {
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		depthBuffer: false,
		stencilBuffer: false,
		type: THREE.HalfFloatType,
		format: THREE.RGBAFormat,
	});
	target.texture.name = "backgroundLiquid";
	target.texture.colorSpace = THREE.LinearSRGBColorSpace;
	return target;
}
