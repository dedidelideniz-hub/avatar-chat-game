// 🗺️ New battle map — the user's uploaded 5v5_game_map.glb environment.
//
// The GLB is a large MOBA-style battlefield (two spawn bases on opposite
// corners, terrain, rivers, decorations). We fit the WHOLE walkable map
// into the arena without stretching it:
//
//   * rotate -135° around Y so the Red base ends up at the top of the
//     screen and the Blue base at the bottom (they align on x ≈ 0 after
//     rotation, matching how the player/bot spawn vertically);
//   * uniform scale k = 11 / rotatedDepth so the battlefield exactly fills
//     the arena depth (the slightly narrower width keeps the map's aspect
//     intact — the side margins show the dark floor plate, like the old
//     stadium border);
//   * lift the model so its walkable terrain top (model y ≈ -8.9) lands on
//     y = 0, where the fighters' feet stand.
//
// Gameplay (movement bounds, bush stealth, projectiles) is untouched — the
// GLB is purely the environment layer underneath the existing sim.
import { Suspense, useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";

const MAP_URL = "/models/5v5_game_map.glb";

// Fitted against the GLB geometry: rotated ground spans x -21128..20019
// and z -21324..24395, so k = 11 / 45719 centers it in the 17 × 11 arena.
const K = 11 / 45719;
const ROT_Y = (-135 * Math.PI) / 180;
const POS_X = 8.5 - ((-21128 + 20019) / 2) * K;
const POS_Z = 5.5 - ((-21324 + 24395) / 2) * K;
// Walkable terrain tops sit around model y ≈ -8.9; raise the model so the
// ground plane coincides with y = 0 (fighter feet level).
const POS_Y = 8.9 * K;

function MapModel() {
  const { scene } = useGLTF(MAP_URL);
  // Clone so double-mounts / fast refresh never share a disposed scene.
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);

  useEffect(() => {
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      // The map is a static environment with its own baked look — let the
      // fighters / FX stay crisp without paying for real-time shadow
      // passes over 170k triangles of terrain.
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
    });
  }, [clone]);

  return <primitive object={clone} />;
}

export function BattleMapModel() {
  return (
    <group
      position={[POS_X, POS_Y, POS_Z]}
      rotation={[0, ROT_Y, 0]}
      scale={K}
    >
      <Suspense fallback={null}>
        <MapModel />
      </Suspense>
    </group>
  );
}

useGLTF.preload(MAP_URL);
