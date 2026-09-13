// The portrait view aligns the tower and the garden along the depth of the city.
// Moving closer is possible without squeezing the whole desktop panorama into a phone.
export const CITY_MOBILE_CAMERA = Object.freeze({
	position: Object.freeze([4.8, 3, -3]),
	target: Object.freeze([-.15, -.95, 1.2]),
	landscapeTarget: Object.freeze([.55, -.95, 2]),
});

export function cityMobileCameraFov(height) {
	return 48 + Math.max(0, Math.min(8, (700 - height) / 30));
}
