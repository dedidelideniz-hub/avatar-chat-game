/**
 * GLB ÇİM ZEMİNİ HAZIRLIĞI — React'ten bağımsız saf mantık.
 *
 * `public/models/grass_ground.glb` (depoya eklenen "simple grass ground" modeli)
 * tek bir düz zemindir: **4×4 birim, y=0, normal +Y, UV 0…1**. Bu yüzden
 * zemini büyütmek yerine KARO olarak döşenir: model kendi boyutu kadar
 * (4 birim) adımlarla yan yana dizilir, böylece kenarlar tam uç uca gelir.
 *
 * Zincir: `GrassGround.tsx` modeli `useGLTF` ile yükler, buradaki
 * `prepareGrassGround()` karonun boyutunu ÖLÇER (model uzayına güvenilmez:
 * GLB'de node matrisleri var, ölçülen kutu 4×4) ve `buildGrassGroundPlacements()`
 * döşeme ızgarasını üretir. Ayrımın sebebi: ölçüm ve döşeme matematiği
 * hook olmadan da çalıştırılıp gerçek dosyayla doğrulanabilir
 * (bkz. `scripts/check-grass-ground.ts`).
 */
import * as THREE from "three";
import { mergeGeometries } from "./vegModelPrep";

export const GRASS_GROUND_URL = "/models/grass_ground.glb";

/**
 * ÇİM ZEMİN GÖRÜNÜM AYARLARI — hepsi tek yerde, sayılar ölçüme dayanıyor.
 *
 * Neden bu değerler (gerçek dokular ölçüldü, `scripts/check-grass-ground.ts`):
 *   · basecolor dokusunun ortalama parlaklığı **61/255** (sRGB) → doku koyu
 *     çekilmiş; düz `color = #7EC850` vermek işe YARAMAZ, çünkü `color`
 *     dokunun rengiyle ÇARPILIR (0…1 arası bir ton dokuyu koyulaştırır).
 *     Bu yüzden renk 1'in ÜSTÜNE çıkarılıp (three `Color` kanalları 1'i
 *     aşabilir) doku açılır: `tint × brightness`.
 *   · AO haritası ortalama **131/255** → dolaylı ışığı ~yarıya indiriyordu
 *     (sahne ışığının yarısı ambient + hemisphere olduğu için "kasvet"in ana
 *     sebebi). Düz bir zeminde AO gereksiz → kapatıldı.
 *   · roughness/metalness haritaları da kapatılır ki aşağıdaki 0.8 / 0.1
 *     değerleri haritayla çarpılıp bozulmasın.
 */
export const GRASS_GROUND_TUNING = {
  /** Doku çarpanı: 1'den büyük = daha açık (1.7 ≈ %70 açma, lineer uzayda). */
  brightness: 1.7,
  /** Yeşile hafif kaydırma (canlılık): kırmızı/mavi biraz kısılır. */
  tint: { r: 0.96, g: 1.08, b: 0.86 },
  /** Çok hafif kendinden aydınlatma — gölgede kalan çim siyaha düşmesin. */
  emissive: { r: 0.03, g: 0.07, b: 0.02 },
  emissiveIntensity: 1,
  /** İstenen yüzey ayarları (haritalar kapatıldığı için aynen geçerli). */
  roughness: 0.8,
  metalness: 0.1,
  /** Normal haritası detay katar, karartmaz → açık kalır. */
  useNormalMap: true,
  /** AO + ORM yuvaları kapatılır (yukarıdaki ölçüm notu). */
  useAmbientOcclusion: false,
} as const;

export interface GrassGroundZone {
  /** Bölge merkezi (X, Z). */
  x: number;
  z: number;
  /** Genişlik (X) — döşeme bu genişliği boşluksuz kaplar. */
  w: number;
  /** Derinlik (Z). */
  d: number;
  /** Zeminin Y seviyesi (taban buraya oturur). */
  y: number;
}

export interface GrassGroundPlacement {
  x: number;
  y: number;
  z: number;
}

