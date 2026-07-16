import * as THREE from "three";
import { projectsData, getLogoAccent } from "./projectsData.js";
import { portfolioHubPlatesConfig } from "./portfolioHubConfig.js";
import {
	portfolioHubLogoConfig,
	getLogoLayerConfig,
} from "./portfolioHubLogoConfig.js";
import {
	createPortfolioLogoMaterial,
	applyLogoRevealConfig,
	applyLogoAccent,
	getLogoPlaneSizeForAspect,
} from "./portfolioLogoMaterial.js";
import { getRevealSeedForProject } from "./logoBrickReveal.js";

const LOGO_SLOT_DEFS = [
	{ id: "front", z: (depth) => depth * 0.5 },
	{ id: "back", z: (depth) => -depth * 0.5 },
	{
		id: "frontFloat",
		z: (depth) => depth * 0.5 + portfolioHubLogoConfig.floatZOffset,
		floatFromFront: true,
	},
];

function getTextureAspect(texture) {
	const image = texture?.image;
	if (image?.width && image?.height) {
		return image.width / image.height;
	}
	return 1;
}

/**
 * Три слоя логотипа на плите: зад, перед, float — светятся через bloom.
 */
export class CenterPlateNipigasLogos {
	constructor() {
		this.loaded = false;
		this.anchor = new THREE.Group();
		this.instances = [];
		this.logoGeometry = null;
		this.hitGeometry = null;
		this.hitMaterial = null;
		this.hitArea = null;
		this.textureAspect = 1;
		this.currentPlateMesh = null;
		this.currentFlatIndex = -1;
		this.currentProjectIndex = -1;
		this.pendingPlate = null;
		this.textures = new Map();
		this.disposables = [];
		this._revealProgress = 0;
		this._revealLinear = 0;
		this._revealEnter = 0;
		/** 0…1 — hover: логотип ближе к грани плиты. */
		this._logoHover = 0;
		this._logoHoverTarget = 0;

		this.readyPromise = this._loadAll().catch((error) => {
			console.error("[HubPlateLogos] prepare failed", error);
			return false;
		});
	}

	_getRevealSeed(projectIndex) {
		return getRevealSeedForProject(projectIndex);
	}

	_applyAccentToMaterials(projectIndex) {
		const accent = getLogoAccent(projectIndex);
		for (const mesh of this.instances) {
			applyLogoAccent(mesh.material.uniforms, accent);
		}
	}

	_applyRevealConfigToMaterials(projectIndex) {
		const logoPlaneSize = this._getLogoPlaneSize();
		const revealSeed = this._getRevealSeed(projectIndex);
		for (const mesh of this.instances) {
			applyLogoRevealConfig(mesh.material.uniforms, logoPlaneSize, revealSeed);
		}
	}

	_getLogoPlaneSize(aspect = this.textureAspect) {
		return getLogoPlaneSizeForAspect(aspect);
	}

	async _loadAll() {
		const loader = new THREE.TextureLoader();
		const results = await Promise.allSettled(
			projectsData.map((project, index) =>
				loader.loadAsync(project.hubLogo).then((texture) => ({ index, texture })),
			),
		);

		for (const result of results) {
			if (result.status !== "fulfilled") {
				console.warn("[HubPlateLogos] logo load failed", result.reason);
				continue;
			}

			const { index, texture } = result.value;
			texture.colorSpace = THREE.SRGBColorSpace;
			this.textures.set(index, texture);
			this.disposables.push(texture);
		}

		if (this.textures.size === 0) {
			console.error("[HubPlateLogos] no project logos loaded");
			return;
		}

		this._buildInstances();
		this.loaded = true;
		this._applySlotTransforms();
		this._attachPendingPlate();
		return true;
	}

	/** Синхронизация uniform-ов и слоёв из portfolioHubLogoConfig (dev-панель / HMR). */
	refreshLogoConfig() {
		if (!this.loaded) {
			return;
		}

		if (this.currentProjectIndex >= 0) {
			this._applyRevealConfigToMaterials(this.currentProjectIndex);
			this._applyAccentToMaterials(this.currentProjectIndex);
		}

		for (const mesh of this.instances) {
			const slotId = mesh.userData.logoSlot?.id;
			if (!slotId) {
				continue;
			}
			const layer = getLogoLayerConfig(slotId);
			const uniforms = mesh.material.uniforms;
			uniforms.bloomBoost.value =
				portfolioHubLogoConfig.logoEmissiveBoost[slotId] ?? 1;
			uniforms.blur.value = layer.blur ?? 0;
			mesh.material.userData.baseOpacity = layer.opacity ?? 1;
			applyLogoRevealConfig(
				uniforms,
				this._getLogoPlaneSize(),
				this._getRevealSeed(this.currentProjectIndex),
			);
		}

		this._applyRevealUniforms();
	}

