export default function lerp(start, end, t){
    return (1 - t) * start + t * end;

    // example
    // let lerpLightPositionX = lerp(directionalLight.current.position.x, -250, delta * 0.1)
    // directionalLight.current.position.x = lerpLightPositionX
}