import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import "@/styles/loader.css";
import "@/styles/fonts.css";
import "@/styles/style.scss";
import "@/styles/sound.css";
import { syncRouteStagger } from "@/functions/routeStagger.js";
import { useRouteTransition } from "../hooks/useRouteTransition.js";
import { useScrollRestReactivate } from "../hooks/useScrollRestReactivate.js";
import { useSceneCarouselNavigation } from "../hooks/useSceneCarouselNavigation.js";
import { useHexHistoryNavigation } from "../hooks/useHexHistoryNavigation.js";
import { RouteTransitionProvider } from "@/app/context/RouteTransitionContext.jsx";
import "@/styles/media.css";
import ThreeCanvasHost from "@/three/legacy/r3f/ThreeCanvasHost.jsx";
import WebGLCanvasErrorBoundary from "@/three/legacy/r3f/WebGLCanvasErrorBoundary.jsx";
import LeftMenu from "@/components/LeftMenu/LeftMenu.jsx";
import SiteTopHud from "@/components/SiteTopHud/SiteTopHud.jsx";
import SiteArcNavigator from "@/components/SiteArc/SiteArcNavigator.jsx";
import HtmlRoutes from "@/app/routes/HtmlRoutes.jsx";
import { preloadHtmlRoutes } from "@/app/routes/routeModules.js";
import LoaderComponent from "@/components/Loader/LoaderComponent.jsx";
import Cursor from "@/components/Cursor/Cursor.jsx";
import { useLocation } from "react-router-dom";
import CaseStudyPanelHudOverlay from "@/pages/portfolio/ui/CaseStudyCanvas/CaseStudyPanelHudOverlay.jsx";
import AboutExperienceHost from "@/pages/about/AboutExperienceHost.jsx";
import AboutStageRailOverlay from "@/pages/about/AboutStageRailOverlay.jsx";
import CapabilitiesExperienceHost from "@/pages/capabilities/CapabilitiesExperienceHost.jsx";
import CaseGalleryScrollHint from "@/pages/portfolio/components/CaseGalleryScrollHint/CaseGalleryScrollHint.jsx";
import { store } from "@/app/store.jsx";
import { isDomDistortDemoPath } from "@/pages/demo/domDistort/constants.js";
import { isWebGLDisabledFromUrl } from "@/functions/postProcessTestFlags.js";
import { initPageVisibilitySound } from "../sounds/pageVisibilitySound.js";
import { prefetchSoundDesign } from "../sounds/soundDesign.js";
import { LOADER_CURTAIN_HIDE_MS } from "@/app/config/loaderCurtain.js";

const SHOW_CUSTOM_CURSOR = true;
/** Keep loader mounted until `hidingBlock` finishes — never cut the curtain short. */
const LOADER_UNMOUNT_DELAY_MS = LOADER_CURTAIN_HIDE_MS + 100;

