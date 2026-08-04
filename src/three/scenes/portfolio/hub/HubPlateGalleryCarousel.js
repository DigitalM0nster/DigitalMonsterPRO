import * as THREE from "three";
import { SITE_MAIN_COLOR } from "@/app/config/siteMainColor.js";
import {
	HUB_PLATE_GALLERY_ASPECT,
	HUB_PLATE_GALLERY_LAYOUT,
	HUB_PLATE_PANEL_HEIGHT,
	HUB_PLATE_PANEL_WIDTH,
	wrapHubPlateGalleryIndex,
} from "./hubPlateGalleryLayout.js";

const SLOT_LEFT = -1;
const SLOT_CENTER = 0;
const SLOT_RIGHT = 1;
const SLOT_ORDER = [SLOT_LEFT, SLOT_CENTER, SLOT_RIGHT];

const vertexShader = /* glsl */ `
	varying vec2 vUv;

	void main() {
		vUv = uv;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

const fragmentShader = /* glsl */ `
	uniform sampler2D uGalleryAtlas;
	uniform float uImageIndex;
	uniform float uAtlasImageCount;
	uniform vec2 uAtlasGrid;
	uniform vec2 uAtlasGutterUv;
	uniform float uOpacity;
	uniform float uActiveMix;
	uniform float uTime;
	uniform float uPlaneAspect;
	uniform float uCornerRadius;
	uniform vec4 uScreenRect;
	uniform vec3 uPrimaryColor;
	uniform vec3 uHighlightColor;
	varying vec2 vUv;

	const float SCREEN_ASPECT = 1.7777778;
	const float GALLERY_TILE_ASPECT = ${1920 / 945};

	float roundedRectDistance(vec2 point, vec2 minCorner, vec2 maxCorner, float radius, float aspect) {
		point.x *= aspect;
		minCorner.x *= aspect;
		maxCorner.x *= aspect;
		vec2 center = (minCorner + maxCorner) * 0.5;
		vec2 halfSize = (maxCorner - minCorner) * 0.5;
		vec2 q = abs(point - center) - halfSize + radius;
		return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
	}

	vec2 coverUv(vec2 uv) {
		vec2 coveredUv = uv;
		if (GALLERY_TILE_ASPECT > uPlaneAspect) {
			coveredUv.x = (uv.x - 0.5) * (uPlaneAspect / GALLERY_TILE_ASPECT) + 0.5;
		} else {
			coveredUv.y = (uv.y - 0.5) * (GALLERY_TILE_ASPECT / uPlaneAspect) + 0.5;
		}
		return clamp(coveredUv, 0.0, 1.0);
	}

	vec4 sampleGalleryImage(vec2 localUv) {
		float safeCount = max(1.0, uAtlasImageCount);
		float safeIndex = mod(floor(uImageIndex + 0.5) + safeCount, safeCount);
		float column = mod(safeIndex, uAtlasGrid.x);
		float row = floor(safeIndex / uAtlasGrid.x);
		vec2 safeLocalUv = mix(
			uAtlasGutterUv,
			vec2(1.0) - uAtlasGutterUv,
			coverUv(localUv)
		);
		vec2 atlasUv = vec2(
			(column + safeLocalUv.x) / uAtlasGrid.x,
			(uAtlasGrid.y - 1.0 - row + safeLocalUv.y) / uAtlasGrid.y
		);
		return texture2D(uGalleryAtlas, atlasUv);
	}

	void main() {
		float planeDistance = roundedRectDistance(
			vUv,
			vec2(0.0),
			vec2(1.0),
			uCornerRadius,
			uPlaneAspect
		);
		float planeMask = 1.0 - smoothstep(-0.003, 0.003, planeDistance);

		vec2 screenUv = mix(uScreenRect.xy, uScreenRect.zw, vUv);
		float screenDistance = roundedRectDistance(
			screenUv,
			vec2(0.0),
			vec2(1.0),
			0.035,
			SCREEN_ASPECT
		);
		float screenMask = 1.0 - smoothstep(-0.0015, 0.0015, screenDistance);
		float mask = planeMask * screenMask;
		if (mask <= 0.001 || uOpacity <= 0.001) {
			discard;
		}

		vec4 texel = sampleGalleryImage(vUv);
		float sideDim = mix(0.58, 1.0, uActiveMix);
		vec3 color = min(max(texel.rgb, vec3(0.0)) * sideDim, vec3(0.96));

		float scanline = 0.5 + 0.5 * sin(vUv.y * 900.0 + uTime * 8.0);
		color *= 1.0 - scanline * mix(0.018, 0.006, uActiveMix);

		float frameCore = 1.0 - smoothstep(0.0, 0.0045, abs(planeDistance));
		float frameAura = exp(-abs(planeDistance) * 115.0);
		vec3 frameColor = mix(uPrimaryColor, uHighlightColor, 0.2 + uActiveMix * 0.28);
		color += frameColor * (frameCore * 0.72 + frameAura * 0.12) * (0.48 + uActiveMix * 0.52);

		gl_FragColor = vec4(color, texel.a * uOpacity * mask);
		#include <colorspace_fragment>
	}
