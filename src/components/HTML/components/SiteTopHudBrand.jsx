import styles from "./SiteTopHud.module.scss";

/** Бренд в верхней полосе — как wordmark в левом меню. */
export default function SiteTopHudBrand() {
	return (
		<span className={styles.brand} data-site-top-hud-brand>
			<span className={styles.brandPrimary}>DIGITAL</span>
			<span className={styles.brandSecondary}>MONSTER</span>
		</span>
	);
}
