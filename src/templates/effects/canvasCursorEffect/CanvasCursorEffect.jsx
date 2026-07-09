import { Effect } from "postprocessing"
import { Uniform, Vector2 } from "three"

export default class CanvasCursorEffect extends Effect {
    constructor(props) {
        super(
            'canvasCursorEffect',
            fragmentShader,
            {
                uniforms: new Map([
                    ['distortionPower', new Uniform(props.distortionPower)],
                    ['cursorPositionX', new Uniform(props.cursorPositions.x)],
                    ['cursorPositionY', new Uniform(props.cursorPositions.y)],
                    ['resolution', new Uniform(new Vector2())],
                ]),
            },
            
        )
        this.props = props; // Сохраняем props внутри объекта
        this.cursorPositionXUniform = this.uniforms.get('cursorPositionX');
        this.cursorPositionYUniform = this.uniforms.get('cursorPositionY');
        this.resolution = this.uniforms.get('resolution');
        
    }
    update = () => {
        this.cursorPositionXUniform.value = this.props.cursorPositions.x;
        this.cursorPositionYUniform.value = this.props.cursorPositions.y;
    };
    setSize(width, height) {
        this.resolution.value.set(width, height); // Обновление разрешения экрана
    }
}

const fragmentShader = /* glsl */`
    uniform float distortionPower;
    uniform vec2 resolution;
    uniform float cursorPositionX;
    uniform float cursorPositionY;

    void mainUv(inout vec2 uv) {
        // Рассчитываем вектор от текущей позиции пикселя до позиции курсора
        vec2 cursorPos = vec2(cursorPositionX, cursorPositionY); // Замените на реальные координаты курсора
        vec2 toCursor = cursorPos - uv;

        // Вычисляем расстояние до курсора и нормализуем его
        float distanceToCursor = length(toCursor);
        toCursor /= distanceToCursor;

        // Определяем, насколько сильно искажать пиксель в зависимости от расстояния до курсора
        float distortionAmount = distortionPower * pow(1.0 - distanceToCursor, 1.0);

        // Применяем искажение к координатам UV
        uv += toCursor * distortionAmount;
    }
    
    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        outputColor = inputColor;
    }
`;

