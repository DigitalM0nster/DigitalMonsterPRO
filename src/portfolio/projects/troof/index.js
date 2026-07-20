import projectConfig from "./project.config.js";
import states from "./states.js";
import hotspots from "./hotspots.js";
import mobileContent from "./mobileContent.js";
import { createProjectScene } from "./scene.js";
import { createProjectModule } from "@/portfolio/core/createProjectModule.js";
import stateCopy from "./stateCopy.js";

const localizedStates = states.map((state) => ({
	...state,
	localizedCopy: stateCopy[state.id] ?? {},
}));

const module = createProjectModule(projectConfig, localizedStates, hotspots, createProjectScene);
module.mobileContent = mobileContent;

export default module;
