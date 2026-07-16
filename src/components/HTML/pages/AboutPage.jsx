import { useRef } from "react";
import { usePageStateClasses } from "@/context/RouteTransitionContext.jsx";
import { useAboutExperience } from "@/about/useAboutExperience.js";
import styles from "./AboutPage.module.scss";

/**
 * About route shell: owns scroll progress only. The WebGL scene lives in
 * DigitalMonsterThreeApp / AboutScene — no DOM text or UI overlays.
 */
export default function AboutPage() {
	const pageClassName = usePageStateClasses("about");
	const experienceRef = useRef(null);
	useAboutExperience(experienceRef);

	return (
		<div
			className={`${pageClassName} ${styles.aboutPage}`}
			ref={experienceRef}
			aria-label="О нас"
		/>
	);
}
