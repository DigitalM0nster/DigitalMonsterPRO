import * as THREE from "three";
import {
	HUB_PLATE_GALLERY_ITEM_COUNT,
	HUB_PLATE_GALLERY_UV_RECTS,
} from "./hubPlateGalleryLayout.js";

const vertexShader = /* glsl */ `
	varying vec2 vUv;
	varying vec3 vViewNormal;
	varying vec3 vViewDirection;

	void main() {
		vUv = uv;
		vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
		vViewNormal = normalize(normalMatrix * normal);
		vViewDirection = normalize(-viewPosition.xyz);
		gl_Position = projectionMatrix * viewPosition;
	}
`;

const fragmentShader = /* glsl */ `
	uniform sampler2D uMap;
	uniform sampler2D uGalleryAtlas;
	uniform float uOpacity;
	uniform float uTime;
	uniform float uBrightness;
	uniform float uCyanMix;
	uniform float uScanlineStrength;
	uniform float uFlickerStrength;
	uniform float uSweepStrength;
	uniform float uChromaticShift;
	uniform float uCornerRadius;
	uniform float uFrameStrength;
	uniform float uGalleryFromIndex;
	uniform float uGalleryToIndex;
	uniform float uGallerySelectedIndex;
	uniform float uGalleryProgress;
	uniform vec4 uGalleryLeftRect;
	uniform vec4 uGalleryCenterRect;
	uniform vec4 uGalleryRightRect;
	uniform vec2 uMosaicTiles;
	uniform float uMosaicSoftness;
	uniform float uMosaicScatter;
	uniform float uMosaicGlow;
	uniform vec3 uPrimaryColor;
	uniform vec3 uSecondaryColor;
	uniform vec3 uHighlightColor;
	uniform float uFresnelStrength;
	uniform float uVignetteStrength;
	uniform float uBacklightStrength;
	uniform float uContrast;
	uniform float uEdgeDepthStrength;
	varying vec2 vUv;
	varying vec3 vViewNormal;
	varying vec3 vViewDirection;

	const float GALLERY_COUNT = ${HUB_PLATE_GALLERY_ITEM_COUNT}.0;
	const float SCREEN_ASPECT = 1.7777778;
	const float GALLERY_TILE_ASPECT = 2.031746;
	const vec2 GALLERY_CELL_GUTTER_UV = vec2(0.00515464, 0.01036269);

	float hash21(vec2 p) {
		p = fract(p * vec2(123.34, 456.21));
		p += dot(p, p + 45.32);
		return fract(p.x * p.y);
	}

	float valueNoise(vec2 p) {
		vec2 cell = floor(p);
		vec2 local = fract(p);
		local = local * local * (3.0 - 2.0 * local);
		float a = hash21(cell);
		float b = hash21(cell + vec2(1.0, 0.0));
		float c = hash21(cell + vec2(0.0, 1.0));
		float d = hash21(cell + vec2(1.0, 1.0));
		return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
	}

	float roundedRectDistance(vec2 point, vec2 minCorner, vec2 maxCorner, float radius) {
		point.x *= SCREEN_ASPECT;
		minCorner.x *= SCREEN_ASPECT;
		maxCorner.x *= SCREEN_ASPECT;
		vec2 center = (minCorner + maxCorner) * 0.5;
		vec2 halfSize = (maxCorner - minCorner) * 0.5;
		vec2 q = abs(point - center) - halfSize + radius;
		return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
	}

	vec4 sampleGalleryImage(float index, vec2 localUv) {
		float safeIndex = mod(floor(index + 0.5) + GALLERY_COUNT, GALLERY_COUNT);
		float column = mod(safeIndex, 2.0);
		float row = floor(safeIndex / 2.0);
		vec2 safeLocalUv = mix(
			GALLERY_CELL_GUTTER_UV,
			vec2(1.0) - GALLERY_CELL_GUTTER_UV,
			clamp(localUv, 0.0, 1.0)
		);
		vec2 atlasUv = vec2(
			(column + safeLocalUv.x) / 2.0,
			(2.0 - row + safeLocalUv.y) / 3.0
		);
		return texture2D(uGalleryAtlas, atlasUv);
	}

	float galleryRectMask(vec2 uv, vec4 rect, float radius) {
		float distanceToRect = roundedRectDistance(uv, rect.xy, rect.zw, radius);
		return 1.0 - smoothstep(-0.0015, 0.0015, distanceToRect);
	}

	vec2 galleryRectUv(vec2 uv, vec4 rect) {
		return clamp((uv - rect.xy) / (rect.zw - rect.xy), 0.0, 1.0);
	}

	vec2 galleryCoverUv(vec2 localUv, vec4 rect) {
		vec2 rectSize = max(rect.zw - rect.xy, vec2(0.0001));
		float targetAspect = rectSize.x * SCREEN_ASPECT / rectSize.y;
		vec2 coveredUv = localUv;
		if (GALLERY_TILE_ASPECT > targetAspect) {
			coveredUv.x = (localUv.x - 0.5) * (targetAspect / GALLERY_TILE_ASPECT) + 0.5;
		} else {
			coveredUv.y = (localUv.y - 0.5) * (GALLERY_TILE_ASPECT / targetAspect) + 0.5;
		}
		return clamp(coveredUv, 0.0, 1.0);
	}

	vec4 sampleGalleryTransition(float fromIndex, float toIndex, vec2 localUv, float seed) {
		vec2 tileId = floor(localUv * uMosaicTiles) + vec2(seed * 13.7, seed * 7.9);
		vec2 randomVector = vec2(
			hash21(tileId + 7.3),
			hash21(tileId.yx + 19.7)
		) - 0.5;
		float delay = hash21(tileId + 31.9) * (1.0 - uMosaicSoftness);
		float tileMix = smoothstep(delay, min(1.0, delay + uMosaicSoftness), uGalleryProgress);
		vec2 fromUv = clamp(localUv + randomVector * uMosaicScatter * tileMix, 0.0, 1.0);
		vec2 toUv = clamp(localUv - randomVector * uMosaicScatter * (1.0 - tileMix), 0.0, 1.0);
		vec4 gallery = mix(
			sampleGalleryImage(fromIndex, fromUv),
			sampleGalleryImage(toIndex, toUv),
			tileMix
		);
		return gallery;
	}

	vec4 sampleScreen(vec2 uv) {
		// Gallery imagery lives on three real animated planes above this screen.
		return texture2D(uMap, uv);
	}

	float galleryMosaicFlash(vec2 uv, vec4 rect, float seed) {
		float rectMask = galleryRectMask(uv, rect, seed < 0.5 ? 0.009 : 0.007);
		vec2 localUv = galleryRectUv(uv, rect);
		vec2 tileId = floor(localUv * uMosaicTiles) + vec2(seed * 13.7, seed * 7.9);
		float tileDelay = hash21(tileId + 31.9) * (1.0 - uMosaicSoftness);
		float transitionActive = step(0.001, uGalleryProgress) * (1.0 - step(0.999, uGalleryProgress));
		return exp(-abs(uGalleryProgress - tileDelay) * 24.0) * transitionActive * rectMask;
	}

	float frameGlow(float distanceToEdge, float sharpness, float spread) {
		float core = 1.0 - smoothstep(0.0, sharpness, abs(distanceToEdge));
		float aura = exp(-abs(distanceToEdge) * spread);
		return core + aura * 0.42;
	}

	void main() {
		vec2 maskUv = vUv;
		vec2 viewSkew = vViewDirection.xy / max(0.42, abs(vViewDirection.z));
		vec2 uv = clamp(maskUv + viewSkew * 0.00135, vec2(0.001), vec2(0.999));
		float timeBucket = floor(uTime * 9.0);
		float row = floor(uv.y * 96.0);
		float glitchGate = step(0.982, hash21(vec2(row, timeBucket)));
		uv.x += (hash21(vec2(row + 13.0, timeBucket)) - 0.5) * 0.004 * glitchGate;

		float screenDistance = roundedRectDistance(
			maskUv,
			vec2(0.0),
			vec2(1.0),
			uCornerRadius
		);
		float screenMask = 1.0 - smoothstep(-0.0015, 0.0015, screenDistance);
		if (screenMask <= 0.001) {
			discard;
		}

		float facing = clamp(abs(dot(normalize(vViewNormal), normalize(vViewDirection))), 0.0, 1.0);
		float fresnel = pow(1.0 - facing, 2.35);
		float screenEdge = 1.0 - smoothstep(0.0, 0.055, abs(screenDistance));
		float chroma = uChromaticShift * (0.35 + screenEdge * 0.65);
		vec4 centerSample = sampleScreen(uv);
		float red = sampleScreen(uv + vec2(chroma, 0.0)).r;
		float blue = sampleScreen(uv - vec2(chroma, 0.0)).b;
		vec3 color = vec3(red, centerSample.g, blue);

		color = max((color - 0.5) * uContrast + 0.5, vec3(0.0));
		color = pow(color, vec3(0.92)) * uBrightness;
		float displayLuma = dot(color, vec3(0.2126, 0.7152, 0.0722));
		vec3 hologramColor = uPrimaryColor * displayLuma * 1.18;
		color = mix(color, hologramColor, uCyanMix);
		float darkPixel = 1.0 - smoothstep(0.035, 0.42, displayLuma);
		float ambientPulse = 0.88 + 0.12 * sin(uTime * 0.74 + uv.x * 2.7 - uv.y * 1.6);
		vec3 backlightColor = mix(uPrimaryColor, uSecondaryColor, 0.24 + uv.y * 0.18);
		color += backlightColor * darkPixel * uBacklightStrength * ambientPulse * 0.085;
		color += color * displayLuma * uBacklightStrength * 0.12;

		float fineScanline = 0.5 + 0.5 * sin((uv.y * 720.0 + uTime * 25.0) * 3.14159265);
		float softScanline = 0.5 + 0.5 * sin(uv.y * 180.0 - uTime * 3.2);
		float scanline = fineScanline * 0.72 + softScanline * 0.28;
		color *= 1.0 - scanline * uScanlineStrength * (0.82 + fresnel * 0.18);

		float sweepY = fract(uTime * 0.052);
		float sweep = exp(-pow((uv.y - sweepY) * 29.0, 2.0));
		color += uPrimaryColor * sweep * uSweepStrength;

		float noise = hash21(floor(uv * vec2(640.0, 360.0)) + timeBucket) - 0.5;
		color *= 1.0 + noise * uFlickerStrength;
		float opticalFlow = valueNoise(uv * vec2(3.2, 2.1) + vec2(uTime * 0.018, -uTime * 0.011));
		float innerDepth = exp(-abs(screenDistance) * 47.0);
		float edgePulse = 0.78 + 0.22 * sin(uTime * 0.92 + uv.y * 8.0 + opticalFlow * 2.4);
		color += mix(uPrimaryColor, uHighlightColor, innerDepth * 0.42) *
			innerDepth * uEdgeDepthStrength * edgePulse;

		color += uSecondaryColor * fresnel * uFresnelStrength * (0.35 + screenEdge * 0.65);

		vec2 vignetteUv = (uv - 0.5) * vec2(1.12, 1.0);
		float vignette = smoothstep(0.31, 0.77, dot(vignetteUv, vignetteUv));
		color *= 1.0 - vignette * uVignetteStrength;

		float centerDistance = roundedRectDistance(uv, uGalleryCenterRect.xy, uGalleryCenterRect.zw, 0.009);
		float leftDistance = roundedRectDistance(uv, uGalleryLeftRect.xy, uGalleryLeftRect.zw, 0.007);
		float rightDistance = roundedRectDistance(uv, uGalleryRightRect.xy, uGalleryRightRect.zw, 0.007);
		float frames = frameGlow(centerDistance, 0.0012, 155.0) * 1.22;
		frames += frameGlow(leftDistance, 0.001, 185.0) * 0.34;
		frames += frameGlow(rightDistance, 0.001, 185.0) * 0.34;

		float iridescence = 0.5 + 0.5 * sin(
			uTime * 1.15 + uv.x * 10.0 - uv.y * 7.0 + sin(uTime * 0.31) * 1.8
		);
		vec3 frameColor = mix(
			uPrimaryColor,
			uSecondaryColor,
			iridescence
		);
		// The real rounded plate edge is the display frame. Drawing another full
		// perimeter here makes the screen look like an inset panel.
		color += frameColor * frames * uFrameStrength;

		float tileFlash = galleryMosaicFlash(uv, uGalleryCenterRect, 0.0);
		tileFlash += galleryMosaicFlash(uv, uGalleryLeftRect, 1.0) * 0.38;
		tileFlash += galleryMosaicFlash(uv, uGalleryRightRect, 2.0) * 0.38;
		color += frameColor * tileFlash * uMosaicGlow;

		float alpha = centerSample.a * uOpacity * screenMask;
		gl_FragColor = vec4(color, alpha);
		#include <colorspace_fragment>
	}
`;

