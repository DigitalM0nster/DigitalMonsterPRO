/** @type {import('@/portfolio/core/types.js').PortfolioState[]} */
const states = [
	{
		id: "state_00",
		title: "Troof",
		pathSubtitle: "Overview",
		subtitle: "Сайт для строительной компании",
		traits: [
			{ label: "Год", value: "2022" },
			{ label: "Навыки", values: ["MySql", "Figma", "PS", "HTML", "CSS", "JavaScript"] },
		],
		scrollAnchor: 0,
		scene: {
			model: { platforms: { visible: true, layout: "stack" }, roof: { visible: true } },
		},
	},
	{
		id: "state_01",
		title: "О проекте",
		pathSubtitle: "Context",
		description:
			"TROOF — кровельные системы, плоские крыши, гидроизоляция с 2016 года. Цель — минималистичный футуристичный сайт для премиум аудитории. Клиент: TROOF · Веб-разработка: DigitalMonster",
		scrollAnchor: 0.25,
		scene: {
			model: { platforms: { speed: 0.02, alignCenter: true }, roof: { idle: true } },
		},
	},
	{
		id: "state_02",
		title: "Дизайн",
		pathSubtitle: "Design",
		description: "Дизайн, подчеркивающий современность компании: Montserrat, ST_Norilsk и сдержанная палитра серых.",
		media: { type: "image", src: "/images/case2/case2Image.webp" },
		traits: [
			{ label: "Шрифты", values: ["Montserrat", "ST_Norilsk"] },
			{ label: "Цвета", values: ["#3A424A", "#727980", "#ADB1B6", "#D1D5D8"] },
		],
		scrollAnchor: 0.5,
		scene: {
			model: { roof: { hoverEnabled: true }, lines: { idle: true }, materials: { palette: ["#3A424A", "#727980", "#ADB1B6"] } },
			background: { shaderOpacity: 0.2 },
		},
	},
	{
		id: "state_03",
		title: "Интерактив",
		pathSubtitle: "Experience",
		description:
			"Футуристичность, брутальность и минимализм: 3D-платформы, линии и крыша реагируют на pointer.",
		scrollAnchor: 0.75,
		scene: {
			model: { platforms: { float: true }, lines: { expandOnHover: true }, roof: { active: true } },
			playAnimations: ["linesExpand"],
		},
	},
	{
		id: "state_04",
		title: "Принципы",
		pathSubtitle: "Outcome",
		traits: [
			{ label: "Фокус", values: ["Акцент на важном", "Динамика и минимализм", "Уникальный контент", "Эффект WOW"] },
		],
		scrollAnchor: 1,
		scene: {
			model: { platforms: { spread: true } },
			camera: { position: [0, -12, 9], lookAt: [0, -12, 0] },
		},
	},
];

export default states;
