/**
 * @type {Record<string, { shortDescription: string, shortFeatures?: { title: string, subtitle?: string }[], detailsTitle?: string }>}
 */
const mobileContentByState = {
	state_01: {
		shortDescription:
			"Разработали на субподряде интерактивный раздел аренды офисов Останкино.",
		shortFeatures: [
			{ title: "2025", subtitle: "год" },
			{ title: "2 месяца", subtitle: "срок" },
			{ title: "Frontend + WP", subtitle: "роль" },
		],
	},
	state_02: {
		shortDescription:
			"Соединили тёмно-синюю сцену, светлую модель здания и технические планы.",
		shortFeatures: [
			{ title: "Dark navy", subtitle: "фон" },
			{ title: "Модель здания", subtitle: "навигация" },
			{ title: "Планы", subtitle: "данные" },
		],
	},
	state_03: {
		shortDescription:
			"Реализовали путь от общего вида корпуса к этажу и конкретному помещению.",
		shortFeatures: [
			{ title: "13 этажей", subtitle: "выбор" },
			{ title: "Псевдо-3D", subtitle: "корпус" },
			{ title: "План блока", subtitle: "детали" },
		],
	},
	state_04: {
		shortDescription:
			"Добавили поиск по площади и этажу, карточки и подробные схемы блоков.",
		shortFeatures: [
			{ title: "Площадь", subtitle: "фильтр" },
			{ title: "Этаж", subtitle: "фильтр" },
			{ title: "Карточки", subtitle: "помещения" },
		],
	},
	state_05: {
		shortDescription:
			"Связали фронтенд с WordPress-админкой для управления каталогом.",
		shortFeatures: [
			{ title: "WordPress", subtitle: "контент" },
			{ title: "Frontend", subtitle: "состояния" },
			{ title: "Каталог", subtitle: "данные" },
		],
		detailsTitle: "Инженерия проекта",
	},
};

export default mobileContentByState;