export interface GrassGroundTile {
  /** XZ merkezine ve taban y=0'a getirilmiş, birleştirilmiş karo geometrisi. */
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Karonun dünya boyutu — komşu karo TAM bu adımla dizilir (seamless). */
  size: { x: number; z: number };
  /** Bu çağrıda oluşturulan, sökülürken bırakılacak kaynaklar. */
  owned: (THREE.BufferGeometry | THREE.Material)[];
  report: {
    sourceMeshes: number;
    triangles: number;
    /** Ham (ölçülen) kutu. */
    rawSize: THREE.Vector3;
    /** Taban y=0'a alındıktan sonraki yüzey yüksekliği (düz zeminde 0). */
    thickness: number;
    /** Ortalama world normali yukarı mı bakıyordu? */
    normalUp: boolean;
    /** Ters bakıyordu da 180° X ile düzeltildi mi? */
    normalFix: boolean;
    /** Uygulanan görünüm ayarları (koyu dokuyu açan çarpan dahil). */
    look: {
      brightness: number;
      tint: { r: number; g: number; b: number };
      emissive: { r: number; g: number; b: number };
      roughness: number;
      metalness: number;
    };
    /** `color` çarpanı 1'in üstüne çıkarıldı mı (doku açıldı mı). */
    brightened: boolean;
    /** Görünüm/zahmet için kapatılan doku yuvaları. */
    droppedMaps: string[];
    /** Materyalde kalan doku yuvaları. */
    maps: string[];
  };
}

/** Geometrinin ortalama world normalinin Y bileşeni (yüzey yönü). */
function averageNormalY(geometry: THREE.BufferGeometry): number {
  const normal = geometry.getAttribute("normal");
  if (!normal) return 1;
  let sum = 0;
  for (let i = 0; i < normal.count; i++) sum += normal.getY(i);
  return sum / normal.count;
}

function mapSlots(material: THREE.MeshStandardMaterial): string[] {
  const slots: [string, THREE.Texture | null][] = [
    ["map", material.map ?? null],
    ["normalMap", material.normalMap ?? null],
    ["aoMap", material.aoMap ?? null],
    ["metalnessMap", material.metalnessMap ?? null],
    ["roughnessMap", material.roughnessMap ?? null],
  ];
  return slots.filter(([, texture]) => texture != null).map(([name]) => name);
}

/**
 * Modeli karo hâline getirir: tüm mesh'ler tek geometride birleşir, yüzey
 * yukarı bakar, taban y=0 / XZ merkez orijin olur. Dönen `size` döşeme adımıdır.
 */
