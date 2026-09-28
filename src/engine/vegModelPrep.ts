/**
 * GLB bitki örtüsü HAZIRLIĞI — React'ten bağımsız saf mantık.
 *
 * `VegetationModels.tsx` modelleri `useGLTF` ile yükler ve buradaki
 * `prepareVegetationModel()` çağırır. Ayrımın sebebi: bu dönüşüm (birleştirme,
 * yön tespiti, normalizasyon) hook olmadan da çalıştırılıp ölçülebilir —
 * doğrulama script'i gerçek model dosyasıyla bunu test eder.
 *
 * Yaptığı iş, sırayla:
 *   1. `skipMaterial` ile eşleşen zemin/çim kartlarını atar (ayrıca "yer"
 *      referansı olarak ölçer),
 *   2. her mesh'in DÜNYA matrisini kopyalanan geometriye gömer (glTF'te
 *      dönüşümler node'larda durur; instancing düz geometri ister),
 *   3. yönü ÖLÇER: ağaç zeminden uzağa büyür; geometri ağırlıklı olarak
 *      aşağıya uzanıyorsa 180° X düzeltmesi uygular,
 *   4. tabanı "yer" seviyesine, XZ merkezini orijine alır ve boyu 1 birime
 *      ölçekler → sahne tarafı sadece "kaç birim boyunda duracak" der,
 *   5. aynı malzemeye ait tüm mesh'leri TEK geometride birleştirir (draw call).
 */
import * as THREE from "three";

export interface VegModelConfig {
  url: string;
  /**
   * Bu malzemeler HİÇ yerleştirilmez. Model bir "sahne" olarak geldiğinde
   * içindeki zemin/çim kartlarını ayıklar: `maple_tree.glb` 240×240'lık çim
   * zemini + 84×84'lük groundcover kartı taşıyor; bunlar dursa her ağacın
   * dibine caddeyi kaplayan bir zemin yaması basardı.
   */
  skipMaterial?: RegExp;
  /**
   * Tek yüzlü KART parçalar (yaprak kareleri). Çift yüz çizilir (GLB'de
   * `doubleSided` yok) ve gölge çizmez — şeffaflığı olmayan kartlar yere
   * dikdörtgen gölge basardı.
   */
  cardMaterial?: RegExp;
  /** Kart parçaların emissive çarpanı (GLB'de yaprak 0.55 — gün ışığında parlar). */
  cardEmissive?: number;
}

/* ═══════════════════════════════════════════════════════════ */
/*  Model tanımları                                             */
/* ═══════════════════════════════════════════════════════════ */

export const TREE_MODEL_URL = "/models/maple_tree.glb";
export const BUSH_MODEL_URL = "/models/bush.glb";
export const GRASS_CLUMP_MODEL_URL = "/models/grass_clump.glb";

/**
 * Sokak ağacı — depoya eklenen akçaağaç (Sketchfab "Maple tree", CC-BY-4.0).
 *
 * Ölçüm (gerçek vertex verisinden, bkz. `public/ASSETS.md`):
 *   · gövde/taç 214×312×219 birim, y ≈ -310 → +2.5 (yani model **-Y'ye** büyür),
 *   · zemin kartları y ≈ 0 düzleminde (240×240 çim, 84×84 groundcover),
 *   · 2070 mesh / 26 329 vertex / ~12 500 üçgen, 4 malzeme, 8 doku.
 * Yön ve boy VARSAYILMAZ, yükleme anında ölçülür — bu sayılar değişse de kod
 * doğru çalışır.
 */
export const TREE_MODEL_CONFIG: VegModelConfig = {
  url: TREE_MODEL_URL,
  skipMaterial: /groundcover|grass|ground|terrain/i,
  cardMaterial: /leaf|foliage|card/i,
  cardEmissive: 0.3,
};

