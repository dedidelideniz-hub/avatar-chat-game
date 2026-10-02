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

/* ──────────────── İÇ MEKÂN KESİTİ (Sanalika/Habbo tarzı) ────────────────
 * Oda modelleri çoğu zaman KAPALI bir kutudur: zemin + tavan + dört duvar
 * (ve duvarlar binanın TÜM gövdesi kadar yüksek olabilir). Kamera dışarıda
 * kalırsa oyuncu odanın içini değil, binanın DIŞINI görür — kutunun üstü,
 * dış duvarlar, pencere. "Evine gir" ekranı bir İÇ MEKÂN olmalıdır; bu yüzden
 * model geometriden okunup bir KESİT alınır:
 *   · TAVAN gizlenir (kamera içeri bakar),
 *   · kameraya BAKAN iki duvar gizlenir (Habbo/Sanalika'daki kesit görünümü),
 *   · duvarların oda dışına taşan gövdesi dikey KIRPMA ile odanın yüksekliğine
 *     indirilir (bkz. `RoomStage`).
 * Hiçbir isim varsayılmaz: parçalar geometriden sınıflandırılır (bir düzlemin
 * en ince ekseni yüzey normalidir). Adlar jenerik olsa da ("Plane.041") çalışır.
 */

/** Modeldeki her mesh'in dünya kutusu + "ince" (normal) ekseni. */
interface RoomPart {
  mesh: THREE.Mesh;
  box: THREE.Box3;
  size: THREE.Vector3;
  center: THREE.Vector3;
  /** En küçük ölçü ekseni = yüzey normali (düzlemsi parçalar için). */
  thin: "x" | "y" | "z";
}

/** Bir parçanın DUVAR sayılması için düzlemsilik sınırı (ince / en büyük). */
const FLAT_MAX_RATIO = 0.25;

/**
 * Parçaları MODEL UZAYINDA ölçer (sahnenin bağlı olduğu ebeveynden bağımsız).
 *
 * NEDEN `setFromObject` DEĞİL: sahne R3F grubuna bağlandığında dünya
 * matrisleri odanın origin'ini (X/Z 2000) içerir; o zaman ölçüm de 2000 kayar
 * ve plan yanlış yere oturur. Burada yerel matrisler kökten aşağı çarpılır:
 * sonuç, `<primitive>`in grubunun YEREL uzayıdır — `plan.offset`in uygulandığı
 * uzayın ta kendisi.
 */
function collectRoomParts(root: THREE.Object3D): RoomPart[] {
  const parts: RoomPart[] = [];
  const walk = (obj: THREE.Object3D, parent: THREE.Matrix4) => {
    obj.updateMatrix();
    const local = new THREE.Matrix4().multiplyMatrices(parent, obj.matrix);
    const mesh = obj as THREE.Mesh;
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    if (mesh.isMesh && geometry) {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (bounds) {
        const box = bounds.clone().applyMatrix4(local);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        let thin: "x" | "y" | "z" = "y";
        let best = size.y;
        (["x", "z"] as const).forEach((axis) => {
          if (size[axis] < best) {
            best = size[axis];
            thin = axis;
          }
        });
        parts.push({ mesh, box, size, center, thin });
      }
    }
    for (const child of obj.children) walk(child, local);
  };
  walk(root, new THREE.Matrix4());
  return parts;
}

/** Kameraya bakan kesitte gizlenecek bir duvar (ve üstündeki süpürgelik/kapı). */
export interface RoomWall {
  mesh: THREE.Mesh;
  /** Duvar normalinin ekseni (ince eksen). */
  thin: "x" | "z";
  /** Duvarın ince eksendeki konumu (duvar düzlemi). */
  at: number;
  /** Model uzayındaki kutusu — kapı tespiti bunu ölçer (bkz. `findRoomDoor`). */
  box: THREE.Box3;
  /** Model uzayındaki ölçüsü. */
  size: THREE.Vector3;
  /** Model uzayındaki merkezi. */
  center: THREE.Vector3;
}

