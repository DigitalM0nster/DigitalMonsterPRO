/** @type {import('@/portfolio/core/types.js').HotspotsByState} */
const hotspots = {
	state_02: [
		{
			id: "roof-platform",
			position: null,
			meshAnchors: ["roof"],
			title: "Кровельная платформа",
			status: "needsBehavior",
			investigation: {
				uiDescription: "Линии расходятся, крыша поднимается — смотрите на модель.",
				hideOtherHotspots: true,
				behavior: {
					model: { roof: { lift: true }, lines: { expand: true } },
					playAnimations: ["roofLinesExpand"],
				},
			},
		},
	],
	state_03: [
		{
			id: "lines-animation",
			position: null,
			title: "Динамические линии",
			status: "needsBehavior",
			investigation: {
				behavior: {
					model: { lines: { fullExpand: true, loop: true } },
					postProcess: { bloomIntensity: 1.2 },
				},
			},
		},
	],
};

export default hotspots;
