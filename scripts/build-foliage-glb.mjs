/**
 * 🌳🌿🌾 BİTKİ ÖRTÜSÜ GLB ÜRETİCİSİ — tree.glb · bush.glb · grass_clump.glb
 *
 * NEDEN SCRIPT: `public/ASSETS.md` ve `src/lib/binaryAssets.ts` şunu söylüyor —
 * bu projede hosting boru hattı her dosyayı UTF-8'e çeviriyor, yani gerçek
 * binary (GLB/MP3/WASM) bozuluyor. Bu yüzden modeller **tek dosya JSON glTF**
 * olarak durur: `.glb` uzantısı korunur, binary chunk base64 `data:` URI
 * olarak gömülür ve dosya saf ASCII kalır. three.js'in GLTFLoader'ı "glTF"
 * magic'i olmayan bir ArrayBuffer'ı düz JSON olarak ayrıştırır, bu yüzden
 * `useGLTF("/models/tree.glb")` değişmeden çalışır.
 *
 * Aynı desen `scripts/build-bomba-glb.mjs` için de geçerli; oradan alınan
 * yardımcılar burada ortak bir `buildGlb()` hâline getirildi.
 *
 * MODEL UZAYI SÖZLEŞMESİ (üç model için ortak):
 *   · taban y = 0,
 *   · yükseklik (Y) tam 1 birim,
 *   · XZ merkezi orijinde.
 *   Sahne tarafı (`src/engine/VegetationModels.tsx`) bu sözleşmeyi **ölçerek**
 *   uygular: yükleme anında kaba kutu alınır, taban 0'a çekilir ve boy 1'e
 *   normalize edilir. Yani modeli değiştirip yeniden üretmek yerleşim kodunu
 *   bozmaz (bomba modelindeki "ölç, sabitleme varsayma" kuralının aynısı).
 *
 * Kullanım:  node scripts/build-foliage-glb.mjs
 */
import fs from "node:fs";
import * as THREE from "three";

/* ------------------------------- yardımcılar ------------------------------ */

const srgb = (hex) => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);

const mat = (name, hex, { metalness = 0.02, roughness = 0.85, side = "front" } = {}) => {
  const c = srgb(hex);
  return {
    name,
    pbrMetallicRoughness: {
      baseColorFactor: [c.r, c.g, c.b, 1],
      metallicFactor: metalness,
      roughnessFactor: roughness,
    },
    doubleSided: side === "double",
  };
};

/** Low-poly organik lob: 20 yüzlü ikosahedron, eksen bazlı ezilerek şekillendirilir. */
const lobe = (sx, sy, sz, x, y, z) => {
  const g = new THREE.IcosahedronGeometry(1, 0);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
};

/**
 * Çim bıçağı: 4 kenarlı, ucu sivri açık koni (4 üçgen), tek eksende
 * yassılaştırılır (yaprak), tabanı orijinde kalacak şekilde yukarı taşınır,
 * sonra tabandan dışa yatırılır ve istenen yöne döndürülür.
 */
const blade = (r, h, tilt, yaw, off, material) => {
  const g = new THREE.ConeGeometry(r, h, 4, 1, true);
  g.scale(1, 1, 0.42);      // yaprak kesiti: yassı
  g.translate(0, h / 2, 0); // taban orijinde
  g.rotateZ(tilt);          // tabandan dışa yat
  g.rotateY(yaw);           // hangi yöne yattığı
  g.translate(Math.cos(yaw) * off, 0, -Math.sin(yaw) * off); // kökleri ayır
  return { geo: g, material };
};

/* --------------------------------- modeller -------------------------------- */

/**
 * tree.glb — stilize low-poly yapraklı ağaç.
 * Gövde + iki dal (açık uçlu koniler) ve 5 faketli yaprak lobu.
 */
