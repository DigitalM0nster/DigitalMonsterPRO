import { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { shouldActivateRoutePage } from "@/utils/shouldActivateRoutePage.js";

import Case2Model from "../3D/models/portfolio/case2/Case2Model.jsx";
import Case3Model from "../3D/models/portfolio/case3/Case3Model.jsx";
import Case4Model from "../3D/models/portfolio/case4/Case4Model.jsx";
import Case5Model from "../3D/models/portfolio/case5/Case5Model.jsx";
import PortfolioHubModel from "../3D/models/portfolio/hub/PortfolioHubModel.jsx";
import ContactsPageModel from "../3D/models/contacts/ContactsPageModel.jsx";
import EffectComposerComponent from "../3D/effects/EffectComposerComponent.jsx";
import MyEnvironment from "../3D/MyEnvironment.jsx";
import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "@/store.jsx";
import { Sparkles } from "@react-three/drei";
import PreloadReadyNotifier from "../3D/PreloadReadyNotifier.jsx";

export default function CanvasRoutes(props) {
	const storeProxy = useStore();

	const currentPage = props.currentPage;
	const teleportPage = props.teleportPage;
	const { phase: routePhase } = useRouteTransitionContext();
	const { camera } = useThree();
	const isHomeDisplayed = currentPage.split("/")[1] === "";
	const showHomeSparkles = shouldActivateRoutePage(isHomeDisplayed, routePhase);

	useEffect(() => {
		if (!showHomeSparkles) {
			return;
		}
		camera.position.set(0, 0, 9);
		camera.lookAt(0, 0, 0);
		storeProxy.scroll = 0;
	}, [showHomeSparkles, camera, storeProxy]);

	const case2ModelRef = useRef();
	const case3ModelRef = useRef();
	const case4ModelRef = useRef();
	const case5ModelRef = useRef();
	const portfolioHubModelRef = useRef();
	const contactsModelRef = useRef();
	const renderedScheduledRef = useRef(false);

	useFrame(() => {
		if (props.rendered || renderedScheduledRef.current) {
			return;
		}
		const hub = portfolioHubModelRef.current;
		const c2 = case2ModelRef.current;
		const c3 = case3ModelRef.current;
		const c4 = case4ModelRef.current;
		const c5 = case5ModelRef.current;
		const ct = contactsModelRef.current;
		const refs = [hub, c2, c3, c4, c5, ct];
		const mounted = refs.filter(Boolean);
		if (mounted.length >= 4 && mounted.some((node) => node.visible === false)) {
			renderedScheduledRef.current = true;
			queueMicrotask(() => props.setRendered(true));
		}
	});

	return (
		<>
			<PreloadReadyNotifier onReady={props.setRendered} />
			{showHomeSparkles && (
				<Sparkles count={storeProxy.sparklesCount} scale={[20, 90, 0]} size={0.8} speed={0.5} color={"#00d9d6"} />
			)}
			<EffectComposerComponent
				currentPage={currentPage}
				teleportPage={teleportPage}
				startApp={props.startApp}
				letSounds={props.letSounds}
			/>
			<MyEnvironment currentPage={currentPage} startApp={props.startApp} letSounds={props.letSounds} />
			<PortfolioHubModel
				ref={portfolioHubModelRef}
				currentPage={currentPage}
				teleportPage={teleportPage}
			/>
			<Case2Model ref={case2ModelRef} currentPage={currentPage} teleportPage={teleportPage} />
			<Case3Model ref={case3ModelRef} currentPage={currentPage} />
			<Case4Model ref={case4ModelRef} currentPage={currentPage} />
			<Case5Model ref={case5ModelRef} currentPage={currentPage} />
			<ContactsPageModel ref={contactsModelRef} currentPage={currentPage} />
		</>
	);
}

CanvasRoutes.propTypes = {
	currentPage: PropTypes.string.isRequired,
	teleportPage: PropTypes.string,
	rendered: PropTypes.bool,
	setRendered: PropTypes.func.isRequired,
	startApp: PropTypes.bool,
	letSounds: PropTypes.bool,
};