/** Çalı — ağaç/çim ile aynı stilde üretilen low-poly model. */
export const BUSH_MODEL_CONFIG: VegModelConfig = { url: BUSH_MODEL_URL };

/** Çim öbeği — üretilen low-poly model. */
export const GRASS_MODEL_CONFIG: VegModelConfig = { url: GRASS_CLUMP_MODEL_URL };

/** Modelden çıkarılmış, normalize edilmiş tek parça (malzeme başına bir tane). */
export interface ModelPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Malzeme adı — aynı zamanda React `key`'i. */
  key: string;
  /** Kart yaprak mı (gölge çizmez). */
  card: boolean;
}

export interface PreparedModel {
  parts: ModelPart[];
  /** Bu çağrıda oluşturulan, sökülürken bırakılacak geometri/materyaller. */
  owned: (THREE.BufferGeometry | THREE.Material)[];
  /** Teşhis için ölçüm özeti. */
  report: {
    sourceMeshes: number;
    drawCalls: number;
    rawSize: THREE.Vector3;
    flipped: boolean;
    height: number;
  };
}

/* ═══════════════════════════════════════════════════════════ */
/*  Geometri birleştirme                                        */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Aynı malzemeye ait N geometriyi TEK geometriye birleştirir ve kaynakları
 * bırakır.
 *
 * Neden şart: `maple_tree.glb` 2070 ayrı mesh'ten oluşuyor (her yaprak kartı
 * ayrı bir node). Birleştirilmezse malzeme başına 2070 `InstancedMesh`, yani
 * 2070 draw call olurdu; birleştirince ağaç 2 draw call'a iner.
 *
 * Yalnızca TÜM parçalarda bulunan öznitelikler taşınır — yapraklarda fazladan
 * `TEXCOORD_1` var, malzeme onu kullanmadığı için düşürülür. İndeks 32 bit
 * (tek parça 65k vertex'i geçse bile güvenli).
 */
export function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geometries.length === 1) {
    const only = geometries[0];
    only.computeBoundingBox();
    only.computeBoundingSphere();
    return only;
  }

  const attributes = ["position", "normal", "uv"].filter((name) =>
    geometries.every((geo) => geo.getAttribute(name) != null),
  );

  const merged = new THREE.BufferGeometry();

  for (const name of attributes) {
    const itemSize = geometries[0].getAttribute(name).itemSize;
    const total = geometries.reduce((sum, geo) => sum + geo.getAttribute(name).count, 0);
    const target = new Float32Array(total * itemSize);
    let offset = 0;
    for (const geo of geometries) {
      const source = geo.getAttribute(name).array as Float32Array;
      target.set(source, offset);
      offset += source.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(target, itemSize));
  }

  let indexTotal = 0;
  for (const geo of geometries) {
    indexTotal += geo.getIndex()?.count ?? geo.getAttribute("position").count;
  }
  const indices = new Uint32Array(indexTotal);
  let cursor = 0;
  let vertexBase = 0;
  for (const geo of geometries) {
    const index = geo.getIndex();
    const count = index?.count ?? geo.getAttribute("position").count;
    for (let i = 0; i < count; i++) {
      indices[cursor + i] = (index ? index.getX(i) : i) + vertexBase;
    }
    cursor += count;
    vertexBase += geo.getAttribute("position").count;
  }
  merged.setIndex(new THREE.BufferAttribute(indices, 1));

  merged.computeBoundingBox();
  merged.computeBoundingSphere();

  for (const geo of geometries) geo.dispose();

  return merged;
}

/* ═══════════════════════════════════════════════════════════ */
/*  Model hazırlığı                                             */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Yüklenmiş bir GLB sahnesini yerleştirilebilir parçalara çevirir.
 * Girdi sahnesi DEĞİŞTİRİLMEZ (drei önbelleğinde paylaşılır) — kopyası
 * üzerinde çalışılır.
 */
