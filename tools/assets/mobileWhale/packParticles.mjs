import { readFileSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import draco3d from 'draco3d';

// Offline POINTS packing: reuse the GLB's actual joint order, never guess it.
const [file, source] = process.argv.slice(2);
const bytes = readFileSync(file), jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
const oldBinary = bytes.subarray(28 + jsonLength);
const cloud = JSON.parse(readFileSync(source, 'utf8'));
const joints = gltf.skins[0].joints.map(index => gltf.nodes[index].name);
const count = cloud.position.length / 3;
const indices = new Uint16Array(count * 4), weights = new Uint8Array(count * 4);
cloud.weights.forEach((skin, i) => {let remaining=255;const entries=Object.entries(skin);entries.forEach(([name, weight], j) => {
  const joint = joints.indexOf(name);
  if (joint < 0 || j > 3) throw new Error(`Invalid particle skin: ${name}`);
  indices[i * 4 + j] = joint;
  weights[i * 4 + j] = j === entries.length-1 ? remaining : Math.min(remaining,Math.round(weight*255));
  remaining-=weights[i*4+j];
});});
const light=new Uint8Array(cloud.light.map((value,index)=>Math.round(Math.min(1,value/(index%4===0?2:index%4===3?4:1))*255)));
const module = await draco3d.createEncoderModule({});
const encoder = new module.Encoder(), builder = new module.PointCloudBuilder();
const points = new module.PointCloud(), encoded = new module.DracoInt8Array();
encoder.SetSpeedOptions(5, 5);
encoder.SetAttributeQuantization(module.POSITION, 15);
encoder.SetAttributeQuantization(module.NORMAL, 9);
// Path id and normalized arc position share one float attribute. Preserve enough
// precision for arc order even when the id range spans hundreds of currents.
encoder.SetAttributeQuantization(module.GENERIC, 20);
const attributes = {}, dracoAttributes = {};
for (const [semantic, data, width, type] of [
  ['POSITION', cloud.position, 3, module.POSITION], ['NORMAL', cloud.normal, 3, module.NORMAL],
  ['JOINTS_0', indices, 4, module.GENERIC], ['WEIGHTS_0', weights, 4, module.GENERIC],
  ['_LIGHT', light, 4, module.GENERIC],
  ['_FLOW', cloud.flow, 2, module.GENERIC],
]) {
  const isJoint=semantic==='JOINTS_0',isByte=data instanceof Uint8Array;
  dracoAttributes[semantic] = isJoint?builder.AddUInt16Attribute(points,type,count,width,data):
    isByte?builder.AddUInt8Attribute(points,type,count,width,data):
    builder.AddFloatAttribute(points, type, count, width, new Float32Array(data));
  const accessor = { componentType: isJoint?5123:isByte?5121:5126, count, type: `VEC${width}` };
  if(isByte)accessor.normalized=true;
  if (semantic === 'POSITION') {
    accessor.min = [Infinity, Infinity, Infinity]; accessor.max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < data.length; i++) {
      accessor.min[i % 3] = Math.min(accessor.min[i % 3], data[i]);
      accessor.max[i % 3] = Math.max(accessor.max[i % 3], data[i]);
    }
  }
  attributes[semantic] = gltf.accessors.push(accessor) - 1;
}
const size = encoder.EncodePointCloudToDracoBuffer(points, false, encoded);
if (size <= 0) throw new Error('Particle encoding failed');
const compressed = Buffer.alloc(size);
for (let i = 0; i < size; i++) compressed[i] = encoded.GetValue(i);
const offset = Math.ceil(oldBinary.length / 4) * 4;
const binary = Buffer.alloc(Math.ceil((offset + size) / 4) * 4);
oldBinary.copy(binary); compressed.copy(binary, offset);
const view = gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: size }) - 1;
const material = gltf.materials.push({ name: 'Anatomical particles', alphaMode: 'BLEND' }) - 1;
gltf.meshes[0].primitives.push({ attributes, material, mode: 0,
  extensions: { KHR_draco_mesh_compression: { bufferView: view, attributes: dracoAttributes } } });
gltf.extras={...gltf.extras,particleFormat:'continuous-surface-currents-v1',particlePaths:cloud.paths};
gltf.buffers[0].byteLength = binary.length;
const json = Buffer.from(JSON.stringify(gltf)), padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
json.copy(padded);
const header = Buffer.alloc(20), chunk = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + padded.length + binary.length, 8);
header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
chunk.writeUInt32LE(binary.length); chunk.writeUInt32LE(0x004e4942, 4);
writeFileSync(file, Buffer.concat([header, padded, chunk, binary]));
for (const resource of [encoded, points, builder, encoder]) module.destroy(resource);
console.log(`ANATOMICAL_PARTICLES ${count} particles, ${size} compressed bytes`);
