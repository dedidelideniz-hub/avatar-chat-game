/**
 * 🧨 bomba.glb ÜRETİCİSİ
 *
 * NEDEN SCRIPT: `public/ASSETS.md` ve `src/lib/binaryAssets.ts` şunu söylüyor —
 * bu projede hosting boru hattı her dosyayı UTF-8'e çeviriyor, yani gerçek
 * binary (GLB/MP3/WASM) bozuluyor. Bu yüzden tüm modeller **tek dosya JSON
 * glTF** olarak duruyor: `.glb` uzantısı korunur, binary chunk base64 `data:`
 * URI olarak gömülür ve dosya saf ASCII kalır. three.js'in GLTFLoader'ı
 * "glTF" magic'i olmayan bir ArrayBuffer'ı düz JSON olarak ayrıştırır, bu
 * yüzden `useGLTF("/models/bomba.glb")` değişmeden çalışır.
 *
 * Model üç.js geometrileriyle kurulur, tek bir BufferGeometry gibi
 * birleştirilir (malzeme başına bir primitive) ve elle glTF JSON'a yazılır —
 * harici exporter bağımlılığı, Node'da DOM ihtiyacı yok.
 *
 * MODEL UZAYI (runtime bu uzayı bilir: `src/engine/HandGrip.ts`):
 *   · gövde merkezi ORİJİN'de, gövde yarıçapı 1 (gövde çapı 2 birim),
 *   · fünye +Y yönünde; parlayan uç y ≈ +1.55'te.
 *   · dünya boyuna küçültme runtime'da ölçülür, burada ölçek verilmez.
 *
 * Kullanım:  node scripts/build-bomba-glb.mjs
 */
import fs from "node:fs";
import * as THREE from "three";

const OUT = "public/models/bomba.glb";

/* ------------------------------- yardımcılar ------------------------------ */

const srgb = (hex) => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
/**
 * Malzemeler ADLANDIRILIR: runtime katmanı fitilin parlayan ucunu isimle
 * bulup `emissiveIntensity`'yi kendi paletine göre yükseltir (glTF'te 1'in
 * üstünde emissive kuvveti ekstra uzantı ister; isimle hedeflemek daha sade).
 */
const mat = (name, hex, { metalness = 0.4, roughness = 0.6, emissive = null } = {}) => {
  const c = srgb(hex);
  const m = {
    name,
    pbrMetallicRoughness: {
      baseColorFactor: [c.r, c.g, c.b, 1],
      metallicFactor: metalness,
      roughnessFactor: roughness,
    },
    doubleSided: false,
  };
  if (emissive) {
    const e = srgb(emissive);
    m.emissiveFactor = [e.r, e.g, e.b];
  }
  return m;
};

/* --------------------------------- model --------------------------------- */

// 0: gövde (siyah dökme demir) · 1: pirinç bilezik/kapak · 2: fitil ipi · 3: parlayan fitil ucu
const MATERIALS = [
  mat("BombaBody", "#2a2d34", { metalness: 0.72, roughness: 0.34, emissive: "#12161c" }),
  mat("BombaBrass", "#c9952f", { metalness: 0.85, roughness: 0.28, emissive: "#6d4c0d" }),
  mat("BombaFuse", "#6b4a2a", { metalness: 0.05, roughness: 0.9 }),
  mat("BombaFuseGlow", "#ff9a2e", { metalness: 0.0, roughness: 0.5, emissive: "#ff7a18" }),
];

/** [geometry, materialIndex] — hepsi nihai model uzayında hazırlanır. */
const parts = [];

// Gövde: hafif basık küre (bomba gövdesi).
{
  const g = new THREE.SphereGeometry(1, 14, 10);
  g.scale(1, 0.96, 1);
  parts.push([g, 0]);
}
// Ekvator bileziği: gövdeyi saran ince pirinç halka.
{
  const g = new THREE.TorusGeometry(0.985, 0.055, 6, 20);
  g.rotateX(Math.PI / 2);
  parts.push([g, 1]);
}
// İkinci halka: biraz yukarıda, gövdeye "perçinli" görünüm verir.
{
  const g = new THREE.TorusGeometry(0.72, 0.045, 6, 18);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.62, 0);
  parts.push([g, 1]);
}
// Boyun/kapak: fitilin çıktığı pirinç bilezik.
{
  const g = new THREE.CylinderGeometry(0.34, 0.42, 0.26, 12, 1, false);
  g.translate(0, 1.02, 0);
  parts.push([g, 1]);
}
// Fitil: boyundan yukarı uzanan ip (hafif eğik → doğal duruş).
{
  const g = new THREE.CylinderGeometry(0.055, 0.075, 0.52, 8, 1, false);
  g.rotateZ(0.16);
  g.translate(0.03, 1.36, 0);
  parts.push([g, 2]);
}
// Parlayan fitil ucu: sarı-turuncu kendinden ışıyan küçük küre.
{
  const g = new THREE.SphereGeometry(0.115, 8, 6);
  g.translate(0.075, 1.62, 0);
  parts.push([g, 3]);
}
// Kıvılcım tanesi: fitil ucunun üstünde minik bir parlak nokta (bloom'u besler).
{
  const g = new THREE.IcosahedronGeometry(0.05, 0);
  g.translate(0.14, 1.74, 0.03);
  parts.push([g, 3]);
}

