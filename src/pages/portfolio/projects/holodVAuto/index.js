import projectConfig from "./project.config.js";
import states from "./states.js";
import mobileContent from "./mobileContent.js";
import { createProjectScene } from "./scene.js";
import { createProjectModule } from "@/pages/portfolio/core/createProjectModule.js";
import stateCopy from "./stateCopy.js";

const localizedStates = states.map((state) => ({
	...state,
	localizedCopy: stateCopy[state.id] ?? {},
}));

const module = createProjectModule(projectConfig, localizedStates, {}, createProjectScene);
module.mobileContent = mobileContent;

export default module;