export function prepareVegetationModel(
  scene: THREE.Object3D,
  cfg: VegModelConfig,
): PreparedModel {
  const root = scene.clone(true);
  root.updateMatrixWorld(true);

  const keptBox = new THREE.Box3().makeEmpty();
  const groundBox = new THREE.Box3().makeEmpty();
  const buckets = new Map<
    string,
    { material: THREE.Material; geometries: THREE.BufferGeometry[] }
  >();
  let sourceMeshes = 0;

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    sourceMeshes++;

    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const name = material?.name || mesh.name || "part";
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) {
      geometry.dispose();
      return;
    }

    if (cfg.skipMaterial?.test(name)) {
      // Zemin/çim kartı: çizilmez, ama "yer" referansı olarak ölçülür.
      groundBox.union(box);
      geometry.dispose();
      return;
    }

    keptBox.union(box);
    let bucket = buckets.get(name);
    if (!bucket) {
      bucket = { material: material as THREE.Material, geometries: [] };
      buckets.set(name, bucket);
    }
    bucket.geometries.push(geometry);
  });

  const empty: PreparedModel = {
    parts: [],
    owned: [],
    report: {
      sourceMeshes,
      drawCalls: 0,
      rawSize: new THREE.Vector3(),
      flipped: false,
      height: 1,
    },
  };
  if (keptBox.isEmpty()) return empty;

  // ── "Yer" ve yön tespiti ──────────────────────────────────────────────
  // Modelin kendi zemin kartı varsa yer orasıdır; yoksa en alt nokta.
  const groundY = groundBox.isEmpty() ? keptBox.min.y : groundBox.min.y;
  const extentUp = keptBox.max.y - groundY;
  const extentDown = groundY - keptBox.min.y;
  // Ağaç zeminden UZAĞA büyür: hangi taraf daha uzunsa yukarısı orasıdır.
  const flipped = extentDown > extentUp;

  const measuredMin = keptBox.min.clone();
  const measuredMax = keptBox.max.clone();
  let baseY = groundY;
  if (flipped) {
    // 180° X: y → -y, z → -z (yatay düzlem korunur, sadece baş aşağı duran
    // model ayağa kalkar).
    const min = measuredMin.clone();
    const max = measuredMax.clone();
    measuredMin.set(min.x, -max.y, -max.z);
    measuredMax.set(max.x, -min.y, -min.z);
    baseY = -groundY;
  }

  const centerX = (measuredMin.x + measuredMax.x) / 2;
  const centerZ = (measuredMin.z + measuredMax.z) / 2;
  const height = Math.max(measuredMax.y - baseY, 1e-4);

  const flipMatrix = new THREE.Matrix4().makeRotationX(Math.PI);
  const owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  const parts: ModelPart[] = [];

  for (const [name, bucket] of buckets) {
    const geometry = mergeGeometries(bucket.geometries);
    if (flipped) geometry.applyMatrix4(flipMatrix);
    geometry.translate(-centerX, -baseY, -centerZ);
    geometry.scale(1 / height, 1 / height, 1 / height);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    owned.push(geometry);

    let material = bucket.material;
    const card = cfg.cardMaterial?.test(name) ?? false;
    if (card) {
      // Klon şart: drei önbelleğindeki materyali değiştirmek modeli kullanan
      // her yeri etkilerdi (aynı malzeme başka sahnelerde de paylaşılır).
      const clone = material.clone();
      clone.side = THREE.DoubleSide;
      if (cfg.cardEmissive != null) {
        (clone as THREE.MeshStandardMaterial).emissiveIntensity = cfg.cardEmissive;
      }
      material = clone;
      owned.push(clone);
    }

    parts.push({ geometry, material, key: name, card });
  }

  return {
    parts,
    owned,
    report: {
      sourceMeshes,
      drawCalls: parts.length,
      rawSize: keptBox.getSize(new THREE.Vector3()),
      flipped,
      height,
    },
  };
}
