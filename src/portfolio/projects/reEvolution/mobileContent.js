/**
 * @type {Record<string, { shortDescription: string, shortFeatures?: { title: string, subtitle?: string }[], detailsTitle?: string }>}
 */
const mobileContentByState = {
	state_01: {
		shortDescription:
			"За две недели сверстали промо-лендинг RE:EVOLUTION — агентства полного цикла и медведя.",
		shortFeatures: [
			{ title: "2019–2020", subtitle: "период" },
			{ title: "2 недели", subtitle: "срок" },
			{ title: "Вёрстка", subtitle: "роль" },
		],
	},
	state_02: {
		shortDescription:
			"Собрали узнаваемый образ из тёмного фона, розового акцента, крупной графики и персонажа.",
		shortFeatures: [
			{ title: "Розовый", subtitle: "акцент" },
			{ title: "Медведь", subtitle: "персонаж" },
			{ title: "Графика", subtitle: "промо-ритм" },
		],
	},
	state_03: {
		shortDescription:
			"Реализовали движение медведя, элементов и hover-состояния.",
		shortFeatures: [
			{ title: "Character motion", subtitle: "медведь" },
			{ title: "Hover", subtitle: "реакции" },
			{ title: "Motion", subtitle: "динамика" },
		],
	},
	state_04: {
		shortDescription:
			"Связали короткую презентацию агентства с видео кейсов и YouTube-каналом.",
		shortFeatures: [
			{ title: "Full cycle", subtitle: "позиционирование" },
			{ title: "Showreel", subtitle: "кейсы" },
			{ title: "YouTube", subtitle: "архив работ" },
		],
	},
	state_05: {
		shortDescription:
			"Выполнили адаптивную вёрстку на HTML и SCSS за две недели.",
		shortFeatures: [
			{ title: "HTML", subtitle: "структура" },
			{ title: "SCSS", subtitle: "стили" },
			{ title: "2 недели", subtitle: "реализация" },
		],
		detailsTitle: "Инженерия проекта",
	},
};

export default mobileContentByState;
