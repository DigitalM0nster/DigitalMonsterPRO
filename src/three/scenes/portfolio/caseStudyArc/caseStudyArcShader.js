/**
 * Screen-space procedural case arc (track + nodes + traveling glow).
 * Additive bloom matches Canvas drawArcInnerCoreGlow / strokeArcActiveNodeGlow.
 * Thin hairlines + hard node cutouts (track never crosses rings).
 */
export const CASE_STUDY_ARC_MAX_NODES = 16;

export const caseStudyArcVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const caseStudyArcFragmentShader = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform vec2 uResolution;
uniform vec2 uCenterPx;
uniform float uRadiusPx;
uniform float uAngleStart;
uniform float uAngleEnd;
uniform float uNoFadeMin;
uniform float uNoFadeMax;
uniform float uFadeInset;
uniform float uFadePower;
uniform float uFadeTailDeg;
uniform float uTrackWidthPx;
uniform float uTrackOpacity;
uniform vec3 uTrackColor;
uniform vec3 uActiveColor;
uniform float uGlowAngle;
uniform float uGlowStrength;
uniform float uGlowHalfSpan;
uniform float uGlowBloomBlur;
uniform float uGlowBloomStrength;
uniform float uGlowOpacityBoost;
uniform float uNodeRadiusPx;
uniform float uNodeMidRadiusPx;
uniform float uNodeInnerRadiusPx;
uniform float uNodeMidOpacity;
uniform float uActiveOpacity;
uniform float uOuterBloomBlur;
uniform float uOuterBloomStrength;
uniform float uInnerBloomBlur;
uniform float uInnerBloomStrength;
uniform float uIntroOpacity;
uniform float uNodeCount;
uniform float uNodeAngles[${CASE_STUDY_ARC_MAX_NODES}];
uniform float uNodeHighlight[${CASE_STUDY_ARC_MAX_NODES}];

float angularFade(float angle) {
	float inset = uFadeInset;
	float zoneMin = uNoFadeMin - inset;
	float zoneMax = uNoFadeMax + inset;
	float power = max(0.5, uFadePower);
	float easeWeight = clamp(uFadeTailDeg / 45.0, 0.0, 1.0);
	float distOutside = 0.0;
	if (angle < zoneMin) {
		distOutside = zoneMin - angle;
	} else if (angle > zoneMax) {
		distOutside = angle - zoneMax;
	}
	if (distOutside <= 0.0) {
		return 1.0;
	}
	float availableTail = angle < zoneMin ? (zoneMin - uAngleStart) : (uAngleEnd - zoneMax);
	if (availableTail <= 1e-5) {
		return 0.0;
	}
	float t = clamp(distOutside / availableTail, 0.0, 1.0);
	float linear = 1.0 - t;
	float eased = 1.0 - pow(t, power);
	return mix(linear, eased, easeWeight);
}

float glowWeight(float angle) {
	if (uGlowStrength < 0.01 || uGlowHalfSpan <= 0.0) {
		return 0.0;
	}
	float dist = abs(angle - uGlowAngle);
	// Long soft tail — hard clip at halfSpan reads as a bar under additive blend.
	float softSpan = max(uGlowHalfSpan * 2.2, uGlowHalfSpan + 0.08);
	if (dist >= softSpan) {
		return 0.0;
	}
	float x = dist / softSpan;
	// Smooth gaussian-ish: peak in center, long fade, zero at softSpan.
	float s = exp(-3.5 * x * x) * (1.0 - x);
	return max(0.0, s) * uGlowStrength;
}

float strokeBloom(float distPx, float blurPx) {
	float s = max(0.65, blurPx * 0.5);
	return exp(-(distPx * distPx) / (2.0 * s * s));
}

float hairline(float distPx, float halfW) {
	float hw = max(0.3, halfW);
	return 1.0 - smoothstep(hw, hw + 0.9, distPx);
}

