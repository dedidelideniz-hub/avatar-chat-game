// 🧨 BombModel — samurayın SİLAHI olan bombanın TEK üretim kaynağı.
//
// NEDEN AYRI MODÜL: bomba artık oyunun ÜÇ yerinde görünüyor ve üçü de AYNI
// cismi göstermek zorunda:
//
//   ▸ ELDE   → `engine/SamuraiBomb` (samurayın avucunda, hokkabazlık + aksiyon),
//   ▸ HAVADA → `arena/ProjectilePool` (ulti fırlatması, takla atarak uçar),
//   ▸ YERDE  → `arena/BombTrapPool` (normal yetenek: yere bırakılan tuzak).
//
// Bu üçü ayrı ayrı model ölçekleseydi (eskiden öyleydi) elde `comical_bomb.glb`,
// havada ve yerde prosedürel bir demir küre görünürdü — oyuncu "benim bombam bu
// değil" diye okurdu. Kullanıcı geri bildirimi zaten şuydu: "silahı bu bomba bu
// karakterin". Bu yüzden NORMALİZASYON, MALZEME ve ALEV burada TEK kez yazılır;
// üç sahne de buradan birer ÖRNEK (instance) alır.
//
// ÖLÇÜ SÖZLEŞMESİ (üç sahne de buna güvenir): dönen `root`un uzayı
//
//   · ORİJİN = GÖVDE KÜRESİNİN MERKEZİ (fitil/kapak yüzünden yukarı kaymaz,
//     yoksa top avuca/zemine yarım yarıçap gömülür — bkz. `measureBodyBall`),
//   · +Y = FÜNYE YÖNÜ (model yana/eğik çizilmişse bile düzeltilir),
//   · 1 birim = 1 DÜNYA birimi ve gövde çapı `BOMB_TARGET_WORLD_SPAN`dır.
//
// Yani çağıran sadece konum/dönüş verir; ölçek, merkez ve fünye yönü ile hiç
// uğraşmaz. Model dosyası yoksa/bozuksa prosedürel `buildStructuralBomb()`
// kullanılır — hiçbir sahnede bomba eksik kalmaz.
//
// GLB ARKA PLANDA gelir: ilk kareler prosedürel modelle çizilir, dosya
// çözülünce `subscribeBombSource` haber verir ve sahneler örneklerini yeniden
// kurar (elde tutulan bombada olduğu gibi).
//
// NOT: Bu projede modeller saf ASCII JSON glTF olarak durur (bkz.
// `public/ASSETS.md`): hosting boru hattı binary dosyaları UTF-8'e çevirdiği
// için gerçek binary GLB bozulur. Elde binary bir GLB varsa önce çevrilmelidir:
// `node scripts/glb-to-embedded-json.mjs public/models/comical_bomb.glb`.
import * as THREE from "three";
import { GLTFLoader, MeshoptDecoder, SkeletonUtils } from "three-stdlib";
import { prepareHeldEquipment } from "./HeldEquipment";
import {
  BOMB_BODY_EMISSIVE,
  BOMB_BODY_EMISSIVE_COLOR,
  BOMB_FLAME_SPAN,
  BOMB_FUSE_EMISSIVE,
  BOMB_FUSE_MATERIAL,
  BOMB_MODEL_SPAN,
  BOMB_TARGET_WORLD_SPAN,
  buildStructuralBomb,
} from "./HandGrip";
import {
  createBombAura,
  createFuseFlame,
  findFuseAnchor,
  isFuseLikeName,
  measureBodyCenter,
  measureBodySpan,
  measureFuseDirection,
  type BombAura,
  type FuseFlame,
} from "./BombFuseFlame";

/**
 * Bomba modelleri, ÖNCELİK SIRASIYLA. İlk yüklenen kullanılır:
 *   1. `comical_bomb.glb` — kullanıcının eklediği asıl model,
 *   2. `bomba.glb`        — projede üretilmiş yedek model,
 *   3. (dosya yok)        — `buildStructuralBomb()` prosedürel model.
 */
export const BOMB_MODEL_URLS = ["/models/comical_bomb.glb", "/models/bomba.glb"] as const;

/** Bomba GLB'si Meshopt ile sıkıştırılmış olabilir; decoder three-stdlib'de. */
const bombLoader = (() => {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder());
  return loader;
})();

