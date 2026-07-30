import { RoundedBox } from "@react-three/drei";
import { portfolioHubPlatesConfig } from "./portfolioHubConfig.js";

/** Одна прозрачная плита (без логотипов и анимаций). */
export default function PortfolioHubPlate({ layout }) {
	const cfg = portfolioHubPlatesConfig;
	const [w, h, d] = layout.size;
	const m = cfg.material;

	return (
		<group position={layout.position}>
			<RoundedBox args={[w, h, d]} radius={cfg.cornerRadius} smoothness={4} castShadow={false} receiveShadow={false}>
				<meshPhysicalMaterial
					color={m.color}
					transparent
					opacity={m.opacity}
					transmission={m.transmission}
					roughness={m.roughness}
					metalness={m.metalness}
					thickness={m.thickness ?? 0.4}
					clearcoat={m.clearcoat ?? 0}
					clearcoatRoughness={m.clearcoatRoughness ?? 0.15}
					ior={1.45}
					depthWrite={m.transmission <= 0}
				/>
			</RoundedBox>
		</group>
	);
}
