// 🪨 mapDecorScale — haritanın DEKORATİF çevre objelerini karakterle doğru
// orana getirir (ağaç, çalı, orman çimi, yaprak, mantar, kaya grubu, yer
// propları). Böylece karakter yerdeki taşlardan belirgin şekilde büyük okunur.
//
// NEDEN GEOMETRİ ÖLÇEKLEMESİ (node.scale DEĞİL):
//   Harita iki örnek hâlinde duruyor: drei önbelleğindeki KAYNAK sahne ve
//   BattleMapModel'in çizdiği KLON. `SkeletonUtils.clone` (Object3D.clone)
//   node dönüşümlerini KOPYALAR ama geometri/materyali REFERANSLA paylaşır.
//   Yani sonradan yapılan bir `node.scale` değişikliği ekrandaki klona asla
//   yansımaz; geometrinin kendisi ölçeklenirse hem kaynak hem klon aynı anda
//   küçülür. Bu yüzden ölçek, her mesh'in geometrisine uygulanır.
//
// PİVOT (objeler yerinden oynamasın):
//   Her mesh kendi ayak izinin MERKEZİNDEN (x/z) ve ait olduğu dekor grubunun
//   ZEMİN temasından (grup kutusunun min.y) ölçeklenir. Böylece:
//     · obje yatayda yerinde kalır (harita düzeni kaymaz),
//     · tabanı yere basmaya devam eder (havada asılı kalmaz, zemine gömülmez),
//     · aynı ağacın gövde + yaprak mesh'leri aynı taban pivotunu paylaştığı
//       için parçalar birbirinden kopmaz.
//
// KOLLİZYON: haritanın engel ızgarası (`buildCollisionGrid`) bu ölçeklemeden
// SONRA kurulur (bkz. MapPalette → BattleMapGuard sırası), yani küçülen
// kayanın engeli de küçülür: görsel ile fizik aynı kalır, "görünmez duvar"
// oluşmaz.
//
// 🌿 İKİNCİ GEÇİŞ — ÇİM/ÇALI BÜYÜTME (`scaleMapFoliage`): yukarıdaki küçültme
// TEK bir oran kullanıyor ve çim bu yüzden ağaçlarla aynı oranda kırpılıyordu;
// referans karede ise çim diz boyu ve gür. Aynı geometri-pivot tekniğiyle
// yalnızca ALÇAK bitki örtüsü geri büyütülür (Y, XZ'den fazla → çim "kabarır",
// yayılmaz). Etkin ölçek yine 1'in ALTINDA kalır (çim ≈0.67 XZ / 0.78 Y),
// yani modelleyicinin insan ölçeğinde çizdiği bitkiyi asla geçmez: karakteri
// yutacak kadar yükselmesi mümkün değil. Çalılar daha ölçülü büyütülür.
//
// ÇİM FİZİĞİ ETKİLEMEZ: engel ızgarası zaten bitki örtüsünü kapsam dışı
// bırakır (`ENVIRONMENT_CONTAINER_RE` → tree|bush|foliage|grass|plant...),
// yani büyüyen çim ne yürünebilirliği değiştirir ne görünmez duvar üretir.
import * as THREE from "three";
import { ARENA_D, ARENA_W } from "./arena/shared";

/** Dekoratif çevre objelerinin yeni ölçeği — istenen %40-50 küçültme. */
export const DECOR_SCALE = 0.52;

/** Dekoratif objeler (küçültülecekler). */
const DECOR_RE =
  /(tree|foliage|grass|bush|shrub|plant|flower|fern|reed|mushroom|underbrush|groundcover|props|truck|rock)/i;

/** Yapısal/yürünen yüzeyler — ölçeklenmez. */
const KEEP_RE =
  /(terrain|ground|decal|river|water|stream|lake|pond|bridge|crossing|walkway|station|baseblue|basered|tower|wall|block|perimeter|sidewall|island)/i;

