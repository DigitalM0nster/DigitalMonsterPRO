import clickSoundUrl from "./clickSound.mp3";
import startAppSoundUrl from "./startAppSound.mp3";

/** Runtime sound assets. Every entry is fetched and decoded through audioAssetCache. */
export const SOUND_CATALOG = Object.freeze({
	ui_click: clickSoundUrl,
	start_app: startAppSoundUrl,
	logo_reveal: "/audio/logo_reveal.mp3",
	about_back_dissolve: "/audio/text2.mp3",
	about_particles: "/audio/about_particles.wav",
	teleport_out: "/audio/teleportOut.mp3",
	digital_sound: "/audio/digital_sound.mp3",
	card_movement: "/audio/card_movement.mp3",
	portfolio_leave: "/audio/portfolio_leave_transition.mp3",
	beep: "/audio/beep.mp3",
	hex_transition1: "/audio/hexTransition1.mp3",
	panel_hud_text: "/audio/text4.mp3",
	underwater: "/audio/underwater.mp3",
	glitch_button: "/audio/glitch_button.mp3",
});

export function getUniqueSoundSources() {
	return [...new Set(Object.values(SOUND_CATALOG))];
}
