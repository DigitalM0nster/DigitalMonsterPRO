import { Effect } from "postprocessing"
import { Uniform, Vector2 } from "three"

export default class DistortionEffect extends Effect {
    constructor(props) {
        super(
            'DistortionEffect',
            fragmentShader,
            {
                uniforms: new Map([
                    ['powerDistortion', new Uniform(props.powerDistortion.current)],
                    ['horizontalBlocksNumber', new Uniform(20.0)],
                    ['verticalBlocksNumber', new Uniform(props.verticalBlocksNumber.current)],
                    ['resolution', new Uniform(new Vector2())],
                ])
            }
        )
        this.props = props
    }
    update(renderer, inputBuffer, deltaTime) {
        this.uniforms.get('powerDistortion').value = this.props.powerDistortion.current; // Обновляем uniform в методе update
        this.uniforms.get('verticalBlocksNumber').value = this.props.verticalBlocksNumber.current; // Обновляем uniform в методе update
    }
}

const fragmentShader = /* glsl */`
    uniform float powerDistortion;
    uniform float horizontalBlocksNumber;
    uniform float verticalBlocksNumber;

    void mainUv(inout vec2 uv) {
        // Рассчитываем размеры блоков
        vec2 blockSize = vec2(1.0 / horizontalBlocksNumber, 1.0 / verticalBlocksNumber);
        
        // Находим текущий индекс блока
        vec2 blockIndex = floor(uv / blockSize);
        
        // Случайно сдвигаем uv координаты внутри блока
        vec2 distortion = vec2(
            sin(blockIndex.y + blockIndex.x) * powerDistortion,
            cos(blockIndex.x + blockIndex.y) * powerDistortion
        );
        
        uv = mix(uv, uv + distortion, powerDistortion);
    }

    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        outputColor = inputColor;
    }
`;
