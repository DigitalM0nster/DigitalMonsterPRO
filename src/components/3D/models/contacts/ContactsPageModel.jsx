import { useGLTF } from "@react-three/drei";
import { useRef, forwardRef, useEffect, useState } from "react";
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

const CONTACTS_PATH = `/contacts`;

export default forwardRef(function ContactsPageModel(props, ref) {
	const store = useStore();
	const { phase: routePhase } = useRouteTransitionContext();
	const [activePage, setActivePage] = useState(true);
	const { camera } = useThree();

	const exitHideCompleteRef = useRef(false);
	const SCALE_HIDE_EPS = 0.001;

	useEffect(() => {
		if (shouldActivateRoutePage(props.currentPage === CONTACTS_PATH, routePhase)) {
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
		if (props.currentPage === CONTACTS_PATH) {
			camera.position.x = 0;
			camera.position.y = 0;
			camera.position.z = 9;
			store.scroll = 0;
			camera.lookAt(0, 0, 0);
		}
		if (props.currentPage != CONTACTS_PATH) {
			setActivePage(false);
		}
	}, [activePage]);

	const sphereRef = useRef();
	const earthModel = useGLTF("/models/contactsModel/earth2.glb");

	useFrame((renderer, delta) => {
		if (props.currentPage !== CONTACTS_PATH && ref.current && !ref.current.visible && exitHideCompleteRef.current) {
			return;
		}

		if (!ref.current) {
			return;
		}

		if (activePage === true) {
			restoreRootForShow(ref.current);

			if (!sphereRef.current) {
				return;
			}

			// Transition in
			ref.current.visible = true;
			easing.damp3(ref.current.scale, [1, 1, 1], 1, delta);
			sphereRef.current.rotation.y += delta * 0.1;
			if (renderer.size.width > 768) {
				easing.damp3(ref.current.position, [0, 0.5, 0], 1, delta);
			} else {
				easing.damp3(ref.current.position, [0, 0.5, 0], 1, delta);
			}
		} else {
			// Transition out
			easing.damp3(ref.current.scale, [0, 0, 0], 0.3, delta);
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
			<group ref={ref} position={[0, 0.5, 0]} rotation={[0, 0, 0]} dispose={null}>
				<mesh ref={sphereRef} {...earthModel.nodes.Sphere} scale={1.9}>
					<meshStandardMaterial {...earthModel.materials.sphereMat} toneMapped={false} emissiveIntensity={7} transparent={true} />
				</mesh>
			</group>
		</>
	);
});
