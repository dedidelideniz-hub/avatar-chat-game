/**
 * 🏠 ODA MODELİ — ölçüm, izole yerleşim, duvar sınırı ve zemin tespiti
 * (saf matematik, React'siz).
 *
 * Kapıdaki "Evine gir" düğmesiyle açılan odanın içi bir GLB modelidir
 * (`constants.ROOM_MODEL_URL` → `public/models/empty_office_space.glb`) ve ana
 * haritadan TAMAMEN İZOLE bir bölgede durur (`ROOM_ISO.origin` = X/Z 2000).
 *
 * NEDEN ÖLÇÜYORUZ (sabit sayı yazmıyoruz): modeller farklı kaynaklardan gelir
 * (Sketchfab, elle üretilmiş dosyalar) ve HİÇBİRİ dünya biriminde olmaz.
 * Bu yüzden ölçek, yerleşim, duvar sınırları ve kamera mesafesi `Box3` ile
 * ÖLÇÜLEREK türetilir. Projedeki `buildingModelPrep.ts` / `vegModelPrep.ts` ile
 * aynı yaklaşım: "model uzayına güvenme, ÖLÇ".
 *
 * ZEMİN (Floor / placementZone): eşya dizmenin (build mode) çalışması için
 * raycaster'ın bir yüzeye çarpması gerekir. Modelde adında "floor/zemin/taban/
 * ground" geçen bir mesh varsa O seçilir; yoksa en geniş ve en İNCE (yere
 * yatan) parça zemin sayılır; o da yoksa (her şey tek mesh'teyse) çağıran taraf
 * ölçülen kutudan kodla bir zemin düzlemi üretir (`RoomStage`).
 *
 * Ölçüm gerçek `three.js` nesneleriyle yapıldığı için `scripts/preview-ui.tsx`
 * içinde sahne kurmadan doğrulanabilir (bkz. `oda-modeli` senaryosu).
 */
import * as THREE from "three";
import { ROOM_ISO } from "./constants";

/**
 * Odanın TAMAMINI kapsayan kaba kutu (model uzayı).
 *
 * Binanın aksine burada hiçbir parça elenmez: odada kapı/pencere/merdiven gibi
 * parçalar da mekânın parçasıdır ve ölçüye katılmalıdır — yoksa model odanın
 * dışına taşar ya da içine gömülür.
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

/* ───────────────────────── ZEMİN (placementZone) ───────────────────────── */

/** Zemin olma ihtimali yüksek adlar — model üreticileri bunlardan birini kullanır. */
const FLOOR_NAME = /floor|zemin|taban|ground|pavimento/i;

/**
 * Zemin sayılacak en büyük incelik oranı (yükseklik / yatay açıklık).
 *
 * Zemin bir DÖŞEMEDİR: geniştir ama incedir. Oran bunun üstündeyse (parça
 * hacimli, yani duvar/masa/raf) o parça zemin değildir — yanlış zemine eşya
 * dizmektense yedek düzleme düşmek iyidir.
 */
const FLOOR_MAX_RATIO = 0.35;

/** Kutunun yatay (X·Z) ayak izi — "en geniş parça" seçimi bununla yapılır. */
function footprint(box: THREE.Box3): number {
  const size = box.getSize(new THREE.Vector3());
  return size.x * size.z;
}

/**
 * Modelden ZEMİN mesh'ini bulur (`userData.placementZone` ile işaretlenir —
 * bkz. `markPlacementZone`). Bulamazsa `null` döner ve çağıran taraf yedek
 * düzlem kurar: eşya dizme hiçbir modelde "sessizce çalışmaz" hâle gelmez.
 *
 * SIRA: (1) adı zemin olan EN GENİŞ parça, (2) ad yoksa EN GENİŞ parça —
 * yalnızca inceyse (yere yatıyorsa).
 */
export function findFloorMesh(scene: THREE.Object3D): THREE.Mesh | null {
  if (!(scene as THREE.Object3D)?.isObject3D) return null;

  const candidates: { mesh: THREE.Mesh; box: THREE.Box3; name: string }[] = [];
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return;
    candidates.push({ mesh, box, name: mesh.name ?? "" });
  });
  if (candidates.length === 0) return null;

  const byName = candidates
    .filter((c) => FLOOR_NAME.test(c.name))
    .sort((a, b) => footprint(b.box) - footprint(a.box));
  if (byName.length > 0) return byName[0].mesh;

  const widest = [...candidates].sort(
    (a, b) => footprint(b.box) - footprint(a.box),
  )[0];
  const size = widest.box.getSize(new THREE.Vector3());
  const ratio = size.y / Math.max(size.x, size.z, 1e-6);
  return ratio <= FLOOR_MAX_RATIO ? widest.mesh : null;
}

/**
 * Mesh'i "eşya dizilebilir zemin" olarak işaretler.
 *
 * Raycaster bu bayrağı okur (`RoomStage`): bir tıklama ancak `placementZone`
 * işaretli bir yüzeye düştüğünde eşya yerleştirir/karakteri yürütür. Duvar,
 * tavan ve mobilya bu yüzden "zemin gibi" davranmaz.
 */
export function markPlacementZone(mesh: THREE.Mesh | null): THREE.Mesh | null {
  if (!mesh) return null;
  mesh.userData.placementZone = true;
  return mesh;
}

/* ────────────────────────────── YERLEŞİM ────────────────────────────── */

