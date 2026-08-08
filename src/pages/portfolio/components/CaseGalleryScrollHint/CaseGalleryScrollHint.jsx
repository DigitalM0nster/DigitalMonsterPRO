import { useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import { store } from "@/app/store.jsx";
import { getSiteCopy } from "@/app/i18n/siteCopy.js";
import { normalizeSiteLocale } from "@/functions/siteLocale.js";
import { subscribeSiteRouteTransition } from "@/three/render/transition/siteTransitionIntent.js";
import styles from "./CaseGalleryScrollHint.module.scss";

const COPY = {
	ru: "ЛИСТАЙТЕ ВНИЗ",
	en: "SCROLL DOWN",
	zh: "向下滚动",
};

/** Persistent DOM hint beside the prepared WebGL case gallery. */
export default function CaseGalleryScrollHint() {
	const plate = useSnapshot(store.portfolioPlateCase);
	const locale = normalizeSiteLocale(useSnapshot(store).siteLocale);
	const [dismissed, setDismissed] = useState(false);
	const plateWasOpenRef = useRef(plate.open);
	const visible = plate.open && plate.progress >= 0.82 && !dismissed;

	useEffect(() => subscribeSiteRouteTransition(({ from, to, mode }) => {
		if (mode === "hex" && from.startsWith("/portfolio/") && from !== to) {
			setDismissed(true);
		}
	}), []);

	useEffect(() => {
		if (!plateWasOpenRef.current && plate.open) {
			setDismissed(false);
		}
		plateWasOpenRef.current = plate.open;
	}, [plate.open]);

	return (
		<div
			data-case-gallery-scroll-hint
			className={[
				styles.hint,
				visible && styles.visible,
				dismissed && styles.dismissed,
			].filter(Boolean).join(" ")}
			aria-hidden={!visible}
		>
			<svg className={styles.mouse} viewBox="0 0 18 29" aria-hidden="true">
				<rect x="1" y="1" width="16" height="27" rx="8" />
				<path className={styles.wheel} d="M9 6v6" />
			</svg>
			<span>{getSiteCopy(COPY, locale)}</span>
			<svg className={styles.arrow} viewBox="0 0 10 18" aria-hidden="true">
				<path d="M5 0v15M1 11l4 4 4-4" />
			</svg>
		</div>
	);
}
