import { forwardRef } from 'react'
import CustomBlur2Class from './CustomBlur2Class.jsx'

export default forwardRef(function CustomBlurComponent(props, ref){

    const effect = new CustomBlur2Class(props)

    return <>
        <primitive ref={ref} object={ effect } />
    </>

})