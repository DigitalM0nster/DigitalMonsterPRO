import { Text, useTexture, MeshTransmissionMaterial } from "@react-three/drei"
import { useControls } from "leva"
export default function mainPageModel(props) {

    const texture = useTexture('/images/textTexture.png')
    const texture1 = useTexture('/images/textTexture1.png')
    const texture2 = useTexture('/images/textTexture2.png')

    const { ...config } = useControls('gg',{
      backside: false,
      backsideThickness: { value: 0, min: 0, max: 2 },
      samples: { value: 16, min: 1, max: 32, step: 1 },
      resolution: { value: 256, min: 64, max: 2048, step: 64 },
      transmission: { value: 1, min: 0, max: 3 },
      clearcoat: { value: 0, min: 0.1, max: 1 },
      clearcoatRoughness: { value: 0.0, min: 0, max: 1 },
      thickness: { value: 5, min: 0, max: 5 },
      chromaticAberration: { value: 5, min: 0, max: 5 },
      anisotropy: { value: 0, min: 0, max: 1, step: 0.01 },
      roughness: { value: 0.4, min: 0, max: 1, step: 0.01 },
      distortion: { value: 4, min: 0, max: 4, step: 0.01 },
      distortionScale: { value: 2, min: 0.01, max: 2, step: 0.01 },
      temporalDistortion: { value: 0.11, min: 0, max: 1, step: 0.01 },
      ior: { value: 3, min: 0, max: 3, step: 0.01 },
      color: '#ffffff',
      gColor: '#ffffff',
      shadow: '#000000',
      toneMapped: true,
      emissive: true,
      emissiveColor: '#000000',
      emissiveIntensity: { value: 3, min: 0, max: 3, step: 0.01 },
    })
    const textSetting = useControls('text',{
      scale: {
        value: [1, 1, 1],
        min: 0.1,
        max: 5,
        step: 0.01
      },
      letterSpacing: { value: 0.11, min: 0, max: 1, step: 0.01 },
      outlineBlur: { value: 0.06, min: 0, max: 1, step: 0.01 },
      outlineColor: '#00aaff',
      outlineOpacity: { value: 1, min: 0, max: 1, step: 0.01 },

    })
    
    return <>
    <Text font="/fonts/Montserrat-Black.woff" fontSize={1} letterSpacing={1} color="#ffffff" {...textSetting}>
      LAVAWEB
      <MeshTransmissionMaterial {...config} background={texture2} />
    </Text>
    {/* <mesh>
      <planeGeometry args={[6, 2]}/>
      <MeshTransmissionMaterial {...config} background={texture2} />
    </mesh> */}
    </>
}