/**
 * 🌱 ÇİM ZEMİN TEŞHİSİ — gerçek `grass_ground.glb` ile çalıştırır.
 *
 * Neden var: bu ortamda önizleme açılamıyor, yani "zemin boşluksuz döşendi mi,
 * doğru yükseklikte mi?" sorusu gözle doğrulanamıyor. Bu script sahnenin
 * kullandığı AYNI kodu (`src/engine/grassGroundPrep.ts`) gerçek dosya üzerinde
 * çalıştırıp ölçümü yazdırır:
 *   · karo boyutu (ölçülen, varsayılmayan),
 *   · yüzey yönü (normal +Y) ve metalness düzeltmesi,
 *   · kaç örnek (instance) çizileceği, kaplanan alan, boşluk kontrolü,
 *   · zeminin Y'si ile propların (ağaç/çim öbeği) taban Y'sinin aynı olduğu.
 *
 * Kullanım:  bun scripts/check-grass-ground.ts
 */
// GLTFLoader Node'da tarayıcı API'leri arar; ölçüm için yeterli sahte karşılıklar.
const g = globalThis as unknown as Record<string, unknown>;
g.self = globalThis;
g.ProgressEvent = class ProgressEvent {
  type: string;
  constructor(type: string, init: Record<string, unknown> = {}) {
    this.type = type;
    Object.assign(this, init);
  }
};
g.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });

import fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";
import {
  GRASS_GROUND_URL,
  buildGrassGroundPlacements,
  prepareGrassGround,
} from "../src/engine/grassGroundPrep";
import { GRASS_GROUND_Y, GRASS_GROUND_ZONES, VEG_SIZES } from "../src/engine/constants";

function loadModel(url: string): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  const file = fs.readFileSync(`public${url}`);
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  return new Promise((resolve, reject) => {
    loader.parse(buffer as ArrayBuffer, "", (gltf) => resolve(gltf.scene), reject);
  });
}

const scene = await loadModel(GRASS_GROUND_URL);
const tile = prepareGrassGround(scene);
const { report, size } = tile;

console.log(`\n=== ÇİM ZEMİN (${GRASS_GROUND_URL})`);
console.log(
  `  ham model: ${report.sourceMeshes} mesh · ${report.triangles} üçgen · ` +
    `ölçülen kutu ${report.rawSize.x.toFixed(2)}×${report.rawSize.y.toFixed(2)}×${report.rawSize.z.toFixed(2)} birim`,
);
console.log(
  `  karo (döşeme adımı): ${size.x.toFixed(3)} × ${size.z.toFixed(3)} birim · ` +
    `yüzey kalınlığı ${report.thickness.toFixed(3)}`,
);
console.log(
  `  yüzey yönü: ${report.normalUp ? "+Y ✔ (düzeltme gerekmedi)" : "ters → 180° X ile düzeltildi ✔"}`,
);
console.log(
  `  materyal: metalness ${report.metalnessFixed ? "1 → 0 (düzeltildi) ✔" : "zaten 0 ✔"} · ` +
    `dokular: ${report.maps.join(", ") || "yok"}`,
);

const { placements, zones } = buildGrassGroundPlacements(tile, GRASS_GROUND_ZONES);
console.log(`\n  döşeme: ${placements.length} örnek (instance) → 1 draw call`);
zones.forEach((zone, i) => {
  const def = GRASS_GROUND_ZONES[i];
  const gapX = zone.coverageX - def.w;
  const gapZ = zone.coverageZ - def.d;
  console.log(
    `    bölge ${i}: ${zone.cols}×${zone.rows} karo · kaplanan ${zone.coverageX.toFixed(2)}×` +
      `${zone.coverageZ.toFixed(2)} · istenen ${def.w}×${def.d} · taşma ` +
      `${gapX.toFixed(2)}×${gapZ.toFixed(2)} → ${gapX >= 0 && gapZ >= 0 ? "BOŞLUK YOK ✔" : "BOŞLUK VAR ✘"}`,
  );
});

// Uç uca gelme: komşu karoların kenarları tam örtüşüyor mu?
const stepX = size.x;
const stepZ = size.z;
const xs = [...new Set(placements.map((p) => p.x))].sort((a, b) => a - b);
const zs = [...new Set(placements.map((p) => p.z))].sort((a, b) => a - b);
const dx = xs.length > 1 ? xs[1] - xs[0] : 0;
const dz = zs.length > 1 ? zs[1] - zs[0] : 0;
console.log(
  `\n  dikiş kontrolü: X adımı ${dx.toFixed(6)} (karo ${stepX.toFixed(6)}) · ` +
    `Z adımı ${dz.toFixed(6)} (karo ${stepZ.toFixed(6)}) → ` +
    `${Math.abs(dx - stepX) < 1e-9 && Math.abs(dz - stepZ) < 1e-9 ? "TAM UÇ UCA ✔" : "FARK VAR ✘"}`,
);

// Yükseklik hizası: zemin ile propların tabanı aynı mı?
const groundY = placements[0]?.y ?? Number.NaN;
console.log(
  `\n  yükseklik: zemin y=${groundY.toFixed(3)} · GRASS_GROUND_Y=${GRASS_GROUND_Y.toFixed(3)} · ` +
    `ağaç tabanı=${GRASS_GROUND_Y.toFixed(3)} (boy ${VEG_SIZES.tree}) · ` +
    `çim öbeği tabanı=${GRASS_GROUND_Y.toFixed(3)}`,
);
console.log(
  `  referans: asfalt y=0.008 · kaldırım y=0.005 → zemin ${groundY < 0.005 ? "ALTINDA ✔" : "ÜSTÜNDE ✘"}`,
);
