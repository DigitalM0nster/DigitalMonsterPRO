// Authored ROUNDABOUT stone islands: centres/radii in the exported GLB's Y-up space.
// Prepare with the district mesh, without rebuilding the Blender model or adding draws.
const PARKS = [[-85, 69], [94, -66]];
const SEGMENTS = 72;
const RADIUS = 7.36;

export function withCityParkDistricts(data) {
	if (data.version !== 2 || data.districts.some(d => d.kind === "park")) return data;
	const districts = [...data.districts], positions = [...data.positions], kinds = [...data.kinds], ids = [...data.ids];
	for (const [index, [x, z]] of PARKS.entries()) {
		const id = districts.length;
		const point = (radius, angle, height) => [x + Math.cos(angle) * radius, height, z + Math.sin(angle) * radius];
		const triangle = (a, b, c, kind) => {
			positions.push(...a, ...b, ...c); kinds.push(kind, kind, kind); ids.push(id, id, id);
		};
		const contour = [];
		for (let i = 0; i < SEGMENTS; i++) {
			const a = i / SEGMENTS * Math.PI * 2, b = (i + 1) / SEGMENTS * Math.PI * 2;
			contour.push([x + Math.cos(a) * RADIUS, z + Math.sin(a) * RADIUS]);
			triangle([x, .31, z], point(6.85, a, .31), point(6.85, b, .31), 3);
			for (const [inner, outer, height, kind] of [[6.85, 7.21, .27, 4], [7.21, RADIUS, .24, 5]]) {
				triangle(point(inner, a, height), point(outer, a, height), point(outer, b, height), kind);
				triangle(point(inner, a, height), point(outer, b, height), point(inner, b, height), kind);
			}
		}
		districts.push({
			name: index ? "orbit-garden" : "beacon-garden", kind: "park", parkIndex: index,
			anchor: [x, 2.4, z], contours: [{ outer: contour, holes: [] }], buildings: [],
			// The centre sculpture also selects the park when hovered above the paving.
			pickVolumes: [[x - 2.15, .1, z - 2.15, x + 2.15, 4.72, z + 2.15]],
		});
	}
	return { ...data, districts, positions, kinds, ids };
}
