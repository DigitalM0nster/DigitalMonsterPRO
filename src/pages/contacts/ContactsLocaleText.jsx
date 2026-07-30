import GlitchBilingualText from "@/components/GlitchText/GlitchBilingualText.jsx";
import {
	CONTACTS_CHANNEL_GLITCH_SOUND_GAIN,
	CONTACTS_CHANNEL_GLITCH_SOUND_PAN,
	CONTACTS_CHANNEL_GLITCH_SOUND_POSITION,
} from "@/sounds/soundDesign.js";
import { shouldAnimateSiteLocaleForRingScene } from "@/functions/siteLocaleSwitch.js";
import styles from "./ContactsPage.module.scss";

/** Compress parallel contacts snakes so the locale switch finishes sooner. */
const CONTACTS_LOCALE_SNAKE_BUDGET_MS = 420;

/**
 * Contacts copy that snakes on site locale change (instant when contacts is not current).
 */
export default function ContactsLocaleText({
	texts,
	locale,
	className = "",
	playSound = false,
	sizeToActiveLocale = true,
	wrapWords = false,
	localeSwitchDelayMs = 0,
}) {
	const animate = shouldAnimateSiteLocaleForRingScene("contacts");

	return (
		<GlitchBilingualText
			texts={texts}
			locale={locale}
			className={[styles.contactsGlitch, className].filter(Boolean).join(" ")}
			playSound={playSound && animate}
			soundPan={CONTACTS_CHANNEL_GLITCH_SOUND_PAN}
			soundSpatialPosition={CONTACTS_CHANNEL_GLITCH_SOUND_POSITION}
			soundVolumeGain={playSound ? CONTACTS_CHANNEL_GLITCH_SOUND_GAIN : undefined}
			managedLocaleTransition={!animate}
			sizeToActiveLocale={sizeToActiveLocale}
			wrapWords={wrapWords}
			localeSwitchDelayMs={animate ? localeSwitchDelayMs : 0}
			timeBudgetMs={animate ? CONTACTS_LOCALE_SNAKE_BUDGET_MS : undefined}
		/>
	);
}
