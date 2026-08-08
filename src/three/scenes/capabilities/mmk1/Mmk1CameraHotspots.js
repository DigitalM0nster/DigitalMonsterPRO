import * as THREE from "three";
import { MMK1_CAMERA_HOTSPOTS, MMK1_CAMERA_HOTSPOT_MOTION } from "./mmk1CameraHotspotsConfig.js";

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const easeInOutCubic = (value) => {
	const t = clamp01(value);
	return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
};

const HOVER_ENTER_DURATION = 0.2;
const HOVER_LEAVE_DURATION = 0.24;
const OUTER_REVEAL_ENTER_DURATION = 0.34;
const OUTER_REVEAL_LEAVE_DURATION = 0.22;
const DISMISS_DURATION = 0.5;

const MARKER_FRAGMENT_SHADER = /* glsl */ `
	uniform vec3 diffuse;
	uniform float opacity;
	uniform float uTime;
	uniform float uHover;
	uniform float uOuterReveal;
	uniform float uReveal;
	uniform float uFill;
	uniform float uLineThickness;
	uniform float uIdlePulse;
	varying vec2 vMarkerUv;

	const float PI = 3.141592653589793;
	const float TWO_PI = 6.283185307179586;

	float ring(float radius, float center, float halfWidth, float aa) {
		return 1.0 - smoothstep(halfWidth - aa, halfWidth + aa, abs(radius - center));
	}

	void main() {
		vec2 point = vMarkerUv - 0.5;
		float radius = length(point);
		float aa = max(fwidth(radius) * 0.55, 0.001);
		float angle = mod(atan(point.x, point.y) + TWO_PI, TWO_PI);
		float angle01 = angle / TWO_PI;
		float revealMask = (1.0 - smoothstep(uReveal, uReveal + 0.018, angle01))
			* smoothstep(0.0, 0.012, uReveal);

		float pulse = max((0.5 + 0.5 * sin(uTime * 6.4)) * uHover, uIdlePulse);
		float innerRadius = 0.248 + pulse * 0.022;
		float outerRadius = 0.328 + pulse * 0.024;

		float innerLine = ring(radius, innerRadius, 0.006 * uLineThickness, aa) * revealMask;

		// The reveal and the tapered stroke share one rotating phase. Therefore
		// the 0→360 draw always begins at the thick head instead of screen-top.
		float rotatingPhase = fract(angle01 - uTime * 0.22);
		float taperedWidth = mix(0.0125, 0.0045, pow(rotatingPhase, 0.82)) * uLineThickness;
		float outerRevealMask = (1.0 - smoothstep(uOuterReveal, uOuterReveal + 0.018, rotatingPhase))
			* smoothstep(0.0, 0.012, uOuterReveal);
		float outerLine = ring(radius, outerRadius, taperedWidth, aa) * revealMask * outerRevealMask;
		float outerOpacity = mix(0.92, 0.52, rotatingPhase);

		float alpha = innerLine * 0.5;
		alpha = max(alpha, outerLine * outerOpacity * (0.74 + uHover * 0.2));
		if (alpha <= 0.001) discard;

		gl_FragColor = vec4(diffuse, alpha * opacity);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

function createMarkerMaterial() {
	const uniforms = {
		uTime: { value: 0 },
		uHover: { value: 0 },
		uOuterReveal: { value: 0 },
		uReveal: { value: 1 },
		uFill: { value: 1 },
		uLineThickness: { value: 1.5 },
		uIdlePulse: { value: 0 },
	};
	const material = new THREE.SpriteMaterial({
		color: 0xffffff,
		transparent: true,
		opacity: 1,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
		sizeAttenuation: false,
	});
	material.userData.hotspotUniforms = uniforms;
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms);
		shader.vertexShader = shader.vertexShader
			.replace("#include <common>", "#include <common>\nvarying vec2 vMarkerUv;")
			.replace("#include <uv_vertex>", "#include <uv_vertex>\nvMarkerUv = uv;");
		shader.fragmentShader = MARKER_FRAGMENT_SHADER;
	};
	material.customProgramCacheKey = () => "mmk1-camera-hotspot-v6";
	return material;
}

/** Four persistent MMK-1 markers plus one reversible camera-flight owner. */
export class Mmk1CameraHotspots {
	constructor(threeScene, inputElement, { onActivate = null } = {}) {
		this.inputElement = inputElement;
		this.onActivate = typeof onActivate === "function" ? onActivate : null;
		this.group = new THREE.Group();
		this.group.name = "mmk1-camera-hotspots";
		this.group.visible = false;
		threeScene.add(this.group);

		this.markers = MMK1_CAMERA_HOTSPOTS.map((definition, index) => {
			const material = createMarkerMaterial();
			const sprite = new THREE.Sprite(material);
			sprite.name = definition.id;
			sprite.position.fromArray(definition.point);
			sprite.scale.setScalar(MMK1_CAMERA_HOTSPOT_MOTION.markerScale);
			sprite.renderOrder = 80;
			sprite.userData.hotspotDefinition = definition;
			sprite.userData.anchor = new THREE.Vector3().fromArray(definition.point);
			sprite.userData.hoverProgress = 0;
			sprite.userData.outerRevealProgress = 0;
			sprite.userData.dismissProgress = null;
			sprite.userData.dismissDirection = 0;
			sprite.userData.idlePulseEnabled = index === 1;
			this.group.add(sprite);
			return sprite;
		});

		this.pointer = new THREE.Vector2(2, 2);
		this.projected = new THREE.Vector3();
		this.clampedProjected = new THREE.Vector3();
		this.markerWorldPosition = new THREE.Vector3();
		this.anchorWorldPosition = new THREE.Vector3();
		this.anchorObject = null;
		this.hovered = null;
		this.pointerDown = false;
		this.clickPending = false;
		this.pendingMarker = null;
		this.elapsed = 0;
		this.lineThickness = 1.5;
		this.active = false;
		this.camera = null;

		this.flight = null;
		this.selectedId = null;
		this.fromPosition = new THREE.Vector3();
		this.fromQuaternion = new THREE.Quaternion();
		this.toPosition = new THREE.Vector3();
		this.toQuaternion = new THREE.Quaternion();
		this.parallaxRotation = new THREE.Quaternion();
		this.parallaxEuler = new THREE.Euler(0, 0, 0, "YXZ");
		this.fromFov = 49;
		this.toFov = 49;

		this._onClick = (event) => {
			// During the internal MMK-1 -> light-trails hex mix the same scene is
			// rendered twice. The target pass leaves this shared group hidden, but
			// that render-only flag must not disable the still-visible source hits.
			if (event.button !== 0 || !this.active || !this.camera || !this.inputElement) {
				return;
			}
			const rect = this.inputElement.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) {
				return;
			}
			this.pointer.set(
				((event.clientX - rect.left) / rect.width) * 2 - 1,
				-(((event.clientY - rect.top) / rect.height) * 2 - 1),
			);
			this._layoutMarkers(this.camera);
			this.pendingMarker = this._pickMarker(this.camera, this.pointer, rect.width, rect.height);
		};
		this.inputElement?.addEventListener("click", this._onClick);
	}

	/**
	 * Keep a private snapshot of the MMK-1 pass camera. SceneManager reuses one
	 * camera for both capability layers, so retaining its mutable reference makes
	 * markers project through the light-trails camera on the following update.
	 */
	syncCamera(camera) {
		if (!camera?.isPerspectiveCamera) return;
		if (!this.camera) {
			this.camera = camera.clone();
		} else {
			this.camera.copy(camera, false);
		}
		this.camera.updateProjectionMatrix();
		this.camera.updateMatrixWorld(true);
		this._layoutMarkers(this.camera);
	}

	/** Convert calibrated world anchors once, then inherit crane transforms. */
	bindToObject(object, referenceMatrix = null) {
		if (!object || this.anchorObject === object) {
			return;
		}
		object.updateWorldMatrix(true, false);
		this.anchorObject = object;
		const inverseReference = (referenceMatrix ?? object.matrixWorld).clone().invert();
		for (const marker of this.markers) {
			marker.userData.localAnchor = marker.userData.anchor.clone().applyMatrix4(inverseReference);
		}
	}

	_syncBoundAnchors() {
		if (!this.anchorObject) return;
		this.anchorObject.updateWorldMatrix(true, false);
		this.group.updateWorldMatrix(true, false);
		for (const marker of this.markers) {
			const localAnchor = marker.userData.localAnchor;
			if (!localAnchor) continue;
			this.anchorWorldPosition.copy(localAnchor).applyMatrix4(this.anchorObject.matrixWorld);
			this.group.worldToLocal(this.anchorWorldPosition);
			marker.userData.anchor.copy(this.anchorWorldPosition);
		}
	}

	_layoutMarkers(camera) {
		this._syncBoundAnchors();
		for (const marker of this.markers) {
			this.projected.copy(marker.userData.anchor).project(camera);
			const inDepth = this.projected.z >= -1 && this.projected.z <= 1;
			marker.visible = inDepth && marker.userData.dismissProgress !== 1;
			if (!inDepth) {
				continue;
			}
			const clampedX = THREE.MathUtils.clamp(this.projected.x, -0.92, 0.92);
			const clampedY = THREE.MathUtils.clamp(this.projected.y, -0.86, 0.72);
			const offscreen = clampedX !== this.projected.x || clampedY !== this.projected.y;
			if (offscreen) {
				this.clampedProjected.set(clampedX, clampedY, this.projected.z).unproject(camera);
				marker.position.copy(this.clampedProjected);
			} else {
				marker.position.copy(marker.userData.anchor);
			}
			marker.material.opacity = offscreen ? 0.72 : 1;
		}
	}

	setPointerState({ pointerDown = false, pointerBlocked = false } = {}) {
		if (pointerBlocked) {
			this.pointerDown = false;
			this.clickPending = false;
			return;
		}
		if (this.pointerDown && !pointerDown) {
			this.clickPending = true;
		}
		this.pointerDown = pointerDown;
	}

	_pickMarker(camera, pointer, viewportWidth, viewportHeight) {
		let nearest = null;
		let nearestDistance = 32;
		for (const marker of this.markers) {
			if (marker.userData.dismissProgress !== null) {
				continue;
			}
			marker.getWorldPosition(this.markerWorldPosition);
			this.projected.copy(this.markerWorldPosition).project(camera);
			if (this.projected.z < -1 || this.projected.z > 1) {
				continue;
			}
			const dx = (this.projected.x - pointer.x) * viewportWidth * 0.5;
			const dy = (this.projected.y - pointer.y) * viewportHeight * 0.5;
			const distance = Math.hypot(dx, dy);
			if (distance < nearestDistance) {
				nearestDistance = distance;
				nearest = marker;
			}
		}
		return nearest;
	}

	_startFlight(definition, camera) {
		if (!definition?.camera || !camera) {
			return;
		}
		this.selectedId = definition.id;
		this.fromPosition.copy(camera.position);
		this.fromQuaternion.copy(camera.quaternion).normalize();
		this.fromFov = camera.fov;
		this.toPosition.fromArray(definition.camera.position);
		this.toQuaternion.fromArray(definition.camera.quaternion).normalize();
		this.toFov = definition.camera.fov ?? camera.fov;
		this.flight = { elapsed: 0, progress: 0 };
	}

	startOverviewFlight(camera, target) {
		if (!camera || !target?.position || !target?.quaternion) return false;
		this._resetMarkerVisuals();
		this.selectedId = "__overview__";
		this.fromPosition.copy(camera.position);
		this.fromQuaternion.copy(camera.quaternion).normalize();
		this.fromFov = camera.fov;
		this.toPosition.copy(target.position);
		this.toQuaternion.copy(target.quaternion).normalize();
		this.toFov = target.fov ?? camera.fov;
		this.flight = { elapsed: 0, progress: 0, returnToOverview: true };
		return true;
	}

	_activateMarker(marker, camera) {
		if (!marker || marker.userData.dismissProgress !== null) {
			return;
		}
		const previousMarker = this.markers.find((item) => item.name === this.selectedId);
		if (previousMarker && previousMarker !== marker) {
			previousMarker.userData.dismissProgress = previousMarker.userData.dismissProgress ?? 1;
			previousMarker.userData.dismissDirection = -1;
			previousMarker.visible = true;
		}
		marker.userData.dismissProgress = 0;
		marker.userData.dismissDirection = 1;
		marker.userData.hoverProgress = 0;
		if (this.hovered === marker) {
			this._clearHover();
		}
		this._startFlight(marker.userData.hotspotDefinition, camera);
		this.onActivate?.(marker.userData.hotspotDefinition);
	}

	_clearHover() {
		this.hovered = null;
	}

	_resetMarkerVisuals() {
		for (const marker of this.markers) {
			const uniforms = marker.material.userData.hotspotUniforms;
			marker.userData.dismissProgress = null;
			marker.userData.dismissDirection = 0;
			marker.userData.hoverProgress = 0;
			marker.userData.outerRevealProgress = 0;
			uniforms.uHover.value = 0;
			uniforms.uOuterReveal.value = 0;
			uniforms.uReveal.value = 1;
			uniforms.uFill.value = 1;
			uniforms.uIdlePulse.value = 0;
			marker.visible = true;
		}
	}

	update(delta, frame, { enabled = true } = {}) {
		const safeDelta = Math.min(Math.max(delta, 0), 0.05);
		this.elapsed += safeDelta;
		if (!this.camera && frame?.camera) {
			this.syncCamera(frame.camera);
		}
		const visible = Boolean(enabled && this.camera);
		this.active = Boolean(
			visible
			&& frame?.interactionEnabled !== false
			&& !frame?.pointerBlocked,
		);
		this.group.visible = visible;

		if (this.flight) {
			this.flight.elapsed += safeDelta;
			this.flight.progress = clamp01(this.flight.elapsed / MMK1_CAMERA_HOTSPOT_MOTION.duration);
			if (this.flight.progress >= 1) {
				if (this.flight.returnToOverview) {
					this.selectedId = null;
					this._resetMarkerVisuals();
				}
				this.flight = null;
			}
		}
		if (this.pendingMarker) {
			this._activateMarker(this.pendingMarker, this.camera);
			this.pendingMarker = null;
			this.clickPending = false;
		}

		if (visible) {
			this._layoutMarkers(this.camera);
		}

		if (this.active) {
			this.pointer.set(frame.pointer?.x ?? 2, frame.pointer?.y ?? 2);
			const rect = this.inputElement?.getBoundingClientRect();
			const nextHovered = this._pickMarker(
				this.camera,
				this.pointer,
				rect?.width || window.innerWidth,
				rect?.height || window.innerHeight,
			);
			if (nextHovered !== this.hovered) {
				this._clearHover();
				this.hovered = nextHovered;
			}
		} else {
			this.clickPending = false;
			this._clearHover();
		}

		for (const marker of this.markers) {
			const uniforms = marker.material.userData.hotspotUniforms;
			const hovered = marker === this.hovered && marker.userData.dismissProgress === null;
			const duration = hovered ? HOVER_ENTER_DURATION : HOVER_LEAVE_DURATION;
			const direction = hovered ? 1 : -1;
			const progress = THREE.MathUtils.clamp(
				marker.userData.hoverProgress + direction * safeDelta / duration,
				0,
				1,
			);
			marker.userData.hoverProgress = progress;
			uniforms.uTime.value = this.elapsed;
			uniforms.uHover.value = progress * progress * (3 - 2 * progress);
			const idlePulseCycle = (this.elapsed + 2) % 4.8;
			const idlePulseProgress = idlePulseCycle < 0.72 ? idlePulseCycle / 0.72 : 0;
			uniforms.uIdlePulse.value = marker.userData.idlePulseEnabled
				&& marker.userData.dismissProgress === null
				&& !hovered
				&& idlePulseProgress > 0
				? Math.sin(idlePulseProgress * Math.PI)
				: 0;

			if (marker.userData.dismissProgress === null) {
				const outerDuration = hovered ? OUTER_REVEAL_ENTER_DURATION : OUTER_REVEAL_LEAVE_DURATION;
				const outerDirection = hovered ? 1 : -1;
				marker.userData.outerRevealProgress = THREE.MathUtils.clamp(
					marker.userData.outerRevealProgress + outerDirection * safeDelta / outerDuration,
					0,
					1,
				);
			}
			const outerProgress = marker.userData.outerRevealProgress;
			uniforms.uOuterReveal.value = outerProgress * outerProgress * (3 - 2 * outerProgress);

			if (marker.userData.dismissProgress !== null) {
				const direction = marker.userData.dismissDirection || 1;
				const dismissProgress = clamp01(
					marker.userData.dismissProgress + direction * safeDelta / DISMISS_DURATION,
				);
				const easedDismiss = dismissProgress * dismissProgress * (3 - 2 * dismissProgress);
				uniforms.uReveal.value = 1 - easedDismiss;
				uniforms.uFill.value = 1 - clamp01(dismissProgress / 0.3);
				if (direction < 0 && dismissProgress <= 0) {
					marker.userData.dismissProgress = null;
					marker.userData.dismissDirection = 0;
					uniforms.uReveal.value = 1;
					uniforms.uFill.value = 1;
				} else {
					marker.userData.dismissProgress = dismissProgress;
				}
			}
			marker.scale.setScalar(MMK1_CAMERA_HOTSPOT_MOTION.markerScale);
		}

		if (this.clickPending) {
			this.clickPending = false;
			if (this.hovered) {
				this._activateMarker(this.hovered, frame.camera);
			}
		}

		return Boolean(this.hovered);
	}

	applyCamera(camera, parallax = null) {
		if (!camera || !this.selectedId) {
			return false;
		}
		const progress = this.flight ? easeInOutCubic(this.flight.progress) : 1;
		camera.position.lerpVectors(this.fromPosition, this.toPosition, progress);
		camera.quaternion.copy(this.fromQuaternion).slerp(this.toQuaternion, progress).normalize();
		const returningToOverview = this.selectedId === "__overview__";
		const parallaxX = returningToOverview
			? 0
			: THREE.MathUtils.clamp(Number(parallax?.x) || 0, -1, 1);
		const parallaxY = returningToOverview
			? 0
			: THREE.MathUtils.clamp(Number(parallax?.y) || 0, -1, 1);
		this.parallaxEuler.set(
			parallaxY * 0.035 * progress,
			-parallaxX * 0.055 * progress,
			0,
		);
		this.parallaxRotation.setFromEuler(this.parallaxEuler);
		camera.quaternion.multiply(this.parallaxRotation).normalize();
		camera.up.set(0, 1, 0);
		const fov = THREE.MathUtils.lerp(this.fromFov, this.toFov, progress);
		if (Math.abs(camera.fov - fov) > 1e-5) {
			camera.fov = fov;
			camera.updateProjectionMatrix();
		}
		camera.updateMatrixWorld(true);
		return true;
	}

	reset() {
		this.flight = null;
		this.selectedId = null;
		this.clickPending = false;
		this.pendingMarker = null;
		this.pointerDown = false;
		this.elapsed = 0;
		this.camera = null;
		this.group.visible = false;
		this._clearHover();
		this._resetMarkerVisuals();
	}

	isHovered() {
		return Boolean(this.hovered);
	}

	isReturningToOverview() {
		return this.selectedId === "__overview__";
	}

	getLineThickness() {
		return this.lineThickness;
	}

	setLineThickness(value) {
		const next = THREE.MathUtils.clamp(Number(value), 0.5, 2.5);
		if (!Number.isFinite(next)) return null;
		this.lineThickness = next;
		for (const marker of this.markers) {
			marker.material.userData.hotspotUniforms.uLineThickness.value = next;
		}
		return next;
	}

	dispose() {
		this.reset();
		this.inputElement?.removeEventListener("click", this._onClick);
		this.inputElement = null;
		this.onActivate = null;
		this.group.removeFromParent();
		for (const marker of this.markers) {
			marker.material.dispose();
		}
		this.markers = [];
	}
}
