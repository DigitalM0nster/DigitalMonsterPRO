import { getScenePixelRatio } from "@/three/renderer/renderResolution.js";
import * as THREE from "three";
import { createGLTFLoader } from "@/three/assets/gltfLoader.js";
import { CityRoadFlow } from "./CityRoadFlow.js";
import { CityDistrictHighlight } from "./CityDistrictHighlight.js";
import { CityDistrictHud } from "./CityDistrictHud.js";
import { CityWorldTitle } from "./CityWorldTitle.js";
import { bindCityDistrictWindows } from "./cityDistrictWindows.js";
import { CITY_TRAFFIC_DEFAULTS, CITY_TRAFFIC_CONTROLS } from "./cityTrafficConfig.js";
import { siteBloomDevOverrides } from "@/three/render/models/siteBloomConfig.js";
import { replaceCitySurfaceMaterials } from "./cityBuildingMaterials.js";
import { loadCityWindowState } from "./cityWindowShader.js";
import { createCityReflectionEnvironment, prepareCityOfficeReflections } from "./cityReflectionEnvironment.js";
import { CityInstanceVisibility } from "./CityInstanceVisibility.js";

const CITY_FOG_COLOR = "#00050b";
const CITY_FOG_DENSITY = CITY_TRAFFIC_DEFAULTS.fogDensity;

const CITY_MODEL_URL = "/models/posibility5/city-approved.glb";
const CITY_POSITION = new THREE.Vector3(2.4, -1.35, -0.15);
const CITY_ROTATION_Y = -0.19;
const CITY_SCALE = 0.055;
// Authored world-space camera. Never derive these values from model bounds:
// moving the model must change the composition instead of moving the camera too.
const CITY_CAMERA_POSITION = new THREE.Vector3(4.3, 3.1, 5.3);
const CITY_CAMERA_LOOK_AT = new THREE.Vector3(0.7, 0.1, 1.0);
const CITY_CAMERA_FOV = 39;

function disposeModel(root, environment = null, officeEnvironment = null) {
	const geometries = new Set();
	const materials = new Set();
	const textures = new Set();

	root?.traverse((object) => {
		if (object.isInstancedMesh) object.dispose();
		if (object.geometry) geometries.add(object.geometry);
		const objectMaterials = Array.isArray(object.material)
			? object.material
			: [object.material];
		for (const material of objectMaterials) {
			if (!material) continue;
			materials.add(material);
			for (const value of Object.values(material)) {
				if (value?.isTexture && value !== environment && value !== officeEnvironment) textures.add(value);
			}
		}
	});

	for (const geometry of geometries) geometry.dispose();
	for (const material of materials) material.dispose();
	for (const texture of textures) texture.dispose();
}

