// 🌿 mapFoliage — haritanın KENDİ çim/çalı mesh'lerini büyütür ve rüzgârda
// salındırır.
//
// NEDEN AYRI GEÇİŞ: `mapDecorScale` (MapPalette içinde, layout effect) haritanın
// dekorunu TEK oranla (×0.52) küçültüyor — çim de ağaçlarla aynı oranda
// kırpılıyordu, oysa referans karede çim diz boyu ve gür. Büyütme/rüzgâr mantığı
// `mapDecorScale → scaleMapFoliage` içinde yaşar (aynı geometri-pivot tekniği:
// taban yere basar, küme yatayda yerinde kalır); buradaki bileşen DOĞRU ANDA
// çağırır ve salınım saatini ilerletir.
//
// SIRA: `BattleMapGuard` bu bileşeni `MapPalette`'ten SONRA render eder.
// Aynı `Suspense` içinde oldukları ve layout effect'ler ağaç sırasına göre
// çalıştığı için çim büyütme, dekor küçültmesi BİTTİKTEN sonra uygulanır.
// Harita klonu geometriyi referansla paylaştığı için (SkeletonUtils.clone)
// değişiklik ekrandaki haritaya da aynı karede yansır.
//
// ÖLÇÜ (arena birimi; savaşçı ≈1.5 birim): ayar "kaç kat" değil "ne kadar
// yüksek" sorusuna bağlandı — hedef çim ×2.4 / çalı ×2.0, ama sonuç yükseklik
// TAVANIYLA sınırlanır (çim ≤1.1, çalı ≤0.8). Yani çim karakterin beline kadar
// uzar, üstünü asla kapatmaz; tavan ölçümü arena ölçeğinden türetilir
// (`arenaFitScale`, BattleMapModel'in fit kuralının aynısı).
//
// ⚠️ EN ÖNEMLİ AYRINTI — ÖLÇEK KÜME BAŞINA UYGULANIR: haritadaki çim/çalı
// mesh'i tek bir bitki değil, haritaya yayılmış bir YAMAdır (içinde onlarca
// ayrı küme). Ölçek yamanın kutusundan uygulanırsa kümeler yama merkezinden
// DIŞA SAVRULUR ve ortak bir taban kotuna göre havaya kalkar — "suyun üstünde
// duran bitkiler" bu hatanın sonucuydu. Bu yüzden her küme üçgen
// bağlantılarından ayrı ayrı bulunup KENDİ tabanından büyütülür. Bitki hiçbir
// zaman taşınmaz/silinmez: haritacının koyduğu yerde, kendi kökünden büyür.
//
// 🌬️ RÜZGÂR: sapma vertex gölgelendiricisinde, tepe noktasının TABANDAN
// yüksekliğiyle orantılı uygulanır → kökler sabit, uçlar salınır. İki frekans
// (yavaş esinti + hızlı titreşim) ve küme başına faz → tarlada ilerleyen dalga.
// Maliyeti ek çizim/geometri değil, yalnızca vertex hesabıdır.
//
// FİZİK: bitki örtüsü engel ızgarasının (`buildCollisionGrid`) hem engel
// sözlüğünden hem yürünebilir zemin maskesinden KASITLI olarak dışlanır
// (ENVIRONMENT_CONTAINER_RE → grass|foliage|bush|plant|tree...), yani büyüyen
// ve salınan çim ne yürünebilirliği değiştirir ne görünmez duvar üretir.
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, type ReactElement } from "react";
import {
  FOLIAGE_MAX_H,
  FOLIAGE_SCALE,
  FOLIAGE_WIND,
  FOLIAGE_WIND_AMP,
  scaleMapFoliage,
} from "./mapDecorScale";
import { MAP_URL } from "./WarAtmosphere";

/** Yaşam hareketi tercihini okur (SSR/güvenli erişim). */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Salınım saati: paylaşılan tek uniform'u ilerletir. Kare başına bir toplama —
 * her çim mesh'i için ayrı iş yapılmaz (shader tarafı `uWindTime`'ı okur).
 */
function FoliageWindDriver(): null {
  useFrame((_, delta) => {
    // Sekme arka plana atıldığında `delta` sıçrayabilir: tek karede büyük
    // atlama, çimi ışınlanmış gibi sıçratırdı — bu yüzden kırpılır. Sayaç
    // sarılır (mod): uzun oturumda float hassasiyeti sinüste kaybolmasın.
    FOLIAGE_WIND.value = (FOLIAGE_WIND.value + Math.min(delta, 0.05)) % 1000;
  });
  return null;
}

export function MapFoliagePass(): ReactElement {
  const { scene } = useGLTF(MAP_URL);

  useLayoutEffect(() => {
    const out = scaleMapFoliage(scene);
    if (prefersReducedMotion()) FOLIAGE_WIND_AMP.value = 0;
    // Teşhis: bir kez büyütülür (sahne başına işaretli), sahne yeniden
    // kullanıldığında 0 döner — yani satır "ikinci kez şişmedi"nin kanıtıdır.
    // Yükseklikler arena biriminde (savaşçı ≈1.5) yazılır.
    console.log(
      `[mapFoliageScale] ${out.meshes} yama / ${out.clumps} yaprak parçası ` +
        `büyütüldü (çim ×${FOLIAGE_SCALE.grass.xz}/${FOLIAGE_SCALE.grass.y} — ` +
        `${out.grass} yama, çalı ×${FOLIAGE_SCALE.bush.xz}/` +
        `${FOLIAGE_SCALE.bush.y} — ${out.bush} yama) · ortanca yükseklik ` +
        `${out.heightBefore.toFixed(2)} → ${out.heightAfter.toFixed(2)} ` +
        `arena birimi (tavan: çim ${FOLIAGE_MAX_H.grass}, ` +
        `çalı ${FOLIAGE_MAX_H.bush}; kısılan ${out.capped}) · ` +
        
        `rüzgâr ${out.windMaterials} materyalde bağlı` +
        (prefersReducedMotion() ? " (hareket azaltma: sabit)" : ""),
    );
  }, [scene]);

  return <FoliageWindDriver />;
}