/** Modelin yüzeyleri — kesit ve iç-hacim planı bunlardan türer. */
export interface RoomSurfaces {
  /** Modelin TAMAMI (tavan/duvarlar dahil). */
  box: THREE.Box3;
  /** En geniş yatay parça = ZEMİN. */
  floor: THREE.Mesh | null;
  floorBox: THREE.Box3 | null;
  /** Zeminden belirgin yükseklikteki en üst yatay parça = TAVAN. */
  ceiling: THREE.Mesh | null;
  ceilingBox: THREE.Box3 | null;
  /** Dikey, düzlemsi parçalar = DUVARLAR ve üstündeki detaylar. */
  walls: RoomWall[];
}

/**
 * Modeli zemin/tavan/duvar olarak sınıflandırır (isim varsayımı YOK).
 *
 * ZEMİN: en geniş YATAY parça. TAVAN: zeminden belirgin yükseklikteki en üst
 * yatay parça. DUVARLAR: dikey ve düzlemsi (ince) parçalar — süpürgelik, kapı
 * ve pencere panelleri de duvara bağlı sayılsın diye ölçü sınırı gevşektir.
 */
export function analyzeRoomSurfaces(scene: THREE.Object3D): RoomSurfaces | null {
  if (!(scene as THREE.Object3D)?.isObject3D) return null;
  const parts = collectRoomParts(scene);
  if (parts.length === 0) return null;

  const box = new THREE.Box3();
  for (const part of parts) box.union(part.box);

  const horizontals = parts.filter((part) => part.thin === "y");
  // ZEMİN: en geniş yatay parça. Eşitlikte (zemin ve tavan aynı ayak izine
  // sahip olabilir) en ALTTAKİ seçilir — yoksa tavan zemin sanılırdı.
  const floorPart =
    [...horizontals].sort(
      (a, b) =>
        footprint(b.box) - footprint(a.box) || a.center.y - b.center.y,
    )[0] ?? null;

  const ceilingFloorY = floorPart?.box.max.y ?? box.min.y;
  const ceilingThreshold =
    ceilingFloorY + Math.max(0.5, (box.max.y - box.min.y) * 0.15);
  const ceilingPart =
    horizontals
      .filter((part) => part.center.y >= ceilingThreshold)
      .sort((a, b) => b.center.y - a.center.y)[0] ?? null;

  const walls: RoomWall[] = [];
  for (const part of parts) {
    if (part.thin === "y") continue;
    const flat =
      Math.min(part.size.x, part.size.y, part.size.z) /
      Math.max(part.size.x, part.size.y, part.size.z, 1e-6);
    if (flat > FLAT_MAX_RATIO) continue;
    walls.push({
      mesh: part.mesh,
      thin: part.thin,
      at: part.thin === "x" ? part.center.x : part.center.z,
      box: part.box,
      size: part.size,
      center: part.center,
    });
  }

  return {
    box,
    floor: floorPart?.mesh ?? null,
    floorBox: floorPart?.box ?? null,
    ceiling: ceilingPart?.mesh ?? null,
    ceilingBox: ceilingPart?.box ?? null,
    walls,
  };
}

/**
 * Odanın İÇ hacmi: zeminin ayak izi + zemin ile tavan arası.
 *
 * `planIsoRoom`a bu kutu verilir; böylece taban y 0'a oturur (karakter zemine
 * basar) ve oda yüksekliği TAVAN yüksekliği olur — binanın 8 birimlik gövdesi
 * değil. Tavan yoksa `fallbackHeight` kadar bir iç hacim varsayılır.
 */
export function roomInteriorBox(
  surfaces: RoomSurfaces,
  fallbackHeight = 3,
): THREE.Box3 {
  const ref = surfaces.floorBox ?? surfaces.box;
  const floorY = surfaces.floorBox ? surfaces.floorBox.max.y : surfaces.box.min.y;
  const ceilingY = surfaces.ceilingBox
    ? Math.max(surfaces.ceilingBox.min.y, floorY + 0.5)
    : Math.min(surfaces.box.max.y, floorY + fallbackHeight);
  return new THREE.Box3(
    new THREE.Vector3(ref.min.x, floorY, ref.min.z),
    new THREE.Vector3(ref.max.x, ceilingY, ref.max.z),
  );
}

