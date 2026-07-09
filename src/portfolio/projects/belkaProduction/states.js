import { createDefaultFiveStates } from "@/portfolio/core/portfolioDefaultStates.js";

/** @type {import('@/portfolio/core/types.js').PortfolioState[]} */
export default createDefaultFiveStates(
	"Belka Production",
	"Контент, тексты, медиа и 3D-сцена для этого проекта ещё не подготовлены.",
).map((state, index) =>
	index === 0
		? {
				...state,
				status: "needsContent",
			}
		: state,
);
