import { useRef, useState, forwardRef, useEffect } from "react";

import { useFrame, useThree } from "@react-three/fiber";
import { easing } from "maath";

import RoofModel from "./RoofModel.jsx";
import LinesModel from "./LinesModel.jsx";
import BackgroundScheme from "./BackgroundScheme.jsx";
import { CASE2_PATH } from "./case2Constants.js";
import { useStore } from "@/store.jsx";

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

import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { ROUTE_TRANSITION_ENTER_MS } from "@/config/routeTransition.js";
import { shouldActivateRoutePage } from "@/utils/shouldActivateRoutePage.js";

export default forwardRef(function Case2Model(props, ref) {
	const store = useStore();
	const { phase: routePhase } = useRouteTransitionContext();
	const { camera } = useThree();

	const showCase2Subtree =
		props.currentPage === CASE2_PATH || props.teleportPage === CASE2_PATH;

	const [hovered, setHovered] = useState(true);
	const [activePage, setActivePage] = useState(true);

	// После scale→0 и visible=false не крутим useFrame (как Case1 / Case3)
	const exitHideCompleteRef = useRef(false);
	const SCALE_HIDE_EPS = 0.001;

	useEffect(() => {
		if (shouldActivateRoutePage(props.currentPage === CASE2_PATH, routePhase)) {
			exitHideCompleteRef.current = false;
			if (ref.current) {
				restoreRootForShow(ref.current);
			}
			const enterId = setTimeout(() => {
				setActivePage(true);
			}, ROUTE_TRANSITION_ENTER_MS);
			setHovered(true);
			const hoverId = setTimeout(() => {
				setHovered(false);
			}, 1500);
			return () => {
				clearTimeout(enterId);
				clearTimeout(hoverId);
			};
		}
		setActivePage(false);
		const hoverResetId = setTimeout(() => {
			setHovered(true);
		}, ROUTE_TRANSITION_ENTER_MS);
		return () => clearTimeout(hoverResetId);
	}, [props.currentPage, routePhase]);

	// Камера и scroll — только при смене маршрута (не зависеть от activePage: иначе цикл setState)
	useEffect(() => {
		if (props.currentPage !== CASE2_PATH) {
			setActivePage(false);
			return;
		}
		camera.position.x = 0;
		camera.position.y = 0;
		camera.position.z = 9;
		camera.lookAt(0, 0, 0);
		store.scroll = 0;
	}, [props.currentPage, camera]);

	const roofGroup = useRef();
	const linesModelRef = useRef();
	const backgroundRef = useRef();

	useFrame((renderer, delta) => {
		if (props.currentPage !== CASE2_PATH && ref.current && !ref.current.visible && exitHideCompleteRef.current) {
			return;
		}

		if (!ref.current) {
			return;
		}

		if (activePage === true) {
			restoreRootForShow(ref.current);

			if (!roofGroup.current || !backgroundRef.current) {
				return;
			}

			// CAMERA
			easing.damp(renderer.camera.position, "y", 0 - store.scroll * 35, 0.0, delta);

			// Transition in
			ref.current.visible = true;
			easing.damp3(ref.current.scale, [1, 1, 1], 1, delta);
			backgroundRef.current.visible = true;
			easing.damp(backgroundRef.current, "opacity", 0.25, 1, delta);

			// Animation model with cursor
			if (renderer.size.width <= 768) {
				easing.damp3(roofGroup.current.position, [0, Math.min(store.scroll * 40, 10), 0], 0.01, delta);
				easing.damp3(ref.current.rotation, [0.02, 0.1, 0], 1, delta);
				easing.damp3(ref.current.position, [0, -0.2, 0], 1, delta);
			}
			if (renderer.size.width > 768) {
				easing.damp3(roofGroup.current.position, [0, 0, 0], 0.01, delta);
				easing.damp3(ref.current.rotation, [renderer.pointer.y * 0.02, renderer.pointer.x * 0.2, 0], 1, delta);
				easing.damp3(ref.current.position, [1.25, 0, 0], 1, delta);
			}
		} else {
			// Transition out — только scale и фон, без камеры и интерактива
			easing.damp3(ref.current.scale, [0, 0, 0], 0.2, delta);
			if (backgroundRef.current) {
				easing.damp(backgroundRef.current, "opacity", 0, 0.2, delta);
				if (backgroundRef.current.opacity === 0) {
					backgroundRef.current.visible = false;
				}
			}
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
			<group ref={ref} position={[1.25, 0, 0]}>
				{showCase2Subtree && (
					<>
						<group
							ref={roofGroup}
							rotation={[0.4, 0.4, 0]}
							onPointerMove={() => setHovered(true)}
							onPointerLeave={() => setHovered(false)}
						>
							<RoofModel hovered={hovered} currentPage={props.currentPage} case2RootRef={ref} />
							<LinesModel
								ref={linesModelRef}
								hovered={hovered}
								currentPage={props.currentPage}
								case2RootRef={ref}
							/>
						</group>
						<BackgroundScheme ref={backgroundRef} currentPage={props.currentPage} case2RootRef={ref} />
					</>
				)}
			</group>
		</>
	);
});
