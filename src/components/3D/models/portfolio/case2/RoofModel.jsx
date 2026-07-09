import { useGLTF, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { easing } from "maath";
import { useLayoutEffect, useRef } from "react";
import { useStore } from "@/store";
import { CASE2_PATH, CASE2_TEXTURE_URLS } from "./case2Constants.js";

export default function RoofModel(props) {
	const store = useStore();

	const platform1Model = useGLTF("/models/case2/platform1.glb");
	const platform2Model = useGLTF("/models/case2/platform2.glb");
	const platform3Model = useGLTF("/models/case2/platform3.glb");
	const platform4Model = useGLTF("/models/case2/platform4.glb");
	const platform5Model = useGLTF("/models/case2/platform5.glb");
	const platform6Model = useGLTF("/models/case2/platform6.glb");

	const platform1 = useRef();
	const platform2 = useRef();
	const platform3 = useRef();
	const platform4 = useRef();
	const platform5 = useRef();
	const platform6 = useRef();

	const [woodMap, woodNormalMap, matMap, matNormalMap, matArmMap] = useTexture(CASE2_TEXTURE_URLS);
	const mapsAppliedRef = useRef(false);

	useLayoutEffect(() => {
		if (mapsAppliedRef.current) {
			return;
		}
		if (
			!woodMap?.image ||
			!woodNormalMap?.image ||
			!matMap?.image ||
			!matNormalMap?.image ||
			!matArmMap?.image
		) {
			return;
		}

		mapsAppliedRef.current = true;

		platform3Model.materials.Brown.map = woodMap;
		platform3Model.materials.Brown.normalMap = woodNormalMap;

		const bottom = platform4Model.materials.MaterialBottom;
		bottom.map = matMap;
		bottom.normalMap = matNormalMap;
		bottom.metalnessMap = matArmMap;
		bottom.roughnessMap = matArmMap;
		bottom.aoMap = matArmMap;
	}, [woodMap, woodNormalMap, matMap, matNormalMap, matArmMap, platform3Model, platform4Model]);

	useLayoutEffect(() => {
		const child = platform6.current?.children[0];
		if (!child?.material) {
			return;
		}
		child.material.transparent = true;
		child.material.opacity = 0.15;
	}, [platform6Model]);

	useFrame((_, delta) => {
		if (props.currentPage !== CASE2_PATH) {
			return;
		}
		if (props.case2RootRef?.current && !props.case2RootRef.current.visible) {
			return;
		}
		if (
			!platform1.current ||
			!platform2.current ||
			!platform3.current ||
			!platform4.current ||
			!platform5.current ||
			!platform6.current
		) {
			return;
		}

		if (props.hovered === true && store.openedCase === false) {
			easing.damp3(platform1.current.position, [0, 1, 0], 0.3, delta);
			easing.damp3(platform2.current.position, [0, 0.6, 0], 0.3, delta);
			easing.damp3(platform3.current.position, [0, 0.2, 0], 0.3, delta);
			easing.damp3(platform4.current.position, [0, -0.2, 0], 0.3, delta);
			easing.damp3(platform5.current.position, [0, -0.6, 0], 0.3, delta);
			easing.damp3(platform6.current.position, [0, -1, 0], 0.3, delta);
		} else {
			easing.damp3(platform1.current.position, [0, 0, 0], 0.5, delta);
			easing.damp3(platform2.current.position, [0, 0, 0], 0.5, delta);
			easing.damp3(platform3.current.position, [0, 0, 0], 0.5, delta);
			easing.damp3(platform4.current.position, [0, 0, 0], 0.5, delta);
			easing.damp3(platform5.current.position, [0, 0, 0], 0.5, delta);
			easing.damp3(platform6.current.position, [0, 0, 0], 0.5, delta);
		}
	});

	return (
		<group scale={0.55}>
			<primitive ref={platform1} object={platform1Model.scene} position={[0, 1, 0]} />
			<primitive ref={platform2} object={platform2Model.scene} position={[0, 0.6, 0]} />
			<primitive ref={platform3} object={platform3Model.scene} position={[0, 0.2, 0]} />
			<primitive ref={platform4} object={platform4Model.scene} position={[0, -0.2, 0]} />
			<primitive ref={platform5} object={platform5Model.scene} position={[0, -0.6, 0]} />
			<primitive ref={platform6} object={platform6Model.scene} position={[0, -1, 0]} />
		</group>
	);
}