function isDecor(node: THREE.Object3D): boolean {
  const name = node.name;
  if (!name || KEEP_RE.test(name)) return false;
  return DECOR_RE.test(name);
}

/** Çim/çalı büyütme profili: XZ (genişlik) ve Y (yükseklik) çarpanları. */
export interface FoliageScale {
  xz: number;
  y: number;
}

/**
 * Alçak bitki örtüsünün yeni ölçekleri (dekor küçültmesinden SONRA uygulanır).
 *
 * Çim: diz boyu, gür (Y ağırlıklı). Çalı: yalnızca biraz daha dolgun —
 * çalılar gizlenme (stealth) bölgeleri olduğu için karakteri tamamen
 * yutmamaları gerekir. Her iki profil de ×0.52 tabanıyla çarpıldığında 1'in
 * altında kalır.
 *
 * ÖLÇÜM (arena birimi; harita `terrain` kutusuna oturtulduğunda, savaşçı
 * ≈1.5 birim): çim kümesi ham hâlde 0.96 → dekor sonrası 0.50 → bu geçişten
 * sonra **0.75** (savaşçının bel hizası). Çalı 0.70 → 0.36 → **0.46**. Yani
 * çim belirgin şekilde kabarır ama karakteri yutmaz.
 */
export const FOLIAGE_SCALE: { grass: FoliageScale; bush: FoliageScale } = {
  grass: { xz: 1.7, y: 2.4 },
  bush: { xz: 1.5, y: 2.0 },
};

/**
 * Yükseklik TAVANI (arena birimi; savaşçı ≈1.5 birim). Çim karakterin göğsüne
 * kadar uzayabilir ama üstünü kapatamaz: 1.1 ≈ karakterin 3/4'ü. Tavana
 * dayanan küme daha fazla büyümez, kısa kalanlar ise tam büyür — yani ayar
 * ne olursa olsun görüş açıklığı korunur.
 *
 * Tavan da ±%8 sapmaya bağlıdır (`foliageJitter`): hepsi aynı boya sabitlenip
 * "budanmış çit" görünümü oluşmasın diye çim kümeleri 1.01–1.19 arasında
 * dağılır, hiçbiri bandı aşmaz.
 */
export const FOLIAGE_MAX_H = { grass: 1.1, bush: 0.8 };

/** Rüzgârın paylaşılan zaman uniform'u — tek sürücü ilerletir. */
export const FOLIAGE_WIND = { value: 0 };

/**
 * Salınım genliği (0 = tamamen sabit). `prefers-reduced-motion` açıkken 0'a
 * çekilir: hareket hassasiyeti olan oyuncu için çim salınmaz, dik durur.
 */
export const FOLIAGE_WIND_AMP = { value: 1 };

// ⚠️ NEDEN TOKEN, NEDEN REGEX DEĞİL: GLB adları PascalCase'dir ve ayraçsız
// birleşir (`PGD_M_20JungleGrassGroup`, `PGD_M_YeQuTreeD`). Düz bir
// /reed/i testi ikinci adda "...T**reeD**..." hecesine takılıp AĞACI çim
// sanıyordu. Bu yüzden ad önce parçalara ayrılır (`_`/rakam sınırı + büyük
// harf geçişi), sonra parçalar sözlükle karşılaştırılır:
//   Jungle|Grass|Group → grass ✓        Ye|Qu|Tree|D → tree (çim DEĞİL) ✓

/** Alçak bitki örtüsü: çim, eğrelti, kamış, yer örtüsü, çiçek... */
const GRASS_TOKENS = new Set([
  "grass",
  "fern",
  "reed",
  "groundcover",
  "underbrush",
  "moss",
  "plant",
  "flower",
  "leaf",
  "leaves",
]);
/** Çalı / yaprak kümesi (gizlenme bölgeleri). "tree" bilinçli olarak YOK. */
const BUSH_TOKENS = new Set(["bush", "shrub", "foliage", "canopy"]);

