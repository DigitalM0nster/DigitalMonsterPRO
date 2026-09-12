import * as THREE from "three";
import { loadContactsPlateFinish } from "./loadContactsPlateFinish.js";

/** Static artwork prepared once; the existing logo owner drives every reveal. */
export class ContactsPlateFinish {
	constructor(plates, { plateSize, depth }, loader = { loadAsync: loadContactsPlateFinish }) {
		this.entries = [];
		this.disposed = false;
		this.warming = false;
		this.readyPromise = loader.loadAsync("/images/contacts/plate-finish.svg").then((texture) => {
			if (this.disposed) {
				texture.dispose();
				return false;
			}
			this.texture = texture;
			texture.colorSpace = THREE.SRGBColorSpace;
			texture.anisotropy = 4;
			this.geometry = new THREE.PlaneGeometry(plateSize - 0.1, plateSize - 0.1);
			for (const plate of plates) {
				if (plate.projectIndex < 0 || !plate.mesh) continue;
				const material = new THREE.MeshBasicMaterial({
					map: texture, transparent: true, opacity: 0,
					depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
				});
				const mesh = new THREE.Mesh(this.geometry, material);
				mesh.name = `contactsPlateFinish_${plate.projectIndex}`;
				mesh.position.z = depth * 0.5 + 0.003;
				mesh.renderOrder = 15;
				mesh.visible = false;
				mesh.raycast = () => {};
				plate.mesh.add(mesh);
				this.entries.push({ projectIndex: plate.projectIndex, mesh });
			}
			return true;
		});
	}

	update(logos) {
		if (this.warming) return;
		const index = logos?.anchor.visible ? logos.currentProjectIndex : -1;
		const opacity = logos?._revealProgress ?? 0;
		for (const entry of this.entries) {
			const active = entry.projectIndex === index && opacity > 0.001;
			entry.mesh.visible = active;
			entry.mesh.material.opacity = active ? opacity : 0;
		}
	}

	beginWarmupDraw() {
		this.warming = true;
		return this.entries.map(({ mesh }) => {
			const saved = { mesh, visible: mesh.visible, frustumCulled: mesh.frustumCulled, opacity: mesh.material.opacity };
			mesh.visible = true;
			mesh.frustumCulled = false;
			mesh.material.opacity = 1;
			return saved;
		});
	}

	endWarmupDraw(token = []) {
		for (const { mesh, visible, frustumCulled, opacity } of token) {
			mesh.visible = visible;
			mesh.frustumCulled = frustumCulled;
			mesh.material.opacity = opacity;
		}
		this.warming = false;
	}

	dispose() {
		this.disposed = true;
		for (const { mesh } of this.entries) {
			mesh.removeFromParent();
			mesh.material.dispose();
		}
		this.entries = [];
		this.geometry?.dispose();
		this.texture?.dispose();
	}
}
