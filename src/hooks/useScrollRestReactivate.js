import { useEffect, useRef, useState } from "react";
import { subscribeKey } from "valtio/utils";
import { ROUTE_TRANSITION_ENTER_MS } from "@/config/routeTransition.js";
import { CAROUSEL_PROGRESS_COMMIT_EPS } from "@/three/render/transition/SceneCarousel.js";
import { store } from "@/store.jsx";

/**
 * Краткий импульс scrollRestReactivate при возврате progress карусели к 0
 * (без смены роута) — чтобы снова включить activating + active.
 */
export function useScrollRestReactivate(displayPathname, phase) {
	const [scrollRestReactivate, setScrollRestReactivate] = useState(false);
	const progressRef = useRef(store.hexShaderProgress ?? 0);
	const displayPathRef = useRef(displayPathname);
	const phaseRef = useRef(phase);
	const timerRef = useRef(null);

	displayPathRef.current = displayPathname;
	phaseRef.current = phase;

	useEffect(() => {
		progressRef.current = store.hexShaderProgress ?? 0;
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		setScrollRestReactivate(false);
	}, [displayPathname]);

	useEffect(() => {
		return subscribeKey(store, "hexShaderProgress", (progress) => {
			const value = progress ?? 0;
			const prev = progressRef.current;
			progressRef.current = value;

			if (!store.appStarted || phaseRef.current !== "idle") {
				return;
			}

			const wasScrolling = prev > CAROUSEL_PROGRESS_COMMIT_EPS;
			const nowRest = value <= CAROUSEL_PROGRESS_COMMIT_EPS;

			if (!wasScrolling || !nowRest) {
				return;
			}

			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}

			setScrollRestReactivate(true);
			timerRef.current = setTimeout(() => {
				setScrollRestReactivate(false);
				timerRef.current = null;
			}, ROUTE_TRANSITION_ENTER_MS);
		});
	}, []);

	useEffect(() => {
		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
		};
	}, []);

	return scrollRestReactivate;
}