/** Yüklenen kaynak sahne (tüm örnekler bundan KLONLANIR). */
let bombSource: THREE.Object3D | null = null;
/** Uçuştaki yükleme (birden fazla çağrı tek yüklemeyi paylaşır). */
let bombLoading: Promise<void> | null = null;
/** Kaynak hazır olduğunda haber verilecek sahneler. */
const bombListeners = new Set<() => void>();

/** Hazır kaynak model (henüz yüklenmediyse `null` → prosedürel yedek). */
export function getBombSource(): THREE.Object3D | null {
  return bombSource;
}

/**
 * Modelleri sırayla dener; hepsi başarısız olursa `null` döner (çağıran
 * prosedürel modele düşer). Her aday için ayrı uyarı basılır ki "neden yedek
 * model görünüyor" sorusu konsoldan okunabilsin.
 */
async function loadBombSource(): Promise<boolean> {
  for (const url of BOMB_MODEL_URLS) {
    try {
      const gltf = await bombLoader.loadAsync(url);
      bombSource = gltf.scene;
      return true;
    } catch (e) {
      console.warn(`[Samurai] bomba modeli yüklenemedi: ${url}`, e);
    }
  }
  return false;
}

/**
 * Kaynağın yüklenmesini başlatır (bir kez) ve bitişini verir. Model hazır
 * olduğunda bekleyen abonelere haber verilir; hiçbir aday yüklenemezse HABER
 * VERİLMEZ (çizilen prosedürel model zaten doğru, yeniden kurmanın anlamı yok).
 */
export function ensureBombSourceLoaded(): Promise<void> {
  if (bombSource || bombLoading) return bombLoading ?? Promise.resolve();
  bombLoading = loadBombSource().then((found) => {
    bombLoading = null;
    if (!found) return;
    const pending = [...bombListeners];
    bombListeners.clear();
    for (const notify of pending) notify();
  });
  return bombLoading;
}

/**
 * GLB sahneye girdiğinde bir kez çağrılır. Zaten yüklüyse hiçbir şey yapmaz:
 * örnek o an zaten GLB'den kurulmuştur, boşuna yeniden kurulmaz.
 *
 * `load: true` (varsayılan) abonelik YÜKLEMEYİ DE başlatır. Bunu yalnız ELDE
 * tutulan bomba kullanır: samuray sahnede varsa model zaten gerekli, ve bu aynı
 * zamanda "bu maçta bomba var" sinyalidir. Havuzlar `load: false` ile abone olur:
 * `comical_bomb.glb` 20 MB'lık bir dosya ve samuray olmayan bir maçta hiç
 * görünmeyecek bomba için indirilmemelidir — ama samuray varsa (yani model
 * yükleniyorsa) havuz da haberi alıp gerçek modeli kurar.
 */
export function subscribeBombSource(
  onReady: () => void,
  options?: { load?: boolean },
): () => void {
  if (options?.load !== false) ensureBombSourceLoaded();
  if (bombSource) return () => {};
  bombListeners.add(onReady);
  return () => {
    bombListeners.delete(onReady);
  };
}

/** Çağıranın kurduğu bomba örneği (konum/dönüş çağıranın işidir). */
export interface BombInstance {
  /** Orijin = gövde merkezi, +Y = fünye, gövde çapı = `worldSpan` DÜNYA birimi. */
  root: THREE.Group;
  /** Fünye ucundaki canlı alev (`flame: false` verilirse `null`). */
  flame: FuseFlame | null;
  /** Okunurluk hâlesi (`aura: true` verilirse). */
  aura: BombAura | null;
  /** Alevi/hâleyi ilerletir (`dt` saniye). */
  update(dt: number): void;
  /** Model + alev + malzemeleri serbest bırakır. */
  dispose(): void;
}

export interface BombInstanceOptions {
  /** Canlı fünye alevi (varsayılan AÇIK). */
  flame?: boolean;
  /**
   * Alev nokta ışığı (VARSAYILAN KAPALI). Bombanın nokta ışığı bilinçli olarak
   * kapalıdır: three.js bir malzemenin shader programını sahnedeki ışık
   * SAYISINA göre derler, dolayısıyla görünür bir ışık eklenip çıkınca (bomba
   * elden çıkınca/gizlenince ya da yere tuzak doğunca) arenadaki TÜM malzemeler
   * yeniden derlenir. Bu, tam yetenek/ulti kullanıldığı anda yüzlerce ms'lik
   * bir donma olarak görünüyordu. Ateşi okunur kılan şey zaten additif sprite
   * katmanları + `toneMapped = false` (bloom eşiğini geçerler); sahnenin
   * şampiyon/kolon ışıkları eli zaten aydınlatır. Işık yine de istenirse
   * yalnızca HİÇ gizlenmeyen bir örnekte `true` verilmelidir (sabit sayı).
   */
  flameLight?: boolean;
  /**
   * Okunurluk hâlesi (varsayılan KAPALI). Yalnız ELDE tutulan bombada gerekir
   * (karakterin silüeti içinde kaybolmasın); yerde/havada gereksiz maliyet.
   */
  aura?: boolean;
  /** Hâle nokta ışığı (VARSAYILAN KAPALI) — `flameLight` ile aynı gerekçe. */
  auraLight?: boolean;
  /** Gövde küresinin istenen DÜNYA çapı (varsayılan `BOMB_TARGET_WORLD_SPAN`). */
  worldSpan?: number;
}

