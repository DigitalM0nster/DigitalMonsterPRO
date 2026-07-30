import * as THREE from 'three'
import { useGLTF } from "@react-three/drei"


export default function ShoeModel(props) {
    const { nodes, materials } = useGLTF('/models/case4/shoe.gltf')

    return <>
    <group {...props} dispose={null}>
      <mesh geometry={nodes.shoe.geometry} material={materials.laces} material-envMapIntensity={0.8} />
      <mesh geometry={nodes.shoe_1.geometry}>
        <meshStandardMaterial
          color={props.color}
          aoMap={materials.mesh.aoMap}
          normalMap={materials.mesh.normalMap}
          normalMap-colorSpace={THREE.SRGBColorSpace}
          roughnessMap={materials.mesh.roughnessMap}
          metalnessMap={materials.mesh.metalnessMap}
          envMapIntensity={0.8}
        />
      </mesh>
      <mesh geometry={nodes.shoe_2.geometry} material={materials.caps} material-envMapIntensity={0.8} />
      <mesh geometry={nodes.shoe_3.geometry} material={materials.inner} material-envMapIntensity={0.8} />
      <mesh geometry={nodes.shoe_4.geometry} material={materials.sole} material-envMapIntensity={0.8} />
      <mesh geometry={nodes.shoe_5.geometry} material={materials.stripes} material-envMapIntensity={0.8} />
      <mesh geometry={nodes.shoe_6.geometry} material={materials.band} material-envMapIntensity={0.8} />
      <mesh geometry={nodes.shoe_7.geometry} material={materials.patch} material-envMapIntensity={0.8} />
    </group>
    </>
}