import projectConfig from "./project.config.js";
import states from "./states.js";
import mobileContent from "./mobileContent.js";
import { createProjectModule } from "@/portfolio/core/createProjectModule.js";
import { createContentProjectScene } from "@/portfolio/core/createContentProjectScene.js";

const module = createProjectModule(projectConfig, states, {}, createContentProjectScene);
module.mobileContent = mobileContent;

export default module;
