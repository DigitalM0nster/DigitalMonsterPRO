import * as THREE from "three";
import { HUD_MARKER_GLSL } from "../../../objects/sceneHud/sceneHudShaders.js";
import { advanceMarkerMagnet } from "../../../objects/sceneHud/sceneMarkerMagnet.js";
import { Mmk1HotspotLabels } from "./Mmk1HotspotLabels.js";
import { Mmk1HotspotDetails } from "./Mmk1HotspotDetails.js";
import { getMmk1DetailLayout } from "./mmk1HotspotDetailsConfig.js";
import { MMK1_CAMERA_HOTSPOTS, MMK1_CAMERA_HOTSPOT_MOTION } from "./mmk1CameraHotspotsConfig.js";

const AUTHORED_ROOT_POSITION = new THREE.Vector3(4.15, -3.18, 0);

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const easeInOutCubic = (value) => {
	const t = clamp01(value);
	return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
};

const MARKER_FRAGMENT_SHADER = /* glsl */ `
	uniform float opacity,uTime,uHover,uLineThickness;
	varying vec2 vMarkerUv;
	${HUD_MARKER_GLSL}
	void main(){
		vec2 p=(vMarkerUv-0.5)*72.0;
		float alpha=hudMarkerInk(p,uTime,uHover,0.0,uLineThickness/1.5)*opacity;
		if(alpha<0.002)discard;
		gl_FragColor=vec4(hudMarkerTint(uHover,0.0),alpha);
	}
`;

