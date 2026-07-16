/**
 * @type {Record<string, { shortDescription: string, shortFeatures?: { title: string, subtitle?: string }[], detailsTitle?: string }>}
 */
const mobileContentByState = {
	state_01: {
		shortDescription:
			"Реализовали корпоративный сайт и портфолио Belka Production на React.",
		shortFeatures: [
			{ title: "2023", subtitle: "год" },
			{ title: "2 месяца", subtitle: "срок" },
			{ title: "Frontend", subtitle: "роль" },
		],
	},
	state_02: {
		shortDescription:
			"Поставили работы студии в центр интерфейса с помощью крупного медиаконтента и ясной сетки.",
		shortFeatures: [
			{ title: "Медиа", subtitle: "главный контент" },
			{ title: "Сетка", subtitle: "структура" },
			{ title: "Motion", subtitle: "акцент" },
		],
	},
	state_03: {
		shortDescription:
			"Построили просмотр портфолио как последовательность планов и переходов без обязательного autoplay-видео.",
		shortFeatures: [
			{ title: "Проекты", subtitle: "быстрый обзор" },
			{ title: "Переходы", subtitle: "монтажный ритм" },
			{ title: "On demand", subtitle: "медиа по запросу" },
		],
	},
	state_04: {
		shortDescription:
			"Объединили презентацию полного цикла услуг и выполненные проекты студии.",
		shortFeatures: [
			{ title: "Услуги", subtitle: "полный цикл" },
			{ title: "Портфолио", subtitle: "работы" },
			{ title: "Контакты", subtitle: "новая задача" },
		],
	},
	state_05: {
		shortDescription:
			"Выполнили вёрстку и фронтенд на React и SCSS за два месяца.",
		shortFeatures: [
			{ title: "React", subtitle: "интерфейс" },
			{ title: "SCSS", subtitle: "стили" },
			{ title: "2 месяца", subtitle: "реализация" },
		],
		detailsTitle: "Инженерия проекта",
	},
};

export default mobileContentByState;
