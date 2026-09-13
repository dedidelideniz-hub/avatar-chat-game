import * as THREE from "three";

/* ── Brawl tarzı vuruş geri bildirimi: beyaz parlama ───────────────────
 * Darbe anında modelin kaplamasını kısa süre (0.1s) tamamen parlak beyaza
 * çevirir, sonra orijinal emissive değerlerine döndürür. Sadece önceden
 * kaydedilmiş kaplamalara dokunur; böylece parlama sırasında eklenen bir
 * parça (kılıç/zırh gibi) asla yarı-beyaz kalmaz.
 */

export const HIT_FLASH_MS = 100; // modelin beyaz parlama süresi
export const HIT_FLASH_BOOST = 2.6; // emissive şiddet çarpanı

export type FlashBase = { r: number; g: number; b: number; i: number };

function forEachStdMaterial(
  group: THREE.Object3D,
  fn: (m: THREE.MeshStandardMaterial) => void,
): void {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of list) {
      const m = mat as THREE.MeshStandardMaterial;
      if (m.emissive) fn(m);
    }
  });
}

/** Darbe başında mevcut emissive durumunu saklar (geri dönüş için). */
export function snapshotFlash(
  group: THREE.Object3D,
  out: Map<THREE.Material, FlashBase>,
): void {
  out.clear();
  forEachStdMaterial(group, (m) => {
    out.set(m, {
      r: m.emissive.r,
      g: m.emissive.g,
      b: m.emissive.b,
      i: m.emissiveIntensity ?? 1,
    });
  });
}

/** k=1 tam beyaz, k=0 → orijinal kaplamaya dönüş. */
export function applyFlash(
  group: THREE.Object3D,
  out: Map<THREE.Material, FlashBase>,
  k: number,
): void {
  if (k <= 0) {
    forEachStdMaterial(group, (m) => {
      const base = out.get(m);
      if (!base) return;
      m.emissive.setRGB(base.r, base.g, base.b);
      m.emissiveIntensity = base.i;
    });
    out.clear();
    return;
  }
  forEachStdMaterial(group, (m) => {
    if (!out.has(m)) return;
    m.emissive.setRGB(1, 1, 1);
    m.emissiveIntensity = HIT_FLASH_BOOST * k;
  });
}
