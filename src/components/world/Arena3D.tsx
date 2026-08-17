// 🏟️ 3D battle arena — Three.js (react-three-fiber) replacement for the old
// flat SVG arena. Fighters are procedural low-poly humanoids built from the
// player's avatar config (skin / hair / shirt / pants / shoes colors), so
// everyone keeps their own look in 3D. The game simulation stays in
// BattleScene.tsx (plain refs, no React re-renders); this component only
// reads those refs every frame and draws them with Three.js.
//
// The map is a Brawl-Ball-style stadium: checkered grass, goal frames with
// red/blue banners, spawn circles, crates, fences, bushes and barrels in a
// symmetric layout, with a golden ball in the center.
import type { AvatarConfig } from "@/lib/avatar";
import type { AbilityDef } from "@/lib/shop";
import { RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/** Game-space (px) obstacle list — shared with the simulation in BattleScene. */
export type ObstacleKind = "crate" | "fence" | "bush" | "barrel";

export interface BattleObstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: ObstacleKind;
}

/** Symmetric Brawl-Ball-style layout (mirrored top/bottom around y=550). */
export const BATTLE_OBSTACLES: BattleObstacle[] = [
  // corner crate stacks + bushes
  { x: 120, y: 120, w: 105, h: 105, kind: "crate" },
  { x: 120, y: 235, w: 105, h: 105, kind: "crate" },
  { x: 1475, y: 120, w: 105, h: 105, kind: "crate" },
  { x: 1475, y: 235, w: 105, h: 105, kind: "crate" },
  { x: 285, y: 80, w: 100, h: 85, kind: "bush" },
  { x: 1315, y: 80, w: 100, h: 85, kind: "bush" },
  { x: 285, y: 935, w: 100, h: 85, kind: "bush" },
  { x: 1315, y: 935, w: 100, h: 85, kind: "bush" },
  // upper barrier clusters (fence backed by bushes) + mirrored
  { x: 255, y: 300, w: 230, h: 55, kind: "fence" },
  { x: 280, y: 370, w: 130, h: 110, kind: "bush" },
  { x: 1215, y: 300, w: 230, h: 55, kind: "fence" },
  { x: 1290, y: 370, w: 130, h: 110, kind: "bush" },
  { x: 255, y: 745, w: 230, h: 55, kind: "fence" },
  { x: 280, y: 620, w: 130, h: 110, kind: "bush" },
  { x: 1215, y: 745, w: 230, h: 55, kind: "fence" },
  { x: 1290, y: 620, w: 130, h: 110, kind: "bush" },
  // mid rows of three crates above/below the center ball
  { x: 725, y: 440, w: 90, h: 90, kind: "crate" },
  { x: 850, y: 440, w: 90, h: 90, kind: "crate" },
  { x: 975, y: 440, w: 90, h: 90, kind: "crate" },
  { x: 725, y: 570, w: 90, h: 90, kind: "crate" },
  { x: 850, y: 570, w: 90, h: 90, kind: "crate" },
  { x: 975, y: 570, w: 90, h: 90, kind: "crate" },
  // side fences + barrels
  { x: 60, y: 480, w: 190, h: 50, kind: "fence" },
  { x: 1450, y: 480, w: 190, h: 50, kind: "fence" },
  { x: 60, y: 570, w: 190, h: 50, kind: "fence" },
  { x: 1450, y: 570, w: 190, h: 50, kind: "fence" },
  { x: 330, y: 560, w: 80, h: 80, kind: "barrel" },
  { x: 1290, y: 560, w: 80, h: 80, kind: "barrel" },
  { x: 330, y: 460, w: 80, h: 80, kind: "barrel" },
  { x: 1290, y: 460, w: 80, h: 80, kind: "barrel" },
  // mid fences + bushes near sides
  { x: 110, y: 450, w: 160, h: 50, kind: "fence" },
  { x: 140, y: 310, w: 120, h: 100, kind: "bush" },
  { x: 1430, y: 450, w: 160, h: 50, kind: "fence" },
  { x: 1440, y: 310, w: 120, h: 100, kind: "bush" },
  { x: 110, y: 600, w: 160, h: 50, kind: "fence" },
  { x: 140, y: 690, w: 120, h: 100, kind: "bush" },
  { x: 1430, y: 600, w: 160, h: 50, kind: "fence" },
  { x: 1440, y: 690, w: 120, h: 100, kind: "bush" },
];

/** Base attack cooldown (seconds) — shared with the sim and the aim guides. */
export const ATK_CD = 0.85;

/** True when the browser can render WebGL (used to pick 3D vs 2D arena). */
export function supportsWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

/** World px → 3D units. */
const S = 100;
const ARENA_W = 17; // 1700 px
const ARENA_D = 11; // 1100 px
const CX = ARENA_W / 2;
const CZ = ARENA_D / 2; // z = +y/S so the map is NOT mirrored (up = up)

export interface BattleFighter {
  name: string;
  config: AvatarConfig;
  equipped: string[];
  ability: AbilityDef;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  facing: number;
  phase: number;
  moving: boolean;
  atkCd: number;
  superCharge: number;
  dashT: number;
  dashVX: number;
  dashVY: number;
  dashHit: boolean;
  lastHitAt: number;
}

export interface BattleProj {
  owner: "player" | "bot";
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  r: number;
  travelled: number;
  pierce: boolean;
  explodeR?: number;
}

export type BattleFx =
  | {
      kind: "text";
      x: number;
      y: number;
      ttl: number;
      maxTtl: number;
      text: string;
      color: string;
    }
  | {
      kind: "ring";
      x: number;
      y: number;
      ttl: number;
      maxTtl: number;
      grow: number;
      color: string;
    }
  | {
      kind: "burst";
      x: number;
      y: number;
      ttl: number;
      maxTtl: number;
      grow: number;
      color: string;
    }
  | {
      kind: "beam";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      ttl: number;
      maxTtl: number;
    }
  | {
      kind: "smoke";
      x: number;
      y: number;
      ttl: number;
      maxTtl: number;
      grow: number;
      color: string;
    };

