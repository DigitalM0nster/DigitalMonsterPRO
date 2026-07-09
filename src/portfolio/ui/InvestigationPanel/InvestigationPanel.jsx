import styles from "./InvestigationPanel.module.scss";
import { usePortfolioProject } from "@/portfolio/core/PortfolioProjectContext.jsx";

export default function InvestigationPanel() {
	const { activeHotspot, isInvestigating, leaveInvestigation } = usePortfolioProject();

	if (!isInvestigating || !activeHotspot) {
		return null;
	}

	const uiTitle = activeHotspot.investigation?.uiTitle ?? activeHotspot.title;
	const uiDescription = activeHotspot.investigation?.uiDescription ?? activeHotspot.description;

	return (
		<aside className={styles.investigationPanel} aria-label="Режим исследования">
			<div className={styles.label}>Исследование · смотрите на модель</div>
			<h2 className={styles.title}>{uiTitle}</h2>
			{uiDescription && <p className={styles.description}>{uiDescription}</p>}
			<button type="button" className={styles.backButton} onClick={leaveInvestigation}>
				← Вернуться к главе
			</button>
		</aside>
	);
}
