import { useAnimations, useGLTF } from "@react-three/drei";
import { useEffect, useRef, forwardRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { easing } from "maath";
import { useStore } from "@/store";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { ROUTE_TRANSITION_ENTER_MS } from "@/config/routeTransition.js";
import { shouldActivateRoutePage } from "@/utils/shouldActivateRoutePage.js";

function freezeHiddenRoot(root) {
	if (!root) return;
	root.frustumCulled = false;
	root.matrixAutoUpdate = false;
	root.raycast = () => {};
}

function restoreRootForShow(root) {
	if (!root) return;
	root.frustumCulled = true;
	root.matrixAutoUpdate = true;
	delete root.raycast;
}

function isAboutPath(page) {
	return page.split("/")[1] === "about";
}

export default forwardRef(function AboutPageModel(props, ref) {
	const store = useStore();
	const { phase: routePhase } = useRouteTransitionContext();
	const [activePage, setActivePage] = useState(true);
	const { camera } = useThree();

	const exitHideCompleteRef = useRef(false);
	const SCALE_HIDE_EPS = 0.001;

	useEffect(() => {
		if (shouldActivateRoutePage(isAboutPath(props.currentPage), routePhase)) {
			exitHideCompleteRef.current = false;
			if (ref.current) {
				restoreRootForShow(ref.current);
			}
			const id = setTimeout(() => {
				setActivePage(true);
			}, ROUTE_TRANSITION_ENTER_MS);
			return () => clearTimeout(id);
		}
		setActivePage(false);
	}, [props.currentPage, routePhase]);

	// Removed bug with fast changing pages and delay 500
	useEffect(() => {
		if (isAboutPath(props.currentPage)) {
			camera.position.x = 0;
			camera.position.y = 0;
			camera.position.z = 9;
			store.scroll = 0;
			camera.lookAt(0, 0, 0);
		}
		if (!isAboutPath(props.currentPage)) {
			setActivePage(false);
		}
	}, [activePage]);

	const modelRef = useRef();

	const PrimaryIonDrive = useGLTF("/models/aboutModel/PrimaryIonDrive.glb");
	const animations = useAnimations(PrimaryIonDrive.animations, PrimaryIonDrive.scene);

	useEffect(() => {
		animations.actions.Main.play();
		if (PrimaryIonDrive) {
			PrimaryIonDrive.materials.HoloFillDark.toneMapped = true;
			PrimaryIonDrive.materials.constant1.toneMapped = false;
			PrimaryIonDrive.materials.constant2.toneMapped = false;

			PrimaryIonDrive.materials.constant1.emissiveIntensity = 1;
			PrimaryIonDrive.materials.constant1.color.r = 0;
			PrimaryIonDrive.materials.constant1.color.g = 0.5;
			PrimaryIonDrive.materials.constant1.color.b = 5;
			PrimaryIonDrive.materials.constant1.emissive.r = 0;
			PrimaryIonDrive.materials.constant1.emissive.g = 0.5;
			PrimaryIonDrive.materials.constant1.emissive.b = 5;

			PrimaryIonDrive.materials.constant2.emissiveIntensity = 1;
			PrimaryIonDrive.materials.constant2.color.r = 0;
			PrimaryIonDrive.materials.constant2.color.g = 0.5;
			PrimaryIonDrive.materials.constant2.color.b = 5;
			PrimaryIonDrive.materials.constant2.emissive.r = 0;
			PrimaryIonDrive.materials.constant2.emissive.g = 0.5;
			PrimaryIonDrive.materials.constant2.emissive.b = 5;
		}
	}, []);

	useFrame((renderer, delta) => {
		if (!isAboutPath(props.currentPage) && ref.current && !ref.current.visible && exitHideCompleteRef.current) {
			return;
		}

		if (!ref.current) {
			return;
		}

		if (activePage === true) {
			restoreRootForShow(ref.current);

			if (!modelRef.current) {
				return;
			}

			// Transition IN
			ref.current.visible = true;
			easing.damp3(ref.current.scale, [1.2, 1.2, 1.2], 1, delta);

			// Animation
			// console.log(((window.innerWidth - minW) / (maxW - minW)) * (maxP - minP) + minP)
			// console.log(((window.innerWidth - 1280) / (1680 - 1280)) * (3.2 - 2.2) + 2.2)
			easing.damp3(modelRef.current.rotation, [Math.PI * 2, 0, 0], 2, delta);
			if (renderer.size.width <= 768) {
				easing.damp3(ref.current.position, [0, 0.15, 0], 1, delta);
			}
			if (renderer.size.width > 768 && renderer.size.width <= 980) {
				easing.damp3(ref.current.position, [1, 0.15, 0], 1, delta);
			}
			if (renderer.size.width > 980 && renderer.size.width <= 1280) {
				easing.damp3(ref.current.position, [((window.innerWidth - 980) / (1280 - 980)) * (2.2 - 1.7) + 1.7, 0.15, 0], 1, delta);
			}
			if (renderer.size.width > 1280 && renderer.size.width <= 1680) {
				easing.damp3(ref.current.position, [((window.innerWidth - 1280) / (1680 - 1280)) * (3.0 - 2.2) + 2.2, 0.15, 0], 1, delta);
			}
			if (renderer.size.width > 1680) {
				easing.damp3(ref.current.position, [3.2, 0.15, 0], 1, delta);
			}
		} else {
			// Transition OUT
			easing.damp3(ref.current.scale, [0, 0, 0], 0.3, delta);
			const sx = Math.abs(ref.current.scale.x);
			const sy = Math.abs(ref.current.scale.y);
			const sz = Math.abs(ref.current.scale.z);
			if (sx <= SCALE_HIDE_EPS && sy <= SCALE_HIDE_EPS && sz <= SCALE_HIDE_EPS) {
				ref.current.visible = false;
				if (modelRef.current) {
					modelRef.current.rotation.x = -0.45;
					modelRef.current.rotation.y = 0;
					modelRef.current.rotation.z = 1.3;
				}
				exitHideCompleteRef.current = true;
				freezeHiddenRoot(ref.current);
			}
		}
	});

	return (
		<>
			<group ref={ref} position={[3.2, 0.15, 0]} rotation={[-0.45, 0, 1.3]} dispose={null}>
				<primitive ref={modelRef} object={PrimaryIonDrive.scene} rotation={[0, 0, 0]} />
			</group>
		</>
	);
});
