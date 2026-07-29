import * as THREE from "three";
import { applyBelkaNeonTune, createBelkaTubeNeonMaterial } from "./belkaGlassMaterial.js";

/**
 * Belka neon beads — chaotic wander inside a soft ellipsoid shell (stays on-frame).
 * Soft spark dust + optional decor travelers (ITMesh / Flower).
 */

function hash01(i, salt = 0) {
	const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
	return x - Math.floor(x);
}

function createSoftSparkTexture() {
	const size = 64;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	g.addColorStop(0, "rgba(220,255,255,1)");
	g.addColorStop(0.25, "rgba(1,220,249,0.85)");
	g.addColorStop(0.65, "rgba(0,120,180,0.2)");
	g.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, size, size);
	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.needsUpdate = true;
	return tex;
}

/**
 * @param {{
 *   radius?: number,
 *   radiusInner?: number,
 *   radiusOuter?: number,
 *   spread?: number,
 *   intensity?: number,
 *   color?: string,
 *   coreColor?: string,
 *   shardCount?: number,
 *   dustCount?: number,
 *   shardScale?: number,
 * }} [opts]
 */
export async function createBelkaHaloField({
	radius = 2.35,
	radiusInner = null,
	radiusOuter = null,
	spread = 0.55,
	intensity = 2.8,
	color = "#01dcf9",
	coreColor = "#e8fbff",
	shardCount = 16,
	dustCount = 110,
	shardScale = 1,
} = {}) {
	const root = new THREE.Group();
	root.name = "BelkaHaloField";

	const materials = [];
	const geometries = [];
	const disposables = [];

	let shellInner = Math.max(0.6, radiusInner ?? radius * 0.78);
	let shellOuter = Math.max(shellInner + 0.25, radiusOuter ?? radius * 1.22);
	let currentSpread = Math.max(0.1, spread);
	let currentBeadScale = Math.max(0.25, shardScale);
	let poseTilt = 0.28;
	let poseRoll = 0.12;
	let poseYaw = 0;
	let spinAccum = 0;

	const beadMat = createBelkaTubeNeonMaterial({ color, coreColor, intensity });
	materials.push(beadMat);

	const applyRootPose = () => {
		root.rotation.x = poseTilt;
		root.rotation.z = poseRoll;
		root.rotation.y = poseYaw + spinAccum;
	};

	const beadBaseR = 0.056;
	const beadGeo = new THREE.SphereGeometry(1, 20, 16);
	geometries.push(beadGeo);
	const beadRadius = () => beadBaseR * Math.max(0.35, currentBeadScale);

	/** Soft ellipsoid axes — flatter on Y so beads stay in frame. */
	const shellAxes = () => {
		const mid = (shellInner + shellOuter) * 0.5;
		const fat = 1 + currentSpread * 0.22;
		return {
			rx: mid * fat,
			ry: mid * (0.58 + currentSpread * 0.08),
			rz: mid * (0.92 + currentSpread * 0.12),
			rMin: shellInner,
			rMax: shellOuter,
		};
	};

	/**
	 * @type {{
	 *   mesh: THREE.Mesh,
	 *   theta: number,
	 *   phi: number,
	 *   r: number,
	 *   dTheta: number,
	 *   dPhi: number,
	 *   wobbleA: number,
	 *   wobbleB: number,
	 *   wobbleC: number,
	 *   phaseA: number,
	 *   phaseB: number,
	 *   phaseC: number,
	 *   sizeJitter: number,
	 * }[]}
	 */
	const beads = [];
	/** @type {{ mesh: THREE.Object3D, theta: number, phi: number, r: number, dTheta: number, dPhi: number, lift: number, spin: number }[]} */
	const decorTravelers = [];

	const _pos = new THREE.Vector3();

	const clampToShell = (out, axes) => {
		const nx = out.x / axes.rx;
		const ny = out.y / axes.ry;
		const nz = out.z / axes.rz;
		const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
		const minN = axes.rMin / axes.rx;
		const maxN = axes.rMax / axes.rx;
		if (len > maxN || len < minN) {
			const s = (len > maxN ? maxN : minN) / len;
			out.x *= s;
			out.y *= s;
			out.z *= s;
		}
		return out;
	};

	const placeFromSpherical = (out, theta, phi, r, axes) => {
		out.set(
			r * Math.sin(phi) * Math.cos(theta),
			r * Math.cos(phi) * (axes.ry / axes.rx),
			r * Math.sin(phi) * Math.sin(theta),
		);
		return clampToShell(out, axes);
	};

	const beadCount = Math.max(6, Math.round(shardCount));

	const spawnBeads = () => {
		while (beads.length) {
			const b = beads.pop();
			root.remove(b.mesh);
		}
		const axes = shellAxes();
		const midR = (axes.rMin + axes.rMax) * 0.5;
		for (let i = 0; i < beadCount; i += 1) {
			const mesh = new THREE.Mesh(beadGeo, beadMat);
			mesh.name = `BelkaHaloBead_${i}`;
			mesh.renderOrder = 3;
			mesh.frustumCulled = false;
			const sizeJitter = 0.65 + hash01(i, 3) * 0.7;
			mesh.scale.setScalar(beadRadius() * sizeJitter);

			const theta = hash01(i, 1) * Math.PI * 2;
			const phi = Math.acos(2 * hash01(i, 2) - 1);
			const r = axes.rMin + hash01(i, 4) * (axes.rMax - axes.rMin);
			placeFromSpherical(_pos, theta, phi, r, axes);
			mesh.position.copy(_pos);
			root.add(mesh);

			/** Unique angular rates — incommensurate → looks chaotic, stays bounded. */
			const speed = 0.18 + hash01(i, 5) * 0.55;
			const dir = hash01(i, 6) > 0.5 ? 1 : -1;
			beads.push({
				mesh,
				theta,
				phi,
				r: midR + (hash01(i, 7) - 0.5) * (axes.rMax - axes.rMin) * 0.6,
				dTheta: dir * speed * (0.7 + hash01(i, 8)),
				dPhi: (hash01(i, 9) - 0.5) * speed * 0.85,
				wobbleA: 0.35 + hash01(i, 10) * 0.9,
				wobbleB: 0.25 + hash01(i, 11) * 0.75,
				wobbleC: 0.3 + hash01(i, 12) * 0.8,
				phaseA: hash01(i, 13) * Math.PI * 2,
				phaseB: hash01(i, 14) * Math.PI * 2,
				phaseC: hash01(i, 15) * Math.PI * 2,
				sizeJitter,
			});
		}
	};
	spawnBeads();

	const placeDecor = (d) => {
		const axes = shellAxes();
		placeFromSpherical(_pos, d.theta, d.phi, d.r, axes);
		_pos.y += d.lift;
		d.mesh.position.copy(_pos);
	};

	/** ——— Soft spark dust ——— */
	const dustN = Math.max(40, Math.round(dustCount));
	const dustPos = new Float32Array(dustN * 3);
	const refreshDust = () => {
		const axes = shellAxes();
		for (let i = 0; i < dustN; i += 1) {
			const th = hash01(i, 21) * Math.PI * 2;
			const ph = Math.acos(2 * hash01(i, 22) - 1);
			const rr = axes.rMin + hash01(i, 23) * (axes.rMax - axes.rMin);
			placeFromSpherical(_pos, th, ph, rr, axes);
			dustPos[i * 3] = _pos.x;
			dustPos[i * 3 + 1] = _pos.y;
			dustPos[i * 3 + 2] = _pos.z;
		}
		dustGeo.attributes.position.needsUpdate = true;
	};
	const dustGeo = new THREE.BufferGeometry();
	dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
	geometries.push(dustGeo);
	const sparkMap = createSoftSparkTexture();
	disposables.push(sparkMap);
	const dustMat = new THREE.PointsMaterial({
		map: sparkMap,
		color: new THREE.Color("#7ef7ff"),
		size: 0.08,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		toneMapped: false,
		opacity: 0.75,
		sizeAttenuation: true,
	});
	materials.push(dustMat);
	const dust = new THREE.Points(dustGeo, dustMat);
	dust.frustumCulled = false;
	dust.renderOrder = 1;
	dust.name = "BelkaHaloDust";
	root.add(dust);
	refreshDust();

	applyRootPose();

	const syncShellFromRadii = (a, b, c) => {
		const vals = [a, b, c].map(Number).filter((n) => Number.isFinite(n));
		if (!vals.length) return;
		shellInner = Math.min(...vals);
		shellOuter = Math.max(...vals);
		if (shellOuter - shellInner < 0.2) shellOuter = shellInner + 0.35;
		spawnBeads();
		refreshDust();
		for (const d of decorTravelers) placeDecor(d);
	};

	return {
		root,
		/**
		 * @param {{ mesh: THREE.Object3D, ringIndex?: number, angleOffset?: number, lift?: number, spin?: number }[]} items
		 */
		attachDecor(items = []) {
			const axes = shellAxes();
			for (let i = 0; i < items.length; i += 1) {
				const item = items[i];
				if (!item?.mesh) continue;
				item.mesh.removeFromParent();
				root.add(item.mesh);
				item.mesh.renderOrder = 4;
				const theta = (item.angleOffset ?? hash01(i, 40)) * Math.PI * 2;
				const phi = 0.55 + hash01(i, 41) * 1.1;
				const r = axes.rMin + hash01(i, 42) * (axes.rMax - axes.rMin);
				const d = {
					mesh: item.mesh,
					theta,
					phi,
					r,
					dTheta: (hash01(i, 43) > 0.5 ? 1 : -1) * (0.12 + hash01(i, 44) * 0.28),
					dPhi: (hash01(i, 45) - 0.5) * 0.22,
					lift: item.lift ?? 0.08,
					spin: item.spin ?? 0.8,
				};
				placeDecor(d);
				decorTravelers.push(d);
			}
		},
		setHaloRadius(r) {
			const mid = Math.max(0.8, r);
			shellInner = mid * 0.78;
			shellOuter = mid * 1.22;
			spawnBeads();
			refreshDust();
			for (const d of decorTravelers) placeDecor(d);
		},
		setHaloSpread(s) {
			currentSpread = Math.max(0.1, s);
			refreshDust();
		},
		setRadii(a, b, c) {
			syncShellFromRadii(a, b, c);
		},
		setTubeRadius() {},
		setBeadScale(v) {
			currentBeadScale = Math.max(0.25, v);
			for (const b of beads) {
				b.mesh.scale.setScalar(beadRadius() * b.sizeJitter);
			}
		},
		setNeonIntensity(v) {
			applyBelkaNeonTune(beadMat, { intensity: v });
			if (dustMat) dustMat.opacity = Math.min(1, 0.4 + Math.max(0.2, v) * 0.12);
		},
		/**
		 * @param {{ color?: string, coreColor?: string, intensity?: number }} tune
		 */
		setNeonMaterial(tune = {}) {
			applyBelkaNeonTune(beadMat, tune);
			if (tune.intensity != null && dustMat) {
				dustMat.opacity = Math.min(1, 0.4 + Math.max(0.2, tune.intensity) * 0.12);
			}
		},
		/**
		 * @param {{
		 *   tilt?: number,
		 *   tiltSpread?: number,
		 *   roll?: number,
		 *   yaw?: number,
		 *   x?: number,
		 *   y?: number,
		 *   z?: number,
		 * }} pose
		 */
		setOrbitPose(pose = {}) {
			if (pose.tilt != null) poseTilt = pose.tilt;
			if (pose.roll != null) poseRoll = pose.roll;
			if (pose.yaw != null) poseYaw = pose.yaw;
			if (pose.x != null || pose.y != null || pose.z != null) {
				root.position.set(
					pose.x ?? root.position.x,
					pose.y ?? root.position.y,
					pose.z ?? root.position.z,
				);
			}
			applyRootPose();
		},
		setTilt(amount) {
			this.setOrbitPose({ tilt: amount });
		},
		update(time, spinMul = 1) {
			if (beadMat.uniforms?.uTime) beadMat.uniforms.uTime.value = time;
			const dt = 0.016 * Math.max(0, spinMul);
			spinAccum += dt * 0.045 * spinMul;
			applyRootPose();

			const axes = shellAxes();
			const chaos = 0.55 + currentSpread * 0.65;

			for (const b of beads) {
				b.theta += b.dTheta * dt * spinMul;
				b.phi += b.dPhi * dt * spinMul;
				/** Keep phi away from poles so paths stay lively. */
				if (b.phi < 0.25) {
					b.phi = 0.25;
					b.dPhi = Math.abs(b.dPhi);
				} else if (b.phi > Math.PI - 0.25) {
					b.phi = Math.PI - 0.25;
					b.dPhi = -Math.abs(b.dPhi);
				}

				const span = axes.rMax - axes.rMin;
				const wobbleR =
					b.r
					+ Math.sin(time * b.wobbleA + b.phaseA) * span * 0.2 * chaos
					+ Math.sin(time * b.wobbleB * 1.37 + b.phaseB) * span * 0.12;

				placeFromSpherical(_pos, b.theta, b.phi, wobbleR, axes);
				/** Extra Lissajous drift — clamped so beads never leave the shell. */
				_pos.x += Math.sin(time * b.wobbleC + b.phaseC) * axes.rx * 0.1 * chaos;
				_pos.y += Math.cos(time * b.wobbleA * 0.9 + b.phaseA) * axes.ry * 0.12 * chaos;
				_pos.z += Math.sin(time * b.wobbleB * 1.1 + b.phaseB) * axes.rz * 0.1 * chaos;
				clampToShell(_pos, axes);

				b.mesh.position.copy(_pos);
				b.mesh.rotation.y = time * (0.4 + b.dTheta);
				b.mesh.rotation.z = Math.sin(time * 1.3 + b.phaseA) * 0.4;
			}

			dust.rotation.y = time * 0.05;
			dust.rotation.x = Math.sin(time * 0.12) * 0.08;
			dustMat.opacity = 0.5 + 0.22 * Math.sin(time * 1.1);

			for (const d of decorTravelers) {
				d.theta += d.dTheta * dt * spinMul;
				d.phi += d.dPhi * dt * spinMul;
				if (d.phi < 0.3) {
					d.phi = 0.3;
					d.dPhi = Math.abs(d.dPhi);
				} else if (d.phi > Math.PI - 0.3) {
					d.phi = Math.PI - 0.3;
					d.dPhi = -Math.abs(d.dPhi);
				}
				placeDecor(d);
				d.mesh.rotation.y = time * d.spin;
				d.mesh.rotation.z = Math.sin(time * 1.4 + d.theta) * 0.25;
			}
		},
		dispose() {
			for (const g of geometries) g.dispose();
			for (const m of materials) m.dispose?.();
			for (const d of disposables) d.dispose?.();
		},
	};
}
