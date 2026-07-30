import { Effect } from "postprocessing"
import { Uniform, Vector2 } from "three"

export default class CanvasBlurEffect extends Effect {
    constructor(props) {
        super(
            'CanvasBlurEffect',
            fragmentShader,
            {
                uniforms: new Map([
                    ['blurPower', new Uniform(props.blurPower)],
                    ['noBlurWidth', new Uniform(props.noBlurWidth)],
                    ['noBlurHeight', new Uniform(props.noBlurHeight)],
                    ['cornerRadius', new Uniform(props.cornerRadius)],
                    ['resolution', new Uniform(new Vector2())], // Добавление разрешения экрана
                ])
            }
        )
        this.resolution = this.uniforms.get('resolution'); // Получение ссылки на разрешение экрана
        
    }
    setSize(width, height) {
        this.resolution.value.set(width, height); // Обновление разрешения экрана
    }
}

const fragmentShader = /* glsl */`
    uniform float blurPower;
    uniform float noBlurWidth;  // Ширина незатронутой области
    uniform float noBlurHeight; // Высота незатронутой области
    uniform float cornerRadius; // Радиус закругления углов
    uniform vec2 resolution;
    uniform sampler2D tDiffuse;

    void mainUv(inout vec2 uv) {
        // Применяем горизонтальный блюр
        uv = uv;
    }

    float roundedRectangle(vec2 p, vec2 b, float r) {
        vec2 d = abs(p) - b + vec2(r);
        return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
    }

    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec4 sum = vec4(0.0);
        float totalWeight = 0.0;

        vec2 center = vec2(0.5); // Центр экрана

        // Радиусы закругления в зависимости от минимальной стороны незатронутой области
        float minNoBlurSize = min(noBlurWidth, noBlurHeight);
        float normalizedCornerRadius = cornerRadius / minNoBlurSize;

        // Функция, определяющая, находится ли пиксель внутри закругленной незатронутой области
        float mask = roundedRectangle(uv - center, vec2(noBlurWidth * 0.5, noBlurHeight * 0.5), normalizedCornerRadius);

        // Применяем размытие только к пикселям, не находящимся в незатронутой области
        if (mask > 0.0) {
            // Размываем по горизонтали
            for (float i = -blurPower; i <= blurPower; i += 1.0) {
                vec2 offset = vec2(i, 0.0) / resolution.xy;
                vec2 sampledUV = uv + offset;
                vec4 texel = texture(inputBuffer, sampledUV);
                float weight = 10.0 - abs(i) / blurPower;
                sum += texel * weight;
                totalWeight += weight;
            }

            // Размываем по вертикали
            for (float i = -blurPower; i <= blurPower; i += 1.0) {
                vec2 offset = vec2(0.0, i) / resolution.xy;
                vec2 sampledUV = uv + offset;
                vec4 texel = texture(inputBuffer, sampledUV);
                float weight = 10.0 - abs(i) / blurPower;
                sum += texel * weight;
                totalWeight += weight;
            }

            outputColor = sum / totalWeight;
        } else {
            // Если пиксель находится в незатронутой области, просто передаем исходный цвет
            outputColor = texture(inputBuffer, uv);
        }
    }
`;