/** GLB adını parçalara ayırır (küçük harfe indirilmiş token'lar). */
function nameTokens(name: string): string[] {
  return name
    .split(/[^A-Za-z0-9]+/)
    .flatMap((chunk) => chunk.split(/(?=[A-Z])/))
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

function tokensMatch(name: string, tokens: Set<string>): boolean {
  return nameTokens(name).some((token) => tokens.has(token));
}

/** Çim bandı mı (Y ağırlıklı, diz boyu büyütme)? */
function isGrassName(name: string): boolean {
  return tokensMatch(name, GRASS_TOKENS);
}

function isFoliage(node: THREE.Object3D): boolean {
  const name = node.name;
  if (!name || KEEP_RE.test(name)) return false;
  return isGrassName(name) || tokensMatch(name, BUSH_TOKENS);
}

/**
 * Grup adından SABİT (deterministik) bir sapma üretir: 0.92 – 1.08.
 * Her çim kümesi isminden aynı sapmayı aldığı için tek tip "şişmiş" görünüm
 * oluşmaz, ama kareler arasında titreme de olmaz (Math.random DEĞİL).
 */
function hash32(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function foliageJitter(name: string): number {
  return 0.92 + (hash32(name) % 1000) * 0.00016;
}

/**
 * Haritadaki çim/çalı mesh'lerini doğrudan büyütür — GLB yüklendikten sonra,
 * dekor küçültmesinden SONRA çalışır (`MapFoliagePass`, MapPalette'ten sonra
 * render edilir; layout effect'ler ağaç sırasına göre işler).
 *
 * Dönüş: kaç bitki grubu / kaç mesh ölçeklendi (çim ve çalı ayrı sayılır).
 */
type ShaderParams = Parameters<THREE.Material["onBeforeCompile"]>[0];
type ShaderContext = Parameters<THREE.Material["onBeforeCompile"]>[1];

const WIND_VERT_HEAD = `
attribute float aWindWeight;
attribute float aWindPhase;
uniform float uWindTime;
uniform float uWindAmp;
`;

const WIND_VERT_BODY = `
  // 🌬️ RÜZGÂR: sapma, tepe noktasının TABANDAN yüksekliğiyle orantılıdır
  // (aWindWeight = yerel taban-üstü yükseklik) → kök sabit kalır, uçlar
  // salınır; oran her ölçekte korunur, birim varsayımı gerekmez. İki frekans
  // üst üste biner (yavaş esinti + hızlı titreşim), her kümenin kendi fazı
  // olduğu için tarlada ilerleyen bir dalga okunur — tek tip mekanik sallanma
  // değil. Taban noktaları (ağırlık = 0) hiç kıpırdamaz, yere basmaya devam eder.
  {
    float windGust = sin( uWindTime * 1.35 + aWindPhase );
    float windFlutter = sin( uWindTime * 3.1 + aWindPhase * 1.7 );
    float windBend = aWindWeight * uWindAmp;
    transformed.x += windBend * ( windGust * 0.13 + windFlutter * 0.045 );
    transformed.z += windBend * ( windGust * 0.075 - windFlutter * 0.02 );
  }
`;

/**
 * Harita `terrain` kutusundan arena ölçeğini türetir — `BattleMapModel`'in fit
 * kuralının birebir aynısı. Böylece bitki yüksekliği "arena birimi" cinsinden
 * (savaşçı ≈1.5) ölçülüp tavana vurulabilir. 0 → ölçüm yapılamadı.
 */
function arenaFitScale(scene: THREE.Object3D): number {
  const box = new THREE.Box3();
  const meshBox = new THREE.Box3();
  let found = false;
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !/terrain/i.test(mesh.name || "")) return;
    meshBox.setFromObject(mesh);
    if (meshBox.isEmpty()) return;
    box.union(meshBox);
    found = true;
  });
  if (!found) return 0;
  const size = box.getSize(new THREE.Vector3());
  if (size.x <= 1 || size.z <= 1) return 0;
  return Math.min((ARENA_W - 0.3) / size.x, (ARENA_D - 0.3) / size.z);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Rüzgâr ağırlığını (taban-üstü yerel yükseklik) ve küme fazını geometriye
 * yazar. Yerel uzayda çalışır: 0 = taban (sabit), büyük değer = uç (serbest).
 * Faz, küme adından geldiği için her küme farklı anda salınır.
 */