/**
 * İÇ MEKÂN KESİTİ — tavanı ve kameraya BAKAN duvarları gizler.
 *
 * `cameraDir`, odanın merkezinden kameraya bakan YATAY yöndür
 * (`ROOM_ISO.camera.offset`). Kamera +X+Z'deyse o taraftaki duvarlar gizlenir;
 * oyuncu kesik köşeden içeri bakar (Habbo/Sanalika).
 *
 * Önce BÜTÜN parçalar görünür yapılır: model `useGLTF` ile önbellekte
 * paylaşıldığı için önceki gizlemeler kalıcı olabilir; kesit her kurulumda
 * baştan uygulanır.
 */
export function cutRoomForInterior(
  scene: THREE.Object3D,
  cameraDir: { x: number; z: number },
): { ceilingHidden: boolean; wallsHidden: number } {
  const surfaces = analyzeRoomSurfaces(scene);
  if (!surfaces) return { ceilingHidden: false, wallsHidden: 0 };

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) mesh.visible = true;
  });

  const centerX = (surfaces.box.min.x + surfaces.box.max.x) / 2;
  const centerZ = (surfaces.box.min.z + surfaces.box.max.z) / 2;
  let wallsHidden = 0;
  for (const wall of surfaces.walls) {
    const near =
      wall.thin === "x"
        ? cameraDir.x > 0
          ? wall.at > centerX
          : wall.at < centerX
        : cameraDir.z > 0
          ? wall.at > centerZ
          : wall.at < centerZ;
    if (near) {
      wall.mesh.visible = false;
      wallsHidden += 1;
    }
  }
  if (surfaces.ceiling) surfaces.ceiling.visible = false;
  return { ceilingHidden: !!surfaces.ceiling, wallsHidden };
}

/* ─────────────────────────── KAPI (EŞİK) ───────────────────────────
 * Karakter odaya KAPIDAN girer: evin kapısına basıp içeri geçen oyuncu,
 * karakterini odanın eşiğinde bulur ve oradan yürümeye başlar.
 *
 * KAPI NEDEN GEOMETRİDEN BULUNUR: oda modelinin parçaları jenerik adlar taşır
 * (`empty_office_space.glb` → "Plane.043"). Ada bakmak güvenilir değildir; kapı
 * bir KANAT/PANELDİR ve ölçüsüyle ayırt edilir: duvar düzleminde durur, odanın
 * açıklığından KÜÇÜKTÜR, zeminden başlar ve insan boyunu aşar. Duvar (odanın
 * tamamı kadar) bu ölçülerin dışında kalır, süpürgelik (0,2 yüksek) de öyle.
 *
 * Kapı önce KESİTTE GÖRÜNEN tarafta aranır: kamera tarafındaki duvarlar
 * gizlendiği için (`cutRoomForInterior`) oradaki kapı da görünmez olurdu —
 * karakter görünmeyen bir kapıdan doğmamalı.
 */

/** Kapı olma ihtimali yüksek adlar (model adlandırmışsa ölçümden önce gelir). */
const DOOR_NAME = /door|kap[ıi]|portal|entrance|giri[sş]/i;
/** Kapı panelinin en büyük genişliği — odanın açıklığına ORANI. */
const DOOR_MAX_SPAN = 0.5;
/** Kapının en küçük yüksekliği (birim) — insan boyunda bir açıklık. */
const DOOR_MIN_HEIGHT = 1.2;
/** Kapı yüksekliğinin oda yüksekliğine oranı: bundan yükseği duvardır. */
const DOOR_MAX_HEIGHT_RATIO = 0.85;
/** Kapının zemine oturmuş sayılması için bırakılan yükseklik payı (birim). */
const DOOR_FLOOR_SLACK = 0.45;

