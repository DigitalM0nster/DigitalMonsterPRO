import { getProjectByRoute } from "@/portfolio/core/projectRegistry.js";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import PortfolioProjectShell from "../PortfolioProjectShell/PortfolioProjectShell.jsx";

/** Единый роут кейса: /portfolio/01 … /portfolio/07 → модуль из реестра. */
export default function PortfolioCaseRoute() {
	const { displayPathname } = useRouteTransitionContext();
	const project = getProjectByRoute(displayPathname);

	if (!project) {
		return null;
	}

	return <PortfolioProjectShell key={project.config.slug} slug={project.config.slug} />;
}
