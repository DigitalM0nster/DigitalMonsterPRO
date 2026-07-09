/** Ошибка создания WebGL-контекста — не должна валить React-дерево. */
export class WebGLInitError extends Error {
	/**
	 * @param {string} message
	 * @param {{ cause?: unknown }} [options]
	 */
	constructor(message, options = {}) {
		super(message);
		this.name = "WebGLInitError";
		this.cause = options.cause;
	}
}
