// User-picked mobile view, captured at 404 × 800 (DPR 2).
export const CITY_MOBILE_CAMERA = Object.freeze({
	position: Object.freeze([-4.4997, .2632, 5.1855]),
	target: Object.freeze([-3.8385, .1137, 4.4503]),
	fov: 48,
	// The exported lookAt is only one unit away. Keep orbit/parallax at city depth
	// along that same sightline, without changing the captured viewing direction.
	orbitDistance: 8,
});

export function cityMobileCameraFov(height) {
	return CITY_MOBILE_CAMERA.fov + Math.max(0, Math.min(8, (700 - height) / 30));
}
