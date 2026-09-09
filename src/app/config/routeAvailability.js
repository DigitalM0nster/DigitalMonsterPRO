export const PORTFOLIO_ENABLED = true;

export function isRouteAvailable(path) {
	return PORTFOLIO_ENABLED || !/^\/portfolio(?:\/|$)/.test(String(path ?? "/"));
}
