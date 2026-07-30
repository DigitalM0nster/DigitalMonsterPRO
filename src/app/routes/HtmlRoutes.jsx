import { Routes, Route, useLocation } from "react-router-dom";
import { lazy, Suspense, useMemo } from "react";

import { useRouteTransitionContext } from "@/app/context/RouteTransitionContext.jsx";
import { routeModuleLoaders } from "./routeModules.js";

const MainPage = lazy(routeModuleLoaders.main);
const PortfolioPage = lazy(routeModuleLoaders.portfolio);
const CapabilitiesPage = lazy(routeModuleLoaders.capabilities);
const AboutPage = lazy(routeModuleLoaders.about);
const ContactsPage = lazy(routeModuleLoaders.contacts);
const DomDistortDemoPage = lazy(routeModuleLoaders.domDistortDemo);

export default function HtmlRoutes() {
	const location = useLocation();
	const { displayPathname } = useRouteTransitionContext();

	const displayLocation = useMemo(() => ({ ...location, pathname: displayPathname }), [location, displayPathname]);

	return (
		<Suspense fallback={null}>
			<Routes location={displayLocation}>
				<Route index element={<MainPage />} />
				<Route path="/portfolio/*" element={<PortfolioPage />} />
				<Route path="/capabilities/*" element={<CapabilitiesPage />} />
				<Route path="/about/*" element={<AboutPage />} />
				<Route path="/contacts/*" element={<ContactsPage />} />
				<Route path="/demo/distort" element={<DomDistortDemoPage />} />
			</Routes>
		</Suspense>
	);
}
