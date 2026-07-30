/* eslint-disable react/prop-types */
import styles from "./CaseStudyMobileBottomSheet.module.scss";

/**
 * @param {{
 *   open: boolean,
 *   title: string,
 *   paragraphs: string[],
 *   closeLabel?: string,
 *   onClose: () => void,
 * }} props
 */
export default function CaseStudyMobileBottomSheet({ open, title, paragraphs, closeLabel = "Закрыть", onClose }) {
	if (!open) {
		return null;
	}

	return (
		<div className={styles.bottomSheetRoot} role="dialog" aria-modal="true" aria-label={title}>
			<button type="button" className={styles.backdrop} aria-label={closeLabel} onClick={onClose} />
			<div className={styles.sheet}>
				<div className={styles.sheetHandle} />
				<h3 className={styles.sheetTitle}>{title}</h3>
				{paragraphs.map((paragraph) => (
					<p key={paragraph.slice(0, 24)} className={styles.sheetParagraph}>
						{paragraph}
					</p>
				))}
				<button type="button" className={styles.closeButton} onClick={onClose}>
					{closeLabel}
				</button>
			</div>
		</div>
	);
}
