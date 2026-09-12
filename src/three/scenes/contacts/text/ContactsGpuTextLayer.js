import * as THREE from "three";
import { GlitchCanvasTextLayer } from "@/components/GlitchText/GlitchCanvasTextLayer.js";
import { createGlitchTextSlots } from "@/components/GlitchText/glitchLetterModel.js";
import { getLetterStartDelay, getSnakeLength, getTotalSnakeDuration, resolveGlitchSnakeTimeScale } from "@/components/GlitchText/glitchSnakeEngine.js";
import { playGlitchTextSound } from "@/sounds/soundDesign.js";
import { createContactsGlyphAtlas } from "./createContactsGlyphAtlas.js";
import { ContactsGpuTextMotion } from "./contactsGpuTextMotion.js";
import { contactsTextVertex, contactsTextFragment } from "./contactsGpuTextShaders.js";

/** Contacts-only GPU implementation of the existing HUD layer lifecycle. */
export class ContactsGpuTextLayer extends GlitchCanvasTextLayer {
	async build(cfg, lineGap = 14, { initialHidden = true } = {}) {
		this.dispose();
		const buildVersion = this._buildVersion;
		this.layerCfg = { ...cfg };
		const slots = createGlitchTextSlots(cfg.text, cfg.uppercase);
		const atlas = await createContactsGlyphAtlas(slots, cfg);
		if (this._buildVersion !== buildVersion) {
			atlas.texture.dispose(); atlas.geometry.dispose();
			throw new DOMException("Contacts text preparation cancelled", "AbortError");
		}
		this.texture = atlas.texture;
		this.geometry = atlas.geometry;
		this._canvasAspect = atlas.width / atlas.height;
		this.layout = { height: cfg.planeHeight ?? 0.3, gapAfter: lineGap };
		this.layout.width = cfg.planeWidth ?? this.layout.height * this._canvasAspect;
		this._opacityDisplay = this._opacityTarget = this._opacityFrom = cfg.opacity ?? 1;
		this._opacityAnimating = false;
		this._splitMeshes = true;
		const shared = {
			map: { value: this.texture }, uCanvasSize: { value: new THREE.Vector2(atlas.width, atlas.height) },
			uPlaneSize: { value: new THREE.Vector2(this.layout.width, this.layout.height) },
			uMode: { value: 0 }, uTime: { value: 0 }, uTiming: { value: new THREE.Vector4() }, uPreview: { value: 0 },
			uMainColor: { value: new THREE.Color(cfg.color ?? "#ffffff") },
			uSnakeColor: { value: new THREE.Color() }, uSnakeBloomBoost: { value: 1 },
		};
		const material = pass => new THREE.ShaderMaterial({
			name: `Contacts GPU text ${pass ? "snake" : "main"}`,
			uniforms: { ...shared, uPass: { value: pass }, opacity: { value: 1 } },
			vertexShader: contactsTextVertex, fragmentShader: contactsTextFragment,
			transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
		});
		this.mainMaterial = material(0); this.snakeMaterial = material(1); this.material = this.snakeMaterial;
		this.mainMesh = new THREE.Mesh(this.geometry, this.mainMaterial);
		this.snakeMesh = new THREE.Mesh(this.geometry, this.snakeMaterial);
		this.mainMesh.frustumCulled = this.snakeMesh.frustumCulled = false;
		this.mainMesh.renderOrder = cfg.renderOrder ?? 999;
		this.snakeMesh.renderOrder = this.mainMesh.renderOrder + 1;
		this.mesh = new THREE.Group(); this.mesh.add(this.mainMesh, this.snakeMesh);
		const meta = { ...cfg.meta, hubProjectIndex: cfg.meta?.projectIndex };
		for (const mesh of [this.mesh, this.mainMesh, this.snakeMesh]) Object.assign(mesh.userData, meta);
		// Retain the full rectangular hit area, including gaps between letters. The
		// static proxy never enters the scene and is resized by matrix, not rebuild.
		this._hitGeometry = new THREE.PlaneGeometry(1, 1);
		const hit = new THREE.Mesh(this._hitGeometry, this.mainMaterial), hitScale = new THREE.Vector3();
		this.mainMesh.raycast = (raycaster, intersects) => {
			hit.matrixWorld.copy(this.mainMesh.matrixWorld).scale(hitScale.set(this.layout.width, this.layout.height, 1));
			const start = intersects.length;
			hit.raycast(raycaster, intersects);
			for (let i = start; i < intersects.length; i++) intersects[i].object = this.mainMesh;
		};
		this.snakeMesh.raycast = () => {};
		const letters = slots.filter(slot => !slot.isSpace), length = getSnakeLength(letters.length);
		const motion = new ContactsGpuTextMotion(shared, slots, options => {
			const timing = { delayBetweenLetters: options.delayBetweenLetters ?? 75,
				delayBetweenSymbols: options.delayBetweenSymbols ?? 50, mainLetterFadeMs: options.mainLetterFadeMs ?? 100 };
			const natural = getTotalSnakeDuration(letters, length, 1, timing);
			const scale = resolveGlitchSnakeTimeScale(natural, options);
			// The last letter is not necessarily the last to finish when replacement counts differ.
			const finish = Math.max(0, ...letters.map((slot, i) => Math.round(getLetterStartDelay(i, length, slot.replacements.length, timing) * scale)
				+ Math.round(slot.replacements.length * timing.delayBetweenSymbols * scale)));
			return { letters: timing.delayBetweenLetters, symbols: timing.delayBetweenSymbols,
				fade: timing.mainLetterFadeMs, scale, duration: getTotalSnakeDuration(letters, length, scale, timing), finish };
		});
		this.motion = motion;
		const setVisible = visible => { motion.setVisible(visible); this.syncPassVisibility(); };
		const runMotion = (mode, options) => {
			const duration = motion.run(mode, options);
			this.syncPassVisibility();
			return duration;
		};
		const assertPreparedCopy = (text, uppercase = cfg.uppercase) => {
			const normalize = value => uppercase !== false ? String(value).toUpperCase() : String(value);
			if (normalize(text) !== normalize(cfg.text)) throw new Error("Contacts text changes must be prepared before Start");
		};
		// Adapter for the shared column: resource-changing Canvas hooks are inert.
		// Only the endpoint flags are exposed as slots; the GPU evaluates letters.
		this.glitchText = {
			options: { text: cfg.text },
			engine: { slots, hasActiveAnimation: () => motion.active, abort: () => setVisible(true) },
			playAppear: timeBudgetMs => runMotion("appear", { timeBudgetMs }),
			playDisappear: timeBudgetMs => runMotion("disappear", { timeBudgetMs }),
			prepareAppear: () => setVisible(false), restoreVisible: () => setVisible(true),
			ensureVisible: () => { if (!motion.active) setVisible(true); },
			runHover: (options = {}) => {
				const duration = runMotion("hover", options);
				if (duration && options.playSound !== false) playGlitchTextSound(duration, "hover", options.soundPan);
				return duration;
			},
			waitForSnakeIdle: () => motion.whenIdle(),
			setMainColor: color => shared.uMainColor.value.set(color),
			setReplacementGlow: () => {}, setDrawOpacity: () => {}, drawInPlace: () => {},
			enterReplacementGlowPreview: () => { shared.uPreview.value = 1; this.syncPassVisibility(); },
			exitReplacementGlowPreview: () => { shared.uPreview.value = 0; this.syncPassVisibility(); },
			cancelLocaleSwitch: () => false,
			setTextForAppear: (text, uppercase) => { assertPreparedCopy(text, uppercase); setVisible(false); },
			// Brand names are identical in all locales; no new bitmap or locale animation is needed.
			switchLocaleWithSnake: (text, { uppercase } = {}) => { assertPreparedCopy(text, uppercase); return Promise.resolve(true); },
			dispose: () => setVisible(false),
		};
		if (initialHidden) motion.setVisible(false);
		this._applyOpacity(); this._syncProjectListBloomUniforms();
		this.syncPassVisibility();
		return this;
	}

