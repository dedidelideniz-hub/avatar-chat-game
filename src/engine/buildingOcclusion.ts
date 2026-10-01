/**
 * KAMERA OCCLUSION — saf (React'siz) çekirdek.
 *
 * SORUN: izometrik kamerada oyuncu üst sokağa / binaların arkasına geçtiğinde
 * önündeki bina gövdesi karakteri tamamen kapatıyor.
 *
 * ÇÖZÜM (her kare):
 *   1. Kameradan karaktere doğru `THREE.Raycaster` ile ışın(lar) atılır
 *      (göğüs + baş yüksekliği).
 *   2. Işın, `BUILDING_TAG` ile işaretli bir bina grubunun mesh'lerinden birine
 *      çarpıyorsa o bina "görüşü kesiyor" sayılır.
 *   3. Kesilen binanın TÜM malzemeleri `lerp` ile 0.3 opaklığa çekilir;
 *      karakter binanın arkasından çıkınca yumuşakça 1.0'a döner.
 *
 * MALZEME İZOLASYONU: bina içinde paylaşılan malzemeler (`StreetDetail`'in
 * `MAT.*` önbelleği gibi) kurulumda BİNA BAŞINA klonlanır. Yoksa bir binayı
 * şeffaflaştırmak bütün binaların tentelerini/çatı detaylarını da (ve o
 * malzemeyi kullanan propları) birlikte şeffaflaştırırdı.
 *
 * MALİYET: ışın testinden önce bina başına tek "kaba küre" elemesi yapılır;
 * kesin (üçgen düzeyinde) test yalnızca aday binanın mesh'lerinde çalışır.
 * Binalar statik olduğu için küreler bir kez hesaplanır.
 *
 * Bu dosya bilerek React'ten bağımsız: matematiği `scripts/check-camera-occlusion.ts`
 * gerçek `three.js` nesneleriyle ölçer (React/@react-three/fiber gerekmez).
 */
import * as THREE from "three";
import { PLAYER_3D_HEIGHT } from "./constants";

/** Bina kök grubunu işaretleyen `userData` anahtarı. */
export const BUILDING_TAG = "building";

/**
 * `Building` kök grubuna verilecek `userData`. Tek nesne paylaşılır — üç.js
 * yalnızca okur, hiçbir yerde değiştirilmez.
 */
export const BUILDING_USER_DATA: Record<string, unknown> = { [BUILDING_TAG]: true };

/** Görüş kesildiğinde ulaşılan opaklık. */
export const OCCLUDED_OPACITY = 0.3;

/** Saniye başına hedefe yaklaşma oranı (yumuşak geçiş). */
const FADE_PER_SECOND = 8;

/** Bu farkın altına inince geçiş bitmiş sayılır (tam değere oturtulur). */
const EPSILON = 0.004;

/** Oyuncunun kendi gövdesine değmesin diye ışın bu kadar kısaltılır (birim). */
const RAY_INSET = 0.35;

/** Işın hedefleri: karakterin göğsü ve başı (ikisinden biri kapalıysa yeter). */
const RAY_TARGET_HEIGHTS = [PLAYER_3D_HEIGHT * 0.5, PLAYER_3D_HEIGHT * 0.9] as const;

/** Malzemenin karıştırma öncesi (tam opak) değeri — `userData`'da saklanır. */
const BASE_OPACITY_KEY = "__occlusionBaseOpacity";

/**
 * Şeffaflaştırılacak tek bir bina: mesh listesi, o binaya ÖZEL malzemeler ve
 * ışın testinden önce kullanılan kaba (bounding) küre.
 */
export interface BuildingOccluder {
  /** Binanın altındaki mesh'ler — kesin ışın testi bunlarda çalışır. */
  meshes: THREE.Object3D[];
  /** Binaya özel (izole edilmiş) malzemeler. */
  materials: THREE.Material[];
  /** Dünya uzayında kaba küre — hızlı eleme. */
  sphere: THREE.Sphere;
  /** Son ışın turunda görüşü kesiyor muydu? */
  occluded: boolean;
}

/**
 * Sahnedeki `BUILDING_TAG` işaretli binaları toplar, malzemelerini binaya özel
 * hâle getirir ve kaba kürelerini hesaplar. Sahne kurulduktan sonra BİR KEZ
 * çağrılır.
 */
export function collectBuildingOccluders(scene: THREE.Object3D): BuildingOccluder[] {
  const roots: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    if (obj.userData[BUILDING_TAG] === true) roots.push(obj);
  });
  // Küre hesabı dünya matrislerini gerektirir.
  scene.updateMatrixWorld(true);

  return roots.map(buildOccluder);
}

/**
 * TEK bir bina kökünden occluder üretir — malzemeleri o binaya özel klonlar
 * ve kaba küresini hesaplar.
 *
 * `collectBuildingOccluders` tüm sahneyi tarar; bu sürüm ise yalnızca verilen
 * grubu işler. Cadı dükkânı gibi TEK bir binanın, sahnedeki diğer binaları
 * etkilemeden saydamlaşabilmesi için ayrılmıştır (bkz. `WitchShop.tsx`).
 */
