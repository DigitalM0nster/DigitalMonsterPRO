export const routeModuleLoaders = {
	main: () => import("../HTML/pages/MainPage.jsx"),
	portfolio: () => import("../HTML/pages/PortfolioPage.jsx"),
	about: () => import("../HTML/pages/AboutPage.jsx"),
	contacts: () => import("../HTML/pages/ContactsPage.jsx"),
	domDistortDemo: () => import("../HTML/pages/DomDistortDemoPage.jsx"),
};

let routePreloadPromise = null;

/** Loads the JS and CSS for every route while the loader is still visible. */
export function preloadHtmlRoutes() {
	if (!routePreloadPromise) {
		routePreloadPromise = Promise.allSettled(Object.values(routeModuleLoaders).map((load) => load()));
	}
	return routePreloadPromise;
}
