import { useEffect, useRef } from "react";
import styles from "./ProjectStatePanel.module.scss";
import OptionalMedia from "./OptionalMedia.jsx";
import MetricRing from "./MetricRing.jsx";
import { usePortfolioProject } from "@/portfolio/core/PortfolioProjectContext.jsx";
import { getStateMetrics } from "./getStateMetrics.js";
import { getStateTags } from "./getStateTags.js";

/**
 * @param {{ compact?: boolean, metricsOnly?: boolean }} props
 */
export default function ProjectStatePanel({ compact = false, metricsOnly = false }) {
	const { project, activeState, activeStateIndex, scrollProgress, isInvestigating } = usePortfolioProject();
	const { config } = project;
	const optionalVideo = config.optionalVideo;
	const showOptionalVideo =
		optionalVideo &&
		optionalVideo.attachToState === activeState.id &&
		!isInvestigating;

	const chapterNum = String(activeStateIndex).padStart(2, "0");
	const categoryLabel = (config.meta?.type ?? config.summary ?? "Portfolio").toUpperCase();
	const metrics = getStateMetrics(activeState, config);
	const tags = getStateTags(activeState, config);
	const subStages = activeState.subStages ?? [];
	const sysRef = useRef(null);
	const sysValue = (72 + scrollProgress * 18).toFixed(1);

	useEffect(() => {
		sysRef.current?.style.setProperty("--sysLevel", `${Math.round(scrollProgress * 100)}%`);
	}, [scrollProgress]);

	return (
		<section
			className={[
				styles.projectStatePanel,
				compact && styles.compact,
				metricsOnly && styles.metricsOnly,
				isInvestigating && styles.inactive,
			]
				.filter(Boolean)
				.join(" ")}
			aria-live="polite"
		>
			<div className={styles.stateBadge}>
				<span className={styles.badgeDot} aria-hidden="true" />
				<span className={styles.badgeLabel}>STATE {chapterNum}</span>
			</div>

			<div key={activeState.id} className={styles.content}>
				{!metricsOnly && (
					<>
						<p className={styles.categoryLabel}>{categoryLabel}</p>
						<h1 className={styles.projectTitle}>{activeState.title || config.title}</h1>
						{activeState.description && <p className={styles.description}>{activeState.description}</p>}

						{tags.length > 0 && (
							<ul className={styles.tagRow} aria-label="Ключевые темы">
								{tags.map((tag) => (
									<li key={tag} className={styles.tagPill}>
										{tag}
									</li>
								))}
							</ul>
						)}

						{subStages.length > 0 && (
							<div className={styles.subStages}>
								<span className={styles.sectionLabel}>Подэтапы</span>
								<ul className={styles.subStageList}>
									{subStages.map((stage, index) => (
										<li key={stage.id} className={styles.subStageItem}>
											<span className={styles.subStageIndex}>{String(index + 1).padStart(2, "0")}</span>
											<span className={styles.subStageTitle}>{stage.title ?? stage.id}</span>
										</li>
									))}
								</ul>
							</div>
						)}
					</>
				)}

				{(metrics.length > 0 || scrollProgress > 0) && (
					<div className={styles.analysisBlock}>
						<div className={styles.sysRow} ref={sysRef}>
							<span className={styles.sysLabel}>SYS · {sysValue}</span>
							<div className={styles.sysTrack}>
								<div className={styles.sysFill} />
							</div>
						</div>

						{metrics.length > 0 && (
							<div className={styles.metrics}>
								{metrics.map((metric) => (
									<MetricRing key={metric.label} label={metric.label} value={metric.value} />
								))}
							</div>
						)}
					</div>
				)}

				{!metricsOnly && activeState.media && (
					<div className={styles.media}>
						<OptionalMedia media={activeState.media} />
					</div>
				)}

				{!metricsOnly && showOptionalVideo && (
					<div className={styles.media}>
						<OptionalMedia
							media={{
								type: "video",
								src: optionalVideo.src,
								poster: optionalVideo.poster,
								load: "onDemand",
								playLabel: optionalVideo.label,
							}}
						/>
					</div>
				)}
			</div>

			{!metricsOnly && (
				<div className={styles.studioFooter}>
					<span className={styles.studioMark}>LAVA·WEB</span>
					<div className={styles.studioMeter} aria-hidden="true">
						{Array.from({ length: 12 }).map((_, i) => (
							<span key={i} className={styles.studioTick} />
						))}
					</div>
				</div>
			)}
		</section>
	);
}
