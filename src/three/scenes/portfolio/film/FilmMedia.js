import * as THREE from "three";
import { getGraphicsTier } from "@/functions/getGraphicsTier.js";

export const nextFilmPaint = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** One video decoder, prepared textures, posters on loading/playback failure. */
export class FilmMedia {
	constructor(projects) {
		this.projects = projects;
		this.posters = [];
		this.disposed = false;
		this.allowed = false;
		this.userPaused = false;
		this.videoReady = false;
		this.playing = false;
		this.video = document.createElement("video");
		Object.assign(this.video, { muted: true, defaultMuted: true, loop: true, playsInline: true, preload: "auto" });
		this.video.setAttribute("playsinline", "");
		this.videoTexture = new THREE.VideoTexture(this.video);
		this.videoTexture.colorSpace = THREE.NoColorSpace;
		this.videoTexture.generateMipmaps = false;
		this._onPlaying = () => { this.playing = true; };
		this._onPause = () => { this.playing = false; };
		this._onError = () => { this.videoReady = false; this.playing = false; };
		this._onVisibility = () => this.syncPlayback();
		this.video.addEventListener("playing", this._onPlaying);
		this.video.addEventListener("pause", this._onPause);
		this.video.addEventListener("error", this._onError);
		document.addEventListener("visibilitychange", this._onVisibility);
	}
	async prepare(renderer) {
		// Attach listeners before assigning src: a cached video can load synchronously.
		const ready = new Promise((resolve) => {
			const finish = () => {
				clearTimeout(timer);
				this.video.removeEventListener("loadeddata", finish);
				this.video.removeEventListener("error", finish);
				this.videoReady = this.video.readyState >= 2;
				resolve();
			};
			const timer = setTimeout(finish, 12000);
			this._finishPrepare = finish;
			this.video.addEventListener("loadeddata", finish);
			this.video.addEventListener("error", finish);
		});
		const film = this.projects.find((project) => project.video);
		if (film) {
			this.video.src = getGraphicsTier() === "low" ? film.videoLow ?? film.video : film.video;
			this.video.load();
		} else this._finishPrepare();
		const loader = new THREE.TextureLoader();
		// Overlap network/decode for the small published film, but upload serially.
		// allSettled also owns textures finishing after another request fails.
		const results = await Promise.allSettled(this.projects.map((project) => loader.loadAsync(project.poster)));
		const failed = results.find((result) => result.status === "rejected");
		if (this.disposed || failed) {
			for (const result of results) if (result.status === "fulfilled") result.value.dispose();
			this._finishPrepare();
			if (failed && !this.disposed) throw failed.reason;
			return;
		}
		this.posters = results.map((result) => result.value);
		for (const texture of this.posters) {
			await nextFilmPaint();
			if (this.disposed) return;
			// All media use one explicit sRGB decode in the film shader, including video.
			texture.colorSpace = THREE.NoColorSpace;
			texture.generateMipmaps = false;
			texture.minFilter = texture.magFilter = THREE.LinearFilter;
			renderer.initTexture(texture);
		}
		await ready;
		if (!this.disposed && this.videoReady) renderer.initTexture(this.videoTexture);
	}
	get(index) {
		return this.projects[index].video && this.videoReady ? this.videoTexture : this.posters[index];
	}
	aspect(index) {
		const source = this.get(index)?.image;
		return (source?.videoWidth || source?.width || 205) / (source?.videoHeight || source?.height || 100);
	}
	setAllowed(allowed) {
		if (allowed === this.allowed) return;
		this.allowed = allowed;
		this.syncPlayback();
	}
	toggle() {
		this.userPaused = this.playBlocked ? false : !this.userPaused;
		this.playBlocked = false;
		this.syncPlayback();
	}
	get seekable() { return this.videoReady && Number.isFinite(this.video.duration) && this.video.duration > 0; }
	get progress() { return this.seekable ? THREE.MathUtils.clamp(this.video.currentTime / this.video.duration, 0, 1) : 0; }
	seek(progress) {
		if (this.disposed || !this.seekable || !Number.isFinite(progress)) return;
		this.video.currentTime = Math.min(this.video.duration - .001, THREE.MathUtils.clamp(progress, 0, 1) * this.video.duration);
	}
	syncPlayback() {
		if (this.disposed) return;
		if (this.allowed && !this.userPaused && !document.hidden && this.videoReady && !this.playBlocked) {
			if (this.video.paused) this.video.play()?.catch((error) => {
				// A normal scene leave can interrupt a pending play promise.
				if (error.name !== "AbortError" && this.allowed && !this.userPaused && !document.hidden) this.playBlocked = true;
			});
		} else this.video.pause();
	}
	dispose() {
		this.disposed = true;
		this._finishPrepare?.();
		document.removeEventListener("visibilitychange", this._onVisibility);
		this.video.removeEventListener("playing", this._onPlaying);
		this.video.removeEventListener("pause", this._onPause);
		this.video.removeEventListener("error", this._onError);
		this.video.pause();
		this.video.removeAttribute("src");
		this.video.load();
		this.videoTexture.dispose();
		this.posters.forEach((texture) => texture.dispose());
	}
}
