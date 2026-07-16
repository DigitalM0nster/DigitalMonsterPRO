import * as THREE from "three";
import { resolveCaseStudyArcGeometry } from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcGeometry.js";
import { caseStudyArcInternals } from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcConfig.js";
import { getProjectBySlug } from "@/portfolio/core/projectRegistry.js";
import { resolveCaseStudyLayout } from "@/portfolio/ui/CaseStudyCanvas/caseStudyCanvasLayout.js";
import {
	measureCaseProjectNavigationAllProjectsContentBounds,
	measureCaseProjectNavigationSwitchLabelBounds,
	resolveCaseProjectCanvasNavigationLayout,
} from "@/portfolio/ui/CaseStudyCanvas/caseProjectCanvasNavigation.js";
import { store } from "@/store.jsx";
import {
	BOTTOM_STOP_T_KEYS,
	NAV_LABEL_SHADE_IDS,
	caseStudyEdgeShadeConfig,
} from "./caseStudyEdgeShadeConfig.js";

/** Smooth follow for content-fit shade rects (1/s). */
const SHADE_RECT_SMOOTH = 7;

/** @type {null | { x: number, width: number, bottom: number, height: number, soft: number, softY: number }} */
let animatedLeftShadeRect = null;
/** @type {Map<string, { x: number, width: number, bottom: number, height: number, soft: number, softY: number }>} */
const animatedNavLabelShadeRects = new Map();

const NAV_SHADE_UNIFORM_PREFIX = {
	previousDirection: "uPrevDir",
	nextDirection: "uNextDir",
	previousName: "uPrevName",
	nextName: "uNextName",
};

/**
 * Case-page edge darkening over bg+models only (HUD/arc stay bright).
 * Bottom: left «ALL PROJECTS» cluster + four prev/next text clusters.
 */
const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform float uOpacity;
uniform float uBottomPower;
uniform float uArcShadeEnabled;
uniform float uBottomShadeEnabled;
uniform vec2 uViewportPx;
uniform vec2 uArcCenterPx;
uniform float uArcRadiusPx;
uniform float uArcShadeBandPx;
uniform float uArcStopSolid;
uniform float uArcStopMid;
uniform float uArcMidAlpha;
uniform float uArcStopFade;
uniform float uBottomStop0T;
uniform float uBottomStop1T;
uniform float uBottomStop2T;
uniform float uBottomStop3T;
uniform float uBottomStop4T;
uniform float uBottomStop5T;
uniform float uBottomStop6T;
uniform vec2 uBottomLeftMinMaxX;
uniform float uBottomLeftOffsetUv;
uniform float uBottomLeftHeightUv;
uniform float uBottomLeftSoftXUv;
uniform float uBottomLeftSoftYUv;
uniform vec2 uPrevDirMinMaxX;
uniform float uPrevDirOffsetUv;
uniform float uPrevDirHeightUv;
uniform float uPrevDirSoftXUv;
uniform float uPrevDirSoftYUv;
uniform vec2 uNextDirMinMaxX;
uniform float uNextDirOffsetUv;
uniform float uNextDirHeightUv;
uniform float uNextDirSoftXUv;
uniform float uNextDirSoftYUv;
uniform vec2 uPrevNameMinMaxX;
uniform float uPrevNameOffsetUv;
uniform float uPrevNameHeightUv;
uniform float uPrevNameSoftXUv;
uniform float uPrevNameSoftYUv;
uniform vec2 uNextNameMinMaxX;
uniform float uNextNameOffsetUv;
uniform float uNextNameHeightUv;
uniform float uNextNameSoftXUv;
uniform float uNextNameSoftYUv;
varying vec2 vUv;

float alphaFromStops(float t, float stopSolid, float stopMid, float midAlpha, float stopFade) {
	float s0 = clamp(stopSolid, 0.0, 1.0);
	float s1 = clamp(max(stopMid, s0), 0.0, 1.0);
	float s2 = clamp(max(stopFade, s1), 0.0001, 1.0);
	float aMid = clamp(midAlpha, 0.0, 1.0);

	if (t <= s0) {
		return 1.0;
	}
	if (t <= s1) {
		float u = (t - s0) / max(s1 - s0, 0.0001);
		return mix(1.0, aMid, u);
	}
	if (t <= s2) {
		float u = (t - s1) / max(s2 - s1, 0.0001);
		return mix(aMid, 0.0, u);
	}
	return 0.0;
}

