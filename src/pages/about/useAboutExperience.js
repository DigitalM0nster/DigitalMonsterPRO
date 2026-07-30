/**
 * About story/wheel ownership lives in `aboutExperienceRuntime.js`, started by
 * `AboutExperienceHost` when SceneCarousel commits to `about`.
 *
 * Kept as a thin re-export so older imports / docs keep resolving.
 */
export {
	startAboutExperienceRuntime,
	stopAboutExperienceRuntime,
	isAboutExperienceRuntimeActive,
} from "./aboutExperienceRuntime.js";
