/**
 * Bottom band reserved for prev/next chrome — removed; stages live on the left rail,
 * project list on the arc, «all projects» sits above the fixed case header.
 */
export function resolveCaseProjectNavigationReservePx(viewportWidth, _viewportHeight) {
	const width = Math.max(0, Number(viewportWidth) || 0);
	if (width < 768) {
		return 0;
	}
	return 0;
}
