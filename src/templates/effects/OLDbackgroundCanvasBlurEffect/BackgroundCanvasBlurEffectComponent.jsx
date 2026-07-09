import { forwardRef } from 'react'
import CanvasBlurEffect from './BackgroundCanvasBlurEffect.jsx'

export default forwardRef(function CanvasBlurEffectComponent(props, ref){

    const effect = new CanvasBlurEffect(props)

    return <>
        <primitive ref={ref} object={ effect } />
    </>

})