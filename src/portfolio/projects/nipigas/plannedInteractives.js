/**
 * DEV BACKLOG — только для команды (ты + разработка).
 *
 * НЕ показывается посетителю сайта.
 * НЕ часть UI.
 *
 * Здесь мы фиксируем идеи интерактивов, которые ещё нужно:
 * - продумать (needsDesign)
 * - реализовать в scene.js (needsImplementation)
 *
 * Когда интерактив готов — пункт удаляем или переносим в states/hotspots.
 *
 * @type {import('@/portfolio/core/types.js').PlannedInteractive[]}
 */
const plannedInteractives = [
	{
		id: "orbit-accelerate",
		title: "Ускорение орбит по pointer",
		description: "Legacy: pointer down ускоряет орбиты. Перенести в scene.js + расширить.",
		relatedStates: ["state_03"],
		status: "needsImplementation",
	},
	{
		id: "logo-deconstruct",
		title: "Разборка логотипа на слои",
		description: "При investigation logo-circle — слои logoCircle / separator / numberFifty расходятся.",
		relatedHotspots: ["logo-circle"],
		status: "needsDesign",
	},
	{
		id: "fire-pulse-scroll",
		title: "Пульс огня от scroll",
		description: "logoFire реагирует на scrollProgress в state_03 — emissive + scale.",
		relatedStates: ["state_03"],
		status: "needsDesign",
	},
	{
		id: "dynasty-orbit-split",
		title: "Орбиты как timeline династий",
		description: "state_04: орбиты делятся на сегменты, каждый — веха / династия.",
		relatedStates: ["state_04"],
		status: "needsDesign",
	},
	{
		id: "values-color-shift",
		title: "Палитра ценностей на модели",
		description: "state_02: материалы модели переключаются между #008890, #7AB715 и т.д.",
		relatedStates: ["state_02"],
		status: "needsDesign",
	},
	{
		id: "grain-blur-scroll",
		title: "Post-process от scroll",
		description: "Grain blur — привязать к scene.postProcess per state, не только scroll.",
		relatedStates: ["state_03", "state_04"],
		status: "needsImplementation",
	},
];

export default plannedInteractives;
