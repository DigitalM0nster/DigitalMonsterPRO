import { forwardRef } from 'react'
import CustomTransitionEffect from './CustomTransitionEffect.jsx'

export default forwardRef(function CustomTransitionComponent(props, ref){

    const effect = new CustomTransitionEffect(props)

    return <>
        <primitive ref={ref} object={ effect } />
    </>

})