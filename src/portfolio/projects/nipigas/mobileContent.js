/**
 * Сокращённые тексты для мобильных карточек и полные версии для bottom sheet.
 * @type {Record<string, { shortDescription: string, shortFeatures?: { title: string, subtitle?: string }[], detailsTitle?: string }>}
 */
const mobileContentByState = {
	state_01: {
		shortDescription:
			"Интерактивный юбилейный сайт к 50-летию НИПИГАЗ: история компании, проекты, архив и личные истории сотрудников в одном цифровом пространстве.",
		shortFeatures: [
			{ title: "1 месяц", subtitle: "разработка" },
			{ title: "3 месяца", subtitle: "сопровождение" },
			{ title: "Digital-спецпроект", subtitle: "формат" },
		],
	},
	state_02: {
		shortDescription:
			"Орбитальные HUD-формы, архивные фото и промышленная графика стали единым визуальным языком — каждый раздел сохранил характер внутри общего мира.",
		shortFeatures: [
			{ title: "HUD-навигация", subtitle: "центральный образ" },
			{ title: "Архивные материалы", subtitle: "часть среды" },
			{ title: "Глубина и перспектива", subtitle: "не плоская подача" },
		],
	},
	state_03: {
		shortDescription:
			"Два HUD-круга реагировали на курсор и одновременно вели по разделам. Переходы и перспектива работали как единая непрерывная сцена.",
		shortFeatures: [
			{ title: "Реакция на курсор", subtitle: "пространственный наклон" },
			{ title: "HUD-навигация", subtitle: "нестандартный выбор разделов" },
			{ title: "Плавные переходы", subtitle: "без потери погружения" },
		],
	},
	state_04: {
		shortDescription:
			"После запуска сотрудники из разных регионов присылали материалы для фото-челленджа. Мы вручную модерировали и публиковали более 500 материалов.",
		shortFeatures: [
			{ title: "500+ материалов", subtitle: "проверено и опубликовано" },
			{ title: "Ручная модерация", subtitle: "фото и тексты" },
			{ title: "Разные часовые пояса", subtitle: "оперативные обновления" },
		],
	},
	state_05: {
		shortDescription:
			"Весь интерактивный frontend — чистые HTML, CSS и JavaScript. Отдельно оптимизировали HUD-сцену и постепенную загрузку для мобильных устройств.",
		shortFeatures: [
			{ title: "0 библиотек", subtitle: "полный контроль" },
			{ title: "1 месяц", subtitle: "разработка" },
			{ title: "Mobile optimized", subtitle: "сложная HUD-сцена" },
		],
		detailsTitle: "Технические детали",
	},
};

export default mobileContentByState;
