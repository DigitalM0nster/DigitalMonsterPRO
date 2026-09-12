const RESPONSE = 32;
const MAX_OFFSET = 9;
const ATTRACTION = .35;

/** CSS-pixel attraction with continuous velocity, including cursor reversals. */
export function advanceMarkerMagnet(offset, velocity, dx, dy, delta) {
	const factor = Math.min(ATTRACTION, MAX_OFFSET / (Math.hypot(dx, dy) || 1));
	const targetX = dx * factor, targetY = dy * factor;
	if (offset.x === targetX && offset.y === targetY && velocity.x === 0 && velocity.y === 0) return;
	const dt = Math.min(Math.max(delta, 0), .05);
	// Exact critically damped spring: no overshoot or frame-rate-dependent integration.
	// 95% in 148 ms (the old damp(14) took 214 ms), retaining a quick response.
	const decay = Math.exp(-RESPONSE * dt);
	const errorX = offset.x - targetX, errorY = offset.y - targetY;
	const impulseX = velocity.x + RESPONSE * errorX;
	const impulseY = velocity.y + RESPONSE * errorY;
	offset.x = targetX + (errorX + impulseX * dt) * decay;
	offset.y = targetY + (errorY + impulseY * dt) * decay;
	velocity.x = (velocity.x - RESPONSE * impulseX * dt) * decay;
	velocity.y = (velocity.y - RESPONSE * impulseY * dt) * decay;
	if (Math.hypot(offset.x - targetX, offset.y - targetY) < .0001 && Math.hypot(velocity.x, velocity.y) < .001) {
		offset.x = targetX; offset.y = targetY;
		velocity.x = 0; velocity.y = 0;
	}
}