export default function MainContent() {
	const [threeReady, setThreeReady] = useState(false);
	const [routeAssetsReady, setRouteAssetsReady] = useState(false);
	const [startApp, setStartApp] = useState(false);
	const [loaderMounted, setLoaderMounted] = useState(true);

	const location = useLocation();
	const routeTransition = useRouteTransition(location);
	useSceneCarouselNavigation();
	useHexHistoryNavigation(location, routeTransition);
	const { displayPathname, phase, isTransitioning, setDisplayPathname } = routeTransition;
	const [routeEnterActive, setRouteEnterActive] = useState(false);
	const scrollRestReactivate = useScrollRestReactivate(displayPathname, phase);
	// Stabilize provider value: menu hex navigates URL immediately while
	// displayPathname stays put — a fresh `{...routeTransition}` every render
	// would re-reconcile Contacts glitch letter trees at hex start (FPS hitch).
	const routeTransitionValue = useMemo(
		() => ({
			displayPathname,
			phase,
			isTransitioning,
			setDisplayPathname,
			enterReady: routeEnterActive,
			scrollRestReactivate,
		}),
		[displayPathname, phase, isTransitioning, setDisplayPathname, routeEnterActive, scrollRestReactivate],
	);

	const isDemoLab = isDomDistortDemoPath(location.pathname) || isDomDistortDemoPath(displayPathname);
	const skipWebGL = isWebGLDisabledFromUrl();
	const rendered = useMemo(() => routeAssetsReady && (skipWebGL || threeReady || isDemoLab), [isDemoLab, routeAssetsReady, skipWebGL, threeReady]);

	useEffect(() => {
		let active = true;
		Promise.allSettled([preloadHtmlRoutes(), prefetchSoundDesign()]).then(() => {
			if (active) {
				setRouteAssetsReady(true);
			}
		});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		if (skipWebGL) {
			setThreeReady(true);
		}
	}, [skipWebGL]);

	useEffect(() => {
		initPageVisibilitySound();
	}, []);

	useEffect(() => {
		if (!startApp || isDemoLab) {
			return undefined;
		}
		const timeoutId = window.setTimeout(() => setLoaderMounted(false), LOADER_UNMOUNT_DELAY_MS);
		return () => window.clearTimeout(timeoutId);
	}, [isDemoLab, startApp]);

	// После смены маршрута / фазы пересчитываем каскад (CSS + glitch) в .page → #contentContainer
	useEffect(() => {
		const container = document.getElementById("contentContainer");
		if (!container || !startApp) {
			return;
		}
		const frameId = requestAnimationFrame(() => {
			syncRouteStagger(container);
		});
		return () => cancelAnimationFrame(frameId);
	}, [displayPathname, phase, routeEnterActive, startApp]);

	// Layout effect: clear enterReady before paint when entering, so the new
	// page paints once as `hidden` then activates (CSS enter transition).
	useLayoutEffect(() => {
		if (phase === "idle") {
			setRouteEnterActive(true);
			return undefined;
		}
		if (phase !== "entering") {
			setRouteEnterActive(false);
			return undefined;
		}
		setRouteEnterActive(false);
		const frameId = requestAnimationFrame(() => {
			requestAnimationFrame(() => setRouteEnterActive(true));
		});
		return () => cancelAnimationFrame(frameId);
	}, [phase, displayPathname]);

	useEffect(() => {
		if (isDomDistortDemoPath(location.pathname)) {
			setThreeReady(true);
			setStartApp(true);
			store.appStarted = true;
			store.appStartedAt = Date.now();
		}
	}, [location.pathname]);

	const contentContainerClass = [
		"contentContainer",
		isDemoLab && "demoLab",
		isDemoLab && phase === "exiting" && "routeExiting",
		isDemoLab && phase === "entering" && "routeEntering",
		isDemoLab && phase === "entering" && routeEnterActive && "routeEnterActive",
	]
		.filter(Boolean)
		.join(" ");
	// URL changes re-render this component. Read the transaction phase at that
	// boundary without subscribing the entire React route tree to every navigation
	// handshake phase; Three owns the per-frame transition state.
	const navigationPhase = store.sceneCarouselClickPhase ?? "idle";

	return (
		<RouteTransitionProvider value={routeTransitionValue}>
			<div className={contentContainerClass} id="contentContainer">
				{!isDemoLab && !skipWebGL && (
					<WebGLCanvasErrorBoundary onFailure={() => setThreeReady(true)}>
						<ThreeCanvasHost
							rendered={rendered}
							setRendered={setThreeReady}
							currentPage={
								// Deep-link ring routes: don't keep Three on "/" while HTML display lags.
								// During a navigation transaction the URL is only the latest intent;
								// Three must stay on the visual route until settle/hex confirmation.
								navigationPhase === "idle" && (
									location.pathname === "/about"
									|| location.pathname === "/contacts"
									|| location.pathname.startsWith("/capabilities")
								) ? location.pathname : displayPathname
							}
							teleportPage={location.pathname}
							startApp={startApp}
						/>
					</WebGLCanvasErrorBoundary>
				)}
				{(startApp || isDemoLab) && <HtmlRoutes />}
			</div>
			{startApp && !isDemoLab && <AboutExperienceHost />}
			{startApp && !isDemoLab && <CapabilitiesExperienceHost />}
			{startApp && !isDemoLab && <LeftMenu />}
			{startApp && !isDemoLab && <SiteArcNavigator />}
			{startApp && !isDemoLab && <SiteTopHud startApp={startApp} />}
			{startApp && !isDemoLab && <CaseStudyPanelHudOverlay />}
			{startApp && !isDemoLab && <AboutStageRailOverlay />}
			{startApp && !isDemoLab && <CaseGalleryScrollHint />}
			{!isDemoLab && loaderMounted && <LoaderComponent startApp={startApp} setStartApp={setStartApp} rendered={rendered} />}
			{SHOW_CUSTOM_CURSOR && <Cursor startApp={startApp} />}
		</RouteTransitionProvider>
	);
}
