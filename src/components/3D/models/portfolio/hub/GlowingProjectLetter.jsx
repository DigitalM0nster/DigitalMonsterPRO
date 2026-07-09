import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { portfolioHubConfig } from "./portfolioHubConfig.js";

/**
 * Многослойный светящийся символ (первая буква проекта).
 * Слои можно заменить на SVG/текстуры без смены API.
 */
export default function GlowingProjectLetter({ letter, focus = 0, glowRef }) {
	const groupRef = useRef();
	const haloMatRef = useRef();
	const cfg = portfolioHubConfig.logo;
	const layers = useMemo(() => cfg.layers, [cfg.layers]);

	useFrame((state) => {
		if (!groupRef.current) {
			return;
		}
		const t = state.clock.elapsedTime;
		const depthGlow = glowRef?.current ?? 1;
		const breath = 1 + Math.sin(t * cfg.breathSpeed) * cfg.breathAmount;
		const focusMul = 1 + focus * (cfg.focusGlowMultiplier - 1);
		const scale = breath * focusMul * (0.85 + depthGlow * 0.15);
		groupRef.current.scale.setScalar(scale);

		if (haloMatRef.current) {
			haloMatRef.current.opacity =
				cfg.halo.opacity * (0.5 + focus * 0.35) * depthGlow;
		}
	});

	return (
		<group ref={groupRef} position={[0, 0, 0.07]}>
			<mesh position={[0, 0, -0.03]} renderOrder={1}>
				<circleGeometry args={[cfg.halo.scale[0] * 0.5, 32]} />
				<meshBasicMaterial
					ref={haloMatRef}
					color={cfg.halo.color}
					transparent
					opacity={cfg.halo.opacity}
					depthWrite={false}
					blending={THREE.AdditiveBlending}
					toneMapped={false}
				/>
			</mesh>
			{layers.map((layer, index) => (
				<Text
					key={index}
					font={cfg.font}
					fontSize={cfg.fontSize * (layer.scale ?? 1)}
					position={[layer.offset?.[0] ?? 0, layer.offset?.[1] ?? 0, layer.z]}
					color={layer.color}
					fillOpacity={layer.opacity * (0.7 + focus * 0.15)}
					anchorX="center"
					anchorY="middle"
					toneMapped={false}
					outlineWidth={0}
				>
					{letter}
				</Text>
			))}
		</group>
	);
}
