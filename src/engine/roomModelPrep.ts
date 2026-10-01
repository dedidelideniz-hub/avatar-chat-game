/**
 * 🏠 ODA MODELİ — ölçüm ve yerleştirme matematiği (saf, React'siz).
 *
 * Kapıdaki "Evine gir" düğmesiyle açılan odanın içi bir GLB modelidir
 * (`constants.ROOM_MODEL_URL`). Model kaynağı değişebildiği (Sketchfab
 * dioramaları, elle üretilmiş dosyalar) ve HİÇBİRİ dünya biriminde olmadığı
 * için ölçek/konum sabit yazılmaz: `Box3` ile ÖLÇÜLÜR. Projedeki
 * `buildingModelPrep.ts` / `vegModelPrep.ts` ile aynı yaklaşım: "model
 * uzayına güvenme, ÖLÇ".
 *
 * Ölçüm gerçek `three.js` nesneleriyle yapıldığı için `scripts/preview-ui.tsx`
 * içinde sahne kurmadan doğrulanabilir (bkz. `oda-modeli` senaryosu).
 */
import * as THREE from "three";
import { ROOM_CAMERA, ROOM_FIT } from "./constants";

/**
 * Odanın TAMAMINI kapsayan kaba kutu (model uzayı).
 *
 * Binanın aksine burada hiçbir parça elenmez: odada kapı/pencere/merdiven
 * gibi parçalar da mekânın parçasıdır ve ölçüye katılmalıdır — yoksa model
 * odanın dışına taşar ya da içine gömülür.
 *
 * `null` döner: sahne gerçek bir `Object3D` değilse (önizleme yer tutucusu) ya
 * da hiç mesh yoksa.
 */
export function measureRoomModel(scene: THREE.Object3D): THREE.Box3 | null {
  if (!(scene as THREE.Object3D)?.isObject3D) return null;

  const box = new THREE.Box3();
  let found = false;
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    box.expandByObject(mesh);
    found = true;
  });

  return found && !box.isEmpty() ? box : null;
}

/** Ölçülen modele uygulanacak ölçek ve konum (oda grubunun yerel uzayında). */
export interface RoomPlacement {
  /** Tek tip ölçek — odanın en geniş yatay kenarı `span`a eşitlenir. */
  scale: number;
  /** Modelin oda grubuna göre konumu. */
  offset: { x: number; y: number; z: number };
  /** Ölçekten SONRAKİ ayak izi/yükseklik (bilgi + doğrulama için). */
  size: { x: number; y: number; z: number };
}

/**
 * Ölçülen kutuyu odaya oturtur.
 *
 * KURALLAR (hepsi ölçülen kutudan türetilir, sabit sayı yok):
 *   · en geniş YATAY kenar → `span` (oda, karakterin sığacağı bir hacim olur)
 *   · X/Z merkezi         → 0 (oyuncu odanın ortasına bakar)
 *   · en alt Y            → 0 (odaya alttan, tabanından oturur: zemine
 *     gömülmez, havada kalmaz)
 */
export function planRoomPlacement(
  box: THREE.Box3,
  span: number = ROOM_FIT.span,
): RoomPlacement {
  const size = box.getSize(new THREE.Vector3());
  const widest = Math.max(size.x, size.z);
  const scale = widest > 0 && span > 0 ? span / widest : 1;
  const centerX = (box.min.x + box.max.x) / 2;
  const centerZ = (box.min.z + box.max.z) / 2;

  return {
    scale,
    offset: {
      x: -centerX * scale,
      y: -box.min.y * scale,
      z: -centerZ * scale,
    },
    size: { x: size.x * scale, y: size.y * scale, z: size.z * scale },
  };
}

/** Odanın kamera planı (dünya uzayı). */
export interface RoomCameraPlan {
  fov: number;
  /** Kamera konumu. */
  position: [number, number, number];
  /** Bakış hedefi — odanın içi, karakterin hemen arkası. */
  target: [number, number, number];
}

/**
 * Kamerayı odanın ÖN kenarına, göz hizasına koyar ve içeri baktırır.
 *
 * Kamera hep odanın İÇİNDE kalır (`minDistance` korunur): model ne kadar
 * büyük/küçük ölçeklenirse ölçeklensin oyuncu duvarın arkasından ya da
 * tavanın üstünden bakmaz. Göz/hedef yükseklikleri odanın ölçülen yüksekliğine
 * göre KISILIR (alçak odaya uzun kamera olmaz).
 */
export function planRoomCamera(plan: RoomPlacement): RoomCameraPlan {
  const { size } = plan;
  const eyeMax = Math.max(0.5, size.y * 0.72);
  const eyeY = Math.min(ROOM_CAMERA.eyeY, eyeMax);

  const distance = Math.max(ROOM_CAMERA.minDistance, size.z / 2 - ROOM_CAMERA.inset);
  const lookAhead = Math.min(
    ROOM_CAMERA.targetZ,
    Math.max(0.4, size.z * 0.3),
  );
  const targetY = Math.min(ROOM_CAMERA.targetY, Math.max(0.4, size.y * 0.6));

  return {
    fov: ROOM_CAMERA.fov,
    position: [0, eyeY, distance],
    target: [0, targetY, -lookAhead],
  };
}

/**
 * Karakterin odadaki duruş noktası.
 *
 * Oda merkezinin hafif önünde (kameraya dönük) durur; dar bir modelde
 * (`standZ` odanın derinliğini aşarsa) merkeze çekilir ki karakter duvarın
 * içinde kalmasın.
 */
export function roomStandPoint(plan: RoomPlacement): { x: number; y: number; z: number } {
  const z = Math.min(ROOM_FIT.standZ, Math.max(0, plan.size.z * 0.15));
  return { x: 0, y: 0, z };
}
