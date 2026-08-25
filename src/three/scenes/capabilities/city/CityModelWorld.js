import * as THREE from "three";
import { createGLTFLoader } from "@/three/assets/gltfLoader.js";
import {
	CITY_WINDOW_MATERIAL_DEFAULTS,
	createCityLuminousWindowMaterial,
	replaceCityWindowMaterial,
} from "./cityLuminousWindowMaterial.js";
import { CityFogSceneGuide } from "./CityFogSceneGuide.js";

const CITY_MODEL_URL = "/models/posibility5/city.glb";
const CITY_POSITION = new THREE.Vector3(2.4, -1.35, -0.15);
const CITY_ROTATION_Y = -0.19;
const CITY_SCALE = 0.9;
const CITY_CAMERA_POSITION = new THREE.Vector3(11.9, 7.35, 14.3);
const CITY_CAMERA_LOOK_AT = new THREE.Vector3(-1.35, -0.62, -0.2);
const CITY_CAMERA_FOV = 39;
const CITY_CAMERA_ASPECT = 16 / 9;
const CITY_CAMERA_VIEW_DIRECTION = new THREE.Vector3(0.72, 0.48, 1).normalize();

function disposeModel(root) {
	const geometries = new Set();
	const materials = new Set();
	const textures = new Set();

	root?.traverse((object) => {
		if (object.geometry) geometries.add(object.geometry);
		const objectMaterials = Array.isArray(object.material)
			? object.material
			: [object.material];
		for (const material of objectMaterials) {
			if (!material) continue;
			materials.add(material);
			for (const value of Object.values(material)) {
				if (value?.isTexture) textures.add(value);
			}
		}
	});

	for (const geometry of geometries) geometry.dispose();
	for (const material of materials) material.dispose();
	for (const texture of textures) texture.dispose();
}

export class CityModelWorld {
	constructor(scene) {
		this.scene = scene;
		this.group = new THREE.Group();
		this.group.name = "CapabilityCityModelWorld";
		this.group.position.copy(CITY_POSITION);
		this.group.rotation.y = CITY_ROTATION_Y;
		this.group.scale.setScalar(CITY_SCALE);
		this.group.visible = false;
		this.cameraPosition = CITY_CAMERA_POSITION.clone();
		this.cameraLookAt = CITY_CAMERA_LOOK_AT.clone();
		this.model = null;
		this.windowMaterial = null;
		this.sceneFog = scene.fog?.isFogExp2 ? scene.fog : null;
		this.sceneFogDefaultDensity = this.sceneFog?.density ?? CITY_WINDOW_MATERIAL_DEFAULTS.fogDensity;
		this.sceneFogDefaultColor = this.sceneFog?.color.clone() ?? new THREE.Color(CITY_WINDOW_MATERIAL_DEFAULTS.fogColor);
		this.cityFogDensity = CITY_WINDOW_MATERIAL_DEFAULTS.fogDensity;
		this.cityFogColor = new THREE.Color(CITY_WINDOW_MATERIAL_DEFAULTS.fogColor);
		this.fogSceneGuide = import.meta.env.DEV
			? new CityFogSceneGuide(scene, CITY_WINDOW_MATERIAL_DEFAULTS)
			: null;
		this.disposed = false;

		const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
		ambientLight.name = "CityAmbientLight";
		const directionalLight = new THREE.DirectionalLight(0xffffff, 4);
		directionalLight.name = "CityDirectionalLight";
		directionalLight.position.set(8, 12, 10);
		directionalLight.target.position.set(0, 2, 0);
		this.group.add(ambientLight, directionalLight, directionalLight.target);
		scene.add(this.group);

		this.readyPromise = this._loadModel();
	}

	async _loadModel() {
		const gltf = await createGLTFLoader().loadAsync(CITY_MODEL_URL);
		const model = gltf.scene;

		if (this.disposed || !this.scene) {
			disposeModel(model);
			return false;
		}

		model.name = "CityGlbModel";
		model.updateMatrixWorld(true);
		const bounds = new THREE.Box3().setFromObject(model);
		if (bounds.isEmpty()) {
			disposeModel(model);
			throw new Error(`[CityModelWorld] ${CITY_MODEL_URL} contains no renderable geometry`);
		}

		const windowMaterial = createCityLuminousWindowMaterial();
		const windowMeshCount = replaceCityWindowMaterial(model, windowMaterial);
		if (windowMeshCount === 0) {
			windowMaterial.dispose();
			disposeModel(model);
			throw new Error(
				`[CityModelWorld] ${CITY_MODEL_URL} contains no WindowMaterial meshes`,
			);
		}
		this.windowMaterial = windowMaterial;

		const center = bounds.getCenter(new THREE.Vector3());
		model.position.x -= center.x;
		model.position.y -= bounds.min.y;
		model.position.z -= center.z;

		this.model = model;
		this.group.add(model);
		this._frameCameraToModel(model);
		return true;
	}

