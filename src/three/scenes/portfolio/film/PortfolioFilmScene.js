import { getScenePixelRatio } from "@/three/renderer/renderResolution.js";
import { getGraphicsTier } from "@/functions/getGraphicsTier.js";
import * as THREE from "three";
import { filmProjects } from "@/pages/portfolio/data/filmProjects.js";
import { getPortfolioLocale } from "@/pages/portfolio/data/portfolioProjectsCopy.js";
import { attachFilmActions, publishFilmUi, getFilmUiSnapshot, updateFilmInfoView } from "@/pages/portfolio/filmInteraction.js";
import { resolveFilmInfoPresentation, resolveFilmPresentation } from "@/pages/portfolio/filmPresentationLayout.js";
import { filmSurfacePoint } from "./filmSurface.js";
import { getSceneCarousel } from "../../../render/transition/carouselPage.js";
import { addCarouselWheelDelta } from "../../../render/transition/carouselScroll.js";
import { sceneOwnsHexHitAtClientY } from "../../../render/overlay/hexHitOwnership.js";
import { getHexShaderProgress, getHexRevealFromTop } from "../../../render/overlay/hexShaderProgress.js";
import { isRingDormantReason } from "../../lifecycle/sceneLifecycle.js";
import { applySceneProgressToCamera } from "../../utils/applySceneProgressToCamera.js";
import { FilmMedia } from "./FilmMedia.js";
import { FilmScreen } from "./FilmScreen.js";
import { FilmInfoTextures } from "./FilmInfoTextures.js";
import { FilmHud } from "./FilmHud.js";
import { FilmTransitionSound } from "./FilmTransitionSound.js";
import { FilmMotion, getFilmLayout } from "./filmMotion.js";

