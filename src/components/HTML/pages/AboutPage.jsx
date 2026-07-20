import { usePageStateClasses } from "@/context/RouteTransitionContext.jsx";
import styles from "./AboutPage.module.scss";

/**
 * About route shell (HTML). Wheel/story ownership lives in AboutExperienceHost
 * so it starts on SceneCarousel commit — not after displayPathname exit.
 */
export default function AboutPage() {
	const pageClassName = usePageStateClasses("about");

	return (
		<div
			className={`${pageClassName} ${styles.aboutPage}`}
			data-about-experience-root=""
			aria-label="О нас"
		/>
	);
}
