/* eslint-disable react/prop-types */
import styles from "./CaseStudyCanvasUI.module.scss";
import { parseTraitMetricRow } from "./caseStudyLeftPanelTraitsList.js";

function SelectableMetricRow({ glyph, topText, bottomText, feature = false }) {
	return (
		<div className={`${styles.selectableMetric} ${feature ? styles.selectableFeature : ""}`}>
			<span className={styles.selectableGlyph}>{glyph}</span>
			<span className={styles.selectableMetricText}>
				<span className={styles.selectableMetricTop}>{topText}</span>
				{bottomText && <span className={styles.selectableMetricBottom}>{bottomText}</span>}
			</span>
		</div>
	);
}

function BottomText({ frame }) {
	if (frame.features?.length) {
		const maxFeatures = Math.max(1, Math.round(frame.leftPanelOverrides?.maxFeatures ?? 3));
		return frame.features.slice(0, maxFeatures).map((feature, index) => (
			<SelectableMetricRow
				key={`${feature.title}-${index}`}
				glyph={index + 1}
				topText={feature.title}
				bottomText={feature.subtitle}
				feature
			/>
		));
	}

	if (frame.metricsLayout === "verticalList") {
		return frame.metrics?.slice(0, 3).map((metric, index) => {
			const row = parseTraitMetricRow(metric);
			return (
				<SelectableMetricRow
					key={`${metric.label}-${index}`}
					glyph={row.glyph ?? ""}
					topText={row.topText}
					bottomText={row.bottomText}
				/>
			);
		});
	}

	return frame.metrics?.map((metric, index) => (
		<div key={`${metric.label}-${index}`} className={styles.selectableMetric}>
			<span>{metric.value}</span>
			<span>{metric.label}</span>
		</div>
	));
}

export default function CaseStudySelectableText({ frame, layerRef }) {
	const paragraphs = frame.descriptionParagraphs?.length
		? frame.descriptionParagraphs
		: frame.description
			? [frame.description]
			: [];

	return (
		<div ref={layerRef} className={styles.selectableText} aria-label={`Текст раздела: ${frame.title}`}>
			<div className={styles.selectableBadge}>
				{frame.sectionBadge ?? `${frame.chapterNum} / ${frame.pathTitle}`}
			</div>
			{frame.footerLabel && <div className={styles.selectableFooter}>{frame.footerLabel}</div>}
			{frame.categoryLabel && <div className={styles.selectableCategory}>{frame.categoryLabel}</div>}
			<div className={styles.selectableTitle}>{frame.title}</div>
			<div className={styles.selectableDescription}>
				{paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
			</div>
			{frame.tags?.length > 0 && <div className={styles.selectableTags}>{frame.tags.join("  ")}</div>}
			<div className={`${styles.selectableBottom} ${frame.anchorFooterBlock ? styles.selectableBottomAnchored : ""}`}>
				<BottomText frame={frame} />
			</div>
		</div>
	);
}
