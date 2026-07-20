/**
 * About left-panel HUD copy — stages text1 / text2 / text3 (RU authored; EN/ZH aligned).
 * Shape matches case left band: pathTitle, title, descriptionParagraphs, listItems.
 */
import { normalizeSiteLocale } from "@/utils/siteLocale.js";

/**
 * @typedef {{
 *   pathTitle: string,
 *   title: string,
 *   descriptionParagraphs: string[],
 *   listItems: string[],
 * }} AboutPanelLocaleCopy
 */

/** @typedef {'text1' | 'text2' | 'text3'} AboutPanelBlockId */

/** @type {Record<AboutPanelBlockId, Record<'ru' | 'en' | 'zh', AboutPanelLocaleCopy>>} */
const ABOUT_PANEL_COPY = {
	text1: {
		ru: {
			pathTitle: "НАПРАВЛЕНИЯ",
			title: "DIGITAL-ПРОЕКТЫ\nС ЭФФЕКТОМ ПОГРУЖЕНИЯ",
			descriptionParagraphs: [
				"Digital Monster — независимая digital-студия сложных интерактивных проектов.",
				"Мы создаём премиальные сайты, 3D-визуализации, AR-, VR- и нестандартные digital-решения, в которых визуальная идея, интерактив и технология работают как единая система.",
				"К нам можно прийти с готовой концепцией, набором идей или задачей, которую пока сложно сформулировать. Мы помогаем найти сильную форму, собрать логику взаимодействия и довести проект до запуска.",
			],
			listItems: [
				"Интерактивные сайты",
				"Продуктовая визуализация",
				"AR / VR",
				"Нестандартные digital-проекты",
			],
		},
		en: {
			pathTitle: "STUDIO",
			title: "DIGITAL PROJECTS\nWITH IMMERSIVE IMPACT",
			descriptionParagraphs: [
				"Digital Monster is an independent digital studio focused on complex interactive projects.",
				"We create premium websites, 3D visualizations, AR, VR, and custom digital solutions where visual concept, interaction, and engineering work as one system.",
				"You can come to us with a clear concept, a set of early ideas, or a challenge that is still hard to define. We help find the right form, build the interaction logic, and bring the project to launch.",
			],
			listItems: [
				"Interactive websites",
				"Product visualization",
				"AR / VR",
				"Custom digital projects",
			],
		},
		zh: {
			pathTitle: "工作室",
			title: "沉浸式\n数字项目",
			descriptionParagraphs: [
				"Digital Monster 是一家独立数字工作室，专注于复杂的交互式项目。",
				"我们打造高端网站、3D 可视化、AR、VR 以及定制化数字解决方案，让视觉概念、交互逻辑与技术实现作为一个系统协同运作。",
				"无论您已有清晰的概念、初步的想法，还是一个尚未完全成形的任务，我们都能帮助找到有力的表达形式，构建交互逻辑，并将项目推进到上线。",
			],
			listItems: [
				"交互式网站",
				"产品可视化",
				"AR / VR",
				"定制化数字项目",
			],
		},
	},
	text2: {
		ru: {
			pathTitle: "АКЦЕНТЫ",
			title: "ПРОЕКТЫ, КОТОРЫМ НУЖЕН\nДРУГОЙ УРОВЕНЬ РЕАЛИЗАЦИИ",
			descriptionParagraphs: [
				"Мы берёмся за проекты, которым тесно в рамках стандартной веб-разработки.",
				"Для нас сайт — это не набор экранов, а цифровое пространство: с собственной атмосферой, логикой движения, интерактивом и технической основой, которая выдерживает сложную визуальную подачу.",
				"Мы соединяем дизайн, разработку и внимание к деталям, чтобы сложный проект оставался понятным, быстрым и удобным для дальнейшей работы.",
			],
			listItems: [
				"Индивидуальная концепция",
				"Сильный визуальный образ",
				"Сложная техническая реализация",
				"Высокая производительность",
				"Внимание к деталям",
			],
		},
		en: {
			pathTitle: "APPROACH",
			title: "PROJECTS THAT NEED\nA HIGHER LEVEL\nOF EXECUTION",
			descriptionParagraphs: [
				"We take on projects that go beyond standard web development.",
				"For us, a website is not a set of screens, but a digital space — with its own atmosphere, motion logic, interactivity, and a technical foundation strong enough to support a complex visual experience.",
				"We connect design, development, and attention to detail so that a complex project remains clear, fast, and easy to work with after launch.",
			],
			listItems: [
				"Tailored concept",
				"Strong visual direction",
				"Complex technical execution",
				"High performance",
				"Attention to detail",
			],
		},
		zh: {
			pathTitle: "方法",
			title: "需要更高水准\n实现的项目",
			descriptionParagraphs: [
				"我们承接那些超出标准网页开发框架的项目。",
				"对我们来说，网站不是一组页面，而是一个数字空间：拥有自己的氛围、动效逻辑、互动方式，以及能够支撑复杂视觉呈现的技术基础。",
				"我们将设计、开发与对细节的把控结合起来，让复杂项目依然清晰、快速，并便于后续维护与发展。",
			],
			listItems: [
				"定制概念",
				"强有力的视觉表达",
				"复杂技术实现",
				"高性能表现",
				"细节把控",
			],
		},
	},
	text3: {
		ru: {
			pathTitle: "ВОЗМОЖНОСТИ",
			title: "НОВЫЙ УРОВЕНЬ ПОДАЧИ",
			descriptionParagraphs: [
				"Сайт может быть не просто местом, где размещена информация. Он может стать цифровым пространством, в котором пользователь исследует продукт, компанию, сервис или событие через визуальную подачу, 3D и интерактив.",
				"Такой формат помогает раскрыть больше: показать масштаб, передать атмосферу, расставить акценты и сделать взаимодействие запоминающимся.",
				"Контент перестаёт быть просто текстом и изображениями — он становится частью опыта, который хочется изучать.",
			],
			listItems: [
				"Визуальная подача",
				"3D и интерактив",
				"Эффект присутствия",
				"Вовлечение пользователя",
				"Контент, который хочется исследовать",
			],
		},
		en: {
			pathTitle: "CAPABILITIES",
			title: "A NEW LEVEL\nOF PRESENTATION",
			descriptionParagraphs: [
				"A website can be more than a place where information is stored. It can become a digital space where the user explores a product, company, service, or event through visual storytelling, 3D, and interaction.",
				"This format helps reveal more: show scale, convey atmosphere, place accents, and make the interaction memorable.",
				"Content stops being just text and images — it becomes part of an experience people want to explore.",
			],
			listItems: [
				"Visual presentation",
				"3D and interaction",
				"Sense of presence",
				"User engagement",
				"Content worth exploring",
			],
		},
		zh: {
			pathTitle: "可能",
			title: "全新呈现水准",
			descriptionParagraphs: [
				"网站不仅可以是信息存放之处。它可以成为数字空间，让用户通过视觉呈现、3D 与互动去探索产品、公司、服务或事件。",
				"这种形式能展现更多：呈现规模、传递氛围、突出重点，并让互动令人难忘。",
				"内容不再只是文字与图片——它成为人们愿意深入探索的体验本身。",
			],
			listItems: [
				"视觉呈现",
				"3D 与互动",
				"临场感",
				"用户参与",
				"值得探索的内容",
			],
		},
	},
};

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
