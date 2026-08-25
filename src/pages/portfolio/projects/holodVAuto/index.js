import projectConfig from "./project.config.js";
import states from "./states.js";
import { createProjectModule } from "@/pages/portfolio/core/createProjectModule.js";
import stateCopy from "./stateCopy.js";

const localizedStates = states.map((state) => ({
	...state,
	localizedCopy: stateCopy[state.id] ?? {},
}));

const module = createProjectModule(projectConfig, localizedStates);

export default module;
