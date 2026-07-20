import styles from "./StateContentOverlay.module.scss";
import InvestigationPanel from "../InvestigationPanel/InvestigationPanel.jsx";

/**
 * HTML-слой только для режима investigation (hotspot).
 * Case HUD: WebGL left panel; arc chrome is CaseStudyArcOverlay (site-level).
 *
 * @param {{ isInvestigating: boolean }} props
 */
export default function StateContentOverlay({ isInvestigating }) {
	if (!isInvestigating) {
		return null;
	}

	return (
		<div className={[styles.stateContentOverlay, styles.investigation].join(" ")}>
			<InvestigationPanel />
		</div>
	);
}
