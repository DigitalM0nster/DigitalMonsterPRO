import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore } from "@/store.jsx";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { CAPABILITIES, isCapabilitiesPath } from "@/capabilities/data/capabilities.js";
import { getNavItemLabel } from "@/i18n/siteCopy.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { requestHexNavigation } from "@/utils/hexNavigation.js";
import { isPortfolioCasePath } from "@/three/scenes/portfolio/hub/projectsData.js";
import styles from "./SiteArcNavigator.module.scss";

const SITE_ITEMS = [
	{ id: "main", number: "01", path: "/" },
	{ id: "portfolio", number: "02", path: "/portfolio" },
	{ id: "capabilities", number: "03", path: "/capabilities" },
	{ id: "about", number: "04", path: "/about" },
	{ id: "contacts", number: "05", path: "/contacts" },
];

function normalizePath(path) {
	return String(path ?? "/").replace(/\/+$/, "") || "/";
}

function resolveSiteActiveIndex(pathname) {
	const normalized = normalizePath(pathname);
	if (normalized.startsWith("/portfolio")) return 1;
	if (normalized.startsWith("/capabilities")) return 2;
	if (normalized.startsWith("/about")) return 3;
	if (normalized.startsWith("/contacts")) return 4;
	return 0;
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
			return CAPABILITIES.map((item) => ({ ...item, label: item.title }));
		}
		return SITE_ITEMS.map((item) => ({ ...item, label: getNavItemLabel(item.id, locale) }));
	}, [capabilitiesMode, locale]);

	const activeIndex = capabilitiesMode
		? Math.max(0, items.findIndex((item) => normalizePath(item.path) === normalizePath(displayPathname)))
		: resolveSiteActiveIndex(displayPathname);

	const activate = useCallback((path) => {
		if (!path || normalizePath(path) === normalizePath(location.pathname)) return;
		if (capabilitiesMode && isCapabilitiesPath(path)) {
			navigate(path);
			return;
		}
		if (!requestHexNavigation(path, location.pathname)) navigate(path);
	}, [capabilitiesMode, location.pathname, navigate]);

	if (caseRouteVisible) return null;

	return (
		<nav className={styles.navigator} aria-label={capabilitiesMode ? "Навигация по возможностям" : "Навигация по страницам"}>
			<svg className={styles.track} viewBox="0 0 320 900" preserveAspectRatio="none" aria-hidden="true">
				<path d="M 312 -60 C 82 125, 82 775, 312 960" />
			</svg>
			<div className={styles.items}>
				{items.map((item, index) => {
					const offset = index - activeIndex;
					const y = 50 + offset * 15.5;
					const x = 46 + Math.min(42, Math.abs(offset) * 13);
					const active = index === activeIndex;
					return (
						<button
							key={item.id}
							type="button"
							className={`${styles.item} ${active ? styles.active : ""}`}
							style={{ "--arc-x": `${x}%`, "--arc-y": `${y}%` }}
							onClick={() => activate(item.path)}
							aria-current={active ? "page" : undefined}
						>
							<span className={styles.node}><span /></span>
							<span className={styles.copy}>
								<span className={styles.number}>{item.number}</span>
								<span className={styles.label}>{item.label}</span>
							</span>
						</button>
					);
				})}
			</div>
		</nav>
	);
}
