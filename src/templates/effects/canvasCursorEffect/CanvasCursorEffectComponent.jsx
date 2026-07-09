import { forwardRef } from 'react'
import CanvasCursorEffect from './CanvasCursorEffect.jsx'
import { useFrame } from '@react-three/fiber'

export default forwardRef(function CanvasCursorEffectComponent(props, ref){

    const effect = new CanvasCursorEffect(props)

    return <>
        <primitive ref={ref} object={ effect } />
    </>

})