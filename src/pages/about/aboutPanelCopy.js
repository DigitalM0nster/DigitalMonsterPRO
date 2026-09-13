/**
 * About left-panel HUD copy — stages text1 / text2 / text3 (RU authored; EN/ZH aligned).
 * Arc: who we are → how we work → what we create.
 * (Belief / epic close lives on the 3D epic plane — not this HUD.)
 *
 * Shape matches case left band: pathTitle, title, descriptionParagraphs, listItems.
 */
import { normalizeSiteLocale } from "@/functions/siteLocale.js";

/**
 * @typedef {{ title: string, subtitle?: string }} AboutPanelListItem
 *
 * @typedef {{
 *   pathTitle: string,
 *   title: string,
 *   descriptionParagraphs: string[],
 *   listItems: (string | AboutPanelListItem)[],
 * }} AboutPanelLocaleCopy
 */

/** @typedef {'text1' | 'text2' | 'text3'} AboutPanelBlockId */

/** @type {Record<AboutPanelBlockId, Record<'ru' | 'en' | 'zh', AboutPanelLocaleCopy>>} */
const ABOUT_PANEL_COPY = {
	text1: {
		ru: {
			pathTitle: "СТУДИЯ",
			title: "DIGITAL\nMONSTER",
			descriptionParagraphs: [
				"Нам мало, чтобы работало.",
				"Человеку должно нравиться этим пользоваться.",
			],
			listItems: [
				{
					title: "КОНЦЕПЦИЯ",
					subtitle: "Сильная идея становится основой каждого решения.",
				},
				{
					title: "ДИЗАЙН",
					subtitle: "Интерфейс, визуальный язык и движение работают как одно целое.",
				},
				{
					title: "ТЕХНОЛОГИИ",
					subtitle: "Сложные решения остаются быстрыми, понятными и надёжными.",
				},
			],
		},
		en: {
			pathTitle: "STUDIO",
			title: "DIGITAL\nMONSTER",
			descriptionParagraphs: [
				"Just working isn't enough for us.",
				"People should enjoy using it.",
			],
			listItems: [
				{
					title: "CONCEPT",
					subtitle: "A strong idea becomes the foundation of every solution.",
				},
				{
					title: "DESIGN",
					subtitle: "Interface, visual language, and motion work as one.",
				},
				{
					title: "TECHNOLOGY",
					subtitle: "Complex solutions stay fast, clear, and reliable.",
				},
			],
		},
		zh: {
			pathTitle: "工作室",
			title: "DIGITAL\nMONSTER",
			descriptionParagraphs: [
				"对我们来说，能用还不够。",
				"用起来还得让人喜欢。",
			],
			listItems: [
				{
					title: "概念",
					subtitle: "强有力的想法成为每个方案的基础。",
				},
				{
					title: "设计",
					subtitle: "界面、视觉语言与动效作为一个整体运作。",
				},
				{
					title: "技术",
					subtitle: "复杂方案依然保持快速、清晰与可靠。",
				},
			],
		},
	},
	text2: {
		ru: {
			pathTitle: "ПОДХОД",
			title: "ОТ СИЛЬНОЙ\nИДЕИ ДО ЦЕЛЬНОГО\nПРОДУКТА",
			descriptionParagraphs: [
				"Мы не начинаем проект с шаблона или набора эффектов. Сначала разбираемся в продукте, его аудитории и задаче — и только после этого создаём форму.",
				"Каждое дизайнерское и технологическое решение должно усиливать общую идею и впечатление от продукта.",
			],
			listItems: [
				{
					title: "ПОГРУЖЕНИЕ",
					subtitle: "Разбираемся в продукте, аудитории и бизнес-задаче.",
				},
				{
					title: "КОНЦЕПЦИЯ",
					subtitle: "Находим сильную идею и механику взаимодействия.",
				},
				{
					title: "ДИЗАЙН",
					subtitle: "Создаём визуальную систему, UX и движение.",
				},
				{
					title: "РАЗРАБОТКА",
					subtitle: "Реализуем, оптимизируем и доводим продукт до запуска.",
				},
			],
		},
		en: {
			pathTitle: "APPROACH",
			title: "FROM A STRONG\nIDEA TO A COHESIVE\nPRODUCT",
			descriptionParagraphs: [
				"We never start a project from a template or a set of effects. First we understand the product, its audience, and the brief — and only then shape the form.",
				"Every design and technology decision should strengthen the core idea and the impression the product leaves.",
			],
			listItems: [
				{
					title: "IMMERSION",
					subtitle: "We dig into the product, audience, and business goal.",
				},
				{
					title: "CONCEPT",
					subtitle: "We find a strong idea and interaction mechanic.",
				},
				{
					title: "DESIGN",
					subtitle: "We build the visual system, UX, and motion.",
				},
				{
					title: "DEVELOPMENT",
					subtitle: "We implement, optimize, and take the product to launch.",
				},
			],
		},
		zh: {
			pathTitle: "方法",
			title: "从强有力的想法\n到完整产品",
			descriptionParagraphs: [
				"我们从不从模板或一堆特效开始项目。先弄清产品、受众与任务，然后再塑造形式。",
				"每一个设计与技术决策都应强化核心理念，并加深产品给人留下的印象。",
			],
			listItems: [
				{
					title: "沉浸",
					subtitle: "深入了解产品、受众与业务目标。",
				},
				{
					title: "概念",
					subtitle: "找到强有力的想法与交互机制。",
				},
				{
					title: "设计",
					subtitle: "构建视觉系统、UX 与动效。",
				},
				{
					title: "开发",
					subtitle: "实现、优化，并将产品推进到上线。",
				},
			],
		},
	},
	text3: {
		ru: {
			pathTitle: "НАПРАВЛЕНИЯ",
			title: "ВЕБ-ПРОЕКТЫ\nЛЮБОГО\nМАСШТАБА",
			descriptionParagraphs: [
				"Мы вникаем в каждый проект до мелочей, чтобы понять ваш продукт, задачи бизнеса и то, что важно вашим клиентам.",
				"Всё это соединяем в продуманном сайте или сервисе, где люди легко находят нужное, понимают, что делать, и получают удовольствие от использования",
			],
			listItems: [
				{
					title: "ИНТЕРАКТИВНЫЕ САЙТЫ",
					subtitle: "Имиджевые, корпоративные и продуктовые сайты с уникальной механикой взаимодействия.",
				},
				{
					title: "ВЕБ-ПРИЛОЖЕНИЯ",
					subtitle: "Браузерные сервисы и интерфейсы для сложных пользовательских задач.",
				},
				{
					title: "DIGITAL-ПРЕЗЕНТАЦИИ",
					subtitle: "Интерактивные презентации продуктов, шоурумы и конфигураторы.",
				},
			],
		},
		en: {
			pathTitle: "DIRECTIONS",
			title: "WEB PROJECTS\nOF ANY\nSCALE",
			descriptionParagraphs: [
				"We get into every detail of each project to understand your product, your business goals, and what matters to your customers.",
				"We bring it all together in a thoughtfully designed website or service where people can easily find what they need, know what to do, and enjoy the experience.",
			],
			listItems: [
				{
					title: "INTERACTIVE WEBSITES",
					subtitle: "Brand, corporate, and product sites with unique interaction mechanics.",
				},
				{
					title: "WEB APPLICATIONS",
					subtitle: "Browser services and interfaces for complex user tasks.",
				},
				{
					title: "DIGITAL PRESENTATIONS",
					subtitle: "Interactive product presentations, showrooms, and configurators.",
				},
			],
		},
		zh: {
			pathTitle: "方向",
			title: "各种规模的\n网页项目",
			descriptionParagraphs: [
				"我们深入每个项目的细节，了解您的产品、业务目标，以及客户真正重视的事。",
				"我们将这些融入精心设计的网站或服务，让人们轻松找到所需、清楚下一步该做什么，并享受使用的过程。",
			],
			listItems: [
				{
					title: "互动网站",
					subtitle: "具有独特交互机制的品牌、企业与产品网站。",
				},
				{
					title: "网页应用",
					subtitle: "面向复杂用户任务的浏览器服务与界面。",
				},
				{
					title: "数字演示",
					subtitle: "互动产品演示、展厅与配置器。",
				},
			],
		},
	},
};

/**
 * @param {string | AboutPanelListItem} item
 * @returns {{ title: string, subtitle?: string }}
 */
export function normalizeAboutPanelListItem(item) {
	if (item && typeof item === "object") {
		return {
			title: String(item.title ?? ""),
			...(item.subtitle ? { subtitle: String(item.subtitle) } : {}),
		};
	}
	return { title: String(item ?? "") };
}

/**
 * @param {AboutPanelBlockId} blockId
 * @param {string} [locale]
 * @returns {AboutPanelLocaleCopy}
 */
export function getAboutPanelCopy(blockId, locale) {
	const siteLocale = normalizeSiteLocale(locale);
	const block = ABOUT_PANEL_COPY[blockId] ?? ABOUT_PANEL_COPY.text1;
	return block[siteLocale] ?? block.ru;
}

export const ABOUT_PANEL_BLOCK_IDS = /** @type {const} */ (["text1", "text2", "text3"]);
