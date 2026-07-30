import { useCallback, useEffect, useRef, useState } from "react";
import GlitchText from "@/components/GlitchText/GlitchText.jsx";
import {
	CONTACTS_CHANNEL_GLITCH_SOUND_GAIN,
	CONTACTS_CHANNEL_GLITCH_SOUND_PAN,
	CONTACTS_CHANNEL_GLITCH_SOUND_POSITION,
} from "@/sounds/soundDesign.js";
import ContactsLocaleText from "./ContactsLocaleText.jsx";
import ContactsTextClip from "./ContactsTextClip.jsx";
import styles from "./ContactsPage.module.scss";

function CopyIcon() {
	return (
		<svg className={styles.copyIcon} viewBox="0 0 14 14" aria-hidden="true">
			<rect
				x="4.5"
				y="4.5"
				width="7"
				height="7"
				rx="1"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.2"
			/>
			<path
				d="M9.5 4.5V3.2A1.2 1.2 0 0 0 8.3 2H3.2A1.2 1.2 0 0 0 2 3.2v5.1A1.2 1.2 0 0 0 3.2 9.5H4.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
			/>
		</svg>
	);
}

/**
 * One contact channel row: link + glitch hover snake + copy control.
 */
export default function ContactsChannelItem({
	channel,
	labelTexts,
	locale,
	label,
	copyAria,
	copiedAria,
	localeSwitchDelayMs = 0,
	labelStaggerI = 0,
	valueStaggerI = 0,
	copyStaggerI = 0,
}) {
	const glitchRef = useRef(null);
	const [copied, setCopied] = useState(false);
	const copiedTimerRef = useRef(0);

	useEffect(() => {
		return () => window.clearTimeout(copiedTimerRef.current);
	}, []);

	const playSnake = useCallback(() => {
		glitchRef.current?.playHover?.({
			soundPan: CONTACTS_CHANNEL_GLITCH_SOUND_PAN,
			soundSpatialPosition: CONTACTS_CHANNEL_GLITCH_SOUND_POSITION,
			soundVolumeGain: CONTACTS_CHANNEL_GLITCH_SOUND_GAIN,
		});
	}, []);

	const onCopy = useCallback(
		async (event) => {
			event.preventDefault();
			event.stopPropagation();
			const text = channel.value;
			try {
				await navigator.clipboard.writeText(text);
			} catch {
				const ta = document.createElement("textarea");
				ta.value = text;
				ta.setAttribute("readonly", "");
				ta.style.position = "fixed";
				ta.style.left = "-9999px";
				document.body.appendChild(ta);
				ta.select();
				document.execCommand("copy");
				ta.remove();
			}
			setCopied(true);
			window.clearTimeout(copiedTimerRef.current);
			copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1400);
		},
		[channel.value],
	);

	const linkProps = {
		href: channel.href,
		target: channel.external ? "_blank" : undefined,
		rel: channel.external ? "noopener noreferrer" : undefined,
	};

	return (
		<div className={styles.channel} onPointerEnter={playSnake}>
			<a className={styles.channelLabel} {...linkProps}>
				<ContactsTextClip staggerI={labelStaggerI}>
					<ContactsLocaleText
						texts={labelTexts}
						locale={locale}
						localeSwitchDelayMs={localeSwitchDelayMs}
					/>
				</ContactsTextClip>
			</a>
			<div className={styles.channelValueRow}>
				<a className={styles.channelValue} {...linkProps}>
					<ContactsTextClip staggerI={valueStaggerI}>
						<GlitchText
							ref={glitchRef}
							text={channel.value}
							className={styles.channelGlitchValue}
						/>
					</ContactsTextClip>
				</a>
				<ContactsTextClip staggerI={copyStaggerI} className={styles.iconClip}>
					<button
						type="button"
						className={`${styles.copyButton}${copied ? ` ${styles.copyButtonDone}` : ""}`}
						onClick={onCopy}
						aria-label={copied ? copiedAria : `${copyAria}: ${label}`}
						title={copied ? copiedAria : copyAria}
					>
						<CopyIcon />
					</button>
				</ContactsTextClip>
			</div>
		</div>
	);
}
