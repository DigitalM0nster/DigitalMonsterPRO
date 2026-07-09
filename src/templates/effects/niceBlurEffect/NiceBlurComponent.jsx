import { forwardRef } from 'react'
import NiceBlurEffect from './NiceblurEffect.jsx'

export default forwardRef(function NiceBlurComponent(props, ref){

    const effect = new NiceBlurEffect(props)

    return <>
        <primitive ref={ref} object={ effect } />
    </>

})