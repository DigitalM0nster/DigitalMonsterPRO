import { shaderMaterial, useAnimations, useFBX, useGLTF } from "@react-three/drei"
import { extend, useFrame } from "@react-three/fiber"
import { useEffect } from "react"

export default function whitePointsSphere(props) {

    const whitePointsSphere = useFBX('/models/FBX/whitePointsSphere.fbx')
    console.log(whitePointsSphere)
    useEffect(() => {
        whitePointsSphere.children[3].visible = true 
        whitePointsSphere.children[2].visible = false
        whitePointsSphere.children[1].visible = false
        whitePointsSphere.children[0].visible = false
    })

    useFrame((smth, delta, smth2) => {
    })


    return <>
    <primitive object={whitePointsSphere} scale={0.02} position={[0, 0, 0]} />
    </>
}