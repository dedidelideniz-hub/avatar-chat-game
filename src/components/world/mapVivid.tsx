// 🌈 mapVivid — haritanın zemin/dekor materyallerine CANLI (high-saturation
// low-poly) doygunluk enjeksiyonu.
//
// NEDEN GERÇEK IŞIK DEĞİL, GÖLGELENDİRİCİ YAMASI: haritanın çimen/ağaç/
// patika/taş renkleri neredeyse tamamen DOKUDAN gelir; materyalin `color`
// çarpanı beyaz olduğu için rengi HSL'de doyurmak ekranda hiçbir şey
// değiştirmez (beyazın doygunluğu yoktur). Bu yüzden doygunluk, fragment
// gölgelendiricisinde dokunun uygulandığı noktadan hemen sonra açılır:
//
//   diffuseColor.rgb = clamp( mix( vec3(luma), diffuseColor.rgb, SAT ) * VAL )
//
// Yani renk, kendi parlaklığı (luma) etrafında dışa doğru açılır: doku, UV ve
// ışık hesabı DEĞİŞMEZ — yalnızca okunan albedo canlanır. Aynı desen
// `waterFlow.tsx`'te akan su için, `CharacterRimLight`'ta kenar ışığı için
// kullanılır; üçü de `onBeforeCompile` ile tek satırlık enjeksiyondur.
//
//   • ÇİM / AĞAÇ / ÇALI      → SAT 1.45, VAL 1.05, albedo ×1.14
//   • PATİKA / YOL / TOPRAK  → SAT 1.35, VAL 0.86, albedo ×1.03 (koyu kahve)
//   • TAŞ / KULE / DUVAR / ÜS→ SAT 1.25, VAL 1.00, albedo ×1.06, roughness ≤0.55
//   • diğer zemin/dekor      → SAT 1.25, VAL 1.00, albedo ×1.08, roughness ≤0.60
//
// ÜÇÜNCÜ KATMAN — ALBEDO YÜKSELTMESİ VE PBR PARLAKLIĞI: dokulu zemin/çim
// kaplamaları renk olarak çok koyu kalıyordu, bu yüzden materyalin `color`
// çarpanı 1'in ÜZERİNE çekilir (doku aydınlanır, albedo > 1 kabul edilir —
// stilize palet) ve çevre yansıması tabanı yükseltilir (`envMapIntensity`;
// zemin geçişi bunu 0.15'e indirdiği için taş/metal hiç yansımıyordu).
// Böylece yüzeyler hem daha açık hem hafif ışık yakalayan (PBR "sheen")
// hâle gelir.
//
// İŞ BÖLÜMÜ: renk/ışıma katmanı `WarAtmosphere → applyVividTone`'dadır (düz
// renkli yüzeylerin HSL doygunluğu ve kristal/büyü objelerinin emissive 0.3
// ışıması). DOKULU yüzeylerin doygunluğu ise — materyalin `color` çarpanı
// beyaz olduğu için — burada, gölgelendiriciye enjekte edilir.
//
// SIRA: `BattleMapGuard` bu bileşeni `MapPalette`'ten SONRA render eder; layout
// effect'ler ağaç sırasına göre çalıştığı için zemin geçişi (normalize), dekor
// ölçeklemesi ve ışıma temizliği bittikten sonra doygunluk uygulanır. Ayrıca
// HİÇBİR yeni materyal örneği üretilmez — yama paylaşılan materyalin kendisine
// yazılır, yani ekrandaki harita ile fizik aynı kalır.
//
// GÖRSEL-ONLY: çarpışma ızgarası, yürünebilirlik, hasar ve menzil etkilenmez.
import { useGLTF } from "@react-three/drei";
import { useLayoutEffect } from "react";
import * as THREE from "three";
import { MAP_URL } from "./WarAtmosphere";

/** Doygunluk yaması uygulanmış materyaller (klonlanan örnekler temiz başlar). */
const VIVID_PATCHED = new WeakSet<THREE.Material>();

/** Çim / ağaç / çalı — en canlı yeşil bandı. */
const FOLIAGE_RE =
  /(grass|foliage|leaf|leaves|tree|bush|shrub|plant|fern|reed|mushroom|underbrush|groundcover|flower|vine|moss|canopy|stump|trunk)/i;
/** Patika / yol / toprak — doygun ama daha koyu kahve. */
const PATH_RE =
  /(path|trail|road|lane|dirt|soil|track|walkway|crossing|bridge|sand|mud|plaza)/i;
/** Taş / kaya / kule / duvar / üs — nötr griye düşmesin. */
const STONE_RE =
  /(rock|boulder|cliff|stone|wall|tower|block|base|station|island|perimeter|ruin|pillar|arch|sculpture|monument|stair)/i;

interface VividTone {
  /** Doygunluk çarpanı (1 = dokunun kendisi). */
  sat: number;
  /** Parlaklık çarpanı (< 1 patikaları koyulaştırır). */
  val: number;
  /** Albedo yükseltmesi: materyalin `color` çarpanı bu kadar AÇILIR
   *  (> 1 = koyu doku aydınlanır). */
  bright: number;
  /** Çevre yansıması tabanı (PBR parlaklığı). */
  env: number;
  /** Roughness üst sınırı (1 = dokunma): taş/zemin ışığı hafifçe yakalasın. */
  rough: number;
}

