import { useFBX } from "@react-three/drei"
import { useEffect } from "react"

export default function WhitePointsSphere() {

    const model = useFBX('/models/FBX/whitePointsSphere.fbx')
    useEffect(() => {
        model.children[3].visible = true
        model.children[2].visible = false
        model.children[1].visible = false
        model.children[0].visible = false
    }, [model])


    return <>
    <primitive object={model} scale={0.02} position={[0, 0, 0]} />
    </>
}
