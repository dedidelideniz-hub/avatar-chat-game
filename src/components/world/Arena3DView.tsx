// ⚡ Memoize edilmiş 3D arena.
//
// NEDEN: Savaş sahneleri HUD'ı React state'inde tutar (`setHud` saniyede birkaç
// kez, `setClock` saniyede bir). Bu state değişimleri ebeveyn bileşeni yeniden
// çizer ve memo olmadan `<Arena3D>` de yeniden çizilirdi — yani harita, iki
// dövüşçü ve ~300 öğelik mermi/efekt havuzlarının JSX ağacı her HUD
// güncellemesinde baştan kurulup uzlaştırılırdı (React element üretimi + three
// reconciler işi = ana iş parçacığında takılma).
//
// ÇÖZÜM: Arena3D'nin tüm canlı verisi ref'lerden okunur (kare döngüsü
// `playerRef.current` vb. okur), dolayısıyla yeniden render'a hiç ihtiyacı
// yoktur. Bu sarmalayıcı ref'ler aynı kaldığı sürece yeniden render'ı atlar;
// alt ağaç (BattleMapModel, FighterRig, ProjectilePool, FxPool) da atlanır.
//
// `onWorldClick`: ebeveyn her çizimde yeni bir closure oluşturur
// (`(x, y) => actionsRef.current.click(x, y)`) ama gövdesi yalnızca bir ref'i
// okur — render kapsamındaki hiçbir değere bağlı değildir. Bu yüzden ilk
// closure'ın saklanması güvenlidir ve karşılaştırıcıda kimliği yok sayılır.
import { memo } from "react";
import { Arena3D as BaseArena3D } from "@/components/world/Arena3D";

export const Arena3DView = memo(
  BaseArena3D,
  (prev, next) =>
    prev.playerRef === next.playerRef &&
    prev.botRef === next.botRef &&
    prev.projsRef === next.projsRef &&
    prev.fxsRef === next.fxsRef &&
    prev.aimRef === next.aimRef,
);
