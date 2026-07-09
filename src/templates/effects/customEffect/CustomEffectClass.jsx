import { Effect } from "postprocessing"
import { Uniform } from "three"

export default class CustomEffect extends Effect {
    constructor(props) {
        super(
            'CustomEffect',
            fragmentShader,
            {
                blendFunction: props.blendFunction,
                uniforms: new Map([
                    ['opacity', new Uniform(props.opacity)],
                    ['frequency', new Uniform(props.frequency)],
                    ['amplitude', new Uniform(props.amplitude)],
                    ['offset', new Uniform(0)],
                ])
            }
        )
    }
    update(renderer, inputBuffer, deltaTime) {
        this.uniforms.get('offset').value += deltaTime
    }
}

const fragmentShader = /* glsl */`
    uniform float opacity;
    uniform float frequency;
    uniform float amplitude;
    uniform float offset;
    void mainUv(inout vec2 uv)
    {
        uv.y += sin(uv.x * frequency + offset) * amplitude;
    }

    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor)
    {
        // vec4 newInputColor = inputColor;
        // newInputColor.rgb *= vec3(0.0, 1.0, 0.5);
        // outputColor = newInputColor;
        outputColor = vec4(uv, 1.0, opacity);
    }
`