function createMarkerMaterial() {
	const uniforms = {
		uTime: { value: 0 },
		uHover: { value: 0 },
		uLineThickness: { value: 1.5 },
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
	material.customProgramCacheKey = () => "mmk1-camera-hotspot-core-v1";
	return material;
}

/** Four persistent MMK-1 markers plus one reversible camera-flight owner. */
export class Mmk1CameraHotspots {
	constructor(threeScene, inputElement, { onActivate = null, renderer = null } = {}) {
		this.inputElement = inputElement;
		this.renderer = renderer;
		const rect = inputElement?.getBoundingClientRect();
		this.viewport = new THREE.Vector2(rect?.width || 1440, rect?.height || 900);
		this.modelsParent = threeScene;
		this.overlayScene = new THREE.Scene();
		this.composeMode = "models";
		this.labels = null;
		this.details = null;
		this.disposed = false;
		this.onActivate = typeof onActivate === "function" ? onActivate : null;
		this.group = new THREE.Group();
		this.group.name = "mmk1-camera-hotspots";
		// Visibility belongs to the crane scene, including warmup and hex layers.
		// Route state, pointer ownership and camera flights only gate interaction.
		threeScene.add(this.group);

		this.markers = MMK1_CAMERA_HOTSPOTS.map((definition, index) => {
			const material = createMarkerMaterial();
			const sprite = new THREE.Sprite(material);
			sprite.name = definition.id;
			sprite.position.fromArray(definition.point);
			sprite.scale.setScalar(1);
			sprite.renderOrder = 80;
			sprite.userData.hotspotDefinition = definition;
			sprite.userData.rotationPhase = [0, 2.7, 6.3, 8.4][index];
			sprite.userData.anchor = new THREE.Vector3().fromArray(definition.point);
			sprite.userData.screenAnchor = new THREE.Vector3();
			sprite.userData.magnetOffset = new THREE.Vector2();
			sprite.userData.magnetVelocity = new THREE.Vector2();
			this.group.add(sprite);
			return sprite;
		});

		this.pointer = new THREE.Vector2(2, 2);
		this.projected = new THREE.Vector3();
		this.clampedProjected = new THREE.Vector3();
		this.markerWorldPosition = new THREE.Vector3();
		this.orbitTarget = new THREE.Vector3();
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
		this.fromShiftX = 0; this.fromShiftY = 0;
		this.toShiftX = 0; this.toShiftY = 0;

		this._onClick = (event) => {
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

	prepareLabels() {
		return this._labelsPromise ??= this._prepareLabels();
	}

	async _prepareLabels() {
		await Promise.all([
			document.fonts?.load('500 16px ManifoldExtended'),
			document.fonts?.load('400 14px MazzardM'),
			document.fonts?.load('500 80px ManifoldExtended'),
		]);
		if (this.disposed || this.labels || !this.renderer) return;
		this.labels = await Mmk1HotspotLabels.create(this.group, this.markers, this.renderer, () => this.disposed);
		if (this.disposed) { this.labels?.dispose(); this.labels = null; return; }
		this.details = await Mmk1HotspotDetails.create(this.group, this.markers, this.renderer, this.modelsParent, () => this.disposed);
		if (this.disposed) { this.details?.dispose(); this.details = null; }
	}

	/** Keep the crane pass camera separate from other scenes' shared camera. */
	syncCamera(camera) {
		if (!camera?.isPerspectiveCamera) return;
		if (!this.camera) {
			this.camera = camera.clone();
		} else {
			this.camera.copy(camera, false);
		}
		// copy() includes the off-axis projection used by responsive framing.
		this.camera.updateMatrixWorld(true);
		this._layoutMarkers(this.camera);
	}

	getOrbitTarget(target = this.orbitTarget) {
		if (!this.selectedId || this.selectedId === "__overview__") {
			return null;
		}
		const marker = this.markers.find((item) => item.name === this.selectedId);
		if (!marker) {
			return null;
		}
		this._syncBoundAnchors();
		this.group.updateWorldMatrix(true, false);
		return target.copy(marker.userData.anchor).applyMatrix4(this.group.matrixWorld);
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

	_layoutMarkers(camera, layoutText = true) {
		this._syncBoundAnchors();
		this.renderer?.getSize(this.viewport);
		const { x: width, y: height } = this.viewport;
		const scale = MMK1_CAMERA_HOTSPOT_MOTION.markerSize * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * .5)) / height;
		const adapted = width < 1280 || height <= 600;
		const short = height <= 480;
		// The ink occupies a 28px radius, inside the transparent 72px sprite.
		// Reserve its 9px cursor attraction without culling the left tip below the header.
		const padding = 28 + 9;
		const left = width <= 1024 ? 0 : 120, right = width <= 1024 ? 0 : 96;
		// Desktop chrome has no full-width backing: a circle below it must not
		// disappear merely because its transparent sprite enters the header band.
		const top = adapted ? (short ? 66 : 84) : 0;
		const bottom = adapted ? (short ? 50 : 64) : 30;
		if (adapted && (this._detailLayoutWidth !== width || this._detailLayoutHeight !== height || this._detailLayoutSelected !== this.selectedId)) {
			this._detailLayoutWidth = width; this._detailLayoutHeight = height;
			this._detailLayoutSelected = this.selectedId;
			const detailIndex = Math.max(0, this.markers.findIndex(marker => marker.name === this.selectedId));
			this._compactDetailLayout = getMmk1DetailLayout(detailIndex, width, height);
			this._compactOverviewLayout = getMmk1DetailLayout(4, width, height);
		}
		const detailOpen = this.selectedId && this.selectedId !== "__overview__";
		const card = adapted ? (detailOpen ? this._compactDetailLayout : this._compactOverviewLayout) : null;
		for (let index = 0; index < this.markers.length; index++) {
			const marker = this.markers[index];
			this.projected.copy(marker.userData.anchor).project(camera);
			const inDepth = this.projected.z >= -1 && this.projected.z <= 1;
			// Never clamp/reassign an anchor: every circle stays on its crane detail.
			marker.userData.screenAnchor.copy(this.projected);
			const x = (this.projected.x + 1) * width * .5, y = (1 - this.projected.y) * height * .5;
			let fits = inDepth && x >= left + padding && x <= width - right - padding
				&& y >= top + padding && y <= height - bottom - padding;
			if (fits && card) {
				const cardTop = height - card.y - card.height, cardBottom = height - card.y;
				if (x + padding > card.x && x - padding < card.x + card.width
					&& y + padding > cardTop && y - padding < cardBottom) fits = false;
			}
			if (fits && adapted) {
				// Four fixed anchors: hide a crowded target, do not move it into empty space.
				for (let previous = 0; previous < index; previous++) {
					const other = this.markers[previous];
					if (!other.userData.layoutVisible || other.name === this.selectedId) continue;
					const point = other.userData.screenAnchor;
					if (Math.hypot((point.x - this.projected.x) * width * .5, (point.y - this.projected.y) * height * .5) < 72) fits = false;
				}
			}
			marker.userData.layoutVisible = fits;
			marker.visible = inDepth && (fits || marker.material.opacity > .002);
			marker.scale.setScalar(scale);
			if (inDepth) this._positionMarker(marker, camera);
		}
		if (layoutText) this.labels?.layout(camera, this.viewport);
		this.details?.layout(this.viewport);
	}

	_positionMarker(marker, camera) {
		const { screenAnchor, magnetOffset } = marker.userData;
		this.clampedProjected.copy(screenAnchor);
		this.clampedProjected.x += magnetOffset.x * 2 / this.viewport.x;
		this.clampedProjected.y += magnetOffset.y * 2 / this.viewport.y;
		marker.position.copy(this.clampedProjected.unproject(camera));
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
		if (this.details?.containsPoint(pointer)) return null;
		let nearest = null;
		let nearestDistance = 32;
		for (const marker of this.markers) {
			if (!marker.visible || marker.userData.layoutVisible === false || marker.name === this.selectedId || marker.material.opacity < 0.05) continue;
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
		const mobileCamera = this.viewport.x <= 768 ? definition.mobileCamera : null;
		const targetCamera = mobileCamera ?? definition.camera;
		this.selectedId = definition.id;
		this.fromPosition.copy(camera.position);
		this.fromQuaternion.copy(camera.quaternion).normalize();
		this.fromFov = camera.fov;
		this.fromShiftX = camera.projectionMatrix.elements[8]; this.fromShiftY = camera.projectionMatrix.elements[9];
		this.toPosition.fromArray(targetCamera.position);
		// Close-ups were authored with the desktop root translation. Apply the
		// live root transform so phone scale/position do not leave the camera behind.
		const sceneRoot = this.anchorObject?.parent?.parent;
		if (!mobileCamera && sceneRoot && sceneRoot !== this.modelsParent && !sceneRoot.isScene) {
			sceneRoot.updateWorldMatrix(true, false);
			this.toPosition.sub(AUTHORED_ROOT_POSITION).applyMatrix4(sceneRoot.matrixWorld);
		}
		this.toQuaternion.fromArray(targetCamera.quaternion).normalize();
		this.toFov = targetCamera.fov ?? camera.fov;
		this.toShiftX = 0; this.toShiftY = 0;
		this.flight = { elapsed: 0, progress: 0 };
	}

	startOverviewFlight(camera, target) {
		if (!camera || !target?.position || !target?.quaternion) return false;
		this.selectedId = "__overview__";
		this.fromPosition.copy(camera.position);
		this.fromQuaternion.copy(camera.quaternion).normalize();
		this.fromFov = camera.fov;
		this.fromShiftX = camera.projectionMatrix.elements[8]; this.fromShiftY = camera.projectionMatrix.elements[9];
		this.toPosition.copy(target.position);
		this.toQuaternion.copy(target.quaternion).normalize();
		this.toFov = target.fov ?? camera.fov;
		this.toShiftX = target.shiftX ?? 0; this.toShiftY = target.shiftY ?? 0;
		this.flight = { elapsed: 0, progress: 0, returnToOverview: true };
		return true;
	}

	_activateMarker(marker, camera) {
		if (!marker || marker.name === this.selectedId) {
			return;
		}
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
			uniforms.uHover.value = 0;
			marker.material.opacity = 1;
			marker.visible = true;
			marker.userData.layoutVisible = true;
			marker.userData.magnetOffset.set(0, 0);
			marker.userData.magnetVelocity.set(0, 0);
		}
	}

	update(delta, frame, { interactionEnabled = true, locale = "ru", textState } = {}) {
		const safeDelta = Math.min(Math.max(delta, 0), 0.05);
		this.elapsed += safeDelta;
		if (!this.camera && frame?.camera) {
			this.syncCamera(frame.camera);
		}
		this.active = Boolean(
			this.camera
			&& interactionEnabled
			&& frame?.interactionEnabled !== false
			&& !frame?.pointerBlocked,
		);

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
			if (this.active) this._activateMarker(this.pendingMarker, this.camera);
			this.pendingMarker = null;
			this.clickPending = false;
		}

		if (this.camera) {
			this._layoutMarkers(this.camera, false);
		}

		if (this.active) {
			this.pointer.set(frame.pointer?.x ?? 2, frame.pointer?.y ?? 2);
			const nextHovered = this._pickMarker(
				this.camera,
				this.pointer,
				this.viewport.x,
				this.viewport.y,
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
			const { screenAnchor, magnetOffset, magnetVelocity } = marker.userData;
			const attracted = marker === this.hovered && marker.visible && !this.pointerDown && !frame?.pointerDown;
			advanceMarkerMagnet(magnetOffset, magnetVelocity,
				attracted ? (this.pointer.x - screenAnchor.x) * this.viewport.x * .5 : 0,
				attracted ? (this.pointer.y - screenAnchor.y) * this.viewport.y * .5 : 0, safeDelta);
			if (this.camera && marker.visible) this._positionMarker(marker, this.camera);
			const uniforms = marker.material.userData.hotspotUniforms;
			const opacityTarget = marker.name === this.selectedId || marker.userData.layoutVisible === false ? 0 : 1;
			marker.material.opacity = THREE.MathUtils.damp(marker.material.opacity, opacityTarget, 12, safeDelta);
			if (Math.abs(marker.material.opacity - opacityTarget) < 0.002) marker.material.opacity = opacityTarget;
			uniforms.uTime.value = this.elapsed + marker.userData.rotationPhase;
			uniforms.uHover.value = THREE.MathUtils.damp(uniforms.uHover.value, marker === this.hovered ? 1 : 0, 8, safeDelta);
		}
		if (this.camera) this.labels?.layout(this.camera, this.viewport);
		this.labels?.update(safeDelta, this.hovered, locale);
		this.details?.update(safeDelta, this.selectedId, this.flight, locale, textState);

		if (this.clickPending) {
			this.clickPending = false;
			if (this.hovered) {
				this._activateMarker(this.hovered, this.camera);
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
		const shiftX = THREE.MathUtils.lerp(this.fromShiftX, this.toShiftX, progress);
		const shiftY = THREE.MathUtils.lerp(this.fromShiftY, this.toShiftY, progress);
		if (Math.abs(camera.fov - fov) > 1e-5 || Math.abs(camera.projectionMatrix.elements[8] - shiftX) > 1e-8
			|| Math.abs(camera.projectionMatrix.elements[9] - shiftY) > 1e-8) {
			camera.fov = fov;
			camera.updateProjectionMatrix();
			camera.projectionMatrix.elements[8] = shiftX; camera.projectionMatrix.elements[9] = shiftY;
			camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
		}
		camera.updateMatrixWorld(true);
		return true;
	}

	reset() {
		this.labels?.reset();
		this.details?.reset();
		this.flight = null;
		this.selectedId = null;
		this.clickPending = false;
		this.pendingMarker = null;
		this.pointerDown = false;
		this.elapsed = 0;
		this.camera = null;
		this.active = false;
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

	setComposeMode(mode) {
		if (this.composeMode === mode) return;
		this.composeMode = mode;
		(mode === "screen" ? this.overlayScene : this.modelsParent).add(this.group);
	}

	renderScreenOverlay(renderer, camera) {
		if (this.composeMode !== "screen") return;
		this.syncCamera(camera);
		const autoClear = renderer.autoClear;
		try {
			renderer.autoClear = false;
			renderer.render(this.overlayScene, camera);
		} finally {
			renderer.autoClear = autoClear;
		}
	}

	dispose() {
		this.disposed = true;
		this.labels?.dispose();
		this.labels = null;
		this.details?.dispose();
		this.details = null;
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
