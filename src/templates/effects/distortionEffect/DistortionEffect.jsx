import { Effect } from "postprocessing"
import { Uniform, Vector2 } from "three"

export default class DistortionEffect extends Effect {
    constructor(props) {
        super(
            'DistortionEffect',
            fragmentShader,
            {
                uniforms: new Map([
                    ['horizontalBlocksNumber', new Uniform(1.0)],
                    ['verticalBlocksNumber', new Uniform(1.0)],
                    ['powerDistortion', new Uniform(0.0)],
                    ['more', new Uniform(true)],
                ])
            }
        )
    }
    update(renderer, inputBuffer, deltaTime) {
        if (this.uniforms.get('more').value == true) {
            this.uniforms.get('powerDistortion').value += deltaTime * 0.8;  // Пример изменения transitionProp со временем    
            if (this.uniforms.get('powerDistortion').value >= 0.3) {
                this.uniforms.get('powerDistortion').value = 0.3
                this.uniforms.get('more').value = false
            }
        }
        if (this.uniforms.get('more').value == false) {
            this.uniforms.get('powerDistortion').value -= deltaTime * 0.8;  // Пример изменения transitionProp со временем    
            if (this.uniforms.get('powerDistortion').value <= 0.0) {
                this.uniforms.get('powerDistortion').value = 0.0
            }
        }
    }
}

const fragmentShader = /* glsl */`
    uniform float powerDistortion;
    uniform float horizontalBlocksNumber;
    uniform float verticalBlocksNumber;

    vec2 getBlockUV(vec2 uv, vec2 blockSize) {
        vec2 blockUV = floor(uv * blockSize) / blockSize;
        return blockUV;
    }

    void mainUv(inout vec2 uv) {
        // Рассчитываем размер блока в UV-координатах
        vec2 blockSize = vec2(1.0 / horizontalBlocksNumber, 1.0 / verticalBlocksNumber);
        
        // Находим индексы текущего блока
        vec2 blockIndex = floor(uv / blockSize);
        
        // Сдвигаем uv-координаты внутри текущего блока
        uv = (uv - blockIndex * blockSize) / blockSize;
    }

    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        // Применяем искажение к uv-координатам
        vec2 distortedUV = uv + powerDistortion * 0.2 * cos((sin(uv.yx * 1000.0) - 0.5) - 1.0);

        // Получаем цвет с новых uv-координат
        vec4 distortedColor = texture(inputBuffer, distortedUV);

        // Выводим искаженный цвет
        outputColor = distortedColor;
    }
`;