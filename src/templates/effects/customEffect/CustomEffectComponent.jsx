import { forwardRef } from 'react'
import CustomEffectClass from './CustomEffectClass.jsx'

export default forwardRef(function CustomEffectComponent(props, ref){

    const effect = new CustomEffectClass(props)

    return <>
        <primitive ref={ref} object={ effect } />
    </>

})