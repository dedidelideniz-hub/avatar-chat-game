/**
 * BİNA MODELLERİ — ölçüm ve yerleştirme matematiği (saf, React'siz).
 *
 * Caddeye dikilen her bina bir GLB modelidir (bkz. `constants.BUILDINGS` →
 * `modelUrl`). Modeller farklı kaynaklardan (Sketchfab dioramaları, elle
 * üretilmiş dosyalar) geldiği ve HİÇBİRİ dünya biriminde olmadığı için ölçek
 * ve konum sabit yazılmaz: `Box3` ile ÖLÇÜLÜR, `BuildingDef`e oturtulur.
 * Projedeki `vegModelPrep.ts` ile aynı yaklaşım: "model uzayına güvenme, ÖLÇ".
 *
 * Ölçüm gerçek `three.js` nesneleriyle yapıldığı için `scripts/preview-ui.tsx`
 * içinde sahne kurmadan doğrulanabilir (bkz. `cadi-dukkani` senaryosu).
 */
import * as THREE from "three";
import type { BuildingDef } from "./constants";

/**
 * Bina sayılmayan model parçaları.
 *
 * Sketchfab dioramaları dükkânın yanına bir de ZEMİN/YOL parçası ve dökülmüş
 * yapraklar koyar (ör. `witch_shop.glb`: `Road` + `dead_leave002`). Bunlar
 * binanın gövdesi değildir: ölçeğe katılsalardı model, önündeki yol kadar
 * enli sanılır ve olduğundan KÜÇÜK ölçeklenirdi. Adlar GLTF düğüm adlarıdır
 * (`Road` → `Road_Road_0`, `dead_leave002` → `dead_leave002_dead_leaves_0`).
 */
const IGNORED_PARTS = /road|dead_leave/i;

/**
 * Modelin YALNIZCA bina gövdesini kapsayan kaba kutusu (model uzayı).
 *
 * Kutunun `max.z` kenarı binanın ÖN CEPHESİdir; yön hizalaması bu kenara göre
 * yapılır — böylece model, komşularıyla AYNI cephe hattına (`def.frontZ`)
 * oturur ve varsa önündeki yol o hattın önüne taşar.
 *
 * `null` döner: sahne gerçek bir `Object3D` değilse (önizleme yer tutucusu) ya
 * da hiç mesh yoksa.
 */
export function measureBuildingModel(scene: THREE.Object3D): THREE.Box3 | null {
  if (!(scene as THREE.Object3D)?.isObject3D) return null;

  const box = new THREE.Box3();
  let found = false;
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || IGNORED_PARTS.test(mesh.name)) return;
    box.expandByObject(mesh);
    found = true;
  });

  return found && !box.isEmpty() ? box : null;
}

/** Ölçülen modele uygulanacak ölçek ve konum (bina grubunun yerel uzayında). */
export interface BuildingPlacement {
  /** Tek tip ölçek — modelin genişliği gözün genişliğine eşitlenir. */
  scale: number;
  /** Modelin bina grubuna göre konumu (grup `[def.x, 0, def.frontZ]`te durur). */
  offset: { x: number; y: number; z: number };
  /** Ölçekten SONRAKİ ayak izi/oran (bilgi + doğrulama için). */
  size: { x: number; y: number; z: number };
}

/**
 * Ölçülen kutuyu `BuildingDef`e oturtur.
 *
 * KURALLAR (hepsi ölçülen kutudan türetilir, sabit sayı yok):
 *   · X merkezi  → gözün X'i (`def.x`)
 *   · en alt Y   → 0 (zemin; yani bina ALTTAN, tabanından oturur — çime
 *     gömülmez, havada da kalmaz. Modelin en alt noktası ölçülür)
 *   · en ön Z    → cephe hattı (`def.frontZ`) — komşularla hizalı
 *   · genişlik   → `def.w` (satırdaki gözle aynı boyut)
 *
 * Yani yükseklik ve derinlik gözün ölçüsünden DEĞİL, modelin kendi
 * oranlarından çıkar; gözün `d`i yalnızca satır ritmi (ne kadar öne çıktığı)
 * için kullanılır.
 */
export function planBuildingPlacement(
  box: THREE.Box3,
  def: BuildingDef,
): BuildingPlacement {
  const size = box.getSize(new THREE.Vector3());
  const scale = size.x > 0 ? def.w / size.x : 1;
  const centerX = (box.min.x + box.max.x) / 2;

  return {
    scale,
    offset: {
      x: -centerX * scale,
      y: -box.min.y * scale,
      z: -box.max.z * scale,
    },
    size: { x: size.x * scale, y: size.y * scale, z: size.z * scale },
  };
}
