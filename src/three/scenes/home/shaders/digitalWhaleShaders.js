/** Шейдеры цифрового океана (партиклы) и point cloud кита. */

import { underwaterPointGrainGlsl } from "@/three/shaders/underwaterPointGrain.glsl.js";
import { oceanSwimWakeRippleGlsl } from "./oceanSwimWakeRipple.glsl.js";

export const whaleMeshParticleVertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

uniform float uTime;
uniform float uPointScale;

attribute float aIntensity;

varying float vIntensity;
varying float vPulse;
varying vec3 vLocalPos;

void main() {
	vec3 pos = position;
	vLocalPos = pos;

	float breathe = sin(uTime * 1.1 + pos.x * 0.22 + pos.y * 0.15) * 0.04;
	pos += normalize(pos + vec3(0.001)) * breathe;

	vIntensity = aIntensity;
	vPulse = 0.5 + 0.5 * sin(uTime * 1.6 + pos.x * 0.5 + pos.z * 0.35);

	vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
	gl_PointSize = uPointScale;
	gl_Position = projectionMatrix * mvPosition;

	#include <fog_vertex>
}
`;

export const whaleMeshParticleFragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

${underwaterPointGrainGlsl}

uniform vec3 uColor;
uniform float uAlphaMult;
uniform float uGlow;
uniform float uGrainBlurRadius;
uniform float uPointScale;
uniform float uMuteStrength;
uniform vec3 uMuteCenter;
uniform vec3 uMuteRadius;

varying float vIntensity;
varying float vPulse;
varying vec3 vLocalPos;

float particleZoneFade(vec3 localPos) {
	if (uMuteStrength < 0.001) {
		return 1.0;
	}

	vec3 d = (localPos - uMuteCenter) / max(uMuteRadius, vec3(0.001));
	float dist = length(d);
	return mix(1.0 - uMuteStrength, 1.0, smoothstep(0.3, 1.0, dist));
}

vec4 sampleWhaleParticle(vec2 pointCoord, float grainSoft, float zoneFade) {
	vec2 uv = pointCoord - 0.5;
	float dist = length(uv);

	if (dist > 0.5 + grainSoft * 0.35) {
		return vec4(0.0);
	}

	float core = 1.0 - smoothstep(0.0, 0.14 + grainSoft, dist);
	float glow = 1.0 - smoothstep(0.08, 0.46 + grainSoft * 1.6, dist);

	vec3 color = uColor * (core * 1.5 + glow * 0.45 * uGlow) * (0.2 + vIntensity * 0.8 + vPulse * 0.12 * vIntensity) * zoneFade;
	float alpha = (core * 0.78 + glow * 0.32 * uGlow) * uAlphaMult * vIntensity * zoneFade;

	return vec4(color, alpha);
}

void main() {
	vec3 accumColor = vec3(0.0);
	float accumAlpha = 0.0;
	vec4 tap;
	float zoneFade = particleZoneFade(vLocalPos);

	if (uGrainBlurRadius < 0.0000001) {
		tap = sampleWhaleParticle(gl_PointCoord, 0.0, zoneFade);
		if (tap.a < 0.001) {
			discard;
		}
		accumColor = tap.rgb;
		accumAlpha = tap.a;
	} else {
		float grainSoft = underwaterGrainSoft(uGrainBlurRadius);
		float grainTap = underwaterGrainTap(uGrainBlurRadius, uPointScale);
		vec2 screenSeed = gl_FragCoord.xy * 0.00137;

		for (int i = 0; i < 6; i++) {
			vec2 tapCoord = gl_PointCoord + grainBlurOffset(screenSeed + float(i) * 0.173, grainTap);
			tap = sampleWhaleParticle(tapCoord, grainSoft, zoneFade);
			accumColor += tap.rgb * tap.a;
			accumAlpha += tap.a;
		}

		if (accumAlpha < 0.001) {
			discard;
		}

		accumColor /= max(accumAlpha, 0.001);
		accumAlpha /= 6.0;
	}

	gl_FragColor = vec4(accumColor, accumAlpha);

	#include <fog_fragment>
}
`;

/** SkinnedMesh whale on low/medium: luminous micro-points, no CPU particles. */
export const whaleHologramVertexShader = /* glsl */ `
#define USE_SKINNING

#include <common>
#include <fog_pars_vertex>
#include <skinning_pars_vertex>

void main() {
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>

	vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
	gl_Position = projectionMatrix * mvPosition;

	#include <fog_vertex>
}
`;

