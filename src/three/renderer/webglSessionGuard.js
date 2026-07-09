const SESSION_BLOCK_KEY = "digitalmonster_webgl_blocked";

/** Одна попытка init за раз — защита от гонки HMR / двойного mount. */
let initInProgress = false;

/**
 * Chrome после context loss блокирует WebGL для вкладки.
 * Повторные createWebGLRenderer только усугубляют GPU process crash.
 */
export function isWebGLSessionBlocked() {
	if (typeof sessionStorage === "undefined") {
		return false;
	}
	return sessionStorage.getItem(SESSION_BLOCK_KEY) === "1";
}

/**
 * @param {unknown} [reason]
 */
export function markWebGLSessionBlocked(reason) {
	if (typeof sessionStorage !== "undefined") {
		sessionStorage.setItem(SESSION_BLOCK_KEY, "1");
	}

	console.warn(
		"[three] WebGL заблокирован для этой вкладки. Закрой вкладку или перезапусти Chrome — не жми F5 и не сохраняй файлы в цикле.",
		reason,
	);
}

export function clearWebGLSessionBlock() {
	sessionStorage?.removeItem(SESSION_BLOCK_KEY);
}

/**
 * @param {unknown} error
 */
export function isWebGLBlockedError(error) {
	const message = error instanceof Error ? error.message : String(error ?? "");
	return /context loss|blocked|could not create|WebGLInitError|context lost/i.test(message);
}

/**
 * @template T
 * @param {() => T} fn
 * @returns {T | null}
 */
export function withWebGLInitLock(fn) {
	if (initInProgress || isWebGLSessionBlocked()) {
		return null;
	}

	initInProgress = true;
	try {
		return fn();
	} finally {
		initInProgress = false;
	}
}
