import projectConfig from "./project.config.js";
import states from "./states.js";
import hotspots from "./hotspots.js";
import { createProjectScene } from "./scene.js";
import { createProjectModule } from "@/portfolio/core/createProjectModule.js";

export default createProjectModule(projectConfig, states, hotspots, createProjectScene);
