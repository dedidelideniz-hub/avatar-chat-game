// 🌿 mapFoliage — haritanın KENDİ çim/çalı mesh'lerini büyütür.
//
// NEDEN AYRI GEÇİŞ: `mapDecorScale` (MapPalette içinde, layout effect) haritanın
// dekorunu TEK oranla (×0.52) küçültüyor — çim de ağaçlarla aynı oranda
// kırpılıyordu, oysa referans karede çim diz boyu ve gür. Büyütme mantığı
// `mapDecorScale → scaleMapFoliage` içinde yaşar (aynı geometri-pivot tekniği:
// taban yere basar, obje yatayda yerinde kalır); buradaki bileşen yalnızca
// DOĞRU ANDA çağırır.
//
// SIRA: `BattleMapGuard` bu bileşeni `MapPalette`'ten SONRA render eder.
// Aynı `Suspense` içinde oldukları ve layout effect'ler ağaç sırasına göre
// çalıştığı için çim büyütme, dekor küçültmesi BİTTİKTEN sonra uygulanır.
// Harita klonu geometriyi referansla paylaştığı için (SkeletonUtils.clone)
// değişiklik ekrandaki haritaya da aynı karede yansır.
//
// FİZİK: bitki örtüsü engel ızgarasının (`buildCollisionGrid`) hem engel
// sözlüğünden hem yürünebilir zemin maskesinden KASITLI olarak dışlanır
// (ENVIRONMENT_CONTAINER_RE → grass|foliage|bush|plant|tree...), yani büyüyen
// çim ne yürünebilirliği değiştirir ne görünmez duvar üretir.
//
// ÖLÇÜ: yalnızca XZ (genişlik) ve Y (yükseklik) çarpanlarıdır ve etkin ölçek
// 1'in ALTINDA kalır — çim ≈0.67 / 0.78, çalı ≈0.60 / 0.66. Yani modelleyicinin
// insan ölçeğinde çizdiği bitki asla geçilmez: çim karakteri yutamaz.
import { useGLTF } from "@react-three/drei";
import { useLayoutEffect } from "react";
import { FOLIAGE_SCALE, scaleMapFoliage } from "./mapDecorScale";
import { MAP_URL } from "./WarAtmosphere";

export function MapFoliagePass(): null {
  const { scene } = useGLTF(MAP_URL);

  useLayoutEffect(() => {
    const out = scaleMapFoliage(scene);
    // Teşhis: bir kez büyütülür (sahne başına işaretli), sahne yeniden
    // kullanıldığında 0 döner — yani satır "ikinci kez şişmedi"nin kanıtıdır.
    console.log(
      `[mapFoliageScale] ${out.groups} bitki grubu / ${out.meshes} mesh ` +
        `büyütüldü (çim ×${FOLIAGE_SCALE.grass.xz}/${FOLIAGE_SCALE.grass.y} — ` +
        `${out.grass} grup, çalı ×${FOLIAGE_SCALE.bush.xz}/` +
        `${FOLIAGE_SCALE.bush.y} — ${out.bush} grup)`,
    );
  }, [scene]);

  return null;
}
