import { useFBX } from "@react-three/drei"
import { useEffect } from "react"

export default function SciFiSphere() {

    const model = useFBX('/models/FBX/sci-fiSphere.fbx')
    useEffect(() => {
        model.children[7].visible = false // Куб вокруг
        model.children[6].visible = false // Пол
        model.children[5].visible = false // Камера
        model.children[4].visible = false // большая сердцевина
        model.children[3].visible = false // lightinside2
        model.children[2].visible = true // железки
        model.children[1].visible = false // lightinside
        model.children[0].visible = true // сердцевинка
    }, [model])


    return <>
    <primitive object={model} scale={0.02} position={[0, 0, 0]} />
    </>
}