`;

function createGalleryPlaneMaterial(atlas, config = {}) {
	return new THREE.ShaderMaterial({
		name: "HubPlateGalleryPlaneMaterial",
		uniforms: {
			uGalleryAtlas: { value: atlas.texture },
			uImageIndex: { value: 0 },
			uAtlasImageCount: { value: Math.max(1, atlas.imageCount ?? 1) },
			uAtlasGrid: { value: new THREE.Vector2(atlas.columns ?? 1, atlas.rows ?? 1) },
			uAtlasGutterUv: { value: new THREE.Vector2(...(atlas.gutterUv ?? [0, 0])) },
			uOpacity: { value: 0 },
			uActiveMix: { value: 0 },
			uTime: { value: 0 },
			uPlaneAspect: { value: 1 },
			uCornerRadius: { value: config.cornerRadius ?? 0.024 },
			uScreenRect: { value: new THREE.Vector4() },
			uPrimaryColor: { value: new THREE.Color(config.primaryColor ?? SITE_MAIN_COLOR) },
			uHighlightColor: { value: new THREE.Color(config.highlightColor ?? "#d7f6ff") },
		},
		vertexShader,
		fragmentShader,
		transparent: true,
		depthTest: true,
		depthWrite: false,
		toneMapped: false,
		side: THREE.FrontSide,
	});
}

function createGalleryPlateShellMaterial(config = {}, plateMaterialConfig = {}) {
	const shellConfig = {
		...plateMaterialConfig,
		...(plateMaterialConfig.sides ?? {}),
		...(config.shell ?? {}),
	};
	const clipUniforms = {
		uGalleryScreenRect: { value: new THREE.Vector4() },
		uGalleryPlateAspect: { value: HUB_PLATE_GALLERY_ASPECT },
	};
	const material = new THREE.MeshStandardMaterial({
		name: "HubPlateGalleryShellMaterial",
		color: new THREE.Color(shellConfig.color ?? "#081421"),
		transparent: true,
		opacity: 0,
		roughness: shellConfig.roughness ?? 0.33,
		metalness: shellConfig.metalness ?? 0,
		fog: true,
		depthTest: true,
		depthWrite: false,
		side: THREE.FrontSide,
	});
	material.userData.baseOpacity = config.shellOpacity ?? shellConfig.opacity ?? 0.78;
	material.userData.galleryClipUniforms = clipUniforms;
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, clipUniforms);
		shader.vertexShader = shader.vertexShader
			.replace(
				"#include <common>",
				`#include <common>
				uniform float uGalleryPlateAspect;
				varying vec2 vGalleryPlateUv;`,
			)
			.replace(
				"#include <begin_vertex>",
				`#include <begin_vertex>
				vGalleryPlateUv = vec2(
					position.x / max(0.0001, uGalleryPlateAspect) + 0.5,
					position.y + 0.5
				);`,
			);
		shader.fragmentShader = shader.fragmentShader
			.replace(
				"#include <common>",
				`#include <common>
				uniform vec4 uGalleryScreenRect;
				varying vec2 vGalleryPlateUv;

				float galleryShellRoundedRectDistance(
					vec2 point,
					vec2 minCorner,
					vec2 maxCorner,
					float radius,
					float aspect
				) {
					point.x *= aspect;
					minCorner.x *= aspect;
					maxCorner.x *= aspect;
					vec2 center = (minCorner + maxCorner) * 0.5;
					vec2 halfSize = (maxCorner - minCorner) * 0.5;
					vec2 q = abs(point - center) - halfSize + radius;
					return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
				}`,
			)
			.replace(
				"#include <clipping_planes_fragment>",
				`#include <clipping_planes_fragment>
				vec2 galleryShellScreenUv = mix(
					uGalleryScreenRect.xy,
					uGalleryScreenRect.zw,
					vGalleryPlateUv
				);
				float galleryShellScreenDistance = galleryShellRoundedRectDistance(
					galleryShellScreenUv,
					vec2(0.0),
					vec2(1.0),
					0.035,
					1.7777778
				);
				float galleryShellScreenMask = 1.0 - smoothstep(
					-0.0015,
					0.0015,
					galleryShellScreenDistance
				);
				if (galleryShellScreenMask <= 0.001) discard;`,
			);
	};
	material.customProgramCacheKey = () => "hub-gallery-shell-v1";
	return material;
}

function lerp(from, to, progress) {
	return from + (to - from) * progress;
}

function rectForSlot(slot) {
	if (slot < 0) {
		return HUB_PLATE_GALLERY_LAYOUT.left;
	}
	if (slot > 0) {
		return HUB_PLATE_GALLERY_LAYOUT.right;
	}
	return HUB_PLATE_GALLERY_LAYOUT.center;
}

function interpolateRect(fromRect, toRect, progress) {
	return {
		x: lerp(fromRect.x, toRect.x, progress),
		y: lerp(fromRect.y, toRect.y, progress),
		// Size is deliberately invariant. Only position and physical depth move;
		// the plate mask creates the cropped side previews.
		width: HUB_PLATE_GALLERY_LAYOUT.center.width,
		height: HUB_PLATE_GALLERY_LAYOUT.center.height,
	};
}

function offsetRect(rect, offsetX) {
	return {
		x: rect.x + offsetX,
		y: rect.y,
		width: rect.width,
		height: rect.height,
	};
}

function smoothstep01(value) {
	const progress = Math.max(0, Math.min(1, value));
	return progress * progress * (3 - 2 * progress);
}

export class HubPlateGalleryCarousel {
	constructor(atlas, geometry, cfg) {
		this.group = new THREE.Group();
		this.group.name = "hubPlateGalleryCarousel";
		this.group.visible = false;
		this.plateWidth = cfg.plateSize * Math.max(cfg.caseSelection?.aspectRatio ?? 1, 1);
		this.plateHeight = cfg.plateSize;
		this.config = cfg.caseSelection?.innerPanel?.galleryPlanes ?? {};
		this.imageCount = Math.max(1, Math.floor(Number(atlas.imageCount) || 1));
		const contentDepthRatio = cfg.caseSelection?.innerPanel?.contentDepthRatio ?? 0.5;
		this.baseDepth = cfg.depth * (contentDepthRatio - 0.5);
		this.reveal = 0;
		this.selectedIndex = 0;
		this.transition = null;

		this.planes = SLOT_ORDER.map((slot, index) => {
			const material = createGalleryPlaneMaterial(atlas, this.config);
			const shellMaterial = createGalleryPlateShellMaterial(this.config, cfg.material ?? {});
			const mesh = new THREE.Mesh(geometry, [material, shellMaterial]);
			mesh.name = `hubPlateGalleryPlane_${index}`;
			mesh.renderOrder = slot === SLOT_CENTER ? 32 : 31;
			mesh.raycast = () => {};
			this.group.add(mesh);
			return { mesh, material, shellMaterial, slot };
		});
		this.reset(0);
	}

	_getSlotDepth(slot) {
		return this.baseDepth + (
			slot === SLOT_CENTER
				? (this.config.activeDepth ?? 0.112)
				: (this.config.sideDepth ?? -0.112)
		);
	}

	_applyPlane(plane, rect, depth, opacity, activeMix) {
		const centerX = rect.x + rect.width * 0.5;
		const centerY = rect.y + rect.height * 0.5;
		plane.mesh.position.set(
			(centerX / HUB_PLATE_PANEL_WIDTH - 0.5) * this.plateWidth,
			(0.5 - centerY / HUB_PLATE_PANEL_HEIGHT) * this.plateHeight,
			depth,
		);
		plane.mesh.scale.set(
			(rect.height / HUB_PLATE_PANEL_HEIGHT) * this.plateHeight,
			(rect.height / HUB_PLATE_PANEL_HEIGHT) * this.plateHeight,
			1,
		);
		// Keep the planes parallel to the plate. This makes uScreenRect an exact
		// plate-local clipping mask even while a side plane crosses a rounded edge.
		plane.mesh.rotation.set(0, 0, 0);
		plane.mesh.renderOrder = activeMix > 0.5 ? 32 : 31;

		const uniforms = plane.material.uniforms;
		uniforms.uOpacity.value = Math.max(0, opacity) * this.reveal;
		uniforms.uActiveMix.value = Math.max(0, Math.min(1, activeMix));
		uniforms.uPlaneAspect.value = HUB_PLATE_GALLERY_ASPECT;
		uniforms.uScreenRect.value.set(
			rect.x / HUB_PLATE_PANEL_WIDTH,
			1 - (rect.y + rect.height) / HUB_PLATE_PANEL_HEIGHT,
			(rect.x + rect.width) / HUB_PLATE_PANEL_WIDTH,
			1 - rect.y / HUB_PLATE_PANEL_HEIGHT,
		);
		const shellUniforms = plane.shellMaterial.userData.galleryClipUniforms;
		shellUniforms.uGalleryScreenRect.value.copy(uniforms.uScreenRect.value);
		plane.shellMaterial.opacity = (
			plane.shellMaterial.userData.baseOpacity *
			Math.max(0, opacity) *
			this.reveal
		);
	}

	_setPlaneImage(plane, imageIndex) {
		plane.material.uniforms.uImageIndex.value = wrapHubPlateGalleryIndex(
			imageIndex,
			this.imageCount,
		);
	}

	_applyRestLayout() {
		const sideOpacity = this.config.sideOpacity ?? 0.66;
		for (let index = 0; index < this.planes.length; index += 1) {
			const plane = this.planes[index];
			const slot = SLOT_ORDER[index];
			plane.slot = slot;
			this._setPlaneImage(plane, this.selectedIndex + slot);
			this._applyPlane(
				plane,
				rectForSlot(slot),
				this._getSlotDepth(slot),
				slot === SLOT_CENTER ? 1 : sideOpacity,
				slot === SLOT_CENTER ? 1 : 0,
			);
		}
	}

	setVisible(visible) {
		this.group.visible = Boolean(visible);
	}

	setReveal(reveal) {
		const nextReveal = Math.max(0, Math.min(1, reveal));
		if (Math.abs(nextReveal - this.reveal) < 0.0001) {
			return;
		}
		this.reveal = nextReveal;
		if (this.transition) {
			this.updateTransition(
				this.transition.progress ?? 0,
				{ direct: this.transition.direct ?? false },
			);
		} else {
			this._applyRestLayout();
		}
	}

	reset(selectedIndex = 0) {
		this.selectedIndex = wrapHubPlateGalleryIndex(selectedIndex, this.imageCount);
		this.transition = null;
		this._applyRestLayout();
	}

	startTransition(direction, targetIndex) {
		if (this.transition) {
			this.transition = null;
			this._applyRestLayout();
		}
		this.transition = {
			direction: direction < 0 ? -1 : 1,
			targetIndex: wrapHubPlateGalleryIndex(targetIndex, this.imageCount),
			progress: 0,
			direct: false,
			wrapImageChanged: false,
		};
	}

	canContinueTransition(direction, targetIndex) {
		return Boolean(
			this.transition &&
			this.transition.direction === (direction < 0 ? -1 : 1) &&
			this.transition.targetIndex === wrapHubPlateGalleryIndex(targetIndex, this.imageCount)
		);
	}

	updateTransition(progress, { direct = false } = {}) {
		const transition = this.transition;
		if (!transition) {
			return;
		}
		const clampedProgress = Math.max(0, Math.min(1, progress));
		const eased = direct ? clampedProgress : smoothstep01(clampedProgress);
		transition.progress = clampedProgress;
		transition.direct = direct;
		const sideOpacity = this.config.sideOpacity ?? 0.66;
		const recycleSplit = 0.52;
		const recycleDistancePx = this.config.recycleDistancePx ?? 360;
		const firstHalf = smoothstep01(Math.min(1, eased / recycleSplit));
		const secondHalf = smoothstep01(Math.max(0, (eased - recycleSplit) / (1 - recycleSplit)));

		if (transition.direction > 0) {
			const [left, center, right] = this.planes;
			if (eased < recycleSplit && transition.wrapImageChanged) {
				this._setPlaneImage(left, this.selectedIndex - 1);
				transition.wrapImageChanged = false;
			}
			this._applyPlane(
				center,
				interpolateRect(rectForSlot(SLOT_CENTER), rectForSlot(SLOT_LEFT), eased),
				lerp(this._getSlotDepth(SLOT_CENTER), this._getSlotDepth(SLOT_LEFT), eased),
				lerp(1, sideOpacity, eased),
				1 - eased,
			);
			this._applyPlane(
				right,
				interpolateRect(rectForSlot(SLOT_RIGHT), rectForSlot(SLOT_CENTER), eased),
				lerp(this._getSlotDepth(SLOT_RIGHT), this._getSlotDepth(SLOT_CENTER), eased),
				lerp(sideOpacity, 1, eased),
				eased,
			);
			if (eased >= recycleSplit && !transition.wrapImageChanged) {
				this._setPlaneImage(left, transition.targetIndex + 1);
				transition.wrapImageChanged = true;
			}
			if (eased < recycleSplit) {
				this._applyPlane(
					left,
					interpolateRect(
						rectForSlot(SLOT_LEFT),
						offsetRect(rectForSlot(SLOT_LEFT), -recycleDistancePx),
						firstHalf,
					),
					this._getSlotDepth(SLOT_LEFT),
					sideOpacity * (1 - firstHalf),
					0,
				);
			} else {
				this._applyPlane(
					left,
					interpolateRect(
						offsetRect(rectForSlot(SLOT_RIGHT), recycleDistancePx),
						rectForSlot(SLOT_RIGHT),
						secondHalf,
					),
					this._getSlotDepth(SLOT_RIGHT),
					sideOpacity * secondHalf,
					0,
				);
			}
		} else {
			const [left, center, right] = this.planes;
			if (eased < recycleSplit && transition.wrapImageChanged) {
				this._setPlaneImage(right, this.selectedIndex + 1);
				transition.wrapImageChanged = false;
			}
			this._applyPlane(
				center,
				interpolateRect(rectForSlot(SLOT_CENTER), rectForSlot(SLOT_RIGHT), eased),
				lerp(this._getSlotDepth(SLOT_CENTER), this._getSlotDepth(SLOT_RIGHT), eased),
				lerp(1, sideOpacity, eased),
				1 - eased,
			);
			this._applyPlane(
				left,
				interpolateRect(rectForSlot(SLOT_LEFT), rectForSlot(SLOT_CENTER), eased),
				lerp(this._getSlotDepth(SLOT_LEFT), this._getSlotDepth(SLOT_CENTER), eased),
				lerp(sideOpacity, 1, eased),
				eased,
			);
			if (eased >= recycleSplit && !transition.wrapImageChanged) {
				this._setPlaneImage(right, transition.targetIndex - 1);
				transition.wrapImageChanged = true;
			}
			if (eased < recycleSplit) {
				this._applyPlane(
					right,
					interpolateRect(
						rectForSlot(SLOT_RIGHT),
						offsetRect(rectForSlot(SLOT_RIGHT), recycleDistancePx),
						firstHalf,
					),
					this._getSlotDepth(SLOT_RIGHT),
					sideOpacity * (1 - firstHalf),
					0,
				);
			} else {
				this._applyPlane(
					right,
					interpolateRect(
						offsetRect(rectForSlot(SLOT_LEFT), -recycleDistancePx),
						rectForSlot(SLOT_LEFT),
						secondHalf,
					),
					this._getSlotDepth(SLOT_LEFT),
					sideOpacity * secondHalf,
					0,
				);
			}
		}
	}

	cancelTransition() {
		this.transition = null;
		this._applyRestLayout();
	}

	completeTransition() {
		if (!this.transition) {
			return;
		}
		this.selectedIndex = this.transition.targetIndex;
		if (this.transition.direction > 0) {
			this.planes = [this.planes[1], this.planes[2], this.planes[0]];
		} else {
			this.planes = [this.planes[2], this.planes[0], this.planes[1]];
		}
		this.transition = null;
		this._applyRestLayout();
	}

	updateTime(timeSeconds) {
		for (const plane of this.planes) {
			plane.material.uniforms.uTime.value = timeSeconds;
		}
	}

	dispose() {
		for (const plane of this.planes) {
			plane.material.dispose();
			plane.shellMaterial.dispose();
		}
		this.group.parent?.remove(this.group);
	}
}