export function prepareGrassGround(scene: THREE.Object3D): GrassGroundTile {
  const root = scene.clone(true);
  root.updateMatrixWorld(true);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  let sourceMeshes = 0;

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    sourceMeshes++;
    const geometry = mesh.geometry.clone();
    // glTF dönüşümleri node'larda durur; instancing düz geometri ister.
    geometry.applyMatrix4(mesh.matrixWorld);
    geometries.push(geometry);
    materials.push(
      (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material,
    );
  });

  const sourceMaterial = materials[0];
  if (geometries.length === 0 || !sourceMaterial) {
    throw new Error(`${GRASS_GROUND_URL}: zemini oluşturacak mesh bulunamadı`);
  }

  const geometry = mergeGeometries(geometries);
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const rawBox = geometry.boundingBox as THREE.Box3;

  // Yön ÖLÇÜLEREK düzeltilir: zemin +Y'ye bakmıyorsa 180° X döndürülür.
  // Düz bir zeminde bu işlem karonun yerini değiştirmez (y=0 düzlemi kendine
  // eşlenir), yalnızca normalleri ve üçgen sarımını yukarı çevirir.
  const normalY = averageNormalY(geometry);
  const normalFix = normalY < 0;
  if (normalFix) geometry.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI));

  geometry.computeBoundingBox();
  const box = geometry.boundingBox as THREE.Box3;
  const size = new THREE.Vector3().subVectors(box.max, box.min);
  const centerX = (box.min.x + box.max.x) / 2;
  const centerZ = (box.min.z + box.max.z) / 2;
  // Taban y=0, XZ merkez orijin → komşu karo `size.x` / `size.z` adımla uç uca.
  geometry.translate(-centerX, -box.min.y, -centerZ);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = sourceMaterial.clone() as THREE.MeshStandardMaterial;
  const tuning = GRASS_GROUND_TUNING;

  // Önce hangi yuvalar kapatılıyor (AO dolaylı ışığı ~yarıya indiriyordu;
  // ORM yuvaları da istenen roughness/metalness değerlerini çarpıp bozardı).
  const droppedMaps: string[] = [];
  if (!tuning.useAmbientOcclusion && material.aoMap) {
    material.aoMap = null;
    droppedMaps.push("aoMap");
  }
  if (material.metalnessMap) {
    material.metalnessMap = null;
    droppedMaps.push("metalnessMap");
  }
  if (material.roughnessMap) {
    material.roughnessMap = null;
    droppedMaps.push("roughnessMap");
  }
  if (!tuning.useNormalMap && material.normalMap) {
    material.normalMap = null;
    droppedMaps.push("normalMap");
  }

  // Yüzey: glTF varsayılanı `metallicFactor = 1`; çim metal değildir.
  material.roughness = tuning.roughness;
  material.metalness = tuning.metalness;

  // Doku ÇOK koyu (ort. 61/255) → rengi çarpanla aç. `color` dokunun rengiyle
  // çarpıldığı için 1'in üstüne çıkılır (three `Color` kanalları 1'i aşabilir);
  // `#7EC850` gibi 0…1 arası bir ton vermek dokuyu daha da koyulaştırırdı.
  material.color.setRGB(tuning.tint.r, tuning.tint.g, tuning.tint.b);
  material.color.multiplyScalar(tuning.brightness);
  material.emissive.setRGB(tuning.emissive.r, tuning.emissive.g, tuning.emissive.b);
  material.emissiveIntensity = tuning.emissiveIntensity;
  material.side = THREE.DoubleSide;
  material.needsUpdate = true;

  const index = geometry.getIndex();
  const triangles = Math.round(
    (index ? index.count : geometry.getAttribute("position").count) / 3,
  );

  return {
    geometry,
    material,
    size: { x: size.x, z: size.z },
    owned: [geometry, material],
    report: {
      sourceMeshes,
      triangles,
      rawSize: new THREE.Vector3().subVectors(rawBox.max, rawBox.min),
      thickness: size.y,
      normalUp: !normalFix,
      normalFix,
      look: {
        brightness: tuning.brightness,
        tint: tuning.tint,
        emissive: tuning.emissive,
        roughness: tuning.roughness,
        metalness: tuning.metalness,
      },
      brightened: tuning.brightness > 1,
      droppedMaps,
      maps: mapSlots(material),
    },
  };
}

/**
 * Döşeme ızgarası: her bölge, karo boyutunun TAM katlarıyla doldurulur
 * (`Math.ceil`) ve ızgara bölge merkezine hizalanır → hiçbir yerde boşluk
 * kalmaz, komşu karolar tam uç uca gelir (adım = karo boyu).
 */
export function buildGrassGroundPlacements(
  tile: GrassGroundTile,
  zones: readonly GrassGroundZone[],
): {
  placements: GrassGroundPlacement[];
  zones: { cols: number; rows: number; coverageX: number; coverageZ: number }[];
} {
  const stepX = tile.size.x;
  const stepZ = tile.size.z;
  const placements: GrassGroundPlacement[] = [];
  const reports: { cols: number; rows: number; coverageX: number; coverageZ: number }[] = [];

  for (const zone of zones) {
    const cols = Math.max(1, Math.ceil(zone.w / stepX));
    const rows = Math.max(1, Math.ceil(zone.d / stepZ));
    const coverageX = cols * stepX;
    const coverageZ = rows * stepZ;
    const startX = zone.x - coverageX / 2 + stepX / 2;
    const startZ = zone.z - coverageZ / 2 + stepZ / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        placements.push({ x: startX + c * stepX, y: zone.y, z: startZ + r * stepZ });
      }
    }
    reports.push({ cols, rows, coverageX, coverageZ });
  }

  return { placements, zones: reports };
}
