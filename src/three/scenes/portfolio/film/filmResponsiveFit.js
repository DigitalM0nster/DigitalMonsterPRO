// Eight samples include both ends and the middle of the cylindrical rails.
// Generated once. Layout runs only at prepare/resize; no frame-loop bounds work.
const samples = (halfWidth, bottom, top, depth) => [
	[-halfWidth, bottom], [0, bottom], [halfWidth, bottom],
	[-halfWidth, top], [0, top], [halfWidth, top],
	[-halfWidth, (bottom + top) / 2], [halfWidth, (bottom + top) / 2],
].map(([x, y]) => filmSurfacePoint(x, y, depth));
const framePoints = [[-.525,-.27,.015],[.525,-.27,.015],[-.525,.27,.015],[.525,.27,.015]];
const presentationPoints = samples(.61, -.38, .30, .025);
const viewHeight = 20 * Math.tan(Math.PI / 9);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** Fit the real perspective envelope, including pointer tilt and inspect growth. */
export function fitFilmPresentation(layout, width, height, box) {
	const points = layout.mobile ? framePoints : presentationPoints;
	const pixelUnit = height / viewHeight;
	const innerLeft = box.left + 2, innerRight = box.right - 2;
	const innerTop = box.top + 2, innerBottom = Math.max(innerTop + 1, box.bottom - 2);
	for (let iteration = 0; iteration < 8; iteration++) {
		let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
		for (const focus of [0, .5, 1]) for (const px of [-1, 1]) for (const py of [-1, 1]) {
			const scale = layout.width * layout.compositionScale * (1 + focus * (layout.compact ? .02 : .15));
			const tiltX = layout.mobile ? 0 : (.075 + py * .012) * (1 - focus);
			const tiltY = layout.compact ? 0 : (-.14 + px * .022) * (1 - focus);
			const sx = Math.sin(tiltX), cx = Math.cos(tiltX), sy = Math.sin(tiltY), cy = Math.cos(tiltY);
			for (const [x, y, z] of points) {
				const rx = cy * x + sy * z;
				const ry = sx * sy * x + cx * y - sx * cy * z;
				const rz = -cx * sy * x + sx * y + cx * cy * z;
				const perspective = 10 / Math.max(1, 10 - rz * scale);
				const screenX = width / 2 + (layout.x * layout.compositionScale + rx * scale) * perspective * pixelUnit;
				const screenY = height / 2 - (layout.y * layout.compositionScale + ry * scale) * perspective * pixelUnit;
				left = Math.min(left, screenX); right = Math.max(right, screenX);
				top = Math.min(top, screenY); bottom = Math.max(bottom, screenY);
			}
		}
		const factor = Math.min(1, (innerRight - innerLeft) / (right - left), (innerBottom - innerTop) / (bottom - top));
		if (factor < .9999) {
			layout.width *= factor * .995;
			layout.height = layout.width / 2.05;
			continue;
		}
		const shiftX = clamp((innerLeft + innerRight - left - right) / 2, innerLeft - left, innerRight - right);
		const shiftY = clamp((innerTop + innerBottom - top - bottom) / 2, innerTop - top, innerBottom - bottom);
		layout.x += shiftX / (pixelUnit * layout.compositionScale);
		layout.y -= shiftY / (pixelUnit * layout.compositionScale);
		if (Math.abs(shiftX) + Math.abs(shiftY) < .05) break;
	}
	return layout;
}
import { filmSurfacePoint } from "./filmSurface.js";