const glassFragmentShader = /* glsl */ `
	uniform float uOpacity;
	uniform float uCornerRadius;
	uniform float uGlassReflectionStrength;
	uniform float uFresnelStrength;
	uniform float uSurfaceNoiseStrength;
	uniform float uCoatingStrength;
	uniform float uEdgeGlowStrength;
	uniform float uDepthTintStrength;
	uniform float uHeadOnReflectionStrength;
	uniform float uBaseGlassVisibility;
	uniform vec3 uPrimaryColor;
	uniform vec3 uSecondaryColor;
	uniform vec3 uHighlightColor;
	varying vec2 vUv;
	varying vec3 vViewNormal;
	varying vec3 vViewDirection;

	const float SCREEN_ASPECT = 1.7777778;

	float hash21(vec2 p) {
		p = fract(p * vec2(123.34, 456.21));
		p += dot(p, p + 45.32);
		return fract(p.x * p.y);
	}

	float valueNoise(vec2 p) {
		vec2 cell = floor(p);
		vec2 local = fract(p);
		local = local * local * (3.0 - 2.0 * local);
		float a = hash21(cell);
		float b = hash21(cell + vec2(1.0, 0.0));
		float c = hash21(cell + vec2(0.0, 1.0));
		float d = hash21(cell + vec2(1.0, 1.0));
		return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
	}

	float softEllipse(vec2 point, vec2 center, vec2 scale, float falloff) {
		vec2 local = (point - center) * scale;
		return exp(-dot(local, local) * falloff);
	}

	float roundedRectDistance(vec2 point, vec2 minCorner, vec2 maxCorner, float radius) {
		point.x *= SCREEN_ASPECT;
		minCorner.x *= SCREEN_ASPECT;
		maxCorner.x *= SCREEN_ASPECT;
		vec2 center = (minCorner + maxCorner) * 0.5;
		vec2 halfSize = (maxCorner - minCorner) * 0.5;
		vec2 q = abs(point - center) - halfSize + radius;
		return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
	}

	void main() {
		vec2 uv = vUv;
		float screenDistance = roundedRectDistance(uv, vec2(0.0), vec2(1.0), uCornerRadius);
		float screenMask = 1.0 - smoothstep(-0.0015, 0.0015, screenDistance);
		if (screenMask <= 0.001) {
			discard;
		}

		float facing = clamp(abs(dot(normalize(vViewNormal), normalize(vViewDirection))), 0.0, 1.0);
		float fresnel = pow(1.0 - facing, 2.05);
		float headOn = pow(facing, 1.55);
		vec2 viewOffset = vViewDirection.xy / max(0.3, abs(vViewDirection.z));
		// The plate face is mostly planar. A very shallow optical bow gives its
		// clear coat a readable reflection field without changing the geometry.
		// This keeps the laminated front sheet visible even from a frontal view.
		vec2 lensUv = uv * 2.0 - 1.0;
		vec2 opticalBow = lensUv * vec2(0.038, 0.026);
		vec2 reflectionUv = uv + viewOffset * vec2(0.075, 0.052) + opticalBow;
		float flowNoise = valueNoise(reflectionUv * vec2(3.1, 2.3));
		float fineFlow = valueNoise(reflectionUv * vec2(8.7, 5.2));

		float reflectionAxis = reflectionUv.x * 0.78 + reflectionUv.y * 0.31;
		reflectionAxis += (flowNoise - 0.5) * 0.085 + (fineFlow - 0.5) * 0.018;
		float oppositeReflection = exp(-pow((reflectionUv.x * 0.36 - reflectionUv.y - 0.12 - viewOffset.y * 0.06) * 8.0, 2.0));
		float overheadSoftbox = softEllipse(
			reflectionUv,
			vec2(0.29, 0.91) + viewOffset * vec2(0.055, 0.038),
			vec2(0.92, 2.35),
			1.42
		);
		float overheadCore = softEllipse(
			reflectionUv,
			vec2(0.19, 0.98) + viewOffset * vec2(0.06, 0.04),
			vec2(1.32, 4.9),
			1.8
		);
		float sideSoftbox = softEllipse(
			reflectionUv,
			vec2(0.94, 0.54) + viewOffset * vec2(0.07, 0.045),
			vec2(2.45, 0.92),
			1.55
		);
		float sideCore = softEllipse(
			reflectionUv,
			vec2(1.03, 0.64) + viewOffset * vec2(0.075, 0.05),
			vec2(5.2, 1.45),
			1.75
		);
		float environmentReflection = (
			overheadSoftbox * 0.46 +
			overheadCore * 0.34 +
			sideSoftbox * 0.34 +
			sideCore * 0.24
		) * uHeadOnReflectionStrength;
		float clearCoatSpecular = environmentReflection * (0.72 + headOn * 0.62);
		float skyReflection = pow(
			smoothstep(0.18, 0.94, reflectionUv.y + viewOffset.y * 0.025),
			1.65
		) * (0.78 + flowNoise * 0.22);
		float studioHighlight = (
			overheadCore * 0.42 +
			sideCore * 0.22
		) * (0.76 + headOn * 0.34);

		float edgeCore = exp(-abs(screenDistance) * 420.0);
		float innerRim = exp(-abs(screenDistance) * 58.0);
		float deepRim = exp(-abs(screenDistance) * 22.0);
		float bevelLight = edgeCore * 1.2 + innerRim * 0.46 + deepRim * 0.12;
		float grain = valueNoise(uv * vec2(180.0, 100.0));
		float surface = (
			oppositeReflection * 0.18 +
			clearCoatSpecular * 0.22
		) * (0.62 + fresnel * 0.76);
		surface *= 1.0 + (grain - 0.5) * uSurfaceNoiseStrength;

		float coatingPhase = 0.5 + 0.5 * sin(
			reflectionAxis * 16.0 + fresnel * 5.5 + flowNoise * 2.8
		);
		vec3 coatingColor = mix(uPrimaryColor, uSecondaryColor, coatingPhase);
		coatingColor = mix(coatingColor, uHighlightColor, edgeCore * 0.36);
		float coating = (
			environmentReflection * 0.32 * headOn +
			fresnel * 0.48
		) *
			uCoatingStrength;

		vec3 neutralGlass = mix(uPrimaryColor, uHighlightColor, 0.3 + uv.y * 0.18);
		float laminate = uBaseGlassVisibility * (
			0.038 +
			headOn * 0.021 +
			flowNoise * 0.009
		);
		float thinFilm = 0.5 + 0.5 * sin(
			reflectionUv.x * 7.5 - reflectionUv.y * 4.2 + flowNoise * 2.1
		);
		vec3 clearCoatColor = mix(
			uHighlightColor,
			mix(uPrimaryColor, uSecondaryColor, thinFilm),
			0.22
		);
		vec3 color = neutralGlass * laminate;
		color += coatingColor * surface * uGlassReflectionStrength;
		color += clearCoatColor * clearCoatSpecular * uGlassReflectionStrength * 0.42;
		color += mix(uSecondaryColor, uHighlightColor, 0.74) *
			skyReflection * uBaseGlassVisibility * 0.075;
		color += uHighlightColor * studioHighlight * uGlassReflectionStrength * 0.25;
		color += coatingColor * coating;
		color += uSecondaryColor * fresnel * uFresnelStrength;
		color += mix(uPrimaryColor, uHighlightColor, 0.36) * bevelLight * uEdgeGlowStrength;
		color += uPrimaryColor * uDepthTintStrength * (0.035 + deepRim * 0.095);

		float alpha = (
			0.018 +
			laminate * 0.58 +
			clearCoatSpecular * 0.095 * uGlassReflectionStrength +
			skyReflection * 0.026 * uBaseGlassVisibility +
			studioHighlight * 0.065 * uGlassReflectionStrength +
			uDepthTintStrength * 0.026 +
			surface * 0.22 * uGlassReflectionStrength +
			coating * 0.13 +
			fresnel * 0.28 * uFresnelStrength +
			bevelLight * 0.11 * uEdgeGlowStrength
		) * uOpacity * screenMask;
		gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.52));
		#include <colorspace_fragment>
	}
`;