/** `planIsoRoom`a geçirilebilen ayarlar (varsayılan: `constants.ROOM_ISO`). */
export interface IsoRoomOptions {
  origin: readonly [number, number, number];
  scale: number;
  span: number;
  fitBand: { readonly min: number; readonly max: number };
  camera: {
    readonly offset: readonly [number, number, number];
    readonly fov: number;
  };
}

/** İzole odanın kurulum planı — hepsi ÖLÇÜLEN kutudan türetilir. */
export interface IsoRoomPlan {
  /** Modelin, odanın merkez grubuna göre yerel konumu (merkez X/Z, taban y 0). */
  offset: { x: number; y: number; z: number };
  /** Uygulanan ölçek (varsayılan 1; ham model dünya biriminde değilse otomatik). */
  scale: number;
  /** Ölçekten SONRAKİ oda boyutu. */
  size: { x: number; y: number; z: number };
  /** Oda merkezine göre yarı açıklık — DUVAR SINIRLARI buradan gelir. */
  half: { x: number; z: number };
  /** Odanın dünyadaki merkezi (`ROOM_ISO.origin`). */
  origin: [number, number, number];
  /** İzometrik kamera — hedef HER ZAMAN `origin`. */
  camera: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  };
  /** Otomatik ölçek devreye girdi mi (ham model dünya biriminde değildi)? */
  autoScaled: boolean;
  /** Odanın dünyadaki ayak izi — duvar sınırı ve doğrulama için. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/**
 * Ölçülen kutuyu izole odanın kurulumuna çevirir.
 *
 * KURALLAR (hepsi ölçülen kutudan, sabit sayı yok):
 *   · ham açıklık `fitBand` İÇİNDE → `scale` varsayılanı (1) aynen kullanılır,
 *   · ham açıklık bandın DIŞINDA (model dünya biriminde değil) → oda `span`a
 *     ölçeklenir; oyuncu 312 birimlik bir diorama içinde kaybolmaz,
 *   · X/Z merkezi → odanın merkezi (`origin`): oyuncu odanın ortasına doğar,
 *   · en alt Y → 0: oda zemine oturur, havada kalmaz veya zemine gömülmez,
 *   · kamera → `origin`e göre (12, 15, 12) yönünde, izometrik. Oda büyükse
 *     mesafe odayı çerçeveleyecek kadar AÇILIR (yakınlaştırılmaz): spec
 *     açısı korunur, sadece ölçek uyar.
 */
export function planIsoRoom(
  box: THREE.Box3,
  opts: IsoRoomOptions = ROOM_ISO,
): IsoRoomPlan {
  const size = box.getSize(new THREE.Vector3());
  const widest = Math.max(size.x, size.z);
  const inBand =
    widest > 0 && widest >= opts.fitBand.min && widest <= opts.fitBand.max;
  const autoScaled = widest > 0 && !inBand;
  const scale = autoScaled ? opts.span / widest : opts.scale;

  const centerX = (box.min.x + box.max.x) / 2;
  const centerZ = (box.min.z + box.max.z) / 2;
  const [ox, oy, oz] = opts.origin;

  const scaled = new THREE.Vector3(
    size.x * scale,
    size.y * scale,
    size.z * scale,
  );
  const half = { x: scaled.x / 2, z: scaled.z / 2 };

  // KAMERA — spec yönü korunur; mesafe odanın ölçüsüne göre açılır.
  const dir = new THREE.Vector3(
    opts.camera.offset[0],
    opts.camera.offset[1],
    opts.camera.offset[2],
  );
  const specDistance = dir.length() || 1;
  const fitDistance = Math.max(
    Math.max(scaled.x, scaled.z) * 1.6,
    scaled.y * 1.6,
    specDistance * 0.5,
  );
  const distance = Math.max(specDistance, fitDistance);
  dir.normalize().multiplyScalar(distance);

  return {
    offset: {
      x: -centerX * scale,
      y: -box.min.y * scale,
      z: -centerZ * scale,
    },
    scale,
    size: { x: scaled.x, y: scaled.y, z: scaled.z },
    half,
    origin: [ox, oy, oz],
    camera: {
      position: [ox + dir.x, oy + dir.y, oz + dir.z],
      target: [ox, oy, oz],
      fov: opts.camera.fov,
    },
    autoScaled,
    bounds: {
      minX: ox - half.x,
      maxX: ox + half.x,
      minZ: oz - half.z,
      maxZ: oz + half.z,
    },
  };
}

/* ───────────────────────────── DUVAR SINIRI ───────────────────────────── */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Bir noktayı odanın DUVAR SINIRLARININ içine çeker (görünmez duvar
 * çarpışması). Oda merkezine göre YEREL X/Z bekler.
 *
 * `radius`: nesnenin yarıçapı (karakter 0.35). Böylece nesnenin MERKEZİ değil
 * GÖVDESİ duvara değer; oyuncu duvarın içine gömülmez ve odanın dışındaki
 * boşluğa düşemez (aşağı bakacak bir zemin yok).
 */
export function clampToRoom(
  point: { x: number; z: number },
  half: { x: number; z: number },
  radius = 0,
): { x: number; z: number } {
  const limitX = Math.max(0, half.x - radius);
  const limitZ = Math.max(0, half.z - radius);
  return {
    x: clamp(point.x, -limitX, limitX),
    z: clamp(point.z, -limitZ, limitZ),
  };
}

/** Dünya noktasını odanın YEREL uzayına çevirir (raycaster sonucu için). */
export function toRoomLocal(
  point: THREE.Vector3,
  plan: IsoRoomPlan,
): { x: number; z: number } {
  return { x: point.x - plan.origin[0], z: point.z - plan.origin[2] };
}
