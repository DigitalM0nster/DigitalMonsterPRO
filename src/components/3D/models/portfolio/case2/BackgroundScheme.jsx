import { shaderMaterial, useTexture } from "@react-three/drei";
import { extend, useFrame } from "@react-three/fiber";
import { forwardRef } from "react";

import { CASE2_PATH } from "./case2Constants.js";

export default forwardRef(function BackgroundScheme(props, ref) {
	const texture = useTexture("/models/case2/textures/roofBack.png");

	const MyShaderMaterial = shaderMaterial(
		{
			Uopacity: 0,
			Utexture: texture,
			tDiffuse: null,
		},
		/* GLSL */ `
        varying vec2 vUv;
        void main()
        {
            gl_Position = vec4(position.x + 0.5, position.y, position.z + 1.1, 1.1);
            vUv = uv;
        }
        `,
		/* GLSL */ `
        uniform sampler2D Utexture;
        uniform float Uopacity;
        varying vec2 vUv;

        void main()
        {
            vec4 color = texture2D(Utexture, vUv);
            gl_FragColor = vec4(color.r, color.g, color.b, color.a) * Uopacity;
        }

        `,
	);

	extend({ MyShaderMaterial });

	// Не трогаем uniform и не вызываем setState каждый кадр вне Case2 / когда корень скрыт (CPU п.5)
	useFrame(() => {
		if (props.currentPage !== CASE2_PATH) {
			return;
		}
		if (props.case2RootRef?.current && !props.case2RootRef.current.visible) {
			return;
		}
		if (ref.current) {
			ref.current.uniforms.Uopacity.value = ref.current.opacity;
		}
	});

	return (
		<>
			<mesh position={[0, 0, 0]}>
				<planeGeometry args={[2, 2, 1, 1]} />
				<myShaderMaterial ref={ref} transparent={true} wireframe={false} />
			</mesh>
		</>
	);
});