	_syncMaterialConfigFromHub() {
		if (!this.loaded) {
			return;
		}

		for (const mesh of this.instances) {
			const slotId = mesh.userData.logoSlot?.id;
			if (!slotId) {
				continue;
			}
			const uniforms = mesh.material.uniforms;
			uniforms.bloomBoost.value =
				portfolioHubLogoConfig.logoEmissiveBoost[slotId] ?? 1;
			applyLogoRevealConfig(
				uniforms,
				this._getLogoPlaneSize(),
				this._getRevealSeed(this.currentProjectIndex),
			);
		}
	}

	_buildInstances() {
		const projectIndex = this.currentProjectIndex >= 0 ? this.currentProjectIndex : 0;
		const revealSeed = this._getRevealSeed(projectIndex);
		this.textureAspect = getTextureAspect(this.textures.values().next().value);
		this.logoGeometry = this._createLogoGeometry();
		this.disposables.push(this.logoGeometry);

		const placeholderTexture = this.textures.values().next().value;

		for (const slot of LOGO_SLOT_DEFS) {
			const layer = getLogoLayerConfig(slot.id);
			const bloomBoost = portfolioHubLogoConfig.logoEmissiveBoost[slot.id] ?? 1;
			const material = createPortfolioLogoMaterial(placeholderTexture, {
				opacity: layer.opacity,
				blur: layer.blur,
				bloomBoost,
				revealSeed,
				logoPlaneSize: this._getLogoPlaneSize(),
			});
			material.userData.baseOpacity = layer.opacity ?? 1;
			this.disposables.push(material);

			const mesh = new THREE.Mesh(this.logoGeometry, material);
			mesh.name = `hubPlateLogo_${slot.id}`;
			mesh.renderOrder = 20;
			mesh.userData.logoSlot = slot;
			mesh.raycast = () => {};
			this.instances.push(mesh);
			this.anchor.add(mesh);
		}

		this.hitGeometry = this._createLogoHitGeometry();
		this.hitMaterial = new THREE.MeshBasicMaterial({
			transparent: true,
			opacity: 0,
			depthWrite: false,
		});
		this.hitArea = new THREE.Mesh(this.hitGeometry, this.hitMaterial);
		this.hitArea.name = "hubPlateLogoHitArea";
		this.disposables.push(this.hitGeometry, this.hitMaterial);
		this.anchor.add(this.hitArea);

		this._syncMaterialConfigFromHub();
	}

	_createLogoGeometry() {
		const planeSize = this._getLogoPlaneSize();
		return new THREE.PlaneGeometry(planeSize.x, planeSize.y);
	}

	_createLogoHitGeometry() {
		const planeSize = this._getLogoPlaneSize();
		const hitCfg = portfolioHubPlatesConfig.interaction?.hoverMotion?.hitAreas?.logo ?? {};
		return new THREE.PlaneGeometry(
			planeSize.x * (hitCfg.scaleX ?? 1),
			planeSize.y * (hitCfg.scaleY ?? 1),
		);
	}

	_rebuildLogoGeometry() {
		if (!this.loaded) {
			return;
		}

		this.logoGeometry?.dispose();
		this.logoGeometry = this._createLogoGeometry();
		this.disposables.push(this.logoGeometry);

		for (const mesh of this.instances) {
			mesh.geometry = this.logoGeometry;
		}

		this.hitGeometry?.dispose();
		this.hitGeometry = this._createLogoHitGeometry();
		this.disposables.push(this.hitGeometry);
		if (this.hitArea) {
			this.hitArea.geometry = this.hitGeometry;
		}
	}

	_applyProjectTexture(projectIndex) {
		if (this.currentProjectIndex === projectIndex) {
			return this.textures.has(projectIndex);
		}

		const texture = this.textures.get(projectIndex);
		if (!texture) {
			return false;
		}

		const nextAspect = getTextureAspect(texture);
		if (nextAspect !== this.textureAspect) {
			this.textureAspect = nextAspect;
			this._rebuildLogoGeometry();
		}

		const width = texture.image?.width || 1024;
		const height = texture.image?.height || 512;

		for (const mesh of this.instances) {
			const uniforms = mesh.material.uniforms;
			uniforms.map.value = texture;
			uniforms.blurStep.value.set(1 / width, 1 / height);
			uniforms.logoPlaneSize.value.copy(this._getLogoPlaneSize(nextAspect));
			uniforms.revealProgress.value = this._revealProgress;
		}

		this._applyRevealConfigToMaterials(projectIndex);
		this._applyAccentToMaterials(projectIndex);

		this.currentProjectIndex = projectIndex;
		return true;
	}

