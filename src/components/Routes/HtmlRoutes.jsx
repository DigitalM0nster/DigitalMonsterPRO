import { Routes, Route, useLocation } from "react-router-dom";
import { useEffect, useMemo } from "react";

import MainPage from "../HTML/pages/MainPage.jsx";
import PortfolioPage from "../HTML/pages/PortfolioPage.jsx";
import AboutPage from "../HTML/pages/AboutPage.jsx";
import ContactsPage from "../HTML/pages/ContactsPage.jsx";
import DomDistortDemoPage from "../HTML/pages/DomDistortDemoPage.jsx";
import { useStore } from "@/store.jsx";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";

export default function HtmlRoutes() {
	const store = useStore();
	const location = useLocation();
	const { displayPathname } = useRouteTransitionContext();

	const displayLocation = useMemo(() => ({ ...location, pathname: displayPathname }), [location, displayPathname]);

	useEffect(() => {
		store.openedCase = false;
	}, [displayPathname, store]);

	return (
		<Routes location={displayLocation}>
			<Route index element={<MainPage />} />
			<Route path="/portfolio/*" element={<PortfolioPage />} />
			<Route path="/about/*" element={<AboutPage />} />
			<Route path="/contacts/" element={<ContactsPage />} />
			<Route path="/demo/distort" element={<DomDistortDemoPage />} />
		</Routes>
	);
}
