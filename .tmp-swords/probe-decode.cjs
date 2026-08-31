const fs = require('fs');
const path = require('path');
const { createDecoderModule } = require('draco3d');

async function main() {
  // three ships a newer wasm decoder in examples/jsm/libs/draco/gltf/
  // draco3d npm wraps an older JS build — try the wasm wrapper via emscripten module
  const dir = path.resolve(__dirname, '../node_modules/three/examples/jsm/libs/draco/gltf');
  const wasmBinary = fs.readFileSync(path.join(dir, 'draco_decoder.wasm'));
  const wrapperSource = fs.readFileSync(path.join(dir, 'draco_wasm_wrapper.js'), 'utf8');
  const fn = new Function(wrapperSource + '\nreturn DracoDecoderModule;');
  const mod = fn();
  const dm = await mod({ wasmBinary });

  const buf = fs.readFileSync(path.join(__dirname, 'Sword115.glb'));
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
  let off = 20 + jsonLen;
  const binLen = buf.readUInt32LE(off);
  const bin = buf.slice(off + 8, off + 8 + binLen);
  const ext = json.meshes[0].primitives[0].extensions.KHR_draco_mesh_compression;
  const bv = json.bufferViews[ext.bufferView];
  const data = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);

  const decoder = new dm.Decoder();
  const buffer = new dm.DecoderBuffer();
  buffer.Init(new Int8Array(data), data.length);
  const type = decoder.GetEncodedGeometryType(buffer);
  console.log('type', type, 'MESH', dm.TRIANGULAR_MESH);
  const res = decoder.DecodeBufferToMesh(buffer);
  const ok = typeof res.ok === 'function' ? res.ok() : res.mesh != null;
  console.log('decode ok?', ok, res.mesh ? 'has mesh' : 'no mesh');
  const geo = res.mesh;
  if (!geo) { console.log('FAIL'); return; }
  const numPoints = geo.num_points();
  console.log('num_points', numPoints);
  const attrId = ext.attributes.POSITION;
  const attr = decoder.GetAttributeByUniqueId(geo, attrId);
  const va = new dm.DracoFloat32Array();
  decoder.GetAttributeFloatForAllPoints(geo, attr, va);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < numPoints; i++) {
    for (let k = 0; k < 3; k++) {
      const v = va.GetValue(i * 3 + k);
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  console.log('min', min.map(v => +v.toFixed(3)), 'max', max.map(v => +v.toFixed(3)));
  console.log('size', max.map((v, k) => +(v - min[k]).toFixed(3)));
}
main().catch(e => { console.error(e); process.exit(1); });