float alphaFromSevenStops(
	float t,
	float t0, float t1, float t2, float t3, float t4, float t5, float t6
) {
	float s0 = clamp(t0, 0.0, 1.0);
	float s1 = clamp(max(t1, s0), 0.0, 1.0);
	float s2 = clamp(max(t2, s1), 0.0, 1.0);
	float s3 = clamp(max(t3, s2), 0.0, 1.0);
	float s4 = clamp(max(t4, s3), 0.0, 1.0);
	float s5 = clamp(max(t5, s4), 0.0, 1.0);
	float s6 = clamp(max(t6, s5), 0.0001, 1.0);

	float a0 = 1.0;
	float a1 = 5.0 / 6.0;
	float a2 = 4.0 / 6.0;
	float a3 = 3.0 / 6.0;
	float a4 = 2.0 / 6.0;
	float a5 = 1.0 / 6.0;
	float a6 = 0.0;

	if (t <= s0) {
		return a0;
	}
	if (t <= s1) {
		return mix(a0, a1, (t - s0) / max(s1 - s0, 0.0001));
	}
	if (t <= s2) {
		return mix(a1, a2, (t - s1) / max(s2 - s1, 0.0001));
	}
	if (t <= s3) {
		return mix(a2, a3, (t - s2) / max(s3 - s2, 0.0001));
	}
	if (t <= s4) {
		return mix(a3, a4, (t - s3) / max(s4 - s3, 0.0001));
	}
	if (t <= s5) {
		return mix(a4, a5, (t - s4) / max(s5 - s4, 0.0001));
	}
	if (t <= s6) {
		return mix(a5, a6, (t - s5) / max(s6 - s5, 0.0001));
	}
	return a6;
}

float softBandX(float x, float minX, float maxX, float soft) {
	if (maxX <= minX + 0.0001) {
		return 0.0;
	}
	float s = min(max(soft, 0.0001), (maxX - minX) * 0.45);
	float left = smoothstep(minX, minX + s, x);
	float right = 1.0 - smoothstep(maxX - s, maxX, x);
	return clamp(min(left, right), 0.0, 1.0);
}

float bottomClusterAlpha(
	float x,
	float y,
	vec2 minMaxX,
	float y0,
	float heightUv,
	float softX,
	float softY
) {
	if (heightUv <= 0.0001 || minMaxX.y <= minMaxX.x + 0.0001) {
		return 0.0;
	}
	float y1 = y0 + heightUv;
	if (y < y0 || y > y1) {
		return 0.0;
	}

	// Soft only the lower edge — top fade comes from the 7-stop curve.
	float softEnter = softY <= 0.00001
		? 1.0
		: smoothstep(y0, y0 + min(softY, heightUv * 0.5), y);

	float rawT = (y - y0) / max(heightUv, 0.0001);
	float shapedT = pow(clamp(rawT, 0.0, 1.0), max(uBottomPower, 0.05));
	float vertical = clamp(
		alphaFromSevenStops(
			shapedT,
			uBottomStop0T,
			uBottomStop1T,
			uBottomStop2T,
			uBottomStop3T,
			uBottomStop4T,
			uBottomStop5T,
			uBottomStop6T
		),
		0.0,
		1.0
	);
	return vertical * softEnter * softBandX(x, minMaxX.x, minMaxX.y, softX);
}

