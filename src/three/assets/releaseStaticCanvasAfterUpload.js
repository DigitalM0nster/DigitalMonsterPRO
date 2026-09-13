import { isMobileGraphicsDevice } from "../../functions/getGraphicsTier.js";

/**
 * Immutable, exclusively owned CanvasTexture sources only. Once WebGL has copied
 * the pixels, mobile must not also retain a large Canvas2D backing surface.
 * The prepared GPU texture remains alive at its original resolution. Never use
 * for shared painter snapshots, canvases read by drawImage, or editable textures.
 * Context loss is terminal for this app; recovery reloads and prepares afresh.
 */
export function releaseStaticCanvasAfterUpload(texture, enabled = isMobileGraphicsDevice()) {
	if (!enabled) return texture;
	const canvas = texture.image;
	const previous = texture.onUpdate;
	const release = () => {
		texture.userData.releasedCanvasSize = [canvas.width, canvas.height];
		canvas.width = canvas.height = 1;
		texture.onUpdate = previous ?? null;
		texture.removeEventListener("dispose", release);
	};
	texture.onUpdate = function (...args) {
		previous?.apply(this, args);
		release();
	};
	texture.addEventListener("dispose", release);
	return texture;
}