function buildTree() {
  const materials = [
    mat("TreeTrunk", "#6B4A2C", { roughness: 0.92 }),
    mat("TreeFoliageLight", "#74C155", { roughness: 0.86 }),
    mat("TreeFoliageDark", "#4F8F3C", { roughness: 0.9 }),
  ];

  const trunk = new THREE.CylinderGeometry(0.03, 0.055, 0.46, 6, 1, true);
  trunk.translate(0, 0.23, 0);

  const flare = new THREE.CylinderGeometry(0.055, 0.095, 0.07, 6, 1, true);
  flare.translate(0, 0.035, 0);

  // Dallar: +Y eksenini ±X'e yatırıp gövde tepesine oturtuyoruz.
  const branchL = new THREE.CylinderGeometry(0.018, 0.03, 0.24, 5, 1, true);
  branchL.rotateZ(-0.62);
  branchL.translate(0.07, 0.517, 0);

  const branchR = new THREE.CylinderGeometry(0.018, 0.03, 0.24, 5, 1, true);
  branchR.rotateZ(0.62);
  branchR.translate(-0.07, 0.5, 0);

  const parts = [
    [trunk, 0],
    [flare, 0],
    [branchL, 0],
    [branchR, 0],
    [lobe(0.3, 0.25, 0.3, 0, 0.6, 0), 2], // ana taç
    [lobe(0.215, 0.185, 0.215, -0.155, 0.7, 0.02), 1],
    [lobe(0.2, 0.175, 0.2, 0.16, 0.68, -0.03), 1],
    [lobe(0.17, 0.15, 0.17, 0.02, 0.72, 0.17), 1],
    [lobe(0.185, 0.165, 0.185, 0, 0.85, 0), 1],
  ];
  return { name: "Tree", materials, parts };
}

/**
 * bush.glb — şekilli low-poly organik çalı.
 * Tek gövde yok: birbirine geçen 6 yaprak lobu; genişliği boyundan büyük
 * (çalı silueti), alt loblar koyu, üst/ön loblar açık ton.
 */
function buildBush() {
  const materials = [
    mat("BushFoliage", "#4F9A3E", { roughness: 0.88 }),
    mat("BushFoliageDark", "#3D7F31", { roughness: 0.92 }),
  ];

  const parts = [
    [lobe(0.34, 0.26, 0.34, 0, 0.26, 0), 1],
    [lobe(0.26, 0.22, 0.26, 0.2, 0.28, 0.16), 0],
    [lobe(0.24, 0.22, 0.24, -0.19, 0.3, -0.14), 0],
    [lobe(0.27, 0.24, 0.27, 0.02, 0.55, 0.02), 0],
    [lobe(0.17, 0.15, 0.17, -0.26, 0.2, 0.16), 1],
    [lobe(0.15, 0.13, 0.15, 0.18, 0.66, -0.12), 0],
  ];
  return { name: "Bush", materials, parts };
}

/**
 * grass_clump.glb — 3D çim kümesi.
 * 7 yaprak: ortada dik bir bıçak, çevresinde dışa yatan altı bıçak.
 */
function buildGrassClump() {
  const materials = [
    mat("GrassBladeLight", "#7EC850", { roughness: 0.9 }),
    mat("GrassBladeDark", "#5DA838", { roughness: 0.92 }),
  ];

  const parts = [
    blade(0.07, 0.95, 0.36, 0.0, 0.075, 0),
    blade(0.06, 0.78, 0.42, 1.05, 0.07, 1),
    blade(0.065, 0.88, 0.3, 2.1, 0.065, 0),
    blade(0.055, 0.7, 0.46, 3.14, 0.075, 1),
    blade(0.06, 0.82, 0.34, 4.2, 0.07, 0),
    blade(0.05, 0.62, 0.5, 5.3, 0.08, 0),
    blade(0.055, 1.0, 0.06, 0.6, 0.0, 0),
  ].map((p) => [p.geo, p.material]);

  return { name: "GrassClump", materials, parts };
}