const PROJ_POOL = 26;
const TEXT_POOL = 8;
const RING_POOL = 12;
const BURST_POOL = 8;
const BEAM_POOL = 2;
const SMOKE_POOL = 22;

/* ------------------------------------------------------------------ */
/* Fighters — procedural low-poly humanoid built from avatar colors.   */
/* ------------------------------------------------------------------ */

function makeBarTex() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 10;
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}

/** Rounded-rect path — works even on browsers without ctx.roundRect. */
function roundedRectPath(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  g.moveTo(x + rad, y);
  g.arcTo(x + w, y, x + w, y + h, rad);
  g.arcTo(x + w, y + h, x, y + h, rad);
  g.arcTo(x, y + h, x, y, rad);
  g.arcTo(x, y, x + w, y, rad);
  g.closePath();
}

/** Trace a rounded rect using ctx.roundRect when available, else manually. */
function traceRoundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (typeof g.roundRect === "function") {
    g.roundRect(x, y, w, h, r);
  } else {
    roundedRectPath(g, x, y, w, h, r);
  }
}

/** Draw one health-bar frame (thin, rounded, gradient + shine). */
function drawBarSprite(tex: THREE.CanvasTexture, pct: number, color: string) {
  const canvas = tex.image as HTMLCanvasElement;
  const g = canvas.getContext("2d");
  if (!g) return;
  const p = Math.max(0, Math.min(1, pct));
  const w = Math.max(4, 124 * p);
  g.clearRect(0, 0, 128, 10);
  // rounded dark background
  g.beginPath();
  traceRoundRect(g, 0, 0, 128, 10, 4);
  g.fillStyle = "rgba(8,12,26,0.88)";
  g.fill();
  // gradient fill with a shine line on top
  const grad = g.createLinearGradient(0, 0, 0, 10);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.3, color);
  grad.addColorStop(1, color);
  g.save();
  g.beginPath();
  traceRoundRect(g, 2, 2, w, 6, 3);
  g.clip();
  g.fillStyle = grad;
  g.fillRect(2, 2, 124, 6);
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.fillRect(2, 2, w, 1.8);
  g.restore();
  // white border
  g.strokeStyle = "rgba(255,255,255,0.92)";
  g.lineWidth = 1.2;
  g.beginPath();
  traceRoundRect(g, 1, 1, 126, 8, 4);
  g.stroke();
  tex.needsUpdate = true;
}

/** Lightning-bolt sprite texture (white core + cyan glow) for the player's
 *  electric-strike effect around the identity ring. */
function makeBoltTexture() {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 192;
  const g = c.getContext("2d");
  const t = new THREE.CanvasTexture(c);
  if (!g) return t;
  // deterministic jagged bolt — zigzag from top to bottom + one branch
  const pts: [number, number][] = [];
  let bx = 48;
  for (let y = 10; y <= 186; y += 18) {
    bx += (Math.random() - 0.5) * 46;
    bx = Math.max(18, Math.min(78, bx));
    pts.push([bx, y]);
  }
  const stroke = (width: number, color: string, blur: number) => {
    g.beginPath();
    g.moveTo(48, 2);
    for (const [px, py] of pts) g.lineTo(px, py);
    g.lineTo(48, 190);
    g.lineWidth = width;
    g.strokeStyle = color;
    g.shadowColor = blur > 0 ? "#22d3ee" : "transparent";
    g.shadowBlur = blur;
    g.stroke();
    // side branch for a more "lightning" silhouette
    g.beginPath();
    g.moveTo(pts[3][0], pts[3][1]);
    g.lineTo(pts[3][0] + 20, pts[3][1] + 24);
    g.lineTo(pts[3][0] + 13, pts[3][1] + 42);
    g.lineWidth = width * 0.7;
    g.stroke();
  };
  stroke(10, "rgba(34,211,238,0.55)", 14);
  stroke(4, "#e0f2fe", 0);
  return t;
}

