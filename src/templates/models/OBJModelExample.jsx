import { useRef } from 'react'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { useLoader } from '@react-three/fiber'

export default function ContactsPageModel() {
  const myRef = useRef()

  const contactsMaterials = useLoader(MTLLoader, '/models/OBJ/Orange_Cyber_A.mtl')
  const contactsModel = useLoader(OBJLoader, '/models/OBJ/Circle.obj', loader => {
    contactsMaterials.preload()
    loader.setMaterials(contactsMaterials)
  })

  return <>
  <primitive ref={myRef} object={contactsModel} />
  </>
}