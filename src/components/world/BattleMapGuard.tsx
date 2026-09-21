import { Suspense } from "react";
import { GlbModelBoundary } from "@/engine/GlbAvatar3D";
import { BattleMapModel as BattlefieldMap } from "./BattleMapModel";
import { MapPalette } from "./WarAtmosphere";
import { MapVividPass } from "./mapVivid";
import { DefenseTowerLayer } from "./arena/DefenseTowers";

/**
 * The battlefield with a crash guard. Previously a map that failed to parse
 * (e.g. a corrupted asset) threw straight through the canvas and killed the
 * whole battle screen — the arena, the HUD and all audio with it. Wrapping the
 * map in the same error boundary the avatars already use turns that into a
 * missing terrain instead of a dead app.
 */
export function BattleMapModel() {
  return (
    <GlbModelBoundary fallback={null}>
      <Suspense fallback={null}>
        {/* SIRA ÖNEMLİ: MapPalette haritadan ÖNCE render edilir. İçindeki
            layout effect'ler ağaç sırasına göre çalıştığı için dekor
            ölçeklemesi + zemin geçişi, BattleMapModel'in engel ızgarasını
            (buildCollisionGrid) kurmasından ÖNCE tamamlanır — küçülen
            kayanın engeli de küçülür, görünmez duvar oluşmaz.
            Zemin geçişi: haritanın KENDİ dokuları (çimen/taş/toprak) korunur;
            yalnızca zemine sonradan binen yansıma ve kendinden parlama
            temizlenir. Aynı Suspense içindedir, GLB hazır olunca çalışır. */}
        <MapPalette />
        {/* CANLI PALET (doygunluk): MapPalette'ten SONRA çalışmak ZORUNDA —
            zemin geçişi ve dekor ölçeklemesi bittikten sonra dokulu
            yüzeylere doygunluk yaması yazılır (layout effect'ler ağaç
            sırasına göre çalışır). Bkz. mapVivid.tsx. */}
        <MapVividPass />
        <BattlefieldMap />
        {/* 🛡️ SAVUNMA KULELERİ: satın alınan kuleler ve boş kule arsaları.
            Arena uzayında (haritanın fit dönüşümünden bağımsız) durur;
            ekonomi/simülasyon `@/engine/BattleTowers` içindedir. Yalnızca
            sahne kule sistemini bağladığında (bot düellosu) görünür. */}
        <DefenseTowerLayer />
      </Suspense>
    </GlbModelBoundary>
  );
}
