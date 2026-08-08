let returnToOverviewHandler = null;

export function setMmk1ReturnToOverviewHandler(handler) {
	returnToOverviewHandler = typeof handler === "function" ? handler : null;
	return () => {
		if (returnToOverviewHandler === handler) returnToOverviewHandler = null;
	};
}

export function requestMmk1ReturnToOverview() {
	return returnToOverviewHandler?.() === true;
}
