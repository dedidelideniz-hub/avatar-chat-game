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
    /** metalness 0'a çekildi mi (FBX→glTF dönüşümü 1 bırakıyor). */
    metalnessFixed: boolean;
    /** Materyalde bulunan doku yuvaları. */
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
  // Çim metal değildir; glTF varsayılanı `metallicFactor = 1` olduğu için
  // düzeltilmezse zemin koyu/metalik görünür.
  const metalnessFixed = typeof material.metalness === "number" && material.metalness !== 0;
  if (typeof material.metalness === "number") material.metalness = 0;
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
      metalnessFixed,
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