void main() {
	if (uIntroOpacity < 0.01) {
		discard;
	}

	vec2 px = vUv * uResolution;
	vec2 d = px - uCenterPx;
	float r = length(d);
	float angle = atan(d.y, d.x);

	if (angle < uAngleStart - 0.02 || angle > uAngleEnd + 0.02) {
		discard;
	}

	float fade = angularFade(angle) * uIntroOpacity;
	if (fade < 0.01) {
		discard;
	}

	float halfTrack = max(0.3, uTrackWidthPx * 0.4);
	float distToRing = abs(r - uRadiusPx);

	float nodeCut = 0.0;
	float nearestHighlight = 0.0;
	float nearestNodeDist = 1e5;
	int count = int(uNodeCount + 0.5);
	float cutPad = halfTrack + 1.5;
	for (int i = 0; i < ${CASE_STUDY_ARC_MAX_NODES}; i++) {
		if (i >= count) {
			break;
		}
		float na = uNodeAngles[i];
		vec2 nodePos = uCenterPx + uRadiusPx * vec2(cos(na), sin(na));
		float nodeDist = length(px - nodePos);
		float cutR = uNodeRadiusPx + cutPad;
		if (nodeDist < cutR) {
			nodeCut = max(nodeCut, 1.0 - smoothstep(cutR - 0.8, cutR, nodeDist));
		}
		if (nodeDist < nearestNodeDist) {
			nearestNodeDist = nodeDist;
			nearestHighlight = uNodeHighlight[i];
		}
	}
	float trackKeep = 1.0 - nodeCut;

	vec3 add = vec3(0.0);

	// Base track — thin white hairline, hard-cut at nodes
	float trackMask = hairline(distToRing, halfTrack) * trackKeep;
	add += uTrackColor * (trackMask * uTrackOpacity * fade);

	// Traveling glow — ONLY additive excess on top of base track (never re-stroke trackOpacity).
	// Re-adding trackOpacity here caused a hard brightness step at the glow band edge.
	float gw = glowWeight(angle);
	if (gw > 0.001 && trackKeep > 0.01) {
		float bloomBlur = max(1.0, uGlowBloomBlur) * (0.85 + gw * 0.4);
		float bloomStr = max(0.0, uGlowBloomStrength) * gw;
		float strokeGw = gw * gw;

		float soft = strokeBloom(distToRing, bloomBlur * 1.75) * trackKeep;
		add += uActiveColor * (soft * bloomStr * 0.45 * fade);

		float core = strokeBloom(distToRing, bloomBlur * 0.85) * trackKeep;
		vec3 tint = mix(uTrackColor, uActiveColor, clamp(strokeGw * 1.25, 0.0, 1.0));
		add += tint * (core * bloomStr * 0.75 * fade);

		// Excess brightness + color lift only (base track already drawn above).
		float stroke = hairline(distToRing, halfTrack) * trackKeep;
		float boost = max(0.0, uActiveOpacity - uTrackOpacity + uGlowOpacityBoost);
		add += tint * (stroke * boost * strokeGw * fade);
		add += (uActiveColor - uTrackColor) * (stroke * uTrackOpacity * strokeGw * fade);
	}

	// Nodes
	if (nearestNodeDist < uNodeRadiusPx + uInnerBloomBlur * 8.0) {
		float hl = clamp(nearestHighlight, 0.0, 1.0);
		float strokeW = max(0.3, halfTrack * 0.9);
		float ringDist = abs(nearestNodeDist - uNodeRadiusPx);

		// Active: Canvas drawArcInnerCoreGlow — haze / mid / hot
		if (hl > 0.05 && uInnerBloomBlur > 0.01 && uInnerBloomStrength > 0.01) {
			float intensity = min(1.0, (uInnerBloomStrength * 0.5) * hl) * fade;
			float coreR = max(0.8, uNodeInnerRadiusPx);
			float hazeR = coreR + uInnerBloomBlur * 7.0;
			float midR = coreR + uInnerBloomBlur * 2.4;
			float hotR = max(coreR * 1.35, coreR + uInnerBloomBlur * 0.45);
			float nd = nearestNodeDist;

			float hazeT = clamp(nd / max(hazeR, 0.001), 0.0, 1.0);
			float hazeA = 0.0;
			if (hazeT < 0.32) {
				hazeA = mix(0.18, 0.10, hazeT / 0.32);
			} else if (hazeT < 0.68) {
				hazeA = mix(0.10, 0.035, (hazeT - 0.32) / 0.36);
			} else {
				hazeA = mix(0.035, 0.0, (hazeT - 0.68) / 0.32);
			}
			add += uActiveColor * (hazeA * intensity);

			if (nd < midR) {
				float mt = nd / max(midR, 0.001);
				vec3 midCol;
				float midA;
				if (mt < 0.12) {
					midCol = mix(vec3(1.0), uActiveColor, mt / 0.12);
					midA = mix(0.92, 0.88, mt / 0.12);
				} else if (mt < 0.38) {
					midCol = uActiveColor;
					midA = mix(0.88, 0.42, (mt - 0.12) / 0.26);
				} else if (mt < 0.72) {
					midCol = uActiveColor;
					midA = mix(0.42, 0.10, (mt - 0.38) / 0.34);
				} else {
					midCol = uActiveColor;
					midA = mix(0.10, 0.0, (mt - 0.72) / 0.28);
				}
				add += midCol * (midA * intensity);
			}

			if (nd < hotR) {
				float ht = nd / max(hotR, 0.001);
				float hotA = ht < 0.55
					? mix(1.0, 0.35, ht / 0.55)
					: mix(0.35, 0.0, (ht - 0.55) / 0.45);
				add += vec3(1.0) * (hotA * intensity);
			}
		}

		// Active: outer ring stroke bloom
		if (hl > 0.05 && uOuterBloomBlur > 0.01 && uOuterBloomStrength > 0.01) {
			float bStr = uOuterBloomStrength * (0.9 + hl * 0.5);
			float bBlur = uOuterBloomBlur * (0.85 + hl * 0.4);
			float softR = strokeBloom(ringDist, bBlur * 1.65);
			float coreRb = strokeBloom(ringDist, bBlur * 0.75);
			vec3 ringCol = mix(uTrackColor, uActiveColor, hl);
			add += ringCol * (softR * bStr * 0.55 * fade * hl);
			add += ringCol * (coreRb * bStr * fade * hl);
		}

		// Thin hollow outer ring
		float ring = hairline(ringDist, strokeW);
		vec3 outerCol = mix(uTrackColor, uActiveColor, hl);
		float outerA = mix(uTrackOpacity, uActiveOpacity, hl) * fade;
		add += outerCol * (ring * outerA);

		float mid = 1.0 - smoothstep(uNodeMidRadiusPx - 0.4, uNodeMidRadiusPx + 0.35, nearestNodeDist);
		float inner = 1.0 - smoothstep(uNodeInnerRadiusPx - 0.3, uNodeInnerRadiusPx + 0.35, nearestNodeDist);
		float midDisk = mid * (1.0 - inner);
		add += uTrackColor * (midDisk * uNodeMidOpacity * uTrackOpacity * fade);

		float innerA = mix(uTrackOpacity, uActiveOpacity, hl) * fade;
		vec3 innerCol = hl > 0.55 ? vec3(1.0) : mix(uTrackColor, uActiveColor, hl);
		add += innerCol * (inner * innerA);
	}

	float lum = max(add.r, max(add.g, add.b));
	if (lum < 0.0025) {
		discard;
	}
	gl_FragColor = vec4(clamp(add, 0.0, 1.0), 1.0);
}
`;
