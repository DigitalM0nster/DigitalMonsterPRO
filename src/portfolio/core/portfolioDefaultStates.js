/**
 * Пять стандартных этапов кейса — для шаблонов и проектов без полного контента.
 *
 * @param {string} projectTitle
 * @param {string} [description]
 * @returns {import('./types.js').PortfolioState[]}
 */
export function createDefaultFiveStates(projectTitle, description = "Контент в подготовке") {
	return [
		{
			id: "state_00",
			title: projectTitle,
			pathSubtitle: "Overview",
			description,
			status: "needsContent",
			scrollAnchor: 0,
			scene: { model: {} },
		},
		{
			id: "state_01",
			title: "Контекст",
			pathSubtitle: "Context",
			status: "needsContent",
			scrollAnchor: 0.25,
			scene: { model: {} },
		},
		{
			id: "state_02",
			title: "Дизайн",
			pathSubtitle: "Design",
			status: "needsContent",
			scrollAnchor: 0.5,
			scene: { model: {} },
		},
		{
			id: "state_03",
			title: "Опыт",
			pathSubtitle: "Experience",
			status: "needsContent",
			scrollAnchor: 0.75,
			scene: { model: {} },
		},
		{
			id: "state_04",
			title: "Итог",
			pathSubtitle: "Outcome",
			status: "needsContent",
			scrollAnchor: 1,
			scene: { model: {} },
		},
	];
}
