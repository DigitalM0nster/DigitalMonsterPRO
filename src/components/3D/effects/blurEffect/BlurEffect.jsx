import { Effect } from "postprocessing"
import { Uniform } from "three"

export default class BlurEffect extends Effect {
    constructor(props) {
        super(
            'BlurEffect',
            fragmentShader,
            {
                uniforms: new Map([
                    ['blurRadius', new Uniform(0.0075)],
                    ['blendFactor', new Uniform(props.blendFactor.current)],
                    ['backgroundTexture', new Uniform(props.backgroundTexture)],
                    ['backgroundOpacity', new Uniform(0.75)], // Новый uniform для прозрачности фона
                    ['color', new Uniform(props.color)],
                ])
            }
        )
        this.props = props
    }
    update(renderer, inputBuffer, deltaTime) {
        this.uniforms.get('blendFactor').value = this.props.blendFactor.current; // Обновляем uniform в методе update
        this.uniforms.get('blurRadius').value = this.props.blurRadius.current; // Обновляем uniform в методе update
    }
}

const fragmentShader = /* glsl */`
    uniform float blendFactor;
    uniform float blurRadius;
    uniform sampler2D backgroundTexture; // Фоновая текстура
    uniform float backgroundOpacity; // Прозрачность фона
    uniform vec3 color; // Цвет

    // СМЕЩЕНИЕ ДИАГОНАЛЬ ЛЕВОНИЗ - ПРАВО ВЕРХ
    // void mainUv(inout vec2 uv) {
    //     uv += (2.0 * fract(sin(dot(uv.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.0) * blurRadius;
    // }
    
    void mainUv(inout vec2 uv) {
        float horizontalShift = (2.0 * fract(sin(dot(uv.xy, vec2(12.9898, 78.233))) * 43758.5453) - 1.0) * blurRadius;
        float verticalShift = (2.0 * fract(sin(dot(uv.yx, vec2(12.9898, 78.233))) * 43758.5453) - 1.0) * blurRadius;
        uv += vec2(horizontalShift, verticalShift);
    }

    // uniform vec3 textureColor; // Цвет текстуры

    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        // Получите цвет из фоновой текстуры
        vec4 originalColor = texture(backgroundTexture, uv);
    
        // Установите прозрачность фона
        originalColor.a = backgroundOpacity * 2.0;
    
        // Примените цветовую коррекцию только к текстуре
        vec3 correctedColor = originalColor.rgb * color;
    
        // Создайте новый цвет с коррекцией и оригинальной альфа-компонентой
        vec4 finalColor = vec4(correctedColor, originalColor.a);
    
        // Смешайте цвет изображения и фона с учетом прозрачности
        outputColor = mix(inputColor, finalColor, blendFactor);
    }
`;