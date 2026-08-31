import * as THREE from "three";
import { createGLTFLoader } from "@/three/assets/gltfLoader.js";
import {
	CITY_WINDOW_MATERIAL_DEFAULTS,
	createCityLuminousWindowMaterial,
	replaceCityWindowMaterial,
} from "./cityLuminousWindowMaterial.js";
import { replaceCitySurfaceMaterials } from "./cityBuildingMaterials.js";

const CITY_MODEL_URL = "/models/posibility5/city.glb";
const CITY_POSITION = new THREE.Vector3(2.4, -1.35, -0.15);
const CITY_ROTATION_Y = -0.19;
const CITY_SCALE = 0.9;
// Authored world-space camera. Never derive these values from model bounds:
// moving the model must change the composition instead of moving the camera too.
const CITY_CAMERA_POSITION = new THREE.Vector3(14.673, 8.097, 14.616);
const CITY_CAMERA_LOOK_AT = new THREE.Vector3(3.497, 0.646, -0.906);
const CITY_CAMERA_FOV = 39;

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
		this.disposed = false;

		const ambientLight = new THREE.AmbientLight(0x6f8294, 0.14);
		ambientLight.name = "CityAmbientLight";
		const directionalLight = new THREE.DirectionalLight(0xb8cddd, 0.82);
		directionalLight.name = "CityDirectionalLight";
		directionalLight.position.set(8, 12, 10);
		directionalLight.target.position.set(0, 2, 0);
		const rimLight = new THREE.DirectionalLight(0x3f718f, 0.16);
		rimLight.name = "CityRimLight";
		rimLight.position.set(-9, 5, -7);
		rimLight.target.position.set(1, 1.5, 0);
		this.group.add(
			ambientLight,
			directionalLight,
			directionalLight.target,
			rimLight,
			rimLight.target,
		);
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

		const surfaceMeshCount = replaceCitySurfaceMaterials(model);
		if (surfaceMeshCount === 0) {
			disposeModel(model);
			throw new Error(
				`[CityModelWorld] ${CITY_MODEL_URL} contains no supported building materials`,
			);
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

		// Preserve the authored GLB transform. Runtime centering would cancel edits
		// made to the model in Blender and make CITY_POSITION misleading.
		this.model = model;
		this.group.add(model);
		return true;
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
		return this.getWindowMaterialSettings();
	}

	resetWindowMaterialSettings() {
		return this.setWindowMaterialSettings(CITY_WINDOW_MATERIAL_DEFAULTS);
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
		this.group.clear();
		this.sceneFog = null;
		this.sceneFogDefaultColor = null;
		this.cityFogColor = null;
		this.scene = null;
	}
}
