const PREFIX = "[PORTFOLIO ACTIVE DEBUG]";

let startedAt = 0;

export function resetPortfolioActiveDebug(details = {}) {
	if (!import.meta.env.DEV) {
		return;
	}

	startedAt = performance.now();
	logPortfolioActiveDebug("INTRO_START", details);
}

export function logPortfolioActiveDebug(event, details = {}) {
	if (!import.meta.env.DEV) {
		return;
	}

	const now = performance.now();
	const elapsedMs = startedAt > 0 ? Math.round(now - startedAt) : 0;
	console.log(`${PREFIX} +${elapsedMs}ms ${event}`, JSON.stringify(details));
}
