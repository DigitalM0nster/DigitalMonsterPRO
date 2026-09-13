import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useSnapshot } from "valtio";
import { store } from "@/app/store.jsx";
import { sceneOwnsHexHitAtClientY } from "@/three/render/overlay/hexHitOwnership.js";
import { registerSceneCanvasInput } from "@/three/interaction/sceneCanvasInput.js";
import { attachFilmInfoView, getFilmUiSnapshot, requestFilmAction, subscribeFilmUi } from "./filmInteraction.js";
import { filmProjects } from "./data/filmProjects.js";
import { filmProjectInfo, filmInfoCopy } from "./data/filmProjectInfo.js";
import styles from "./FilmProjectInfo.module.scss";

const controlsCopy = {
 ru: { back: "К видео", scroll: "Прокрутите, чтобы прочитать ↓" },
 en: { back: "Back to video", scroll: "Scroll to read ↓" },
 zh: { back: "返回视频", scroll: "向下滚动阅读 ↓" },
};

/** Persistent scene chrome + native scrolling/accessibility for the prepared GPU text. */
export default function FilmProjectInfo() {
 const state = useSyncExternalStore(subscribeFilmUi, getFilmUiSnapshot);
 const locale = useSnapshot(store).siteLocale || "ru";
 const copy = filmInfoCopy[locale] || filmInfoCopy.en;
 const labels = controlsCopy[locale] || controlsCopy.en;
 const project = filmProjects[state.index] || filmProjects[0];
 const content = filmProjectInfo[project.id]?.[locale] || filmProjectInfo[project.id]?.en;
 const open = !!state.infoOpen, readable = !!state.infoVisible;
 const layer = useRef(null), trigger = useRef(null), surface = useRef(null), spacer = useRef(null), hint = useRef(null);
 const wasReadable = useRef(false), available = useRef(false);
 useLayoutEffect(() => attachFilmInfoView(frame => {
  const visibleBand = window.innerHeight - (frame.clipTop || 0) - (frame.clipBottom || 0);
  available.current = frame.opacity > .1 && frame.anchorY >= (frame.clipTop || 0) && frame.anchorY <= window.innerHeight - (frame.clipBottom || 0);
  layer.current.style.opacity = frame.opacity;
  layer.current.style.clipPath = `inset(${frame.clipTop || 0}px 0 ${frame.clipBottom || 0}px)`;
  layer.current.style.visibility = frame.opacity > .001 && visibleBand > 1 ? "visible" : "hidden";
  trigger.current.disabled = !available.current;
  if (!Number.isFinite(frame.anchorX)) return;
  trigger.current.style.left = `${frame.anchorX}px`;
  trigger.current.style.top = `${frame.anchorY}px`;
  Object.assign(surface.current.style, { left: `${frame.left}px`, top: `${frame.top}px`, width: `${frame.width}px`, height: `${frame.height}px` });
  spacer.current.style.height = `${frame.height * frame.contentRatio}px`;
  Object.assign(hint.current.style, { left: `${frame.left + frame.width / 2}px`, top: `${frame.top + frame.height + 6}px`,
   visibility: frame.infoVisible && frame.contentRatio > 1.01 && surface.current.scrollTop < surface.current.scrollHeight - surface.current.clientHeight - 4 ? "visible" : "hidden" });
 }), []);
 useEffect(() => registerSceneCanvasInput({
  reading: true,
  owns: event => !!event.target?.closest?.("[data-film-project-info]") && sceneOwnsHexHitAtClientY("portfolioHub", event.clientY),
 }), []);
 useEffect(() => {
  if (readable) surface.current.focus({ preventScroll: true });
  else if (wasReadable.current && available.current && surface.current.contains(document.activeElement)) trigger.current.focus({ preventScroll: true });
  wasReadable.current = readable;
 }, [readable]);
 useEffect(() => { surface.current.scrollTop = 0; }, [state.infoEpoch, state.index]);
 const act = event => {
  const y = event.detail ? event.clientY : event.currentTarget.getBoundingClientRect().top;
  if (sceneOwnsHexHitAtClientY("portfolioHub", y)) requestFilmAction("info");
 };
 return createPortal(
  <div ref={layer} className={styles.layer}>
   <button ref={trigger} type="button" className={styles.trigger} aria-expanded={open} aria-controls="film-project-info" onClick={act}>
    {open ? labels.back : copy.about}<svg viewBox="0 0 24 16" aria-hidden="true"><path d={open ? "M22 8H2m6-6L2 8l6 6" : "M2 8h20m-6-6 6 6-6 6"} /></svg>
   </button>
   <div ref={surface} id="film-project-info" role="region" aria-label={`${copy.about}: ${project.name}`}
    aria-hidden={!readable} {...(!readable ? { inert: "" } : {})} data-film-project-info data-canvas-pointer-blocker="true"
    className={`${styles.surface} ${readable ? styles.readable : ""}`} tabIndex={readable ? 0 : -1}
    onScroll={event => {
     const el = event.currentTarget;
     requestFilmAction({ type: "info-scroll", value: el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight) });
    }}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); requestFilmAction("info-close"); } }}>
    <div ref={spacer} aria-hidden="true" />
    <div className={styles.accessibleText}>
     <h2>{project.name}</h2>
     <h3>{copy.purpose}</h3><p>{content?.purpose}</p>
     <h3>{copy.solution}</h3><p>{content?.solution}</p>
     {content?.result && <><h3>{copy.result}</h3><p>{content.result}</p></>}
    </div>
   </div>
   <span ref={hint} className={styles.hint} aria-hidden="true">{labels.scroll}</span>
  </div>, document.body,
 );
}
