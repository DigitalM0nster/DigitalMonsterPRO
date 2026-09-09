import * as THREE from "three";
import { filmProjects } from "@/pages/portfolio/data/filmProjects.js";
import { getPortfolioLocale } from "@/pages/portfolio/data/portfolioProjectsCopy.js";
import { attachFilmActions } from "@/pages/portfolio/filmInteraction.js";
import { getSceneCarousel } from "../../../render/transition/carouselPage.js";
import { addCarouselWheelDelta } from "../../../render/transition/carouselScroll.js";
import { sceneOwnsHexHitAtClientY } from "../../../render/overlay/hexHitOwnership.js";
import { getHexShaderProgress } from "../../../render/overlay/hexShaderProgress.js";
import { isRingDormantReason } from "../../lifecycle/sceneLifecycle.js";
import { applySceneProgressToCamera } from "../../utils/applySceneProgressToCamera.js";
import { FilmMedia } from "./FilmMedia.js";
import { FilmScreen } from "./FilmScreen.js";
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
		this.hud = new FilmHud(filmProjects);
		this.transitionSound = new FilmTransitionSound();
		this.camera = new THREE.PerspectiveCamera();
		this.raycaster = new THREE.Raycaster();
		this.pointer = new THREE.Vector2();
		this.pointerSmooth = new THREE.Vector2();
		this.layout = getFilmLayout(window.innerWidth / window.innerHeight);
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
			if (this.appStarted && getSceneCarousel().currentId === "portfolioHub") this.act(action);
		});
		this.attachInput();
	}
	async prepare(renderer) {
		await Promise.all([this.media.prepare(renderer), this.transitionSound.prepare()]);
		if (this.disposed) return;
		await this.hud.prepare(renderer);
		if (this.disposed) { this.hud.dispose(); return; }
		this.screen = new FilmScreen(this.media, this.reduced);
		this.screen.uniforms.uDpr.value = renderer.getPixelRatio();
		this.screen.root.add(this.hud.root);
		this.threeScene.add(this.screen.root);
		this.ready = true;
		return true;
	}
	getScene() { return this.threeScene; }
	shouldRender() { return true; }
	shouldKeepUpdating() { return false; }
	getModelsBloomLogoReveal() { return this.warming ? 1 : this.reveal; }
	getModelsGrainBlurConfig() { return { enabled: false }; }
	onViewportResize(width, height) { this.layout = getFilmLayout(width / height); }
	setRouteState(state) {
		const started = this.appStarted;
		this.appStarted = state.appStarted === true;
		this.routeActive = state.currentPage === "/portfolio";
		if (!started && this.appStarted && state.currentPage === "/portfolio") this.playEnterAnimation();
		if (!this.appStarted || state.currentPage !== "/portfolio") {
			this.transitionSound.stop();
			this.cancelScrub();
			this.media.setAllowed(false);
			this.hud.setHover(null);
			this.screen?.controls.setHover(null);
		}
	}
	resetCarouselState({ reason }) {
		if (!isRingDormantReason(reason)) return;
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
	prepareCarouselMixSource() { this.hud.setHover(null); this.screen?.controls.setHover(null); }
	playEnterAnimation() { this.enterPending = false; }
	beginWarmupDraw() { const previous = this.warming; this.warming = true; if (this.screen) this.screen.warming = true; return previous; }
	endWarmupDraw(previous) { this.warming = previous; if (this.screen) this.screen.warming = previous; }
	applyCamera(camera, frame) {
		applySceneProgressToCamera(camera, { position: [0, 0, 10], lookAt: [0, 0, 0], fov: 40, scrollY: 1.2, scrollZ: 0.3 }, frame?.sceneProgress ?? 0);
		camera.updateMatrixWorld();
		this.camera.copy(camera);
	}
	act(action) {
		if (!this.ready) return;
		this.cancelScrub();
		if (action === "inspect") this.focusTarget = 1 - this.focusTarget;
		else if (action === "play") this.media.toggle();
		else if (action === "prev") this.motion.step(-1);
		else if (action === "next") this.motion.step(1);
		else if (typeof action === "number") this.motion.select(action);
	}
	eligible(event) {
		return this.ready && this.appStarted && this.reveal > 0.1
			&& sceneOwnsHexHitAtClientY("portfolioHub", event.clientY)
			&& !(event.target instanceof Element && event.target.closest("a, button, input, textarea, select, [role='button'], [data-scene-dev-panel], [data-canvas-pointer-blocker='true'], [data-site-arc-dom]"));
	}
	hitIntersectionAt(ndc) {
		this.threeScene.updateMatrixWorld(true);
		this.raycaster.setFromCamera(ndc, this.camera);
		const targets = this.hud.hitTargets.filter((mesh) => mesh.userData.enabled);
		for (const target of this.screen.controls.hitTargets) if (target.userData.enabled) targets.push(target);
		targets.push(this.screen.hit);
		const timeline = this.screen.controls.timeline;
		return this.raycaster.intersectObjects(targets, false).find(hit => hit.object !== timeline.hit || timeline.contains(hit.uv)) ?? null;
	}
	hitTargetAt(ndc) { return this.hitIntersectionAt(ndc)?.object ?? null; }
	hitAt(ndc) { return this.hitTargetAt(ndc)?.userData.filmAction ?? null; }
	eventHit(event) {
		this.pointer.set(event.clientX / window.innerWidth * 2 - 1, 1 - event.clientY / window.innerHeight * 2);
		return this.hitAt(this.pointer);
	}
	cancelScrub() {
		if (this.screen) this.screen.controls.timeline.preview = null;
		if (this.press?.action === "seek") this.press = null;
	}
	scrub(event, force = false) {
		const timeline = this.screen.controls.timeline;
		this.pointer.set(event.clientX / window.innerWidth * 2 - 1, 1 - event.clientY / window.innerHeight * 2);
		this.threeScene.updateMatrixWorld(true);
		this.raycaster.setFromCamera(this.pointer, this.camera);
		const hit = this.raycaster.intersectObject(timeline.hit, false)[0];
		if (hit) this.press.ratio = timeline.progressAt(hit.uv);
		if (this.press.ratio == null) return;
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
			if (this.press.action === "seek") this.scrub(event, true);
		};
		this.onMove = (event) => {
			const press = this.press;
			if (!press || press.id !== event.pointerId) return;
			if (press.action === "seek") {
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
			if (press?.id === event.pointerId && press.action === "seek") {
				if (this.eligible(event)) this.scrub(event, true);
				this.cancelScrub();
				return;
			}
			this.press = null;
			if (!press || press.id !== event.pointerId || press.dragged || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8 || !this.eligible(event)) return;
			if (this.eventHit(event) === press.action) this.act(press.action);
		};
		this.onCancel = () => { this.cancelScrub(); this.press = null; };
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
			if (event.target instanceof Element && event.target.closest("input, textarea, select, button, a, [contenteditable='true']")) return;
			if (event.key === "Escape") this.focusTarget = 0;
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
		const visible = current || inMix;
		if (visible && this.enterPending && inMix) this.enterPending = false;
		const ease = 1 - Math.exp(-Math.min(delta, 0.05) * 7);
		if (this.appStarted && !this.enterPending) this.reveal += (1 - this.reveal) * ease;
		this.focus += (this.focusTarget - this.focus) * ease;
		if (!this.warming) this.motion.update(delta);
		this.pointerSmooth.lerp(frame.interactionEnabled && !frame.pointerBlocked ? frame.pointer : { x: 0, y: 0 }, ease);
		const reveal = this.warming ? 1 : this.reveal;
		this.screen.update(this.motion, reveal, this.focus, this.layout, this.pointerSmooth, this.reduced, this.warming ? 0 : delta);
		this.transitionSound.update(delta, this.motion, this.appStarted && this.routeActive && current && !inMix && !this.warming && reveal > .1);
		this.hud.update({ motion: this.motion, reveal, focus: this.focus, layout: this.layout, locale: getPortfolioLocale(), warm: this.warming, delta });
		this.screen.uniforms.uHeaderEnd.value = this.hud.headerEnd;
		this.screen.controls.update({ layout: this.layout, reveal, playing: this.media.playing, video: !!filmProjects[this.motion.index].video, focus: this.focus, reduced: this.reduced, delta, warm: this.warming, progress: this.media.progress, seekable: this.media.seekable && !this.motion.busy, duration: this.media.video.duration });
		const play = this.appStarted && this.routeActive && !this.warming && current && !inMix && !carousel.isInteractionLocked() && !!filmProjects[this.motion.index].video && !this.motion.busy;
		this.media.setAllowed(play);
		if (!this.warming && frame.interactionEnabled && !frame.pointerBlocked && reveal > 0.1) {
			const target = this.hitTargetAt(frame.pointer);
			const hit = target?.userData.filmAction ?? null;
			this.hud.setHover(hit);
			this.screen.controls.setHover(target?.userData.filmControl ? hit : null);
			this.store.cursor.projectListHovered = hit !== null;
		} else { this.hud.setHover(null); this.screen.controls.setHover(null); }
	}
	dispose() {
		this.disposed = true;
		this.detachActions();
		window.removeEventListener("touchmove", this.onTouchMove);
		window.removeEventListener("blur", this.onCancel);
		for (const [type, handler] of [["pointerdown", this.onDown], ["pointermove", this.onMove], ["pointerup", this.onUp], ["pointercancel", this.onCancel], ["keydown", this.onKey]]) window.removeEventListener(type, handler);
		this.media.dispose();
		this.transitionSound.dispose();
		this.hud.dispose();
		this.screen?.dispose();
		this.threeScene.clear();
	}
}
