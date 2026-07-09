import { forwardRef } from 'react'
import DistortionEffect from './DistortionEffect.jsx'

export default forwardRef(function distortionEffectComponent(props, ref){
    const effect = new DistortionEffect(props)

    return <>
        <primitive ref={ref} object={ effect }/>
    </>

})