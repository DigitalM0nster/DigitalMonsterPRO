import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useStore } from "@/app/store.jsx";
import { isPortfolioCasePath } from "@/three/scenes/portfolio/hub/projectsData.js";
import { attachHubPlateCaseColumnRuntime } from "../hubPlateCase/hubPlateCaseColumnRuntime.js";
import ResponsiveHubCase from "./ResponsiveHubCase/ResponsiveHubCase.jsx";
import { useResponsiveHubCaseViewport } from "./ResponsiveHubCase/useResponsiveHubCaseViewport.js";

/** HTML shell for /portfolio and its selected-case routes; content stays in the warmed 3D scene. */
export default function PortfolioHubContent() {
	const store = useStore();
	const { pathname } = useLocation();
	const isResponsiveCaseViewport = useResponsiveHubCaseViewport();

	useEffect(() => {
		store.scroll = 0;
		store.openedCase = false;
	}, [store]);

	useEffect(() => attachHubPlateCaseColumnRuntime(), []);

	return (
		<div className="portfolioHub">
			{isResponsiveCaseViewport && isPortfolioCasePath(pathname) && (
				<ResponsiveHubCase />
			)}
		</div>
	);
}
