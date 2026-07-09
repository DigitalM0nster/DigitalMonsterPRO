import { Effect } from "postprocessing"
import { Uniform, Vector2, Clock } from "three"

export default class CustomBlur2 extends Effect {
    constructor(props) {
        super(
            'CustomBlur2',
            fragmentShader,
            {
                uniforms: new Map([
                    ['stretchRadius', new Uniform(props.stretchRadius)],
                ])
            }
        );
        this.stretchDirection = new Vector2(1.0, 0.0); // Горизонтальное размытие

    }
    // update(props, renderer, inputBuffer, deltaTime) {
    //     this.uniforms.get('stretchRadius').value = props.stretchRadius;
    // }
}

const fragmentShader = /* glsl */`

    uniform sampler2D tDiffuse;
    uniform float stretchRadius;

    void mainUv(inout vec2 uv)
    {
        uv = uv;
    }

    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor)
    {  
        vec2 texelSize = 1.0 / vec2(textureSize(tDiffuse, 0));
        vec4 colorSum = vec4(0.0);
        
        // Выполняем горизонтальное размытие путем усреднения цветов семи соседних пикселей
        for (float i = -stretchRadius; i <= 0.0; i++) {
            vec2 offset = vec2(i * texelSize.x, 0.0);
            colorSum += texture(tDiffuse, uv + offset) * 0.01; // Умножаем на 1/7 для применения ядра размытия
        }
        
        outputColor = pow(colorSum, vec4(1.0/2.2));
    }
`