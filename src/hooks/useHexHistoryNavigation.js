import { useEffect, useLayoutEffect, useRef } from "react";
import { useNavigationType } from "react-router-dom";
import { subscribeKey } from "valtio/utils";
import { normalizeSitePath, requestHexNavigation, setHexVisualPath } from "@/utils/hexNavigation.js";
import { store } from "@/store.jsx";

/**
 * Back/forward: hex-transition с очередью pending-цели.
 * displayPathname догоняет URL только после завершения hex.
 */
export function useHexHistoryNavigation(location, { displayPathname, setDisplayPathname }) {
	const navigationType = useNavigationType();
	const displayRef = useRef(displayPathname);
	const lastHandledPopPathRef = useRef(null);

	displayRef.current = displayPathname;

	useEffect(() => {
		setHexVisualPath(displayPathname);
	}, [displayPathname]);

	useLayoutEffect(() => {
		if (navigationType !== "POP") {
			lastHandledPopPathRef.current = null;
			return;
		}

		const to = normalizeSitePath(location.pathname);

		// Один POP = один pathname. Не реагируем на смену displayPathname после hex.
		if (lastHandledPopPathRef.current === to) {
			return;
		}
		lastHandledPopPathRef.current = to;

		const from = normalizeSitePath(displayRef.current);
		if (to === from) {
			return;
		}

		requestHexNavigation(to, from, { preserveBrowserUrl: true });
	}, [navigationType, location.pathname]);

	useEffect(() => {
		const applyDisplayPath = (path) => {
			if (!path) {
				return;
			}

			const next = normalizeSitePath(path);
			setDisplayPathname(next);
			setHexVisualPath(next);
		};

		// `sceneCarouselNavigatePath` only publishes the latest browser URL intent.
		// Do not use it as the rendered route: menu clicks publish it at the start of
		// the hex animation, while the source HTML and scene must stay mounted until
		// SceneCarousel reaches its final frame.  The carousel publishes the visual
		// route separately through `sceneCarouselDisplayPath` on completion.
		const unsubscribeDisplay = subscribeKey(store, "sceneCarouselDisplayPath", (path) => {
			applyDisplayPath(path);
			if (!path) {
				return;
			}
			queueMicrotask(() => {
				if (store.sceneCarouselDisplayPath === path) {
					store.sceneCarouselDisplayPath = null;
				}
			});
		});

		return () => {
			unsubscribeDisplay();
		};
	}, [setDisplayPathname]);
}