export class CityModelWorld {
	constructor(scene, renderer) {
		this.scene = scene;
		this.renderer = renderer;
		this.roadFlow = null;
		this.districtHighlight = null;
		this.hud = null;
		this.title = null;
		this.windowState = null;
		this.reflectionTarget = null;
		this.officeReflectionTarget = null;
		this.trafficSettings = { ...CITY_TRAFFIC_DEFAULTS };
		this.group = new THREE.Group();
		this.group.name = "CapabilityCityModelWorld";
		this.group.position.copy(CITY_POSITION);
		this.group.rotation.y = CITY_ROTATION_Y;
		this.group.scale.setScalar(CITY_SCALE);
		this.group.visible = false;
		this.cameraPosition = CITY_CAMERA_POSITION.clone();
		this.cameraLookAt = CITY_CAMERA_LOOK_AT.clone();
		this.model = null;
		this.sceneFog = scene.fog?.isFogExp2 ? scene.fog : null;
		this.sceneFogDefaultDensity = this.sceneFog?.density ?? CITY_FOG_DENSITY;
		this.sceneFogDefaultColor = this.sceneFog?.color.clone() ?? new THREE.Color(CITY_FOG_COLOR);
		this.cityFogDensity = CITY_FOG_DENSITY;
		this.cityFogColor = new THREE.Color(CITY_FOG_COLOR);
		this.disposed = false;
		this.instanceVisibility = null;
		this._warmDraw = false;
		this._previousBeforeRender = scene.onBeforeRender;
		this._beforeCityRender = (renderer, renderScene, camera, target) => {
			this._previousBeforeRender.call(renderScene, renderer, renderScene, camera, target);
			// Scene hook runs after final camera/orbit and world matrices, before
			// Three uploads attributes. Mesh.onBeforeRender would be one frame late.
			if (!this._warmDraw && this.group.visible) this.instanceVisibility?.update(camera);
		};
		scene.onBeforeRender = this._beforeCityRender;

		// Sky fill separates roofs, walls and undersides without a shadow pass.
		const ambientLight = new THREE.HemisphereLight(0x95adc1, 0x101822, 0.7);
		ambientLight.name = "CityAmbientLight";
		const directionalLight = new THREE.DirectionalLight(0xb8cddd, 2.5);
		directionalLight.name = "CityDirectionalLight";
		directionalLight.position.set(8, 12, 10);
		directionalLight.target.position.set(0, 2, 0);
		const rimLight = new THREE.DirectionalLight(0x3f718f, 0.65);
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
		const [gltf, pathData, districtData] = await Promise.all([
			createGLTFLoader().loadAsync(CITY_MODEL_URL),
			fetch("/models/posibility5/city-flow-paths.json").then((response) => {
				if (!response.ok) throw new Error("[CityModelWorld] Road routes failed to load");
				return response.json();
			}),
			fetch("/models/posibility5/city-districts.json").then(response => {
				if (!response.ok) throw new Error("[CityModelWorld] District platforms failed to load");
				return response.json();
			}),
		]);
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

		// Shared architectural shaders preserve GLB GPU instancing.
		const windowState = await loadCityWindowState(pathData.windows);
		if (this.disposed) {
			windowState?.texture.dispose(); disposeModel(model);
			return false;
		}
		this.windowState = windowState;
		this.districtHighlight = new CityDistrictHighlight(districtData, this.renderer);
		this.group.add(this.districtHighlight.mesh);
		if (windowState) {
			windowState.districtHighlight = this.districtHighlight;
			windowState.intensity.value = this.trafficSettings.windowIntensity ?? 1;
			windowState.unitScale.value = CITY_SCALE;
			const target = await createCityReflectionEnvironment(this.renderer, () => this.disposed);
			if (this.disposed || !target) {
				target?.dispose(); windowState.texture.dispose(); disposeModel(model);
				this.windowState = null;
				return false;
			}
			this.reflectionTarget = target;
			windowState.environment = target.texture;
		}
		await replaceCitySurfaceMaterials(model, { normalsPrepared: pathData.normalsPrepared === true, windowState });
		if (this.disposed) {
			disposeModel(model, this.reflectionTarget?.texture);
			this.reflectionTarget?.dispose();
			this.reflectionTarget = null;
			return false;
		}
		model.traverse((object) => {
			// Blender's preview strands are replaced by small moving road particles.
			if (object.material?.name === "FLOW THREADS | shader placeholder") object.visible = false;
		});
		bindCityDistrictWindows(model, this.districtHighlight);
		this.instanceVisibility = await CityInstanceVisibility.prepare(model, () => this.disposed);
		if (this.disposed || !this.instanceVisibility) {
			disposeModel(model, this.reflectionTarget?.texture);
			this.reflectionTarget?.dispose(); this.reflectionTarget = null;
			return false;
		}
		const officeTarget = await prepareCityOfficeReflections(this.renderer, model, this.group, windowState, () => this.disposed);
		if (this.disposed || !officeTarget) {
			officeTarget?.dispose(); disposeModel(model, this.reflectionTarget?.texture);
			this.reflectionTarget?.dispose(); this.reflectionTarget = null;
			return false;
		}
		this.officeReflectionTarget = officeTarget;
		model.traverse((object) => {
			if (!object.isMesh) return;
			for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
				if (material.name === "CityArchitectural-office") {
					material.cityOfficeEnvironment = officeTarget.texture;
					material.cityOfficeProbePosition = officeTarget.cityProbePosition;
					material.cityOfficeProbeBounds = officeTarget.cityProbeBounds;
				}
			}
		});

