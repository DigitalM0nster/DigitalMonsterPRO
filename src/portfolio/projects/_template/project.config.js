/**
 * Шаблон нового проекта. Скопировать папку и переименовать slug.
 * @type {import('@/portfolio/core/types.js').PortfolioProjectConfig}
 */
export default {
	id: "XX",
	slug: "projectSlug",
	route: "/portfolio/XX",
	title: "Project Title",
	summary: "",
	hubLogo: "/images/portfolio/caseX.webp",
	models: {
		primary: "/models/caseX/model.glb",
	},
	scene: {
		defaultCamera: {
			position: [0, 0, 9],
			lookAt: [0, 0, 0],
		},
	},
	meta: {
		year: 2024,
		type: "",
		skills: [],
	},
};
