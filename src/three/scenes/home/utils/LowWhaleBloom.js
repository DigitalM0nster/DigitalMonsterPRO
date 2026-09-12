import * as THREE from "three";
import { whaleMeshParticleVertexShader, whaleMeshParticleFragmentShader } from "../shaders/digitalWhaleShaders.js";

export const LOW_WHALE_BLOOM_STRENGTH = 0.85;
export const LOW_WHALE_BLOOM_RADIUS = 1.85;

const vertexShader = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const blurShader = `uniform sampler2D uMap; uniform vec2 uStep; varying vec2 vUv;
void main() {
 vec3 light = texture2D(uMap, vUv).rgb * 0.227027;
 light += texture2D(uMap, vUv + uStep * 1.384615).rgb * 0.316216;
 light += texture2D(uMap, vUv - uStep * 1.384615).rgb * 0.316216;
 light += texture2D(uMap, vUv + uStep * 3.230769).rgb * 0.070270;
 light += texture2D(uMap, vUv - uStep * 3.230769).rgb * 0.070270;
 gl_FragColor = vec4(light, 0.0);
}`;

/** Low-only selective bloom. Shared skinning, half-size light buffers,
 * opaque home composition before any hex mix, preserving visible glow alpha. */
export class LowWhaleBloom {
 constructor(particles) {
  this.radius = LOW_WHALE_BLOOM_RADIUS;
  this.source = particles.points;
  this.maskScene = new THREE.Scene();
  this.maskMaterial = new THREE.ShaderMaterial({
   uniforms: particles.material.uniforms,
   defines: { LOW_LOCAL_PARTICLE: 1, LOW_BLOOM_MASK: 1 },
   vertexShader: whaleMeshParticleVertexShader,
   fragmentShader: whaleMeshParticleFragmentShader,
   transparent: true, depthTest: false, depthWrite: false,
   blending: THREE.CustomBlending, blendSrc: THREE.OneFactor,
   blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
   toneMapped: false,
  });
  this.mask = new THREE.Points(particles.geometry, this.maskMaterial);
  this.mask.matrixAutoUpdate = false;
  this.mask.frustumCulled = false;
  this.maskScene.add(this.mask);
  this.targets = Array.from({ length: 2 }, () => new THREE.WebGLRenderTarget(1, 1, {
   depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter,
   magFilter: THREE.LinearFilter, generateMipmaps: false,
  }));
  this.output = new THREE.WebGLRenderTarget(1, 1, {
   depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter,
   magFilter: THREE.LinearFilter, generateMipmaps: false,
  });
  this.blur = new THREE.ShaderMaterial({
   vertexShader, fragmentShader: blurShader,
   uniforms: { uMap: { value: null }, uStep: { value: new THREE.Vector2() } },
   depthTest: false, depthWrite: false, toneMapped: false,
  });
  this.add = new THREE.ShaderMaterial({
   vertexShader,
   fragmentShader: `uniform sampler2D uMap; uniform sampler2D uBase; uniform float uStrength; varying vec2 vUv;
    void main() {
     vec4 base = texture2D(uBase, vUv);
     vec3 glow = texture2D(uMap, vUv).rgb * uStrength;
     // Soft energy shoulder preserves hue and point contrast in dense fins.
     float peak = max(glow.r, max(glow.g, glow.b));
     glow *= 0.8 / (0.8 + peak);
     // Match the existing straight-alpha scene over black, then add light.
     // RGB with zero alpha would be discarded by the screen/hex compositor.
     gl_FragColor = vec4(base.rgb * base.a + glow, 1.0);
    }`,
   uniforms: {
    uMap: { value: this.targets[0].texture }, uBase: { value: this.targets[1].texture },
    uStrength: { value: LOW_WHALE_BLOOM_STRENGTH },
   },
   depthTest: false, depthWrite: false, toneMapped: false,
  });
  this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blur);
  this.quad.frustumCulled = false;
  this.scene = new THREE.Scene();
  this.scene.add(this.quad);
  this.camera = new THREE.Camera();
 }

 async prepare(renderer, scheduler) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  this.setSize(size.x, size.y);
  // Compile and draw each pass separately while the loader can still breathe.
  for (const [scene, camera, material] of [
   [this.maskScene, this.camera, null],
   [this.scene, this.camera, this.blur],
   [this.scene, this.camera, this.add],
  ]) {
   if (material) this.quad.material = material;
   await scheduler.run(() => renderer.compile(scene, camera));
   await scheduler.breath();
   await scheduler.run(() => {
    const previous = renderer.getRenderTarget();
    try {
     this.blur.uniforms.uMap.value = this.targets[0].texture;
     renderer.setRenderTarget(material === this.add ? this.output : this.targets[1]);
     renderer.render(scene, camera);
    } finally { renderer.setRenderTarget(previous); }
   });
   await scheduler.breath();
  }
 }

 setSize(width, height) {
  if (this.output.width !== width || this.output.height !== height) this.output.setSize(width, height);
  const w = Math.max(1, Math.ceil(width / 2));
  const h = Math.max(1, Math.ceil(height / 2));
  for (const target of this.targets) {
   if (target.width !== w || target.height !== h) target.setSize(w, h);
  }
 }

 render(renderer, camera, target, particles) {
  if (particles.points !== this.source) {
   this.source = particles.points;
   this.maskMaterial.uniforms = particles.material.uniforms;
  }
  // Respect prepare-hidden / dormant parents, including cancelled entrances.
  for (let object = this.source; object; object = object.parent) {
   if (!object.visible) return target.texture;
  }
  this.setSize(target.width, target.height);
  this.mask.geometry = this.source.geometry;
  this.mask.matrix.copy(this.source.matrixWorld);
  const [a, b] = this.targets;
  const previous = renderer.getRenderTarget();
  const autoClear = renderer.autoClear;
  try {
   renderer.autoClear = true;
   renderer.setRenderTarget(a);
   renderer.render(this.maskScene, camera);
   this.quad.material = this.blur;
   this.blur.uniforms.uMap.value = a.texture;
   this.blur.uniforms.uStep.value.set(this.radius / a.width, 0);
   renderer.setRenderTarget(b);
   renderer.render(this.scene, this.camera);
   this.blur.uniforms.uMap.value = b.texture;
   this.blur.uniforms.uStep.value.set(0, this.radius / a.height);
   renderer.setRenderTarget(a);
   renderer.render(this.scene, this.camera);
   this.quad.material = this.add;
   this.add.uniforms.uBase.value = target.texture;
   renderer.setRenderTarget(this.output);
   renderer.render(this.scene, this.camera);
   return this.output.texture;
  } finally {
   renderer.setRenderTarget(previous);
   renderer.autoClear = autoClear;
  }
 }

 dispose() {
  this.targets.forEach(target => target.dispose());
  this.output.dispose();
  this.maskMaterial.dispose();
  this.blur.dispose();
  this.add.dispose();
  this.quad.geometry.dispose();
  // Source geometry and bone texture belong to createWhaleParticles.
 }
}