/**
 * Sahneye konmaya hazır bir bomba örneği üretir (klon: paylaşılan GLB sahnesi
 * bozulmaz). Ölçü/merkez/fünye hizası burada bir kez uygulanır; çağıran
 * yalnızca `root`u takar ve `update(dt)` çağırır.
 *
 * Model HENÜZ yüklenmediyse prosedürel yedek anında kurulur (el/havuz asla boş
 * kalmaz) ve yükleme BURADAN başlatılmaz — tetikleme kararı çağıranındır
 * (bkz. `subscribeBombSource` → `load`).
 */
/**
 * Kaynak modelin ÖLÇÜLERİ (gövde genişliği, merkez, fünye yönü ve ağız
 * noktası) — model kökünün KENDİ uzayında.
 */
interface BombSourceMetrics {
  sourceSpan: number;
  bodyCenter: THREE.Vector3;
  fuseDir: THREE.Vector3;
  fuseAnchor: THREE.Vector3;
}

/**
 * Ölçüm önbelleği — KAYNAK başına BİR KEZ hesaplanır.
 *
 * NEDEN ÖNBELLEK: `SkeletonUtils.clone` geometriyi ve yerel dönüşümleri
 * PAYLAŞIR, yani aynı kaynaktan türeyen tüm klonların ölçüleri birebir aynıdır.
 * Önceden her örnek modelin tüm köşelerini yeniden tarıyordu (`bodyPoints`
 * birkaç kez çağrılıyordu); GLB hazır olduğunda 11 örnek (el + 4 uçan bomba +
 * 6 tuzak) aynı karede kurulduğu için bu tarama belirgin bir TAKILMA üretiyordu.
 */
const sourceMetricsCache = new WeakMap<THREE.Object3D, BombSourceMetrics>();

/** Prosedürel yedek model TEK kez üretilir ve tüm örnekler bundan klonlanır. */
let structuralSource: THREE.Object3D | null = null;
function proceduralBombSource(): THREE.Object3D {
  if (!structuralSource) structuralSource = buildStructuralBomb();
  return structuralSource;
}

/**
 * Kaynağın ölçülerini döndürür (önbellekten, yoksa hesaplayıp saklar).
 * Kaynak hiç değişmez (GLB sahnesi ya da prosedürel yedek), dolayısıyla
 * ölçümler yaşam boyu geçerlidir.
 */
function sourceMetrics(source: THREE.Object3D): BombSourceMetrics {
  const cached = sourceMetricsCache.get(source);
  if (cached) return cached;
  source.updateWorldMatrix(true, true);
  // ÖLÇEK REFERANSI = GÖVDE KÜRESİNİN ÇAPI (ya da kutunun XZ genişliği).
  // Fitil/kıvılcım mesh'leri ile üçgene bağlı olmayan "başıboş" köşeler
  // ölçümden ÇIKARILIR (bkz. `measureBodySpan`): yana uzanan bir fitil ya da
  // yüzeyden kopuk köşeler kutuyu şişirip bombayı olduğundan küçük ölçekler.
  const metrics: BombSourceMetrics = {
    sourceSpan: measureBodySpan(source) || BOMB_MODEL_SPAN,
    bodyCenter: measureBodyCenter(source),
    fuseDir: measureFuseDirection(source),
    fuseAnchor: findFuseAnchor(source),
  };
  sourceMetricsCache.set(source, metrics);
  return metrics;
}