function bakeWindAttributes(geo: THREE.BufferGeometry, seed: string): void {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) return;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) return;
  if (!(box.max.y - box.min.y > 1e-6)) return;
  const count = pos.count;
  const weights = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) weights[i] = pos.getY(i) - box.min.y;
  phases.fill((hash32(seed) % 997) * (Math.PI * 2 / 997));
  geo.setAttribute("aWindWeight", new THREE.BufferAttribute(weights, 1));
  geo.setAttribute("aWindPhase", new THREE.BufferAttribute(phases, 1));
}

/** Tek bir materyale rüzgâr yaması yazar (paylaşılan materyal bir kez). */
function patchWindMaterial(material: THREE.Material): boolean {
  if (material.userData.vaelosWind) return false;
  material.userData.vaelosWind = true;
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader: ShaderParams, renderer: ShaderContext) => {
    // ÖNCE canlı palet yaması (MapVividPass) çalışsın: onBeforeCompile'ın
    // üzerine doğrudan yazmak onu silerdi, bu yüzden zincirlenir.
    prev.call(material, shader, renderer);
    shader.uniforms.uWindTime = FOLIAGE_WIND;
    shader.uniforms.uWindAmp = FOLIAGE_WIND_AMP;
    shader.vertexShader = WIND_VERT_HEAD + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>" + WIND_VERT_BODY,
    );
  };
  // Önbellek anahtarı: aynı canlı palet tonu + rüzgâr → aynı program. İki çim
  // materyali programı paylaşır, materyal başına ayrı derleme olmaz.
  material.customProgramCacheKey = () => `${prevKey.call(material)}|vaelos-wind`;
  material.needsUpdate = true;
  return true;
}

function patchWindOnMesh(mesh: THREE.Mesh): boolean {
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  let patched = false;
  for (const entry of list) {
    if (entry && patchWindMaterial(entry)) patched = true;
  }
  return patched;
}

/**
 * Haritadaki çim/çalı mesh'lerini doğrudan büyütür — GLB yüklendikten sonra,
 * dekor küçültmesinden SONRA çalışır (`MapFoliagePass`, MapPalette'ten sonra
 * render edilir; layout effect'ler ağaç sırasına göre işler). Ayrıca rüzgâr
 * salınımı için vertex verisini ve materyal yamasını yazar.
 */
export interface FoliageResult {
  groups: number;
  meshes: number;
  grass: number;
  bush: number;
  /** Rüzgâr yaması yazılan materyal sayısı (paylaşılan materyal bir kez). */
  windMaterials: number;
  /** Yükseklik tavanına takılıp kısılan küme sayısı. */
  capped: number;
  /** Arena biriminde ortanca bitki yüksekliği (önce → sonra). */
  heightBefore: number;
  heightAfter: number;
}

