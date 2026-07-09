import { useRef, useEffect, useState } from "react";
import { addEffect, useFrame, useThree } from "@react-three/fiber";
import * as THREE from 'three'
import { useStore } from "@/store";

export default function PointerCircle() {
    // const [active, setActive] = useState(true)

    useEffect(() => {
        const changeCirclePosition = addEffect(() =>{
            function lerp(start, end, t) {
                return (1 - t) * start + t * end;
            }
            let pointerCircleCenterCoord = pointerCircleCenter.current.getBoundingClientRect()
            let pointerCircleBackPointBackCoord = pointerCircleBackPoint.current.getBoundingClientRect()
            let distance = Math.hypot(cursorX - pointerCircleBackPointBackCoord.x, cursorY - pointerCircleBackPointBackCoord.y)
            let currentDistance = Math.hypot(cursorX - pointerCircleCenterCoord.x, cursorY - pointerCircleCenterCoord.y)
            pointerCircleCenterCoord = pointerCircleCenter.current.getBoundingClientRect()
    
            if (distance < distanceStatic) {
                let lerpToCursorX = lerp(pointerCircleCenterCoord.x, cursorX, 0.005)
                let lerpToCursorY = lerp(pointerCircleCenterCoord.y, cursorY, 0.005)              
                pointerCircleCenter.current.style.cssText = `
                    left: ${lerpToCursorX}px;
                    top: ${lerpToCursorY}px;
                `

                // CHANGING SIZE 
                // if (currentDistance < distanceStatic){
                //     let lerpCircleSize = lerp(pointerCircle.current.offsetWidth, 100 + ((distanceStatic - currentDistance + 0.1) / 5), 0.05 )
                //     pointerCircle.current.style.cssText = `
                //         width: ${lerpCircleSize}px;
                //         height: ${lerpCircleSize}px;
                //     `
                // }
                // if (currentDistance > distanceStatic){
                //     let lerpCircleSize = lerp(pointerCircle.current.offsetWidth, 100 + ((distanceStatic - currentDistance + 0.1) / 5), 0.05 )
                //     pointerCircle.current.style.cssText = `
                //         width: ${lerpCircleSize}px;
                //         height: ${lerpCircleSize}px;
                //     `
                // }
            }
            if (distance > distanceStatic ) {
                let lerpBackX = lerp(pointerCircleCenterCoord.x, pointerCircleBackPointBackCoord.x, 0.005)
                let lerpBackY = lerp(pointerCircleCenterCoord.y, pointerCircleBackPointBackCoord.y, 0.005)
                pointerCircleCenter.current.style.cssText = `
                    left: ${lerpBackX}px;
                    top: ${lerpBackY}px;
                `
            }
        })

        let cursorX = null
        let cursorY = null
        window.addEventListener('mousemove', function mousemoving(e) {
            cursorX = e.clientX
            cursorY = e.clientY
        })
        return () => {
            changeCirclePosition()
        }
    }, [])
    const store = useStore()

    const pointerCircleBackPoint = useRef()
    const pointerCircleCenter = useRef()
    const pointerCircle = useRef()
    const distanceStatic = 150

    return <>
        <div className="pointerCircleOverlay">
            <div ref={pointerCircleBackPoint} className="pointerCircleBackPoint"></div>
            <div ref={pointerCircleCenter} className="pointerCircleCenter">
                <div ref={pointerCircle} className="pointerCircle"
                    onPointerOver={() => { 
                        store.openedCase = true 
                    }}
                    onPointerOut={()=>{ 
                        store.openedCase = false
                        store.portfolioOverlay.removing = true
                        setTimeout(() => {
                            store.portfolioOverlay.removing = false
                        }, 200);
                     }}            
                >
                </div>
            </div>
        </div>
    </>
}