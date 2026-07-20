import { useRef, useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useSnapshot } from "valtio";
import { store } from "@/store.jsx";
import { projectsData, PORTFOLIO_MENU_VISIBLE_COUNT, isPortfolioHubPath, isPortfolioCasePath } from "@/three/scenes/portfolio/hub/projectsData.js";
import { getPortfolioProjectName } from "@/i18n/portfolioProjectsCopy.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import PortfolioProjectsListItem from "./PortfolioProjectsListItem.jsx";
import { useRouteGlitchScope } from "@/hooks/useRouteGlitchScope.js";
import { requestPortfolioCaseNavigation } from "@/utils/portfolioHubNavigate.js";
import { resetPortfolioHubBackgroundFocus } from "@/utils/portfolioHubBackground.js";

/** @deprecated HTML-список не используется — 3D HUD (HubScreenProjectsColumn). */
export default function PortfolioProjectsList() {
	const location = useLocation();
	const browserPathname = location.pathname;
	const { siteLocale } = useSnapshot(store);
	const locale = normalizeSiteLocale(siteLocale);

	const itemGlitchRefs = useRef([]);
	const projectsListRef = useRef(null);
	const [menuScrollOffset, setMenuScrollOffset] = useState(0);

	const maxMenuScrollOffset = Math.max(0, projectsData.length - PORTFOLIO_MENU_VISIBLE_COUNT);
	const canScrollMenu = projectsData.length > PORTFOLIO_MENU_VISIBLE_COUNT;

	useEffect(() => {
		if (!isPortfolioHubPath(browserPathname)) {
			resetPortfolioHubBackgroundFocus(store);
		}
	}, [browserPathname]);

	useRouteGlitchScope({
		scope: "portfolioHub",
		itemCount: projectsData.length,
		itemGlitchRefs,
	});

	useEffect(() => {
		setMenuScrollOffset(0);
	}, [browserPathname]);

	const isOnHub = isPortfolioHubPath(browserPathname);
	const currentCaseProject = isPortfolioCasePath(browserPathname)
		? (projectsData.find((p) => p.path === browserPathname) ?? null)
		: null;

	const changeProject = (path) => {
		requestPortfolioCaseNavigation(path, browserPathname);
	};

	useEffect(() => {
		return () => {
			store.cursor.hovered = false;
		};
	}, []);

	const clampMenuOffset = useCallback((next) => Math.max(0, Math.min(next, maxMenuScrollOffset)), [maxMenuScrollOffset]);

	const handleMenuWheel = useCallback(
		(e) => {
			if (!canScrollMenu) {
				return;
			}
			e.preventDefault();
			const step = e.deltaY > 0 ? 1 : -1;
			setMenuScrollOffset((prev) => clampMenuOffset(prev + step));
		},
		[canScrollMenu, clampMenuOffset],
	);

	return (
		<div className={isOnHub ? "portfolioProjectsList hub" : "portfolioProjectsList case"}>
			<div className="listViewport" ref={projectsListRef} onWheel={handleMenuWheel}>
				<div
					className="list"
					style={{
						"--menuScrollOffset": menuScrollOffset,
						"--projectMenuVisibleCount": PORTFOLIO_MENU_VISIBLE_COUNT,
					}}
				>
					{projectsData.map((project, index) => (
						<PortfolioProjectsListItem
							key={project.id}
							ref={(node) => {
								itemGlitchRefs.current[index] = node;
							}}
							project={project}
							displayName={getPortfolioProjectName(project.id, locale)}
							index={index}
							isActive={currentCaseProject?.path === project.path}
							isHovered={false}
							onSelect={changeProject}
							onHover={() => {}}
							onLeave={() => {}}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
