/**
 * Сокращённые тексты для мобильных карточек MMK-1.
 * @type {Record<string, { shortDescription: string, shortFeatures?: { title: string, subtitle?: string }[], detailsTitle?: string }>}
 */
const mobileContentByState = {
	state_01: {
		shortDescription:
			"ММК-1 — аренда башенных кранов в Москве и МО. Сайт, который запоминается и мотивирует оформить заказ.",
		shortFeatures: [
			{ title: "ММК-1", subtitle: "клиент" },
			{ title: "DigitalMonster", subtitle: "разработка" },
			{ title: "2023", subtitle: "год" },
		],
	},
	state_02: {
		shortDescription:
			"Логотип крюка и цифры 1, шрифт Manifold и cyan HUD — технологичный образ классического бизнеса.",
		shortFeatures: [
			{ title: "Логотип MMK-1", subtitle: "крюк + цифра 1" },
			{ title: "Manifold", subtitle: "шрифт" },
			{ title: "#FF5000", subtitle: "акцент" },
		],
	},
	state_03: {
		shortDescription:
			"3D-кран с первой секции: погружение, реакция на курсор и технические callout'ы на модели.",
		shortFeatures: [
			{ title: "3D с первой секции", subtitle: "wow-эффект" },
			{ title: "Реакция на курсор", subtitle: "интерактив" },
			{ title: "Callout'ы", subtitle: "характеристики крана" },
		],
	},
	state_04: {
		shortDescription:
			"Фильтр по параметрам, карточки объектов и интеграция услуг — выбор техники стал проще.",
		shortFeatures: [
			{ title: "Фильтр", subtitle: "быстрый подбор" },
			{ title: "Карточки", subtitle: "полная информация" },
			{ title: "Услуги", subtitle: "в одном месте" },
		],
	},
	state_05: {
		shortDescription:
			"Современный сайт с 3D-визуализацией и интерактивным подбором техники для MMK-1.",
		shortFeatures: [
			{ title: "3D-визуализация", subtitle: "с первой секции" },
			{ title: "Фильтр кранов", subtitle: "по параметрам" },
			{ title: "Адаптивность", subtitle: "все устройства" },
		],
		detailsTitle: "Инженерия проекта",
	},
};

export default mobileContentByState;
