/**
 * Dev / perf-test: ?noPost — отключить bloom/liquid/grain (hex mix карусели остаётся).
 * ?no3d=1 — не создавать WebGL (вёрстка HUD / меню без нагрузки на GPU).
 */
export function isPostProcessBypassedFromUrl() {
	if (typeof window === "undefined") {
		return false;
	}

	try {
		const params = new URLSearchParams(window.location.search);
		if (params.get("postProcess") === "off") {
			return true;
		}
		if (!params.has("noPost")) {
			return false;
		}
		const value = params.get("noPost");
		if (value === "0" || value === "false") {
			return false;
		}
		return true;
	} catch {
		return false;
	}
}

/** @returns {boolean} */
export function isWebGLDisabledFromUrl() {
	if (typeof window === "undefined") {
		return false;
	}

	try {
		const params = new URLSearchParams(window.location.search);
		if (!params.has("no3d")) {
			return false;
		}
		const value = params.get("no3d");
		return value !== "0" && value !== "false";
	} catch {
		return false;
	}
}
