/**
 * Страница активна для входа, когда она отображается и не в фазе «уход».
 * @param {boolean} isOnDisplayedPage
 * @param {'idle' | 'exiting' | 'entering'} routePhase
 */
export function shouldActivateRoutePage(isOnDisplayedPage, routePhase) {
	return isOnDisplayedPage && routePhase !== "exiting";
}
