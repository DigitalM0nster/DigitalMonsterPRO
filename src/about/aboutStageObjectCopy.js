/**
 * Large display copy for About stages 3–4 — reserved for 3D objects.
 * Left HUD: text1→text2 on 0→1, text2→text3 on 1→2, text3→empty on 2→3
 * (see aboutPanelHudStory.js). Stages 3–4 short titles stay for 3D objects.
 */
import { normalizeSiteLocale } from "@/utils/siteLocale.js";

/**
 * @typedef {{
 *   stageIndex: 3 | 4,
 *   stateId: 'engineering' | 'layers',
 *   titleLines: string[],
 * }} AboutStageObjectLocaleCopy
 */

/** Shared line under / with the large 3D titles (stages 3–4). */
const ABOUT_STAGE_OBJECT_TAGLINE = {
	ru: "Создайте впечатление, которое останется за пределами экрана.",
	en: "Create an impression that lasts beyond the screen.",
	zh: "创造一种超越屏幕、久久留存的印象。",
};

/** @type {Record<'stage3' | 'stage4', Record<'ru' | 'en' | 'zh', AboutStageObjectLocaleCopy>>} */
const ABOUT_STAGE_OBJECT_COPY = {
	stage3: {
		ru: {
			stageIndex: 3,
			stateId: "engineering",
			titleLines: ["ОЩУЩЕНИЕ", "РЕШАЕТ", "ВСЁ"],
		},
		en: {
			stageIndex: 3,
			stateId: "engineering",
			titleLines: ["FEELING", "DEFINES", "EVERYTHING"],
		},
		zh: {
			stageIndex: 3,
			stateId: "engineering",
			titleLines: ["感受", "决定", "一切"],
		},
	},
	stage4: {
		ru: {
			stageIndex: 4,
			stateId: "layers",
			titleLines: ["БУДУЩЕЕ", "МОЖНО", "СОЗДАТЬ"],
		},
		en: {
			stageIndex: 4,
			stateId: "layers",
			titleLines: ["THE FUTURE", "CAN BE", "CREATED"],
		},
		zh: {
			stageIndex: 4,
			stateId: "layers",
			titleLines: ["未来", "可以", "被创造"],
		},
	},
};

/**
 * @param {string} [locale]
 * @returns {string}
 */
export function getAboutStageObjectTagline(locale) {
	const siteLocale = normalizeSiteLocale(locale);
	return ABOUT_STAGE_OBJECT_TAGLINE[siteLocale] ?? ABOUT_STAGE_OBJECT_TAGLINE.ru;
}

/**
 * @param {3 | 4 | 'stage3' | 'stage4' | 'engineering' | 'layers'} stage
 * @param {string} [locale]
 * @returns {AboutStageObjectLocaleCopy & { title: string, tagline: string }}
 */
export function getAboutStageObjectCopy(stage, locale) {
	const siteLocale = normalizeSiteLocale(locale);
	const key =
		stage === 3 || stage === "stage3" || stage === "engineering"
			? "stage3"
			: "stage4";
	const block = ABOUT_STAGE_OBJECT_COPY[key][siteLocale] ?? ABOUT_STAGE_OBJECT_COPY[key].ru;
	return {
		...block,
		title: block.titleLines.join("\n"),
		tagline: getAboutStageObjectTagline(siteLocale),
	};
}

export const ABOUT_STAGE_OBJECT_IDS = /** @type {const} */ (["stage3", "stage4"]);
