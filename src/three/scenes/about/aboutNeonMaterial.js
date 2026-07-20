import * as THREE from "three";

/**
 * Unlit HDR neon for Heart thin meshes / tubes.
 * Does not depend on normals (thin authored strips often have bad/missing normals).
 */
export function createAboutNeonMaterial(cfg = {}) {
	const uniforms = {
		uColor: { value: new THREE.Color(cfg.color ?? "#00b3ff") },
		uCoreColor: { value: new THREE.Color(cfg.coreColor ?? "#b8ecff") },
		uIntensity: { value: cfg.intensity ?? 3.6 },
		uPulse: { value: cfg.pulse ?? 0.2 },
		uPulseSpeed: { value: cfg.pulseSpeed ?? 1.8 },
		uOpacity: { value: cfg.opacity ?? 1 },
		uTime: { value: 0 },
	};

	const material = new THREE.ShaderMaterial({
		uniforms,
		transparent: true,
		depthWrite: false,
		depthTest: true,
		side: THREE.DoubleSide,
		toneMapped: false,
		blending: THREE.AdditiveBlending,
		vertexShader: /* glsl */ `
			varying vec3 vWorldPos;
			void main() {
				vec4 worldPos = modelMatrix * vec4(position, 1.0);
				vWorldPos = worldPos.xyz;
				gl_Position = projectionMatrix * viewMatrix * worldPos;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform vec3 uCoreColor;
			uniform float uIntensity;
			uniform float uPulse;
			uniform float uPulseSpeed;
			uniform float uOpacity;
			uniform float uTime;
			varying vec3 vWorldPos;

			void main() {
				float pulse = 1.0 + uPulse * sin(uTime * uPulseSpeed + vWorldPos.x * 4.0 + vWorldPos.y * 2.5);
				vec3 col = mix(uColor, uCoreColor, 0.35) * uIntensity * pulse;
				gl_FragColor = vec4(col, uOpacity);
			}
		`,
	});

	material.userData.isAboutNeon = true;
	material.userData.uniforms = uniforms;
	material.userData.applyConfig = (next) => {
		if (!next) return;
		if (next.color != null) uniforms.uColor.value.set(next.color);
		if (next.coreColor != null) uniforms.uCoreColor.value.set(next.coreColor);
		if (next.intensity != null) uniforms.uIntensity.value = next.intensity;
		if (next.pulse != null) uniforms.uPulse.value = next.pulse;
		if (next.pulseSpeed != null) uniforms.uPulseSpeed.value = next.pulseSpeed;
		if (next.opacity != null) uniforms.uOpacity.value = next.opacity;
	};
	material.userData.setTime = (elapsed) => {
		uniforms.uTime.value = elapsed;
	};

	return material;
}

/** Line / LineSegments path — Mesh shaders often never draw these. */
export function createAboutNeonLineMaterial(cfg = {}) {
	const material = new THREE.LineBasicMaterial({
		color: new THREE.Color(cfg.color ?? "#00b3ff"),
		transparent: true,
		opacity: cfg.opacity ?? 1,
		depthWrite: false,
		depthTest: true,
		toneMapped: false,
		blending: THREE.AdditiveBlending,
	});
	material.userData.isAboutNeonLine = true;
	material.userData.applyConfig = (next) => {
		if (!next) return;
		if (next.color != null) material.color.set(next.color);
		if (next.opacity != null) material.opacity = next.opacity;
		material.needsUpdate = true;
	};
	return material;
}

export function isAboutNeonMaterialName(name) {
	if (!name || typeof name !== "string") return false;
	const n = name.trim();
	return n === "NeonMaterial" || n === "Neon Material";
}

/** Thin neon strips only — `HeartNeon*`. */
export function isAboutHeartNeonMeshName(name) {
	if (!name || typeof name !== "string") return false;
	return /^HeartNeon/i.test(name);
}

/** Metallic Heart bodies — Main / Center (not Neon*). */
export function isAboutHeartMetalMeshName(name) {
	if (!name || typeof name !== "string") return false;
	return /^Heart(Main|Center)/i.test(name);
}

/** Outer cell plating meshes (`OUTER_cell`, `OUTER_cell.001`, …). */
export function isAboutOuterCellMeshName(name) {
	if (!name || typeof name !== "string") return false;
	return /^OUTER_cell/i.test(name);
}

/** Dev aid: report which Heart nodes actually have drawable geometry. */
export function logAboutHeartGeometryReport(root) {
	if (!root || typeof console === "undefined") return;
	const rows = [];
	const missingNeon = [];
	root.traverse((object) => {
		if (!object.name || !/^Heart/i.test(object.name)) return;
		const drawable = object.isMesh || object.isLine || object.isLineSegments;
		const pos = object.geometry?.getAttribute?.("position");
		const vertices = pos?.count ?? 0;
		rows.push({
			name: object.name,
			type: object.type,
			drawable,
			vertices,
			material: object.material?.name || object.material?.type || null,
		});
		if (/^HeartNeon/i.test(object.name) && vertices < 1) {
			missingNeon.push(object.name);
		}
	});
	console.info("[About Heart]", rows);
	if (missingNeon.length) {
		console.warn(
			"[About Heart] In Blender these are meshes, but the loaded GLB has NO geometry for:",
			missingNeon.join(", "),
			"— re-export AboutUsModel.glb (Include Visible/Renderable, Apply Modifiers). Wire-only meshes (edges without faces) are skipped by glTF.",
		);
	}
}
