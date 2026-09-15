import { AnimationUtils, LoopOnce } from "three";

export const whaleReactionDirections = ["Left", "Right", "Up", "Down"];

/** All bindings are allocated under the curtain, on the existing swim mixer. */
export function prepareWhaleReactionActions(mixer, clips) {
	return whaleReactionDirections.map(direction => {
		const source = clips.find(clip => clip.name === `Whale_Look${direction}`);
		if (!source) throw new Error(`Missing Blender whale reaction: ${direction}`);
		const clip = AnimationUtils.makeClipAdditive(source.clone(), 0);
		const action = mixer.clipAction(clip);
		action.setLoop(LoopOnce, 1);
		action.clampWhenFinished = true;
		action.play();
		action.paused = true;
		action.time = clip.duration;
		action.setEffectiveWeight(0);
		return action;
	});
}

/** Blend authored reach poses. The pointer spring owns easing; scrubbing each
 * clip's eased neutral→reach curve would brake twice when crossing neutral. */
export function sampleWhaleReactions(actions, x, y) {
	if (!actions) return;
	const radius = Math.max(1, Math.hypot(x, y));
	x /= radius;
	y /= radius;
	// Authored yaw is opposite screen X in the site's camera composition.
	actions[0].setEffectiveWeight(Math.max(0, x));
	actions[1].setEffectiveWeight(Math.max(0, -x));
	actions[2].setEffectiveWeight(Math.max(0, y));
	actions[3].setEffectiveWeight(Math.max(0, -y));
	for (const action of actions) action.time = action.getClip().duration;
}

/** A named additive gesture prepared under the preloader curtain. */
export function prepareWhaleGestureAction(mixer, clips, name) {
	const source = clips.find(clip => clip.name === name);
	if (!source) throw new Error(`Missing Blender whale gesture: ${name}`);
	const clip = AnimationUtils.makeClipAdditive(source.clone(), 0);
	const action = mixer.clipAction(clip);
	action.setLoop(LoopOnce, 1);
	action.clampWhenFinished = true;
	action.play();
	action.paused = true;
	action.time = 0;
	action.setEffectiveWeight(0);
	return action;
}

export function sampleWhaleGesture(action, progress, weight = 1) {
	if (!action) return;
	const t = Math.max(0, Math.min(1, progress));
	action.time = action.getClip().duration * t;
	action.setEffectiveWeight(Math.max(0, weight));
}