	_applySlotTransforms(reveal = this._revealProgress) {
		const depth = portfolioHubPlatesConfig.depth;
		const frontZ = depth * 0.5;
		const logoZPull =
			portfolioHubPlatesConfig.interaction?.hoverMotion?.logoZPull ?? 0.004;

		for (const mesh of this.instances) {
			const slot = mesh.userData.logoSlot;
			if (!slot) {
				continue;
			}

			if (slot.floatFromFront) {
				const targetZ = slot.z(depth);
				const floatZ = frontZ + (targetZ - frontZ) * reveal;
				const hoverZ = -logoZPull * this._logoHover;
				mesh.position.set(0, 0, floatZ + hoverZ);
			} else {
				mesh.position.set(0, 0, slot.z(depth));
			}
			mesh.rotation.set(0, 0, 0);
		}

		if (this.hitArea) {
			const targetZ = frontZ + portfolioHubLogoConfig.floatZOffset;
			const floatZ = frontZ + (targetZ - frontZ) * reveal;
			const hoverZ = -logoZPull * this._logoHover;
			this.hitArea.position.set(0, 0, floatZ + hoverZ);
			this.hitArea.rotation.set(0, 0, 0);
		}
	}

	getFrontFloatMesh() {
		return (
			this.instances.find((mesh) => mesh.userData.logoSlot?.floatFromFront) ?? null
		);
	}

	getHitArea() {
		if (!this.anchor.visible || !this.currentPlateMesh) {
			return null;
		}
		return this.hitArea;
	}

	setLogoHover(active) {
		this._logoHoverTarget = active ? 1 : 0;
	}

	updateHover(delta) {
		const duration =
			portfolioHubPlatesConfig.interaction?.hoverMotion?.smoothDuration ?? 0.22;
		const t = 1 - Math.exp(-delta / Math.max(duration, 0.001));
		this._logoHover += (this._logoHoverTarget - this._logoHover) * t;

		if (Math.abs(this._logoHover - this._logoHoverTarget) < 0.0005) {
			this._logoHover = this._logoHoverTarget;
		}

		this._applySlotTransforms(this._revealProgress);
	}

	_applyRevealUniforms() {
		for (const mesh of this.instances) {
			const base = mesh.material.userData.baseOpacity ?? 1;
			const uniforms = mesh.material.uniforms;
			uniforms.opacity.value = base;
			uniforms.revealProgress.value = this._revealProgress;
			uniforms.revealLinear.value = this._revealLinear;
			uniforms.revealEnter.value = this._revealEnter;
		}

		this._applySlotTransforms(this._revealProgress);
		this.anchor.visible =
			this._revealProgress > 0.001 && this.currentPlateMesh != null;
	}

	/** @param {number} alpha 0…1 — fade + выезд frontFloat (Z) */
	setRevealAlpha(alpha, options = {}) {
		if (!this.loaded) {
			return;
		}
		this._syncMaterialConfigFromHub();
		this.refreshLogoConfig();
		this._revealProgress = Math.max(0, Math.min(1, alpha));
		// revealLinear — raw progress сборки кубиков (0…1); при exit заморожен.
		this._revealLinear = Math.max(
			0,
			Math.min(1, options.partLinear ?? options.linear ?? this._revealProgress),
		);
		this._revealEnter = options.entering ? 1 : 0;
		this._applyRevealUniforms();
	}

	updatePlate(plate) {
		this.pendingPlate = plate ?? null;
		if (!this.loaded) {
			return;
		}
		this._attachPendingPlate();
	}

	_attachPendingPlate() {
		const plate = this.pendingPlate;

		if (!plate?.mesh || plate.projectIndex == null || plate.projectIndex < 0) {
			this._detach();
			this.currentFlatIndex = -1;
			this.currentProjectIndex = -1;
			return;
		}

		if (!this._applyProjectTexture(plate.projectIndex)) {
			this._detach();
			this.currentFlatIndex = -1;
			this.currentProjectIndex = -1;
			return;
		}

		if (
			this.currentPlateMesh === plate.mesh &&
			this.anchor.parent === plate.mesh
		) {
			this.currentFlatIndex = plate.flatIndex;
			return;
		}

		this._detach(false);
		plate.mesh.add(this.anchor);
		this.currentPlateMesh = plate.mesh;
		this.currentFlatIndex = plate.flatIndex;
		this._applyRevealUniforms();
	}

	refreshLayout() {
		if (!this.loaded) {
			return;
		}
		this._rebuildLogoGeometry();
		this._applySlotTransforms();
	}

	_detach(resetProgress = true) {
		this._logoHover = 0;
		this._logoHoverTarget = 0;
		if (resetProgress) {
			this._revealProgress = 0;
			this._revealLinear = 0;
			this._revealEnter = 0;
			this._applyRevealUniforms();
		}
		this.currentPlateMesh?.remove(this.anchor);
		this.currentPlateMesh = null;
	}

	dispose() {
		this._detach();
		for (const item of this.disposables) {
			item?.dispose?.();
		}
		this.disposables = [];
		this.instances = [];
		this.hitArea = null;
		this.hitGeometry = null;
		this.hitMaterial = null;
		this.textures.clear();
		this.logoGeometry = null;
		this.loaded = false;
	}
}
