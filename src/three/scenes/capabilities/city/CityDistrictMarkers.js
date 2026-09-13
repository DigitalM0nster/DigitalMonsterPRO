import * as THREE from "three";
import { HUD_MARKER_GLSL } from "../../../objects/sceneHud/sceneHudShaders.js";
import { advanceMarkerMagnet } from "../../../objects/sceneHud/sceneMarkerMagnet.js";

// Match the crane's 72 px sprite and 32 px interaction radius.
const HALF_SIZE = 36;
const HIT_RADIUS = 32;
// The six districts in the approved overview. Camera motion never elects replacements.
export const CITY_MARKER_DISTRICTS = Object.freeze([
	"beacon-garden", "quarter-31", "quarter-27", "quarter-04", "quarter-26", "quarter-24",
]);
export const CITY_MOBILE_MARKER_DISTRICTS = Object.freeze(["beacon-garden", "quarter-27", "quarter-26"]);

/** Prepared billboard batch. The same projected circles own both drawing and hits. */
export class CityDistrictMarkers {
	constructor(districts, levels, renderer, cityMatrix) {
		this.renderer = renderer;
		this.cityMatrix = cityMatrix;
		this.viewport = new THREE.Vector2(1, 1);
		this.anchors = districts.map(d => new THREE.Vector3(...d.anchor).add(new THREE.Vector3(0, d.kind === "park" ? 3.4 : 1.2, 0)));
		this.points = this.anchors.map(() => new THREE.Vector3());
		this.offsets = this.anchors.map(() => new THREE.Vector2());
		// Public offsets include responsive placement, so the marker, hit and HUD
		// leader share one endpoint. Magnet motion remains a separate small spring.
		this.magnetOffsets = this.anchors.map(() => new THREE.Vector2());
		this.velocities = this.anchors.map(() => new THREE.Vector2());
		this.levels = levels;
		// One vec4 per district keeps the marker shader within mobile uniform limits.
		this.markerState = new Float32Array(districts.length * 4);
		this.visible = new Float32Array(districts.length);
		this.parks = districts.map(d => d.kind === "park");
		this.order = CITY_MARKER_DISTRICTS.map(name => districts.findIndex(d => d.name === name)).filter(id => id >= 0);
		this.mobileOrder = CITY_MOBILE_MARKER_DISTRICTS.map(name => districts.findIndex(d => d.name === name)).filter(id => id >= 0);
		this.accepted = new Int16Array(this.order.length);
		this.count = 0;
		this.hovered = -1;
		this.time = { value: 0 };
		const positions = [], uvs = [], ids = [], phases = [];
		for (const i of this.order) {
			// Stable offsets spread arc rotation across its ten-second cycle, as on the crane.
			const phase = ((i * .61803398875) % 1) * 10;
			for (const uv of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) {
				positions.push(...this.anchors[i].toArray()); uvs.push(...uv); ids.push(i); phases.push(phase);
			}
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
		geometry.setAttribute("aDistrict", new THREE.Float32BufferAttribute(ids, 1));
		geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
		const material = new THREE.ShaderMaterial({
			name: "CityDistrictMarkers", transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
			uniforms: {
				uCityMatrix: { value: cityMatrix }, uViewport: { value: this.viewport },
				uMarkerState: { value: this.markerState }, uTime: this.time,
			},
			vertexShader: `uniform mat4 uCityMatrix; uniform vec2 uViewport;
				uniform vec4 uMarkerState[${districts.length}];
				attribute float aDistrict,aPhase; varying vec2 vPoint; varying float vVisible,vHover,vPhase;
				void main(){int id=int(aDistrict+.5);vec4 state=uMarkerState[id];vVisible=state.w;vHover=state.z;vPhase=aPhase;
					vPoint=(uv*2.-1.)*${HALF_SIZE}.;
					gl_Position=projectionMatrix*viewMatrix*uCityMatrix*vec4(position,1.);
					gl_Position.xy+=(vPoint+state.xy)*2./uViewport*gl_Position.w;
					if(vVisible<.5)gl_Position=vec4(2.,2.,2.,1.);
				}`,
			fragmentShader: `uniform float uTime; varying vec2 vPoint; varying float vVisible,vHover,vPhase;
				${HUD_MARKER_GLSL}
				void main(){if(vVisible<.5)discard;
					float alpha=hudMarkerInk(vPoint,uTime+vPhase,vHover,0.,1.);
					if(alpha<.002)discard;
					gl_FragColor=vec4(hudMarkerTint(vHover,0.),alpha);
				}`,
		});
		this.mesh = new THREE.Mesh(geometry, material);
		this.mesh.name = "city-district-markers";
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 78;
		this.mesh.onBeforeRender = (renderer, scene, camera) => this.project(camera, renderer);
	}

	update(delta, pointer = null) {
		const dt = Math.min(Math.max(delta, 0), .05);
		this.time.value += dt;
		const x = pointer ? (pointer.x + 1) * this.viewport.x / 2 : 0;
		const y = pointer ? (pointer.y + 1) * this.viewport.y / 2 : 0;
		for (const i of this.order) {
			const offset = this.magnetOffsets[i], p = this.points[i];
			let dx = 0, dy = 0;
			if (pointer && i === this.hovered && this.visible[i]) {
				// Measure from the fixed anchor so attraction cannot feed back into itself.
				dx = x - (p.x - offset.x);
				dy = y - (p.y - offset.y);
			}
			const previousX = offset.x, previousY = offset.y;
			advanceMarkerMagnet(offset, this.velocities[i], dx, dy, dt);
			p.x += offset.x - previousX; p.y += offset.y - previousY;
			this.offsets[i].x += offset.x - previousX; this.offsets[i].y += offset.y - previousY;
			this.markerState[i * 4] = this.offsets[i].x; this.markerState[i * 4 + 1] = this.offsets[i].y;
		}
	}

	project(camera, renderer = this.renderer) {
		renderer.getSize(this.viewport);
		const { x: width, y: height } = this.viewport;
		const compact = width <= 1024, activeOrder = compact ? this.mobileOrder : this.order;
		for (const i of activeOrder) {
			const p = this.points[i].copy(this.anchors[i]).applyMatrix4(this.cityMatrix);
			p.project(camera);
			this.offsets[i].copy(this.magnetOffsets[i]);
			p.x = (p.x + 1) * width / 2 + this.offsets[i].x;
			p.y = (p.y + 1) * height / 2 + this.offsets[i].y;
		}
		this.visible.fill(0); this.count = 0;
		const landscape = height <= 480 && width > height;
		// Match CityWorldTitle's prepared quad; reserve the full marker radius.
		const titleWidth = landscape ? Math.min(380, width * .48 - 24) : Math.min(560, width - 24);
		const titleTop = height <= 480 ? 66 : 84;
		const titleRight = 12 + titleWidth + HALF_SIZE + 8;
		const titleBottom = titleTop + titleWidth / 4 + HALF_SIZE + 8;
		const bottom = compact ? (height <= 480 ? 96 : 124) : 48;
		const top = height - (compact ? titleTop + HALF_SIZE : 96);
		const left = compact ? 38 : 154, right = width - (compact ? 38 : 156);
		// Clamp instead of culling at the frame/chrome edges. The offsets are also
		// consumed by the shader, hit test and card leader, so all three stay together.
		const constrain = p => {
			p.x = THREE.MathUtils.clamp(p.x, left, right);
			p.y = THREE.MathUtils.clamp(p.y, bottom, top);
			if (!compact) return;
			if (titleBottom <= height - bottom) {
				const release = THREE.MathUtils.smoothstep(p.x, titleRight, titleRight + 72);
				p.y = Math.min(p.y, height - THREE.MathUtils.lerp(titleBottom, height - top, release));
			} else if (titleRight <= right) p.x = Math.max(p.x, titleRight);
		};
		for (const id of activeOrder) {
			const p = this.points[id];
			// Only the free-flight camera can put an anchor behind the viewing plane.
			if (!Number.isFinite(p.x + p.y + p.z) || Math.abs(p.z) > 1) continue;
			// Temporarily retain the projected origin for the final placement offset.
			this.offsets[id].set(p.x - this.magnetOffsets[id].x, p.y - this.magnetOffsets[id].y);
			constrain(p);
			this.visible[id] = 1; this.accepted[this.count++] = id;
		}
		// Six fixed points: a bounded separation pass keeps crowded circles reachable
		// without dropping one or bringing a different district into the composition.
		const spacing = compact ? 76 : 72;
		for (let pass = 0; pass < 8; pass++) for (let a = 0; a < this.count; a++) for (let b = a + 1; b < this.count; b++) {
			const p = this.points[this.accepted[a]], q = this.points[this.accepted[b]];
			let dx = q.x - p.x, dy = q.y - p.y, distance = Math.hypot(dx, dy);
			if (distance >= spacing) continue;
			if (distance < .001) { dx = 1; dy = 0; distance = 1; }
			const push = (spacing - distance) / (2 * distance);
			p.x -= dx * push; p.y -= dy * push;
			q.x += dx * push; q.y += dy * push;
			constrain(p); constrain(q);
		}
		for (let i = 0; i < this.count; i++) {
			const id = this.accepted[i], p = this.points[id];
			this.offsets[id].set(p.x - this.offsets[id].x, p.y - this.offsets[id].y);
		}
		for (const i of this.order) {
			this.markerState[i * 4] = this.offsets[i].x;
			this.markerState[i * 4 + 1] = this.offsets[i].y;
			this.markerState[i * 4 + 2] = this.levels[i];
			this.markerState[i * 4 + 3] = this.visible[i];
		}
	}

	pick(pointer) {
		const x = (pointer.x + 1) * this.viewport.x / 2, y = (pointer.y + 1) * this.viewport.y / 2;
		for (let i = 0; i < this.count; i++) {
			const id = this.accepted[i], p = this.points[id];
			const radius = HIT_RADIUS + (id === this.hovered ? 2 : 0);
			if ((p.x - x) ** 2 + (p.y - y) ** 2 <= radius ** 2) return id;
		}
		return -1;
	}

	reset() {
		this.hovered = -1;
		for (let i = 0; i < this.offsets.length; i++) {
			this.points[i].x -= this.offsets[i].x; this.points[i].y -= this.offsets[i].y;
			this.offsets[i].set(0, 0);
			this.magnetOffsets[i].set(0, 0);
			this.velocities[i].set(0, 0);
		}
		this.markerState.fill(0);
	}

	dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