		// Preserve the authored GLB transform. Runtime centering would cancel edits
		// made to the model in Blender and make CITY_POSITION misleading.
		this.model = model;
		this.group.add(model);
		const roadFlow = await CityRoadFlow.create(pathData);
		if (this.disposed) {
			roadFlow.dispose();
			return false;
		}
		this.roadFlow = roadFlow;
		roadFlow.setSettings(this.trafficSettings);
		this.group.add(roadFlow.points, roadFlow.highways, roadFlow.cars);
		await CityDistrictHud.prepare();
		if (this.disposed) return false;
		this.hud = new CityDistrictHud(this.group, this.renderer, this.districtHighlight);
		await CityWorldTitle.prepare();
		if (this.disposed) return false;
		this.title = new CityWorldTitle(this.group, this.renderer);
		return true;
	}

	setRenderEnabled(enabled) {
		const visible = enabled === true;
		this.group.visible = visible;
		if (!visible) this.districtHighlight?.reset();
		if (!visible) this.hud?.reset();
		if (!visible) this.title?.reset();
		if (this.sceneFog) {
			this.sceneFog.density = visible
				? this.cityFogDensity
				: this.sceneFogDefaultDensity;
			this.sceneFog.color.copy(visible ? this.cityFogColor : this.sceneFogDefaultColor);
		}
	}

	getOrbitTarget(target) {
		return target ? target.copy(this.cameraLookAt) : this.cameraLookAt;
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

	beginWarmupDraw() {
		this._warmDraw = true; this.instanceVisibility?.restore();
		this.districtHighlight?.beginWarmupDraw(); this.hud?.beginWarmupDraw(); this.title?.beginWarmupDraw();
	}
	endWarmupDraw() {
		this._warmDraw = false;
		this.districtHighlight?.endWarmupDraw(); this.hud?.endWarmupDraw(); this.title?.endWarmupDraw();
	}

	update(delta, active = false, frame = null, interactionOwned = false, locale = "ru") {
		if (this.group.visible) this.roadFlow?.update(delta, (this.renderer ? getScenePixelRatio(this.renderer) : 1));
		const hovered = this.group.visible && this.districtHighlight
			? this.districtHighlight.update(delta, frame, active && interactionOwned)
			: false;
		if (this.group.visible) this.hud?.update(delta, locale);
		if (this.group.visible) this.title?.update(delta, frame, locale);
		return hovered;
	}

	getTrafficSettings() {
		return { ...this.trafficSettings };
	}

	setTrafficSettings(settings = {}) {
		for (const [key, , min, max] of CITY_TRAFFIC_CONTROLS) {
			if (settings[key] == null) continue;
			if (min === "color") {
				if (/^#[0-9a-f]{6}$/i.test(settings[key])) this.trafficSettings[key] = settings[key];
			} else if (Number.isFinite(Number(settings[key]))) {
				this.trafficSettings[key] = THREE.MathUtils.clamp(Number(settings[key]), min, max);
			}
		}
		this.cityFogDensity = this.trafficSettings.fogDensity;
		this.cityFogColor.set(this.trafficSettings.fogColor);
		if (this.group.visible && this.sceneFog) {
			this.sceneFog.density = this.cityFogDensity;
			this.sceneFog.color.copy(this.cityFogColor);
		}
		this.roadFlow?.setSettings(this.trafficSettings);
		if (this.windowState) this.windowState.intensity.value = this.trafficSettings.windowIntensity ?? 1;
		if (settings.bloom != null && siteBloomDevOverrides) siteBloomDevOverrides.intensity = this.trafficSettings.bloom;
		return this.getTrafficSettings();
	}

	resetTrafficSettings() {
		return this.setTrafficSettings(CITY_TRAFFIC_DEFAULTS);
	}

	dispose(scene = this.scene) {
		this.disposed = true;
		if (this.scene?.onBeforeRender === this._beforeCityRender) this.scene.onBeforeRender = this._previousBeforeRender;
		this.instanceVisibility?.dispose(); this.instanceVisibility = null;
		if (this.sceneFog) {
			this.sceneFog.density = this.sceneFogDefaultDensity;
			this.sceneFog.color.copy(this.sceneFogDefaultColor);
		}
		scene?.remove(this.group);
		this.hud?.dispose(); this.hud = null;
		this.title?.dispose(); this.title = null;
		this.districtHighlight?.dispose();
		this.districtHighlight = null;
		disposeModel(this.model, this.reflectionTarget?.texture, this.officeReflectionTarget?.texture);
		this.officeReflectionTarget?.dispose();
		this.officeReflectionTarget = null;
		this.reflectionTarget?.dispose();
		this.reflectionTarget = null;
		this.roadFlow?.dispose();
		this.roadFlow = null;
		this.windowState = null;
		this.renderer = null;
		this.model = null;
		this.group.clear();
		this.sceneFog = null;
		this.sceneFogDefaultColor = null;
		this.cityFogColor = null;
		this.scene = null;
	}
}
