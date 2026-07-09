import { Effect } from "postprocessing"
import { Uniform } from "three"

export default class CustomBlur extends Effect {
    constructor(props) {
        super(
            'CustomBlur',
            fragmentShader,
            {
                uniforms: new Map([
                    ['blurRadius', new Uniform(props.blurRadius)],
                    ['grainAmount', new Uniform(props.grainAmount)],
                    ['currentTime', new Uniform(0)],
                ])
            }
        )
    }
    update(renderer, inputBuffer, deltaTime) {
        this.uniforms.get('currentTime').value += deltaTime * 0.1
    }
}

const fragmentShader = /* glsl */`
    uniform float blurRadius;      // Сила размытия
    uniform float grainAmount;      // Сила зерна
    uniform float currentTime;      // Время

    void mainUv(inout vec2 uv)
    {
        // uv.x = uv.x + 0.1;
    }

    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor)
    {  
        float speed = 1.0; // Задайте сюда желаемую скорость движения зернистости
    
        // Размытие
        vec4 colorSum = vec4(0.0);
        int numSamples = 256;
    
        for (int x = -5; x <= 5; x++) {
            for (int y = -5; y <= 5; y++) {
                vec2 offset = vec2(float(x) * blurRadius, float(y) * blurRadius);
                colorSum += texture(inputBuffer, uv + offset);
                numSamples++;
            }
        }
    
        vec4 blurredColor = colorSum / float(numSamples);
    
        // Зернистость с движением
        vec4 grain = vec4(0.0);
        float time = currentTime * speed; // iTime - встроенная переменная, представляющая текущее время
        float randomValue = fract(sin(dot(uv + vec2(time), vec2(12.9898, 78.233))) * 43758.5453);
        grain.rgb = vec3(randomValue);
    
        // Комбинируем размытый цвет с зернистостью
        vec4 finalColor = mix(blurredColor, blurredColor * (1.0 + grainAmount * grain), grainAmount);
    
        // Устанавливаем зеленый цвет
        // finalColor.rgb = vec3(0.0, 0.1, 0.1);
    
        outputColor = finalColor;
    }
`