import * as THREE from "three";
import { WebGLInitError } from "./WebGLInitError.js";

/**
 * r155+: интенсивности света в сценах подобраны под legacy mode (до r155).
 * @see https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733
 */
export function applyLegacyLightingMode(renderer) {
	if (!renderer || !("useLegacyLights" in renderer)) {
		return;
	}

	renderer.useLegacyLights = true;
}

/**
 * Одна попытка создать контекст. Retry (3×) давил GPU и провоцировал
 * exit_on_context_lost / краши Chrome на NVIDIA.
 *
 * @param {ConstructorParameters<typeof THREE.WebGLRenderer>[0]} options
 */
export function createWebGLRenderer(options = {}) {
	const rendererOptions = {
		failIfMajorPerformanceCaveat: false,
		powerPreference: "high-performance",
		...options,
	};

	try {
		const renderer = new THREE.WebGLRenderer(rendererOptions);
		const context = renderer.getContext();
		if (!context) {
			renderer.dispose();
			throw new WebGLInitError("WebGL-контекст не создан");
		}

		applyLegacyLightingMode(renderer);
		return renderer;
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Не удалось создать WebGL-контекст (GPU недоступен или контекст заблокирован браузером)";

		throw new WebGLInitError(message, { cause: error });
	}
}
