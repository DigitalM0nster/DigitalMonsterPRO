/**
 * Four About scroll stops. Anchors sit near each scene peak so the HUD
 * sub-track and keyboard snaps land on readable poses.
 * Ranges (see ScrollTimeline): 0–0.22, 0.22–0.47, 0.47–0.72, 0.72–1.
 */
const states = [
	{ id: "monolith", scrollAnchor: 0 },
	{ id: "data_flow", scrollAnchor: 0.345 },
	{ id: "engineering", scrollAnchor: 0.595 },
	{ id: "layers", scrollAnchor: 1 },
];

export const ABOUT_SCROLL_ANCHORS = states.map((state) => state.scrollAnchor);

export default states;
