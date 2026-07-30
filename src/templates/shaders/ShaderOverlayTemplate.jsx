import { shaderMaterial } from "@react-three/drei"
import { extend } from "@react-three/fiber"


export default function shaderOverlay(props) {

    const MyShaderMaterial = shaderMaterial(
        {
            Uopacity: 1,
        },
        `
        void main()
        {
            gl_Position = vec4(position, 1.0);
        }
        `,
        `
        uniform float Uopacity;
        void main()
        {
            gl_FragColor = vec4(1.0, 0.0, 0.0, Uopacity);
        }

        `
    )

    extend({ MyShaderMaterial })



    return <>
     <mesh>
        <planeGeometry args={[2, 2, 1, 1]} />
        <myShaderMaterial transparent={true} wireframe={true} Uopacity={1}/>
     </mesh>
    </>
}