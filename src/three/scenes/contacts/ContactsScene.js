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
import { resolveContactsResponsiveLayout } from "./contactsResponsiveLayout.js";

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
		this._responsiveLayout = null;
		this._responsiveWidth = 0;
		this._responsiveHeight = 0;
		this._responsiveHudKey = "";
		this._responsiveProjection = null;
		// Prepared once. Compact views fade the surrounding project plates using
		// their existing slide progress instead of showing cropped empty panels.
		this._compactPlateMaterials = this.plates.filter(plate => plate.mesh).map(plate => ({
			plate, original: plate.mesh.material,
			materials: plate.mesh.material.map(material => material.clone()),
		}));
		this._responsivePick = this.screenTitle.projectsColumn.resolveProjectIndexAtLocalPoint.bind(this.screenTitle.projectsColumn);
		this.screenTitle.projectsColumn.resolveProjectIndexAtLocalPoint = (x, y) => {
			if (!this._responsiveLayout) return this._responsivePick(x, y);
			const column = this.screenTitle.projectsColumn;
			return column.layers.findIndex(layer => Math.abs(x - layer.mesh.position.x) <= layer.layout.width * 0.5
				&& Math.abs(y - layer.mesh.position.y) <= layer.layout.height * 0.5);
		};
		this._onLinkDown = (event) => {
			const index = event.button === 0 ? this._getLinkHit(event) : -1;
			this._linkPress = index >= 0 ? { index, x: event.clientX, y: event.clientY, id: event.pointerId } : null;
		};
		this._onLinkUp = (event) => {
			const press = this._linkPress;
			this._linkPress = null;
			if (event.defaultPrevented) return;
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
		const width = typeof window === "undefined" ? 1920 : window.innerWidth;
		const height = typeof window === "undefined" ? 1080 : window.innerHeight;
		if (width !== this._responsiveWidth || height !== this._responsiveHeight) this.onViewportResize(width, height);
		const layout = this._responsiveLayout;
		if (layout) {
			this._responsiveProjection ??= this._fitResponsivePlate();
			const projection = this._responsiveProjection;
			// View the front from the other side: lettering remains readable while
			// the perspective and plate's lateral movement reverse together.
			camera.position.x = 2 * portfolioHubPlatesConfig.gridOffset[0] - camera.position.x;
			camera.quaternion.y *= -1; camera.quaternion.z *= -1;
			camera.fov = projection.fov;
			camera.updateProjectionMatrix();
			camera.projectionMatrix.elements[8] = projection.x;
			camera.projectionMatrix.elements[9] = projection.y;
			camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
		}
		this._applyResponsiveHud(camera);
		camera.updateMatrixWorld();
		this._linkCamera?.copy(camera);
	}

	onViewportResize(width, height) {
		this._responsiveWidth = width;
		this._responsiveHeight = height;
		this._responsiveLayout = resolveContactsResponsiveLayout(width, height);
		this._responsiveHudKey = "";
		this._responsiveProjection = null;
	}

	_fitResponsivePlate() {
		const cfg = portfolioHubPlatesConfig, { modelRect: box } = this._responsiveLayout;
		const width = this._responsiveWidth, height = this._responsiveHeight;
		const camera = new THREE.PerspectiveCamera(40, width / height, .1, 2000);
		camera.position.fromArray(cfg.camera.position);
		camera.position.x = 2 * cfg.gridOffset[0] - camera.position.x;
		camera.quaternion.fromArray(cfg.camera.quaternion);
		camera.quaternion.y *= -1; camera.quaternion.z *= -1;
		camera.updateMatrixWorld();
		const first = this.plates.find(plate => plate.projectIndex === 0);
		const center = new THREE.Vector3().fromArray(first.basePosition).add(new THREE.Vector3(...cfg.gridOffset));
		center.x -= cfg.interaction.plateSlideX;
		const points = [];
		for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) {
			points.push(new THREE.Vector3(x * cfg.plateSize, y * cfg.plateSize, z * cfg.depth).add(center));
		}
		const bounds = new THREE.Box3(), point = new THREE.Vector3();
		for (let pass = 0; pass < 4; pass++) {
			camera.updateProjectionMatrix(); bounds.makeEmpty();
			for (const corner of points) bounds.expandByPoint(point.copy(corner).project(camera));
			if (pass === 3) break;
			const factor = Math.max((bounds.max.x - bounds.min.x) * width / (2 * (box.right - box.left)),
				(bounds.max.y - bounds.min.y) * height / (2 * (box.bottom - box.top)));
			camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * factor * 1.03));
		}
		return { fov: camera.fov,
			x: (bounds.min.x + bounds.max.x) / 2 - ((box.left + box.right) / width - 1),
			y: (bounds.min.y + bounds.max.y) / 2 - (1 - (box.top + box.bottom) / height) };
	}

	_updateMenuInteraction() {
		super._updateMenuInteraction();
		if (this._responsiveLayout && !this._caseSelection.active) {
			for (const plate of this.plates) if (plate.mesh) plate.mesh.position.x = 2 * plate.basePosition[0] - plate.mesh.position.x;
		}
	}

	_applyResponsiveHud(camera) {
		const hud = this.screenTitle;
		if (!hud?.hudCfg || !hud.projectsColumn.layers.length) return;
		const width = this._responsiveWidth, height = this._responsiveHeight;
		const layout = this._responsiveLayout;
		const key = `${width}:${height}:${camera.fov}:${hud.projectsColumn.layers.length}`;
		if (key !== this._responsiveHudKey) {
			hud.rightGroup.visible = !layout || Boolean(this._contactsWarmPlateNodes);
			this._responsiveHudKey = key;
			const column = hud.projectsColumn;
			if (layout) {
				const depth = 5;
				const unit = 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / height;
				const scale = unit * layout.glyphPlanePx / column.layers[0].layout.height;
				hud.hudCfg.cameraOffset.set(0, 0, -depth);
				hud.rightGroup.scale.setScalar(scale);
				hud.rightGroup.position.set(
					(layout.listX - width / 2 + camera.projectionMatrix.elements[8] * width / 2) * unit,
					(height / 2 - layout.listY + camera.projectionMatrix.elements[9] * height / 2) * unit, 0);
				column.layers.forEach((layer, i) => layer.mesh.position.set(
					(i % layout.columns) * layout.listWidth / layout.columns * unit / scale + layer.layout.width / 2,
					-(Math.floor(i / layout.columns) * layout.rowHeight + layout.rowHeight / 2) * unit / scale, 0));
			} else {
				hud.hudCfg.cameraOffset.fromArray(portfolioHubPlatesConfig.hubScreenTitle.cameraOffset);
				hud.rightGroup.scale.setScalar(1);
				hud.rightGroup.position.fromArray(portfolioHubPlatesConfig.hubScreenTitle.projects.offset);
				column._layoutStack();
			}
			hud._projectsHoverNeedsRaycast = true;
		}
		hud.syncRootToCamera(camera);
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
		// The detached logo sits outside the compact camera until its first attach.
		// Include its geometry/hit quad in the actual warm draw, not just compile().
		this.centerPlateLogos.anchor.traverse(node => token.contactsPlateNodes.push({
			node, visible: node.visible, frustumCulled: node.frustumCulled,
		}));
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
		if (!this._responsiveLayout && hud.root.visible && hud.rightGroup.visible && this._lastHudTitleVisibility > 0.001) {
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
		const plates = this.plates.filter((plate) => plate.projectIndex >= 0 && plate.mesh?.visible);
		const hit = this._linkRaycaster.intersectObjects(plates.map((plate) => plate.mesh), false)[0];
		return hit ? (plates.find((plate) => plate.mesh === hit.object)?.projectIndex ?? -1) : -1;
	}

	update(delta, frame) {
		super.update(delta, frame);
		for (const { plate, original, materials } of this._compactPlateMaterials ?? []) {
			const compact = Boolean(this._responsiveLayout), warming = Boolean(this._contactsWarmPlateNodes);
			const alpha = compact && !warming ? THREE.MathUtils.smoothstep(Math.abs(plate.mesh.position.x - plate.basePosition[0]) / Math.abs(portfolioHubPlatesConfig.interaction.plateSlideX), .02, .65) : 1;
			plate.mesh.material = compact || warming ? materials : original;
			for (let i = 0; i < materials.length; i++) materials[i].opacity = original[i].opacity * alpha;
			plate.mesh.visible = alpha > .001;
		}
		if (this.platesRenderer.instancedMesh) this.platesRenderer.instancedMesh.visible = !this._responsiveLayout || Boolean(this._contactsWarmPlateNodes);
		if (this._responsiveLayout && !this._contactsWarmPlateNodes) this.screenTitle.rightGroup.visible = false;
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
		for (const { plate, original, materials } of this._compactPlateMaterials ?? []) {
			plate.mesh.material = original;
			for (const material of materials) material.dispose();
		}
		this.plateFinish?.dispose();
		window.removeEventListener("pointerdown", this._onLinkDown);
		window.removeEventListener("pointerup", this._onLinkUp);
		window.removeEventListener("pointercancel", this._onLinkCancel);
		super.dispose();
	}
}
