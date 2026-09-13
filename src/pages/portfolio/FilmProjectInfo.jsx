import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useSnapshot } from "valtio";
import { store } from "@/app/store.jsx";
import { sceneOwnsHexHitAtClientY } from "@/three/render/overlay/hexHitOwnership.js";
import { registerSceneCanvasInput } from "@/three/interaction/sceneCanvasInput.js";
import { attachFilmInfoView, getFilmUiSnapshot, requestFilmAction, subscribeFilmUi } from "./filmInteraction.js";
import { filmProjects } from "./data/filmProjects.js";
import { filmProjectInfo, filmInfoCopy } from "./data/filmProjectInfo.js";
import styles from "./FilmProjectInfo.module.scss";

/** Optional, non-modal reading surface: navigation and player controls stay available. */
export default function FilmProjectInfo() {
	const state = useSyncExternalStore(subscribeFilmUi, getFilmUiSnapshot);
	const locale = useSnapshot(store).siteLocale || "ru";
	const copy = filmInfoCopy[locale] || filmInfoCopy.en;
	const project = filmProjects[state.index] || filmProjects[0];
	const content = filmProjectInfo[project.id]?.[locale] || filmProjectInfo[project.id]?.en;
	const open = !!state.infoOpen;
	const layer = useRef(null), trigger = useRef(null), card = useRef(null), close = useRef(null);
	const wasOpen = useRef(false), available = useRef(false);
	useEffect(() => attachFilmInfoView(frame => {
		if (!layer.current) return;
		available.current = frame.opacity > .1;
		layer.current.style.opacity = frame.opacity;
		layer.current.style.clipPath = `inset(${frame.clipTop || 0}px 0 ${frame.clipBottom || 0}px)`;
		layer.current.style.visibility = frame.opacity > .001 ? "visible" : "hidden";
		trigger.current.disabled = !available.current;
		if (!Number.isFinite(frame.anchorX)) return;
		trigger.current.style.left = `${frame.anchorX}px`;
		trigger.current.style.top = `${frame.anchorY}px`;
		Object.assign(card.current.style, { left: `${frame.left}px`, top: `${frame.top}px`, width: `${frame.width}px`, maxHeight: `${frame.height}px` });
	}), []);
	useEffect(() => registerSceneCanvasInput({
		reading: true,
		owns: event => !!event.target?.closest?.("[data-film-project-info]") && sceneOwnsHexHitAtClientY("portfolioHub", event.clientY),
	}), []);
	useEffect(() => {
		let focusFrame;
		if (open) { card.current.scrollTop = 0; focusFrame = requestAnimationFrame(() => close.current?.focus({ preventScroll: true })); }
		else if (wasOpen.current && available.current && card.current.contains(document.activeElement)) trigger.current.focus({ preventScroll: true });
		wasOpen.current = open;
		return () => cancelAnimationFrame(focusFrame);
	}, [open]);
	const act = (event, action) => {
		const y = event.detail ? event.clientY : event.currentTarget.getBoundingClientRect().top;
		if (sceneOwnsHexHitAtClientY("portfolioHub", y)) requestFilmAction(action);
	};
	return createPortal(
		<div ref={layer} className={styles.layer}>
			<button ref={trigger} type="button" className={styles.trigger} aria-expanded={open} aria-controls="film-project-info"
				onClick={event => act(event, "info")}>
				{copy.about}<span aria-hidden="true">{open ? "−" : "+"}</span>
			</button>
			<div ref={card} id="film-project-info" role="dialog" aria-modal="false" aria-labelledby="film-info-title"
				aria-hidden={!open} {...(!open ? { inert: "" } : {})} data-film-project-info data-canvas-pointer-blocker="true"
				className={`${styles.card} ${open ? styles.open : ""}`} tabIndex={open ? 0 : -1}
				onTransitionEnd={event => {
					if (open && event.target === event.currentTarget && event.propertyName === "opacity" && document.activeElement === trigger.current)
						close.current.focus({ preventScroll: true });
				}}
				onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); requestFilmAction("info-close"); } }}>
				<header className={styles.header}>
					<div><span className={styles.eyebrow}>{copy.about}</span><h2 id="film-info-title">{project.name}</h2></div>
					<button ref={close} type="button" aria-label={copy.close} onClick={event => act(event, "info-close")}>
						<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
					</button>
				</header>
				{content && <div className={styles.content}>
					<section><h3>{copy.purpose}</h3><p>{content.purpose}</p></section>
					<section><h3>{copy.solution}</h3><p>{content.solution}</p></section>
					{content.result && <section><h3>{copy.result}</h3><p>{content.result}</p></section>}
				</div>}
			</div>
		</div>, document.body,
	);
}
