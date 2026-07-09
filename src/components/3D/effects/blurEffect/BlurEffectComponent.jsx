import { forwardRef } from 'react'
import BlurEffect from './BlurEffect.jsx'

export default forwardRef(function BlurEffectComponent(props, ref){

    const effect = new BlurEffect(props)

    return <>
        <primitive ref={ref} object={ effect } />
    </>

})