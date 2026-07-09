import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { RGBELoader } from "three-stdlib";
import { easing } from "maath";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { ROUTE_TRANSITION_ENTER_MS } from "@/config/routeTransition.js";
import BackgroundLiquidDistortionComponent from "../effects/backgroundLiquid/BackgroundLiquidDistortionComponent.jsx";

/** Плавность при появлении страницы (фаза entering) */
const BG_ENTER_SMOOTH_SEC = ROUTE_TRANSITION_ENTER_MS / 1000;

function brightnessForPage(page) {
	return page === "/" ? 1.0 : 0.025;
}

/** Liquid HDR-фон — fullscreen, без border blur. */
export default function BackgroundEffects({ currentPage }) {
	const { phase } = useRouteTransitionContext();
	const [scaleIn, setScaleIn] = useState(true);

	const texture = useLoader(RGBELoader, "/backgrounds/backLavaweb.hdr");

	useEffect(() => {
		if (texture) {
			texture.mapping = THREE.EquirectangularReflectionMapping;
		}
	}, [texture]);

	const liquidScaleRef = useRef(1.0);
	const brightnessRef = useRef(1.0);
	const iTimeRef = useRef(0.0);

	useEffect(() => {
		setScaleIn((v) => !v);
	}, [currentPage]);

	const liquidSettings = {
		liquidScale: liquidScaleRef,
		brightness: brightnessRef,
		distortionColor: new THREE.Color("#1b476f"),
		iTime: iTimeRef,
	};

	useFrame((_, delta) => {
		const targetBrightness = brightnessForPage(currentPage);
		const targetScale = 1;
		const smoothSec = phase === "entering" ? BG_ENTER_SMOOTH_SEC : 0.5;

		easing.damp(brightnessRef, "current", targetBrightness, smoothSec, delta);
		easing.damp(liquidScaleRef, "current", targetScale, smoothSec, delta);
		iTimeRef.current += delta * 0.1;
	}, 0);

	return <BackgroundLiquidDistortionComponent backgroundTexture={texture} {...liquidSettings} />;
}
