import * as THREE from "three";
import { PortfolioHubScene } from "../portfolio/PortfolioHubScene.js";
import { store as appStore } from "@/app/store.jsx";
import { CONTACTS_HUB_PROJECTS } from "@/pages/contacts/contactsChannels.js";
import { createContactsHubStore } from "@/pages/contacts/contactsInteraction.js";
import { sceneOwnsHexHitAtClientY } from "@/three/render/overlay/hexHitOwnership.js";
import { getGraphicsTier } from "@/functions/getGraphicsTier.js";
import { ContactsGpuTextLayer } from "./text/ContactsGpuTextLayer.js";
import { ContactsPlateFinish } from "./ContactsPlateFinish.js";
import { warmContactsTextures } from "./warmContactsTextures.js";
import { portfolioHubPlatesConfig } from "../portfolio/hub/portfolioHubConfig.js";

/** Same scene, camera, lights, plate motion and WebGL snake HUD; only content/action differ. */
export class ContactsScene extends PortfolioHubScene {
	constructor(store = appStore) {
		super({
			store: createContactsHubStore(store),
			projects: CONTACTS_HUB_PROJECTS,
			sceneId: "contacts",
			// Medium needs the same prepared atlas path: Canvas snakes upload on every frame.
			createProjectsTextLayer: getGraphicsTier() !== "low" ? () => new ContactsGpuTextLayer() : undefined,
			isHubPath: (path) => String(path ?? "").replace(/\/+$/, "") === "/contacts",
			isCasePath: () => false,
			getProjectByPath: () => null,
			externalLinks: true,
			logoOptions: {
				scale: 0.5,
				// Preserve the flat dark fill and keep the thin cyan outline readable at scene scale.
				emissiveBoost: { front: 1, back: 1, frontFloat: 1.6 },
			},
			getActionLabel: (locale) => ({ ru: "Перейти", en: "Open", zh: "打开" })[locale] ?? "Open",
		});
		this.plateFinish = new ContactsPlateFinish(this.plates, portfolioHubPlatesConfig);
		this.readyPromise = Promise.all([this.readyPromise, this.plateFinish.readyPromise]).then(([sceneReady, finishReady]) => {
			if (!sceneReady || !finishReady) throw new Error("Contacts plate finish was not prepared");
			return true;
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

	async prepareResourcesUnderCurtain(renderer, scheduler) {
		await super.prepareResourcesUnderCurtain(renderer, scheduler);
		await warmContactsTextures(renderer, this.threeScene, scheduler, this.centerPlateLogos?.textures.values());
	}

	beginWarmupDraw() {
		const token = super.beginWarmupDraw();
		token.contactsFinish = this.plateFinish?.beginWarmupDraw();
		// The focused plate changes at runtime. Warm every existing label/button,
		// including their geometry and locale maps, in the scheduled scene draw.
		token.contactsPlateNodes = [];
		for (const owner of [this.plateProjectLabels, this.plateDetailsButtons]) {
			for (const { entry } of owner.attachments) {
				entry.group.traverse(node => token.contactsPlateNodes.push({
					node, visible: node.visible, frustumCulled: node.frustumCulled,
				}));
			}
		}
		this._contactsWarmPlateNodes = token.contactsPlateNodes;
		const layers = this.screenTitle.projectsColumn.layers.filter(layer => layer instanceof ContactsGpuTextLayer);
		if (!layers.length) return token;
		const hud = this.screenTitle;
		token.contactsText = {
			rootVisible: hud.root.visible, rightVisible: hud.rightGroup.visible,
			layers: layers.map(layer => {
				const u = layer.mainMaterial.uniforms;
				const saved = { layer, mode: u.uMode.value, time: u.uTime.value, timing: u.uTiming.value.clone(), opacity: u.opacity.value };
				// A mixed hover frame draws both clean glyphs and replacements, including
				// the instanced attributes and the atlas, before the curtain can open.
				u.uMode.value = 3; u.uTime.value = 80; u.uTiming.value.set(75, 50, 100, 1); u.opacity.value = 1;
				layer.syncPassVisibility();
				return saved;
			}),
		};
		hud.root.visible = hud.rightGroup.visible = true;
		return token;
	}

	endWarmupDraw(token) {
		super.endWarmupDraw(token);
		this.plateFinish?.endWarmupDraw(token?.contactsFinish);
		for (const { node, visible, frustumCulled } of token?.contactsPlateNodes ?? []) {
			node.visible = visible;
			node.frustumCulled = frustumCulled;
		}
		this._contactsWarmPlateNodes = null;
		const saved = token?.contactsText;
		if (!saved) return;
		this.screenTitle.root.visible = saved.rootVisible;
		this.screenTitle.rightGroup.visible = saved.rightVisible;
		for (const { layer, mode, time, timing, opacity } of saved.layers) {
			const u = layer.mainMaterial.uniforms;
			u.uMode.value = mode; u.uTime.value = time; u.uTiming.value.copy(timing); u.opacity.value = opacity;
			layer.syncPassVisibility();
		}
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
		this.plateFinish?.update(this.centerPlateLogos);
		// The normal update hides unfocused labels; override only until this warm draw
		// finishes. endWarmupDraw restores all visibility/culling flags, even on failure.
		for (const { node } of this._contactsWarmPlateNodes ?? []) {
			node.visible = true;
			node.frustumCulled = false;
		}
		if (frame?.interactionEnabled && !frame.pointerBlocked) {
			for (const key of ["caseHovered", "projectListHovered", "caseNavHovered", "screenGalleryHovered", "screenGalleryDragging"]) {
				this._appStore.cursor[key] = this.store.cursor[key] === true;
			}
		}
	}

	dispose() {
		this.plateFinish?.dispose();
		window.removeEventListener("pointerdown", this._onLinkDown);
		window.removeEventListener("pointerup", this._onLinkUp);
		window.removeEventListener("pointercancel", this._onLinkCancel);
		super.dispose();
	}
}