/** Mesh adı zincirine göre canlı palet tonu. */
function vividToneFor(semantic: string): VividTone {
  if (FOLIAGE_RE.test(semantic))
    return { sat: 1.45, val: 1.05, bright: 1.14, env: 0.3, rough: 1 };
  if (PATH_RE.test(semantic))
    return { sat: 1.35, val: 0.86, bright: 1.03, env: 0.26, rough: 0.8 };
  if (STONE_RE.test(semantic))
    return { sat: 1.25, val: 1, bright: 1.06, env: 0.4, rough: 0.55 };
  return { sat: 1.25, val: 1, bright: 1.08, env: 0.32, rough: 0.6 };
}

/**
 * Tek bir materyale doygunluk yamasını yazar. `false` dönerse materyal
 * atlanmıştır (ışık almayan, additif efekt ya da akan su katmanı).
 */
function patchVivid(material: THREE.Material, tone: VividTone): boolean {
  const std = material as THREE.MeshStandardMaterial;
  if (!std.isMeshStandardMaterial) return false;
  if (VIVID_PATCHED.has(std)) return false;
  // Additif efekt katmanları ve akan su kendi görsel dilini taşır.
  if (std.blending === THREE.AdditiveBlending) return false;
  if (std.userData?.vaelosWater) return false;

  // (1) ALBEDO: koyu kalmış zemin/çim dokusu açılır (color > 1 olabilir).
  const baseColor = std.color as THREE.Color | undefined;
  if (baseColor) baseColor.multiplyScalar(tone.bright);
  // (2) PBR: zemin geçişinin 0.15'e indirdiği çevre yansıması geri gelir,
  //     yüzey ışığı yakalar (mat "karton" görünümü biter).
  std.envMapIntensity = Math.max(
    typeof std.envMapIntensity === "number" ? std.envMapIntensity : 0,
    tone.env,
  );
  // (3) Roughness üst sınırı: zemin geçişi her yüzeyi matlaştırıyordu (≥ 0.6),
  //     bu yüzden taş/kaya hiç speküler ışık yakalamıyor ve "karton" gibi
  //     duruyordu. Sınır yalnızca YUKARIDAN çekilir; zaten daha mat bir
  //     yüzey olduğu gibi kalır.
  if (typeof std.roughness === "number") {
    std.roughness = Math.min(std.roughness, tone.rough);
  }

  const sat = tone.sat.toFixed(3);
  const val = tone.val.toFixed(3);
  std.onBeforeCompile = (shader) => {
    // `map_fragment` her ışık alan materyalde vardır (meshbasic dâhil);
    // beklenmedik bir shader'da değişiklik yapmadan çıkılır.
    if (!shader.fragmentShader.includes("#include <map_fragment>")) return;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      // CANLI PALET: dokunun kendi parlaklığı etrafında doygunluk açılır,
      // patikalarda değer bir tık kısılır (yüksek doygunluklu low-poly okunuşu).
      {
        float vividLum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
        // Tavan 1.35: albedo yükseltmesi (color > 1) kırpılıp geri
        // koyulaşmasın, ama HDR taşması da sınırlı kalsın.
        diffuseColor.rgb = clamp(
          mix( vec3( vividLum ), diffuseColor.rgb, ${sat} ) * ${val},
          0.0,
          1.35
        );
      }`,
    );
  };
  // Ton başına ayrı program: farklı tonlardaki materyaller aynı derlenmiş
  // programı paylaşıp birbirinin doygunluğunu almasın.
  std.customProgramCacheKey = () => `vaelos-vivid-${sat}-${val}`;
  VIVID_PATCHED.add(std);
  std.needsUpdate = true;
  return true;
}

/**
 * Harita GLB'sindeki (drei önbelleğinden, kopya indirmeden) her mesh'in
 * materyaline canlı palet tonunu uygular. Canvas içine render edilmelidir ve
 * `MapPalette`'ten SONRA gelmelidir.
 */
export function MapVividPass(): null {
  const { scene } = useGLTF(MAP_URL);

  useLayoutEffect(() => {
    let patched = 0;
    const tones = new Map<string, number>();
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const names: string[] = [];
      let node: THREE.Object3D | null = mesh;
      for (let i = 0; node && i < 8; node = node.parent, i++) {
        if (node.name) names.push(node.name);
      }
      const semantic = names.join("/");
      const tone = vividToneFor(semantic);
      const list = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const entry of list) {
        if (!patchVivid(entry, tone)) continue;
        patched += 1;
        const key = `${tone.sat}/${tone.val}`;
        tones.set(key, (tones.get(key) ?? 0) + 1);
      }
    });
    // Teşhis: sahne yeniden kurulduğunda da tekrar eder (materyal başına bir
    // kez yamalanır), yani satır "canlı palet bağlandı"nın kanıtıdır.
    console.log(
      `[mapVivid] ${patched} materyal canlı palete bağlandı (` +
        [...tones].map(([tone, n]) => `${tone}×${n}`).join(", ") +
        ")",
    );
  }, [scene]);

  return null;
}
