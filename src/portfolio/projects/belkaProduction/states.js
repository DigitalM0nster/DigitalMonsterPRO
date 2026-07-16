/** @type {import('@/portfolio/core/types.js').PortfolioState[]} */
const states = [
	{
		id: "state_01",
		pathTitle: "О ПРОЕКТЕ",
		title: "ПРОДАКШН, СОБРАННЫЙ\nВ ОДНОМ ПРОСТРАНСТВЕ",
		descriptionParagraphs: [
			"Для Belka Production мы реализовали корпоративный сайт, который одновременно представляет студию полного цикла и работает как портфолио её проектов.",
			"DigitalMonster отвечал за вёрстку и фронтенд. За два месяца дизайн был собран в работающий React-интерфейс с акцентом на медиаконтент и удобный просмотр работ.",
		],
		traits: [
			{ label: "год", value: "2023" },
			{ label: "срок", value: "2 месяца" },
			{ label: "роль", value: "вёрстка и фронтенд" },
		],
		scrollAnchor: 0,
		scene: {
			model: { productionRig: { phase: "overview", idle: true } },
		},
	},
	{
		id: "state_02",
		pathTitle: "ВИЗУАЛЬНЫЙ ЯЗЫК",
		title: "КОНТЕНТ ВЫХОДИТ\nНА ПЕРВЫЙ ПЛАН",
		descriptionParagraphs: [
			"В корпоративном портфолио изображение и движение должны работать сильнее декоративной оболочки. Интерфейс выстраивает спокойную рамку вокруг проектов студии.",
			"Контрастная типографика, крупные медиаформаты и ясная сетка позволяют быстро переключаться между презентацией услуг и просмотром работ.",
		],
		features: [
			{ title: "Крупный медиаконтент", subtitle: "основа портфолио" },
			{ title: "Контрастная сетка", subtitle: "ясная иерархия" },
			{ title: "Акцентное движение", subtitle: "характер продакшн-студии" },
		],
		scrollAnchor: 0.25,
		scene: {
			model: { productionRig: { phase: "visualFrames", frameSpread: 0.3 } },
		},
	},
	{
		id: "state_03",
		pathTitle: "ИНТЕРАКТИВНЫЙ ОПЫТ",
		title: "ПОРТФОЛИО КАК\nМОНТАЖНАЯ ЛИНИЯ",
		descriptionParagraphs: [
			"Переходы между работами можно воспринимать как монтаж: пользователь меняет планы, масштаб и контекст, оставаясь внутри единой визуальной системы.",
			"Динамика строится на интерфейсных переходах и не требует обязательного autoplay-видео, поэтому портфолио остаётся быстрым и управляемым.",
		],
		features: [
			{ title: "Навигация по работам", subtitle: "быстрый обзор" },
			{ title: "Смена планов", subtitle: "ритм портфолио" },
			{ title: "Медиа по запросу", subtitle: "без обязательного autoplay" },
		],
		scrollAnchor: 0.5,
		scene: {
			model: { productionRig: { phase: "interactiveEdit", pointerTilt: true } },
		},
	},
	{
		id: "state_04",
		pathTitle: "ПЛАТФОРМА СТУДИИ",
		title: "УСЛУГИ И РАБОТЫ\nВ ОДНОЙ СИСТЕМЕ",
		descriptionParagraphs: [
			"Сайт соединяет корпоративную презентацию Belka Production с каталогом выполненных проектов. Он объясняет возможности студии и сразу подкрепляет их визуальными примерами.",
			"Структура помогает перейти от знакомства со студией к просмотру работ и обсуждению новой задачи.",
		],
		features: [
			{ title: "Услуги", subtitle: "продакшн полного цикла" },
			{ title: "Проекты", subtitle: "портфолио студии" },
			{ title: "Контакт", subtitle: "переход к обсуждению задачи" },
		],
		scrollAnchor: 0.75,
		scene: {
			model: { productionRig: { phase: "pipeline", stagesVisible: true } },
		},
	},
	{
		id: "state_05",
		pathTitle: "ИНЖЕНЕРИЯ ПРОЕКТА",
		title: "ФРОНТЕНД ДЛЯ\nЖИВОГО ПОРТФОЛИО",
		descriptionParagraphs: [
			"Сайт реализован на React и SCSS. Компонентная структура позволила собрать корпоративные разделы и портфолио в едином интерфейсе.",
			"Результат работы — завершённый сайт, который представляет услуги и проекты Belka Production.",
		],
		features: [
			{ title: "React", subtitle: "компонентный интерфейс" },
			{ title: "SCSS", subtitle: "адаптивная визуальная система" },
			{ title: "Frontend", subtitle: "интерактивные состояния" },
		],
		scrollAnchor: 1,
		scene: {
			model: { productionRig: { phase: "engineeringWireframe", wireframe: true } },
		},
	},
];

export default states;
