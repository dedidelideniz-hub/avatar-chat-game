const fs = require('fs');
const decoderModulePromise = require('draco3d').createDecoderModule();

function parseGlb(file) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  let bin = null;
  let off = 20 + jsonLen;
  if (off + 8 <= buf.length) {
    const binLen = buf.readUInt32LE(off);
    const binType = buf.readUInt32LE(off + 4);
    if (binType === 0x004e4942) bin = buf.slice(off + 8, off + 8 + binLen);
  }
  return { json, bin };
}

function mul(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    out[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  }
  return out;
}
function trs(n) {
  if (n.matrix) return n.matrix;
  const t = n.translation || [0,0,0];
  const q = n.rotation || [0,0,0,1];
  const s = n.scale || [1,1,1];
  const [x,y,z,w] = q;
  const rm = [
    1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w), 0,
    2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w), 0,
    2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y), 0,
    0,0,0,1,
  ];
  const sm = [s[0],0,0,0, 0,s[1],0,0, 0,0,s[2],0, 0,0,0,1];
  return mul(mul(rm, sm), [1,0,0,t[0], 0,1,0,t[1], 0,0,1,t[2], 0,0,0,1]);
}
function xform(m, v) {
  return [
    m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],
    m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],
    m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14],
  ];
}

function collectVertices(json, bin, dm) {
  const verts = [];
  const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  function walk(nodeIndex, parentM) {
    const n = json.nodes[nodeIndex];
    const m = mul(parentM, trs(n));
    if (n.mesh != null) {
      const mesh = json.meshes[n.mesh];
      for (const prim of mesh.primitives) {
        const ext = prim.extensions && prim.extensions.KHR_draco_mesh_compression;
        if (ext) {
          const bv = json.bufferViews[ext.bufferView];
          const data = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
          const decoder = new dm.Decoder();
          const buffer = new dm.DecoderBuffer();
          buffer.Init(new Int8Array(data), data.length);
          const geo = decoder.DecodeBufferToMesh(buffer);
          const numPoints = geo.mesh ? geo.mesh.num_points() : geo.num_points();
          const geometry = geo.mesh || geo;
          const posAttrId = ext.attributes.POSITION;
          const attr = decoder.GetAttributeByUniqueId(geometry, posAttrId);
          const va = new dm.DracoFloat32Array();
          decoder.GetAttributeFloatForAllPoints(geometry, attr, va);
          for (let i = 0; i < numPoints; i++) {
            verts.push(xform(m, [va.GetValue(i * 3), va.GetValue(i * 3 + 1), va.GetValue(i * 3 + 2)]));
          }
          decoderModule.destroy(va);
          continue;
        }
        const posAcc = json.accessors[prim.attributes.POSITION];
        if (!posAcc) continue;
        const bv = json.bufferViews[posAcc.bufferView];
        const stride = bv.byteStride || 12;
        const start = (bv.byteOffset || 0) + (posAcc.byteOffset || 0);
        for (let i = 0; i < posAcc.count; i++) {
          const o = start + i * stride;
          verts.push(xform(m, [bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)]));
        }
      }
    }
    for (const c of n.children || []) walk(c, m);
  }
  for (const root of json.scenes[0].nodes || []) walk(root, identity);
  return verts;
}

function analyze(file, dm) {
  const { json, bin } = parseGlb(file);
  const verts = collectVertices(json, bin, dm);
  if (!verts.length) return { file: file.split('/').pop(), err: 'no verts' };
  const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
  for (const v of verts) for (let k = 0; k < 3; k++) {
    if (v[k] < min[k]) min[k] = v[k];
    if (v[k] > max[k]) max[k] = v[k];
  }
  const size = max.map((m, k) => +(m - min[k]).toFixed(3));
  const longest = size.indexOf(Math.max(...size));
  const N = 12;
  const widths = [];
  const a1 = (longest + 1) % 3, a2 = (longest + 2) % 3;
  for (let s = 0; s < N; s++) {
    const lo = min[longest] + size[longest] * s / N;
    const hi = min[longest] + size[longest] * (s + 1) / N;
    let w = 0;
    for (const v of verts) if (v[longest] >= lo && v[longest] < hi) {
      w = Math.max(w, Math.hypot(v[a1], v[a2]));
    }
    widths.push(+w.toFixed(3));
  }
  return { file: file.split('/').pop(), size, longest, min: min.map(v=>+v.toFixed(3)), widths };
}

(async () => {
  const dm = await decoderModulePromise;
  const files = process.argv.slice(2);
  for (const f of files) {
    try { console.log(JSON.stringify(analyze(f, dm))); } catch (e) { console.log(JSON.stringify({ file: f, err: String(e.message || e) })); }
  }
  process.exit(0);
})();
