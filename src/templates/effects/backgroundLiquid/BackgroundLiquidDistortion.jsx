import { Effect } from "postprocessing";
import { Uniform, Vector2 } from "three";

export default class backgroundLiquidDistortion extends Effect {
    constructor(props) {
        super(
            'backgroundLiquidDistortion',
            fragmentShader,
            {
                uniforms: new Map([
                    ['inputTexture', new Uniform(props.backgroundTexture)],
                    ['distortionPower', new Uniform(0.12)],
                    ['distortionScale', new Uniform(1.0)],
                    ['brightness', new Uniform(1.0)],
                    ['distortionColor', new Uniform(props.distortionColor)],
                    ['iResolution', new Uniform(new Vector2(window.innerWidth, window.innerHeight))],
                    ['iTime', new Uniform(0.0)],
                ])
            }
        );
    }

    update(renderer, inputBuffer, deltaTime) {
        // Обновляем uniform-переменную iTime
        this.uniforms.get('iTime').value += deltaTime * 0.1;

    }
}

const fragmentShader = /* glsl */`
uniform float distortionPower; // Сила искажения
uniform float distortionScale; // Сила приближения
uniform float iTime; // Время
uniform vec3 distortionColor; // Время
uniform float brightness; // Время
uniform sampler2D inputTexture; // Время
uniform vec2 iResolution; // Время
uniform float blurPower; // Время

float rand(vec2 p) {
    return fract(sin(dot(p, vec2(12.543, 514.123))) * 4732.12);
}

float noise(vec2 p) {
    vec2 f = smoothstep(0.0, 1.0, fract(p));
    vec2 i = floor(p);
    
    float a = rand(i);
    float b = rand(i + vec2(1.0, 0.0));
    float c = rand(i + vec2(0.0, 1.0));
    float d = rand(i + vec2(1.0, 1.0));
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void mainUv(inout vec2 uv) {
    // Определяем центр экрана
    vec2 center = vec2(0.5);
    
    // Масштабируем uv относительно центра
    uv = center + (uv - center) * distortionScale;
    
    // Применяем искажение к однородным координатам uv
    uv += distortionPower * vec2(noise(uv * 20.0 + iTime), noise(uv * 30.0 + iTime));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // Применяем искажение к цвету фона
    vec2 distortedUV = uv;
    mainUv(distortedUV);

    // Получаем цвет и применяем яркость
    vec4 color = texture(inputTexture, distortedUV);
    color.rgb *= distortionColor.rgb;
    color.rgb *= brightness;

    outputColor = color;
}
`;