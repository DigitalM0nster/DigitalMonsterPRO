import { useMemo } from "react";

import { useStore } from "@/store.jsx";

import { getTopHudSoundToggleAria, TOP_HUD_SOUND_LABEL_COPY } from "@/i18n/siteCopy.js";

import { toggleSiteSound } from "@/sounds/siteSoundToggle.js";

import GlitchBilingualText from "../GlitchBilingualText.jsx";

import SiteTopHudSoundStatusGlitch from "./SiteTopHudSoundStatusGlitch.jsx";

import SiteTopHudWaveform from "./SiteTopHudWaveform.jsx";

import styles from "./SiteTopHud.module.scss";

function SoundScopeIcon() {
	return (
		<svg className={styles.soundIcon} viewBox="0 0 16 16" aria-hidden="true">
			<path className={styles.soundIconBody} d="M3.5 5.8h2.2L8.2 3.5v9L5.7 10.2H3.5V5.8Z" />
			<path className={styles.soundIconWave} d="M10.4 5.2c1.1 1 1.7 2.2 1.7 2.8s-.6 1.8-1.7 2.8" />
			<path className={styles.soundIconWaveOuter} d="M11.8 3.6c1.8 1.6 2.8 3.4 2.8 4.4s-1 2.8-2.8 4.4" />
		</svg>
	);
}

/** Осциллограф + подпись «Звук // вкл/выкл», переключение по клику. */
export default function SiteTopHudSoundScope() {
	const store = useStore();

	const active = store.soundsActive;

	const toggleAria = useMemo(
		() => getTopHudSoundToggleAria(active, store.siteLocale),
		[active, store.siteLocale],
	);

	return (
		<button
			type="button"
			className={[styles.soundScope, active ? styles.soundOn : styles.soundOff].filter(Boolean).join(" ")}
			onClick={() => toggleSiteSound()}
			aria-label={toggleAria}
			aria-pressed={active}
			title={toggleAria}
		>
			<span className={styles.soundRoute}>
				<GlitchBilingualText
					texts={TOP_HUD_SOUND_LABEL_COPY}
					locale={store.siteLocale}
					className={styles.soundLabel}
					alignEnd
					leadingSlot={<SoundScopeIcon />}
					leadingGlitch
				/>

				<span className={styles.soundSep} aria-hidden="true">
					//
				</span>

				<span className={styles.soundLed} aria-hidden="true" />

				<span className={styles.soundStatus}>
					<SiteTopHudSoundStatusGlitch active={active} locale={store.siteLocale} />
				</span>
			</span>

			<SiteTopHudWaveform active={active} />
		</button>
	);
}
