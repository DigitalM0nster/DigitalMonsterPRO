import { useFBX } from '@react-three/drei'
import { useControls } from 'leva'
import { useRef } from 'react'
import { motion } from 'framer-motion-3d'
import { useFrame } from '@react-three/fiber'
import { EffectComposer, SelectiveBloom } from '@react-three/postprocessing'

export default function SilverCIrcleExample() {
  const myRef1 = useRef()
  const myRef2 = useRef()
  const bloomRef = useRef()

  const posSettingControls = {
    position: [2, 0.15, 1.5 ],
  }
  const rotateSetting = {
    rotation: [Math.PI * 0.5, 0, 0]
  }

  const colorSetting1 = useControls('color1',{
    metalness: {
      value: 1,
      min: 0,
      max: 1,
      step: 0.01
    },
    roughness: {
      value: 0.43,
      min: 0,
      max: 1,
      step: 0.01
    },
    color: {
      value: '#d8d8d8'
    }
  })
  const colorSetting2 = useControls('color2',{
    color: {
      value: 'white'
    }
  })

  const objectAnimation = {
    initial: {
      scale: 0,
      transition: {
        duration: 1
      }
    },
    animate: {
      scale: 1,
      transition: {
        duration: 2
      }
    },
    exit: {
      scale: 0,
      transition: {
        duration: 0.5
      }
    }
  }
  const contactsModel = useFBX('/models/FBX/Circle.fbx')
  const bloomSetting = {
    // lights: [dirLight],
    selection: [myRef1],
    intensity: 3,
    luminanceThreshold: 0.05,
    luminanceSmoothing: 0.05,
    mipmapBlur: true,
}

  useFrame((smth, delta, smth2) => {
    myRef1.current.rotation.z += delta * 1
  })

  return <>
  <motion.group {...objectAnimation} {...posSettingControls}>
    <group scale={1.75}>
      <mesh ref={myRef1} geometry={contactsModel.children[0].geometry} {...rotateSetting}>
        <meshStandardMaterial {...colorSetting1}/>
      </mesh>
      <mesh ref={myRef2} geometry={contactsModel.children[3].geometry} scale={0.5}>
        <meshBasicMaterial {...colorSetting2}/>
      </mesh>
    </group>
  </motion.group>
  <EffectComposer>
    <SelectiveBloom {...bloomSetting} ref={bloomRef}/>
  </EffectComposer>
  </>
}