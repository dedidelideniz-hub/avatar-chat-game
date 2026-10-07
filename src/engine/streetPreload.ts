import { useGLTF } from "@react-three/drei";
import { BUILDING_MODEL_URLS } from "./constants";
import { CHARACTER_MODEL_URL } from "./GlbAvatar3D";
import { GRASS_GROUND_URL } from "./grassGroundPrep";
import { GRASS_CLUMP_MODEL_URL, TREE_MODEL_URL } from "./vegModelPrep";

/**
 * ANA CADDE ÖN YÜKLEMESİ
 *
 * Neden var: `World` sayfası açıldığında caddenin modelleri (çim zemin, ağaç,
 * çim öbeği, karakter) sırayla inmeye başlıyordu; oyuncu caddeyi boş/eksik
 * görüyor, sahne ancak girdikten sonra tamamlanıyordu. Model listesi burada
 * tek yerde toplanır ve caddeye girmeden ÖNCE (oyun girişinde) indirme
 * başlatılır. `World`'deki yükleme kapısı ise sahnenin kendisiyle AYNI
 * `useGLTF` önbelleğini beklediği için ilerleme tahmini değil, gerçektir.
 *
 * `useGLTF.preload` URL başına bir kez indirir (drei/fiber önbelleği) — bu
 * fonksiyon birden fazla kez çağrılabilir, ikinci çağrı ağ trafiği üretmez.
 */

/**
 * Caddenin çizilebilmesi için ŞART olan modeller. `GameEngine3D` içindeki
 * `StreetAssetsProbe` tam olarak bu modelleri bekler.
 *
 * NOT: `GlbAvatar3D.FALLBACK_MODEL_URL` bilerek DIŞARIDA — uzak bir adres
 * (threejs.org) ve yalnızca yerel karakter modeli bozulursa kullanılır;
 * caddeye girerken dışarıdan dosya indirmenin anlamı yok.
 */
export const STREET_MODELS = {
  /** Çimin tamamını döşeyen yer karosu — en büyük varlık. */
  ground: GRASS_GROUND_URL,
  /** Sokak ağacı sıraları (akçaağaç). */
  tree: TREE_MODEL_URL,
  /** Çim öbekleri. */
  grass: GRASS_CLUMP_MODEL_URL,
  /** Oyuncu, botlar ve satıcılar için varsayılan karakter. */
  character: CHARACTER_MODEL_URL,
} as const;

/**
 * CADDE BİNALARININ MODELLERİ (`constants.BUILDING_MODEL_URLS`).
 *
 * `STREET_MODELS`ten AYRI tutulur ve artık ÖN YÜKLENMEZ: bina modelleri
 * ağırdır (cadı dükkânı 43 MiB GPU dokusu) ve cadde açılırken diğer
 * varlıklarla aynı anda çözülürse Android WebView'in işleyici sürecini
 * bellekten düşürüyordu. Binalar `engine/assetQueue` sırasıyla, cadde
 * AÇILDIKTAN sonra tek tek yüklenir (bkz. `GlbBuilding`).
 */
export const STREET_BUILDING_MODELS: readonly string[] = BUILDING_MODEL_URLS;

/**
 * CADDEYİ ÇİZMEK İÇİN ŞART olan KRİTİK modeller.
 *
 * Yükleme kapısı (`World`) ve sahne sondası (`GameEngine3D` →
 * `StreetAssetsProbe`) YALNIZCA bunları bekler: çim zemin ve karakter.
 * Ağaç/çim öbekleri/binalar/skin/oda/zırh bu listede DEĞİLDİR — onlar arka
 * plan kuyruğunda, cadde açıldıktan sonra sırayla yüklenir.
 */
export const STREET_CRITICAL_MODELS: readonly string[] = [
  STREET_MODELS.ground,
  STREET_MODELS.character,
];

/** Ön yüklemesi başlatılmış URL'ler — tekrar tetiklemeyi engeller. */
const started = new Set<string>();

/**
 * KRİTİK cadde modellerini (çim zemin + karakter) indirmeye başlar.
 *
 * AĞIR/ÇEVRESEL varlıklar burada ön yüklenmez (eski davranış: ağaç + çim
 * öbekleri + bina + skin aynı anda → Android'de eşzamanlı decode zirvesi).
 * Onlar `assetQueue` sırasına bırakılır: cadde açılır, sonra TEK TEK gelir.
 *
 * `extra` ile oyuncuya özel KRİTİK varlıklar eklenebilir.
 */
export function preloadStreetModels(extra: readonly string[] = []): void {
  const urls = [...STREET_CRITICAL_MODELS, ...extra];
  for (const url of urls) {
    if (!url || started.has(url)) continue;
    started.add(url);
    useGLTF.preload(url);
  }
}

/** Caddeye girerken dönen oyun ipuçları (yükleme ekranının altında akar). */
export const STREET_TIPS = [
  "Joystick ile hareket et; caddede tezgâhların önünde durup alışveriş yapabilirsin.",
  "Günün hediye kutusunu caddeden topla, Vaelos Parası kazan.",
  "Bankların önünde dur, otur ve arkadaşlarınla sohbet et.",
  "Ara sokaklardan geçip dükkanların arkasındaki arka caddeyi keşfet.",
  "VIP üyelik tüm konuşma balonu renklerini ve 2 premium karakter rengini açar.",
];
