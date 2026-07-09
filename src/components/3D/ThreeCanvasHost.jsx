import { useEffect, useRef, useState } from "react";
import { store as appStore } from "@/store.jsx";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { DigitalMonsterThreeApp } from "@/three/app/DigitalMonsterThreeApp.js";
import { syncCarouselFromPage } from "@/three/render/transition/carouselPage.js";
import {
	isWebGLBlockedError,
	isWebGLSessionBlocked,
	markWebGLSessionBlocked,
	withWebGLInitLock,
	clearWebGLSessionBlock,
} from "@/three/renderer/webglSessionGuard.js";

/**
 * React-оболочка: HTML остаётся в React, 3D — DigitalMonsterThreeApp (чистый THREE loop).
 * При блокировке WebGL не дёргаем GPU повторно (HMR / F5).
 */
export default function ThreeCanvasHost(props) {
	const containerRef = useRef(null);
	const appRef = useRef(null);
	const routeTransition = useRouteTransitionContext();
	const [webglState, setWebglState] = useState(() => (isWebGLSessionBlocked() ? "blocked" : "pending"));

	const markWebGLFailed = (error, phase) => {
		if (isWebGLBlockedError(error)) {
			markWebGLSessionBlocked(error);
			setWebglState("blocked");
		} else {
			setWebglState("failed");
		}

		console.error(`[three] WebGL unavailable (${phase})`, error);
		props.setRendered(true);
	};

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return undefined;
		}

		if (isWebGLSessionBlocked()) {
			markWebGLFailed(new Error("WebGL session blocked"), "session");
			return undefined;
		}

		let cancelled = false;
		/** @type {DigitalMonsterThreeApp | null} */
		let app = null;

		const created = withWebGLInitLock(() => {
			try {
				return new DigitalMonsterThreeApp(container, {
					store: appStore,
					setRendered: props.setRendered,
					routeTransition,
					onWebGLContextLost: (reason) => {
						if (!cancelled) {
							markWebGLFailed(new Error(`context lost: ${reason}`), "runtime");
						}
					},
				});
			} catch (error) {
				markWebGLFailed(error, "init");
				return null;
			}
		});

		if (!created) {
			return undefined;
		}

		app = created;

		if (cancelled) {
			app.dispose();
			return undefined;
		}

		appRef.current = app;
		clearWebGLSessionBlock();
		app.setProps({
			currentPage: props.currentPage,
			teleportPage: props.teleportPage,
			routeTransition,
			startApp: props.startApp,
		});
		app.start();
		setWebglState("ok");

		if (import.meta.env.DEV) {
			console.info("[three] app/DigitalMonsterThreeApp");
		}

		return () => {
			cancelled = true;
			app?.dispose();
			appRef.current = null;
		};
	}, []);

	useEffect(() => {
		syncCarouselFromPage(props.currentPage);
	}, [props.currentPage]);

	useEffect(() => {
		appRef.current?.setProps({
			currentPage: props.currentPage,
			teleportPage: props.teleportPage,
			routeTransition,
			startApp: props.startApp,
		});
	}, [props.currentPage, props.teleportPage, props.startApp, routeTransition]);

	const hostClassName = ["canvasParent", (webglState === "failed" || webglState === "blocked") && "canvasParentWebglFailed"]
		.filter(Boolean)
		.join(" ");

	return <div ref={containerRef} className={hostClassName} data-webgl={webglState} />;
}
