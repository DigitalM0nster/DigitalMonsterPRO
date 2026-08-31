import { Navigate, useParams } from "react-router-dom";
import { useSnapshot } from "valtio";
import { store } from "@/app/store.jsx";
import {
	CAPABILITIES,
	FIRST_CAPABILITY_PATH,
	getCapabilityBySlug,
} from "@/pages/capabilities/data/capabilities.js";
import { usePageStateClasses } from "@/app/context/RouteTransitionContext.jsx";
import { requestMmk1ReturnToOverview } from "./mmk1SceneBridge.js";
import styles from "./CapabilitiesPage.module.scss";

export default function CapabilitiesPage() {
	const { "*": nestedPath = "" } = useParams();
	const slug = nestedPath.split("/").filter(Boolean)[0] ?? null;
	const pageClassName = usePageStateClasses("capabilities");
	const experience = useSnapshot(store.capabilitiesExperience);
	const active = getCapabilityBySlug(slug);

	if (!slug || !CAPABILITIES.some((capability) => capability.id === slug)) {
		return <Navigate to={FIRST_CAPABILITY_PATH} replace />;
	}

	return (
		<div className={`${pageClassName} ${styles.page}`} data-capability-id={active.id}>
			<button
				type="button"
				className={`${styles.overviewReturn} ${active.id === "mmk1" && experience.investigating ? styles.visible : ""}`}
				onClick={requestMmk1ReturnToOverview}
				aria-hidden={active.id !== "mmk1" || !experience.investigating}
				tabIndex={active.id === "mmk1" && experience.investigating ? 0 : -1}
			>
				<span className={styles.returnGlyph} aria-hidden="true">
					<svg viewBox="0 0 72 30" focusable="false">
						<path
							className={styles.returnArrowTrack}
							d="M68 15H27l-8-8L6 15l13 8 8-8"
						/>
						<path
							className={styles.returnArrowPaint}
							d="M68 15H27l-8-8L6 15l13 8 8-8"
							pathLength="1"
						/>
						<path className={styles.returnArrowRails} d="M42 9h21M49 21h13" />
						<circle className={styles.returnArrowNode} cx="68" cy="15" r="1.5" />
					</svg>
				</span>
				<span className={styles.returnCopy}>
					<span className={styles.returnIndex}>SYS / 00</span>
					<span>Вернуться к общему виду</span>
				</span>
			</button>
		</div>
	);
}
