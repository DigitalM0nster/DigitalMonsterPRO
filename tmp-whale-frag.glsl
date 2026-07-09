#define USE_FOG

#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
struct GeometricContext {
	vec3 position;
	vec3 normal;
	vec3 viewDir;
#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal;
#endif
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
float luminance( const in vec3 rgb ) {
	const vec3 weights = vec3( 0.2126729, 0.7151522, 0.0721750 );
	return dot( weights, rgb );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif

uniform vec3 uColor;
uniform float uReveal;
uniform float uAlphaMult;
uniform float uGlow;

uniform float uBlurStart;
uniform float uBlurEnd;
uniform float uBlurAmount;
uniform float uBlurAlpha;
uniform float uTime;
uniform mat4 uOceanWorldInverse;
uniform vec2 uOceanRippleCenter;
uniform float uOceanWaveAmp;
uniform float uOceanRippleAmp;
uniform float uSubmergeDepth;
uniform float uSurfaceOcclusion;
uniform float uUnderwaterTint;
uniform float uUnderwaterStrength;
uniform vec3 uUnderwaterColor;
varying float vViewDist;
varying vec3 vWorldPos;


varying float vIntensity;
varying float vPulse;


float oceanSurfaceHeight(vec2 xz, float time, vec2 rippleCenter, float waveAmp, float rippleAmp) {
	float wave1 = sin(xz.x * 0.35 + time * 0.8) * 0.25;
	float wave2 = sin(xz.z * 0.55 + time * 0.6) * 0.18;
	float wave3 = sin((xz.x + xz.z) * 0.25 + time * 0.4) * 0.22;

	float rippleDist = distance(xz, rippleCenter);
	float rippleInfluence = smoothstep(22.0, 2.0, rippleDist);
	float rippleWave = sin(rippleDist * 1.15 - time * 2.0) * rippleInfluence * 0.55;

	return (wave1 + wave2 + wave3) * waveAmp + rippleWave * rippleAmp;
}


void main() {
	vec2 uv = gl_PointCoord - 0.5;
	float dist = length(uv);

	if (dist > 0.5) {
		discard;
	}

	
	float blurMix = smoothstep(uBlurStart, uBlurEnd, vViewDist);
	float blurStrength = blurMix * uBlurAmount;

	vec3 oceanLocal = (uOceanWorldInverse * vec4(vWorldPos, 1.0)).xyz;
	float surfaceY = oceanSurfaceHeight(
		oceanLocal.xz,
		uTime,
		uOceanRippleCenter,
		uOceanWaveAmp,
		uOceanRippleAmp
	);
	float depthBelow = surfaceY - oceanLocal.y;
	float underSurface = smoothstep(-6.0, 1.0, depthBelow);
	float nearSurface = 1.0 - smoothstep(0.0, uSubmergeDepth, max(depthBelow, 0.0));
	float deepWater = smoothstep(uSubmergeDepth * 0.35, uSubmergeDepth * 1.8, max(depthBelow, 0.0));
	float surfaceDim = mix(1.0, 1.0 - uSurfaceOcclusion * 0.85, nearSurface);
	float surfaceBlur = nearSurface * uSurfaceOcclusion * 0.6;
	float effect = uUnderwaterStrength;

	blurStrength += surfaceBlur * effect;
	float totalBlur = min(blurStrength, 1.0);

	float coreRadius = mix(0.14, 0.38, totalBlur);
	float glowInner = mix(0.08, 0.02, totalBlur);
	float glowOuter = mix(0.46, 0.5, totalBlur);

	float core = 1.0 - smoothstep(0.0, coreRadius, dist);
	float glow = 1.0 - smoothstep(glowInner, glowOuter, dist);
	float halo = (1.0 - smoothstep(0.18, 0.5, dist)) * totalBlur * 0.42;

	float distanceAlpha = 1.0 - blurMix * uBlurAlpha;
	float underwaterAlpha = mix(1.0, max(underSurface * surfaceDim, 0.15), effect);
	float deepTintMix = deepWater * uUnderwaterTint * effect;


	vec3 baseColor = uColor * (core * 1.5 + glow * 0.45 * uGlow + halo * 0.5) * (0.75 + vIntensity * 0.35 + vPulse * 0.12);
	vec3 deepColor = mix(baseColor, baseColor * 0.72 + uUnderwaterColor * 0.28, deepTintMix);
	vec3 color = deepColor;
	float alpha = (core * 0.78 + glow * 0.32 * uGlow + halo * 0.22) * uReveal * uAlphaMult * (0.55 + vIntensity * 0.45) * distanceAlpha * underwaterAlpha;

	gl_FragColor = vec4(color, alpha);

	#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
}
