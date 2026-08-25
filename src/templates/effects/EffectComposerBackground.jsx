import { EffectComposer } from '@react-three/postprocessing'
import { useRef } from 'react'
import { useControls } from 'leva'
import CanvasBlurEffectComponent from './canvasBlurEffect/CanvasBlurEffectComponent.jsx'

export default function EffectComposerBlur() {
    const blurRef = useRef()
    const canvasBlurSetting = useControls('setting', {
        blurPower: {
            value: 33.0,
            min: 0.0,
            max: 100,
            step: 0.1,
        },
        cornerRadius: {
            value: 0.038,
            min: 0,
            max: 100,
            step: 0.001,
        },
        noBlurWidth: {
            value: 0.86,
            min: 0.1,
            max: 1,
            step: 0.01,
        },
        noBlurHeight: {
            value: 0.898,
            min: 0.1,
            max: 1,
            step: 0.0001,
        },
    })

    return <>

    <EffectComposer>
        <CanvasBlurEffectComponent ref={blurRef} {...canvasBlurSetting} />
    </EffectComposer>
    
    </>
}
