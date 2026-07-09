import { createProjectModule } from "./createProjectModule.js";
import { createDefaultFiveStates } from "./portfolioDefaultStates.js";

/**
 * Заглушка проекта до переноса контента и 3D-сцены.
 * @param {import('./types.js').PortfolioProjectConfig} partial
 */
export function createPlaceholderProject(partial) {
	const config = {
		...partial,
		summary: partial.summary ?? "Контент в подготовке",
		contentStatus: "needsContent",
		mediaPolicy: partial.mediaPolicy ?? { maxVideos: 0, defaultLoad: "onDemand" },
		meta: partial.meta ?? {},
	};

	const states = createDefaultFiveStates(config.title, config.summary);

	return createProjectModule(config, states, {}, () => ({
		mount() {},
		unmount() {},
		onStateChange() {},
		onInvestigationEnter() {},
		onInvestigationLeave() {},
		update() {},
	}));
}
