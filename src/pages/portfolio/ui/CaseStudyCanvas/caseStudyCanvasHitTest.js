/**
 * @param {number} px
 * @param {number} py
 * @param {import('./caseStudyCanvasDraw.js').CaseStudyHitRegion[]} regions
 * @param {number} scale
 */
export function pickCaseStudyHitRegion(px, py, regions, scale) {
	const x = px * scale;
	const y = py * scale;

	for (let index = regions.length - 1; index >= 0; index -= 1) {
		const region = regions[index];
		if (region.w != null && region.h != null) {
			if (x >= region.x && x <= region.x + region.w && y >= region.y && y <= region.y + region.h) {
				return region;
			}
			continue;
		}
		const dx = x - region.x;
		const dy = y - region.y;
		if (dx * dx + dy * dy <= region.r * region.r) {
			return region;
		}
	}

	return null;
}
