import { forwardRef } from 'react'
import BorderBlurEffect from './BorderBlurEffect.jsx'

export default forwardRef(function BorderBlurEffectComponent(props, ref){

    const effect = new BorderBlurEffect(props)

    return <>
        <primitive ref={ref} object={ effect } />
    </>

})