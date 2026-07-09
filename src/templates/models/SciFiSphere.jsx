import { useAnimations, useFBX, useGLTF } from "@react-three/drei"
import { extend, useFrame } from "@react-three/fiber"
import { useEffect } from "react"

export default function SciFiSphere(props) {

    const SciFiSphere = useFBX('/models/FBX/sci-fiSphere.fbx')
    console.log(SciFiSphere)
    useEffect(() => {
        SciFiSphere.children[7].visible = false // Куб вокруг
        SciFiSphere.children[6].visible = false // Пол
        SciFiSphere.children[5].visible = false // Камера
        SciFiSphere.children[4].visible = false // большая сердцевина
        SciFiSphere.children[3].visible = false // lightinside2
        SciFiSphere.children[2].visible = true // железки
        SciFiSphere.children[1].visible = false // lightinside
        SciFiSphere.children[0].visible = true // сердцевинка
    })

    useFrame((smth, delta, smth2) => {
    })


    return <>
    <primitive object={SciFiSphere} scale={0.02} position={[0, 0, 0]} />
    </>
}