import * as THREE from "three";

const _dummy = new THREE.Object3D();

function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

function smootherStep(value) {
	const t = clamp01(value);
	return t * t * t * (t * (t * 6 - 15) + 10);
}

function hashGridCell(rowIndex, plateIndex, salt = 0) {
	const value = Math.sin((rowIndex + 1) * 12.9898 + (plateIndex + 1) * 78.233 + salt * 37.719) * 43758.5453;
	return value - Math.floor(value);
}

function getMaterials(materialOrArray) {
	return Array.isArray(materialOrArray) ? materialOrArray : materialOrArray ? [materialOrArray] : [];
}

function getFaceMaterial(materialOrArray) {
	return getMaterials(materialOrArray)[0] ?? null;
}

/**
 * Плиты хаба: InstancedMesh для декора (1 draw call) + отдельные mesh только на проектах (логотипы, slide).
 */
export class HubPlatesRenderer {
	constructor(platesGroup) {
		this.platesGroup = platesGroup;
		/** @type {Array<{ rowIndex: number, plateIndex: number, projectIndex: number, basePosition: number[], mesh: THREE.Mesh | null, instanceId: number }>} */
		this.plates = [];
		this.sharedGeometry = null;
		this.projectGeometry = null;
		this.decorMaterial = null;
		this.projectMaterial = null;
		this.instancedMesh = null;
		this._geometryKey = "";
		this._decorMosaicProgress = -1;
	}

	build({ cfg, layouts, projectLookup, buildGeometry, buildProjectGeometry, createProjectMaterial, createDecorMaterial }) {
		this.dispose();

		this.sharedGeometry = buildGeometry(cfg);
		this.projectGeometry = buildProjectGeometry?.(cfg) ?? this.sharedGeometry;
		this.projectMaterial = createProjectMaterial();
		this.decorMaterial = createDecorMaterial?.() ?? this.projectMaterial;
		this._geometryKey = `${cfg.plateSize}:${cfg.depth}:${cfg.caseSelection?.aspectRatio ?? 1}`;

		const instanceEntries = [];

		for (const layout of layouts) {
			const projectIndex = projectLookup.get(`${layout.rowIndex},${layout.plateIndex}`) ?? -1;

			const plate = {
				rowIndex: layout.rowIndex,
				plateIndex: layout.plateIndex,
				projectIndex,
				basePosition: [...layout.position],
				mesh: null,
				instanceId: -1,
			};

			if (projectIndex >= 0) {
				const mesh = new THREE.Mesh(this.projectGeometry, this.projectMaterial);
				mesh.updateMorphTargets();
				mesh.position.set(layout.position[0], layout.position[1], layout.position[2]);
				this.platesGroup.add(mesh);
				plate.mesh = mesh;
			} else {
				instanceEntries.push({ plate, layout });
			}

			this.plates.push(plate);
		}

		if (instanceEntries.length > 0) {
			this.instancedMesh = new THREE.InstancedMesh(this.sharedGeometry, this.decorMaterial, instanceEntries.length);
			this.instancedMesh.frustumCulled = true;

			for (let index = 0; index < instanceEntries.length; index += 1) {
				const { plate, layout } = instanceEntries[index];
				plate.instanceId = index;
				_dummy.position.set(layout.position[0], layout.position[1], layout.position[2]);
				_dummy.rotation.set(0, 0, 0);
				_dummy.scale.set(1, 1, 1);
				_dummy.updateMatrix();
				this.instancedMesh.setMatrixAt(index, _dummy.matrix);
			}

			this.instancedMesh.instanceMatrix.needsUpdate = true;
			this.platesGroup.add(this.instancedMesh);
		}
		this._decorMosaicProgress = 0;
	}

	rebuildGeometry(buildGeometry, cfg) {
		const geometryKey = `${cfg.plateSize}:${cfg.depth}`;
		if (this._geometryKey === geometryKey) {
			return false;
		}

		this.sharedGeometry?.dispose();
		this.sharedGeometry = buildGeometry(cfg);
		this._geometryKey = geometryKey;

		if (this.instancedMesh) {
			this.instancedMesh.geometry = this.sharedGeometry;
		}

		for (const plate of this.plates) {
			if (plate.projectIndex >= 0 && plate.mesh) {
				plate.mesh.geometry = this.sharedGeometry;
			}
		}

		return true;
	}

