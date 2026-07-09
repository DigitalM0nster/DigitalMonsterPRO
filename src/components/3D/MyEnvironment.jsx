import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { easing } from "maath";
import { useStore } from "../../store";

export default function MyEnvironment(props) {
	const store = useStore();
	const directionalLightRef = useRef();

	const lightSetting = {
		intensity: 1,
		position: [0, 10, 20],
		color: "white",
	};
	// ANIMATION
	useFrame((renderer, delta, eventHandler) => {
		const p = props.currentPage;
		// Хаб портфолио: камеру ведёт PortfolioHubModel
		if (p !== "/portfolio") {
			renderer.camera.lookAt(0, renderer.camera.position.y, 0);
		}

		const light = directionalLightRef.current;
		if (!light) {
			return;
		}

		// Одна ветка за кадр вместо серии if (CPU п.5)
		if (p === "/portfolio") {
			easing.damp3(light.position, [-3, 6, 8], 0.8, delta);
			light.intensity = 0.15;
		} else if (
			p === "/contacts" ||
			p === "/about" ||
			p === "/portfolio/01" ||
			p === "/portfolio/02" ||
			p === "/portfolio/03" ||
			p === "/portfolio/05" ||
			p === "/portfolio/06" ||
			p === "/portfolio/07"
		) {
			easing.damp3(light.position, [-5, 13.5, 9], 1, delta);
			light.intensity = 1;
		} else if (p === "/portfolio/04") {
			easing.damp3(light.position, [0, 0, 1], 1, delta);
			light.intensity = 1;
		} else {
			light.intensity = 1;
		}
	});

	// RETURN
	return (
		<>
			<Environment files={"/backgrounds/environment.hdr"} />
			<group name={"Lights"}>
				<directionalLight ref={directionalLightRef} {...lightSetting} />
			</group>
		</>
	);
}
