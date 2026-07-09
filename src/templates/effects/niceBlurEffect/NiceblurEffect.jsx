import { Effect } from "postprocessing"
import { Uniform, Vector2 } from "three"

export default class NiceBlurEffect extends Effect {
    constructor(props) {
        super(
            'NiceBlurEffect',
            fragmentShader,
            {
                uniforms: new Map([
                    ['powerDistortion', new Uniform(props.powerDistortion)],
                ])
            }
        )
    }
    update(renderer, inputBuffer, deltaTime) {
    }
}

const fragmentShader = /* glsl */`
    uniform float powerDistortion;

    void mainUv(inout vec2 uv) {
        uv += (2.0 * fract(sin(dot(uv.xy, vec2(12.9898, 78.233))) * 43758.5453) - 1.0) * powerDistortion;
    }

    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        outputColor = texture(inputBuffer, uv);
    }
`;