export const whaleHologramFragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uGlow;

float hash21(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
	// Round, staggered cells hide FBX triangulation instead of lighting every
	// low-poly face. The shader remains one skinned draw call.
	const float cellPx = 5.5;
	vec2 rowCoord = gl_FragCoord.xy / cellPx;
	rowCoord.x += mod(floor(rowCoord.y), 2.0) * 0.5;
	vec2 cellId = floor(rowCoord);
	vec2 cellUv = fract(rowCoord) - 0.5;
	float seed = hash21(cellId);
	float radius = mix(0.105, 0.225, seed);
	float distToCenter = length(cellUv);
	float aa = max(fwidth(distToCenter) * 1.35, 0.012);
	float core = 1.0 - smoothstep(radius - aa, radius + aa, distToCenter);
	float halo = 1.0 - smoothstep(radius + aa, 0.48, distToCenter);

	float travel = 0.5 + 0.5 * sin(cellId.x * 0.19 + cellId.y * 0.11 - uTime * 2.0);
	float sweep = pow(0.5 + 0.5 * sin(gl_FragCoord.y * 0.032 - uTime * 1.55), 9.0);
	float energy = 0.62 + travel * 0.34 + sweep * 1.7;
	float alpha = (core * 0.92 + halo * 0.16) * energy * uOpacity;
	if (alpha < 0.008) {
		discard;
	}

	vec3 color = uColor * (0.72 + core * (1.15 + uGlow * 0.22) + halo * 0.32 + sweep * 0.85);

	gl_FragColor = vec4(color, alpha);

	#include <fog_fragment>
}
`;

export const oceanParticlesVertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

${oceanSwimWakeRippleGlsl}

uniform float uTime;
uniform vec2 uRippleCenter;
uniform vec2 uRippleDir;
uniform vec2 uScrollPhase;
uniform float uWaveAmp;
uniform float uRippleAmp;
uniform float uPointScale;

varying float vWave;
varying float vPulse;

void main() {
	vec3 pos = position;
	vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
	float waveX = worldPos.x - uScrollPhase.x;
	float waveZ = worldPos.z - uScrollPhase.y;

	float wave1 = sin(waveX * 0.35 - uTime * 0.8) * 0.25;
	float wave2 = sin(waveZ * 0.55 - uTime * 0.6) * 0.18;
	float wave3 = sin((waveX + waveZ) * 0.25 - uTime * 0.4) * 0.22;

	float rippleWave = oceanSwimWakeRipple(vec2(worldPos.x, worldPos.z), uRippleCenter, uRippleDir, uTime);

	pos.y += (wave1 + wave2 + wave3) * uWaveAmp + rippleWave * uRippleAmp;

	vWave = pos.y;
	vPulse = 0.5 + 0.5 * sin(-uTime * 1.4 + waveX * 0.6 + waveZ * 0.4);

	vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
	gl_PointSize = uPointScale;
	gl_Position = projectionMatrix * mvPosition;

	#include <fog_vertex>
}
`;

export const oceanParticlesFragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform vec3 uColor;
uniform float uAlphaMult;
uniform float uGlow;

varying float vWave;
varying float vPulse;

void main() {
	vec2 uv = gl_PointCoord - 0.5;
	float dist = length(uv);

	if (dist > 0.5) {
		discard;
	}

	float core = 1.0 - smoothstep(0.0, 0.14, dist);
	float glow = 1.0 - smoothstep(0.1, 0.46, dist);

	float waveBoost = 0.88 + smoothstep(0.0, 0.35, vWave) * 0.12;
	vec3 color = uColor * waveBoost * (core * 1.6 + glow * 0.45 * uGlow);
	float alpha = (core * 0.75 + glow * 0.3 * uGlow) * uAlphaMult;

	gl_FragColor = vec4(color, alpha);

	#include <fog_fragment>
}
`;

export const oceanGridLineVertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

${oceanSwimWakeRippleGlsl}

uniform float uTime;
uniform vec2 uRippleCenter;
uniform vec2 uRippleDir;
uniform vec2 uScrollPhase;
uniform float uWaveAmp;
uniform float uRippleAmp;

varying float vWave;
varying float vPulse;

void main() {
	vec3 pos = position;
	vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
	float waveX = worldPos.x - uScrollPhase.x;
	float waveZ = worldPos.z - uScrollPhase.y;

	float wave1 = sin(waveX * 0.35 - uTime * 0.8) * 0.25;
	float wave2 = sin(waveZ * 0.55 - uTime * 0.6) * 0.18;
	float wave3 = sin((waveX + waveZ) * 0.25 - uTime * 0.4) * 0.22;

	float rippleWave = oceanSwimWakeRipple(vec2(worldPos.x, worldPos.z), uRippleCenter, uRippleDir, uTime);

	pos.y += (wave1 + wave2 + wave3) * uWaveAmp + rippleWave * uRippleAmp;

	vWave = pos.y;
	vPulse = 0.5 + 0.5 * sin(-uTime * 1.4 + waveX * 0.6 + waveZ * 0.4);

	vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
	gl_Position = projectionMatrix * mvPosition;

	#include <fog_vertex>
}
`;

