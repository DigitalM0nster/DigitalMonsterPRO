import { getStateMetrics } from "../ui/ProjectStatePanel/getStateMetrics.js";
import { localizeCaseStudyState, localizeCaseStudyStates } from "./caseStudyLocalization.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";

/**
 * Собирает данные для canvas-HUD и мобильных карточек.
 *
 * @param {import('./types.js').PortfolioProjectModule} project
 * @param {import('./types.js').PortfolioState} activeState
 * @param {number} activeStateIndex
 * @param {string} activeStateId
 * @param {{ isInvestigating?: boolean, locale?: string }} [options]
 */
export function buildCaseStudyFrameData(project, activeState, activeStateIndex, activeStateId, options = {}) {
	const { config } = project;
	const caseStudy = config.caseStudy ?? {};
	const locale = normalizeSiteLocale(options.locale);
	const localizedState = localizeCaseStudyState(activeState, locale);
	const chapterBase = caseStudy.chapterBase ?? 0;
	const chapterNum = String(activeStateIndex + chapterBase).padStart(2, "0");
	const pathTitle = (localizedState.pathTitle ?? localizedState.title ?? "").toUpperCase();

	const sectionBadge = caseStudy.useSectionBadge ? `${chapterNum} / ${pathTitle}` : null;

	const description =
		localizedState.descriptionParagraphs?.length > 0
			? localizedState.descriptionParagraphs.join("\n\n")
			: localizedState.description;

	const metrics = getStateMetrics(localizedState, config)
		.filter((metric) => {
			const v = metric.value ?? "";
			return v.length <= 48 || /^\d{1,3}\s*%?$/.test(v.trim());
		})
		.slice(0, 3);

	// Pills дублируют traits/metrics — для nipigas и подобных кейсов не показываем.
	const tags = caseStudy.hideTags ? [] : [];

	return {
		categoryLabel: caseStudy.hideCategoryLabel ? "" : (config.meta?.type ?? config.summary ?? "Portfolio").toUpperCase(),
		sectionBadge,
		title: localizedState.title || config.title,
		description,
		descriptionParagraphs: localizedState.descriptionParagraphs ?? (description ? [description] : []),
		tags,
		metrics,
		features: localizedState.features ?? [],
		chapterNum,
		pathTitle,
		footerLabel: caseStudy.footerLabelCopy?.[locale] ?? caseStudy.footerLabel ?? "",
		statsValueFirst: Boolean(caseStudy.statsValueFirst),
		metricsLayout: caseStudy.metricsLayout ?? "rail",
		anchorFooterBlock: Boolean(caseStudy.anchorFooterBlock),
		leftPanelOverrides: caseStudy.leftPanel ?? {},
		contentTopPx: caseStudy.contentTopPx ?? null,
		states: localizeCaseStudyStates(project.states, locale),
		activeStateId,
		activeStateIndex,
		contentAlpha: options.isInvestigating ? 0.35 : 1,
	};
}

/**
 * @param {import('./types.js').PortfolioProjectModule} project
 * @param {number} stateIndex
 */
export function resolveStateChapterLabel(project, stateIndex, locale = "ru") {
	const caseStudy = project.config.caseStudy ?? {};
	const chapterBase = caseStudy.chapterBase ?? 0;
	const state = localizeCaseStudyState(project.states[stateIndex], locale);
	const chapterNum = String(stateIndex + chapterBase).padStart(2, "0");
	const pathTitle = (state?.pathTitle ?? state?.title ?? "").toUpperCase();
	return `${chapterNum} / ${pathTitle}`;
}
