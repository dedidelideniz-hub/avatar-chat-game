// Aspect-aware arena follow camera — Wild Rift style.
//
// The battle-map GLB is fitted as a ROTATED (diamond) island, so a tall
// portrait viewport only ever showed its central lane and the original fixed
// framing (60° vertical FOV, ~57° elevation, 12 units back) looked right
// there. On a landscape viewport that same vertical FOV opens a ~100°
// horizontal cone: the near edge of the arena balloons while the far corner
// collapses to a point, so the map read as a squashed pyramid instead of a
// battlefield.
//
// What this controller guarantees:
//   1. Responsive — the projection is re-derived from the renderer's live
//      size, so a resize or an orientation change can never leave the camera
//      with a stale aspect (that stale aspect IS the "stretched map" bug:
//      world→screen x/y are scaled differently).
//   2. Aspect ratio — `camera.aspect` is always set from the real drawing
//      buffer, so geometry keeps its proportions on every device.
//   3. Camera — smooth (exponential) follow with lookahead in the direction
//      the fighter is actually moving, so you see where you are heading.
//   4. View — portrait keeps the original close framing untouched; as the
//      viewport widens the lens pulls back and rises (60°→48° FOV,
//      12→19.5 units, 57°→62.5° elevation) so the whole lane is visible
//      instead of the map feeling cramped.
//
// The arena constants below must stay in sync with Arena3D (`S`) and
// BattleMapModel.tsx — they mirror that file's export convention.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
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

// Portrait framing (unchanged) → landscape framing.
const FOV_P = 60;
const FOV_L = 48; // longer lens: the wide cone flattens the perspective
const DIST_P = 12;
const DIST_L = 19.5; // pulled back so the whole arena fits when it is wide
const EL_P = 1.0; // ~57° elevation
const EL_L = 1.09; // ~62.5° — a touch more top-down when the view is wide
const CLAMP_P = 3;
const CLAMP_L = 6; // a wide viewport sees both side lanes at once
// Lookahead (units the camera leads the fighter) — MOBA anticipation.
const LOOK_P = 1.1;
const LOOK_L = 3.2;

/**
 * Follows the player with an aspect-aware framing. Called from the player's
 * fighter rig — i.e. mounted after `<FollowCamera>` inside the Canvas — so its
 * `useFrame` runs later in the frame and its camera placement is the one that
 * is rendered. Pass `null` for rigs that must not drive the camera (the bot).
 */
export function useArenaCamera(
  playerRef: MutableRefObject<{ x: number; y: number }> | null,
) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);

  const target = useRef(new THREE.Vector3(CX, 0.6, CZ));
  const smoothed = useRef(new THREE.Vector3(CX, 0.6, CZ));
  // Smoothed world-space velocity (units/s) used for the lookahead.
  const vel = useRef({ x: 0, z: 0 });
  const prev = useRef({ x: 0, z: 0, ready: false });
  // Orientation changes and window resizes are handled by the renderer's own
  // resize observer, but we also re-assert the projection right away so the
  // new aspect is applied on the very next frame instead of after a measure
  // tick (otherwise a rotated phone renders one stretched frame).
  useEffect(() => {
    const sync = () => {
      // The canvas' own CSS box is the authoritative size: whatever the
      // renderer ends up with, the projection matches it exactly.
      const el = gl.domElement;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      const aspect = w / h;
      if (camera.aspect !== aspect) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    window.visualViewport?.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, [camera, gl]);

  useFrame((state, rawDt) => {
    const f = playerRef ? playerRef.current : null;
    if (!f) return;

    // --- responsive projection: never render a stale (stretched) aspect ---
    // `state.size` is R3F's live measured size (updates on resize and on
    // orientation change), so the projection always matches the canvas.
    const aspect = state.size.width / Math.max(1, state.size.height);
    if (Number.isFinite(aspect) && aspect > 0) {
      const wideF = THREE.MathUtils.clamp(
        (aspect - WIDE_FROM) / (WIDE_TO - WIDE_FROM),
        0,
        1,
      );
      const fov = THREE.MathUtils.lerp(FOV_P, FOV_L, wideF);
      if (
        Math.abs(camera.aspect - aspect) > 1e-4 ||
        Math.abs(camera.fov - fov) > 1e-4
      ) {
        camera.aspect = aspect;
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
    const wide = THREE.MathUtils.clamp(
      (aspect - WIDE_FROM) / (WIDE_TO - WIDE_FROM),
      0,
      1,
    );
    const el = THREE.MathUtils.lerp(EL_P, EL_L, wide);
    const dist = THREE.MathUtils.lerp(DIST_P, DIST_L, wide);
    const clamp = THREE.MathUtils.lerp(CLAMP_P, CLAMP_L, wide);
    const look = THREE.MathUtils.lerp(LOOK_P, LOOK_L, wide);

    // --- delta-time based (frame rate independent) ---
    const dt = Math.min(rawDt, 1 / 20);
    const px = f.x / S;
    const pz = f.y / S;
    if (prev.current.ready) {
      const k = 1 - Math.exp(-dt * 6);
      vel.current.x += ((px - prev.current.x) / dt - vel.current.x) * k;
      vel.current.z += ((pz - prev.current.z) / dt - vel.current.z) * k;
    } else {
      prev.current.ready = true;
    }
    prev.current.x = px;
    prev.current.z = pz;

    // Lead the camera by an amount proportional to the current speed, capped
    // so a dash does not yank the view and a stand-still does not drift.
    const speed = Math.hypot(vel.current.x, vel.current.z);
    const lead = speed > 0.05 ? Math.min(look, speed * 0.3) : 0;
    const lx = speed > 0.05 ? (vel.current.x / speed) * lead : 0;
    const lz = speed > 0.05 ? (vel.current.z / speed) * lead : 0;

    // Follow the player (looking ahead), then clamp so the camera stays over
    // the map instead of drifting past the island edge into the void.
    target.current.set(
      THREE.MathUtils.clamp(px + lx, clamp, ARENA_W - clamp),
      0.6,
      THREE.MathUtils.clamp(
        pz + (CZ - pz) * 0.22 + lz,
        clamp,
        ARENA_D - clamp,
      ),
    );
    smoothed.current.lerp(target.current, Math.min(1, dt * 5));
    camera.position.set(
      smoothed.current.x,
      smoothed.current.y + Math.sin(el) * dist,
      smoothed.current.z + Math.cos(el) * dist,
    );
    camera.lookAt(smoothed.current);
  });
}