export function createBombInstance(options: BombInstanceOptions = {}): BombInstance {
  const worldSpan = options.worldSpan ?? BOMB_TARGET_WORLD_SPAN;
  const source = bombSource ?? proceduralBombSource();
  // Ölçüler kaynak başına bir kez (yukarıdaki önbellek); klon yalnız yapıyı
  // kopyalar (geometri/malzeme paylaşılır, `prepareHeldEquipment` malzemeleri
  // örnek başına klonlar ki paylaşılan kaynak bozulmasın).
  const metrics = sourceMetrics(source);
  const model = SkeletonUtils.clone(source);
  model.updateMatrixWorld(true);

  const { modelScale, materials } = prepareHeldEquipment(model, {
    targetWorldSpan: worldSpan,
    sourceSpan: metrics.sourceSpan,
    parentWorldScale: 1,
  });

  // 🔥 Malzeme dokunuşları (elde tutulan bombayla BİREBİR aynı kurallar):
  //  · fitil/ateş malzemesi olabildiğince parlar (ısı kaynağı o),
  //  · kendi emissive dokusu OLMAYAN gövde malzemeleri zayıf sıcak bir taban
  //    alır → kuş bakışı kadrajda/karakterin silüeti içinde kaybolmaz.
  // Dokulu modelde ışımayı modelin kendi dokusu taşır; oraya düz renk yazmak
  // emissive = renk × doku olduğu için siyah kısımlarda hiç görünmezdi.
  model.traverse((o) => {
    o.userData.isEquipment = true;
    // Frustum culling kapatılır: kemik animasyonu/havuz yeniden kullanımı
    // sırasında model ekrandan bir an silinmesin (kılıç katmanıyla aynı kural).
    o.frustumCulled = false;
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const entry of list) {
      const m = entry as THREE.MeshStandardMaterial;
      if (m.name === BOMB_FUSE_MATERIAL || isFuseLikeName(m.name)) {
        // GLB'de emissive kuvveti 1'in üstüne çıkamaz (ekstra uzantı gerekir),
        // bu yüzden malzeme ADIYLA hedeflenir (fitil/ateş/glow… kalıbı).
        m.emissiveIntensity = BOMB_FUSE_EMISSIVE;
        m.toneMapped = false;
      } else if (m.emissive && !m.emissiveMap) {
        m.emissive.set(BOMB_BODY_EMISSIVE_COLOR);
        m.emissiveIntensity = BOMB_BODY_EMISSIVE;
        // `toneMapped` ELLENMEZ: gövde ateş değil, yalnız hafif aydınlık kalır.
      }
    }
  });

  // Pivot: gövde merkezini kök orijinine çek ve modelin fünyesini +Y'ye hizala.
  // `root.quaternion = align` + `model.position = −gövde merkezi` kombinasyonu,
  // modelin bir noktasını `align * ((v − merkez) * ölçek)` konumuna taşır —
  // yani "gövde merkezi orijinde, fünye +Y'de".
  const align = new THREE.Quaternion().setFromUnitVectors(
    metrics.fuseDir,
    new THREE.Vector3(0, 1, 0),
  );
  model.position.copy(metrics.bodyCenter).multiplyScalar(modelScale).negate();

  const root = new THREE.Group();
  root.quaternion.copy(align);
  root.userData.isEquipment = true;
  root.frustumCulled = false;
  root.add(model);

  // 🔥 Ağız ateşi: modelin fünye ucunda. Nokta KÖK-YEREL uzayda hesaplanır
  // (kök zaten hizalı olduğu için ayrıca döndürülmez — döndürmek alevi fünyeden
  // kopartırdı). Alev ölçüsü bomba çapından DEĞİL kendi sabitinden gelir:
  // fitil alevi bomba büyüdükçe büyümez, ama farklı çaplarda oransal kalır.
  let flame: FuseFlame | null = null;
  if (options.flame !== false) {
    flame = createFuseFlame(
      BOMB_FLAME_SPAN * (worldSpan / BOMB_TARGET_WORLD_SPAN),
      { light: options.flameLight === true },
    );
    flame.group.position
      .copy(metrics.fuseAnchor)
      .sub(metrics.bodyCenter)
      .multiplyScalar(modelScale);
    root.add(flame.group);
  }

  // 🧨 Gövde hâlesi: orijin TAM gövde merkezi olduğu için offset gerekmez.
  let aura: BombAura | null = null;
  if (options.aura) {
    aura = createBombAura(worldSpan / 2, { light: options.auraLight === true });
    root.add(aura.group);
  }

  return {
    root,
    flame,
    aura,
    update(dt: number) {
      flame?.update(dt);
      aura?.update(dt);
    },
    dispose() {
      flame?.dispose();
      aura?.dispose();
      root.removeFromParent();
      root.clear();
      for (const material of materials) material.dispose();
    },
  };
}
