import { useEffect, useState } from "react";
import { useSnapshot } from "valtio";
import { subscribeKey } from "valtio/utils";
import { store } from "@/app/store.jsx";
import { useRouteTransitionContext } from "@/app/context/RouteTransitionContext.jsx";
import { getLoaderCurtainRemainingMs } from "@/app/config/loaderCurtain.js";
import { HERO_SCROLL_HINT_TRANSLATIONS } from "@/app/localization/interfaceTranslations.js";
import { subscribeSiteRouteTransition } from "@/three/render/transition/siteTransitionIntent.js";
import styles from "./ScrollHintHud.module.scss";
import CoreHintIcon from "./CoreHintIcon.jsx";

const CORE_PATH = "/capabilities/synthetic-core";
const CORE_HINT = {
	ru: ["Кликните на сферу", "Кликните, чтобы собрать"],
	en: ["Click the sphere", "Click to reassemble"],
	zh: ["点击球体", "点击重新组装"],
};

/** Persistent screen HUD. Scene transforms, bloom and hex never touch this cue. */
export default function ScrollHintHud() {
	const { displayPathname } = useRouteTransitionContext();
	const { siteLocale } = useSnapshot(store);
	const [visible, setVisible] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const isCore = displayPathname === CORE_PATH;

	useEffect(() => {
		// One notification per accepted click; no render-loop subscription or polling.
		const syncAssembly = event => setExpanded(Boolean(event.detail.expanded));
		window.addEventListener("synthetic-core-assembly-change", syncAssembly);
		return () => window.removeEventListener("synthetic-core-assembly-change", syncAssembly);
	}, []);

	useEffect(() => {
		let curtainReady = false;
		let leavePending = false;
		const sync = () => {
			const ownsScene = displayPathname === "/" ? store.sceneCarouselCurrentId === "home"
				: displayPathname === CORE_PATH && store.sceneCarouselCurrentId === "capabilities:syntheticCore";
			const atRest = ownsScene
				&& !store.openedCase && !store.sceneCarouselClickTransitionActive
				&& Math.abs(store.sceneCarouselProgressTarget) < .001
				&& Math.abs(store.sceneCarouselProgress) < .001
				&& Math.abs(store.hexShaderProgress) < .001;
			if (!atRest) leavePending = false;
			setVisible(curtainReady && atRest && !leavePending && !document.hidden);
		};
		// Menu/history leaves begin at the canonical leave decision, before route swap.
		const unsubscribeLeave = subscribeSiteRouteTransition(({ from, to }) => {
			if ((from === "/" || from === CORE_PATH) && to !== from) {
				leavePending = true;
				setVisible(false);
			}
		});
		const unsubscribes = ["sceneCarouselCurrentId", "openedCase", "sceneCarouselClickTransitionActive",
			"sceneCarouselProgressTarget", "sceneCarouselProgress", "hexShaderProgress"]
			.map(key => subscribeKey(store, key, sync));
		const remaining = getLoaderCurtainRemainingMs(store.appStartedAt);
		const timer = window.setTimeout(() => { curtainReady = true; sync(); }, remaining);
		document.addEventListener("visibilitychange", sync);
		sync();
		return () => {
			window.clearTimeout(timer);
			unsubscribes.forEach(unsubscribe => unsubscribe());
			unsubscribeLeave();
			document.removeEventListener("visibilitychange", sync);
		};
	}, [displayPathname]);

	return (
		<div className={`${styles.hud} ${isCore ? styles.core : ""} ${visible ? styles.visible : ""}`} aria-hidden={!visible} data-scroll-hint-hud data-hint-kind={isCore ? "core" : "scroll"}>
			{isCore ? <div className={styles.clickVisual} aria-hidden="true">
				<CoreHintIcon />
				<svg className={styles.clickPointer} viewBox="0 0 18 22" fill="none">
					<path d="M2 2L15 12L9 13L7 19L2 2Z" fill="#06131b" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
				</svg>
			</div> : <div className={styles.visual} aria-hidden="true">
				<span className={styles.lineUp} />
				<span className={styles.ring} />
				<span className={styles.lineDown} />
			</div>}
			<span className={styles.label}>{isCore
				? (CORE_HINT[siteLocale] ?? CORE_HINT.ru)[expanded ? 1 : 0]
				: (HERO_SCROLL_HINT_TRANSLATIONS[siteLocale] ?? HERO_SCROLL_HINT_TRANSLATIONS.ru)}</span>
		</div>
	);
}
