import { useEffect, useMemo } from "react";
import { useLocation, Routes, Route } from "react-router-dom";

import PortfolioHubContent from "../components/portfolio/PortfolioHubContent.jsx";
import { isPortfolioHubPath } from "@/three/scenes/portfolio/hub/projectsData.js";
import { usePageStateClasses, useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { setPortfolioSpatialAudio } from "@/sounds/soundDesign.js";
import { PortfolioCaseRoute } from "@/portfolio/index.js";
export default function PortfolioPage() {
	const location = useLocation();
	const { displayPathname } = useRouteTransitionContext();
	const displayLocation = useMemo(() => ({ ...location, pathname: displayPathname }), [location, displayPathname]);
	const isPortfolioHub = isPortfolioHubPath(displayPathname);
	const pageClassName = [usePageStateClasses("portfolio"), isPortfolioHub ? "hub" : "case"].filter(Boolean).join(" ");

	useEffect(() => {
		setPortfolioSpatialAudio(true);
		return () => setPortfolioSpatialAudio(false);
	}, []);

	return (
		<div className={pageClassName}>
			<div className="pageContent">
				<Routes location={displayLocation}>
					<Route index element={<PortfolioHubContent />} />
					<Route path=":caseId" element={<PortfolioCaseRoute />} />
				</Routes>
			</div>
		</div>
	);
}