/** Океан: одна плоскость, точки (и опционально линии) рисуются в fragment shader. */
export const oceanSurfaceVertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

${oceanSwimWakeRippleGlsl}

uniform float uTime;
uniform vec2 uRippleCenter;
uniform vec2 uRippleDir;
uniform float uWaveAmp;
uniform float uRippleAmp;
uniform vec2 uScrollPhase;

varying vec2 vSurfaceLocalXZ;
varying float vWave;
varying float vPulse;

void main() {
	vec3 pos = position;
	vSurfaceLocalXZ = pos.xz;

	vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
	float waveX = position.x - uScrollPhase.x;
	float waveZ = position.z - uScrollPhase.y;

	float wave1 = sin(waveX * 0.35 - uTime * 0.8) * 0.25;
	float wave2 = sin(waveZ * 0.55 - uTime * 0.6) * 0.18;
	float wave3 = sin((waveX + waveZ) * 0.25 - uTime * 0.4) * 0.22;

	float rippleWave = oceanSwimWakeRipple(vec2(worldPos.x, worldPos.z), uRippleCenter, uRippleDir, uTime);

	pos.y += (wave1 + wave2 + wave3) * uWaveAmp + rippleWave * uRippleAmp;

	vWave = pos.y;
	vPulse = 0.5 + 0.5 * sin(-uTime * 1.4 + waveX * 0.6 + waveZ * 0.4);

	vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
	gl_Position = projectionMatrix * mvPosition;

	#include <fog_vertex>
}
`;

export const oceanSurfaceFragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform vec3 uPointColor;
uniform vec3 uGridColor;
uniform float uTime;
uniform float uGridCols;
uniform float uGridRows;
uniform float uSurfaceWidth;
uniform float uSurfaceDepth;
uniform float uSurfaceZNear;
uniform float uPointScale;
uniform float uAlphaMult;
uniform float uGlow;
uniform float uGridAlpha;
uniform vec2 uScrollPhase;

varying vec2 vSurfaceLocalXZ;
varying float vWave;
varying float vPulse;

float oceanHash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
	// cols ячеек: точки в центрах, без дубля на ±width/2 между соседними периодами 120.
	float stepX = uSurfaceWidth / max(uGridCols, 1.0);
	float stepZ = uSurfaceDepth / max(uGridRows, 1.0);
	float scrolledX = vSurfaceLocalXZ.x - uScrollPhase.x;
	float scrolledZ = vSurfaceLocalXZ.y - uScrollPhase.y;
	float periodX = mod(scrolledX + uSurfaceWidth, uSurfaceWidth);
	float zFromNear = uSurfaceZNear - scrolledZ;
	vec2 g = vec2(periodX, zFromNear);
	vec2 cellCoord = vec2((g.x - stepX * 0.5) / stepX, (g.y - stepZ * 0.5) / stepZ);

	vec2 cellId = floor(cellCoord);
	vec2 distFromCenter = abs(fract(cellCoord) - 0.5);
	float coordDdx = length(dFdx(cellCoord));
	float coordDdy = length(dFdy(cellCoord));
	float pxPerCell = 1.0 / max(max(coordDdx, coordDdy), 0.0001);
	float distCenterPx = length(distFromCenter) * pxPerCell;
	float seed = oceanHash(cellId);
	// Fade sub-pixel cells instead of allowing perspective aliasing to merge
	// them into thick luminous bands near the horizon.
	float resolved = smoothstep(0.8, 2.2, pxPerCell);
	float radiusPx = mix(0.55, 1.2, seed) * clamp(uPointScale * 0.52, 0.65, 1.25);
	float core = 1.0 - smoothstep(radiusPx * 0.35, radiusPx * 0.35 + 0.9, distCenterPx);
	float glow = 1.0 - smoothstep(radiusPx * 0.5, radiusPx + 2.2, distCenterPx);
	float rareNode = smoothstep(0.94, 0.995, seed);
	float flow = pow(0.5 + 0.5 * sin(cellId.x * 0.13 + cellId.y * 0.21 - uTime * 0.85), 5.0);
	float waveBoost = 0.72 + smoothstep(-0.1, 0.4, vWave) * 0.28;
	float energy = (0.38 + seed * 0.34 + flow * 0.42 + rareNode * 2.4) * waveBoost;
	vec3 color = uPointColor * (core * (1.2 + energy * 1.35) + glow * (0.12 + energy * 0.2 * uGlow));
	float alpha = (core * 0.72 + glow * (0.08 + rareNode * 0.18)) * uAlphaMult * energy * resolved;

	if (alpha < 0.0001) {
		discard;
	}

	gl_FragColor = vec4(color, alpha);

	#include <fog_fragment>
}
`;

