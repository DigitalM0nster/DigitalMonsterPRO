import projectConfig from "./project.config.js";
import states from "./states.js";
import hotspots from "./hotspots.js";
import mobileContent from "./mobileContent.js";
import { createProjectScene } from "./scene.js";
import { createProjectModule } from "@/portfolio/core/createProjectModule.js";

const module = createProjectModule(projectConfig, states, hotspots, createProjectScene);
module.mobileContent = mobileContent;

export default module;
