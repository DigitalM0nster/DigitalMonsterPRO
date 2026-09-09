import * as THREE from "three";
import { HUD_MARKER_GLSL } from "../../../objects/sceneHud/sceneHudShaders.js";

// Match the crane's 72 px sprite and 32 px interaction radius.
const HALF_SIZE = 36;
const HIT_RADIUS = 32;
const MAX_MARKERS = 6;

/** Prepared billboard batch. The same projected circles own both drawing and hits. */
export class CityDistrictMarkers {
	constructor(districts, levels, renderer, cityMatrix) {
		this.renderer = renderer;
		this.cityMatrix = cityMatrix;
		this.viewport = new THREE.Vector2(1, 1);
		this.anchors = districts.map(d => new THREE.Vector3(...d.anchor).add(new THREE.Vector3(0, d.kind === "park" ? 3.4 : 1.2, 0)));
		this.points = this.anchors.map(() => new THREE.Vector3());
		this.visible = new Float32Array(districts.length);
		this.distances = new Float32Array(districts.length);
		this.parks = districts.map(d => d.kind === "park");
		this.order = districts.map((_, i) => i);
		this.accepted = new Int16Array(MAX_MARKERS);
		this.count = 0;
		this.hovered = -1;
		this.time = { value: 0 };
		this.cameraPosition = new THREE.Vector3();
		this.compare = (a, b) => {
			if (a === b) return 0;
			if (a === this.hovered) return -1;
			if (b === this.hovered) return 1;
			return Number(this.parks[b]) - Number(this.parks[a]) || this.distances[a] - this.distances[b] || a - b;
		};
		const positions = [], uvs = [], ids = [], phases = [];
		for (let i = 0; i < districts.length; i++) {
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
				uVisible: { value: this.visible }, uLevels: { value: levels }, uTime: this.time,
			},
			vertexShader: `uniform mat4 uCityMatrix; uniform vec2 uViewport;
				uniform float uVisible[${districts.length}],uLevels[${districts.length}];
				attribute float aDistrict,aPhase; varying vec2 vPoint; varying float vVisible,vHover,vPhase;
				void main(){int id=int(aDistrict+.5);vVisible=uVisible[id];vHover=uLevels[id];vPhase=aPhase;
					vPoint=(uv*2.-1.)*${HALF_SIZE}.;
					gl_Position=projectionMatrix*viewMatrix*uCityMatrix*vec4(position,1.);
					gl_Position.xy+=vPoint*2./uViewport*gl_Position.w;
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

	update(delta) { this.time.value += Math.min(Math.max(delta, 0), .05); }

	project(camera, renderer = this.renderer) {
		renderer.getSize(this.viewport);
		const { x: width, y: height } = this.viewport;
		camera.getWorldPosition(this.cameraPosition);
		for (let i = 0; i < this.points.length; i++) {
			const p = this.points[i].copy(this.anchors[i]).applyMatrix4(this.cityMatrix);
			this.distances[i] = p.distanceToSquared(this.cameraPosition);
			p.project(camera);
			p.x = (p.x + 1) * width / 2; p.y = (p.y + 1) * height / 2;
		}
		this.order.sort(this.compare);
		this.visible.fill(0); this.count = 0;
		const compact = width < 700, limit = compact ? 2 : MAX_MARKERS;
		for (const id of this.order) {
			const p = this.points[id];
			if (Math.abs(p.z) > 1 || this.distances[id] > 20 * 20) continue;
			if (p.x < (compact ? 84 : 154) || p.x > width - (compact ? 36 : 156) || p.y < 48 || p.y > height - 96) continue;
			let crowded = false;
			for (let j = 0; j < this.count; j++) {
				const q = this.points[this.accepted[j]];
				if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 < 110 ** 2) { crowded = true; break; }
			}
			if (crowded) continue;
			this.visible[id] = 1; this.accepted[this.count++] = id;
			if (this.count >= limit) break;
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

	dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
