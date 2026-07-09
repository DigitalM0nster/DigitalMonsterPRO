import { forwardRef } from 'react'
import CustomBlurClass from './CustomBlurClass.jsx'

export default forwardRef(function CustomBlurComponent(props, ref){

    const effect = new CustomBlurClass(props)

    return <>
        <primitive ref={ref} object={ effect } />
    </>

})