	updateLayoutPositions(layoutByKey) {
		let instancesDirty = false;

		for (const plate of this.plates) {
			const layout = layoutByKey.get(`${plate.rowIndex},${plate.plateIndex}`);
			if (!layout) {
				continue;
			}

			plate.basePosition = [...layout.position];

			if (plate.projectIndex >= 0 && plate.mesh) {
				plate.mesh.position.set(layout.position[0], layout.position[1], layout.position[2]);
				continue;
			}

			if (plate.instanceId >= 0 && this.instancedMesh) {
				_dummy.position.set(layout.position[0], layout.position[1], layout.position[2]);
				_dummy.rotation.set(0, 0, 0);
				_dummy.scale.set(1, 1, 1);
				_dummy.updateMatrix();
				this.instancedMesh.setMatrixAt(plate.instanceId, _dummy.matrix);
				instancesDirty = true;
			}
		}

		if (instancesDirty && this.instancedMesh) {
			this.instancedMesh.instanceMatrix.needsUpdate = true;
		}
		this._decorMosaicProgress = 0;
	}

	setDecorMosaicProgress(progress, config = {}) {
		if (!this.instancedMesh) {
			return false;
		}

		const nextProgress = clamp01(progress);
		if (Math.abs(nextProgress - this._decorMosaicProgress) < 0.00005) {
			return false;
		}

		const delaySpread = Math.min(0.9, Math.max(0, config.delaySpread ?? 0.58));
		const randomness = clamp01(config.randomness ?? 0.72);
		const scatter = config.scatter ?? [0.45, 0.7, -1.1];
		const rotationDeg = config.rotationDeg ?? [14, 20, 9];
		const minScale = Math.max(0.0001, config.minScale ?? 0.001);
		let instancesDirty = false;

		for (const plate of this.plates) {
			if (plate.instanceId < 0) {
				continue;
			}

			const randomDelay = hashGridCell(plate.rowIndex, plate.plateIndex, 1);
			const checkerDelay = ((plate.rowIndex * 3 + plate.plateIndex) % 9) / 8;
			const delay = (randomDelay * randomness + checkerDelay * (1 - randomness)) * delaySpread;
			const localProgress = smootherStep((nextProgress - delay) / Math.max(1 - delaySpread, 0.001));
			const seedX = hashGridCell(plate.rowIndex, plate.plateIndex, 2) * 2 - 1;
			const seedY = hashGridCell(plate.rowIndex, plate.plateIndex, 3) * 2 - 1;
			const seedZ = hashGridCell(plate.rowIndex, plate.plateIndex, 4) * 2 - 1;
			const [baseX, baseY, baseZ] = plate.basePosition;
			const scale = Math.max(minScale, 1 - localProgress);
			const verticalProgress = Math.pow(
				localProgress,
				0.82 + Math.abs(seedY) * 0.28,
			);

			_dummy.position.set(
				baseX + seedX * scatter[0] * localProgress,
				baseY + seedY * scatter[1] * localProgress,
				baseZ + (scatter[2] + seedZ * Math.abs(scatter[2]) * 0.22) * localProgress,
			);
			_dummy.rotation.set(
				THREE.MathUtils.degToRad(seedY * rotationDeg[0] * localProgress),
				THREE.MathUtils.degToRad(seedX * rotationDeg[1] * localProgress),
				THREE.MathUtils.degToRad(seedZ * rotationDeg[2] * localProgress),
			);
			_dummy.scale.set(scale, Math.max(minScale, 1 - verticalProgress), scale);
			_dummy.updateMatrix();
			this.instancedMesh.setMatrixAt(plate.instanceId, _dummy.matrix);
			instancesDirty = true;
		}

		if (instancesDirty) {
			this.instancedMesh.instanceMatrix.needsUpdate = true;
		}
		this._decorMosaicProgress = nextProgress;
		return instancesDirty;
	}

	resetDecorMosaic() {
		this._decorMosaicProgress = -1;
		this.setDecorMosaicProgress(0);
	}

	setProjectPlatePositions(getSlideProgress, slideX) {
		for (const plate of this.plates) {
			if (plate.projectIndex < 0 || !plate.mesh) {
				continue;
			}

			const [baseX, baseY, baseZ] = plate.basePosition;
			const progress = getSlideProgress(plate.projectIndex);
			plate.mesh.position.set(baseX + slideX * progress, baseY, baseZ);
		}
	}

	resetProjectPlatePositions() {
		for (const plate of this.plates) {
			if (plate.projectIndex < 0 || !plate.mesh) {
				continue;
			}

			const [baseX, baseY, baseZ] = plate.basePosition;
			plate.mesh.position.set(baseX, baseY, baseZ);
			plate.mesh.rotation.set(0, 0, 0);
			plate.mesh.scale.set(1, 1, 1);
			if (plate.mesh.morphTargetInfluences) {
				plate.mesh.morphTargetInfluences[0] = 0;
			}
		}
	}

	resetProjectPlateScales() {
		for (const plate of this.plates) {
			if (plate.projectIndex >= 0 && plate.mesh) {
				plate.mesh.scale.set(1, 1, 1);
				if (plate.mesh.morphTargetInfluences) {
					plate.mesh.morphTargetInfluences[0] = 0;
				}
			}
		}
	}

