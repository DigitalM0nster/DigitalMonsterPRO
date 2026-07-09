import { useTexture, useGLTF, Html } from "@react-three/drei";
import { useRef, forwardRef, useEffect, useState } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { DoubleSide } from "three";
import { easing } from "maath";
import { useStore } from "@/store";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { ROUTE_TRANSITION_ENTER_MS } from "@/config/routeTransition.js";
import { shouldActivateRoutePage } from "@/utils/shouldActivateRoutePage.js";

/** Пока модель полностью убрана: меньше работы для движка (frustum / матрицы / raycast). */
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

export default forwardRef(function Case1Model(props, ref) {
	const store = useStore();
	const { phase: routePhase } = useRouteTransitionContext();
	const [activePage, setActivePage] = useState(true);

	const { camera } = useThree();

	const [pointerDown, setPointerDown] = useState(false);

	const nipigasCircles = useRef();
	const circle1 = useRef();
	const circle2 = useRef();
	const circle3 = useRef();
	const nipigasLogo = useRef();
	const case1Model = useRef();

	// После scale→0 и visible=false не крутим useFrame (как в Case3)
	const exitHideCompleteRef = useRef(false);
	const SCALE_HIDE_EPS = 0.001;

	const newLogoModel = useGLTF("/models/case1/NipigasLogoModel.glb");

	const Circle1texture = useTexture("/images/c1.png");
	Circle1texture.anisotropy = 16;

	const logoMaterialSet = {
		color: "#008c95",
		roughness: 0,
		metalness: 1,
		reflectivity: 1,
		transparent: true,
		opacity: 1,
		depthTest: true,
		depthWrite: true,
		DoubleSide: true,
		toneMapped: true,
	};
	const circlesMaterialSet = {
		color: [1, 1, 1],
		emissive: [0.2, 0.6, 1],
		transparent: true,
		depthWrite: false,
		toneMapped: false,
		emissiveIntensity: 2,
		map: Circle1texture,
		side: DoubleSide,
	};

	useEffect(() => {
		newLogoModel.materials.contourMat.color.r = 0;
		newLogoModel.materials.contourMat.color.g = 1;
		newLogoModel.materials.contourMat.color.b = 2;
		newLogoModel.materials.contourMat.emissive.r = 0;
		newLogoModel.materials.contourMat.emissive.g = 1;
		newLogoModel.materials.contourMat.emissive.b = 2;
		newLogoModel.materials.contourMat.emissiveIntensity = 0.9;
		newLogoModel.materials.contourMat.toneMapped = false;
	}, []);

	useEffect(() => {
		if (shouldActivateRoutePage(props.currentPage === `/portfolio/01`, routePhase)) {
			exitHideCompleteRef.current = false;
			if (ref.current) {
				restoreRootForShow(ref.current);
			}
			ref.current.scale.x = 0;
			ref.current.scale.y = 0;
			ref.current.scale.z = 0;
			ref.current.position.x = 0;
			ref.current.position.y = 0;
			ref.current.position.z = 0;
			const id = setTimeout(() => {
				setActivePage(true);
			}, ROUTE_TRANSITION_ENTER_MS);
			return () => clearTimeout(id);
		}
		setActivePage(false);
	}, [props.currentPage, routePhase]);

	// Removed bug with fast changing pages and delay 500
	useEffect(() => {
		if (props.currentPage === `/portfolio/01`) {
			camera.position.x = 0;
			camera.position.y = 0;
			camera.position.z = 9;
			store.scroll = 0;
			camera.lookAt(0, 0, 0);
		}
		if (props.currentPage != `/portfolio/01`) {
			setActivePage(false);
		}
	}, [activePage]);

	useFrame((renderer, delta) => {
		if (props.currentPage !== "/portfolio/01" && ref.current && !ref.current.visible && exitHideCompleteRef.current) {
			return;
		}

		if (!ref.current) {
			return;
		}

		// IF ACTIVE PAGE
		if (activePage === true) {
			restoreRootForShow(ref.current);

			if (!circle1.current || !circle2.current || !circle3.current || !case1Model.current || !nipigasCircles.current || !nipigasLogo.current) {
				return;
			}

			// CAMERA
			easing.damp(renderer.camera.position, "y", 0 - store.scroll * 35, 0.15, delta);

			// Появление
			ref.current.visible = true;
			// Анимация кручения орбит
			if (pointerDown === false) {
				circle1.current.rotation.z += delta * 0.05;
				circle2.current.rotation.z += delta * 0.05;
				circle3.current.rotation.z += delta * -0.05;
			} else {
				circle1.current.rotation.z += delta * 0.3;
				circle2.current.rotation.z += delta * 0.3;
				circle3.current.rotation.z += delta * -0.3;
			}
			// MOBILE VERSION
			if (renderer.size.width <= 768) {
				// scene
				easing.damp3(ref.current.position, [0, -0.4, 0], 0, delta);

				// Case1Model
				easing.damp3(case1Model.current.position, [0, Math.min(store.scroll * 40, 10), 0], 2, delta);
				easing.damp3(nipigasCircles.current.rotation, [0.65 + renderer.pointer.y * 0.2, -0.35 + renderer.pointer.x * 0.2, 0.1], 1, delta);
				easing.damp3(nipigasLogo.current.rotation, [0.2 + renderer.pointer.y * 0.2, -0.5 + renderer.pointer.x * 0.2, 0], 1, delta);
				easing.damp3(ref.current.rotation, [0, 0, 0], 1, delta);
				easing.damp3(ref.current.scale, [0.7, 0.7, 0.7], 1, delta);
			}

			// Desktop version
			if (renderer.size.width > 768) {
				// Case1Model
				easing.damp3(nipigasCircles.current.rotation, [0.65 + renderer.pointer.y * 0.2, -0.35 + renderer.pointer.x * 0.2, 0.1], 1, delta);
				easing.damp3(nipigasLogo.current.rotation, [0.2 + renderer.pointer.y * 0.2, -0.5 + renderer.pointer.x * 0.2, 0], 1, delta);
				easing.damp3(case1Model.current.position, [0, -0.3, 0], 0.5, delta);
				easing.damp3(ref.current.position, [1.7, 0.0, 0], 0.5, delta);
				easing.damp3(ref.current.scale, [1.1, 1.1, 1.1], 1, delta);
			}
		}
		// IF PAGE IS NOT ACTIVE — только scale, без камеры и без вращения орбит
		else {
			easing.damp3(ref.current.scale, [0, 0, 0], 0.2, delta);
			const sx = Math.abs(ref.current.scale.x);
			const sy = Math.abs(ref.current.scale.y);
			const sz = Math.abs(ref.current.scale.z);
			if (sx <= SCALE_HIDE_EPS && sy <= SCALE_HIDE_EPS && sz <= SCALE_HIDE_EPS) {
				ref.current.visible = false;
				exitHideCompleteRef.current = true;
				freezeHiddenRoot(ref.current);
			}
		}
	});

	return (
		<>
			<group
				ref={ref}
				position={[0, 0, 0]}
				onPointerDown={(e) => {
					setPointerDown(true);
				}}
				onPointerUp={() => {
					setPointerDown(false);
				}}
			>
				<group ref={case1Model} scale={0.275}>
					<group ref={nipigasCircles}>
						<mesh ref={circle1} rotation={[2.2, 0.6, 0]} scale={27}>
							<planeGeometry args={[1, 1, 16]} />
							<meshStandardMaterial {...circlesMaterialSet} />
						</mesh>
						<mesh ref={circle2} rotation={[1.8, 0.2, 0]} scale={23}>
							<planeGeometry args={[1, 1, 16]} />
							<meshStandardMaterial {...circlesMaterialSet} />
						</mesh>
						<mesh ref={circle3} rotation={[1.88, 0.15, 0]} scale={15}>
							<planeGeometry args={[1, 1, 16]} />
							<meshStandardMaterial {...circlesMaterialSet} />
						</mesh>
					</group>

					<group ref={nipigasLogo} scale={0.75}>
						<mesh {...newLogoModel.nodes.logoCircle}>
							<meshStandardMaterial {...logoMaterialSet} />
						</mesh>
						<mesh {...newLogoModel.nodes.logoCircleContour} />

						<mesh {...newLogoModel.nodes.logoFire}>
							<meshStandardMaterial {...logoMaterialSet} />
						</mesh>
						<mesh {...newLogoModel.nodes.logoFireContour} />

						<mesh {...newLogoModel.nodes.separator}>
							<meshStandardMaterial {...logoMaterialSet} />
						</mesh>

						<mesh {...newLogoModel.nodes.numberFifty}>
							<meshStandardMaterial {...logoMaterialSet} />
						</mesh>
						<mesh {...newLogoModel.nodes.numberFiftyContour} />
					</group>
				</group>
			</group>
		</>
	);
});