/* ------------------------------ veri toplama ------------------------------ */

const positions = [];
const normals = [];
const indices = [];
/** Malzeme başına [index başlangıcı, index sayısı] — primitive'ler bunu böler. */
const groups = [];

let vertexOffset = 0;
for (const [geo, material] of parts) {
  const pos = geo.getAttribute("position");
  const nrm = geo.getAttribute("normal");
  const idx = geo.getIndex();
  if (!pos || !nrm) throw new Error("geometri position/normal taşımıyor");
  for (let i = 0; i < pos.count; i++) {
    positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    normals.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
  }
  const start = indices.length;
  if (idx) {
    for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + vertexOffset);
  } else {
    for (let i = 0; i < pos.count; i++) indices.push(i + vertexOffset);
  }
  groups.push({ material, start, count: indices.length - start });
  vertexOffset += pos.count;
  geo.dispose();
}

if (vertexOffset > 65535) throw new Error("uint16 sınırı aşıldı (65535 vertex)");

/* ------------------------- ikili tampon (buffer) -------------------------- */

const posF32 = new Float32Array(positions);
const nrmF32 = new Float32Array(normals);
const idxU16 = new Uint16Array(indices);
const pad4 = (n) => (n + 3) & ~3;

const posBytes = new Uint8Array(posF32.buffer.slice(0));
const nrmBytes = new Uint8Array(nrmF32.buffer.slice(0));
const idxBytes = new Uint8Array(idxU16.buffer.slice(0));
const total = pad4(posBytes.length) + pad4(nrmBytes.length) + pad4(idxBytes.length);
const buffer = new Uint8Array(total);
let cursor = 0;
const posOffset = cursor;
buffer.set(posBytes, cursor);
cursor += pad4(posBytes.length);
const nrmOffset = cursor;
buffer.set(nrmBytes, cursor);
cursor += pad4(nrmBytes.length);
const idxOffset = cursor;
buffer.set(idxBytes, cursor);
cursor += pad4(idxBytes.length);

const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < positions.length; i += 3) {
  for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], positions[i + k]);
    max[k] = Math.max(max[k], positions[i + k]);
  }
}

/* --------------------------------- glTF ---------------------------------- */

const gltf = {
  asset: {
    version: "2.0",
    generator: "freebuff bomb generator (scripts/build-bomba-glb.mjs)",
  },
  scene: 0,
  scenes: [{ name: "Bomba", nodes: [0] }],
  nodes: [{ name: "Bomba", mesh: 0 }],
  meshes: [
    {
      name: "Bomba",
      primitives: groups.map((g) => ({
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2 + groups.indexOf(g),
        material: g.material,
        mode: 4,
      })),
    },
  ],
  materials: MATERIALS,
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: vertexOffset,
      type: "VEC3",
      min,
      max,
    },
    {
      bufferView: 1,
      componentType: 5126,
      count: vertexOffset,
      type: "VEC3",
    },
    // DİKKAT: accessor.byteOffset bufferView'e GÖRELİDİR. Buraya view'in
    // kendi `idxOffset`'ını da eklersek indeksler iki kez kayar ve model
    // bozuk çizilir (ilk üretimde tam bu hata vardı).
    ...groups.map((g) => ({
      bufferView: 2,
      byteOffset: g.start * 2,
      componentType: 5123,
      count: g.count,
      type: "SCALAR",
    })),
  ],
  bufferViews: [
    { buffer: 0, byteOffset: posOffset, byteLength: posBytes.length, target: 34962 },
    { buffer: 0, byteOffset: nrmOffset, byteLength: nrmBytes.length, target: 34962 },
    { buffer: 0, byteOffset: idxOffset, byteLength: idxBytes.length, target: 34963 },
  ],
  buffers: [
    {
      byteLength: total,
      uri: `data:application/octet-stream;base64,${Buffer.from(buffer).toString("base64")}`,
    },
  ],
};

const text = JSON.stringify(gltf);
if (!/^[\x20-\x7e]*$/.test(text)) {
  throw new Error("çıktı ASCII değil — hosting boru hattı bozar");
}
fs.writeFileSync(OUT, text, "ascii");

const kb = (text.length / 1024).toFixed(1);
console.log(
  `[bomba] ${OUT} yazıldı · ${kb} KB · ${vertexOffset} vertex / ` +
    `${indices.length / 3} üçgen · ${groups.length} primitive · ` +
    `boyut ${(max[0] - min[0]).toFixed(2)}×${(max[1] - min[1]).toFixed(2)}×` +
    `${(max[2] - min[2]).toFixed(2)} (model birimi)`,
);
