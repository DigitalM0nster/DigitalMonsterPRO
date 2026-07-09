import { SpotLight } from "@react-three/drei"
import { useFrame, useThree } from "@react-three/fiber"
import { Vector3 } from "three"
import { forwardRef } from "react"


export default forwardRef(function MovingLight({vec = new Vector3(), ...props}, ref) {
    const viewport = useThree((state) => state.viewport)
    useFrame((state) => {
      ref.current.target.position.lerp(vec.set((state.mouse.x * viewport.width) / 2, (state.mouse.y * viewport.height) / 2, 0), 0.1)
      ref.current.target.updateMatrixWorld()
    })

    return <>
    
    {/* Тени в проекте отключены (GPU); после {...props}, чтобы нельзя было включить castShadow снаружи */}
    <SpotLight ref={ref} penumbra={1} attenuation={1} distance={1} angle={1} anglePower={1} intensity={1} {...props} castShadow={false} />
    
    </>
})