import { Effect } from "postprocessing"
import { Uniform, Vector2, Texture } from "three"

export default class BorderblurEffect extends Effect {
    constructor(props) {
        super(
            'NiceBlurEffect',
            fragmentShader,
            {
                uniforms: new Map([
                    ['blurRadius', new Uniform(props.blurRadius)],
                    ['centerWidth', new Uniform(props.centerWidth)],
                    ['centerHeight', new Uniform(props.centerHeight)],
                    ['borderRadius', new Uniform(props.borderRadius)],
                    ['TopLeftBorder', new Uniform(props.borderRadius)],
                    ['TopRightBorder', new Uniform(props.borderRadius)],
                    ['BottomRightBorder', new Uniform(props.borderRadius)],
                    ['BottomLeftBorder', new Uniform(props.borderRadius)],
                ])
            }
        )
    }
    update(renderer, inputBuffer, deltaTime) {
    }
}

const fragmentShader = /* glsl */`
    uniform float blendFactor;
    uniform float blurRadius;
    uniform float centerWidth; // Ширина центрального квадрата (от 0 до 1)
    uniform float centerHeight; // Высота центрального квадрата (от 0 до 1)
    uniform float borderRadius; // Радиус закругления углов (от 0 до 0.5)

    void mainUv(inout vec2 uv) {
        // Центральный квадрат
        vec2 center = vec2(0.5, 0.5); // Центр экрана
        vec2 size = vec2(centerWidth, centerHeight);
        
        // Вычисляем границы квадрата с учетом радиуса закругления
        vec2 minBounds = center - size / 2.0;
        vec2 maxBounds = center + size / 2.0;
        
        // Если текущая точка находится вне квадрата, проверяем, находится ли она внутри закругленных углов
        if (uv.x < minBounds.x || uv.x > maxBounds.x || uv.y < minBounds.y || uv.y > maxBounds.y) {
            vec2 nearestCorner = clamp(uv, minBounds, maxBounds);
            if (distance(uv, nearestCorner) > borderRadius) {
                // Применение размытия ко всем остальным точкам
                float horizontalShift = (5.0 * fract(sin(dot(uv.xy, vec2(12.9898, 78.233))) * 43758.5453) - 2.5) * blurRadius;
                float verticalShift = (5.0 * fract(sin(dot(uv.yx, vec2(12.9898, 78.233))) * 43758.5453) - 2.5) * blurRadius;
                
                uv += vec2(horizontalShift, verticalShift);
            }
        }
    }

    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {

        outputColor = inputColor;
    }
`;