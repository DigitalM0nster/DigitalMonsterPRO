import { EffectComposer, Bloom} from '@react-three/postprocessing'
import { useEffect, useRef } from 'react'
import { useControls } from 'leva'
import DistortionEffectComponent from './distortionEffect2/distortionEffectComponent.jsx'
import { useLocation } from 'react-router-dom'

export default function EffectComposerComponent(props) {
    const location = useLocation()
    useEffect(() => {
        // rerender effect when change route
    }, [location])

    const bloomRef = useRef()
    const distortionRef = useRef()

    const bloomSetSetting = useControls('bloom', {
        intensity: {
            value: 2,
            min:0,
            max: 10,
            step: 0.01
        },
        luminanceThreshold: {
            value: 0,
            min:0,
            max: 10,
            step: 0.01
        },
        luminanceSmoothing: {
            value: 1,
            min:0,
            max: 10,
            step: 0.01
        },
        mipmapBlur: {
            value: true
        }
    })

    const setting = useControls('settings', {
        horizontalBlocksNumber: {
            value: 60.0,
            min: 0.0,
            max: 60,
            step: 1.0,
        },
        verticalBlocksNumber: {
            value: 60.0,
            min: 0.0,
            max: 60,
            step: 1.0,
        },
        powerDistortion: {
            value: 0.001,
            min: 0.0,
            max: 1,
            step: 0.0001
        },
    })


    return <>

    {/* <EffectComposer>
        <DistortionEffectComponent ref={distortionRef} {...setting}/>
        <Bloom {...bloomSetSetting} ref={bloomRef}/>
    </EffectComposer> */}
    
    </>
}