export const oceanGridLineFragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform vec3 uColor;
uniform float uGridAlpha;

varying float vWave;
varying float vPulse;

void main() {
	float waveBoost = 0.7 + smoothstep(0.0, 0.35, vWave) * 0.3;
	vec3 color = uColor * waveBoost * (0.85 + vPulse * 0.15);
	float alpha = 0.22 * waveBoost * uGridAlpha;

	gl_FragColor = vec4(color, alpha);

	#include <fog_fragment>
}
`;

export const ambientDriftVertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

uniform float uTime;
uniform float uPointScale;
uniform float uDriftAmp;
uniform float uLocalSurfaceY;
uniform float uAnchorY;
uniform float uOceanCeilingY;
/** Тот же поток, что у сетки океана — частицы уезжают вправо и появляются слева. */
uniform float uScrollPhase;
uniform float uWrapWidth;

attribute float aPhase;
attribute float aSize;

varying float vOceanY;

void main() {
	vec3 pos = position;

	float halfW = max(uWrapWidth, 0.001) * 0.5;
	pos.x = mod(pos.x + uScrollPhase + halfW, halfW * 2.0) - halfW;

	float driftX = sin(uTime * 0.45 + aPhase) * uDriftAmp;
	float driftY = sin(uTime * 0.32 + aPhase * 1.7) * uDriftAmp * 0.35;
	float driftZ = cos(uTime * 0.38 + aPhase * 0.9) * uDriftAmp;

	pos += vec3(driftX, driftY, driftZ);
	pos.y = min(pos.y, uLocalSurfaceY);
	vOceanY = uAnchorY + pos.y;

	vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
	gl_PointSize = uPointScale * aSize * (140.0 / max(-mvPosition.z, 1.0));
	gl_Position = projectionMatrix * mvPosition;

	#include <fog_vertex>
}
`;

export const ambientDriftFragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform vec3 uColor;
uniform float uAlphaMult;
uniform float uGlow;
uniform float uOceanCeilingY;
uniform float uOceanFadeBand;

varying float vOceanY;

void main() {
	vec2 uv = gl_PointCoord - 0.5;
	float dist = length(uv);

	if (dist > 0.5) {
		discard;
	}

	float core = 1.0 - smoothstep(0.0, 0.2, dist);
	float glow = 1.0 - smoothstep(0.12, 0.48, dist);
	float topFade = 1.0 - smoothstep(uOceanCeilingY - uOceanFadeBand, uOceanCeilingY, vOceanY);

	vec3 color = uColor * (core * 1.2 + glow * 0.35 * uGlow);
	float alpha = (core * 0.55 + glow * 0.28 * uGlow) * uAlphaMult * topFade;

	gl_FragColor = vec4(color, alpha);

	#include <fog_fragment>
}
`;

/** Шлейф за китом — ярче у тела, гаснет к хвосту (aLife). */
export const whaleWakeVertexShader = /* glsl */ `
#include <common>

uniform float uPointScale;

attribute float aSize;
attribute float aLife;

varying float vLife;

void main() {
	vLife = aLife;

	vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
	float size = uPointScale * aSize * (0.65 + aLife * 0.55) * (130.0 / max(-mvPosition.z, 1.0));
	gl_PointSize = max(3.0, size);
	gl_Position = projectionMatrix * mvPosition;
}
`;

export const whaleWakeFragmentShader = /* glsl */ `
#include <common>

