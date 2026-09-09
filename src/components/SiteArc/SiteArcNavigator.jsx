import { useCallback, useLayoutEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore } from "@/app/store.jsx";
import { useRouteTransitionContext } from "@/app/context/RouteTransitionContext.jsx";
import { getNavItemLabel } from "@/app/localization/interfaceTranslations.js";
import { normalizeSiteLocale } from "@/functions/siteLocale.js";
import { requestHexNavigation } from "@/functions/hexNavigation.js";
import SiteArcDomNav from "@/components/SiteArc/SiteArcDomNav.jsx";
import { setSiteArcNavigationSource } from "@/components/SiteArc/siteArcNavigationSource.js";
import { FIRST_CAPABILITY_PATH } from "@/pages/capabilities/data/capabilities.js";
import { isRouteAvailable } from "@/app/config/routeAvailability.js";

const SITE_ITEMS = [
	{ id: "main", routeNumber: "01", route: "/" },
	{ id: "portfolio", routeNumber: "02", route: "/portfolio" },
	{ id: "capabilities", routeNumber: "03", route: FIRST_CAPABILITY_PATH },
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
	const items = useMemo(() => SITE_ITEMS.filter((item) => isRouteAvailable(item.route)).map((item, index) => ({
		...item,
		routeNumber: String(index + 1).padStart(2, "0"),
		title: getNavItemLabel(item.id, locale),
		pathTitle: getNavItemLabel(item.id, locale),
	})), [locale]);

	const activeId = resolveSiteActiveId(displayPathname);

	useLayoutEffect(() => {
		setSiteArcNavigationSource({ key: "site", activeId, items });
		return () => setSiteArcNavigationSource(null);
	}, [activeId, items]);

	const activate = useCallback((item) => {
		const path = item?.route;
		if (!path || normalizePath(path) === normalizePath(location.pathname)) return;
		if (!requestHexNavigation(path, location.pathname)) navigate(path);
	}, [location.pathname, navigate]);

	return (
		<SiteArcDomNav
			activeItemId={activeId}
			onActivateItem={activate}
		/>
	);
}
