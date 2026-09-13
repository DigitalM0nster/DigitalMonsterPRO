import { memo, useMemo } from "react";
import { useStore } from "@/app/store.jsx";
import PropTypes from "prop-types";
import { useRouteTransitionContext } from "@/app/context/RouteTransitionContext.jsx";
import SiteTopHudBrand from "./SiteTopHudBrand.jsx";
import SiteTopHudPageRoute from "./SiteTopHudPageRoute.jsx";
import SiteTopHudTimeline from "./SiteTopHudTimeline.jsx";
import SiteTopHudRollingClock from "./SiteTopHudRollingClock.jsx";
import SiteTopHudSoundScope from "./SiteTopHudSoundScope.jsx";
import styles from "./SiteTopHud.module.scss";

function SiteTopHudRouteLabel() {
	const { siteLocale } = useStore();
	const { displayPathname } = useRouteTransitionContext();
	// Transition phases change independently of the visible route. Keep the
	// prepared bilingual letter tree intact until its actual content changes.
	return useMemo(() => <SiteTopHudPageRoute pathname={displayPathname} locale={siteLocale} />, [displayPathname, siteLocale]);
}

/** Верхняя HUD-полоса: бренд, маршрут, шкала, часы, осциллограф. */
const SiteTopHud = memo(function SiteTopHud({ startApp = false }) {
	const proxyStore = useStore();

	return (
		<header className={[styles.topHud, startApp && styles.active, proxyStore.soundsActive ? styles.on : styles.off].filter(Boolean).join(" ")} aria-label="Панель сайта" data-canvas-pointer-blocker="true">
			<div className={styles.topHudBar}>
				<SiteTopHudBrand />
				<SiteTopHudRouteLabel />
				<SiteTopHudTimeline />
			</div>

			<div className={styles.meta}>
				<SiteTopHudSoundScope />
				<div className={styles.rightPart}>
					<SiteTopHudRollingClock />
					<div className={styles.statusBeacon} aria-hidden="true">
						<span className={styles.statusOrbitOuter} />
						<span className={styles.statusOrbit} />
						<span className={styles.statusRing} />
						<span className={styles.statusCore} />
					</div>
				</div>
			</div>
		</header>
	);
});
SiteTopHud.propTypes = { startApp: PropTypes.bool };
export default SiteTopHud;