export function scaleMapFoliage(scene: THREE.Object3D): FoliageResult {
  if (scene.userData.mapFoliageScaled) {
    return {
      groups: 0,
      meshes: 0,
      grass: 0,
      bush: 0,
      windMaterials: 0,
      capped: 0,
      heightBefore: 0,
      heightAfter: 0,
    };
  }
  scene.userData.mapFoliageScaled = true;
  scene.updateMatrixWorld(true);

  // En ÜST bitki düğümleri (bir küme birden fazla mesh taşıyabilir; alt
  // düğümleri tekrar ölçeklememek için yalnızca kökler toplanır).
  const props: THREE.Object3D[] = [];
  scene.traverse((node) => {
    if (!isFoliage(node)) return;
    for (let p: THREE.Object3D | null = node.parent; p; p = p.parent) {
      if (isFoliage(p)) return;
    }
    props.push(node);
  });

  const propBox = new THREE.Box3();
  const meshBox = new THREE.Box3();
  const pivot = new THREE.Vector3();
  const toLocal = new THREE.Matrix4();
  const scaled = new THREE.Matrix4();
  const transform = new THREE.Matrix4();
  let meshes = 0;
  let grass = 0;
  let bush = 0;
  let windMaterials = 0;
  let capped = 0;
  // Yükseklik ölçümü arena biriminde yapılır (savaşçı ≈1.5 birim): ayar
  // "kaç kat" değil "ne kadar yüksek" sorusuna bağlanır.
  const fit = arenaFitScale(scene);
  const before: number[] = [];
  const after: number[] = [];

  for (const prop of props) {
    prop.updateWorldMatrix(true, true);
    propBox.setFromObject(prop);
    if (propBox.isEmpty()) continue;
    // Grubun zemin teması: tüm parçalar aynı tabandan büyütülür → çim
    // yerinden oynamaz, tabanı yere basmaya devam eder.
    const baseY = propBox.min.y;
    const isGrass = isGrassName(prop.name);
    const profile = isGrass ? FOLIAGE_SCALE.grass : FOLIAGE_SCALE.bush;
    const jitter = foliageJitter(prop.name);
    const sxz = profile.xz * jitter;
    // YÜKSEKLİK TAVANI: küme, arena biriminde tavana kadar büyütülür. Çim
    // karakterin üstünü kapatmasın (savaşçı ≈1.5 birim, tavan 1.1), kısa
    // kalan çalı ise tam büyüsün. Tavana dayanan küme bir daha büyümez.
    let sy = profile.y * jitter;
    const cap =
      (isGrass ? FOLIAGE_MAX_H.grass : FOLIAGE_MAX_H.bush) * jitter;
    const heightBefore = fit > 0 ? (propBox.max.y - propBox.min.y) * fit : 0;
    if (heightBefore > 1e-4) {
      const allowed = Math.max(1, cap / heightBefore);
      if (allowed < sy) {
        sy = allowed;
        capped += 1;
      }
      before.push(heightBefore);
      after.push(heightBefore * sy);
    }
    if (isGrass) grass += 1;
    else bush += 1;

    prop.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      // 🌬️ RÜZGÂR VERİSİ + MATERYAL YAMASI ölçeklemeden ÖNCE yazılır ve
      // yapısal adı yüzünden ölçeklenmeyen parçalar için de gerekir: aynı
      // paylaşılan materyali kullanan bir mesh ağırlıksız kalırsa eksik
      // vertex attribute ile çizilirdi.
      bakeWindAttributes(mesh.geometry as THREE.BufferGeometry, prop.name);
      if (patchWindOnMesh(mesh)) windMaterials += 1;
      // Küme içinde kalan yapısal parçalara (duvar, zemin, kule) dokunulmaz.
      if (mesh.name && KEEP_RE.test(mesh.name)) return;
      meshBox.setFromObject(mesh);
      if (meshBox.isEmpty()) return;
      pivot.set(
        (meshBox.min.x + meshBox.max.x) / 2,
        baseY,
        (meshBox.min.z + meshBox.max.z) / 2,
      );

      let geo = mesh.geometry as THREE.BufferGeometry;
      if (geo.userData.mapFoliageScaled) {
        // Geometri başka bir bitki örneğiyle paylaşılıyor: bu örnek kendi
        // pivotuyla büyüyebilsin diye bağımsız kopya alınır.
        geo = geo.clone();
        geo.userData = { ...geo.userData, mapFoliageScaled: false };
        mesh.geometry = geo;
      }

      // p' = P + S·(p − P), S = diag(sxz, sy, sxz)
      //   → M⁻¹ · T(P − S·P) · S · M
      scaled.makeScale(sxz, sy, sxz);
      transform.makeTranslation(
        pivot.x * (1 - sxz),
        pivot.y * (1 - sy),
        pivot.z * (1 - sxz),
      );
      transform.multiply(scaled); // T · S
      toLocal.copy(mesh.matrixWorld).invert();
      transform.premultiply(toLocal); // M⁻¹ · T · S
      transform.multiply(mesh.matrixWorld); // M⁻¹ · T · S · M
      geo.applyMatrix4(transform);
      geo.userData.mapFoliageScaled = true;
      meshes += 1;
    });
  }

  return {
    groups: props.length,
    meshes,
    grass,
    bush,
    windMaterials,
    capped,
    heightBefore: median(before),
    heightAfter: median(after),
  };
}

