import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { CaseStudyPanelHudMesh } from "./CaseStudyPanelHudMesh.js";

/**
 * Shared CaseStudy left-panel HUD host (Nipigas WebGL path).
 * Attach `panelHud` to any case scene so SceneManager / DigitalMonsterThreeApp
 * can composite after bloom; hex cuts the overlay via shared shader mask.
 */

/**
 * @param {import("three").Scene} threeScene
 * @returns {CaseStudyPanelHudMesh}
 */
export function createCaseStudyPanelHud(threeScene) {
	const panelHud = new CaseStudyPanelHudMesh(threeScene);
	panelHud.setVisible(false);
	return panelHud;
}

/**
 * Per-frame bridge sync + visibility.
 * Mirrors Case1: only show while mix-previewing or while this case is open in React.
 *
 * @param {CaseStudyPanelHudMesh | null | undefined} panelHud
 * @param {{ showCase?: boolean, mixPreview?: boolean, store?: { openedCase?: unknown } | null }} opts
 */
export function syncCaseStudyPanelHud(panelHud, { showCase = false, mixPreview = false, store = null } = {}) {
	if (!panelHud) return;

	// Case-boundary scroll mix: only the open case's left HUD (hex-cut on screen overlay).
	// Mix-preview target must not show a second left band from the shared bridge.
	const caseScrollMix = getSceneCarousel().isCaseBoundaryDrive() === true;
	const hudActive = Boolean(
		(mixPreview && !caseScrollMix) || (showCase && store?.openedCase),
	);
	if (hudActive) {
		// Content only on bridge revision; anim uniforms every active frame.
		panelHud.syncFromBridge();
		panelHud.setVisible(true);
		return;
	}

	// Dormant: hide once, never sync (shared bridge belongs to the open case).
	if (panelHud.visible) {
		panelHud.setComposeMode("models");
		panelHud.setVisible(false);
	}
}

/**
 * About left HUD — About-owned bridge; show while About is current/mix-preview.
 * @param {CaseStudyPanelHudMesh | null | undefined} panelHud
 * @param {{ active?: boolean }} [opts]
 */
export function syncAboutPanelHud(panelHud, { active = false } = {}) {
	if (!panelHud) return;

	if (active) {
		panelHud.setComposeMode("screen");
		panelHud.syncFromBridge();
		panelHud.setVisible(true);
		return;
	}

	if (panelHud.visible) {
		panelHud.setComposeMode("models");
		panelHud.setVisible(false);
	}
}

/**
 * Detach from screen overlay so HUD cannot linger over the next page.
 * @param {CaseStudyPanelHudMesh | null | undefined} panelHud
 */
export function hideCaseStudyPanelHud(panelHud) {
	if (!panelHud) return;
	panelHud.setComposeMode("models");
	panelHud.setVisible(false);
}

/**
 * @param {CaseStudyPanelHudMesh | null | undefined} panelHud
 */
export function disposeCaseStudyPanelHud(panelHud) {
	panelHud?.dispose?.();
}
