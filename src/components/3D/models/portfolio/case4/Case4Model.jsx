import { useRef, forwardRef, useState, useEffect } from "react";
import { Float, useFBX } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import ShoeModel from "./ShoeModel.jsx";
import { easing } from "maath";
import { useStore } from "@/store.jsx";
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

const CASE4_PATH = `/portfolio/04`;

export default forwardRef(function Case4Model(props, ref) {
	const store = useStore();
	const { phase: routePhase } = useRouteTransitionContext();
	const [activePage, setActivePage] = useState(true);

	const { camera } = useThree();

	// После scale→0 и visible=false не крутим useFrame (как Case1 / Case2)
	const exitHideCompleteRef = useRef(false);
	const SCALE_HIDE_EPS = 0.001;

	useEffect(() => {
		if (shouldActivateRoutePage(props.currentPage === CASE4_PATH, routePhase)) {
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
		if (props.currentPage === CASE4_PATH) {
			store.scroll = 0;
			camera.position.x = 0;
			camera.position.y = 0;
			camera.position.z = 9;
			camera.lookAt(0, 0, 0);
		}
		if (props.currentPage != CASE4_PATH) {
			setActivePage(false);
		}
	}, [activePage]);

	const boxRef = useRef();
	const donutTopRef = useRef();
	const donutBotRef = useRef();
	const coneRef = useRef();
	const capsuleRef = useRef();
	const sphereRef = useRef();
	const locationModelRef = useRef();

	const locationModel = useFBX("/models/case4/locationIconModel.fbx");

	// GPU: wireframe + transparent даёт лишний overdraw; на low — проще сетка и без wireframe
	const tier = store.graphicsTier;
	const sphereGeoArgs = tier === "high" ? [1, 26, 13] : tier === "medium" ? [1, 18, 10] : [1, 12, 8];
	const sphereWireframe = tier !== "low";
	const sphereTransparent = tier !== "low";

	useEffect(() => {
		locationModel.scale.x = 0.005;
		locationModel.scale.y = 0.005;
		locationModel.scale.z = 0.005;
		locationModel.children[0].material[0].color.r = 2;
		locationModel.children[0].material[0].color.g = 0.3;
		locationModel.children[0].material[0].color.b = 0;
	}, []);

	useFrame((renderer, delta) => {
		if (props.currentPage !== CASE4_PATH && ref.current && !ref.current.visible && exitHideCompleteRef.current) {
			return;
		}

		if (!ref.current) {
			return;
		}

		if (activePage === true) {
			restoreRootForShow(ref.current);

			if (!boxRef.current || !donutTopRef.current || !coneRef.current || !sphereRef.current) {
				return;
			}

			// CAMERA
			// easing.damp(renderer.camera.position, 'y', 0 - store.scroll * 35, 0.0, delta)

			// Transition in
			ref.current.visible = true;

			// Object Animations with cursor
			boxRef.current.rotation.x += delta * 0.15;
			donutTopRef.current.rotation.x += delta * 0.15;
			coneRef.current.rotation.z += delta * 0.15;
			coneRef.current.rotation.x += delta * 0.05;
			sphereRef.current.rotation.y += delta * 0.05;
			easing.damp3(ref.current.rotation, [renderer.pointer.y * 0.05, Math.PI + renderer.pointer.x * 0.2, 0], 1, delta);
			if (renderer.size.width > 768) {
				easing.damp3(ref.current.position, [1.6, 0, 0], 1, delta);
				easing.damp3(ref.current.scale, [1, 1, 1], 1, delta);
			} else {
				easing.damp3(ref.current.position, [0, -0.5, 0], 1, delta);
				easing.damp3(ref.current.scale, [0.7, 0.7, 0.7], 1, delta);
			}
		} else {
			// Transition out — только scale, без вращений и позиции
			easing.damp3(ref.current.scale, [0, 0, 0], 0.2, delta);
			const sx = Math.abs(ref.current.scale.x);
			const sy = Math.abs(ref.current.scale.y);
			const sz = Math.abs(ref.current.scale.z);
			if (sx <= SCALE_HIDE_EPS && sy <= SCALE_HIDE_EPS && sz <= SCALE_HIDE_EPS) {
				ref.current.visible = false;
				ref.current.rotation.x = 0;
				ref.current.rotation.y = 0;
				ref.current.rotation.z = 0;
				exitHideCompleteRef.current = true;
				freezeHiddenRoot(ref.current);
			}
		}
	});

	return (
		<>
			<group ref={ref} position={[1.6, 0, 0]}>
				<Float
					speed={1} // Animation speed, defaults to 1
					rotationIntensity={1.1} // XYZ rotation intensity, defaults to 1
					floatIntensity={0.3} // Up/down float intensity, works like a multiplier with floatingRange,defaults to 1
					floatingRange={[-0.1, 0.1]} // Range of y-axis values the object will float within, defaults to [-0.1,0.1]
				>
					<mesh ref={boxRef} position={[2.5, 1.6, 1.3]} rotation={[0, 0.4, 0]} scale={0.45}>
						<meshStandardMaterial />
						<boxGeometry />
					</mesh>
				</Float>

				<Float
					speed={0.75} // Animation speed, defaults to 1
					rotationIntensity={0.5} // XYZ rotation intensity, defaults to 1
					floatIntensity={1} // Up/down float intensity, works like a multiplier with floatingRange,defaults to 1
					floatingRange={[-0.1, 0.1]} // Range of y-axis values the object will float within, defaults to [-0.1,0.1]
				>
					<mesh ref={capsuleRef} position={[-3, 0, 1]} rotation={[0, 0, 0.47]} scale={0.15}>
						<meshStandardMaterial />
						<capsuleGeometry />
					</mesh>
				</Float>

				<Float
					speed={1} // Animation speed, defaults to 1
					rotationIntensity={0} // XYZ rotation intensity, defaults to 1
					floatIntensity={0} // Up/down float intensity, works like a multiplier with floatingRange,defaults to 1
					floatingRange={[-1, 1]} // Range of y-axis values the object will float within, defaults to [-0.1,0.1]
				>
					<mesh ref={donutBotRef} position={[2.75, -1, 2]} rotation={[0.4, -0.5, 0]} scale={0.2}>
						<meshStandardMaterial />
						<torusGeometry />
					</mesh>
				</Float>

				<Float
					speed={1} // Animation speed, defaults to 1
					rotationIntensity={0.1} // XYZ rotation intensity, defaults to 1
					floatIntensity={0.1} // Up/down float intensity, works like a multiplier with floatingRange,defaults to 1
					floatingRange={[-0.01, 0.01]} // Range of y-axis values the object will float within, defaults to [-0.1,0.1]
				>
					<mesh ref={donutTopRef} position={[-3.2, 2.5, 3]} rotation={[0.5, 0.9, 0]} scale={0.4}>
						<meshStandardMaterial />
						<torusGeometry />
					</mesh>
				</Float>

				<group>
					<ShoeModel position={[-1.4, -1, -1.1]} rotation={[-0.2, 0.6, -0.2]} scale={1.2} color="#ff7300" />
					<mesh ref={sphereRef} scale={1.8} key={tier}>
						<sphereGeometry args={sphereGeoArgs} />
						<meshStandardMaterial
							color={[0.1, 0.1, 0.1]}
							emissive={[1.6, 1.6, 1.6]}
							emissiveIntensity={tier === "low" ? 0.85 : 1.2}
							toneMapped={false}
							transparent={sphereTransparent}
							wireframe={sphereWireframe}
						/>
					</mesh>
					<primitive ref={locationModelRef} object={locationModel} />
				</group>

				<Float
					speed={1} // Animation speed, defaults to 1
					rotationIntensity={0.5} // XYZ rotation intensity, defaults to 1
					floatIntensity={0.1} // Up/down float intensity, works like a multiplier with floatingRange,defaults to 1
					floatingRange={[-0.01, 0.01]} // Range of y-axis values the object will float within, defaults to [-0.1,0.1]
				>
					<mesh ref={coneRef} position={[0.75, -2.5, 2]} rotation={[0, 0.14, 0.6]} scale={0.45}>
						<capsuleGeometry args={[0.35, 0.5, 32]} />
						<meshStandardMaterial />
					</mesh>
				</Float>
			</group>
		</>
	);
});