/* ------------------------------ glTF yazıcısı ------------------------------ */

const pad4 = (n) => (n + 3) & ~3;

/**
 * Verilen parçaları (geometry + malzeme indeksi) TEK JSON glTF dosyasına yazar:
 * malzeme başına bir primitive, konum/normal/indeks tamponları base64 `data:`
 * URI olarak gömülü. Çıktı ASCII değilse hata verir (hosting kuralı).
 */
function buildGlb({ out, name, materials, parts }) {
  const positions = [];
  const normals = [];
  const indices = [];
  /** Malzeme başına [index başlangıcı, index sayısı] — primitive'ler bunu böler. */
  const groups = [];

  // Parçaları MALZEMEYE GÖRE birleştir: her malzeme tek primitive olsun.
  // Aksi hâlde her parça ayrı primitive olur ve sahne tarafında her primitive
  // ayrı bir InstancedMesh (= ayrı draw call) açar.
  const buckets = new Map();
  for (const [geo, material] of parts) {
    if (!buckets.has(material)) buckets.set(material, []);
    buckets.get(material).push(geo);
  }

  let vertexOffset = 0;
  for (const [material, geos] of buckets) {
    const start = indices.length;
    for (const geo of geos) {
      const pos = geo.getAttribute("position");
      const nrm = geo.getAttribute("normal");
      const idx = geo.getIndex();
      if (!pos || !nrm) throw new Error(`${name}: geometri position/normal taşımıyor`);
      for (let i = 0; i < pos.count; i++) {
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        normals.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      }
      if (idx) {
        for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + vertexOffset);
      } else {
        for (let i = 0; i < pos.count; i++) indices.push(i + vertexOffset);
      }
      vertexOffset += pos.count;
      geo.dispose();
    }
    groups.push({ material, start, count: indices.length - start });
  }

  if (vertexOffset > 65535) throw new Error(`${name}: uint16 sınırı aşıldı (65535 vertex)`);

  const posF32 = new Float32Array(positions);
  const nrmF32 = new Float32Array(normals);
  const idxU16 = new Uint16Array(indices);

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

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }

  const gltf = {
    asset: {
      version: "2.0",
      generator: "freebuff foliage generator (scripts/build-foliage-glb.mjs)",
    },
    scene: 0,
    scenes: [{ name, nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [
      {
        name,
        primitives: groups.map((g) => ({
          attributes: { POSITION: 0, NORMAL: 1 },
          indices: 2 + groups.indexOf(g),
          material: g.material,
          mode: 4,
        })),
      },
    ],
    materials,
    accessors: [
      { bufferView: 0, componentType: 5126, count: vertexOffset, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5126, count: vertexOffset, type: "VEC3" },
      // DİKKAT: accessor.byteOffset bufferView'e GÖRELİDİR — buraya view'in
      // kendi ofsetini de eklersek indeksler iki kez kayar (bomba modelinde
      // ilk üretimde tam bu hata vardı).
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
    throw new Error(`${name}: çıktı ASCII değil — hosting boru hattı bozar`);
  }
  fs.writeFileSync(out, text, "ascii");

  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  console.log(
    `[${name}] ${out} · ${(text.length / 1024).toFixed(1)} KB · ` +
      `${vertexOffset} vertex / ${indices.length / 3} üçgen · ${groups.length} primitive · ` +
      `boyut ${size[0].toFixed(2)}×${size[1].toFixed(2)}×${size[2].toFixed(2)} ` +
      `(en/boy oranı ${(Math.max(size[0], size[2]) / size[1]).toFixed(2)})`,
  );
}

/* --------------------------------- üretim --------------------------------- */

buildGlb({ out: "public/models/tree.glb", ...buildTree() });
buildGlb({ out: "public/models/bush.glb", ...buildBush() });
buildGlb({ out: "public/models/grass_clump.glb", ...buildGrassClump() });
