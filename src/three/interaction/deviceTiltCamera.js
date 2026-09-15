/** A sensor is a camera input, never a synthetic cursor or a hit-test position. */
export function applyDeviceTiltCamera(camera, frame) {
	const tilt = frame?.deviceTilt;
	if (!tilt) return;
	// Bound movement in screen space so portrait layouts keep the same framing.
	const halfFov = Math.tan(camera.fov * Math.PI / 360);
	const yaw = Math.min(0.03, Math.atan(halfFov * camera.aspect * 0.1));
	const pitch = Math.min(0.022, Math.atan(halfFov * 0.07));
	camera.rotateY(-Math.max(-1, Math.min(1, tilt.x)) * yaw);
	camera.rotateX(Math.max(-1, Math.min(1, tilt.y)) * pitch);
	camera.updateMatrixWorld(true);
}