void main() {
	float alpha = 0.0;

	if (uArcShadeEnabled > 0.5 && uArcShadeBandPx > 0.5) {
		vec2 pos = vec2(vUv.x * uViewportPx.x, (1.0 - vUv.y) * uViewportPx.y);
		vec2 delta = pos - uArcCenterPx;
		float dist = length(delta);
		float outside = dist - uArcRadiusPx;
		if (outside > 0.0 && delta.x > 0.0) {
			float t = outside >= uArcShadeBandPx
				? 0.0
				: 1.0 - outside / uArcShadeBandPx;
			alpha = max(
				alpha,
				alphaFromStops(t, uArcStopSolid, uArcStopMid, uArcMidAlpha, uArcStopFade)
			);
		}
	}

	if (uBottomShadeEnabled > 0.5) {
		alpha = max(
			alpha,
			bottomClusterAlpha(
				vUv.x,
				vUv.y,
				uBottomLeftMinMaxX,
				uBottomLeftOffsetUv,
				uBottomLeftHeightUv,
				uBottomLeftSoftXUv,
				uBottomLeftSoftYUv
			)
		);
		alpha = max(
			alpha,
			bottomClusterAlpha(
				vUv.x,
				vUv.y,
				uPrevDirMinMaxX,
				uPrevDirOffsetUv,
				uPrevDirHeightUv,
				uPrevDirSoftXUv,
				uPrevDirSoftYUv
			)
		);
		alpha = max(
			alpha,
			bottomClusterAlpha(
				vUv.x,
				vUv.y,
				uNextDirMinMaxX,
				uNextDirOffsetUv,
				uNextDirHeightUv,
				uNextDirSoftXUv,
				uNextDirSoftYUv
			)
		);
		alpha = max(
			alpha,
			bottomClusterAlpha(
				vUv.x,
				vUv.y,
				uPrevNameMinMaxX,
				uPrevNameOffsetUv,
				uPrevNameHeightUv,
				uPrevNameSoftXUv,
				uPrevNameSoftYUv
			)
		);
		alpha = max(
			alpha,
			bottomClusterAlpha(
				vUv.x,
				vUv.y,
				uNextNameMinMaxX,
				uNextNameOffsetUv,
				uNextNameHeightUv,
				uNextNameSoftXUv,
				uNextNameSoftYUv
			)
		);
	}

	alpha *= clamp(uOpacity, 0.0, 1.0);
	if (alpha <= 0.0001) {
		discard;
	}

	gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
}
`;

function makeClusterUniforms(prefix) {
	return {
		[`${prefix}MinMaxX`]: { value: new THREE.Vector2(0, 0) },
		[`${prefix}OffsetUv`]: { value: 0 },
		[`${prefix}HeightUv`]: { value: 0 },
		[`${prefix}SoftXUv`]: { value: 0.04 },
		[`${prefix}SoftYUv`]: { value: 0.04 },
	};
}

export function createCaseStudyEdgeShadeMaterial() {
	return new THREE.ShaderMaterial({
		uniforms: {
			uOpacity: { value: 0 },
			uBottomPower: { value: 1 },
			uArcShadeEnabled: { value: 0 },
			uBottomShadeEnabled: { value: 0 },
			uViewportPx: { value: new THREE.Vector2(1, 1) },
			uArcCenterPx: { value: new THREE.Vector2(0, 0) },
			uArcRadiusPx: { value: 0 },
			uArcShadeBandPx: { value: 0 },
			uArcStopSolid: { value: 0.15 },
			uArcStopMid: { value: 0.55 },
			uArcMidAlpha: { value: 0.45 },
			uArcStopFade: { value: 1 },
			uBottomStop0T: { value: 0 },
			uBottomStop1T: { value: 0.1 },
			uBottomStop2T: { value: 0.22 },
			uBottomStop3T: { value: 0.38 },
			uBottomStop4T: { value: 0.55 },
			uBottomStop5T: { value: 0.75 },
			uBottomStop6T: { value: 1 },
			...makeClusterUniforms("uBottomLeft"),
			...makeClusterUniforms("uPrevDir"),
			...makeClusterUniforms("uNextDir"),
			...makeClusterUniforms("uPrevName"),
			...makeClusterUniforms("uNextName"),
		},
		vertexShader,
		fragmentShader,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
		blending: THREE.NormalBlending,
	});
}

/**
 * @param {number} viewportH
 */
function resolveArcVerticalBounds(viewportH) {
	const top = Math.min(116, Math.max(88, viewportH * 0.105));
	const bottom = Math.max(top + 120, viewportH * 0.88);
	return { top, bottom };
}

function finiteOr(value, fallback) {
	return Number.isFinite(value) ? value : fallback;
}

function resolveActiveCaseProject() {
	const slug = store.portfolioExperience?.slug;
	return slug ? getProjectBySlug(slug) : null;
}

/**
 * Auto layout: elevated under nav, with an extra soft skirt toward the screen bottom.
 * @param {number} viewportW
 * @param {number} viewportH
 */
export function resolveBottomShadeClusterLayout(viewportW, viewportH) {
	const cfg = caseStudyEdgeShadeConfig;
	const layout = resolveCaseStudyLayout(viewportW, viewportH, 1, { x: 0, y: 0 }, null, {});
	const nav = resolveCaseProjectCanvasNavigationLayout(
		viewportW,
		viewportH,
		layout?.leftPanel ?? null,
	);
	const padX = Math.max(0, cfg.bottomClusterPadX || 0);
	const padY = Math.max(0, cfg.bottomClusterPadY || 0);
	const softX = Math.max(0, cfg.bottomClusterSoftPx || 0);
	const softY = Math.max(0, cfg.bottomClusterSoftYPx || 0);
	const padBelow = Math.min(padY, 16);

	const makeCluster = (x0, w0, navY, navH) => {
		const x = Math.max(0, x0 - padX);
		const width = Math.max(8, Math.min(viewportW, x0 + w0 + padX) - x);
		const solidBottomY = Math.min(viewportH, navY + navH + padBelow);
		const solidTopY = Math.max(0, navY - padY);
		const bandBottomY = Math.min(viewportH, solidBottomY + softY);
		const bottom = Math.max(0, viewportH - bandBottomY);
		const height = Math.max(24, bandBottomY - solidTopY);
		return {
			x,
			width,
			bottom,
			height,
			soft: Math.min(softX, width * 0.45),
			softY: Math.min(softY, height * 0.5),
		};
	};

	const rightX0 = nav.previous.x;
	const rightW0 = Math.max(8, (nav.next.x + nav.next.w) - nav.previous.x);

	return {
		left: makeCluster(nav.allProjects.x, nav.allProjects.w, nav.allProjects.y, nav.allProjects.h),
		right: makeCluster(rightX0, rightW0, nav.previous.y, nav.previous.h),
	};
}

/**
 * @param {number} viewportW
 * @param {number} width
 * @param {number} rightInset
 */
export function resolveBottomRightShadeX(viewportW, width, rightInset) {
	return viewportW - width - rightInset;
}

/**
 * @param {{ left: number, right: number, top: number, bottom: number }} bounds
 * @param {number} viewportW
 * @param {number} viewportH
 * @param {{ padX: number, padY: number, softX: number, softY: number }} soft
 */
function glyphBoundsToShadeRect(bounds, viewportW, viewportH, soft) {
	const textW = Math.max(0, bounds.right - bounds.left);
	if (textW < 1) {
		return {
			x: 0,
			width: 0,
			bottom: 0,
			height: 0,
			soft: 0,
			softY: 0,
			contentFit: true,
		};
	}

	const x = Math.max(0, bounds.left - soft.padX);
	const right = Math.min(viewportW, bounds.right + soft.padX);
	const width = Math.max(8, right - x);
	const solidTopY = Math.max(0, bounds.top - soft.padY);
	const solidBottomY = Math.min(viewportH, bounds.bottom + soft.padY);
	const bandBottomY = Math.min(viewportH, solidBottomY + soft.softY);
	const bottom = Math.max(0, viewportH - bandBottomY);
	const height = Math.max(16, bandBottomY - solidTopY);

	return {
		x,
		width,
		bottom,
		height,
		soft: Math.min(soft.softX, width * 0.45),
		softY: Math.min(soft.softY, height * 0.5),
		contentFit: true,
	};
}

/**
 * Content-fit target: tight bounds around current-locale «ALL PROJECTS» glyphs.
 * @param {number} viewportW
 * @param {number} viewportH
 */
function resolveContentFitLeftShadeRect(viewportW, viewportH) {
	const cfg = caseStudyEdgeShadeConfig;
	const layout = resolveCaseStudyLayout(viewportW, viewportH, 1, { x: 0, y: 0 }, null, {});
	const project = resolveActiveCaseProject();
	const locale = store.siteLocale;
	const bounds = measureCaseProjectNavigationAllProjectsContentBounds(
		project,
		viewportW,
		viewportH,
		layout?.leftPanel ?? null,
		locale,
	);
	const padX = Math.max(0, finiteOr(cfg.bottomLeftContentPadXPx, 28));
	const height = Math.max(24, finiteOr(cfg.bottomLeftHeightPx, 110));
	const soft = Math.max(0, finiteOr(cfg.bottomLeftSoftPx, 72));
	const softY = Math.max(0, finiteOr(cfg.bottomLeftSoftYPx, 64));
	const bottom = Math.max(0, finiteOr(cfg.bottomLeftBottomPx, 0));

	let x;
	let width;
	if (bounds) {
		x = Math.max(0, bounds.left - padX);
		width = Math.max(8, Math.min(viewportW, bounds.right + padX) - x);
	} else {
		const nav = resolveCaseProjectCanvasNavigationLayout(
			viewportW,
			viewportH,
			layout?.leftPanel ?? null,
		);
		x = Math.max(0, nav.allProjects.x - padX);
		width = Math.max(8, Math.min(viewportW, nav.allProjects.x + nav.allProjects.w + padX) - x);
	}

	cfg.bottomLeftXPx = Math.round(x);
	cfg.bottomLeftWidthPx = Math.round(width);
	return {
		x,
		width,
		bottom,
		height,
		soft: Math.min(soft, width * 0.45),
		softY: Math.min(softY, height * 0.5),
		contentFit: true,
		manual: true,
	};
}

/**
 * @param {null | { x: number, width: number, bottom: number, height: number, soft: number, softY: number }} current
 * @param {{ x: number, width: number, bottom: number, height: number, soft: number, softY: number }} target
 * @param {number} dt
 */
function easeShadeRect(current, target, dt) {
	if (!current) {
		return { ...target };
	}
	const k = 1 - Math.exp(-SHADE_RECT_SMOOTH * Math.max(0, dt));
	current.x += (target.x - current.x) * k;
	current.width += (target.width - current.width) * k;
	current.bottom += (target.bottom - current.bottom) * k;
	current.height += (target.height - current.height) * k;
	current.soft += (target.soft - current.soft) * k;
	current.softY += (target.softY - current.softY) * k;
	return current;
}

/**
 * @param {{ x: number, width: number, bottom: number, height: number, soft: number, softY: number }} target
 * @param {number} dt
 */
function easeLeftShadeRect(target, dt) {
	animatedLeftShadeRect = easeShadeRect(animatedLeftShadeRect, target, dt);
	return animatedLeftShadeRect;
}

/**
 * @param {string} id
 * @param {{ x: number, width: number, bottom: number, height: number, soft: number, softY: number }} target
 * @param {number} dt
 */
function easeNavLabelShadeRect(id, target, dt) {
	const next = easeShadeRect(animatedNavLabelShadeRects.get(id) ?? null, target, dt);
	animatedNavLabelShadeRects.set(id, next);
	return next;
}

/**
 * @param {number} viewportW
 * @param {number} viewportH
 */
export function resolveBottomLeftShadeRect(viewportW, viewportH) {
	const cfg = caseStudyEdgeShadeConfig;
	const auto = resolveBottomShadeClusterLayout(viewportW, viewportH).left;
	if (!cfg.bottomLeftManual) {
		return { ...auto, manual: false };
	}
	if (cfg.bottomLeftContentFit !== false) {
		return resolveContentFitLeftShadeRect(viewportW, viewportH);
	}
	const width = Math.max(8, finiteOr(cfg.bottomLeftWidthPx, auto.width));
	const height = Math.max(24, finiteOr(cfg.bottomLeftHeightPx, auto.height));
	const soft = Math.max(0, finiteOr(cfg.bottomLeftSoftPx, auto.soft));
	const softY = Math.max(0, finiteOr(cfg.bottomLeftSoftYPx, auto.softY));
	const x = Math.max(0, finiteOr(cfg.bottomLeftXPx, auto.x));
	cfg.bottomLeftXPx = Math.round(x);
	cfg.bottomLeftWidthPx = Math.round(width);
	return {
		x,
		width,
		bottom: Math.max(0, finiteOr(cfg.bottomLeftBottomPx, auto.bottom)),
		height,
		soft: Math.min(soft, width * 0.45),
		softY: Math.min(softY, height * 0.5),
		contentFit: false,
		manual: true,
	};
}

/**
 * Four content-fit clusters under prev/next direction + project-name lines.
 * @param {number} viewportW
 * @param {number} viewportH
 */
export function resolveNavLabelShadeRects(viewportW, viewportH) {
	const cfg = caseStudyEdgeShadeConfig;
	const layout = resolveCaseStudyLayout(viewportW, viewportH, 1, { x: 0, y: 0 }, null, {});
	const project = resolveActiveCaseProject();
	const locale = store.siteLocale;
	const labels = measureCaseProjectNavigationSwitchLabelBounds(
		project,
		viewportW,
		viewportH,
		layout?.leftPanel ?? null,
		locale,
	);
	const soft = {
		padX: Math.max(0, finiteOr(cfg.bottomNavLabelPadXPx, 18)),
		padY: Math.max(0, finiteOr(cfg.bottomNavLabelPadYPx, 12)),
		softX: Math.max(0, finiteOr(cfg.bottomNavLabelSoftPx, 40)),
		softY: Math.max(0, finiteOr(cfg.bottomNavLabelSoftYPx, 36)),
	};

	/** @type {Record<string, { x: number, width: number, bottom: number, height: number, soft: number, softY: number, contentFit: boolean }>} */
	const rects = {};
	for (const id of NAV_LABEL_SHADE_IDS) {
		const bounds = labels?.[id];
		rects[id] = bounds
			? glyphBoundsToShadeRect(bounds, viewportW, viewportH, soft)
			: {
				x: 0,
				width: 0,
				bottom: 0,
				height: 0,
				soft: 0,
				softY: 0,
				contentFit: true,
			};
	}
	return rects;
}

/**
 * @deprecated Use resolveNavLabelShadeRects — kept as a union bbox for legacy callers.
 * @param {number} viewportW
 * @param {number} viewportH
 */
export function resolveBottomRightShadeRect(viewportW, viewportH) {
	const rects = resolveNavLabelShadeRects(viewportW, viewportH);
	let minX = Infinity;
	let maxX = -Infinity;
	let minBottom = Infinity;
	let maxTop = -Infinity;
	let soft = 0;
	let softY = 0;
	for (const id of NAV_LABEL_SHADE_IDS) {
		const rect = rects[id];
		if (!rect || rect.width < 1) {
			continue;
		}
		minX = Math.min(minX, rect.x);
		maxX = Math.max(maxX, rect.x + rect.width);
		minBottom = Math.min(minBottom, rect.bottom);
		maxTop = Math.max(maxTop, rect.bottom + rect.height);
		soft = Math.max(soft, rect.soft);
		softY = Math.max(softY, rect.softY);
	}
	if (!Number.isFinite(minX)) {
		const auto = resolveBottomShadeClusterLayout(viewportW, viewportH).right;
		return { ...auto, contentFit: true, manual: true };
	}
	return {
		x: minX,
		width: Math.max(8, maxX - minX),
		bottom: minBottom,
		height: Math.max(16, maxTop - minBottom),
		soft,
		softY,
		contentFit: true,
		manual: true,
	};
}

/**
 * @param {number} [viewportW]
 * @param {number} [viewportH]
 */
export function syncBottomRightShadeConfigFromLayout(viewportW, viewportH) {
	const w = Math.max(1, viewportW || (typeof window !== "undefined" ? window.innerWidth : 1920));
	const h = Math.max(1, viewportH || (typeof window !== "undefined" ? window.innerHeight : 1080));
	const cfg = caseStudyEdgeShadeConfig;
	cfg.bottomNavLabelContentFit = true;
	cfg.bottomLeftManual = true;
	cfg.bottomLeftContentFit = true;
	resolveContentFitLeftShadeRect(w, h);
	return resolveNavLabelShadeRects(w, h);
}

/**
 * @param {THREE.ShaderMaterial} material
 * @param {string} name
 * @param {number | THREE.Vector2} value
 */
function setUniform(material, name, value) {
	const uniform = material.uniforms?.[name];
	if (!uniform) {
		return;
	}
	if (value instanceof THREE.Vector2) {
		uniform.value.copy(value);
		return;
	}
	if (Number.isFinite(value)) {
		uniform.value = value;
	}
}

/**
 * @param {THREE.ShaderMaterial} material
 * @param {string} prefix
 * @param {{ x: number, width: number, bottom: number, height: number, soft: number, softY: number } | null | undefined} rect
 * @param {number} viewportW
 * @param {number} viewportH
 */
function applyClusterUniforms(material, prefix, rect, viewportW, viewportH) {
	if (!rect || rect.width < 1 || rect.height < 1) {
		material.uniforms[`${prefix}MinMaxX`]?.value?.set(0, 0);
		setUniform(material, `${prefix}OffsetUv`, 0);
		setUniform(material, `${prefix}HeightUv`, 0);
		setUniform(material, `${prefix}SoftXUv`, 0);
		setUniform(material, `${prefix}SoftYUv`, 0);
		return;
	}

	material.uniforms[`${prefix}MinMaxX`]?.value?.set(
		rect.x / viewportW,
		(rect.x + rect.width) / viewportW,
	);
	setUniform(material, `${prefix}OffsetUv`, rect.bottom / viewportH);
	setUniform(material, `${prefix}HeightUv`, Math.min(1, rect.height / viewportH));
	setUniform(
		material,
		`${prefix}SoftXUv`,
		Math.min(rect.width * 0.45, Math.max(0, rect.soft)) / viewportW,
	);
	setUniform(
		material,
		`${prefix}SoftYUv`,
		Math.min(rect.height * 0.5, Math.max(0, rect.softY)) / viewportH,
	);
}

/**
 * @param {THREE.ShaderMaterial} material
 * @param {{ opacity: number, viewportW: number, viewportH: number, right?: boolean, bottom?: boolean, delta?: number }} opts
 */
export function applyCaseStudyEdgeShadeUniforms(material, opts) {
	if (!material?.uniforms) {
		return;
	}
	const cfg = caseStudyEdgeShadeConfig;
	const viewportW = Math.max(1, opts.viewportW || 1);
	const viewportH = Math.max(1, opts.viewportH || 1);
	const delta = Number.isFinite(opts.delta) ? Math.max(0, opts.delta) : 1 / 60;
	const right = opts.right !== false && cfg.rightEnabled !== false;
	const bottom = opts.bottom !== false && cfg.bottomEnabled !== false;

	setUniform(material, "uOpacity", Math.max(0, Math.min(1, opts.opacity ?? 0)));
	material.uniforms.uViewportPx?.value?.set(viewportW, viewportH);

	setUniform(material, "uArcStopSolid", cfg.arcStopSolid);
	setUniform(material, "uArcStopMid", cfg.arcStopMid);
	setUniform(material, "uArcMidAlpha", cfg.arcMidAlpha);
	setUniform(material, "uArcStopFade", cfg.arcStopFade);

	setUniform(material, "uBottomShadeEnabled", bottom ? 1 : 0);
	setUniform(material, "uBottomPower", Math.max(0.05, cfg.bottomPower || 1));

	for (let i = 0; i < BOTTOM_STOP_T_KEYS.length; i += 1) {
		const key = BOTTOM_STOP_T_KEYS[i];
		setUniform(material, `uBottomStop${i}T`, cfg[key]);
	}

	if (bottom) {
		const leftTarget = resolveBottomLeftShadeRect(viewportW, viewportH);
		const leftRect = leftTarget.contentFit
			? easeLeftShadeRect(leftTarget, delta)
			: leftTarget;
		applyClusterUniforms(material, "uBottomLeft", leftRect, viewportW, viewportH);

		const navTargets = resolveNavLabelShadeRects(viewportW, viewportH);
		const contentFit = cfg.bottomNavLabelContentFit !== false;
		for (const id of NAV_LABEL_SHADE_IDS) {
			const target = navTargets[id];
			const rect = contentFit
				? easeNavLabelShadeRect(id, target, delta)
				: target;
			applyClusterUniforms(material, NAV_SHADE_UNIFORM_PREFIX[id], rect, viewportW, viewportH);
		}
	} else {
		applyClusterUniforms(material, "uBottomLeft", null, viewportW, viewportH);
		for (const id of NAV_LABEL_SHADE_IDS) {
			applyClusterUniforms(material, NAV_SHADE_UNIFORM_PREFIX[id], null, viewportW, viewportH);
		}
	}

	if (!right) {
		setUniform(material, "uArcShadeEnabled", 0);
		setUniform(material, "uArcShadeBandPx", 0);
		return;
	}

	const geo = resolveCaseStudyArcGeometry(
		viewportW,
		viewportH,
		caseStudyArcInternals.maxNavItems,
		false,
		resolveArcVerticalBounds(viewportH),
	);
	const rightClearance = Math.max(0, viewportW - (geo.centerX + geo.radius));
	const shadeBand = Math.max(
		rightClearance + Math.max(0, cfg.arcBandPadPx),
		Math.min(Math.max(8, cfg.arcBandMaxPx), viewportW * Math.max(0.02, cfg.arcBandVw)),
		geo.radius * 0.22,
	);

	setUniform(material, "uArcShadeEnabled", 1);
	material.uniforms.uArcCenterPx?.value?.set(geo.centerX, geo.centerY);
	setUniform(material, "uArcRadiusPx", Math.max(1, geo.radius + (cfg.arcRadiusInsetPx || 0)));
	setUniform(material, "uArcShadeBandPx", shadeBand);
}
