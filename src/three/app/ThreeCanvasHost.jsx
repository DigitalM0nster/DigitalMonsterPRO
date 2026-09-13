/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./ThreeCanvasHost.module.scss";
import { store as appStore } from "@/app/store.jsx";
import { useRouteTransitionContext } from "@/app/context/RouteTransitionContext.jsx";
import { DigitalMonsterThreeApp } from "./DigitalMonsterThreeApp.js";
import { syncCarouselFromPage } from "@/three/render/transition/carouselPage.js";
import {
	isWebGLBlockedError,
	isWebGLSessionBlocked,
	markWebGLSessionBlocked,
	withWebGLInitLock,
	clearWebGLSessionBlock,
} from "@/three/renderer/webglSessionGuard.js";

/** React host for the imperative Three.js application. */
export default function ThreeCanvasHost(props) {
	const containerRef = useRef(null);
	const appRef = useRef(null);
	const routeTransition = useRouteTransitionContext();
	const [webglState, setWebglState] = useState(() => (isWebGLSessionBlocked() ? "blocked" : "pending"));
	const [failure, setFailure] = useState(null);

	const markWebGLFailed = (error, phase) => {
		if (isWebGLBlockedError(error)) {
			markWebGLSessionBlocked(error);
			setWebglState("blocked");
		} else {
			setWebglState("failed");
		}

		console.error(`[three] WebGL unavailable (${phase})`, error);
		setFailure({ phase, message: error instanceof Error ? error.message : String(error) });
		// A failed/lost context cannot satisfy the full-warm gate.
		props.setRendered(false);
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
		void app.preparePromise.then((prepared) => {
			if (!cancelled && !prepared && !app._webglLost) {
				markWebGLFailed(app.prepareError ?? new Error("Scene preparation failed"), "prepare");
			}
		}).catch((error) => {
			if (!cancelled) markWebGLFailed(error, "prepare");
		});
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
	// Mount owns the renderer; route/Start props are synchronized separately below.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		syncCarouselFromPage(props.currentPage);
	}, [props.currentPage]);

	useEffect(() => {
		if (!props.startApp) {
			return;
		}
		const pageForCarousel = props.teleportPage || props.currentPage;
		syncCarouselFromPage(pageForCarousel, { force: true });
		appRef.current?.setProps({
			currentPage: pageForCarousel,
			teleportPage: props.teleportPage,
			routeTransition,
			startApp: props.startApp,
		});
	// Force carousel alignment only on Start, never on an ordinary route change.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [props.startApp]);

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

	const retryWithLowGraphics = () => {
		clearWebGLSessionBlock();
		const url = new URL(window.location.href);
		url.searchParams.set("tier", "low");
		window.location.assign(url.href);
	};

	return <>
		<div ref={containerRef} className={hostClassName} data-webgl={webglState} />
		{failure && createPortal(
			<div className={styles.failure} role="alert">
				<div className={styles.message}>
					<p className={styles.brand}>DIGITAL MONSTER</p>
					<h1>Не удалось открыть 3D</h1>
					<p>Графика не запустилась. Повторите загрузку с уменьшенной нагрузкой.</p>
					<button type="button" onClick={retryWithLowGraphics}>Повторить загрузку</button>
					<details><summary>Информация об ошибке</summary><p>{failure.phase}: {failure.message}</p></details>
				</div>
			</div>, document.body,
		)}
	</>;
}
