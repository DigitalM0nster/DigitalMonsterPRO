import { CaseStudyPanelHudMesh } from "./CaseStudyPanelHudMesh.js";

/**
 * Shared CaseStudy left-panel HUD host (Nipigas WebGL path).
 * Attach `panelHud` to any case scene so SceneManager / DigitalMonsterThreeApp
 * can composite after bloom and during hex the same way as Case1.
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

	const hudActive = Boolean(mixPreview || (showCase && store?.openedCase));
	if (hudActive) {
		panelHud.syncFromBridge();
		panelHud.setVisible(true);
		return;
	}

	panelHud.setComposeMode("models");
	panelHud.setVisible(false);
	// Drop GPU textures if the React bridge already cleared canvases.
	panelHud.syncFromBridge();
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
