// Site accent from styles/style.scss; shader colours are expressed in linear RGB.
export const filmPalette = Object.freeze({ accent: "#00a9ff", text: "#ffffff" });
export const filmPaletteGLSL = `const vec3 filmAccent=vec3(0.,.39675523,1.);
#ifdef FILM_LOW
// Bounded linear radiance and nonzero coverage survive the LDR scene compositor.
// Scale light as a whole so blue never clips into a green/cyan highlight.
vec4 filmLowLight(float energy,float coverage,float opacity){
 float light=1.-exp(-max(energy,0.));
 float alpha=max(clamp(coverage,0.,1.),sqrt(light));
 // The final ShaderMaterial blit outputs sampled UI RGB without a display
 // transfer. Encode the site accent here; do not change the video/HDR palette.
 return vec4(vec3(0.,.6627451,1.)*light/max(alpha,.0001),alpha*opacity);
}
vec4 filmLowWhite(float energy,float coverage,float opacity){
 vec4 light=filmLowLight(energy,coverage,opacity);
 return vec4(vec3(light.b),light.a);
}
#endif
#ifdef FILM_MEDIUM
const float filmUiGain=1.1;
#else
const float filmUiGain=1.6;
#endif
`;
