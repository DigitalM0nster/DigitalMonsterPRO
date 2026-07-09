import { projectsData } from "./portfolio/hub/projectsData.js";

/**
 * pathname (displayPathname) → id сцены в SceneManager.
 */
export function resolveSceneId(pathname) {
	if (pathname === "/" || pathname === "") {
		return "home";
	}

	if (pathname === "/portfolio") {
		return "portfolioHub";
	}

	const caseProject = projectsData.find((p) => p.path === pathname);
	if (caseProject) {
		return `case${caseProject.slug}`;
	}

	if (pathname.startsWith("/about")) {
		return "about";
	}

	if (pathname === "/contacts" || pathname.startsWith("/contacts/")) {
		return "contacts";
	}

	return "home";
}
