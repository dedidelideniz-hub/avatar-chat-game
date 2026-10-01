/**
 * CADI DÜKKÂNI — model ölçümü ve yerleştirme matematiği (saf, React'siz).
 *
 * Model bir Sketchfab dioramasıdır: dükkânın yanı sıra bir de YOL (`Road`) ve
 * dökülmüş yapraklar (`dead_leave…`) içerir. Bunlar binanın parçası olmadığı
 * için ölçek/konum referansına KATILMAZ — katılsalardı model, önündeki yol
 * kadar derin sanılır ve olması gerekenden küçük ölçeklenirdi (projedeki
 * `vegModelPrep.ts` ile aynı yaklaşım: "model uzayına güvenme, ÖLÇ").
 *
 * Ölçüm gerçek `three.js` nesneleriyle yapıldığı için `scripts/preview-ui.tsx`
 * içinde sahne kurmadan doğrulanabilir (bkz. `check-witch-shop` senaryosu).
 */
import * as THREE from "three";
import type { BuildingDef } from "./constants";

/**
 * Bina sayılmayan model parçaları. Model adları GLTF düğüm adlarıdır
 * (`Road` → `Road_Road_0`, `dead_leave002` → `dead_leave002_dead_leaves_0`).
 */
const IGNORED_PARTS = /road|dead_leave/i;

/**
 * Modelin YALNIZCA bina gövdesini kapsayan kaba kutusu (model uzayı).
 *
 * Caddede duran `Road` parçası ölçüm dışıdır; binanın ön cephesi bu kutunun
 * `max.z` kenarıdır ve yön hizalaması bu kenara göre yapılır — böylece
 * dükkân, komşularıyla AYNI cephe hattına (`frontZ`) oturur ve önündeki yol
 * o hattın önüne taşar (istenen görünüm: küçük bir ön avlu).
 *
 * `null` döner: sahne gerçek bir `Object3D` değilse (öntanıtlam/önizleme
 * yer tutucusu) ya da hiç mesh yoksa.
 */
export function measureWitchShop(scene: THREE.Object3D): THREE.Box3 | null {
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
export interface WitchShopPlacement {
  /** Tek tip ölçek — modelin genişliği binanın genişliğine eşitlenir. */
  scale: number;
  /** Modelin bina grubuna göre konumu (grup `[def.x, 0, def.frontZ]`te durur). */
  offset: { x: number; y: number; z: number };
  /** Ölçekten SONRAKİ ayak izi/oran (bilgi amaçlı, doğrulamada kullanılır). */
  size: { x: number; y: number; z: number };
}

/**
 * Ölçülen kutuyu `BuildingDef`e oturtur.
 *
 * KURALLAR (hepsi ölçülen kutudan türetilir, sabit sayı yok):
 *   · X merkezi  → binanın X'i (`def.x`)
 *   · en alt Y   → 0 (zemin; çim/karoların üstünde durur)
 *   · en ön Z    → cephe hattı (`def.frontZ`) — komşu dükkânlarla hizalı
 *   · genişlik   → `def.w` (aynı boyut)
 *
 * Yani yükseklik ve derinlik binanın ölçüsünden DEĞİL, modelin kendi
 * oranlarından çıkar: `witch_shop.glb` neredeyse kare bir ayak izine sahip
 * olduğu için sonuç komşularıyla aynı ölçekte okunur.
 */
export function planWitchShopPlacement(
  box: THREE.Box3,
  def: BuildingDef,
): WitchShopPlacement {
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
