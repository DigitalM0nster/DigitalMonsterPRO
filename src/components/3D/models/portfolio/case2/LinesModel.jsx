import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { easing } from "maath";
import { useRef, forwardRef } from "react";
import { useStore } from "@/store";

import { CASE2_PATH } from "./case2Constants.js";

export default forwardRef(function LinesModel(props, ref) {
    const store = useStore()
    const line1ref = useRef()
    const line2ref = useRef()
    const line3ref = useRef()
    const topLinesRef = useRef()
    
    const positionSetting = {
        position: [-0.9, -0.4, -1],
    }
    const topLinesSetting = {
        position: [0, 0, 0],
        scale: [1, 1, 1]
    }
    const bottomLineSetting = {
        position: [0, 0, 0]
    }


    useFrame((renderer, delta) => {
        if (props.currentPage !== CASE2_PATH) {
            return;
        }
        if (props.case2RootRef?.current && !props.case2RootRef.current.visible) {
            return;
        }
        if (!topLinesRef.current || !line3ref.current) {
            return;
        }

        if (props.hovered === true && store.openedCase === false) {
            easing.damp3(topLinesRef.current.scale, [1, 1, 1], 0.3, delta)
            easing.damp3(topLinesRef.current.position, [0, 0, 0], 0.3, delta)
            easing.damp3(line3ref.current.position, [0, 0, 0], 0.3, delta)
        } else {
            easing.damp3(topLinesRef.current.scale, [1, 0.4, 1], 0.5, delta)
            easing.damp3(topLinesRef.current.position, [0, 0.4, 0], 0.5, delta)
            easing.damp3(line3ref.current.position, [0, 0.55, 0], 0.5, delta)
        }
    });
    

    return <>
    <group {...positionSetting} ref={ref}>
        <group ref={topLinesRef} {...topLinesSetting}>
            <Line ref={line1ref}
                points={[
                    [0.0, 0.0, 0.0],
                    [0.0, 1.4, 0.0],
                    [0.05, 1.45, 0.0],
                    [1.0, 1.45, 0.0]
                ]}
                color={[6, 4, 4.5]}
                emissive={[10, 10, 10]}
                emissiveIntensity={30}
                toneMapped={false}
                lineWidth={0.75}
            />
            <Line ref={line2ref}
                points={[
                    [1.6, 1.45, 1.0],
                    [1.6, 1.45, 3.2],
                    [1.6, 1.4, 3.25],
                    [1.6, 0.25, 3.25],
                ]}
                color={[4, 3.5, 3]}
                emissive={[10, 10, 10]}
                emissiveIntensity={30}
                toneMapped={false}
                lineWidth={0.75}
            />
        </group>
        <Line ref={line3ref} {...bottomLineSetting}
            points={[
                [1.6, -0.65, 3.25],
                [1.6, -0.7, 3.25],
                [1.55, -0.75, 3.25],
                [0.05, -0.75, 3.25],
                [0, -0.75, 3.2],
                [0, -0.75, 0.0],
            ]}
            color={[4, 3.5, 3]}
            emissive={[10, 10, 10]}
            emissiveIntensity={30}
            toneMapped={false}
            lineWidth={0.75}
        />
    </group>
    </>
})