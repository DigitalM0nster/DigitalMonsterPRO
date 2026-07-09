import { Effect } from "postprocessing"
import { Uniform, Vector2 } from "three"

export default class CustomBlur extends Effect {
    constructor(props) {
        super(
            'CustomTransitionEffect',
            fragmentShader,
            {
                uniforms: new Map([
                    ['mosaicSize1', new Uniform(40.0)],
                    ['mosaicSize2', new Uniform(30.0)],
                    ['resolution', new Uniform(new Vector2())],
                ])
            }
        )
    }
    update(renderer, inputBuffer, deltaTime) {
        if (this.uniforms.get('mosaicSize1').value <= 40) {
            this.uniforms.get('mosaicSize1').value -= deltaTime * 10;  // Пример изменения transitionProp со временем    
            if (this.uniforms.get('mosaicSize1').value <= 30) {
                this.uniforms.get('mosaicSize1').value -= deltaTime * 100;
                if (this.uniforms.get('mosaicSize1').value <= 1) {
                    this.uniforms.get('mosaicSize1').value = 1
                }
            }
        }
        if (this.uniforms.get('mosaicSize2').value <= 30) {
            this.uniforms.get('mosaicSize2').value -= deltaTime * 10;  // Пример изменения transitionProp со временем    
            if (this.uniforms.get('mosaicSize2').value <= 20) {
                this.uniforms.get('mosaicSize2').value -= deltaTime * 100;
                if (this.uniforms.get('mosaicSize2').value <= 1) {
                    this.uniforms.get('mosaicSize2').value = 1
                }
            }
        }

        const resolutionUniform = this.uniforms.get('resolution');
        resolutionUniform.value.set(renderer.domElement.width, renderer.domElement.height);  // Обновление разрешения
    }
}

const fragmentShader = /* glsl */`
    uniform float mosaicSize1;      // Сила размытия
    uniform float mosaicSize2;      // Сила размытия
    uniform vec2 resolution;       // Разрешение экрана

    void mainUv(inout vec2 uv)
    {
        uv = uv;
    }

    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor)
    {  
        vec2 mosaicSize = vec2(mosaicSize1, mosaicSize2);  // Размеры мозаичных фрагментов

        // Определяем индекс текущего мозаичного фрагмента
        vec2 mosaicIndex = floor(uv * resolution / mosaicSize);

        // Искажаем UV-координаты, чтобы они попадали внутрь текущего мозаичного фрагмента
        vec2 distortedUV = (mosaicIndex + 0.5) * mosaicSize / resolution;

        // Используем искаженные UV-координаты для получения цвета
        outputColor = texture(inputBuffer, distortedUV);
    }
`