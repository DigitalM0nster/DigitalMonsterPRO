import { useCallback, useLayoutEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore } from "@/store.jsx";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { CAPABILITIES, isCapabilitiesPath } from "@/capabilities/data/capabilities.js";
import { getNavItemLabel } from "@/i18n/siteCopy.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { requestHexNavigation } from "@/utils/hexNavigation.js";
import { isPortfolioCasePath } from "@/three/scenes/portfolio/hub/projectsData.js";
import { PortfolioProjectProvider } from "@/portfolio/core/PortfolioProjectContext.jsx";
import CaseStudyArcDomNav from "@/portfolio/ui/CaseStudyCanvas/CaseStudyArcDomNav.jsx";
import { setSiteArcNavigationSource } from "@/portfolio/ui/CaseStudyCanvas/siteArcNavigationSource.js";

const SITE_ITEMS = [
	{ id: "main", routeNumber: "01", route: "/" },
	{ id: "portfolio", routeNumber: "02", route: "/portfolio" },
	{ id: "capabilities", routeNumber: "03", route: "/capabilities" },
	{ id: "about", routeNumber: "04", route: "/about" },
	{ id: "contacts", routeNumber: "05", route: "/contacts" },
];

function normalizePath(path) {
	return String(path ?? "/").replace(/\/+$/, "") || "/";
}

function resolveSiteActiveId(pathname) {
	const normalized = normalizePath(pathname);
	if (normalized.startsWith("/portfolio")) return "portfolio";
	if (normalized.startsWith("/capabilities")) return "capabilities";
	if (normalized.startsWith("/about")) return "about";
	if (normalized.startsWith("/contacts")) return "contacts";
	return "main";
}

export default function SiteArcNavigator() {
	const location = useLocation();
	const navigate = useNavigate();
	const { displayPathname } = useRouteTransitionContext();
	const proxyStore = useStore();
	const locale = normalizeSiteLocale(proxyStore.siteLocale);
	const capabilitiesMode = isCapabilitiesPath(displayPathname);
	const caseRouteVisible = isPortfolioCasePath(displayPathname) || isPortfolioCasePath(location.pathname);

	const items = useMemo(() => {
		if (capabilitiesMode) {
			return CAPABILITIES.map((item) => ({
				id: item.id,
				route: item.path,
				routeNumber: item.number,
				title: item.title,
				pathTitle: item.title,
			}));
		}
		return SITE_ITEMS.map((item) => ({
			...item,
			title: getNavItemLabel(item.id, locale),
			pathTitle: getNavItemLabel(item.id, locale),
		}));
	}, [capabilitiesMode, locale]);

	const activeId = capabilitiesMode
		? (items.find((item) => normalizePath(item.route) === normalizePath(displayPathname))?.id ?? items[0].id)
		: resolveSiteActiveId(displayPathname);
	const sourceKey = capabilitiesMode ? "capabilities" : "site";

	useLayoutEffect(() => {
		if (caseRouteVisible) {
			setSiteArcNavigationSource(null);
			return undefined;
		}
		setSiteArcNavigationSource({ key: sourceKey, activeId, items });
		return () => setSiteArcNavigationSource(null);
	}, [activeId, caseRouteVisible, items, sourceKey]);

	const activate = useCallback((item) => {
		const path = item?.route;
		if (!path || normalizePath(path) === normalizePath(location.pathname)) return;
		if (capabilitiesMode && isCapabilitiesPath(path)) {
			navigate(path);
			return;
		}
		if (!requestHexNavigation(path, location.pathname)) navigate(path);
	}, [capabilitiesMode, location.pathname, navigate]);

	const project = useMemo(() => ({
		config: { id: activeId, slug: activeId, caseStudy: {} },
		states: [],
	}), [activeId]);
	const contextValue = useMemo(() => ({
		activeStateId: "",
		activeStateIndex: 0,
		activeState: null,
		scrollProgress: 0,
		stageProgress: 0,
		stageProgressTarget: 0,
		investigationHotspotId: null,
		activeHotspot: null,
		isInvestigating: false,
		visibleHotspots: [],
		goToState: () => {},
		enterInvestigation: () => {},
		leaveInvestigation: () => {},
	}), []);

	if (caseRouteVisible) return null;

	return (
		<PortfolioProjectProvider project={project} value={contextValue}>
			<CaseStudyArcDomNav
				manageLifecycle={false}
				skipPanelIntro
				onActivateItem={activate}
			/>
		</PortfolioProjectProvider>
	);
}