	setMaterialOpacity(opacity) {
		for (const material of getMaterials(this.projectMaterial)) {
			material.opacity = opacity;
		}
		if (this.decorMaterial && this.decorMaterial !== this.projectMaterial) {
			for (const material of getMaterials(this.decorMaterial)) {
				material.opacity = opacity;
			}
		}
	}

	setDecorMaterialOpacity(opacity) {
		for (const material of getMaterials(this.decorMaterial)) {
			material.opacity = opacity;
		}
	}

	/**
	 * Заменить материалы без пересборки геометрии (dev / perf).
	 * @param {THREE.Material | THREE.Material[]} projectMaterial
	 * @param {THREE.Material | THREE.Material[]} [decorMaterial]
	 */
	replaceMaterials(projectMaterial, decorMaterial = projectMaterial) {
		const prevProject = this.projectMaterial;
		const prevDecor = this.decorMaterial;

		this.projectMaterial = projectMaterial;
		this.decorMaterial = decorMaterial;

		for (const plate of this.plates) {
			if (plate.mesh) {
				plate.mesh.material = projectMaterial;
			}
		}
		if (this.instancedMesh) {
			this.instancedMesh.material = decorMaterial;
		}

		const nextMaterials = new Set([...getMaterials(projectMaterial), ...getMaterials(decorMaterial)]);
		const previousMaterials = new Set([...getMaterials(prevProject), ...getMaterials(prevDecor)]);
		for (const material of previousMaterials) {
			if (!nextMaterials.has(material)) {
				material.dispose();
			}
		}
	}

	/** Dev-панель: цвет и физические параметры без пересборки геометрии. */
	applyMaterialConfig(m) {
		const applyTo = (material, config) => {
			if (!material) {
				return;
			}
			if (material.color && config.color != null) {
				material.color.set(config.color);
			}
			if (material.roughness != null && config.roughness != null) {
				material.roughness = config.roughness;
			}
			if (material.metalness != null && config.metalness != null) {
				material.metalness = config.metalness;
			}
			const transmissionModeChanged =
				material.transmission != null && config.transmission != null && (material.transmission > 0) !== (config.transmission > 0);
			const clearcoatModeChanged =
				material.clearcoat != null && config.clearcoat != null && (material.clearcoat > 0) !== (config.clearcoat > 0);
			if (material.transmission != null && config.transmission != null) {
				material.transmission = config.transmission;
			}
			// Keep depthWrite off for transparent plates (logos/labels on surface).
			if (material.depthWrite != null) {
				material.depthWrite = false;
			}
			if (material.thickness != null && config.thickness != null) {
				material.thickness = config.thickness;
			}
			if (material.clearcoat != null && config.clearcoat != null) {
				material.clearcoat = config.clearcoat;
			}
			if (material.clearcoatRoughness != null && config.clearcoatRoughness != null) {
				material.clearcoatRoughness = config.clearcoatRoughness;
			}
			if (material.ior != null && config.ior != null) {
				material.ior = config.ior;
			}
			if (material.opacity != null && config.opacity != null) {
				material.opacity = config.opacity;
			}
			if (transmissionModeChanged || clearcoatModeChanged) {
				material.needsUpdate = true;
			}
		};

		const applyToSet = (materialOrArray) => {
			const materials = getMaterials(materialOrArray);
			applyTo(materials[0], m);
			const sideConfig = {
				...m,
				...(m.sides ?? {}),
			};
			for (let index = 1; index < materials.length; index += 1) {
				applyTo(materials[index], sideConfig);
			}
		};

		applyToSet(this.projectMaterial);
		if (this.decorMaterial !== this.projectMaterial) {
			applyToSet(this.decorMaterial);
		}
	}

	getMaterial() {
		return getFaceMaterial(this.projectMaterial);
	}

	getDecorInstanceCount() {
		return this.instancedMesh?.count ?? 0;
	}

	dispose() {
		const materials = new Set([...getMaterials(this.projectMaterial), ...getMaterials(this.decorMaterial)]);

		if (this.instancedMesh) {
			this.platesGroup.remove(this.instancedMesh);
			this.instancedMesh.geometry = null;
			this.instancedMesh.material = null;
			this.instancedMesh.dispose();
			this.instancedMesh = null;
		}

		for (const plate of this.plates) {
			if (plate.projectIndex >= 0 && plate.mesh) {
				this.platesGroup.remove(plate.mesh);
				plate.mesh.geometry = null;
				plate.mesh.material = null;
				plate.mesh = null;
			}
		}

		this.plates = [];
		this.sharedGeometry?.dispose();
		if (this.projectGeometry && this.projectGeometry !== this.sharedGeometry) {
			this.projectGeometry.dispose();
		}
		this.sharedGeometry = null;
		this.projectGeometry = null;

		for (const material of materials) {
			material.dispose();
		}
		this.decorMaterial = null;

		this.projectMaterial = null;
		this._decorMosaicProgress = -1;
	}
}
