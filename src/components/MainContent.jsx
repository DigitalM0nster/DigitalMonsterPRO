import { useEffect, useState } from "react";
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
import "../css/main/mainTransition.scss";
import "../css/portfolio/portfolio.scss";
import "../css/portfolio/portfolioOverlay.css";
import "../css/portfolio/portfolioTransition.css";
import "../css/portfolio/portfolioExploration.scss";
import "../css/portfolio/case1.css";
import "../css/portfolio/case2.css";
import "../css/portfolio/case3.css";
import "../css/portfolio/case4.css";
import "../css/portfolio/case5.css";
import "../css/portfolio/NipigasMainScreen.css";
import "../css/portfolio/NipigasHistory.css";
import "../css/about/aboutTransition.css";
import "../css/about/aboutContentTransition.css";
import "../css/contacts/contactsTransition.css";
import "../css/media.css";
import ThreeCanvasHost from "./3D/ThreeCanvasHost.jsx";
import WebGLCanvasErrorBoundary from "./3D/WebGLCanvasErrorBoundary.jsx";
import LeftMenu from "./HTML/components/leftMenu/LeftMenu.jsx";
import SiteTopHud from "./HTML/components/SiteTopHud.jsx";
import HtmlRoutes from "./Routes/HtmlRoutes.jsx";
import LoaderComponent from "./HTML/components/LoaderComponent.jsx";
import Cursor from "./HTML/components/Cursor.jsx";
import { useLocation } from "react-router-dom";
import SceneCarouselDebugPanel from "./HTML/components/SceneCarouselDebugPanel.jsx";
import { store } from "../store.jsx";
import { isDomDistortDemoPath } from "../demos/domDistort/constants.js";
import { isWebGLDisabledFromUrl } from "../utils/postProcessTestFlags.js";
import { initPageVisibilitySound } from "../sounds/pageVisibilitySound.js";

const SHOW_CUSTOM_CURSOR = true;

export default function MainContent() {
	const [rendered, setRendered] = useState(false);
	const [startApp, setStartApp] = useState(false);

	const location = useLocation();
	const routeTransition = useRouteTransition(location);
	useSceneCarouselNavigation();
	useHexHistoryNavigation(location, routeTransition);
	const { displayPathname, phase } = routeTransition;
	const [routeEnterActive, setRouteEnterActive] = useState(false);
	const scrollRestReactivate = useScrollRestReactivate(displayPathname, phase);

	const isDemoLab = isDomDistortDemoPath(location.pathname) || isDomDistortDemoPath(displayPathname);
	const skipWebGL = isWebGLDisabledFromUrl();

	useEffect(() => {
		if (skipWebGL) {
			setRendered(true);
		}
	}, [skipWebGL]);

	useEffect(() => {
		initPageVisibilitySound();
	}, []);

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
			setRendered(true);
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
					<WebGLCanvasErrorBoundary onFailure={() => setRendered(true)}>
						<ThreeCanvasHost
							rendered={rendered}
							setRendered={setRendered}
							currentPage={displayPathname}
							teleportPage={location.pathname}
							startApp={startApp}
						/>
					</WebGLCanvasErrorBoundary>
				)}
				{(startApp || isDemoLab) && <HtmlRoutes />}
			</div>
			{startApp && !isDemoLab && <LeftMenu />}
			{startApp && !isDemoLab && <SiteTopHud startApp={startApp} />}
			{import.meta.env.DEV && startApp && !isDemoLab && <SceneCarouselDebugPanel />}
			{!isDemoLab && <LoaderComponent startApp={startApp} setStartApp={setStartApp} rendered={rendered} />}
			{SHOW_CUSTOM_CURSOR && <Cursor startApp={startApp} />}
		</RouteTransitionProvider>
	);
}
