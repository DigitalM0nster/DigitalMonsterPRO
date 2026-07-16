import * as THREE from "three";
import { applySceneProgressToCamera } from "../utils/applySceneProgressToCamera.js";
import {
	ABOUT_COLORS,
	ABOUT_IDLE,
	ABOUT_LAYOUT,
	ABOUT_LIGHTS,
	ABOUT_PARALLAX,
} from "./aboutSceneConfig.js";
import { sampleScrollTimeline } from "./ScrollTimeline.js";
import { createLogoAssembly } from "./LogoAssembly.js";
import { createNetworkLayer } from "./NetworkLayer.js";
import { createEnergyStreams } from "./EnergyStreams.js";
import { createGroundEffects } from "./GroundEffects.js";

const ABOUT_PATH = "/about";
const CAMERA_SCROLL_DISTANCE = 0.85;

function isAboutPath(pathname) {
	return (String(pathname ?? "/").replace(/\/+$/, "") || "/") === ABOUT_PATH;
}

function finiteOrNull(value) {
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

/**
 * About WebGL scene: one persistent procedural monolith driven by
 * store.aboutExperience progress (0…1). No DOM text, no per-frame textures.
 *
 * Public lifecycle: constructor ≈ init, setProgress via store, resize, dispose.
 */
export class AboutScene {
	constructor(store) {
		this.store = store;
		this.threeScene = new THREE.Scene();
		this.threeScene.background = null;

		this.root = new THREE.Group();
		this.motionRoot = new THREE.Group();
		this.root.add(this.motionRoot);
		this.threeScene.add(this.root);

		this._heldProgress = 0;
		this._lifecycleProgressOverride = null;
		this._lastAppliedProgress = Number.NaN;
		this._motion = sampleScrollTimeline(0);
		this._elapsed = 0;
		this._routeActive = false;
		this._mixPreview = false;
		this._disposed = false;
		this._graphicsTier = "medium";
		this._viewport = { width: 1440, height: 900, mobile: false, short: false };
		this._layout = ABOUT_LAYOUT.desktop;

		this._pointer = new THREE.Vector2();
		this._pointerTilt = new THREE.Vector2();

		this._buildLights();
		this._buildHalo();

		this.assembly = createLogoAssembly();
		this.motionRoot.add(this.assembly.group);

		this.network = createNetworkLayer({ mobile: false });
		this.assembly.networkAnchor.add(this.network.group);

		this.energy = createEnergyStreams({ mobile: false });
		this.motionRoot.add(this.energy.group);

		this.ground = createGroundEffects({ mobile: false });
		this.motionRoot.add(this.ground.group);

		this._qualityMobile = false;

		this.readyPromise = Promise.resolve(true);
		this._applyProgress(0, true);
		this._applyResponsiveTransform();
	}

	/** Explicit progress API (also driven from store each frame). */
	setProgress(value) {
		this._setHeldProgress(value);
	}

	init() {
		return this.readyPromise;
	}

	shouldRender() {
		return true;
	}

	shouldKeepUpdating() {
		return this._routeActive || this._mixPreview;
	}

	getScene() {
		return this.threeScene;
	}

	getModelsBloomLogoReveal() {
		return 1;
	}

	getModelsGrainBlurConfig() {
		return { enabled: false };
	}

	_buildLights() {
		const L = ABOUT_LIGHTS;
		const ambient = new THREE.AmbientLight(L.ambient.color, L.ambient.intensity);
		const hemi = new THREE.HemisphereLight(L.hemisphere.sky, L.hemisphere.ground, L.hemisphere.intensity);

		const key = new THREE.DirectionalLight(L.key.color, L.key.intensity);
		key.position.set(...L.key.position);

		const rim = new THREE.DirectionalLight(L.rim.color, L.rim.intensity);
		rim.position.set(...L.rim.position);

		const front = new THREE.DirectionalLight(L.front.color, L.front.intensity);
		front.position.set(...L.front.position);

		const bottom = new THREE.DirectionalLight(L.bottom.color, L.bottom.intensity);
		bottom.position.set(...L.bottom.position);

		const halo = new THREE.PointLight(L.halo.color, L.halo.intensity, L.halo.distance, L.halo.decay);
		halo.position.set(...L.halo.position);
		// Keep halo behind the model so it never blooms as a floating orb
		halo.visible = true;

		this.threeScene.add(ambient, hemi, key, rim, front, bottom, halo);
		this._lights = { ambient, hemi, key, rim, front, bottom, halo };
	}

	_buildHalo() {
		const geo = new THREE.PlaneGeometry(7.5, 7.5);
		const mat = new THREE.ShaderMaterial({
			uniforms: {
				uColor: { value: new THREE.Color(ABOUT_COLORS.halo) },
				uIntensity: { value: 0.35 },
			},
			vertexShader: `
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: `
				uniform vec3 uColor;
				uniform float uIntensity;
				varying vec2 vUv;
				void main() {
					vec2 p = vUv * 2.0 - 1.0;
					float r = length(p);
					float glow = exp(-r * r * 1.8);
					float alpha = glow * uIntensity;
					if (alpha < 0.01) discard;
					gl_FragColor = vec4(uColor, alpha);
				}
			`,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			toneMapped: false,
		});
		this._haloPlane = new THREE.Mesh(geo, mat);
		this._haloPlane.position.set(0, 0, -1.6);
		this._haloPlane.renderOrder = -1;
		this.motionRoot.add(this._haloPlane);
		this._haloGeo = geo;
		this._haloMat = mat;
	}

	_getExperienceProgress() {
		const experience = this.store?.aboutExperience;
		const directProgress = finiteOrNull(experience?.progress);
		const stagePosition = finiteOrNull(experience?.stagePosition);
		const progress = directProgress ?? (stagePosition == null ? null : stagePosition / 3);
		const experienceOwnsProgress = experience?.active === true;

		if (!experienceOwnsProgress && this._lifecycleProgressOverride != null) {
			return this._lifecycleProgressOverride;
		}

		if (progress != null) {
			this._heldProgress = THREE.MathUtils.clamp(progress, 0, 1);
			if (experienceOwnsProgress) this._lifecycleProgressOverride = null;
		}

		return this._heldProgress;
	}

	_setHeldProgress(progress) {
		this._heldProgress = THREE.MathUtils.clamp(progress, 0, 1);
		this._lifecycleProgressOverride = this._heldProgress;
		this._applyProgress(this._heldProgress, true);
	}

	_applyProgress(progress, force = false) {
		const normalized = THREE.MathUtils.clamp(progress, 0, 1);
		if (!force && Math.abs(normalized - this._lastAppliedProgress) < 0.00001) {
			return;
		}

		this._lastAppliedProgress = normalized;
		this._motion = sampleScrollTimeline(normalized);

		this.assembly.applyMotion(this._motion);
		this.network.applyMotion(this._motion);
		this.energy.applyMotion(this._motion);
		this.ground.applyMotion(this._motion);

		this.motionRoot.scale.setScalar(this._motion.rootScale);
		this._syncMotionRootRotation();
	}

	_syncMotionRootRotation() {
		const idleYaw = Math.sin(this._elapsed * ABOUT_IDLE.spinSpeed) * 0.012 * (this._motion.idleStrength ?? 1);
		this.motionRoot.rotation.x = this._motion.rootPitch + this._pointerTilt.x;
		this.motionRoot.rotation.y = this._motion.rootYaw + this._pointerTilt.y + idleYaw;
		this.motionRoot.rotation.z = this._motion.rootRoll;
	}

	_updateIdle() {
		const strength = this._motion.idleStrength ?? 1;
		const floatY = Math.sin(this._elapsed * ABOUT_IDLE.floatSpeed) * ABOUT_IDLE.floatAmplitude * strength;
		this.motionRoot.position.y = floatY;
		this._syncMotionRootRotation();
	}

	applyCamera(camera, frame) {
		const layout = this._layout;
		const base = {
			position: [
				layout.lookAtX * 0.15 + (this._motion.cameraX || 0),
				layout.cameraY + (this._motion.cameraY || 0),
				(this._motion.cameraZ || layout.cameraZ),
			],
			lookAt: [layout.lookAtX, layout.lookAtY, 0],
			fov: layout.fov,
			scrollZ: CAMERA_SCROLL_DISTANCE,
		};
		applySceneProgressToCamera(camera, base, frame?.sceneProgress ?? 0);
	}

	resetCarouselState(context = {}) {
		if (context.reason === "hex-target-at-rest") {
			this._setHeldProgress(0);
			return;
		}

		if (context.role === "previous") {
			this._setHeldProgress(1);
			return;
		}

		if (context.role === "next") {
			this._setHeldProgress(0);
		}
	}

	playEnterAnimation() {}

	setRouteState({ currentPage, teleportPage, routePhase }) {
		const currentMatches = isAboutPath(currentPage);
		const teleportMatches = isAboutPath(teleportPage);
		this._routeActive = currentMatches || (routePhase !== "idle" && teleportMatches);
	}

	setMixPreviewActive(active) {
		this._mixPreview = active === true;
	}

	onViewportResize(width, height) {
		if (!(width > 0) || !(height > 0)) return;
		this._viewport.width = width;
		this._viewport.height = height;
		this._viewport.mobile = width <= 768 || width / height < 0.82;
		this._viewport.short = !this._viewport.mobile && height <= 720;
		this._applyResponsiveTransform();
		this._rebuildQualityIfNeeded();
	}

	resize(width, height) {
		this.onViewportResize(width, height);
	}

	_applyResponsiveTransform() {
		const { mobile, short } = this._viewport;
		this._layout = mobile ? ABOUT_LAYOUT.mobile : short ? ABOUT_LAYOUT.short : ABOUT_LAYOUT.desktop;
		const layout = this._layout;
		this.root.position.set(layout.rootX, layout.rootY, 0);
		this.root.scale.setScalar(layout.rootScale);
	}

	_rebuildQualityIfNeeded() {
		const wantMobile = this._viewport.mobile || this._graphicsTier === "low";
		if (wantMobile === this._qualityMobile) return;
		this._qualityMobile = wantMobile;

		this.assembly.networkAnchor.remove(this.network.group);
		this.network.dispose();
		this.network = createNetworkLayer({ mobile: wantMobile });
		this.assembly.networkAnchor.add(this.network.group);

		this.motionRoot.remove(this.energy.group);
		this.energy.dispose();
		this.energy = createEnergyStreams({ mobile: wantMobile });
		this.motionRoot.add(this.energy.group);

		this.motionRoot.remove(this.ground.group);
		this.ground.dispose();
		this.ground = createGroundEffects({ mobile: wantMobile });
		this.motionRoot.add(this.ground.group);

		this._applyProgress(this._heldProgress, true);
	}

	_updatePointer(delta, frame) {
		const blocked = frame?.pointerBlocked === true || this._viewport.mobile;
		const pointer = frame?.pointer;
		const pointerX = blocked ? 0 : THREE.MathUtils.clamp(Number(pointer?.x) || 0, -1, 1);
		const pointerY = blocked ? 0 : THREE.MathUtils.clamp(Number(pointer?.y) || 0, -1, 1);
		this._pointer.set(pointerX, pointerY);

		const tiltTargetX = blocked ? 0 : pointerY * ABOUT_PARALLAX.pitch;
		const tiltTargetY = blocked ? 0 : pointerX * ABOUT_PARALLAX.yaw;
		this._pointerTilt.x = THREE.MathUtils.damp(this._pointerTilt.x, tiltTargetX, 5.2, delta);
		this._pointerTilt.y = THREE.MathUtils.damp(this._pointerTilt.y, tiltTargetY, 5.2, delta);
		this._syncMotionRootRotation();
	}

	update(delta, frame) {
		if (this._disposed) return;
		const safeDelta = THREE.MathUtils.clamp(Number(delta) || 0, 0, 0.1);
		this._elapsed += safeDelta;
		this._applyProgress(this._getExperienceProgress());

		const nextTier = this.store?.graphicsTier ?? "medium";
		if (nextTier !== this._graphicsTier) {
			this._graphicsTier = nextTier;
			this._rebuildQualityIfNeeded();
		}

		this._updatePointer(safeDelta, frame);
		this._updateIdle();
		this.network.updateIdle(this._elapsed);
		this.energy.updateIdle(this._elapsed, safeDelta);
		this.ground.updateIdle(this._elapsed);
	}

	dispose() {
		if (this._disposed) return;
		this._disposed = true;
		this.assembly.dispose();
		this.network.dispose();
		this.energy.dispose();
		this.ground.dispose();
		this._haloGeo?.dispose();
		this._haloMat?.dispose();
		this.threeScene.clear();
		this.threeScene = null;
	}
}
