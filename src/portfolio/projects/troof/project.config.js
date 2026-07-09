/** @type {import('@/portfolio/core/types.js').PortfolioProjectConfig} */
const projectConfig = {
	id: "02",
	slug: "troof",
	route: "/portfolio/02",
	title: "Troof",
	summary: "Сайт для строительной компании",
	hubLogo: "/images/portfolio/case2.webp",
	models: {
		primary: "/models/case2/platform1.glb",
	},
	scene: {
		defaultCamera: { position: [0, 0, 9], lookAt: [0, 0, 0] },
		rootOffsetDesktop: [1.25, 0, 0],
	},
	meta: {
		year: 2022,
		type: "Сайт для строительной компании",
		skills: ["MySql", "Figma", "PS", "HTML", "CSS", "JavaScript"],
	},
	mediaPolicy: {
		maxVideos: 0,
		defaultLoad: "onDemand",
	},
};

export default projectConfig;