uniform vec3 uColor;
uniform float uAlphaMult;

varying float vLife;

void main() {
	vec2 uv = gl_PointCoord - 0.5;
	float dist = length(uv);

	if (dist > 0.5) {
		discard;
	}

	float core = 1.0 - smoothstep(0.0, 0.18, dist);
	float glow = 1.0 - smoothstep(0.1, 0.42, dist);
	float fade = vLife * vLife * (3.0 - 2.0 * vLife);
	float alpha = (core * 0.55 + glow * 0.38) * uAlphaMult * fade;

	if (alpha < 0.01) {
		discard;
	}

	vec3 color = uColor * (core * 1.15 + glow * 0.45) * (0.55 + fade * 0.65);
	gl_FragColor = vec4(color, alpha);
}
`;

export const whalePointsVertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

uniform float uTime;
uniform float uPointScale;

attribute float aSize;
attribute float aIntensity;
attribute float aHeadBias;

varying float vIntensity;
varying float vAlpha;

void main() {
	vec3 pos = position;

	float breathe = sin(uTime * 1.0 + position.x * 0.18) * 0.06;
	pos.y += breathe;

	float reveal = smoothstep(0.42, 0.94, aHeadBias);
	reveal = max(reveal, step(0.82, aHeadBias));

	float impulse = sin(position.x * 0.45 - uTime * 2.4) * 0.5 + 0.5;
	impulse *= smoothstep(-14.0, 8.0, position.x - 7.0);

	vIntensity = aIntensity * (0.4 + impulse * 0.6);
	vAlpha = reveal * (0.35 + aIntensity * 0.65);

	vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
	gl_PointSize = aSize * uPointScale * (72.0 / -mvPosition.z) * (0.55 + reveal * 0.45);
	gl_Position = projectionMatrix * mvPosition;

	#include <fog_vertex>
}
`;

export const whalePointsFragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform vec3 uColor;

varying float vIntensity;
varying float vAlpha;

void main() {
	vec2 uv = gl_PointCoord - 0.5;
	float dist = length(uv);

	if (dist > 0.5) {
		discard;
	}

	float core = 1.0 - smoothstep(0.0, 0.16, dist);
	float glow = 1.0 - smoothstep(0.12, 0.44, dist);
	float alpha = (core * 0.8 + glow * 0.35) * vAlpha;
	vec3 color = uColor * (core * 1.4 + glow * 0.5) * (0.7 + vIntensity * 0.5);

	gl_FragColor = vec4(color, alpha);

	#include <fog_fragment>
}
`;

export const finVertexShader = /* glsl */ `
uniform float uTime;
varying float vGlow;

void main() {
	vec3 pos = position;
	pos.y += sin(uTime * 1.6 + position.x * 0.8) * 0.06;

	vGlow = 0.6 + 0.4 * sin(uTime * 2.0 + position.y * 2.5);

	gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const finFragmentShader = /* glsl */ `
uniform vec3 uColor;
varying float vGlow;

void main() {
	float alpha = vGlow * 0.85;
	gl_FragColor = vec4(uColor, alpha);
}
`;

export const whaleAccentVertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

uniform float uTime;
uniform float uAccentScale;

attribute float aSize;
attribute float aPulse;

varying float vGlow;

void main() {
	vec3 pos = position;
	pos.y += sin(uTime * 1.1 + aPulse * 6.28) * 0.05;

	vGlow = 0.65 + 0.35 * sin(uTime * 2.2 + aPulse * 10.0);

	vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
	gl_PointSize = aSize * uAccentScale * (145.0 / -mvPosition.z);
	gl_Position = projectionMatrix * mvPosition;

	#include <fog_vertex>
}
`;

export const whaleAccentFragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform vec3 uColor;
varying float vGlow;

void main() {
	vec2 uv = gl_PointCoord - 0.5;
	float dist = length(uv);
	if (dist > 0.5) discard;

	float core = 1.0 - smoothstep(0.08, 0.22, dist);
	float halo = 1.0 - smoothstep(0.22, 0.48, dist);

	vec3 color = uColor * (1.0 + vGlow * 0.35);
	float alpha = (core * 0.95 + halo * 0.35) * vGlow;

	gl_FragColor = vec4(color, alpha);

	#include <fog_fragment>
}
`;
