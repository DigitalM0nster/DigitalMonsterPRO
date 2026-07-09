import { fadeOutSound, playSound } from "@/sounds/soundDesign.js";
import { isPageSoundAllowed } from "@/sounds/pageVisibilitySound.js";
import { heroTextRevealConfig } from "./heroTextRevealConfig.js";

/** logo_reveal — появление логотипа на плитке; glitch_button — «Подробнее». */
export function playHeroTextRevealEnterSounds() {
	if (!isPageSoundAllowed(true)) {
		return;
	}

	playSound("logo_reveal");

	if (heroTextRevealConfig.enterGlitch) {
		playSound("glitch_button");
	}
}

export function playHeroTextRevealExitSounds() {
	if (!isPageSoundAllowed(true)) {
		return;
	}

	fadeOutSound("logo_reveal");

	if (heroTextRevealConfig.exitGlitch) {
		playSound("glitch_button");
	}
}

/** Прервать logo_reveal (уход до конца appear или dispose). */
export function stopHeroTextRevealSound() {
	if (!isPageSoundAllowed(true)) {
		return;
	}

	fadeOutSound("logo_reveal");
}