	_markTexturesDirty() {} // Static atlas: already uploaded by the full-warm scene draw.
	updateLayerOpacity(now) {
		this.motion?.update(now);
		super.updateLayerOpacity(now);
		this.syncPassVisibility();
	}

	syncPassVisibility() {
		if (!this.snakeMesh) return;
		const u = this.snakeMaterial.uniforms;
		// At either idle endpoint the vertex shader clips every replacement glyph.
		// Keep the prepared pass for motion/DEV preview, but submit no empty idle draw.
		this.snakeMesh.visible = u.uMode.value > 0.5 || u.uPreview.value > 0.5;
	}

	setPlaneHeight(height = 0.3) {
		if (!this.layerCfg || Math.abs(this.layout.height - height) < 0.00001) return false;
		this.layout.height = this.layerCfg.planeHeight = Math.max(0.01, height);
		this.layout.width = this.layerCfg.planeWidth ?? this.layout.height * this._canvasAspect;
		this.mainMaterial.uniforms.uPlaneSize.value.set(this.layout.width, this.layout.height);
		return true;
	}
	dispose() {
		this._buildVersion = (this._buildVersion ?? 0) + 1;
		super.dispose(); this._hitGeometry?.dispose(); this._hitGeometry = null; this.motion = null;
	}
}
