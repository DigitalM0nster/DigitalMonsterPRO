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
				"Мы создаём сайты, веб-приложения и интерактивные проекты. Нам важно всё: первое впечатление, понятные действия, удобство в мелочах. Доводим до ощущения: «Будто сделали специально для меня».",
				"Здесь человек чувствует, что его поняли: всё удобно, понятно, отвечает тому, что ему нужно.",
			],
			listItems: [
				{
					title: "«Нам мало, чтобы работало.",
					subtitle: "Человеку должно нравиться этим пользоваться»",
				},
			],
		},
		en: {
			pathTitle: "STUDIO",
			title: "DIGITAL\nMONSTER",
			descriptionParagraphs: [
				"We create websites, web applications, and interactive projects. Every detail matters to us: the first impression, clear actions, and everyday ease of use. We refine it until it feels “made just for me.”",
				"People feel understood here: everything is easy to use, clear, and meets their needs.",
			],
			listItems: [
				{
					title: "“Just working isn't enough for us.",
					subtitle: "People should enjoy using it.”",
				},
			],
		},
		zh: {
			pathTitle: "工作室",
			title: "DIGITAL\nMONSTER",
			descriptionParagraphs: [
				"我们打造网站、网页应用和互动项目。我们在意每个细节：第一印象、清晰的操作，以及日常使用的便利。不断打磨，直到让人觉得：“仿佛是专门为我做的。”",
				"在这里，人们感到自己被理解：一切都方便、清楚，也符合自己的需要。",
			],
			listItems: [
				{
					title: "“对我们来说，能用还不够。",
					subtitle: "用起来还得让人喜欢。”",
				},
			],
		},
	},
	text2: {
		ru: {
			pathTitle: "ПОДХОД",
			title: "ЖИВЁМ\nВАШИМ\nПРОЕКТОМ",
			descriptionParagraphs: [
				"Разбираемся в вашем продукте, его особенностях и задачах бизнеса. Продумываем, как человек будет с ним знакомиться и пользоваться: что ему важно увидеть, понять и сделать.",
				"Каждое решение в дизайне и разработке помогает раскрыть продукт и усиливает впечатление от него.",
			],
			listItems: [
				{
					title: "ПОГРУЖЕНИЕ",
					subtitle: "Вникаем в продукт и задачи вашего бизнеса.",
				},
				{
					title: "УДОБСТВО",
					subtitle: "Продумываем, что человеку важно увидеть, понять и сделать.",
				},
			],
		},
		en: {
			pathTitle: "APPROACH",
			title: "WE LIVE\nAND BREATHE\nYOUR PROJECT",
			descriptionParagraphs: [
				"We get to know your product, its distinctive features, and your business goals. We plan how people will discover and use it: what they need to see, understand, and do.",
				"Every design and development decision helps reveal the product and strengthens the impression it makes.",
			],
			listItems: [
				{
					title: "IMMERSION",
					subtitle: "We get to know your product and business goals.",
				},
				{
					title: "EASE OF USE",
					subtitle: "We plan what people need to see, understand, and do.",
				},
			],
		},
		zh: {
			pathTitle: "方法",
			title: "全心投入\n您的项目",
			descriptionParagraphs: [
				"我们深入了解您的产品、特点和业务目标。规划人们如何认识和使用产品：他们需要看到什么、理解什么、完成什么。",
				"每一个设计与开发决策，都帮助展现产品，并加深它给人留下的印象。",
			],
			listItems: [
				{
					title: "沉浸",
					subtitle: "深入了解您的产品和业务目标。",
				},
				{
					title: "易用性",
					subtitle: "规划人们需要看到、理解和完成的事。",
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
					title: "ИНТЕРАКТИВНЫЕ ПРОЕКТЫ",
					subtitle: "Помогаем показать продукт в действии, познакомиться с его возможностями и освоить работу с ним",
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
					title: "INTERACTIVE PROJECTS",
					subtitle: "We help people see your product in action, explore its features, and learn how to use it.",
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
					title: "互动项目",
					subtitle: "让人们看到产品的实际运作，了解其功能，并掌握使用方法。",
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
