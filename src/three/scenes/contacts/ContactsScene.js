import * as THREE from "three";
import { PortfolioHubScene } from "../portfolio/PortfolioHubScene.js";
import { store as appStore } from "@/app/store.jsx";
import { CONTACTS_HUB_PROJECTS } from "@/pages/contacts/contactsChannels.js";
import { createContactsHubStore } from "@/pages/contacts/contactsInteraction.js";
import { sceneOwnsHexHitAtClientY } from "@/three/render/overlay/hexHitOwnership.js";

/** Same scene, camera, lights, plate motion and WebGL snake HUD; only content/action differ. */
export class ContactsScene extends PortfolioHubScene {
	constructor(store = appStore) {
		super({
			store: createContactsHubStore(store),
			projects: CONTACTS_HUB_PROJECTS,
			sceneId: "contacts",
			isHubPath: (path) => String(path ?? "").replace(/\/+$/, "") === "/contacts",
			isCasePath: () => false,
			getProjectByPath: () => null,
			externalLinks: true,
			logoOptions: {
				scale: 0.5,
				// Keep brand colours below the HDR bloom gate; the existing reveal fades all layers.
				emissiveBoost: { front: 1, back: 1, frontFloat: 1 },
			},
			getActionLabel: (locale) => ({ ru: "Перейти", en: "Open", zh: "打开" })[locale] ?? "Open",
		});
		this._appStore = store;
		this._linkCamera = new THREE.PerspectiveCamera();
		this._linkRaycaster = new THREE.Raycaster();
		this._linkPointer = new THREE.Vector2();
		this._linkLocalPoint = new THREE.Vector3();
		this._linkPress = null;
		this._onLinkDown = (event) => {
			const index = event.button === 0 ? this._getLinkHit(event) : -1;
			this._linkPress = index >= 0 ? { index, x: event.clientX, y: event.clientY, id: event.pointerId } : null;
		};
		this._onLinkUp = (event) => {
			const press = this._linkPress;
			this._linkPress = null;
			if (!press || press.id !== event.pointerId || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) return;
			if (this._getLinkHit(event) !== press.index) return;
			// Preserve the browser gesture: never open a tab from the scene's animation frame.
			window.open(this.projects[press.index].externalHref, "_blank", "noopener,noreferrer");
		};
		this._onLinkCancel = () => { this._linkPress = null; };
		window.addEventListener("pointerdown", this._onLinkDown, { passive: true });
		window.addEventListener("pointerup", this._onLinkUp);
		window.addEventListener("pointercancel", this._onLinkCancel);
	}

	applyCamera(camera, frame) {
		super.applyCamera(camera, frame);
		camera.updateMatrixWorld();
		this._linkCamera?.copy(camera);
	}

	_getLinkHit(event) {
		if (!this._appStarted || !this.showHub || !sceneOwnsHexHitAtClientY("contacts", event.clientY)) return -1;
		if (event.target instanceof Element && event.target.closest("a, button, input, textarea, select, [role='button']")) return -1;
		this._linkPointer.set(event.clientX / window.innerWidth * 2 - 1, 1 - event.clientY / window.innerHeight * 2);
		this.threeScene.updateMatrixWorld(true);
		this._linkRaycaster.setFromCamera(this._linkPointer, this._linkCamera);
		const hud = this.screenTitle;
		if (hud.root.visible && this._lastHudTitleVisibility > 0.001) {
			const meshes = hud.projectsColumn.layers.map((layer) => layer.mesh).filter((mesh) => mesh?.visible);
			const hit = this._linkRaycaster.intersectObjects(meshes, true)[0];
			if (hit) {
				this._linkLocalPoint.copy(hit.point);
				hud.rightGroup.worldToLocal(this._linkLocalPoint);
				const index = hud.projectsColumn.resolveProjectIndexAtLocalPoint(this._linkLocalPoint.x, this._linkLocalPoint.y);
				if (index >= 0) return index;
			}
		}
		if (!this.root.visible || this._gridEnterProgress < 0.1) return -1;
		const plates = this.plates.filter((plate) => plate.projectIndex >= 0 && plate.mesh);
		const hit = this._linkRaycaster.intersectObjects(plates.map((plate) => plate.mesh), false)[0];
		return hit ? (plates.find((plate) => plate.mesh === hit.object)?.projectIndex ?? -1) : -1;
	}

	update(delta, frame) {
		super.update(delta, frame);
		if (frame?.interactionEnabled && !frame.pointerBlocked) {
			for (const key of ["caseHovered", "projectListHovered", "caseNavHovered", "screenGalleryHovered", "screenGalleryDragging"]) {
				this._appStore.cursor[key] = this.store.cursor[key] === true;
			}
		}
	}

	dispose() {
		window.removeEventListener("pointerdown", this._onLinkDown);
		window.removeEventListener("pointerup", this._onLinkUp);
		window.removeEventListener("pointercancel", this._onLinkCancel);
		super.dispose();
	}
}