/** Kapı noktası (MODEL uzayı) — `roomEntryPoint` bunu odanın yereline çevirir. */
export interface RoomDoor {
  x: number;
  y: number;
  z: number;
}

/**
 * Odanın KAPISINI bulur (model uzayında); bulamazsa `null` döner ve çağıran
 * taraf odayı kesitin açıldığı ön kenardan girer (oyuncu yine eşikte durur).
 *
 * @param cameraDir Odanın merkezinden kameraya bakan YATAY yön. Kesit bu
 *   taraftaki duvarları gizlediği için kapı önce KARŞI tarafta aranır.
 */
export function findRoomDoor(
  surfaces: RoomSurfaces | null,
  cameraDir: { x: number; z: number },
): RoomDoor | null {
  if (!surfaces) return null;

  const interior = roomInteriorBox(surfaces);
  const floorY = interior.min.y;
  const span = Math.max(
    interior.max.x - interior.min.x,
    interior.max.z - interior.min.z,
  );
  const height = Math.max(0.5, interior.max.y - interior.min.y);
  const centerX = (interior.min.x + interior.max.x) / 2;
  const centerZ = (interior.min.z + interior.max.z) / 2;

  /** `cutRoomForInterior` ile AYNI kural: bu duvar kesitte gizlenir mi? */
  const nearCamera = (wall: RoomWall) =>
    wall.thin === "x"
      ? cameraDir.x > 0
        ? wall.at > centerX
        : wall.at < centerX
      : cameraDir.z > 0
        ? wall.at > centerZ
        : wall.at < centerZ;

  const candidates = surfaces.walls.filter((wall) => {
    const width = wall.thin === "x" ? wall.size.z : wall.size.x;
    return (
      width >= 0.5 &&
      width <= span * DOOR_MAX_SPAN &&
      wall.size.y >= DOOR_MIN_HEIGHT &&
      wall.size.y <= height * DOOR_MAX_HEIGHT_RATIO &&
      wall.box.min.y <= floorY + DOOR_FLOOR_SLACK
    );
  });
  if (candidates.length === 0) return null;

  /** Adı kapıyı söyleyen kazanır; sonra GÖRÜNEN taraf, sonra büyük kanat. */
  const score = (wall: RoomWall) => {
    const named = DOOR_NAME.test(wall.mesh.name ?? "") ? 1 : 0;
    const visible = nearCamera(wall) ? 0 : 1;
    const size =
      wall.size.y + (wall.thin === "x" ? wall.size.z : wall.size.x);
    return named * 1000 + visible * 100 + size;
  };
  const best = [...candidates].sort((a, b) => score(b) - score(a))[0];
  return { x: best.center.x, y: floorY, z: best.center.z };
}

/**
 * Kapıyı KARAKTERİN DOĞUŞ NOKTASINA çevirir: odanın YEREL uzayı (merkez = 0,
 * y 0 = zemin) ve duvardan `standoff` kadar İÇERİ — karakter kapının içinde,
 * duvara gömülü değil, eşikte durur.
 *
 * Kapı yoksa oda KESİTİN açıldığı ön kenardan girilir (kameranın baktığı
 * kenar): oyuncu yine odanın eşiğinde başlar, ortasında değil.
 */
export function roomEntryPoint(
  door: RoomDoor | null,
  plan: IsoRoomPlan,
  standoff: number,
): { x: number; z: number } {
  const local = door
    ? {
        x: door.x * plan.scale + plan.offset.x,
        z: door.z * plan.scale + plan.offset.z,
      }
    : { x: 0, z: plan.half.z };
  return clampToRoom(local, plan.half, standoff);
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
    /**
     * Mesafe çarpanı (varsayılan 1). İç mekân kesitinde kamera odaya biraz
     * yaklaşsın diye 1'den KÜÇÜK verilir; spec mesafesi alt sınır kalır ve
     * `fitDistance` odayı yine çerçevede tutar.
     */
    readonly distanceScale?: number;
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
  const distance = Math.max(
    specDistance * (opts.camera.distanceScale ?? 1),
    fitDistance,
  );
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
