export const contactsTextVertex = /* glsl */ `
uniform vec2 uCanvasSize, uPlaneSize;
uniform vec4 uTiming;
uniform float uMode, uTime, uPass, uPreview;
attribute vec4 aRect, aAtlasRect;
attribute vec3 aLetter;
varying vec2 vUv;
varying float vAlpha;
void main() {
	float frame = 0.0;
	vAlpha = uMode < -0.5 ? 0.0 : 1.0;
	if (uMode > 0.5) {
		float delay = floor((aLetter.x * aLetter.z * uTiming.y + aLetter.y * uTiming.x) * uTiming.w + 0.5);
		float duration = floor(aLetter.z * uTiming.y * uTiming.w + 0.5);
		float local = uTime - delay;
		if (local < 0.0) vAlpha = uMode < 1.5 ? 0.0 : 1.0;
		else if (local < duration) {
			frame = 1.0 + min(aLetter.z - 1.0, floor(local / max(1.0, floor(uTiming.y * uTiming.w + 0.5))));
			vAlpha = 1.0;
		} else if (uMode < 1.5) vAlpha = clamp((local - duration) / max(1.0, floor(uTiming.z * uTiming.w + 0.5)), 0.0, 1.0);
		else vAlpha = uMode < 2.5 ? 0.0 : 1.0;
	}
	if (uPreview > 0.5) { frame = 1.0; vAlpha = 1.0; }
	if ((uPass < 0.5 && frame > 0.5) || (uPass > 0.5 && frame < 0.5)) vAlpha = 0.0;
	vUv = aAtlasRect.xy + uv * aAtlasRect.zw - vec2(0.0, frame * 0.25);
	vec2 px = aRect.xy + vec2(uv.x, 1.0 - uv.y) * aRect.zw;
	vec2 xy = (px / uCanvasSize - 0.5) * uPlaneSize * vec2(1.0, -1.0);
	gl_Position = vAlpha > 0.0 ? projectionMatrix * modelViewMatrix * vec4(xy, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

export const contactsTextFragment = /* glsl */ `
uniform sampler2D map;
uniform vec3 uMainColor, uSnakeColor;
uniform float opacity, uSnakeBloomBoost, uPass;
varying vec2 vUv;
varying float vAlpha;
void main() {
	if (vAlpha <= 0.0) discard;
	vec4 tex = texture2D(map, vUv);
	float alpha = tex.a * vAlpha * opacity;
	if (alpha <= 0.001) discard;
	vec3 color = uPass < 0.5 ? tex.rgb * uMainColor * 0.85 : uSnakeColor * uSnakeBloomBoost;
	gl_FragColor = vec4(color, alpha);
}
`;
