import { useEffect, useMemo, useState } from "react";
import "../css/loader.css";
import "../css/fonts.css";
import "../css/style.scss";
import "../css/sound.css";
import { syncRouteStagger } from "../utils/routeStagger.js";
import { useRouteTransition } from "../hooks/useRouteTransition.js";
import { useScrollRestReactivate } from "../hooks/useScrollRestReactivate.js";
import { useSceneCarouselNavigation } from "../hooks/useSceneCarouselNavigation.js";
import { useHexHistoryNavigation } from "../hooks/useHexHistoryNavigation.js";
import { RouteTransitionProvider } from "../context/RouteTransitionContext.jsx";
import "../css/media.css";
import ThreeCanvasHost from "./3D/ThreeCanvasHost.jsx";
import WebGLCanvasErrorBoundary from "./3D/WebGLCanvasErrorBoundary.jsx";
import LeftMenu from "./HTML/components/leftMenu/LeftMenu.jsx";
import SiteTopHud from "./HTML/components/SiteTopHud.jsx";
import ScrollPageNavigator from "./HTML/components/ScrollPageNavigator/ScrollPageNavigator.jsx";
import HtmlRoutes from "./Routes/HtmlRoutes.jsx";
import { preloadHtmlRoutes } from "./Routes/routeModules.js";
import LoaderComponent from "./HTML/components/LoaderComponent.jsx";
import Cursor from "./HTML/components/Cursor.jsx";
import { useLocation } from "react-router-dom";
import SceneCarouselDebugPanel from "./HTML/components/SceneCarouselDebugPanel.jsx";
import StageProgressDebugPanel from "@/portfolio/dev/StageProgressDebugPanel.jsx";
import CaseStudyPanelHudOverlay from "@/portfolio/ui/CaseStudyCanvas/CaseStudyPanelHudOverlay.jsx";
import { store } from "../store.jsx";
import { isDomDistortDemoPath } from "../demos/domDistort/constants.js";
import { isWebGLDisabledFromUrl } from "../utils/postProcessTestFlags.js";
import { initPageVisibilitySound } from "../sounds/pageVisibilitySound.js";
import { prefetchSoundDesign } from "../sounds/soundDesign.js";

const SHOW_CUSTOM_CURSOR = true;
const LOADER_UNMOUNT_DELAY_MS = 1100;

export default function MainContent() {
	const [threeReady, setThreeReady] = useState(false);
	const [routeAssetsReady, setRouteAssetsReady] = useState(false);
	const [startApp, setStartApp] = useState(false);
	const [loaderMounted, setLoaderMounted] = useState(true);

	const location = useLocation();
	const routeTransition = useRouteTransition(location);
	useSceneCarouselNavigation();
	useHexHistoryNavigation(location, routeTransition);
	const { displayPathname, phase } = routeTransition;
	const [routeEnterActive, setRouteEnterActive] = useState(false);
	const scrollRestReactivate = useScrollRestReactivate(displayPathname, phase);

	const isDemoLab = isDomDistortDemoPath(location.pathname) || isDomDistortDemoPath(displayPathname);
	const skipWebGL = isWebGLDisabledFromUrl();
	const rendered = useMemo(
		() => routeAssetsReady && (skipWebGL || threeReady || isDemoLab),
		[isDemoLab, routeAssetsReady, skipWebGL, threeReady],
	);

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

	useEffect(() => {
		if (phase === "idle") {
			setRouteEnterActive(true);
			return;
		}
		if (phase !== "entering") {
			setRouteEnterActive(false);
			return;
		}
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

	return (
		<RouteTransitionProvider value={{ ...routeTransition, enterReady: routeEnterActive, scrollRestReactivate }}>
			<div className={contentContainerClass} id="contentContainer">
				{!isDemoLab && !skipWebGL && (
					<WebGLCanvasErrorBoundary onFailure={() => setThreeReady(true)}>
						<ThreeCanvasHost
							rendered={rendered}
							setRendered={setThreeReady}
							currentPage={displayPathname}
							teleportPage={location.pathname}
							startApp={startApp}
						/>
					</WebGLCanvasErrorBoundary>
				)}
				{(startApp || isDemoLab) && <HtmlRoutes />}
			</div>
			{startApp && !isDemoLab && <LeftMenu />}
			{startApp && !isDemoLab && <ScrollPageNavigator />}
			{startApp && !isDemoLab && <SiteTopHud startApp={startApp} />}
			{startApp && !isDemoLab && <CaseStudyPanelHudOverlay />}
			{import.meta.env.DEV && startApp && !isDemoLab && <SceneCarouselDebugPanel />}
			{import.meta.env.DEV && startApp && !isDemoLab && <StageProgressDebugPanel />}
			{!isDemoLab && loaderMounted && <LoaderComponent startApp={startApp} setStartApp={setStartApp} rendered={rendered} />}
			{SHOW_CUSTOM_CURSOR && <Cursor startApp={startApp} />}
		</RouteTransitionProvider>
	);
}
