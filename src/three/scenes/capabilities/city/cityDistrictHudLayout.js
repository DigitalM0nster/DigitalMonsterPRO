export const CITY_HUD_WIDTH = 320;
export const CITY_HUD_HEIGHT = 224;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** CSS pixels, with Y upwards like the overlay shader. Reuses the output each frame. */
export function layoutDistrictHud(width, height, anchorX, anchorY, result) {
	const left = width < 700 ? 16 : 128, right = width < 700 ? 12 : 132;
	const bottom = 24, top = height - (width < 700 ? 16 : 72);
	result.scale = Math.min(height < 500 ? .72 : 1, (width - left - right) / CITY_HUD_WIDTH, (top - bottom) / CITY_HUD_HEIGHT);
	const w = CITY_HUD_WIDTH * result.scale, h = CITY_HUD_HEIGHT * result.scale;
	const maxX = width - right - w, maxY = top - h;
	const gap = 40;
	const rightFits = anchorX + gap <= maxX, leftFits = anchorX - gap - w >= left;
	// Keep the chosen side while moving within a quarter; do not flutter around its midpoint.
	if (!result.side || (result.side > 0 ? !rightFits && leftFits : !leftFits && rightFits)) {
		result.side = rightFits ? 1 : -1;
	}
	result.x = clamp(result.side > 0 ? anchorX + gap : anchorX - gap - w, left, maxX);
	result.y = clamp(anchorY + gap <= maxY ? anchorY + gap : anchorY - gap - h, bottom, maxY);
	// The narrow layout puts the navigation arc through the city itself. Its free
	// upper band is the readable fallback when a card cannot fit beside the arc.
	if (width < 700) result.y = maxY;
	result.width = w; result.height = h;
	return result;
}
