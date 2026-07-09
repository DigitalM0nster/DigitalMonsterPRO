import { forwardRef, useEffect, useMemo, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { easing } from "maath";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { isPortfolioHubPath } from "@/three/scenes/portfolio/hub/projectsData.js";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { ROUTE_TRANSITION_ENTER_MS } from "@/config/routeTransition.js";
import { shouldActivateRoutePage } from "@/utils/shouldActivateRoutePage.js";
import PortfolioHubPlate from "./PortfolioHubPlate.jsx";
import { buildPlateGridLayouts, portfolioHubPlatesConfig, portfolioHubLights } from "./portfolioHubConfig.js";

export default forwardRef(function PortfolioHubModel(props, ref) {
	const { camera } = useThree();
	const { phase: routePhase } = useRouteTransitionContext();
	const [active, setActive] = useState(false);

	const layouts = useMemo(() => buildPlateGridLayouts(), []);
	const hubDisplayed = isPortfolioHubPath(props.currentPage);
	const hubTarget = isPortfolioHubPath(props.teleportPage);
	const showHub = hubDisplayed || (hubTarget && routePhase !== "exiting");
	const cam = portfolioHubPlatesConfig.camera;

	useEffect(() => {
		if (!showHub) {
			return;
		}
		RectAreaLightUniformsLib.init();
	}, [showHub]);

	useEffect(() => {
		const shouldWake =
			shouldActivateRoutePage(hubDisplayed, routePhase) ||
			(hubTarget && routePhase === "entering");

		if (shouldWake) {
			setActive(false);
			if (ref.current) {
				ref.current.visible = true;
				ref.current.scale.set(0.001, 0.001, 0.001);
			}
			const id = setTimeout(() => setActive(true), ROUTE_TRANSITION_ENTER_MS);
			return () => clearTimeout(id);
		}
		setActive(false);
	}, [hubDisplayed, hubTarget, routePhase, ref]);

	useEffect(() => {
		if (!showHub) {
			return;
		}
		camera.position.set(...cam.position);
		camera.lookAt(...cam.lookAt);
	}, [showHub, camera, cam.position, cam.lookAt]);

	useFrame((_, delta) => {
		if (!ref.current || !showHub || !active) {
			return;
		}
		ref.current.visible = true;
		easing.damp3(ref.current.scale, [1, 1, 1], 0.8, delta);
	});

	if (!showHub) {
		return <group ref={ref} visible={false} scale={[0.001, 0.001, 0.001]} />;
	}

	return (
		<group ref={ref} visible={false} scale={[0.001, 0.001, 0.001]}>
			<color attach="background" args={["#020408"]} />
			<ambientLight
				color={portfolioHubLights.ambient.color}
				intensity={portfolioHubLights.ambient.intensity}
			/>
			{portfolioHubLights.directionals.map((light) => (
				<directionalLight
					key={light.id}
					color={light.color}
					intensity={light.intensity}
					position={light.position}
				/>
			))}
			{(portfolioHubLights.rectAreas ?? []).map((light) => {
				const rotation = (light.rotation ?? [0, 0, 0]).map((deg) => (deg * Math.PI) / 180);
				return (
					<rectAreaLight
						key={light.id}
						color={light.color}
						intensity={light.intensity}
						width={light.width}
						height={light.height}
						position={light.position}
						rotation={rotation}
					/>
				);
			})}

			{layouts.map((layout) => (
				<PortfolioHubPlate
					key={`${layout.rowIndex}-${layout.plateIndex}`}
					layout={layout}
				/>
			))}
		</group>
	);
});