export function createHubPlateCasePanelMaterial(texture, galleryAtlas, config = {}) {
	const mosaicTiles = config.mosaicTiles ?? [22, 10];
	const galleryRect = (values) => new THREE.Vector4(values[0], values[1], values[2], values[3]);
	return new THREE.ShaderMaterial({
		name: "HubPlateCasePanelMaterial",
		uniforms: {
			uMap: { value: texture },
			uGalleryAtlas: { value: galleryAtlas },
			uOpacity: { value: 0 },
			uTime: { value: 0 },
			uBrightness: { value: config.brightness ?? 1.16 },
			uCyanMix: { value: config.cyanMix ?? 0.12 },
			uScanlineStrength: { value: config.scanlineStrength ?? 0.065 },
			uFlickerStrength: { value: config.flickerStrength ?? 0.018 },
			uSweepStrength: { value: config.sweepStrength ?? 0.12 },
			uChromaticShift: { value: config.chromaticShift ?? 0.0009 },
			uCornerRadius: { value: config.cornerRadius ?? 0.035 },
			uFrameStrength: { value: config.frameStrength ?? 0.42 },
			uGalleryFromIndex: { value: 0 },
			uGalleryToIndex: { value: 0 },
			uGallerySelectedIndex: { value: 0 },
			uGalleryProgress: { value: 1 },
			uGalleryLeftRect: { value: galleryRect(HUB_PLATE_GALLERY_UV_RECTS.left) },
			uGalleryCenterRect: { value: galleryRect(HUB_PLATE_GALLERY_UV_RECTS.center) },
			uGalleryRightRect: { value: galleryRect(HUB_PLATE_GALLERY_UV_RECTS.right) },
			uMosaicTiles: { value: new THREE.Vector2(mosaicTiles[0], mosaicTiles[1]) },
			uMosaicSoftness: { value: config.mosaicSoftness ?? 0.28 },
			uMosaicScatter: { value: config.mosaicScatter ?? 0.045 },
			uMosaicGlow: { value: config.mosaicGlow ?? 0.52 },
			uPrimaryColor: { value: new THREE.Color(config.primaryColor ?? "#00a9ff") },
			uSecondaryColor: { value: new THREE.Color(config.secondaryColor ?? "#78dcff") },
			uHighlightColor: { value: new THREE.Color(config.highlightColor ?? "#d7f6ff") },
			uFresnelStrength: { value: config.fresnelStrength ?? 0.18 },
			uVignetteStrength: { value: config.vignetteStrength ?? 0.1 },
			uBacklightStrength: { value: config.backlightStrength ?? 0.62 },
			uContrast: { value: config.contrast ?? 1.08 },
			uEdgeDepthStrength: { value: config.edgeDepthStrength ?? 0.18 },
		},
		vertexShader,
		fragmentShader,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
		side: THREE.DoubleSide,
	});
}

