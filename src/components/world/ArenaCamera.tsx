// Aspect-aware arena follow camera.
//
// The battle-map GLB is fitted as a ROTATED (diamond) island, so a tall
// portrait viewport only ever showed its central lane and the original fixed
// framing (60° vertical FOV, ~57° elevation, 12 units back) looked right
// there. On a landscape viewport that same vertical FOV opens a ~100°
// horizontal cone: the near edge of the arena balloons while the far corner
// collapses to a point, so the map read as a squashed pyramid instead of a
// battlefield.
//
// This camera keeps portrait exactly as it was and interpolates toward a
// flatter, slightly pulled-back framing as the viewport gets wider:
//   FOV 60° → 43° (longer lens), distance 12 → 18, elevation 57° → 66°.
// Apparent fighter size stays about the same, but the perspective flattens
// (near/far distance ratio drops from ~3:1 to ~1.7:1), which is what makes a
// landscape view read as a proper top-down battlefield instead of a wedge.
//
// The arena constants below must stay in sync with Arena3D (`S`) and
// BattleMapModel.tsx — they mirror that file's export convention.
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";

const S = 50; // px per 3D unit — must match Arena3D
const ARENA_W = 34;
const ARENA_D = 22;
const CX = ARENA_W / 2;
const CZ = ARENA_D / 2;

// Portrait (aspect ≤ 0.9) → landscape (aspect ≥ 1.8) blend.
const WIDE_FROM = 0.9;
const WIDE_TO = 1.8;

/**
 * Follows the player with an aspect-aware framing. Called from the player's
 * fighter rig — i.e. mounted after `<FollowCamera>` inside the Canvas — so its
 * `useFrame` runs later in the frame and its camera placement is the one that
 * is rendered. Pass `null` for rigs that must not drive the camera (the bot).
 */
export function useArenaCamera(
  playerRef: MutableRefObject<{ x: number; y: number }> | null,
) {
  const target = useRef(new THREE.Vector3(CX, 0.6, CZ));
  const smoothed = useRef(new THREE.Vector3(CX, 0.6, CZ));

  useFrame((state, dt) => {
    const f = playerRef ? playerRef.current : null;
    if (!f) return;

    // Framing is derived from the live viewport so it follows orientation
    // changes and window resizes without any extra React state.
    const wide = THREE.MathUtils.clamp(
      (state.size.width / Math.max(1, state.size.height) - WIDE_FROM) /
        (WIDE_TO - WIDE_FROM),
      0,
      1,
    );
    const el = THREE.MathUtils.lerp(1.0, 1.152, wide); // 57° → 66° elevation
    const dist = THREE.MathUtils.lerp(12, 18, wide);
    const fov = THREE.MathUtils.lerp(60, 43, wide);
    // Keep the camera pointing inside the arena so we never look past the map
    // edge into the void around the island. A wide viewport can see the
    // arena's side corners at once, so it needs the wider safety margin.
    const clamp = THREE.MathUtils.lerp(3, 6, wide);

    const camera = state.camera as THREE.PerspectiveCamera;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // Follow the player, nudged a touch toward the enemy lane so you see
    // where you're heading, then clamp so the camera stays over the map.
    target.current.set(
      THREE.MathUtils.clamp(f.x / S, clamp, ARENA_W - clamp),
      0.6,
      THREE.MathUtils.clamp(
        f.y / S + (CZ - f.y / S) * 0.22,
        clamp,
        ARENA_D - clamp,
      ),
    );
    smoothed.current.lerp(target.current, Math.min(1, dt * 4));
    camera.position.set(
      smoothed.current.x,
      smoothed.current.y + Math.sin(el) * dist,
      smoothed.current.z + Math.cos(el) * dist,
    );
    camera.lookAt(smoothed.current);
  });
}
