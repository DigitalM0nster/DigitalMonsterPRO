import { shaderMaterial } from "@react-three/drei"
import { extend, useFrame } from "@react-three/fiber"


export default function ShaderBackgroundTemplate(props) {
    let deltaTime = null
    useFrame((smth, delta, smth2)=> {
        deltaTime += delta
    })

    const MyShaderMaterial = shaderMaterial(
        {
            uTime: deltaTime,
            uResolution: [window.innerWidth, window.innerHeight]
        },
        /*GLSL */`
        void main()
        {
            gl_Position = vec4(position, 1.0);
        }
        `,
        /*GLSL*/`
        uniform vec2 uResolution;
        uniform float uTime;
        float field(in vec3 p) {
            float strength = 7. + .03 * log(1.e-6 + fract(sin(uTime) * 4373.11));
            float accum = 0.;
            float prev = 0.;
            float tw = 0.;
            for (int i = 0; i < 32; ++i) {
                float mag = dot(p, p);
                p = abs(p) / mag + vec3(-.5, -.4, -1.5);
                float w = exp(-float(i) / 7.);
                accum += w * exp(-strength * pow(abs(mag - prev), 2.3));
                tw += w;
                prev = mag;
            }
            return max(0., 5. * accum / tw - .7);
        }
        
        void main() {
            vec2 uv = 2. * gl_FragCoord.xy / uResolution.xy - 1.;
            vec2 uvs = uv * uResolution.xy / max(uResolution.x, uResolution.y);
            vec3 p = vec3(uvs / 4., 0) + vec3(1., -1.3, 0.);
            p += .2 * vec3(sin(uTime / 16.), sin(uTime / 12.),  sin(uTime / 128.));
            float t = field(p);
            float v = (1. - exp((abs(uv.x) - 1.) * 6.)) * (1. - exp((abs(uv.y) - 1.) * 6.));
            gl_FragColor = mix(.4, 1., v) * vec4(1.8 * t * t * t, 1.4 * t * t, t, 1.0);
        }
        `
    )

    extend({ MyShaderMaterial })



    return <>
     <mesh> 
        <planeGeometry args={[2, 2, 1, 1]} />
        <myShaderMaterial transparent={true} wireframe={false} />
     </mesh>
    </>
}