import { useStore } from "@/store.jsx";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import SiteTopHudBrand from "./SiteTopHudBrand.jsx";
import SiteTopHudPageRoute from "./SiteTopHudPageRoute.jsx";
import SiteTopHudTimeline from "./SiteTopHudTimeline.jsx";
import SiteTopHudRollingClock from "./SiteTopHudRollingClock.jsx";
import SiteTopHudSoundScope from "./SiteTopHudSoundScope.jsx";
import styles from "./SiteTopHud.module.scss";

/** Верхняя HUD-полоса: бренд, маршрут, шкала, часы, осциллограф. */
export default function SiteTopHud({ startApp = false }) {
	const proxyStore = useStore();
	const { displayPathname } = useRouteTransitionContext();

	return (
		<header className={[styles.topHud, startApp && styles.active, proxyStore.soundsActive ? styles.on : styles.off].filter(Boolean).join(" ")} aria-label="Панель сайта">
			<div className={styles.topHudBar}>
				<SiteTopHudBrand />
				<SiteTopHudPageRoute pathname={displayPathname} locale={proxyStore.siteLocale} />
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
}
