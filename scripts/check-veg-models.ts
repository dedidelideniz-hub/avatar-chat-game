/**
 * 🌳 BİTKİ ÖRTÜSÜ TEŞHİSİ — gerçek model dosyalarıyla çalıştırır.
 *
 * Neden var: bu ortamda önizleme açılamıyor, yani "ağaç caddede doğru boyda ve
 * DİK duruyor mu?" sorusu gözle doğrulanamıyor. Bu script sahnenin kullandığı
 * AYNI hazırlık kodunu (`src/engine/vegModelPrep.ts`) gerçek GLB üzerinde
 * çalıştırıp ölçümü yazdırır: kaç draw call, yön düzeltmesi uygulandı mı,
 * normalize edilmiş yükseklik/taban ne, caddede kaç birim yer kaplıyor.
 *
 * Kullanım:  bun scripts/check-veg-models.ts
 */
// GLTFLoader Node'da doku çözmek için tarayıcı API'leri arar; ölçüm için
// yeterli sahte karşılıklar (görsel oluşturulmaz, sadece ayrıştırma).
(globalThis as unknown as Record<string, unknown>).ProgressEvent = class ProgressEvent {
  type: string;
  constructor(type: string, init: Record<string, unknown> = {}) {
    this.type = type;
    Object.assign(this, init);
  }
};
(globalThis as unknown as Record<string, unknown>).createImageBitmap = async () => ({
  width: 1,
  height: 1,
  close() {},
});

import fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";
import {
  BUSH_MODEL_CONFIG,
  GRASS_MODEL_CONFIG,
  TREE_MODEL_CONFIG,
  prepareVegetationModel,
  type VegModelConfig,
} from "../src/engine/vegModelPrep";
import { GRASS_LIFT, TREE_ROWS, VEG_SIZES } from "../src/engine/constants";

/** Tarayıcıdaki `useGLTF("/models/x.glb")` çağrısının Node karşılığı:
 *  dosya diskten okunur ve GLTFLoader'a tampon olarak verilir (saf ASCII JSON
 *  glTF olduğu için ayrıştırma yolu birebir aynıdır). */
function loadModel(url: string): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  const file = fs.readFileSync(`public${url}`);
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  return new Promise((resolve, reject) => {
    loader.parse(buffer as ArrayBuffer, "", (gltf) => resolve(gltf.scene), reject);
  });
}

function inspect(name: string, cfg: VegModelConfig, height: number, baseY: number) {
  return loadModel(cfg.url).then((scene) => {
    const { parts, report } = prepareVegetationModel(scene, cfg);
    const size = report.rawSize;

    console.log(`\n=== ${name} (${cfg.url})`);
    console.log(
      `  ham model: ${report.sourceMeshes} mesh · ${size.x.toFixed(1)}×${size.y.toFixed(1)}×` +
        `${size.z.toFixed(1)} birim · yön düzeltmesi: ${report.flipped ? "180° X" : "yok"} · ` +
        `ölçülen boy ${report.height.toFixed(1)} birim`,
    );
    console.log(`  → ${parts.length} draw call`);

    for (const part of parts) {
      const geo = part.geometry;
      const position = geo.getAttribute("position");
      const box = geo.boundingBox ?? new THREE.Box3().setFromBufferAttribute(position);
      const index = geo.getIndex();
      const tris = index ? index.count / 3 : position.count / 3;
      const finite =
        Number.isFinite(box.min.x) && Number.isFinite(box.max.y) && Number.isFinite(box.max.z);
      console.log(
        `     · ${part.key.padEnd(22)} vertex ${String(position.count).padStart(6)} · ` +
          `üçgen ${String(Math.round(tris)).padStart(6)} · ` +
          `normalize bbox y[${box.min.y.toFixed(3)} … ${box.max.y.toFixed(3)}] · ` +
          `${finite ? "sonlu ✔" : "NaN ✘"} · ` +
          `doku ${(part.material as THREE.MeshStandardMaterial).map ? "var" : "yok"} · ` +
          `çift yüz ${part.material.side === THREE.DoubleSide ? "✔" : "—"}`,
      );
    }

    // Caddedeki gerçek ölçü: normalize model 1 birim → dünya boyu `height`.
    const footprint = Math.max(size.x, size.z) / Math.max(size.y, 1e-6) * height;
    console.log(
      `  caddede: boy ${height.toFixed(2)} birim · tepe yüksekliği ` +
        `${(baseY + height).toFixed(2)} · taç genişliği ≈ ${footprint.toFixed(2)} birim ` +
        `(oyuncu 1.92, dükkanlar 3.2–5)`,
    );
    return { parts, report };
  });
}

const treeCount = TREE_ROWS.reduce(
  (sum, row) => sum + Math.floor((row.endX - row.startX) / row.spacing) + 1,
  0,
);

console.log(`Ağaç sıraları: ${TREE_ROWS.length} sıra · ${treeCount} ağaç`);
for (const row of TREE_ROWS) console.log(`  · z=${row.z} x=${row.startX}…${row.endX} adım ${row.spacing}`);

await inspect("AĞAÇ (maple)", TREE_MODEL_CONFIG, VEG_SIZES.tree, GRASS_LIFT);
await inspect("ÇALI (bush)", BUSH_MODEL_CONFIG, VEG_SIZES.bush, GRASS_LIFT);
await inspect("ÇİM (grass_clump)", GRASS_MODEL_CONFIG, VEG_SIZES.grassClump, GRASS_LIFT);
