import { projectsData } from "./portfolio/hub/projectsData.js";

/**
 * pathname (displayPathname) → id сцены в SceneManager.
 */
export function resolveSceneId(pathname) {
	if (pathname === "/" || pathname === "") {
		return "home";
	}

	if (pathname === "/portfolio" || projectsData.some((project) => project.path === pathname)) {
		return "portfolioHub";
	}

	if (pathname === "/capabilities" || pathname.startsWith("/capabilities/")) {
		return "capabilities";
	}

	if (pathname.startsWith("/about")) {
		return "about";
	}

	if (pathname === "/contacts" || pathname.startsWith("/contacts/")) {
		return "contacts";
	}

	return "home";
}
