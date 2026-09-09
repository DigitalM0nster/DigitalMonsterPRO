import { PORTFOLIO_ENABLED } from "@/app/config/routeAvailability.js";

export const routeModuleLoaders = {
	main: () => import("@/pages/home/MainPage.jsx"),
	portfolio: () => import("@/pages/portfolio/PortfolioPage.jsx"),
	capabilities: () => import("@/pages/capabilities/CapabilitiesPage.jsx"),
	about: () => import("@/pages/about/AboutPage.jsx"),
	contacts: () => import("@/pages/contacts/ContactsPage.jsx"),
	domDistortDemo: () => import("@/pages/demo/domDistort/DomDistortDemoPage.jsx"),
};

let routePreloadPromise = null;

/** Loads the JS and CSS for every route while the loader is still visible. */
export function preloadHtmlRoutes() {
	if (!routePreloadPromise) {
		routePreloadPromise = Promise.all(Object.entries(routeModuleLoaders)
			.filter(([id]) => id !== "portfolio" || PORTFOLIO_ENABLED)
			.map(([, load]) => load()))
			.catch((error) => {
				routePreloadPromise = null;
				throw error;
			});
	}
	return routePreloadPromise;
}