/**
 * Dekoratif objeleri `scale` oranında küçültür (varsayılan %48).
 * Sahne başına BİR KEZ çalışır (drei önbelleği paylaşıldığı için areneye her
 * girişte tekrar küçülmesini engeller). Dönüş: kaç grup / kaç mesh ölçeklendi.
 */
export function scaleMapDecor(
  scene: THREE.Object3D,
  scale = DECOR_SCALE,
): { groups: number; meshes: number } {
  if (scene.userData.mapDecorScaled) return { groups: 0, meshes: 0 };
  scene.userData.mapDecorScaled = true;
  scene.updateMatrixWorld(true);

  // En ÜST dekor düğümleri (bir grup birden fazla obje taşıyabilir; alt
  // düğümleri tekrar ölçeklememek için yalnızca kökler toplanır).
  const props: THREE.Object3D[] = [];
  scene.traverse((node) => {
    if (!isDecor(node)) return;
    for (let p: THREE.Object3D | null = node.parent; p; p = p.parent) {
      if (isDecor(p)) return;
    }
    props.push(node);
  });

  const propBox = new THREE.Box3();
  const meshBox = new THREE.Box3();
  const pivot = new THREE.Vector3();
  const toLocal = new THREE.Matrix4();
  const scaled = new THREE.Matrix4();
  const transform = new THREE.Matrix4();
  let meshes = 0;

  for (const prop of props) {
    prop.updateWorldMatrix(true, true);
    propBox.setFromObject(prop);
    if (propBox.isEmpty()) continue;
    // Grubun zemin teması: tüm parçalar aynı tabandan ölçeklenir.
    const baseY = propBox.min.y;

    prop.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      // Grup içinde kalan yapısal parçalara (duvar, zemin, kule) dokunulmaz.
      if (mesh.name && KEEP_RE.test(mesh.name)) return;
      meshBox.setFromObject(mesh);
      if (meshBox.isEmpty()) return;
      pivot.set(
        (meshBox.min.x + meshBox.max.x) / 2,
        baseY,
        (meshBox.min.z + meshBox.max.z) / 2,
      );

      let geo = mesh.geometry as THREE.BufferGeometry;
      if (geo.userData.mapDecorScaled) {
        // Geometri başka bir örnekle paylaşılıyor: bu örnek kendi pivotuyla
        // ölçeklenebilsin diye bağımsız kopya alınır.
        geo = geo.clone();
        geo.userData = { ...geo.userData, mapDecorScaled: false };
        mesh.geometry = geo;
      }

      // p' = P + s·(p − P)  →  M⁻¹ · T(P − sP) · S(s) · M
      scaled.makeScale(scale, scale, scale);
      transform.makeTranslation(
        pivot.x * (1 - scale),
        pivot.y * (1 - scale),
        pivot.z * (1 - scale),
      );
      transform.multiply(scaled); // T · S
      toLocal.copy(mesh.matrixWorld).invert();
      transform.premultiply(toLocal); // M⁻¹ · T · S
      transform.multiply(mesh.matrixWorld); // M⁻¹ · T · S · M
      geo.applyMatrix4(transform);
      geo.userData.mapDecorScaled = true;
      meshes += 1;
    });
  }

  return { groups: props.length, meshes };
}