export function buildOccluder(root: THREE.Object3D): BuildingOccluder {
  const meshes: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) meshes.push(obj);
  });
  root.updateWorldMatrix(true, true);

  return {
    meshes,
    materials: isolateMaterials(root),
    sphere: new THREE.Box3().setFromObject(root).getBoundingSphere(new THREE.Sphere()),
    occluded: false,
  };
}

/**
 * Binadaki malzemeleri BİNA BAŞINA klonlar (görüntü ayarları birebir kopyalanır,
 * dokular paylaşılır) ve malzeme listesini döner. Aynı bina içinde paylaşılan
 * malzeme tek klonu paylaşmaya devam eder.
 */
function isolateMaterials(root: THREE.Object3D): THREE.Material[] {
  const clones = new Map<THREE.Material, THREE.Material>();

  const unique = (source: THREE.Material): THREE.Material => {
    let clone = clones.get(source);
    if (!clone) {
      clone = source.clone();
      // Klon yeniden kurulursa taban değer ilk hâlinde kalsın (0.3'e kilitlenmesin).
      const base = source.userData[BASE_OPACITY_KEY];
      clone.userData[BASE_OPACITY_KEY] =
        typeof base === "number" ? base : source.opacity;
      clones.set(source, clone);
    }
    return clone;
  };

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const material = mesh.material as THREE.Material | THREE.Material[];
    mesh.material = Array.isArray(material)
      ? material.map(unique)
      : unique(material);
  });

  return [...clones.values()];
}

/* ── kare başına çalışan tamponlar (ayırma yok) ─────────────── */

const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _target = new THREE.Vector3();
const _hits: THREE.Intersection[] = [];

/**
 * Opaklığı yazar ve şeffaflık bayrağını gerektiği gibi açar/kapatır.
 *
 * `transparent` bilerek yalnızca geçiş sırasında açılır: sürekli şeffaf
 * binalar alfa sıralamasına girer ve tabela/tente gibi üst üste binen
 * katmanlar karışır. three.js'te bu bayrak çalışma anında değiştiği için
 * `needsUpdate` gerekir (program önbelleği sayesinde ek shader derlemesi yok).
 */
function applyOpacity(material: THREE.Material, value: number): void {
  material.opacity = value;
  const transparent = value < 0.999;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
}

/**
 * Kameradan karaktere ışın atar ve hangi binaların görüşü kestiğini işaretler.
 * `occluded` bayrakları sıfırlanıp yeniden hesaplanır.
 */
export function castOcclusionRays(
  occluders: BuildingOccluder[],
  cameraPosition: THREE.Vector3,
  playerWorld: { x: number; z: number },
): void {
  for (const occluder of occluders) occluder.occluded = false;

  for (const height of RAY_TARGET_HEIGHTS) {
    _target.set(playerWorld.x, height, playerWorld.z);
    _dir.subVectors(_target, cameraPosition);
    const distance = _dir.length();
    if (distance < 1e-3) continue;
    _dir.divideScalar(distance);

    _ray.set(cameraPosition, _dir);
    _ray.near = 0;
    _ray.far = Math.max(0.01, distance - RAY_INSET);

    for (const occluder of occluders) {
      // Çoktan kesiliyorsa kesin testi tekrarlamaya gerek yok.
      if (occluder.occluded) continue;
      // Kaba eleme: ışın binanın küresine yaklaşmıyorsa üçgen testine girmeyiz.
      if (!_ray.ray.intersectsSphere(occluder.sphere)) continue;
      _hits.length = 0;
      _ray.intersectObjects(occluder.meshes, false, _hits);
      if (_hits.length > 0) occluder.occluded = true;
    }
  }
}

/** Opaklıkları hedefe doğru yumuşakça çeker (her kare, ışından bağımsız). */
export function fadeOccluders(occluders: BuildingOccluder[], dt: number): void {
  const k = Math.min(1, Math.max(0, dt) * FADE_PER_SECOND);

  for (const occluder of occluders) {
    const goal = occluder.occluded ? OCCLUDED_OPACITY : 1;
    for (const material of occluder.materials) {
      const base = material.userData[BASE_OPACITY_KEY];
      const wanted = goal * (typeof base === "number" ? base : 1);
      const current = material.opacity;
      if (Math.abs(wanted - current) <= EPSILON) {
        if (current !== wanted) applyOpacity(material, wanted);
        continue;
      }
      applyOpacity(material, current + (wanted - current) * k);
    }
  }
}

/**
 * Işın atar (isteğe bağlı) ve opaklıkları günceller. Mobilde ışın iki karede
 * bir atılır (`castRays` false) ama geçiş her karede akıcı kalır.
 */
export function updateCameraOcclusion(
  occluders: BuildingOccluder[],
  cameraPosition: THREE.Vector3,
  playerWorld: { x: number; z: number },
  dt: number,
  castRays = true,
): void {
  if (castRays) castOcclusionRays(occluders, cameraPosition, playerWorld);
  fadeOccluders(occluders, dt);
}

/** Tüm binaları tam opak hâle döndürür (sahne kapanırken temizlik). */
export function resetOccluders(occluders: BuildingOccluder[]): void {
  for (const occluder of occluders) {
    occluder.occluded = false;
    for (const material of occluder.materials) {
      const base = material.userData[BASE_OPACITY_KEY];
      applyOpacity(material, typeof base === "number" ? base : 1);
    }
  }
}