function FighterRig({
  fighter,
  isPlayer = false,
}: {
  fighter: MutableRefObject<BattleFighter>;
  isPlayer?: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const bob = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const flashMat = useRef<THREE.MeshStandardMaterial>(null);
  const hpFill = useRef<THREE.Sprite>(null);
  const hpGhost = useRef<THREE.Sprite>(null);
  const barGroup = useRef<THREE.Group>(null);
  const hpFillTex = useMemo(makeBarTex, []);
  const hpGhostTex = useMemo(makeBarTex, []);
  // animated display values — lerp toward the real hp every frame
  const dispHp = useRef(-1);
  const ghostHp = useRef(-1);
  const lastBarKey = useRef("");
  // spinning "this is you" ring under the player's feet
  const ringSpin = useRef<THREE.Group>(null);
  const ringDisc = useRef<THREE.Mesh>(null);
  // electric strikes — lightning bolt sprites + expanding shockwave
  const boltTex = useMemo(makeBoltTexture, []);
  const boltPool = useRef<(THREE.Sprite | null)[]>([null, null, null]);
  const shockRing = useRef<THREE.Mesh>(null);
  const shockMat = useRef<THREE.MeshBasicMaterial>(null);
  const strike = useRef({
    active: false,
    start: 0,
    dur: 180,
    next: performance.now() + 900,
    n: 2,
    angles: [0, 0, 0],
    scales: [1, 1, 1],
    radii: [0.55, 0.7, 0.85],
  });
  const c = fighter.current.config;

  useFrame((_, dt) => {
    const f = fighter.current;
    if (!root.current) return;
    root.current.position.set(f.x / S, 0, f.y / S);
    root.current.rotation.y = f.facing >= 0 ? 0 : Math.PI;
    if (barGroup.current) barGroup.current.position.set(f.x / S, 0, f.y / S);
    // spinning identity ring under the player's feet — dashed ring + orbit
    // dot turning around them, with a soft pulsing glow disc
    if (isPlayer && ringSpin.current) {
      ringSpin.current.position.set(f.x / S, 0.035, f.y / S);
      ringSpin.current.rotation.y += dt * 1.7;
      ringSpin.current.scale.setScalar(1 + 0.05 * Math.sin(performance.now() / 240));
      if (ringDisc.current) {
        (ringDisc.current.material as THREE.MeshBasicMaterial).opacity =
          0.15 + 0.07 * Math.sin(performance.now() / 320);
      }
      // --- random electric strikes: jagged lightning + expanding shockwave ---
      const st = strike.current;
      const nowMs = performance.now();
      if (!st.active && nowMs >= st.next) {
        st.active = true;
        st.start = nowMs;
        st.dur = 150 + Math.random() * 130;
        st.n = 2 + (Math.random() < 0.45 ? 1 : 0);
        for (let i = 0; i < 3; i++) {
          st.angles[i] = Math.random() * Math.PI * 2;
          st.scales[i] = 0.8 + Math.random() * 0.7;
          st.radii[i] = 0.35 + Math.random() * 0.7;
        }
        st.next = nowMs + 450 + Math.random() * 900;
        if (shockRing.current) {
          shockRing.current.visible = true;
          shockRing.current.scale.setScalar(0.4);
        }
      }
      if (st.active) {
        const p = Math.min(1, (nowMs - st.start) / st.dur);
        const fade = Math.pow(1 - p, 1.3);
        const flick = 0.6 + 0.4 * Math.sin(nowMs / 26);
        for (let i = 0; i < 3; i++) {
          const sp = boltPool.current[i];
          if (!sp) continue;
          if (i < st.n) {
            sp.visible = true;
            sp.position.set(
              (f.x + Math.cos(st.angles[i]) * st.radii[i]) / S,
              0.85 * st.scales[i],
              (f.y + Math.sin(st.angles[i]) * st.radii[i]) / S,
            );
            sp.rotation.z = st.angles[i] * 2.3 + nowMs * 0.0004;
            sp.scale.set(
              0.62 * st.scales[i],
              (1.6 + 0.25 * Math.sin(nowMs / 29)) * st.scales[i],
              1,
            );
            (sp.material as THREE.SpriteMaterial).opacity = Math.min(
              1,
              fade * flick * 1.1,
            );
          } else {
            sp.visible = false;
          }
        }
        if (shockRing.current && shockMat.current) {
          shockRing.current.position.set(f.x / S, 0.04, f.y / S);
          shockRing.current.scale.setScalar(0.4 + p * 1.1);
          shockMat.current.opacity = (1 - p) * 0.45;
        }
        if (ringDisc.current) {
          (ringDisc.current.material as THREE.MeshBasicMaterial).opacity =
            0.15 + 0.07 * Math.sin(nowMs / 320) + 0.45 * (1 - p);
        }
        if (p >= 1) {
          st.active = false;
          for (let i = 0; i < 3; i++) {
            const sp = boltPool.current[i];
            if (sp) sp.visible = false;
          }
          if (shockRing.current) shockRing.current.visible = false;
        }
      }
    }
    const amp = f.moving ? 1 : 0;
    const t = f.phase;
    if (armL.current) armL.current.rotation.x = Math.sin(t) * 0.75 * amp;
    if (armR.current) armR.current.rotation.x = Math.sin(t + Math.PI) * 0.75 * amp;
    if (legL.current) legL.current.rotation.x = Math.sin(t + Math.PI) * 0.6 * amp;
    if (legR.current) legR.current.rotation.x = Math.sin(t) * 0.6 * amp;
    if (bob.current) {
      // walk bob while moving, gentle breathing while idle
      bob.current.position.y = amp > 0
        ? Math.abs(Math.sin(t)) * 0.09
        : Math.sin(performance.now() / 420) * 0.018;
    }
    if (flashMat.current) {
      const elapsed = performance.now() - f.lastHitAt;
      flashMat.current.opacity = Math.max(0, 0.85 * (1 - elapsed / 350));
    }
    // HP bar pops briefly white when the fighter is hit
    const justHit = performance.now() - f.lastHitAt < 260;
    if (barGroup.current) {
      barGroup.current.scale.setScalar(justHit ? 1.14 : 1);
    }
    // smooth animated health bar + white ghost that trails behind
    const max = f.maxHp;
    if (dispHp.current < 0) {
      dispHp.current = max;
      ghostHp.current = max;
    }
    dispHp.current += (f.hp - dispHp.current) * Math.min(1, dt * 6);
    if (ghostHp.current > dispHp.current + 0.5) {
      ghostHp.current += (dispHp.current - ghostHp.current) * Math.min(1, dt * 1.8);
    } else {
      ghostHp.current = dispHp.current;
    }
    const key = `${Math.round(dispHp.current)}:${Math.round(ghostHp.current)}:${justHit}`;
    if (key !== lastBarKey.current) {
      lastBarKey.current = key;
      const pct = dispHp.current / max;
      const col = pct > 0.5 ? "#22c55e" : pct > 0.25 ? "#eab308" : "#ef4444";
      drawBarSprite(hpFillTex, pct, justHit ? "#ffffff" : col);
      drawBarSprite(hpGhostTex, ghostHp.current / max, "#f8fafc");
    }
  });

  return (
    <>
    <group ref={root} scale={0.72}>
      <group ref={bob}>
        {/* legs + shoes */}
        <group ref={legL} position={[0, 0.5, 0.1]}>
          <RoundedBox args={[0.18, 0.52, 0.2]} radius={0.06} position={[0, -0.26, 0]}>
            <meshStandardMaterial color={c.pants} roughness={0.9} />
          </RoundedBox>
          <RoundedBox args={[0.2, 0.12, 0.32]} radius={0.045} position={[0, -0.54, 0.03]}>
            <meshStandardMaterial color={c.shoes} roughness={0.55} />
          </RoundedBox>
        </group>
        <group ref={legR} position={[0, 0.5, -0.1]}>
          <RoundedBox args={[0.18, 0.52, 0.2]} radius={0.06} position={[0, -0.26, 0]}>
            <meshStandardMaterial color={c.pants} roughness={0.9} />
          </RoundedBox>
          <RoundedBox args={[0.2, 0.12, 0.32]} radius={0.045} position={[0, -0.54, 0.03]}>
            <meshStandardMaterial color={c.shoes} roughness={0.55} />
          </RoundedBox>
        </group>
        {/* torso */}
        <RoundedBox args={[0.54, 0.6, 0.3]} radius={0.13} position={[0, 0.8, 0]} castShadow>
          <meshStandardMaterial color={c.shirt} roughness={0.85} />
        </RoundedBox>
        {/* arms + hands */}
        <group ref={armL} position={[0.33, 0.88, 0]}>
          <RoundedBox args={[0.16, 0.54, 0.18]} radius={0.07} position={[0, -0.27, 0]}>
            <meshStandardMaterial color={c.shirt} roughness={0.85} />
          </RoundedBox>
          <mesh position={[0, -0.52, 0]}>
            <sphereGeometry args={[0.09, 10, 10]} />
            <meshStandardMaterial color={c.skin} roughness={0.8} />
          </mesh>
        </group>
        <group ref={armR} position={[-0.33, 0.88, 0]}>
          <RoundedBox args={[0.16, 0.54, 0.18]} radius={0.07} position={[0, -0.27, 0]}>
            <meshStandardMaterial color={c.shirt} roughness={0.85} />
          </RoundedBox>
          <mesh position={[0, -0.52, 0]}>
            <sphereGeometry args={[0.09, 10, 10]} />
            <meshStandardMaterial color={c.skin} roughness={0.8} />
          </mesh>
        </group>
        {/* head */}
        <group position={[0, 1.3, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.2, 20, 20]} />
            <meshStandardMaterial color={c.skin} roughness={0.75} />
          </mesh>
          {/* eyes + pupils */}
          {[0.075, -0.075].map((sx) => (
            <group key={sx} position={[sx, 0.03, 0.15]}>
              <mesh>
                <sphereGeometry args={[0.05, 10, 10]} />
                <meshStandardMaterial color="#ffffff" roughness={0.3} />
              </mesh>
              <mesh position={[0, 0, 0.035]}>
                <sphereGeometry args={[0.024, 8, 8]} />
                <meshStandardMaterial color="#1f2937" roughness={0.2} />
              </mesh>
            </group>
          ))}
          {/* eyebrows */}
          {[0.075, -0.075].map((sx) => (
            <mesh key={sx} position={[sx, 0.095, 0.165]}>
              <boxGeometry args={[0.075, 0.02, 0.02]} />
              <meshStandardMaterial color={c.hairColor} roughness={0.8} />
            </mesh>
          ))}
          {/* mouth */}
          <mesh position={[0, -0.06, 0.19]}>
            <boxGeometry args={[0.1, 0.022, 0.02]} />
            <meshStandardMaterial color="#8a4a3a" roughness={0.7} />
          </mesh>
          {/* hair styles */}
          {c.hair !== "none" && (
            <group>
              <mesh position={[0, 0.17, 0]} scale={[1.02, 0.72, 1.02]}>
                <sphereGeometry args={[0.2, 18, 18]} />
                <meshStandardMaterial color={c.hairColor} roughness={0.9} />
              </mesh>
              {c.hair === "spiky" &&
                Array.from({ length: 6 }).map((_, i) => {
                  const a = (i / 6) * Math.PI * 2;
                  return (
                    <mesh
                      key={i}
                      position={[Math.cos(a) * 0.13, 0.3, Math.sin(a) * 0.13]}
                      rotation={[Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4]}
                    >
                      <coneGeometry args={[0.055, 0.26, 8]} />
                      <meshStandardMaterial color={c.hairColor} roughness={0.9} />
                    </mesh>
                  );
                })}
              {c.hair === "long" && (
                <mesh position={[0, -0.12, -0.17]}>
                  <boxGeometry args={[0.34, 0.62, 0.13]} />
                  <meshStandardMaterial color={c.hairColor} roughness={0.9} />
                </mesh>
              )}
              {c.hair === "curly" &&
                Array.from({ length: 8 }).map((_, i) => {
                  const a = (i / 8) * Math.PI * 2;
                  return (
                    <mesh key={i} position={[Math.cos(a) * 0.12, 0.26, Math.sin(a) * 0.12]}>
                      <sphereGeometry args={[0.085, 10, 10]} />
                      <meshStandardMaterial color={c.hairColor} roughness={0.95} />
                    </mesh>
                  );
                })}
              {c.hair === "bob" &&
                [0.17, -0.17].map((sx) => (
                  <mesh key={sx} position={[sx, -0.08, 0]}>
                    <boxGeometry args={[0.13, 0.38, 0.34]} />
                    <meshStandardMaterial color={c.hairColor} roughness={0.9} />
                  </mesh>
                ))}
            </group>
          )}
        </group>
        {/* white hit-flash overlay */}
        <RoundedBox args={[0.78, 1.7, 0.55]} radius={0.22} position={[0, 0.85, 0]}>
          <meshStandardMaterial
            ref={flashMat}
            color="#ffffff"
            transparent
            opacity={0}
            roughness={1}
            depthWrite={false}
          />
        </RoundedBox>
      </group>
    </group>
      {/* spinning "this is you" ring under the player's feet */}
      {isPlayer && (
        <>
        <group ref={ringSpin} position={[0, 0.035, 0]}>
          {/* soft sky glow disc on the grass */}
          <mesh
            ref={ringDisc}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => null}
          >
            <circleGeometry args={[0.52, 40]} />
            <meshBasicMaterial
              color="#38bdf8"
              transparent
              opacity={0.18}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          {/* four dashed arcs spinning around the character */}
          {[0, 1, 2, 3].map((i) => (
            <mesh
              key={i}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.012, 0]}
              raycast={() => null}
            >
              <ringGeometry
                args={[0.44, 0.52, 8, 1, (i * Math.PI) / 2, 1.35]}
              />
              <meshBasicMaterial
                color="#7dd3fc"
                transparent
                opacity={0.95}
                blending={THREE.AdditiveBlending}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          ))}
          {/* bright orbiting dot — makes the spin direction obvious */}
          <mesh position={[0.52, 0.02, 0]} raycast={() => null}>
            <sphereGeometry args={[0.055, 12, 12]} />
            <meshBasicMaterial
              color="#e0f2fe"
              transparent
              opacity={1}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
        {/* electric strikes — lightning bolt sprites around the ring */}
        {[0, 1, 2].map((i) => (
          <sprite
            key={i}
            ref={(el) => {
              boltPool.current[i] = el;
            }}
            position={[0, 0.85, 0]}
            scale={[0.6, 1.8, 1]}
            renderOrder={3}
          >
            <spriteMaterial
              map={boltTex}
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        ))}
        {/* expanding shockwave ring on each strike */}
        <mesh
          ref={shockRing}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.04, 0]}
          visible={false}
          raycast={() => null}
        >
          <ringGeometry args={[0.5, 0.57, 40]} />
          <meshBasicMaterial
            ref={shockMat}
            color="#a5f3fc"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        </>
      )}
      {/* health bar above the head — thin, animated, always visible */}
      <group ref={barGroup}>
        <sprite ref={hpGhost} position={[0, 1.55, 0]} scale={[1.02, 0.075, 1]} renderOrder={1}>
          <spriteMaterial map={hpGhostTex} depthTest={false} />
        </sprite>
        <sprite ref={hpFill} position={[0, 1.55, 0]} scale={[1.02, 0.075, 1]} renderOrder={2}>
          <spriteMaterial map={hpFillTex} depthTest={false} />
        </sprite>
      </group>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Projectiles — pooled glowing orbs with a soft halo.                 */
