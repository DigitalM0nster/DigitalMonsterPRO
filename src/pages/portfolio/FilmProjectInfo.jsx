import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useSnapshot } from "valtio";
import { store } from "@/app/store.jsx";
import { sceneOwnsHexHitAtClientY } from "@/three/render/overlay/hexHitOwnership.js";
import { registerSceneCanvasInput } from "@/three/interaction/sceneCanvasInput.js";
import { attachFilmInfoView, getFilmUiSnapshot, requestFilmAction, subscribeFilmUi } from "./filmInteraction.js";
import { filmProjects } from "./data/filmProjects.js";
import { filmProjectInfo, filmInfoCopy, getFilmInfoSections } from "./data/filmProjectInfo.js";
import styles from "./FilmProjectInfo.module.scss";

/** Native scrolling and keyboard semantics only; the visible control is in the scene. */
export default function FilmProjectInfo() {
 const state = useSyncExternalStore(subscribeFilmUi, getFilmUiSnapshot);
 const locale = useSnapshot(store).siteLocale || "ru";
 const copy = filmInfoCopy[locale] || filmInfoCopy.en;
 const project = filmProjects[state.index] || filmProjects[0];
 const content = filmProjectInfo[project.id]?.[locale] || filmProjectInfo[project.id]?.en;
 const open = !!state.infoOpen, readable = !!state.infoVisible;
 const layer = useRef(null), trigger = useRef(null), surface = useRef(null), spacer = useRef(null), rail = useRef(null);
 const railAxis = useRef(null), dragging = useRef(null), readingPress = useRef(null);
 const wasReadable = useRef(false), available = useRef(false);
 const contentRatio = useRef(null);
 useLayoutEffect(() => attachFilmInfoView(frame => {
  const visibleBand = window.innerHeight - (frame.clipTop || 0) - (frame.clipBottom || 0);
  available.current = frame.opacity > .1 && frame.anchorY >= (frame.clipTop || 0) && frame.anchorY <= window.innerHeight - (frame.clipBottom || 0);
  layer.current.style.opacity = frame.opacity;
  layer.current.style.clipPath = `inset(${frame.clipTop || 0}px 0 ${frame.clipBottom || 0}px)`;
  layer.current.style.visibility = frame.opacity > .001 && visibleBand > 1 ? "visible" : "hidden";
  trigger.current.disabled = !available.current;
  trigger.current.hidden = !!frame.mobile;
  if (!Number.isFinite(frame.anchorX)) return;
  trigger.current.style.left = `${frame.anchorX}px`;
  trigger.current.style.top = `${frame.anchorY}px`;
  const ratioChanged = contentRatio.current !== frame.contentRatio;
  const scrollFraction = ratioChanged ? surface.current.scrollTop / Math.max(1, surface.current.scrollHeight - surface.current.clientHeight) : 0;
  Object.assign(surface.current.style, { left: `${frame.left}px`, top: `${frame.top}px`, width: `${frame.width}px`, height: `${frame.height}px` });
  spacer.current.style.height = `${frame.height * frame.contentRatio}px`;
  if (ratioChanged) {
   // Prepared translations have different lengths; keep the native thumb and UV window together.
   surface.current.scrollTop = scrollFraction * Math.max(0, surface.current.scrollHeight - surface.current.clientHeight);
   contentRatio.current = frame.contentRatio;
  }
  const railTop = frame.scrollRailTop, railBottom = frame.scrollRailBottom;
  if (railTop && railBottom) {
   const dx = railBottom.x - railTop.x, dy = railBottom.y - railTop.y;
   const enabled = frame.infoVisible && frame.contentRatio > 1.01;
   railAxis.current = { x: railTop.x, y: railTop.y, dx, dy, length2: dx * dx + dy * dy, enabled,
    thumbSize: Math.max(.04, Math.min(1, 1 / frame.contentRatio)) };
   Object.assign(rail.current.style, { left: `${railTop.x - 16}px`, top: `${railTop.y}px`,
    height: `${Math.hypot(dx, dy)}px`, transform: `rotate(${Math.atan2(-dx, dy)}rad)`, pointerEvents: enabled ? "auto" : "none" });
   rail.current.tabIndex = enabled ? 0 : -1;
   rail.current.setAttribute("aria-hidden", String(!enabled));
   rail.current.setAttribute("aria-valuenow", String(Math.round(frame.scrollProgress * 100)));
  }
 }), []);
 useEffect(() => registerSceneCanvasInput({
  reading: true,
  owns: event => !!event.target?.closest?.("[data-film-project-info]") && sceneOwnsHexHitAtClientY("portfolioHub", event.clientY),
 }), []);
 useEffect(() => {
  const element = rail.current;
  const wheel = event => {
   if (!railAxis.current?.enabled || !sceneOwnsHexHitAtClientY("portfolioHub", event.clientY)) return;
   event.preventDefault(); event.stopPropagation();
   surface.current.scrollTop += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface.current.clientHeight : 1);
  };
  element.addEventListener("wheel", wheel, { passive: false });
  return () => element.removeEventListener("wheel", wheel);
 }, []);
 useEffect(() => {
  if (readable) surface.current.focus({ preventScroll: true });
  else if (wasReadable.current && available.current && (surface.current.contains(document.activeElement) || rail.current.contains(document.activeElement))) {
   const button = trigger.current.hidden ? document.querySelector("[data-film-info-trigger]") : trigger.current;
   button?.focus({ preventScroll: true });
  }
  wasReadable.current = readable;
 }, [readable]);
 useEffect(() => { surface.current.scrollTop = 0; }, [state.infoEpoch, state.index]);
 const act = event => {
  const y = event.detail ? event.clientY : event.currentTarget.getBoundingClientRect().top;
  if (sceneOwnsHexHitAtClientY("portfolioHub", y)) requestFilmAction("info");
 };
 const setRailProgress = event => {
  const axis = railAxis.current;
  if (!axis?.enabled || !sceneOwnsHexHitAtClientY("portfolioHub", event.clientY)) return;
  const along = ((event.clientX - axis.x) * axis.dx + (event.clientY - axis.y) * axis.dy) / Math.max(1, axis.length2);
  const progress = Math.max(0, Math.min(1, (along - (dragging.current?.grab ?? axis.thumbSize / 2)) / Math.max(.001, 1 - axis.thumbSize)));
  surface.current.scrollTop = progress * Math.max(0, surface.current.scrollHeight - surface.current.clientHeight);
 };
 const railDown = event => {
  if (event.button !== 0 || !railAxis.current?.enabled || !sceneOwnsHexHitAtClientY("portfolioHub", event.clientY)) return;
  event.preventDefault(); event.stopPropagation();
  const axis = railAxis.current, el = surface.current;
  const along = ((event.clientX - axis.x) * axis.dx + (event.clientY - axis.y) * axis.dy) / Math.max(1, axis.length2);
  const start = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight) * (1 - axis.thumbSize);
  dragging.current = { id: event.pointerId, grab: along >= start && along <= start + axis.thumbSize ? along - start : axis.thumbSize / 2 };
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.focus({ preventScroll: true }); setRailProgress(event);
 };
 const railMove = event => { if (dragging.current?.id === event.pointerId) { event.stopPropagation(); setRailProgress(event); } };
 const railEnd = event => {
  if (dragging.current?.id !== event.pointerId) return;
  event.stopPropagation(); dragging.current = null;
  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
 };
 const railKey = event => {
  const el = surface.current, step = el.clientHeight * .8;
  if (event.key === "Escape") { event.preventDefault(); requestFilmAction("info-close"); return; }
  const deltas = { ArrowDown: 40, ArrowUp: -40, PageDown: step, PageUp: -step, Home: -el.scrollHeight, End: el.scrollHeight };
  if (event.key in deltas) { event.preventDefault(); event.stopPropagation(); el.scrollTop += deltas[event.key]; }
 };
 const readingDown = event => { readingPress.current = { x: event.clientX, y: event.clientY, scroll: surface.current.scrollTop }; };
 const readingClick = event => {
  const press = readingPress.current; readingPress.current = null;
  if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6 || Math.abs(surface.current.scrollTop - press.scroll) > 2) return;
  if (sceneOwnsHexHitAtClientY("portfolioHub", event.clientY)) requestFilmAction({ type: "reading-click", clientX: event.clientX, clientY: event.clientY });
 };
 return createPortal(
  <div ref={layer} className={styles.layer}>
   <button ref={trigger} type="button" className={styles.accessibleText} aria-expanded={open} aria-controls="film-project-info" onClick={act}
    onFocus={event => requestFilmAction({ type: "info-focus", value: event.currentTarget.matches(":focus-visible") })}
    onBlur={() => requestFilmAction({ type: "info-focus", value: false })}>
    {open ? copy.back : copy.about}
   </button>
   <div ref={surface} id="film-project-info" role="region" aria-label={`${copy.about}: ${project.name}`}
    aria-hidden={!readable} {...(!readable ? { inert: "" } : {})} data-film-project-info data-canvas-pointer-blocker="true"
    className={`${styles.surface} ${readable ? styles.readable : ""}`} tabIndex={readable ? 0 : -1}
    onPointerDown={readingDown} onPointerCancel={() => { readingPress.current = null; }} onClick={readingClick}
    onScroll={event => {
     const el = event.currentTarget;
     requestFilmAction({ type: "info-scroll", value: el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight) });
    }}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); requestFilmAction("info-close"); } }}>
    <div ref={spacer} aria-hidden="true" />
    <div className={styles.accessibleText}>
     <h2>{project.name}</h2>
     <h3>{content?.introLabel || copy.purpose}</h3><p>{content?.purpose}</p>
     {getFilmInfoSections(content, copy).map(section => <section key={section.title}><h3>{section.title}</h3><p>{section.body}</p></section>)}
     {content?.closing && <p>{content.closing}</p>}
    </div>
   </div>
   <div ref={rail} className={styles.scrollRail} role="scrollbar" aria-label={copy.scroll}
    aria-controls="film-project-info" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}
    tabIndex={-1} data-film-project-info data-canvas-pointer-blocker="true"
    onPointerDown={railDown} onPointerMove={railMove} onPointerUp={railEnd} onPointerCancel={railEnd} onKeyDown={railKey}
    onFocus={() => requestFilmAction({ type: "info-scroll-focus", value: true })}
    onBlur={() => requestFilmAction({ type: "info-scroll-focus", value: false })} />
  </div>, document.body,
 );
}
