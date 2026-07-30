import { forwardRef } from 'react'
import BackgroundLiquidDistortionEffect from './BackgroundLiquidDistortion.jsx'

export default forwardRef(function BackgroundLiquidDistortionComponent(props, ref){

    const effect = new BackgroundLiquidDistortionEffect(props)

    return <>
        <primitive ref={ref} object={ effect } />
    </>

})