/* ------------------------------------------------------------------ */

function ProjectilePool({
  projsRef,
}: {
  projsRef: MutableRefObject<BattleProj[]>;
}) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const halos = useRef<(THREE.Mesh | null)[]>([]);
  const trails = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const list = projsRef.current;
    for (let i = 0; i < PROJ_POOL; i++) {
      const m = meshes.current[i];
      const h = halos.current[i];
      const tr = trails.current[i];
      const p = list[i];
      if (m) {
        if (p) {
          m.visible = true;
          m.position.set(p.x / S, 0.85, p.y / S);
          (m.material as THREE.MeshStandardMaterial).color.set(
            p.owner === "player" ? "#38bdf8" : "#fb7185",
          );
          (m.material as THREE.MeshStandardMaterial).emissive.set(
            p.owner === "player" ? "#0ea5e9" : "#f43f5e",
          );
        } else {
          m.visible = false;
        }
      }
      if (h) {
        h.visible = !!p;
        if (p) h.position.set(p.x / S, 0.85, p.y / S);
      }
      // glowing energy trail stretched along the flight direction
      if (tr) {
        if (p) {
          tr.visible = true;
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const len = Math.min(0.9, sp * 0.055);
          tr.position.set(
            (p.x - (p.vx / sp) * len * 0.55) / S,
            0.85,
            (p.y - (p.vy / sp) * len * 0.55) / S,
          );
          tr.scale.set(len, 0.06, 0.06);
          tr.rotation.y = Math.atan2(p.vy, p.vx);
          (tr.material as THREE.MeshBasicMaterial).color.set(
            p.owner === "player" ? "#7dd3fc" : "#fda4af",
          );
        } else {
          tr.visible = false;
        }
      }
    }
  });

  return (
    <group>
      {Array.from({ length: PROJ_POOL }).map((_, i) => (
        <group key={i}>
          <mesh
            ref={(el) => {
              meshes.current[i] = el;
            }}
          >
            <sphereGeometry args={[0.15, 12, 12]} />
            <meshStandardMaterial emissive="#0ea5e9" emissiveIntensity={2.2} />
          </mesh>
          <mesh
            ref={(el) => {
              halos.current[i] = el;
            }}
            visible={false}
          >
            <sphereGeometry args={[0.28, 10, 10]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.25} />
          </mesh>
          <mesh
            ref={(el) => {
              trails.current[i] = el;
            }}
            visible={false}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial transparent opacity={0.75} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Effects — damage numbers (canvas sprites), expanding rings, bursts  */
/* and the light-beam attack.                                          */
/* ------------------------------------------------------------------ */

function drawTextSprite(sprite: THREE.Sprite, text: string, color: string) {
  const mat = sprite.material as THREE.SpriteMaterial;
  const tex = mat.map as THREE.CanvasTexture;
  const canvas = tex.image as HTMLCanvasElement;
  canvas.width = 256;
  canvas.height = 96;
  const g = canvas.getContext("2d");
  if (!g) return;
  g.clearRect(0, 0, 256, 96);
  g.font = "900 56px 'Baloo 2', 'Segoe UI', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 12;
  g.lineJoin = "round";
  g.strokeStyle = "#ffffff";
  g.strokeText(text, 128, 48);
  g.fillStyle = color;
  g.fillText(text, 128, 48);
  tex.needsUpdate = true;
}

function FxPool({ fxsRef }: { fxsRef: MutableRefObject<BattleFx[]> }) {
  const textRefs = useRef<(THREE.Sprite | null)[]>([]);
  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);
  const burstRefs = useRef<(THREE.Mesh | null)[]>([]);
  const beamRefs = useRef<(THREE.Mesh | null)[]>([]);
  const smokeRefs = useRef<(THREE.Sprite | null)[]>([]);
  // Canvas textures for the floating damage numbers — created once.
  const textTextures = useMemo(
    () =>
      Array.from({ length: TEXT_POOL }).map(
        () => new THREE.CanvasTexture(document.createElement("canvas")),
      ),
    [],
  );
  // Soft procedural smoke puff texture (radial gradient) — no external files.
  const smokeTexture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(32, 32, 3, 32, 32, 30);
      grad.addColorStop(0, "rgba(255,255,255,0.9)");
      grad.addColorStop(0.55, "rgba(240,240,240,0.5)");
      grad.addColorStop(1, "rgba(210,210,210,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame(() => {
    const fxs = fxsRef.current;
    let ti = 0;
    let ri = 0;
    let bi = 0;
    let mi = 0;
    let si = 0;

    for (const fx of fxs) {
      if (fx.ttl <= 0) continue;
      const t = fx.ttl / fx.maxTtl;

      if (fx.kind === "text") {
        const s = textRefs.current[ti];
        if (s) {
          const key = `${fx.text}|${fx.color}`;
          if (s.userData.key !== key) {
            drawTextSprite(s, fx.text, fx.color);
            s.userData.key = key;
          }
          s.visible = true;
          s.position.set(fx.x / S, 1.7 + (1 - t) * 1.5, fx.y / S);
          (s.material as THREE.SpriteMaterial).opacity = t;
        }
        ti++;
      } else if (fx.kind === "ring") {
        const m = ringRefs.current[ri];
        if (m) {
          m.visible = true;
          m.position.set(fx.x / S, 0.08, fx.y / S);
          const scale = Math.max(0.12, ((fx.grow / S) * (1 - t)) / 1);
          m.scale.setScalar(scale);
          (m.material as THREE.MeshBasicMaterial).opacity = t * 0.9;
        }
        ri++;
      } else if (fx.kind === "burst") {
        const m = burstRefs.current[bi];
        if (m) {
          m.visible = true;
          m.position.set(fx.x / S, 0.55, fx.y / S);
          const scale = Math.max(0.2, ((fx.grow / S) * (1 - t)) / 1);
          m.scale.setScalar(scale);
          (m.material as THREE.MeshBasicMaterial).opacity = t * 0.85;
        }
        bi++;
      } else if (fx.kind === "beam") {
        // beam — stretched glowing box between the two points
        const m = beamRefs.current[mi];
        if (m) {
          m.visible = true;
          const dx = (fx.x2 - fx.x1) / S;
          const dz = (fx.y2 - fx.y1) / S;
          const len = Math.hypot(dx, dz) || 1;
          m.position.set(
            (fx.x1 + (fx.x2 - fx.x1) / 2) / S,
            0.9,
            (fx.y1 + (fx.y2 - fx.y1) / 2) / S,
          );
          m.scale.set(len, 1, 1);
          m.rotation.y = Math.atan2(dz, dx);
          (m.material as THREE.MeshBasicMaterial).opacity = t * 0.95;
        }
        mi++;
      } else {
        // smoke — soft puffs that rise, spread and fade
        const s = smokeRefs.current[si];
        if (s) {
          s.visible = true;
          s.position.set(fx.x / S, 0.6 + (1 - t) * 2.4, fx.y / S);
          const sc = Math.max(0.5, ((fx.grow / S) * (1 - t)) / 1 + 0.35);
          s.scale.setScalar(sc);
          (s.material as THREE.SpriteMaterial).opacity = t * 0.65;
          (s.material as THREE.SpriteMaterial).color.set(fx.color);
        }
        si++;
      }
    }

    for (let i = ti; i < TEXT_POOL; i++) {
      const s = textRefs.current[i];
      if (s) s.visible = false;
    }
    for (let i = ri; i < RING_POOL; i++) {
      const m = ringRefs.current[i];
      if (m) m.visible = false;
    }
    for (let i = bi; i < BURST_POOL; i++) {
      const m = burstRefs.current[i];
      if (m) m.visible = false;
    }
    for (let i = mi; i < BEAM_POOL; i++) {
      const m = beamRefs.current[i];
      if (m) m.visible = false;
    }
    for (let i = si; i < SMOKE_POOL; i++) {
      const s = smokeRefs.current[i];
      if (s) s.visible = false;
    }
  });

  return (
    <group>
      {Array.from({ length: TEXT_POOL }).map((_, i) => (
        <sprite
          key={`t${i}`}
          ref={(el) => {
            textRefs.current[i] = el;
          }}
          visible={false}
          scale={[1.7, 0.64, 1]}
        >
          <spriteMaterial
            map={textTextures[i]}
            transparent
            depthWrite={false}
          />
        </sprite>
      ))}
      {Array.from({ length: RING_POOL }).map((_, i) => (
        <mesh
          key={`r${i}`}
          ref={(el) => {
            ringRefs.current[i] = el;
          }}
          visible={false}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[1, 0.035, 8, 40]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {Array.from({ length: BURST_POOL }).map((_, i) => (
        <mesh
          key={`b${i}`}
          ref={(el) => {
            burstRefs.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[1, 14, 14]} />
          <meshBasicMaterial
            color="#fdba74"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
      {Array.from({ length: BEAM_POOL }).map((_, i) => (
        <mesh
          key={`m${i}`}
          ref={(el) => {
            beamRefs.current[i] = el;
          }}
          visible={false}
        >
          <boxGeometry args={[1, 0.16, 0.16]} />
          <meshBasicMaterial color="#ffe066" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {Array.from({ length: SMOKE_POOL }).map((_, i) => (
        <sprite
          key={`s${i}`}
          ref={(el) => {
            smokeRefs.current[i] = el;
          }}
          visible={false}
        >
          <spriteMaterial
            map={smokeTexture}
            color="#c9c9c9"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Map props — goal frames with banners, spawn circles, the center     */
/* ball and the obstacle renderer (crates / fences / bushes / barrels).*/
/* ------------------------------------------------------------------ */

function GoalFrame({
  position,
  color,
}: {
  position: [number, number, number];
  color: string;
}) {
  return (
    <group position={position}>
      {/* posts */}
      <RoundedBox args={[0.16, 1.2, 0.16]} radius={0.05} position={[-0.8, 0.62, 0]} castShadow>
        <meshStandardMaterial color="#8a5a2b" roughness={0.8} />
      </RoundedBox>
      <RoundedBox args={[0.16, 1.2, 0.16]} radius={0.05} position={[0.8, 0.62, 0]} castShadow>
        <meshStandardMaterial color="#8a5a2b" roughness={0.8} />
      </RoundedBox>
      {/* crossbar */}
      <RoundedBox args={[0.16, 1.76, 0.16]} radius={0.05} position={[0, 1.18, 0]} castShadow>
        <meshStandardMaterial color="#9c6b33" roughness={0.8} />
      </RoundedBox>
      {/* banner hanging from the crossbar */}
      <mesh position={[0, 0.78, 0.02]}>
        <boxGeometry args={[1.5, 0.72, 0.04]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* banner emblem */}
      <mesh position={[0, 0.78, 0.05]}>
        <circleGeometry args={[0.18, 20]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
    </group>
  );
}

function SpawnCircle({
  position,
  color,
}: {
  position: [number, number, number];
  color: string;
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position}>
      <ringGeometry args={[0.95, 1.45, 40]} />
      <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} />
    </mesh>
  );
}

function ObstacleMesh({ o }: { o: BattleObstacle }) {
  const w = o.w / S;
  const h = o.h / S;
  const pos: [number, number, number] = [
    o.x / S + w / 2,
    0,
    o.y / S + h / 2,
  ];

  if (o.kind === "crate") {
    return (
      <RoundedBox args={[w, 1.0, h]} radius={0.07} position={[pos[0], 0.5, pos[2]]} castShadow receiveShadow>
        <meshStandardMaterial color="#8a5a2b" roughness={0.85} />
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[w - 0.24, 0.02, h - 0.24]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.22} />
        </mesh>
      </RoundedBox>
    );
  }
  if (o.kind === "fence") {
    // low wooden rail with posts along its length
    const posts = Math.max(2, Math.round(w / 1.6));
    return (
      <group position={[pos[0], 0, pos[2]]}>
        <RoundedBox args={[w, 0.5, 0.2]} radius={0.06} position={[0, 0.28, 0]} castShadow>
          <meshStandardMaterial color="#b07a45" roughness={0.85} />
        </RoundedBox>
        <RoundedBox args={[w - 0.2, 0.16, 0.24]} radius={0.04} position={[0, 0.5, 0]}>
          <meshStandardMaterial color="#c98f55" roughness={0.85} />
        </RoundedBox>
        {Array.from({ length: posts }).map((_, i) => (
          <RoundedBox
            key={i}
            args={[0.14, 0.72, 0.22]}
            radius={0.04}
            position={[-w / 2 + 0.3 + (i * (w - 0.6)) / Math.max(1, posts - 1), 0.36, 0]}
            castShadow
          >
            <meshStandardMaterial color="#7a5230" roughness={0.85} />
          </RoundedBox>
        ))}
      </group>
    );
  }
  if (o.kind === "bush") {
    // clump of three green spheres
    return (
      <group position={[pos[0], 0, pos[2]]}>
        {[
          { p: [0, 0.32, 0] as [number, number, number], r: Math.min(w, h) / 2.1, c: "#3e8e41" },
          { p: [-w / 4, 0.24, h / 4] as [number, number, number], r: Math.min(w, h) / 2.6, c: "#4c9a3a" },
          { p: [w / 4, 0.26, -h / 4] as [number, number, number], r: Math.min(w, h) / 2.7, c: "#5cb85c" },
        ].map((b, i) => (
          <mesh key={i} position={b.p} castShadow>
            <sphereGeometry args={[b.r, 12, 12]} />
            <meshStandardMaterial color={b.c} roughness={0.95} />
          </mesh>
        ))}
      </group>
    );
  }
  // barrel
  return (
    <group position={[pos[0], 0, pos[2]]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.42, 0.36, 1.0, 18]} />
        <meshStandardMaterial color="#b98a4e" roughness={0.7} />
      </mesh>
      {[0.24, 0.76].map((yy) => (
        <mesh key={yy} position={[0, yy, 0]}>
          <torusGeometry args={[0.4, 0.04, 8, 20]} />
          <meshStandardMaterial color="#6f4a24" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 1.0, 0]}>
        <circleGeometry args={[0.4, 18]} />
        <meshStandardMaterial color="#c99a5f" roughness={0.7} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Game-simulation follow camera — fixed zoom (no zoom buttons), the    */
/* camera glides behind the player like a real battle game and clamps   */
/* to the arena edges so the whole map stays reachable. The map is      */
/* rendered with z = +y/S, so screen-up = map-up: the joystick, keys    */
/* and tap-to-move behave exactly like the 2D arena.                    */
/* ------------------------------------------------------------------ */

function FollowCamera({
  playerRef,
}: {
  playerRef: MutableRefObject<BattleFighter>;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const cur = useRef(new THREE.Vector3(CX, 0.6, CZ));
  const el = 0.5; // elevation (radians)
  const zoom = 12; // fixed — closer than the old full-map view, no controls

  useFrame((_, dt) => {
    const p = playerRef.current;
    const vFov = (camera.fov * Math.PI) / 180;
    const aspect = Math.max(0.2, camera.aspect);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const halfW = Math.tan(hFov / 2) * zoom;
    const halfD = Math.tan(vFov / 2) * zoom * Math.cos(el);
    // If the view is wider/taller than the arena, stay centered on that
    // axis; otherwise follow the player, clamped to the walls.
    const tx =
      halfW * 2 >= ARENA_W
        ? CX
        : THREE.MathUtils.clamp(p.x / S, halfW + 0.3, ARENA_W - halfW - 0.3);
    const tz =
      halfD * 2 >= ARENA_D
        ? CZ
        : THREE.MathUtils.clamp(p.y / S, halfD + 0.3, ARENA_D - halfD - 0.3);
    const target = new THREE.Vector3(tx, 0.6, tz);
    cur.current.lerp(target, Math.min(1, dt * 5));
    camera.position.set(
      cur.current.x,
      cur.current.y + Math.sin(el) * zoom,
      cur.current.z + Math.cos(el) * zoom,
    );
    camera.lookAt(cur.current);
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* The whole 3D scene.                                                 */
/* ------------------------------------------------------------------ */

export function Arena3D({
  playerRef,
  botRef,
  projsRef,
  fxsRef,
  aimRef,
  onWorldClick,
}: {
  playerRef: MutableRefObject<BattleFighter>;
  botRef: MutableRefObject<BattleFighter>;
  projsRef: MutableRefObject<BattleProj[]>;
  fxsRef: MutableRefObject<BattleFx[]>;
  aimRef: MutableRefObject<{ active: boolean; dx: number; dy: number }>;
  onWorldClick: (x: number, y: number) => void;
}) {
  // Checkerboard grass — two alternating greens, tiled across the pitch.
  const checkerTexture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const g = c.getContext("2d");
    if (g) {
      const tile = 64;
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 2; x++) {
          g.fillStyle = (x + y) % 2 === 0 ? "#5db04a" : "#539e41";
          g.fillRect(x * tile, y * tile, tile, tile);
        }
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(ARENA_W, ARENA_D); // ~1 unit (100px) per tile
    return t;
  }, []);

  return (
    <Canvas
      dpr={[1, 2]}
      shadows
      camera={{ position: [CX, 7, CZ + 7], fov: 60, near: 0.1, far: 300 }}
      className="absolute inset-0"
    >
      <FollowCamera playerRef={playerRef} />
      {/* outer space — dark border around the pitch */}
      <color attach="background" args={["#0c1220"]} />
      <fog attach="fog" args={["#0c1220", 30, 60]} />
      <ambientLight intensity={0.75} />
      <hemisphereLight args={["#cfe9ff", "#4c9a3a", 0.6]} />
      <directionalLight
        position={[10, 14, 6]}
        intensity={1.8}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />

      {/* sun */}
      <mesh position={[11.5, 11, 1]}>
        <sphereGeometry args={[0.9, 16, 16]} />
        <meshBasicMaterial color="#ffe066" />
      </mesh>

      {/* drifting clouds — plain spheres, no extra dependencies */}
      {[
        { pos: [2.5, 6.8, -1], s: 1 },
        { pos: [12, 6.2, -8], s: 0.8 },
      ].map((cl, i) => (
        <group key={i} position={cl.pos as [number, number, number]}>
          {[
            [0, 0, 0],
            [0.85, 0.12, 0.15],
            [-0.85, 0.12, -0.1],
            [0.3, 0.28, 0.05],
            [-0.35, 0.26, -0.12],
          ].map((o, j) => (
            <mesh
              key={j}
              position={o as [number, number, number]}
              scale={[1, 0.62, 0.8]}
            >
              <sphereGeometry args={[0.55 * cl.s, 10, 10]} />
              <meshStandardMaterial
                color="#ffffff"
                transparent
                opacity={0.85}
                roughness={1}
              />
            </mesh>
          ))}
        </group>
      ))}

      {/* dark ground plate under the pitch (the "black space" border) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CX, -0.03, CZ]}>
        <planeGeometry args={[ARENA_W + 7, ARENA_D + 7]} />
        <meshStandardMaterial color="#0a0f1d" roughness={1} />
      </mesh>

      {/* checkered grass pitch */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CX, 0, CZ]} receiveShadow>
        <planeGeometry args={[ARENA_W, ARENA_D]} />
        <meshStandardMaterial map={checkerTexture} roughness={1} />
      </mesh>

      {/* center line */}
      <mesh position={[CX, 0.02, CZ]}>
        <boxGeometry args={[0.06, 0.02, ARENA_D]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.2} />
      </mesh>

      {/* spawn circles */}
      <SpawnCircle position={[CX, 0.03, 1.8]} color="#e63946" />
      <SpawnCircle position={[CX, 0.03, 9.2]} color="#3a86ff" />

      {/* goal frames — red at top, blue at bottom */}
      <GoalFrame position={[CX, 0, 0.05]} color="#e63946" />
      <GoalFrame position={[CX, 0, ARENA_D - 0.05]} color="#3a86ff" />

      {/* center ball */}
      <mesh position={[CX, 0.26, CZ]} castShadow>
        <sphereGeometry args={[0.3, 20, 20]} />
        <meshStandardMaterial
          color="#f5c542"
          emissive="#d99a1f"
          emissiveIntensity={0.35}
          roughness={0.45}
          metalness={0.15}
        />
      </mesh>

      {/* boundary walls — dark navy so the arena reads as stadium edges */}
      {[
        { pos: [CX, 0.3, 0], size: [ARENA_W + 0.4, 0.6, 0.3] },
        { pos: [CX, 0.3, -ARENA_D], size: [ARENA_W + 0.4, 0.6, 0.3] },
        { pos: [0, 0.3, CZ], size: [0.3, 0.6, ARENA_D] },
        { pos: [ARENA_W, 0.3, CZ], size: [0.3, 0.6, ARENA_D] },
      ].map((w, i) => (
        <mesh key={i} position={w.pos as [number, number, number]}>
          <boxGeometry args={w.size as [number, number, number]} />
          <meshStandardMaterial color="#1d2740" roughness={0.6} />
        </mesh>
      ))}

      {/* obstacles — crates, fences, bushes, barrels */}
      {BATTLE_OBSTACLES.map((o, i) => (
        <ObstacleMesh key={i} o={o} />
      ))}

      {/* fighters */}
      <FighterRig fighter={playerRef} isPlayer />
      <FighterRig fighter={botRef} />

      <ProjectilePool projsRef={projsRef} />
      <FxPool fxsRef={fxsRef} />


      {/* invisible click plane — converts taps to game coordinates */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CX, 0.02, CZ]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onWorldClick(e.point.x * S, e.point.z * S);
        }}
      >
        <planeGeometry args={[ARENA_W + 1, ARENA_D + 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </Canvas>
  );
}