export function createHubPlateCasePanelGlassMaterial(config = {}) {
	return new THREE.ShaderMaterial({
		name: "HubPlateCasePanelGlassMaterial",
		uniforms: {
			uOpacity: { value: 0 },
			uCornerRadius: { value: config.cornerRadius ?? 0.035 },
			uGlassReflectionStrength: { value: config.glassReflectionStrength ?? 0.34 },
			uFresnelStrength: { value: config.fresnelStrength ?? 0.28 },
			uSurfaceNoiseStrength: { value: config.surfaceNoiseStrength ?? 0.18 },
			uCoatingStrength: { value: config.coatingStrength ?? 0.34 },
			uEdgeGlowStrength: { value: config.edgeGlowStrength ?? 0.62 },
			uDepthTintStrength: { value: config.depthTintStrength ?? 0.22 },
			uHeadOnReflectionStrength: { value: config.headOnReflectionStrength ?? 0.72 },
			uBaseGlassVisibility: { value: config.baseGlassVisibility ?? 0.58 },
			uPrimaryColor: { value: new THREE.Color(config.primaryColor ?? "#00a9ff") },
			uSecondaryColor: { value: new THREE.Color(config.secondaryColor ?? "#78dcff") },
			uHighlightColor: { value: new THREE.Color(config.highlightColor ?? "#d7f6ff") },
		},
		vertexShader,
		fragmentShader: glassFragmentShader,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
		side: THREE.DoubleSide,
	});
}

export function setHubPlateCasePanelOpacity(material, opacity) {
	if (material?.uniforms?.uOpacity) {
		material.uniforms.uOpacity.value = Math.max(0, Math.min(1, opacity));
	}
}

export function getHubPlateCasePanelOpacity(material) {
	return material?.uniforms?.uOpacity?.value ?? 0;
}

export function setHubPlateCasePanelGalleryTransition(material, fromIndex, toIndex, progress) {
	if (!material?.uniforms) {
		return;
	}
	material.uniforms.uGalleryFromIndex.value = fromIndex;
	material.uniforms.uGalleryToIndex.value = toIndex;
	material.uniforms.uGalleryProgress.value = Math.max(0, Math.min(1, progress));
}

export function setHubPlateCasePanelGallerySelection(material, selectedIndex) {
	if (material?.uniforms?.uGallerySelectedIndex) {
		material.uniforms.uGallerySelectedIndex.value = selectedIndex;
	}
}

export function updateHubPlateCasePanelMaterial(material, timeSeconds) {
	if (material?.uniforms?.uTime) {
		material.uniforms.uTime.value = timeSeconds;
	}
}
