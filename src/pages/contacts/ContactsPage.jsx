import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import { subscribeKey } from "valtio/utils";
import { store } from "@/app/store.jsx";
import { usePageStateClasses } from "@/app/context/RouteTransitionContext.jsx";
import {
	getContactsChannelLabelTexts,
	getContactsCopy,
	getContactsFieldTexts,
	getContactsTitleLines,
} from "@/pages/contacts/contactsCopy.js";
import { CONTACTS_CHANNELS, CONTACTS_EMAIL } from "@/pages/contacts/contactsChannels.js";
import { sceneOwnsHexHitAtClientY } from "@/three/render/overlay/hexHitOwnership.js";
import "@/styles/main/mainTransition.scss";
import ContactsChannelItem from "./ContactsChannelItem.jsx";
import ContactsLocaleText from "./ContactsLocaleText.jsx";
import ContactsTextClip from "./ContactsTextClip.jsx";
import styles from "./ContactsPage.module.scss";

/** Carousel progress band where the left panel stays `active` while contacts is current. */
const CONTACTS_PANEL_SCROLL_REST = 0.1;

/** Stagger step between clipped text exits (locale snakes keep their own delays). */
const CLIP_STAGGER_STEP = 1;

/**
 * @returns {"active" | "inactive top" | "inactive bottom" | "inactive"}
 * Forward scroll (progress > 0, down → next) → inactive top
 * Backward scroll (progress < 0, up → previous) → inactive bottom
 */
function resolveContactsPanelScrollClass() {
	if (store.sceneCarouselCurrentId !== "contacts") {
		return "inactive";
	}
	// Hex/menu leave: exit clips at decision time (same as scroll inactive),
	// before dual-scene hex ramps up. Page class also goes `leaving` — see
	// getPageVisibilityClasses.
	if (store.sceneCarouselClickTransitionActive === true) {
		return "inactive top";
	}
	const scroll = store.sceneCarouselProgress ?? 0;
	if (scroll > -CONTACTS_PANEL_SCROLL_REST && scroll < CONTACTS_PANEL_SCROLL_REST) {
		return "active";
	}
	if (scroll >= CONTACTS_PANEL_SCROLL_REST) {
		return "inactive top";
	}
	return "inactive bottom";
}

/**
 * Discrete panel class — no React update while still inside / outside the ±0.1 band.
 * Also flips on hex lock so click leave matches scroll leave immediately (progress
 * alone waits until ease > 0.1, which overlaps the expensive dual-scene hex frames).
 */
function useContactsPanelScrollClass() {
	const [panelClass, setPanelClass] = useState(resolveContactsPanelScrollClass);

	useEffect(() => {
		const sync = () => {
			const next = resolveContactsPanelScrollClass();
			setPanelClass((prev) => (prev === next ? prev : next));
		};
		sync();
		const stopProgress = subscribeKey(store, "sceneCarouselProgress", sync);
		const stopCurrent = subscribeKey(store, "sceneCarouselCurrentId", sync);
		const stopHexLock = subscribeKey(store, "sceneCarouselClickTransitionActive", sync);
		return () => {
			stopProgress();
			stopCurrent();
			stopHexLock();
		};
	}, []);

	return panelClass;
}