export class PortfolioFilmScene {
	constructor(renderer, store) {
		this.store = store;
		this.threeScene = new THREE.Scene();
		this.threeScene.name = "Portfolio / Digital film";
		this.motion = new FilmMotion(filmProjects.length);
		this.media = new FilmMedia(filmProjects);
		this.infoTextures = new FilmInfoTextures(filmProjects);
		this.hud = new FilmHud(filmProjects);
		this.transitionSound = new FilmTransitionSound();
		this.camera = new THREE.PerspectiveCamera();
		this.raycaster = new THREE.Raycaster();
		this.pointer = new THREE.Vector2();
		this.pointerSmooth = new THREE.Vector2();
		this.pointerSeen = false;
		this.infoOpen = false;
		this.infoEpoch = 0;
		this.infoPoint = new THREE.Vector3();
		this.onViewportResize(window.innerWidth, window.innerHeight);
		this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		this.reveal = 0;
		this.focus = 0;
		this.focusTarget = 0;
		this.enterPending = true;
		this.appStarted = false;
		this.warming = false;
		this.ready = false;
		this.disposed = false;
		this.readyPromise = this.prepare(renderer);
		this.detachActions = attachFilmActions((action) => {
			const carousel = getSceneCarousel();
			const { sourceId, targetId } = carousel.getMixSourceTargetIds();
			// DOM callers already gate the event's Y band. The incoming screen must
			// not wait for the HTML route commit to accept its own visible button.
			if (this.appStarted && (carousel.currentId === "portfolioHub" ||
				(getHexShaderProgress() > .001 && [sourceId, targetId].includes("portfolioHub")))) this.act(action);
		});
		this.attachInput();
	}
	async prepare(renderer) {
		await Promise.all([this.media.prepare(renderer), this.transitionSound.prepare()]);
		if (this.disposed) return;
		await this.hud.prepare(renderer,this.media.posters);
		if (this.disposed) { this.hud.dispose(); return; }
		await this.infoTextures.prepare(renderer);
		if (this.disposed) return;
		this.screen = new FilmScreen(this.media, this.reduced, this.infoTextures);
		// Both viewing modes share the optical frame, above the opaque project selector.
		this.screen.frame.renderOrder = 29;
		this.screen.uniforms.uDpr.value = getScenePixelRatio(renderer);
		this.screen.root.add(this.hud.root);
		this.threeScene.add(this.screen.root);
		const tier = getGraphicsTier();
		if (tier === "medium" || tier === "low") this.threeScene.traverse(object => {
			if (object.material?.isShaderMaterial) {
				object.material.defines[tier === "low" ? "FILM_LOW" : "FILM_MEDIUM"] = 1;
				object.material.extensions.derivatives = true;
				object.material.needsUpdate = true;
			}
		});
		if (tier === "low") {
			// Keep halo coverage: default additive blending squares its alpha.
			Object.assign(this.screen.frameMaterial, { blending: THREE.CustomBlending,
				blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
				blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
		}
		this.ready = true;
		return true;
	}
	getScene() { return this.threeScene; }
	shouldRender() { return true; }
	shouldKeepUpdating() { return false; }
	getModelsBloomLogoReveal() { return this.warming ? 1 : this.reveal; }
	getModelsGrainBlurConfig() { return { enabled: false }; }
	onViewportResize(width, height) {
  this.layout = getFilmLayout(width / height, width, height);
  const reading = resolveFilmPresentation(width, height, 1);
  const viewHeight = this.layout.viewWidth / (width / height);
  this.readingLayout = reading ? {
   y: (.5 - (reading.screen.top + reading.screen.bottom) / 2 / height) * viewHeight,
   height: (reading.screen.bottom - reading.screen.top) / height * viewHeight,
  } : null;
 }
	setRouteState(state) {
		const started = this.appStarted;
		this.appStarted = state.appStarted === true;
		this.routeActive = state.currentPage === "/portfolio";
		if (!started && this.appStarted && state.currentPage === "/portfolio") this.playEnterAnimation();
		if (!this.appStarted || state.currentPage !== "/portfolio") {
			this.setInfoOpen(false);
			this.pointerSeen = false;
			this.hud.picker?.close();
			this.transitionSound.stop();
			this.cancelScrub();
			this.media.setAllowed(false);
			this.hud.setHover(null);
			this.hud.setInfoFocus(false);
			this.screen?.controls.setHover(null);
		}
	}
	resetCarouselState({ reason }) {
		if (!isRingDormantReason(reason)) return;
		this.setInfoOpen(false);
		this.hud.picker?.close();
		this.transitionSound.stop();
		this.cancelScrub();
		this.enterPending = true;
		this.reveal = 0;
		this.focus = this.focusTarget = 0;
		this.media.setAllowed(false);
		this.hud.setHover(null);
		this.screen?.controls.setHover(null);
	}
	prepareCarouselMixTarget() { this.enterPending = false; }
	prepareCarouselMixSource() { this.setInfoOpen(false); this.hud.picker?.close(); this.hud.setHover(null); this.screen?.controls.setHover(null); }
	playEnterAnimation() { this.enterPending = false; }
	beginWarmupDraw() { const previous = this.warming; this.warming = true; if (this.screen) this.screen.warming = true; return previous; }
	endWarmupDraw(previous) { this.warming = previous; if (this.screen) this.screen.warming = previous; }
	applyCamera(camera, frame) {
		applySceneProgressToCamera(camera, { position: [0, 0, 10], lookAt: [0, 0, 0], fov: 40, scrollY: 1.2, scrollZ: 0.3 }, frame?.sceneProgress ?? 0);
		camera.updateMatrixWorld();
		this.camera.copy(camera);
	}
	setInfoOpen(open, animate = true) {
		if (open === this.infoOpen) return;
		this.infoOpen = open;
		if (open) {
			this.focusTarget = 1;
			this.hud.picker.close(); this.cancelScrub(); this.media.setAllowed(false);
			this.infoResetPending = true;
		}
		if (animate) this.motion.showInfo(open);
		publishFilmUi({ ...getFilmUiSnapshot(), index: this.motion.index, infoOpen: open });
	}
	act(action) {
		if (!this.ready) return;
		if (action === "fullscreen") { this.media.openFullscreen(); return; }
		if (action?.type === "reading-click") {
			const hit = this.eventHit(action);
			this.act(hit === "projects" || typeof hit === "number" ? hit : "inspect");
			return;
		}
		if (action?.type === "info-focus") { this.hud.setInfoFocus(action.value === true); return; }
		if (action?.type === "info-scroll-focus") { this.screen.scrollFocused = action.value === true; return; }
		if (action === "info-close") { this.setInfoOpen(false); return; }
		if (action === "info") {
			this.setInfoOpen(!this.infoOpen);
			return;
		}
		if (action?.type === "info-scroll") {
			if (this.motion.info && !this.motion.busy && Number.isFinite(action.value)) this.screen.infoScroll = THREE.MathUtils.clamp(action.value, 0, 1);
			return;
		}
		if (this.infoOpen && action === "play") {
			this.setInfoOpen(false);
			if (this.media.active?.paused) this.media.toggle();
			return;
		}
		if (typeof action === "object" && action?.type === "seek") { this.media.seek(action.progress); return; }
		if (typeof action === "object" && action?.type === "volume") { this.media.setVolume(action.value); return; }
		if (action === "projects") { this.hud.picker.state.toggle(); return; }
		if (action === "projects-open") { this.hud.picker.state.open(); return; }
		if (action === "project-picker") return;
		if (action === "inspect" && this.hud.picker.state.progress > .1) { this.hud.picker.close(); return; }
		this.hud.picker.close();
		this.cancelScrub();
		if (action === "inspect") this.focusTarget = 1 - this.focusTarget;
		else if (action === "play") this.media.toggle();
		else if (action === "mute") this.media.toggleMute();
		else if (action === "volume-up" || action === "volume-down") this.media.setVolume(this.media.volumeLevel + (action === "volume-up" ? .05 : -.05));
		else if (action === "prev") this.motion.step(-1);
		else if (action === "next") this.motion.step(1);
		else if (typeof action === "number") this.motion.select(action);
		// Keyboard and touch users can start the same one-time rise by opening/playing.
		if ((action === "play" || action === "inspect") && this.store.soundsActive) this.media.revealSound();
	}
	eligible(event) {
		return this.ready && this.appStarted && this.reveal > 0.1
			&& sceneOwnsHexHitAtClientY("portfolioHub", event.clientY)
			&& !(event.target instanceof Element && event.target.closest("a, button, input, textarea, select, [role='button'], [data-scene-dev-panel], [data-canvas-pointer-blocker='true'], [data-site-arc-dom]"));
	}
	hitIntersectionAt(ndc) {
		this.threeScene.updateMatrixWorld(true);
		this.raycaster.setFromCamera(ndc, this.camera);
		const targets = this.layout.mobile ? [] : this.hud.hitTargets.filter((mesh) => mesh.userData.enabled);
		if (!this.layout.mobile) for (const target of this.screen.controls.hitTargets) if (target.userData.enabled) targets.push(target);
		targets.push(this.screen.hit);
		const timeline = this.screen.controls.timeline;
		const volume = this.screen.controls.volume;
		const hits = this.raycaster.intersectObjects(targets, false);
		return hits.find(hit => hit.object.userData.filmPicker && hit.object !== this.hud.picker.panelHit)
			?? hits.find(hit => hit.object.userData.filmPicker)
			?? hits.find(hit => {
				if (hit.object === timeline.hit) return timeline.contains(hit.uv);
				if (volume.hits.includes(hit.object)) return volume.contains(hit.uv,hit.object.userData.filmAction);
				return true;
			}) ?? null;
	}
	hitTargetAt(ndc) { return this.hitIntersectionAt(ndc)?.object ?? null; }
	hitAt(ndc) { return this.hitTargetAt(ndc)?.userData.filmAction ?? null; }
	eventHit(event) {
		this.pointer.set(event.clientX / window.innerWidth * 2 - 1, 1 - event.clientY / window.innerHeight * 2);
		return this.hitAt(this.pointer);
	}
	cancelScrub() {
		if (this.screen) this.screen.controls.timeline.preview = null;
		if (this.press?.action === "seek" || this.press?.action === "volume") this.press = null;
	}
	scrub(event, force = false) {
		const changingVolume = this.press?.action === "volume";
		const timeline = changingVolume ? this.screen.controls.volume : this.screen.controls.timeline;
		this.pointer.set(event.clientX / window.innerWidth * 2 - 1, 1 - event.clientY / window.innerHeight * 2);
		this.threeScene.updateMatrixWorld(true);
		this.raycaster.setFromCamera(this.pointer, this.camera);
		const hit = this.raycaster.intersectObject(timeline.hit, false)[0];
		if (hit) this.press.ratio = timeline.progressAt(hit.uv);
		if (this.press.ratio == null) return;
		if (changingVolume) { this.media.setVolume(this.press.ratio); return; }
		timeline.preview = this.press.ratio;
		const now = performance.now();
		// The light marker follows every pointer event; decoding seeks are capped at 10 Hz.
		if (force || now - (this.lastSeekAt ?? 0) >= 100) {
			this.media.seek(this.press.ratio);
			this.lastSeekAt = now;
		}
	}
	attachInput() {
		this.onDown = (event) => {
			if (event.button !== 0 || !this.eligible(event)) return;
			this.press = { id: event.pointerId, x: event.clientX, y: event.clientY, lastY: event.clientY, action: this.eventHit(event), dragged: false, touch: event.pointerType === "touch" };
			if (this.press.action === "seek" || this.press.action === "volume") this.scrub(event, true);
		};
		this.onMove = (event) => {
			if (event.pointerType !== "touch" && this.appStarted && this.routeActive) this.pointerSeen = true;
			const press = this.press;
			if (!press || press.id !== event.pointerId) return;
			if (press.action === "seek" || press.action === "volume") {
				if (this.eligible(event)) this.scrub(event);
				return;
			}
			if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) press.dragged = true;
			if (press.touch && press.dragged && this.eligible(event)) {
				const delta = (press.lastY - event.clientY) * 3;
				// Vertical swipes navigate site scenes, just like the site wheel listener.
				addCarouselWheelDelta(delta);
			}
			press.lastY = event.clientY;
		};
		this.onUp = (event) => {
			const press = this.press;
			if (press?.id === event.pointerId && (press.action === "seek" || press.action === "volume")) {
				if (this.eligible(event)) this.scrub(event, true);
				this.cancelScrub();
				return;
			}
			this.press = null;
			if (!press || press.id !== event.pointerId || press.dragged || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8 || !this.eligible(event)) return;
			if (this.eventHit(event) === press.action) this.act(press.action);
		};
		this.onCancel = () => { this.cancelScrub(); this.press = null; this.pointerSeen = false; };
		// Preserve the pointer-driven swipe instead of letting native page pan cancel it.
		// This listener never drives progress; the existing pointer handler owns it.
		this.onTouchMove = (event) => {
			const touch = event.touches[0];
			if (this.press?.touch && touch && this.eligible({ target: event.target, clientY: touch.clientY })) event.preventDefault();
		};
		window.addEventListener("touchmove", this.onTouchMove, { passive: false });
		window.addEventListener("blur", this.onCancel);
		this.onKey = (event) => {
			if (!this.appStarted || getSceneCarousel().currentId !== "portfolioHub" || getSceneCarousel().isInteractionLocked()) return;
			if (event.key === "Escape") { if (this.infoOpen) { this.setInfoOpen(false); return; } this.hud.picker.close(); this.focusTarget = 0; return; }
			if (event.target instanceof Element && event.target.closest("input, textarea, select, button, a, [contenteditable='true'], [role='dialog']")) return;
			if (event.key.toLowerCase() === "m" && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); this.media.toggleMute(); return; }
			if ((event.key === "ArrowUp" || event.key === "ArrowDown") && ["volume", "mute"].includes(this.screen.controls.hovered)) {
				event.preventDefault(); this.media.setVolume(this.media.volumeLevel + (event.key === "ArrowUp" ? .05 : -.05)); return;
			}
			if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
				event.preventDefault();
				this.act(event.key === "ArrowRight" ? "next" : "prev");
			}
		};
		for (const [type, handler] of [["pointerdown", this.onDown], ["pointermove", this.onMove], ["pointerup", this.onUp], ["pointercancel", this.onCancel], ["keydown", this.onKey]]) window.addEventListener(type, handler);
	}
	update(delta, frame) {
		if (!this.ready) return;
		const carousel = getSceneCarousel();
		const current = carousel.currentId === "portfolioHub";
		const inMix = getHexShaderProgress() > 0.001;
		if (!current && !(inMix && carousel.getMixSourceTargetIds().targetId === "portfolioHub")) this.setInfoOpen(false);
		const visible = current || inMix;
		if (visible && this.enterPending && inMix) this.enterPending = false;
		const ease = 1 - Math.exp(-Math.min(delta, 0.05) * 7);
		if (this.appStarted && !this.enterPending) this.reveal += (1 - this.reveal) * ease;
		this.focus += (this.focusTarget - this.focus) * ease;
		if (this.appStarted && this.routeActive && current && !inMix && !this.warming && !this.motion.busy && !this.infoOpen && !this.motion.info && !this.hud.picker.state.pinned && this.media.consumeEnded()) {
			this.media.restart((this.motion.index + 1) % filmProjects.length);
			this.motion.step(1);
		}
		if (!this.warming) this.motion.update(delta);
		// Reset only once the outgoing reading texture is gone, including queued reopen.
		if (this.infoResetPending && !this.motion.info && this.motion.destinationInfo) {
			this.screen.infoScroll = 0; this.infoEpoch++; this.infoResetPending = false;
		}
		if (this.media.index !== this.motion.index) { this.screen.infoScroll = 0; this.infoEpoch++; }
		this.media.select(this.motion.index);
		this.pointerSmooth.lerp(frame.visualPointer ?? (frame.interactionEnabled && !frame.pointerBlocked ? frame.pointer : { x: 0, y: 0 }), ease);
		const reveal = this.warming ? 1 : this.reveal;
		this.screen.update(this.motion, reveal, this.focus, this.layout, this.pointerSmooth, this.reduced, this.warming ? 0 : delta, getPortfolioLocale(), this.readingLayout);
		this.transitionSound.update(delta, this.motion, this.appStarted && this.routeActive && current && !inMix && !this.warming && reveal > .1);
		this.hud.update({ motion: this.motion, reveal, focus: this.focus, layout: this.layout, locale: getPortfolioLocale(), infoOpen: this.infoOpen, warm: this.warming, delta, reduced: this.reduced,
			textActive: this.appStarted && visible, soundEnabled: this.appStarted && this.routeActive && current && !inMix && !this.warming && !this.layout.mobile });
		this.hud.root.visible = !this.layout.mobile;
		this.screen.uniforms.uHeaderEnd.value = this.hud.headerEnd;
		const play = this.appStarted && this.routeActive && !this.warming && current && !inMix && !carousel.isInteractionLocked() && !!filmProjects[this.motion.index].video && !this.motion.busy;
		this.media.setAllowed(play && !this.hud.picker.state.pinned && !this.infoOpen && !this.motion.info);
		if (!this.warming && frame.interactionEnabled && !frame.pointerBlocked && reveal > 0.1) {
			const target = this.hitTargetAt(frame.pointer);
			const hit = target?.userData.filmAction ?? null;
			if (this.pointerSeen && this.store.soundsActive && (target === this.screen.hit || target?.userData.filmControl)) this.media.revealSound();
			this.hud.setHover(hit);
			this.screen.controls.setHover(target?.userData.filmControl ? hit : null);
			this.store.cursor.projectListHovered = hit !== null;
		} else { this.hud.setHover(null); this.screen.controls.setHover(null); }
		this.media.updateSound(delta, this.store.soundsActive);
		const infoAmount = THREE.MathUtils.lerp(Number(this.motion.info), Number(this.motion.destinationInfo), Math.abs(this.motion.progress));
		this.screen.controls.update({ layout: this.layout, reveal: reveal * (1 - infoAmount), playing: this.media.playing, video: !!filmProjects[this.motion.index].video, focus: this.focus, reduced: this.reduced, delta, warm: this.warming, progress: this.media.progress, seekable: this.media.seekable && !this.motion.busy, duration: this.media.video?.duration, volume: this.media.volumeLevel, muted: !this.store.soundsActive || this.media.volumeLevel === 0 });
		this.screen.controls.root.visible = !this.layout.mobile;
		if (!this.warming) this.updateInfoView(current, inMix);
		if (this.layout.mobile && !this.warming && current) {
			this._uiElapsed = (this._uiElapsed ?? 0) + delta;
			if (this._uiElapsed >= .25) {
				this._uiElapsed = 0;
				publishFilmUi({ ...getFilmUiSnapshot(), index: this.motion.index, playing: this.media.playing, progress: Math.round(this.media.progress * 1000) / 1000, muted: this.media.volumeLevel === 0,
					volume: Math.round(this.media.volumeLevel * 100) / 100, focused: this.focusTarget > .5, seekable: this.media.seekable && !this.motion.busy });
			}
		}
	}
	updateInfoView(current, inMix) {
		const width = window.innerWidth, height = window.innerHeight;
		const project = (x, y, surface = this.screen.art) => {
			this.infoPoint.set(...(this.layout.mobile ? [x, y, .025] : filmSurfacePoint(x, y, .025)));
			surface.localToWorld(this.infoPoint); this.infoPoint.project(this.camera);
			return { x: (this.infoPoint.x + 1) * width / 2, y: (1 - this.infoPoint.y) * height / 2 };
		};
		const left = project(-.49, 0), right = project(.49, 0), top = project(0, (.5 - this.screen.infoInset) / 2.05), bottom = project(0, -.5 / 2.05), anchor = project(0, this.hud.infoY, this.screen.root);
		const box = resolveFilmInfoPresentation(width, height, { left: left.x, right: right.x, top: top.y, bottom: bottom.y, anchorX: anchor.x, anchorY: anchor.y }, this.screen.infoAmount);
		const { sourceId, targetId } = getSceneCarousel().getMixSourceTargetIds();
		let clipTop = 0, clipBottom = 0;
		if (inMix) {
			const p = getHexShaderProgress(), fromTop = getHexRevealFromTop(), source = sourceId === "portfolioHub";
			if (source ? fromTop : !fromTop) clipTop = (source ? p : 1 - p) * height;
			else clipBottom = (source ? p : 1 - p) * height;
		}
		const belongs = current || (inMix && [sourceId, targetId].includes("portfolioHub"));
		const info = this.infoTextures.get(this.motion.index, getPortfolioLocale(), this.layout.mobile);
		const infoVisible = this.motion.info && !this.motion.busy && this.hud.picker.state.progress <= .08;
		updateFilmInfoView({ ...box, left: left.x, top: top.y, width: right.x - left.x, height: bottom.y - top.y,
			scrollRailTop: project(.476, .230), scrollRailBottom: project(.476, -.230), scrollProgress: this.screen.infoScroll,
			contentRatio: Math.max(1, info.height / (info.viewportHeight * this.screen.infoViewportScale)), infoVisible, clipTop, clipBottom, mobile: this.layout.mobile,
			opacity: this.appStarted && belongs ? this.reveal : 0 });
		const snapshot = getFilmUiSnapshot();
		if (snapshot.index !== this.motion.index || snapshot.infoOpen !== this.infoOpen || snapshot.infoVisible !== infoVisible || snapshot.infoEpoch !== this.infoEpoch)
			publishFilmUi({ ...snapshot, index: this.motion.index, infoOpen: this.infoOpen, infoVisible, infoEpoch: this.infoEpoch });
	}
	dispose() {
		this.setInfoOpen(false);
		updateFilmInfoView({ opacity: 0 });
		this.disposed = true;
		this.detachActions();
		window.removeEventListener("touchmove", this.onTouchMove);
		window.removeEventListener("blur", this.onCancel);
		for (const [type, handler] of [["pointerdown", this.onDown], ["pointermove", this.onMove], ["pointerup", this.onUp], ["pointercancel", this.onCancel], ["keydown", this.onKey]]) window.removeEventListener(type, handler);
		this.media.dispose();
		this.infoTextures.dispose();
		this.transitionSound.dispose();
		this.hud.dispose();
		this.screen?.dispose();
		this.threeScene.clear();
	}
}
