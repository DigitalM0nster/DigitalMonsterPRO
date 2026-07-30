/**
 * Four About stages. Each stage owns its own 0…1 scroll range
 * (storyProgress 0→1, 1→2, 2→3, 3→4). Rest snaps to integer story stops.
 */
const states = [
	{ id: "monolith" },
	{ id: "data_flow" },
	{ id: "engineering" },
	{ id: "layers" },
];

export const ABOUT_STAGE_COUNT = states.length;

/** @deprecated equal legacy anchors — prefer story index / stageProgress */
export const ABOUT_SCROLL_ANCHORS = states.map((_, index) =>
	index / Math.max(states.length - 1, 1),
);

export default states;
