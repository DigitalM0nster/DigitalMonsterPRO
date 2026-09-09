import { projectsData } from "./portfolio/hub/projectsData.js";
import { resolveCapabilitySceneId } from "@/pages/capabilities/data/capabilities.js";
import { isRouteAvailable } from "@/app/config/routeAvailability.js";

/**
 * pathname (displayPathname) → id сцены в SceneManager.
 */
export function resolveSceneId(pathname) {
	if (!isRouteAvailable(pathname)) return "home";
	if (pathname === "/" || pathname === "") {
		return "home";
	}

	if (pathname === "/portfolio" || projectsData.some((project) => project.path === pathname)) {
		return "portfolioHub";
	}

	const capabilitySceneId = resolveCapabilitySceneId(pathname);
	if (capabilitySceneId) return capabilitySceneId;

	if (pathname.startsWith("/about")) {
		return "about";
	}

	if (pathname === "/contacts" || pathname.startsWith("/contacts/")) {
		return "contacts";
	}

	return "home";
}
