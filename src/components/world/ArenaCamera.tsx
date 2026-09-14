// Aspect-aware arena follow camera — Wild Rift style.
//
// The battle-map GLB is fitted as a ROTATED (diamond) island, so a tall
// portrait viewport only ever showed its central lane and the original fixed
// framing (60° vertical FOV, ~57° elevation, 12 units back) looked right
// there. On a landscape viewport that same vertical FOV opens a ~100°
// horizontal cone: the near edge of the arena balloons while the far corner
// collapses to a point, so the map read as a squashed pyramid instead of a
// battlefield. Pulling the camera far back fixed the pyramid but exposed the
// void around the island, which read as a floating diorama.
//
// What this controller guarantees:
//   1. Responsive — the projection is re-derived from the renderer's live
//      size, so a resize or an orientation change can never leave the camera
//      with a stale aspect (that stale aspect IS the "stretched map" bug:
//      world→screen x/y are scaled differently).
//   2. Aspect ratio — `camera.aspect` is always set from the real drawing
//      buffer, so geometry keeps its proportions on every device.
//   3. Landscape lens — instead of backing away, the wide view uses a longer
//      lens (42° FOV) at a close follow distance (8.7 units) from a 37° MOBA
//      pitch (35–40° requested). The camera height is about half the old
//      framing (~5.2 units), so only the player and the 10–15 m around them
//      are visible — never the whole map.
//   4. Atmosphere — outside the arena are near-black, and a dense FogExp2
//      (0x0a0a12, tuned by FOG_DENSITY) swallows anything approaching the
//      frustum border, so the "space around the island" is gone. Portrait is
//      untouched: fog density 0 + the original sky-blue background.
//   5. Tracking — the camera is a close offset follow (player X/Z plus a
//      small movement lookahead), then clamped to a thin margin inside the
//      arena, so the player always sits near screen center and the map's
//      dark, fogged edge can never dominate the view.
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
// Landscape is a closer, longer lens from an isometric 45° elevation: only
// the player's surroundings and the lane are in view, so the open void
// around the island never appears.
const FOV_P = 60;
const FOV_L = 42; // 40–45 requested: a tighter lens keeps the map proportioned
const DIST_P = 12;
const DIST_L = 8.7; // very close follow: height ~5.2, back ~6.9 (offset style)
const EL_P = 1.0; // ~57° elevation (portrait, unchanged)
const EL_L = 0.6458; // 37° MOBA pitch (35–40°) — behind-and-above, not top-down
const CLAMP_P = 3;
// The -90° map runs its lane from the red base (~z 2) to the blue base
// (~z 20) diagonally, so landscape must let the camera follow the player the
// whole way; only a thin margin keeps it from leaving the island outright.
const CLAMP_L = 2.2;
// Lookahead (units the camera leads the fighter) — smaller lens, smaller lead.
const LOOK_P = 1.1;
const LOOK_L = 1.6;
// Fog: dense dark haze in landscape so anything at/behind the map edge melts
// into the background instead of reading as "island floating in space".
const SKY = new THREE.Color("#aacde4"); // portrait sky (unchanged)
const FOG = new THREE.Color("#0a0a12"); // landscape horizon = fog color
const FOG_DENSITY = 0.015; // FogExp2 density at full landscape

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
  const scene = useThree((s) => s.scene);

  const target = useRef(new THREE.Vector3(CX, 0.6, CZ));
  const smoothed = useRef(new THREE.Vector3(CX, 0.6, CZ));
  // Smoothed world-space velocity (units/s) used for the lookahead.
  const vel = useRef({ x: 0, z: 0 });
  const prev = useRef({ x: 0, z: 0, ready: false });
  // Reusable fog/background state (no per-frame allocation).
  const fog = useRef<THREE.FogExp2 | null>(null);
  const bg = useRef<THREE.Color | null>(null);

  // Orientation changes and window resizes are handled by the renderer's own
  // resize observer, but we also re-assert the projection (and atmosphere)
  // right away so the new aspect is applied on the very next frame instead of
  // after a measure tick (otherwise a rotated phone renders one stale frame).
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
    const smoothK = THREE.MathUtils.lerp(5, 7, wide);

    // --- atmosphere: fog fades in with the landscape view, background lerps
    // from the portrait sky to the fog color so the horizon never shows the
    // gray/blue void around the island. Portrait stays pixel-identical
    // (density 0 + original sky).
    if (!fog.current) {
      fog.current = new THREE.FogExp2(FOG.getHex(), 0);
      scene.fog = fog.current;
    }
    fog.current.density = FOG_DENSITY * wide;
    if (scene.background instanceof THREE.Color) {
      bg.current = scene.background;
    } else if (!bg.current) {
      bg.current = new THREE.Color(SKY);
      scene.background = bg.current;
    }
    bg.current.lerpColors(SKY, FOG, wide);

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
    const lead = speed > 0.05 ? Math.min(look, speed * 0.25) : 0;
    const lx = speed > 0.05 ? (vel.current.x / speed) * lead : 0;
    const lz = speed > 0.05 ? (vel.current.z / speed) * lead : 0;

    // Tight lookAt binding: the target sits on the player's X/Z (plus the
    // lookahead), nudged toward the lane center only in portrait. In
    // landscape the camera centers exactly on the player, then both are
    // clamped so the visible ground always stays over the map.
    const centerNudge = (CZ - pz) * 0.22 * (1 - wide);
    target.current.set(
      THREE.MathUtils.clamp(px + lx, clamp, ARENA_W - clamp),
      0.6,
      THREE.MathUtils.clamp(pz + centerNudge + lz, clamp, ARENA_D - clamp),
    );
    smoothed.current.lerp(target.current, Math.min(1, dt * smoothK));
    camera.position.set(
      smoothed.current.x,
      smoothed.current.y + Math.sin(el) * dist,
      smoothed.current.z + Math.cos(el) * dist,
    );
    camera.lookAt(smoothed.current);
  });
}