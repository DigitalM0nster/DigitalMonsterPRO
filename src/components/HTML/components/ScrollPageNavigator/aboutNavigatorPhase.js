/**
 * About track for ScrollPageNavigator snake/items.
 *
 * One linear story unit = one equal navigator segment:
 *   stages 0→1→2→3→4, then leave 4→5 (contacts).
 * So deceleration always lands at the same relative place in each segment —
 * not a compressed 0.18…0.6 stage band plus a separate leave blend.
 */

import { ABOUT_STAGE_COUNT } from "@/about/states.js";

/** Interior story stops: 0…ABOUT_STAGE_COUNT. Leave commit at +1. */
export const ABOUT_STORY_MAX = ABOUT_STAGE_COUNT;
/** Story distance from About entry to Contacts commit (stages + leave). */
export const ABOUT_NAV_STORY_END = ABOUT_STORY_MAX + 1;
/** Track progress when arriving from Contacts (last interior stop). */
export const ABOUT_NAV_LAND_FROM_CONTACTS = ABOUT_STORY_MAX / ABOUT_NAV_STORY_END;

function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

/**
 * Map About story (incl. leave overshoot) → navigator progress units.
 * story < 0 → portfolio leave (same units as ring progress).
 * story 0…5 → about entry … contacts commit.
 */
export function storyToNavigatorTrack(story) {
	if (!Number.isFinite(story)) {
		return 0;
	}
	if (story < 0) {
		return story;
	}
	return Math.min(ABOUT_NAV_STORY_END, story) / ABOUT_NAV_STORY_END;
}

/** Resolve the exact About-owned coordinate before/after its runtime mounts. */
export function resolveAboutOwnedTrack({
	aboutActive,
	storyProgress,
	lastCommitFromId,
	lastCommitDirection,
}) {
	if (
		aboutActive !== true
		&& lastCommitFromId === "contacts"
		&& lastCommitDirection === "backward"
	) {
		return storyToNavigatorTrack(ABOUT_STORY_MAX);
	}

	return storyToNavigatorTrack(storyProgress);
}

/**
 * @returns {{ navigatorProgress: number, aboutTrackActive: boolean }}
 */
export function resolveAboutNavigatorProgress({
	currentId,
	rawProgress,
	progress,
	aboutActive,
	storyProgress,
	isDirectClickTravel,
	lastCommitFromId,
	lastCommitDirection,
}) {
	const aboutStageActive = currentId === "about" && aboutActive === true;
	const story = Number.isFinite(storyProgress) ? storyProgress : 0;

	const isEnteringAboutForward =
		(currentId === "portfolioHub" && (rawProgress > 0.001 || Math.abs(progress) > 0.001) && !isDirectClickTravel);
	const isEnteringAboutFromContacts =
		currentId === "contacts" && (rawProgress < -0.001 || progress < -0.001) && !isDirectClickTravel;

	const aboutTrackActive =
		aboutStageActive ||
		isEnteringAboutForward ||
		isEnteringAboutFromContacts ||
		isDirectClickTravel ||
		(currentId === "about" && (Math.abs(story) > 0.001 || Math.abs(rawProgress) > 0.001));

	if (isDirectClickTravel) {
		return {
			navigatorProgress: progress,
			aboutTrackActive,
		};
	}

	if (isEnteringAboutFromContacts) {
		const blend = clamp01(-progress);
		return {
			navigatorProgress: progress + ABOUT_NAV_LAND_FROM_CONTACTS * blend,
			aboutTrackActive,
		};
	}

	if (isEnteringAboutForward) {
		return {
			navigatorProgress: progress,
			aboutTrackActive,
		};
	}

	if (currentId === "about") {
		/** Prefer live story (includes leave 4→5 and back-leave < 0). */
		return {
			navigatorProgress: resolveAboutOwnedTrack({
				aboutActive,
				storyProgress: story,
				lastCommitFromId,
				lastCommitDirection,
			}),
			aboutTrackActive,
		};
	}

	return {
		navigatorProgress: progress,
		aboutTrackActive: false,
	};
}
