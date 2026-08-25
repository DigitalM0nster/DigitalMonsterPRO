import * as THREE from "three";
import { getCityFogAmount, getCityFogEffectiveEnd } from "./cityFogProfile.js";

const CURVE_SLICE_COUNT = 6;
const START_COLOR = 0x55ff9a;
const CURVE_COLOR = 0x51cfff;
const END_COLOR = 0xffc85a;

function createGuideGeometry() {
	const positions = [
		-1, -1, 0, 1, -1, 0,
		1, -1, 0, 1, 1, 0,
		1, 1, 0, -1, 1, 0,
		-1, 1, 0, -1, -1, 0,
		-1, 0, 0, 1, 0, 0,
		0, -1, 0, 0, 1, 0,
	];
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	return geometry;
}

function createGuideMaterial(color, opacity) {
	return new THREE.LineBasicMaterial({
		color,
		transparent: true,
		opacity,
		depthTest: false,
		depthWrite: false,
		fog: false,
		toneMapped: false,
	});
}

function createLabel(color) {
	const canvas = document.createElement("canvas");
	canvas.width = 512;
	canvas.height = 80;
	const context = canvas.getContext("2d");
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	const material = new THREE.SpriteMaterial({
		map: texture,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
	});
	const sprite = new THREE.Sprite(material);
	sprite.renderOrder = 10002;
	return { canvas, context, texture, sprite, color: new THREE.Color(color) };
}

function paintLabel(label, text) {
	const { canvas, context, texture, color } = label;
	context.clearRect(0, 0, canvas.width, canvas.height);
	context.fillStyle = "rgba(0, 7, 13, 0.82)";
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.strokeStyle = `#${color.getHexString()}`;
	context.lineWidth = 3;
	context.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
	context.fillStyle = `#${color.getHexString()}`;
	context.font = "600 28px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.fillText(text, canvas.width * 0.5, canvas.height * 0.52);
	texture.needsUpdate = true;
}

export class CityFogSceneGuide {
	constructor(scene, initialProfile) {
		this.scene = scene;
		this.enabled = false;
		this.sceneVisible = false;
		this.profile = { ...initialProfile };
		this.group = new THREE.Group();
		this.group.name = "CityFogSceneGuide";
		this.group.visible = false;
		this.group.renderOrder = 10000;
		scene.add(this.group);

		this.geometry = createGuideGeometry();
		this.startPlane = new THREE.LineSegments(
			this.geometry,
			createGuideMaterial(START_COLOR, 0.82),
		);
		this.startPlane.renderOrder = 10001;
		this.endPlane = new THREE.LineSegments(
			this.geometry,
			createGuideMaterial(END_COLOR, 0.92),
		);
		this.endPlane.renderOrder = 10001;
		this.curvePlanes = Array.from({ length: CURVE_SLICE_COUNT }, () => {
			const plane = new THREE.LineSegments(
				this.geometry,
				createGuideMaterial(CURVE_COLOR, 0.12),
			);
			plane.renderOrder = 10000;
			return plane;
		});
		this.startLabel = createLabel(START_COLOR);
		this.endLabel = createLabel(END_COLOR);
		this.group.add(
			this.startPlane,
			...this.curvePlanes,
			this.endPlane,
			this.startLabel.sprite,
			this.endLabel.sprite,
		);

		this.forward = new THREE.Vector3();
		this.right = new THREE.Vector3();
		this.up = new THREE.Vector3();
		this.setProfile(initialProfile);
	}

	setEnabled(enabled) {
		this.enabled = enabled === true;
		this.group.visible = this.enabled && this.sceneVisible;
		return this.enabled;
	}

	setSceneVisible(visible) {
		this.sceneVisible = visible === true;
		this.group.visible = this.enabled && this.sceneVisible;
	}

	setProfile(profile) {
		this.profile = { ...this.profile, ...profile };
		const near = Math.max(0, Number(this.profile.fogNear) || 0);
		const end = getCityFogEffectiveEnd(this.profile);
		paintLabel(this.startLabel, `FOG START  ${near.toFixed(1)}`);
		paintLabel(
			this.endLabel,
			Number.isFinite(end) ? `FOG END 99%  ${end.toFixed(1)}` : "FOG END  OFF",
		);
	}

	_placePlane(plane, camera, distance, sizeFactor) {
		const safeDistance = Math.max(camera.near * 4, 0.25, distance);
		const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * safeDistance;
		const halfWidth = halfHeight * camera.aspect;
		plane.position.copy(camera.position).addScaledVector(this.forward, safeDistance);
		plane.quaternion.copy(camera.quaternion);
		plane.scale.set(halfWidth * sizeFactor, halfHeight * sizeFactor, 1);
		return { safeDistance, halfWidth, halfHeight };
	}

	_placeLabel(label, camera, placement, sizeFactor, side) {
		const width = placement.halfWidth * sizeFactor;
		const height = placement.halfHeight * sizeFactor;
		label.sprite.position
			.copy(camera.position)
			.addScaledVector(this.forward, placement.safeDistance)
			.addScaledVector(this.right, width * side)
			.addScaledVector(this.up, height * 0.92);
		const labelHeight = Math.max(0.035, placement.halfHeight * 0.075);
		label.sprite.scale.set(labelHeight * 6.4, labelHeight, 1);
	}

	updateCamera(camera) {
		if (!this.group.visible || !camera) return;
		camera.getWorldDirection(this.forward);
		this.right.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
		this.up.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

		const near = Math.max(0, Number(this.profile.fogNear) || 0);
		const effectiveEnd = getCityFogEffectiveEnd(this.profile);
		const visibleEnd = Number.isFinite(effectiveEnd)
			? Math.min(effectiveEnd, camera.far * 0.94)
			: Math.min(Math.max(near + 30, 60), camera.far * 0.94);
		const startPlacement = this._placePlane(this.startPlane, camera, near, 0.44);
		const endPlacement = this._placePlane(this.endPlane, camera, visibleEnd, 0.88);
		this.endPlane.visible = Number.isFinite(effectiveEnd);
		this.endLabel.sprite.visible = this.endPlane.visible;

		for (let index = 0; index < this.curvePlanes.length; index += 1) {
			const progress = (index + 1) / (this.curvePlanes.length + 1);
			const distance = THREE.MathUtils.lerp(near, visibleEnd, progress);
			const plane = this.curvePlanes[index];
			this._placePlane(plane, camera, distance, 0.44 + progress * 0.44);
			plane.material.opacity = 0.08 + getCityFogAmount(distance, this.profile) * 0.48;
		}

		this._placeLabel(this.startLabel, camera, startPlacement, 0.44, -0.72);
		if (this.endPlane.visible) {
			this._placeLabel(this.endLabel, camera, endPlacement, 0.88, 0.72);
		}
	}

	dispose() {
		this.scene?.remove(this.group);
		const materials = new Set([
			this.startPlane.material,
			this.endPlane.material,
			...this.curvePlanes.map((plane) => plane.material),
		]);
		for (const material of materials) material.dispose();
		this.geometry.dispose();
		for (const label of [this.startLabel, this.endLabel]) {
			label.texture.dispose();
			label.sprite.material.dispose();
		}
		this.group.clear();
		this.scene = null;
	}
}