function AttachIcon() {
	return (
		<svg className={styles.attachIcon} viewBox="0 0 14 14" aria-hidden="true">
			<path
				d="M11.5 6.2 6.1 11.6a2.6 2.6 0 0 1-3.7-3.7l6.1-6.1a1.7 1.7 0 0 1 2.4 2.4L5.2 9.9a.8.8 0 0 1-1.1-1.1l5.2-5.2"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function SubmitArrow() {
	return (
		<svg className={styles.submitArrow} viewBox="0 0 18 10" aria-hidden="true">
			<path
				d="M0 5h16M11 1l5 4-5 4"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/**
 * Contacts route — left HTML form + channel list; right hologram is WebGL (ContactsScene).
 * Memo: menu hex updates the browser URL immediately while this page stays displayed;
 * skipping parent-driven re-renders avoids reconciling the glitch letter tree at hex start.
 */
function ContactsPage() {
	const pageClassName = usePageStateClasses("contacts");
	const panelScrollClass = useContactsPanelScrollClass();
	const { siteLocale } = useSnapshot(store);
	const copy = getContactsCopy(siteLocale);

	const fileRef = useRef(null);
	const [name, setName] = useState("");
	const [contact, setContact] = useState("");
	const [message, setMessage] = useState("");
	const [fileName, setFileName] = useState("");

	const titleLines = useMemo(() => getContactsTitleLines(), []);
	const attachTexts = useMemo(
		() => getContactsFieldTexts(fileName ? "attachChosen" : "attachLabel"),
		[fileName],
	);

	const guardHexHit = useCallback((event) => {
		if (!sceneOwnsHexHitAtClientY("contacts", event.clientY)) {
			event.preventDefault();
			event.stopPropagation();
		}
	}, []);

	const onAttachClick = () => {
		fileRef.current?.click();
	};

	const onFileChange = (event) => {
		const file = event.target.files?.[0];
		setFileName(file?.name ?? "");
	};

	const onSubmit = (event) => {
		event.preventDefault();
		const subject = encodeURIComponent(
			`[Digital Monster] ${name.trim() || "Inquiry"}`,
		);
		const lines = [
			`Name: ${name.trim()}`,
			`Contact: ${contact.trim()}`,
			"",
			message.trim(),
		];
		if (fileName) {
			lines.push("", `(Attachment selected in browser: ${fileName})`);
		}
		const body = encodeURIComponent(lines.join("\n"));
		window.location.href = `mailto:${CONTACTS_EMAIL}?subject=${subject}&body=${body}`;
	};

	let stagger = 0;
	const nextStagger = () => {
		const i = stagger;
		stagger += CLIP_STAGGER_STEP;
		return i;
	};

	return (
		<div
			className={`${pageClassName} ${styles.contactsPage}`}
			aria-label={copy.formAria}
		>
			<div className={styles.panelSlot}>
				<div
					className={`${styles.panel} ${panelScrollClass}`}
					onPointerDownCapture={guardHexHit}
				>
					<header className={styles.intro}>
						<div className={styles.eyebrow}>
							<ContactsTextClip staggerI={nextStagger()}>
								<ContactsLocaleText
									texts={getContactsFieldTexts("eyebrow")}
									locale={siteLocale}
									localeSwitchDelayMs={0}
								/>
							</ContactsTextClip>
						</div>
						<h1 className={styles.title}>
							{titleLines.map((texts, index) => (
								<ContactsTextClip
									key={`title-line-${index}`}
									staggerI={nextStagger()}
									className={styles.titleClip}
								>
									<ContactsLocaleText
										texts={texts}
										locale={siteLocale}
										playSound={index === 0}
										localeSwitchDelayMs={index * 30}
									/>
								</ContactsTextClip>
							))}
						</h1>
						<div className={styles.subtitle}>
							<ContactsTextClip staggerI={nextStagger()} className={styles.subtitleClip}>
								<ContactsLocaleText
									texts={getContactsFieldTexts("subtitle")}
									locale={siteLocale}
									wrapWords
									localeSwitchDelayMs={70}
								/>
							</ContactsTextClip>
						</div>
					</header>

					<form className={styles.form} onSubmit={onSubmit} noValidate>
						<div className={styles.row}>
							<label className={styles.field}>
								<div className={styles.label}>
									<ContactsTextClip staggerI={nextStagger()}>
										<ContactsLocaleText
											texts={getContactsFieldTexts("nameLabel")}
											locale={siteLocale}
											localeSwitchDelayMs={110}
										/>
									</ContactsTextClip>
								</div>
								<ContactsTextClip staggerI={nextStagger()} className={styles.fieldClip}>
									<input
										className={styles.input}
										name="name"
										autoComplete="name"
										value={name}
										onChange={(e) => setName(e.target.value)}
									/>
								</ContactsTextClip>
							</label>
							<label className={styles.field}>
								<div className={styles.label}>
									<ContactsTextClip staggerI={nextStagger()}>
										<ContactsLocaleText
											texts={getContactsFieldTexts("contactLabel")}
											locale={siteLocale}
											localeSwitchDelayMs={145}
										/>
									</ContactsTextClip>
								</div>
								<ContactsTextClip staggerI={nextStagger()} className={styles.fieldClip}>
									<input
										className={styles.input}
										name="contact"
										autoComplete="email"
										value={contact}
										onChange={(e) => setContact(e.target.value)}
									/>
								</ContactsTextClip>
							</label>
						</div>

						<label className={styles.field}>
							<div className={styles.label}>
								<ContactsTextClip staggerI={nextStagger()}>
									<ContactsLocaleText
										texts={getContactsFieldTexts("messageLabel")}
										locale={siteLocale}
										localeSwitchDelayMs={180}
									/>
								</ContactsTextClip>
							</div>
							<ContactsTextClip staggerI={nextStagger()} className={styles.fieldClip}>
								<textarea
									className={styles.textarea}
									name="message"
									rows={3}
									value={message}
									onChange={(e) => setMessage(e.target.value)}
								/>
							</ContactsTextClip>
						</label>

						<div className={styles.actions}>
							<button
								type="button"
								className={styles.attach}
								onClick={onAttachClick}
							>
								<ContactsTextClip staggerI={nextStagger()} className={styles.iconClip}>
									<AttachIcon />
								</ContactsTextClip>
								<ContactsTextClip staggerI={nextStagger()}>
									<ContactsLocaleText
										texts={attachTexts}
										locale={siteLocale}
										localeSwitchDelayMs={215}
									/>
								</ContactsTextClip>
							</button>
							<input
								ref={fileRef}
								className={styles.fileInput}
								type="file"
								tabIndex={-1}
								onChange={onFileChange}
							/>
							<button
								type="submit"
								className={styles.submit}
								aria-label={copy.submitAria}
							>
								<ContactsTextClip staggerI={nextStagger()}>
									<ContactsLocaleText
										texts={getContactsFieldTexts("submitLabel")}
										locale={siteLocale}
										localeSwitchDelayMs={250}
									/>
								</ContactsTextClip>
								<ContactsTextClip staggerI={nextStagger()} className={styles.iconClip}>
									<SubmitArrow />
								</ContactsTextClip>
							</button>
						</div>
					</form>

					<section className={styles.channels} aria-label={copy.channelsTitle}>
						<ContactsTextClip staggerI={nextStagger()} className={styles.channelsRuleClip}>
							<div className={styles.channelsRule} aria-hidden="true" />
						</ContactsTextClip>
						<div className={styles.channelsTitle}>
							<ContactsTextClip staggerI={nextStagger()}>
								<ContactsLocaleText
									texts={getContactsFieldTexts("channelsTitle")}
									locale={siteLocale}
									localeSwitchDelayMs={280}
								/>
							</ContactsTextClip>
						</div>
						<div className={styles.channelGrid}>
							{CONTACTS_CHANNELS.map((channel, index) => {
								const labelStagger = nextStagger();
								const valueStagger = nextStagger();
								const copyStagger = nextStagger();
								return (
									<ContactsChannelItem
										key={channel.id}
										channel={channel}
										labelTexts={getContactsChannelLabelTexts(channel.id)}
										locale={siteLocale}
										label={copy.channels[channel.id]}
										copyAria={copy.copyAria}
										copiedAria={copy.copiedAria}
										localeSwitchDelayMs={310 + index * 28}
										labelStaggerI={labelStagger}
										valueStaggerI={valueStagger}
										copyStaggerI={copyStagger}
									/>
								);
							})}
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}

export default memo(ContactsPage);
