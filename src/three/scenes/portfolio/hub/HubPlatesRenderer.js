import * as THREE from "three";

const _dummy = new THREE.Object3D();

/**
 * Плиты хаба: InstancedMesh для декора (1 draw call) + отдельные mesh только на проектах (логотипы, slide).
 */
export class HubPlatesRenderer {
	constructor(platesGroup) {
		this.platesGroup = platesGroup;
		/** @type {Array<{ rowIndex: number, plateIndex: number, projectIndex: number, basePosition: number[], mesh: THREE.Mesh | null, instanceId: number }>} */
		this.plates = [];
		this.sharedGeometry = null;
		this.decorMaterial = null;
		this.projectMaterial = null;
		this.instancedMesh = null;
		this._geometryKey = "";
	}

	build({ cfg, layouts, projectLookup, buildGeometry, createProjectMaterial, createDecorMaterial }) {
		this.dispose();

		this.sharedGeometry = buildGeometry(cfg);
		this.projectMaterial = createProjectMaterial();
		this.decorMaterial = createDecorMaterial?.() ?? this.projectMaterial;
		this._geometryKey = `${cfg.plateSize}:${cfg.depth}`;

		const instanceEntries = [];

		for (const layout of layouts) {
			const projectIndex =
				projectLookup.get(`${layout.rowIndex},${layout.plateIndex}`) ?? -1;

			const plate = {
				rowIndex: layout.rowIndex,
				plateIndex: layout.plateIndex,
				projectIndex,
				basePosition: [...layout.position],
				mesh: null,
				instanceId: -1,
			};

			if (projectIndex >= 0) {
				const mesh = new THREE.Mesh(this.sharedGeometry, this.projectMaterial);
				mesh.position.set(
					layout.position[0],
					layout.position[1],
					layout.position[2],
				);
				this.platesGroup.add(mesh);
				plate.mesh = mesh;
			} else {
				instanceEntries.push({ plate, layout });
			}

			this.plates.push(plate);
		}

		if (instanceEntries.length > 0) {
			this.instancedMesh = new THREE.InstancedMesh(
				this.sharedGeometry,
				this.decorMaterial,
				instanceEntries.length,
			);
			this.instancedMesh.frustumCulled = true;

			for (let index = 0; index < instanceEntries.length; index += 1) {
				const { plate, layout } = instanceEntries[index];
				plate.instanceId = index;
				_dummy.position.set(
					layout.position[0],
					layout.position[1],
					layout.position[2],
				);
				_dummy.rotation.set(0, 0, 0);
				_dummy.scale.set(1, 1, 1);
				_dummy.updateMatrix();
				this.instancedMesh.setMatrixAt(index, _dummy.matrix);
			}

			this.instancedMesh.instanceMatrix.needsUpdate = true;
			this.platesGroup.add(this.instancedMesh);
		}
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
				plate.mesh.position.set(
					layout.position[0],
					layout.position[1],
					layout.position[2],
				);
				continue;
			}

			if (plate.instanceId >= 0 && this.instancedMesh) {
				_dummy.position.set(
					layout.position[0],
					layout.position[1],
					layout.position[2],
				);
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
		}
	}

	setMaterialOpacity(opacity) {
		if (this.projectMaterial) {
			this.projectMaterial.opacity = opacity;
		}
		if (this.decorMaterial && this.decorMaterial !== this.projectMaterial) {
			this.decorMaterial.opacity = opacity;
		}
	}

	/** Dev-панель: цвет и физические параметры без пересборки геометрии. */
	applyMaterialConfig(m) {
		const applyTo = (material) => {
			if (!material) {
				return;
			}
			if (material.color) {
				material.color.set(m.color);
			}
			if (material.roughness != null && m.roughness != null) {
				material.roughness = m.roughness;
			}
			if (material.metalness != null && m.metalness != null) {
				material.metalness = m.metalness;
			}
			if (material.transmission != null && m.transmission != null) {
				material.transmission = m.transmission;
				material.depthWrite = m.transmission <= 0;
			}
			if (material.opacity != null && m.opacity != null) {
				material.opacity = m.opacity;
			}
		};

		applyTo(this.projectMaterial);
		if (this.decorMaterial !== this.projectMaterial) {
			applyTo(this.decorMaterial);
		}
	}

	getMaterial() {
		return this.projectMaterial;
	}

	getDecorInstanceCount() {
		return this.instancedMesh?.count ?? 0;
	}

	dispose() {
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
		this.sharedGeometry = null;

		if (this.decorMaterial && this.decorMaterial !== this.projectMaterial) {
			this.decorMaterial.dispose();
		}
		this.decorMaterial = null;

		this.projectMaterial?.dispose();
		this.projectMaterial = null;
	}
}
