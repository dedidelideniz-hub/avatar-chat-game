import { Suspense } from "react";
import { GlbModelBoundary } from "@/engine/GlbAvatar3D";
import { StylizedBushModel } from "@/components/world/StylizedBushModel";
import type { BattleObstacle } from "@/components/world/Arena3D";

const S = 100;

export function ArenaBushModels({
  obstacles,
}: {
  obstacles: readonly BattleObstacle[];
}) {
  return (
    <GlbModelBoundary fallback={null}>
      <Suspense fallback={null}>
        <group>
          {obstacles
            .filter((obstacle) => obstacle.kind === "bush")
            .map((obstacle, index) => {
              const width = obstacle.w / S;
              const depth = obstacle.h / S;
              const position: [number, number, number] = [
                obstacle.x / S + width / 2,
                0,
                obstacle.y / S + depth / 2,
              ];
              return (
                <StylizedBushModel
                  key={`${obstacle.x}-${obstacle.y}-${index}`}
                  position={position}
                  width={width}
                  depth={depth}
                />
              );
            })}
        </group>
      </Suspense>
    </GlbModelBoundary>
  );
}
