/** @type {import('@/portfolio/core/types.js').PortfolioState[]} */
const states = [
	{
		id: "state_01",
		pathTitle: "О ПРОЕКТЕ",
		title: "АГЕНТСТВО ПОЛНОГО\nЦИКЛА И МЕДВЕДЯ",
		descriptionParagraphs: [
			"RE:EVOLUTION называет себя агентством полного цикла и медведя. Команда соединяет creative, digital, SMM, дизайн, продакшн и продвижение в одном ярком образе.",
			"Для агентства был свёрстан компактный промо-лендинг: за две недели мы собрали страницу, которая коротко объясняет характер команды и ведёт к её кейсам и видеоканалу.",
		],
		traits: [
			{ label: "период", value: "2019–2020" },
			{ label: "срок", value: "2 недели" },
			{ label: "роль", value: "вёрстка" },
		],
		scrollAnchor: 0,
		scene: {
			model: { brandMark: { phase: "overview", idle: true } },
		},
	},
	{
		id: "state_02",
		pathTitle: "ВИЗУАЛЬНЫЙ ЯЗЫК",
		title: "РОЗОВЫЙ СИГНАЛ\nПРОТИВ ЧЁРНОГО ФОНА",
		descriptionParagraphs: [
			"Визуальная система строится на насыщенном розовом акценте, тёмном фоне, крупной графике и намеренно дерзком тоне коммуникации.",
			"Медведь и разрозненные графические элементы превращают обычную презентацию услуг в узнаваемый цифровой образ агентства.",
		],
		features: [
			{ title: "Розовый акцент", subtitle: "фирменный сигнал" },
			{ title: "Медведь", subtitle: "персонаж бренда" },
			{ title: "Крупная графика", subtitle: "выразительный промо-ритм" },
		],
		scrollAnchor: 0.25,
		scene: {
			model: { brandMark: { phase: "visualReveal", layerSpread: 0.3 } },
		},
	},
	{
		id: "state_03",
		pathTitle: "ИНТЕРАКТИВНЫЙ ОПЫТ",
		title: "СТРАНИЦА, КОТОРАЯ\nНЕ СТОИТ НА МЕСТЕ",
		descriptionParagraphs: [
			"Медведь двигается, элементы меняют положение, а hover-состояния постоянно поддерживают ощущение живого промо-пространства.",
			"Анимация здесь не объясняет сложную структуру — она передаёт темперамент агентства и удерживает внимание на коротком лендинге.",
		],
		features: [
			{ title: "Character motion", subtitle: "движение медведя" },
			{ title: "Hover reactions", subtitle: "ответ элементов" },
			{ title: "Promo rhythm", subtitle: "постоянная визуальная энергия" },
		],
		scrollAnchor: 0.5,
		scene: {
			model: { brandMark: { phase: "interactive", pointerTilt: true } },
		},
	},
	{
		id: "state_04",
		pathTitle: "КОНТЕНТ И КЕЙСЫ",
		title: "ОТ ОДНОЙ ФРАЗЫ\nК ПОРТФОЛИО",
		descriptionParagraphs: [
			"Лендинг быстро формулирует, чем занимается RE:EVOLUTION: создаёт идеи и контент, снимает, продюсирует, продвигает и геймифицирует.",
			"Видео с кейсами и переход на YouTube продолжают знакомство с агентством за пределами короткой страницы.",
		],
		features: [
			{ title: "Позиционирование", subtitle: "агентство полного цикла" },
			{ title: "Видео кейсов", subtitle: "концентрированный showreel" },
			{ title: "Внешний канал", subtitle: "полный архив работ" },
		],
		scrollAnchor: 0.75,
		scene: {
			model: { brandMark: { phase: "contentPipeline", stagesVisible: true } },
		},
	},
	{
		id: "state_05",
		pathTitle: "ИНЖЕНЕРИЯ ПРОЕКТА",
		title: "ДВЕ НЕДЕЛИ\nНА ЖИВОЙ ЛЕНДИНГ",
		descriptionParagraphs: [
			"DigitalMonster отвечал за вёрстку на HTML и SCSS. В компактный срок были собраны адаптивная страница, hover-состояния и анимированная подача бренда.",
			"Техническая ценность проекта — в точной реализации выразительного дизайна без усложнения структуры продукта.",
		],
		features: [
			{ title: "HTML", subtitle: "структура лендинга" },
			{ title: "SCSS", subtitle: "визуальная система" },
			{ title: "Motion states", subtitle: "hover и анимации" },
		],
		scrollAnchor: 1,
		scene: {
			model: { brandMark: { phase: "engineeringWireframe", wireframe: true } },
		},
	},
];

export default states;