	_frameCameraToModel(model) {
		this.group.updateMatrixWorld(true);
		const bounds = new THREE.Box3().setFromObject(model);
		if (bounds.isEmpty()) return;
		const center = bounds.getCenter(new THREE.Vector3());
		const size = bounds.getSize(new THREE.Vector3());
		const verticalHalfFov = THREE.MathUtils.degToRad(CITY_CAMERA_FOV * 0.5);
		const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * CITY_CAMERA_ASPECT);
		const verticalDistance = size.y * 0.5 / Math.tan(verticalHalfFov);
		const horizontalDistance = size.x * 0.5 / Math.tan(horizontalHalfFov);
		const distance = Math.max(verticalDistance, horizontalDistance) * 1.28 + size.z * 0.5;
		this.cameraLookAt.copy(center);
		this.cameraPosition.copy(center).addScaledVector(CITY_CAMERA_VIEW_DIRECTION, distance);
	}

	setRenderEnabled(enabled) {
		const visible = enabled === true;
		this.group.visible = visible;
		if (this.sceneFog) {
			this.sceneFog.density = visible
				? this.cityFogDensity
				: this.sceneFogDefaultDensity;
			this.sceneFog.color.copy(visible ? this.cityFogColor : this.sceneFogDefaultColor);
		}
		this.fogSceneGuide?.setSceneVisible(visible);
	}

	getOrbitTarget(target = new THREE.Vector3()) {
		return target.copy(this.cameraLookAt);
	}

	applyCamera(camera, parallax) {
		camera.position.copy(this.cameraPosition);
		camera.position.x += (Number(parallax?.x) || 0) * 0.58;
		camera.position.y += (Number(parallax?.y) || 0) * 0.42;
		camera.fov = CITY_CAMERA_FOV;
		camera.updateProjectionMatrix();
		camera.lookAt(this.cameraLookAt);
		camera.updateMatrixWorld(true);
		this.fogSceneGuide?.updateCamera(camera);
	}

	update() {
		return false;
	}

	getWindowMaterialSettings() {
		const uniforms = this.windowMaterial?.uniforms;
		if (!uniforms) return null;
		return {
			intensity: uniforms.uIntensity.value,
			fogColor: `#${uniforms.uFogColor.value.getHexString()}`,
			fogDensity: uniforms.uFogDensity.value,
			fogNear: uniforms.uFogNear.value,
			fogPower: uniforms.uFogPower.value,
			fogOpacity: uniforms.uFogOpacity.value,
		};
	}

	setWindowMaterialSettings(settings = {}) {
		const uniforms = this.windowMaterial?.uniforms;
		if (!uniforms) return null;
		if (settings.intensity != null) {
			const intensity = Number(settings.intensity);
			if (!Number.isFinite(intensity)) return null;
			uniforms.uIntensity.value = THREE.MathUtils.clamp(intensity, 0, 6);
		}
		if (settings.fogColor != null) {
			try {
				this.cityFogColor.set(settings.fogColor);
				uniforms.uFogColor.value.copy(this.cityFogColor);
				if (this.group.visible && this.sceneFog) {
					this.sceneFog.color.copy(this.cityFogColor);
				}
			} catch {
				return null;
			}
		}
		if (settings.fogDensity != null) {
			const fogDensity = Number(settings.fogDensity);
			if (!Number.isFinite(fogDensity)) return null;
			this.cityFogDensity = THREE.MathUtils.clamp(fogDensity, 0, 0.25);
			uniforms.uFogDensity.value = this.cityFogDensity;
			if (this.group.visible && this.sceneFog) {
				this.sceneFog.density = this.cityFogDensity;
			}
		}
		for (const [key, uniformName, min, max] of [
			["fogNear", "uFogNear", 0, 80],
			["fogPower", "uFogPower", 0.1, 6],
			["fogOpacity", "uFogOpacity", 0, 1],
		]) {
			if (settings[key] == null) continue;
			const value = Number(settings[key]);
			if (!Number.isFinite(value)) return null;
			uniforms[uniformName].value = THREE.MathUtils.clamp(value, min, max);
		}
		const resolved = this.getWindowMaterialSettings();
		this.fogSceneGuide?.setProfile(resolved);
		return resolved;
	}

	resetWindowMaterialSettings() {
		return this.setWindowMaterialSettings(CITY_WINDOW_MATERIAL_DEFAULTS);
	}

	setFogSceneGuideEnabled(enabled) {
		return this.fogSceneGuide?.setEnabled(enabled) ?? false;
	}

	isFogSceneGuideEnabled() {
		return this.fogSceneGuide?.enabled === true;
	}

	dispose(scene = this.scene) {
		this.disposed = true;
		if (this.sceneFog) {
			this.sceneFog.density = this.sceneFogDefaultDensity;
			this.sceneFog.color.copy(this.sceneFogDefaultColor);
		}
		scene?.remove(this.group);
		disposeModel(this.model);
		this.model = null;
		this.windowMaterial = null;
		this.fogSceneGuide?.dispose();
		this.fogSceneGuide = null;
		this.group.clear();
		this.sceneFog = null;
		this.sceneFogDefaultColor = null;
		this.cityFogColor = null;
		this.scene = null;
	}
}
