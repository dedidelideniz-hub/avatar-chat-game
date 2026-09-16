import { Suspense } from "react";
import { GlbModelBoundary } from "@/engine/GlbAvatar3D";
import { BattleMapModel as BattlefieldMap } from "./BattleMapModel";
import { MapPalette } from "./WarAtmosphere";

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
        <BattlefieldMap />
        {/* Zemin geçişi: haritanın KENDİ dokuları (çimen/taş/toprak) korunur;
            yalnızca zemine sonradan binen yansıma ve kendinden parlama
            temizlenir. Aynı Suspense içindedir, GLB hazır olunca çalışır. */}
        <MapPalette />
      </Suspense>
    </GlbModelBoundary>
  );
}
