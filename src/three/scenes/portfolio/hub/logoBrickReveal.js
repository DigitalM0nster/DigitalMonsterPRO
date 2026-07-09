/** Детерминированный seed раскладки смещённых частей для проекта. */
export function getRevealSeedForProject(projectIndex) {
	return ((projectIndex + 1) * 9781.541 + 137.31) % 9973.0;
}

/** @deprecated */
export const getBrickSeedForProject = getRevealSeedForProject;
