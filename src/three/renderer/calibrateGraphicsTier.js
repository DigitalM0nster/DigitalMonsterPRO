import * as THREE from "three";

import { getForcedGraphicsTierFromUrl } from "@/utils/getGraphicsTier.js";

const TIER_RANK = { low: 0, medium: 1, high: 2 };
const CACHE_PREFIX = "digitalmonster_gpu_tier_v2";
const SOFTWARE_RENDERER_RE = /swiftshader|llvmpipe|software|microsoft basic render/i;
const INTEGRATED_RENDERER_RE = /intel(?:\(r\))?\s+(?:uhd|hd|iris)|radeon\s+vega/i;
const HIGH_DISCRETE_RENDERER_RE = /(?:geforce\s+(?:rtx|gtx)|radeon\s+rx|apple\s+m[1-9])/i;

function lowerTier(a, b) {
	return TIER_RANK[a] <= TIER_RANK[b] ? a : b;
}

function readRendererName(renderer) {
	const gl = renderer.getContext();
	try {
		const debug = gl.getExtension("WEBGL_debug_renderer_info");
		return String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || "unknown");
	} catch {
		return "unknown";
	}
}

function readCachedTier(cacheKey) {
	try {
		const value = sessionStorage.getItem(cacheKey);
		return value === "low" || value === "medium" || value === "high" ? value : null;
	} catch {
		return null;
	}
}

function writeCachedTier(cacheKey, tier) {
	try {
		sessionStorage.setItem(cacheKey, tier);
	} catch {
		/* storage may be unavailable */
	}
}

function runFillRateProbe(renderer) {
	const gl = renderer.getContext();
	const size = 640;
	const target = new THREE.WebGLRenderTarget(size, size, {
		type: THREE.HalfFloatType,
		depthBuffer: false,
		stencilBuffer: false,
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
	});
	const scene = new THREE.Scene();
	const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	const material = new THREE.ShaderMaterial({
		depthTest: false,
		depthWrite: false,
		vertexShader: `
			void main() {
				gl_Position = vec4(position.xy, 0.0, 1.0);
			}
		`,
		fragmentShader: `
			void main() {
				vec2 p = gl_FragCoord.xy / 640.0;
				float v = p.x + p.y;
				for (int i = 0; i < 18; i++) {
					v = sin(v * 1.91 + float(i) * 0.17) * cos(v * 1.37 - float(i) * 0.11);
				}
				gl_FragColor = vec4(vec3(v * 0.25 + 0.5), 1.0);
			}
		`,
	});
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
	scene.add(mesh);

	const previousTarget = renderer.getRenderTarget();
	let perPassMs = Number.POSITIVE_INFINITY;
	try {
		renderer.setRenderTarget(target);
		for (let i = 0; i < 2; i += 1) {
			renderer.render(scene, camera);
		}
		gl.finish();
		const passes = 4;
		const startedAt = performance.now();
		for (let i = 0; i < passes; i += 1) {
			renderer.render(scene, camera);
		}
		gl.finish();
		perPassMs = (performance.now() - startedAt) / passes;
	} finally {
		renderer.setRenderTarget(previousTarget);
		target.dispose();
		mesh.geometry.dispose();
		material.dispose();
	}
	return perPassMs;
}

/**
 * Conservative, one-time GPU calibration. It can only lower the hardware tier,
 * never upgrade it. Runs before scene construction and all persistent RT warm-up.
 */
export function calibrateGraphicsTier(renderer, hardwareTier) {
	const forced = getForcedGraphicsTierFromUrl();
	if (forced) {
		return { tier: forced, renderer: "forced", perPassMs: null, cached: false };
	}
	if (!renderer || hardwareTier === "low") {
		return { tier: hardwareTier, renderer: "not-probed", perPassMs: null, cached: false };
	}

	const rendererName = readRendererName(renderer);
	const cacheKey = `${CACHE_PREFIX}:${rendererName}`;
	const cached = readCachedTier(cacheKey);
	if (cached) {
		return { tier: lowerTier(hardwareTier, cached), renderer: rendererName, perPassMs: null, cached: true };
	}

	let measuredTier = hardwareTier;
	let perPassMs = null;
	if (SOFTWARE_RENDERER_RE.test(rendererName)) {
		measuredTier = "low";
	} else if (HIGH_DISCRETE_RENDERER_RE.test(rendererName)) {
		// A single synchronous fill-rate sample is noisy when the browser is compiling,
		// warming or sharing the GPU. Known discrete GPUs must not be demoted by that
		// transient spike; the hardware/CPU score still caps the final tier.
		measuredTier = "high";
	} else {
		try {
			perPassMs = runFillRateProbe(renderer);
			if (!Number.isFinite(perPassMs) || perPassMs > 5.5) {
				measuredTier = "low";
			} else if (perPassMs > 2.2 || INTEGRATED_RENDERER_RE.test(rendererName)) {
				measuredTier = "medium";
			} else {
				measuredTier = "high";
			}
		} catch (error) {
			console.warn("[graphics] GPU calibration failed; keeping hardware tier", error);
		}
	}

	const tier = lowerTier(hardwareTier, measuredTier);
	writeCachedTier(cacheKey, tier);
	return { tier, renderer: rendererName, perPassMs, cached: false };
}
