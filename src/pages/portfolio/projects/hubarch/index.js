import projectConfig from "./project.config.js";
import states from "./states.js";
import mobileContent from "./mobileContent.js";
import { createProjectModule } from "@/pages/portfolio/core/createProjectModule.js";
import { createContentProjectScene } from "@/pages/portfolio/core/createContentProjectScene.js";
import stateCopy from "./stateCopy.js";

const localizedStates = states.map((state) => ({
	...state,
	localizedCopy: stateCopy[state.id] ?? {},
}));

const module = createProjectModule(projectConfig, localizedStates, {}, createContentProjectScene);
module.mobileContent = mobileContent;

export default module;
