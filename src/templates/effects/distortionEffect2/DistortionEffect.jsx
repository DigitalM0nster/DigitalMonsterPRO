import { Effect } from "postprocessing"
import { Uniform, Vector2 } from "three"
import { UniformsUtils } from "three";

export default class DistortionEffect extends Effect {
    constructor(props) {
        super(
            'DistortionEffect',
            fragmentShader,
            {
                uniforms: new Map([
                    ['powerDistortion', new Uniform(props.powerDistortion)],
                    ['horizontalBlocksNumber', new Uniform(30.0)],
                    ['verticalBlocksNumber', new Uniform(55.0)],
                    ['resolution', new Uniform(new Vector2())],
                    ['more', new Uniform(true)],
                ])
            },
        )
    }
    update(renderer, inputBuffer, deltaTime) {
        if (this.uniforms.get('more').value == true) {
            this.uniforms.get('powerDistortion').value += deltaTime * 0.5;  // Пример изменения transitionProp со временем       
            this.uniforms.get('verticalBlocksNumber').value -= deltaTime * 10;  // Пример изменения transitionProp со временем    
            if (this.uniforms.get('powerDistortion').value >= 0.3) {
                this.uniforms.get('powerDistortion').value = 0.3
                this.uniforms.get('more').value = false
            }
        }
        if (this.uniforms.get('more').value == false) {
            this.uniforms.get('powerDistortion').value -= deltaTime * 0.5;
            this.uniforms.get('verticalBlocksNumber').value -= deltaTime * 10;   // Пример изменения transitionProp со временем
            if (this.uniforms.get('powerDistortion').value <= 0.0) {
                this.uniforms.get('powerDistortion').value = 0.0
            }
        }

        const resolutionUniform = this.uniforms.get('resolution');
        resolutionUniform.value.set(renderer.domElement.width, renderer.domElement.height);  // Обновление разрешения
    }
}

const fragmentShader = /* glsl */`
    uniform float powerDistortion;
    uniform float horizontalBlocksNumber;
    uniform float verticalBlocksNumber;
    uniform vec2 resolution;

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
