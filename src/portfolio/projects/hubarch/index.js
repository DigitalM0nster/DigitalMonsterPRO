import projectConfig from "./project.config.js";
import states from "./states.js";
import mobileContent from "./mobileContent.js";
import { createProjectModule } from "@/portfolio/core/createProjectModule.js";
import { createContentProjectScene } from "@/portfolio/core/createContentProjectScene.js";
import stateCopy from "./stateCopy.js";

const localizedStates = states.map((state) => ({
	...state,
	localizedCopy: stateCopy[state.id] ?? {},
}));

const module = createProjectModule(projectConfig, localizedStates, {}, createContentProjectScene);
module.mobileContent = mobileContent;

export default module;
