/**
 * @type {Record<string, { shortDescription: string, shortFeatures?: { title: string, subtitle?: string }[], detailsTitle?: string }>}
 */
const mobileContentByState = {
	state_01: {
		shortDescription:
			"Создали сайт-портфолио HUBARCH, который показывает экспертизу студии и помогает вести контент.",
		shortFeatures: [
			{ title: "2025", subtitle: "год" },
			{ title: "3 месяца", subtitle: "срок" },
			{ title: "Frontend + Backend", subtitle: "роль" },
		],
	},
	state_02: {
		shortDescription:
			"Поставили архитектурную фотографию в центр с помощью редакционной сетки и сдержанной типографики.",
		shortFeatures: [
			{ title: "Фотография", subtitle: "главный материал" },
			{ title: "Сетка", subtitle: "редакционная" },
			{ title: "Типографика", subtitle: "нейтральная" },
		],
	},
	state_03: {
		shortDescription:
			"Выстроили путь от каталога к подробной истории каждого объекта на русском и английском.",
		shortFeatures: [
			{ title: "Каталог", subtitle: "проекты" },
			{ title: "Case page", subtitle: "детали" },
			{ title: "RU / EN", subtitle: "локализация" },
		],
	},
	state_04: {
		shortDescription:
			"Объединили проекты, услуги, FAQ, публикации и формы связи.",
		shortFeatures: [
			{ title: "Проекты", subtitle: "портфолио" },
			{ title: "Услуги + FAQ", subtitle: "экспертиза" },
			{ title: "Медиа", subtitle: "публикации" },
		],
	},
	state_05: {
		shortDescription:
			"Реализовали React-фронтенд и управление контентом через WordPress за три месяца.",
		shortFeatures: [
			{ title: "React", subtitle: "frontend" },
			{ title: "WordPress", subtitle: "admin" },
			{ title: "3 месяца", subtitle: "реализация" },
		],
		detailsTitle: "Инженерия проекта",
	},
};

export default mobileContentByState;
