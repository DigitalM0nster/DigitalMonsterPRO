import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import "@/styles/portfolio/portfolio.scss";
import "@/styles/portfolio/portfolioExploration.scss";

import PortfolioHubContent from "./components/PortfolioHubContent.jsx";
import { isPortfolioHubPath } from "@/three/scenes/portfolio/hub/projectsData.js";
import { usePageStateClasses } from "@/app/context/RouteTransitionContext.jsx";
import { setPortfolioSpatialAudio } from "@/sounds/soundDesign.js";
export default function PortfolioPage() {
	const location = useLocation();
	const pageClassName = [usePageStateClasses("portfolio"), "hub"].filter(Boolean).join(" ");

	useEffect(() => {
		setPortfolioSpatialAudio(true);
		return () => setPortfolioSpatialAudio(false);
	}, []);

	if (!isPortfolioHubPath(location.pathname)) {
		return <Navigate to="/portfolio" replace />;
	}

	return (
		<div className={pageClassName}>
			<div className="pageContent">
				<PortfolioHubContent />
			</div>
		</div>
	);
}
