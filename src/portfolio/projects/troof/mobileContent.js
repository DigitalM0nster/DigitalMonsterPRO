/**
 * @type {Record<string, { shortDescription: string, shortFeatures?: { title: string, subtitle?: string }[], detailsTitle?: string }>}
 */
const mobileContentByState = {
	state_01: {
		shortDescription:
			"Сверстали крупный сайт TROOF о материалах, монтаже и комплексных кровельных решениях.",
		shortFeatures: [
			{ title: "2022", subtitle: "год" },
			{ title: "1,5 месяца", subtitle: "срок" },
			{ title: "Вёрстка", subtitle: "роль" },
		],
	},
	state_02: {
		shortDescription:
			"Перенесли серо-стальную палитру, контрастную типографику и слоистую геометрию в адаптивный интерфейс.",
		shortFeatures: [
			{ title: "Серая палитра", subtitle: "холодные оттенки" },
			{ title: "Montserrat", subtitle: "основной шрифт" },
			{ title: "ST_Norilsk", subtitle: "акцентная типографика" },
		],
	},
	state_03: {
		shortDescription:
			"Реализовали динамичную композицию из крыши, линий и шести декоративных платформ.",
		shortFeatures: [
			{ title: "Pointer", subtitle: "реакция элементов" },
			{ title: "3D-композиция", subtitle: "крыша и платформы" },
			{ title: "Motion", subtitle: "много эффектов" },
		],
	},
	state_04: {
		shortDescription:
			"Собрали большой объём информации о материалах, монтаже и услугах в единую систему.",
		shortFeatures: [
			{ title: "Материалы", subtitle: "кровельные решения" },
			{ title: "Монтаж", subtitle: "услуги" },
			{ title: "Много разделов", subtitle: "единая структура" },
		],
	},
	state_05: {
		shortDescription:
			"Выполнили фронтенд-вёрстку большого сайта с анимациями и интерактивными состояниями.",
		shortFeatures: [
			{ title: "HTML", subtitle: "структура" },
			{ title: "CSS", subtitle: "адаптив" },
			{ title: "JavaScript", subtitle: "интерактив" },
		],
		detailsTitle: "Инженерия проекта",
	},
};

export default mobileContentByState;
