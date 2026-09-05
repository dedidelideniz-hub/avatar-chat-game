// 🏟️ 3D battle arena — Three.js (react-three-fiber) replacement for the old
// flat SVG arena. Fighters are procedural low-poly humanoids built from the
// player's avatar config (skin / hair / shirt / pants / shoes colors), so
// everyone keeps their own look in 3D. The game simulation stays in
// BattleScene.tsx (plain refs, no React re-renders); this component only
// reads those refs every frame and draws them with Three.js.
//
// The arena renders the uploaded 5v5_game_map.glb battlefield (see
// BattleMapModel.tsx for the fit transform). Fighters duel across the open
// map; only the Brawl-style stealth bushes from the old arena remain.
import type { AvatarConfig } from "@/lib/avatar";
import type { AbilityDef } from "@/lib/shop";

import { RoundedBox, useAnimations, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  FALLBACK_MODEL_URL,
  GlbModelBoundary,
  GlbModelRetry,
  characterModelUrl,
  computeSkeletonHeight,
  resolveIdleWalk,
} from "@/engine/GlbAvatar3D";
import { useRoyalWarriorEffects } from "@/engine/RoyalWarriorEffects";
import { resolveSkinUrl } from "@/engine/EquipmentRegistry";
import { BattleMapModel } from "@/components/world/BattleMapModel";
import type { BattleMapCollider } from "@/components/world/BattleMapModel";
export type { BattleMapCollider } from "@/components/world/BattleMapModel";
import { SkeletonUtils } from "three-stdlib";

// Arena wall collider boxes that keep fighters inside the playable area.
// Each box is an OBB defined by [cx, cy, cz, w, h, d, rx, ry, rz].
// We derive them from the uploaded map's real geometry in BattleMapModel
// and keep a local fallback here so the default map still clamps.
interface ArenaWallBox {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  rx: number;
  ry: number;
  rz: number;
}
import type { MutableRefObject } from "react";
import { Suspense, useEffect, useMemo, useRef } from "react";
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

/** Stealth-bush zones on the 5v5 battle map. The uploaded GLB environment
 *  replaces the old stadium (crates / fences / barrels / goals are gone —
 *  the fighters now duel across the open battlefield), but the Brawl-style
 *  bushes stay: fighters walk through them and are hidden inside one while
 *  the enemy can't see them. These rects drive the stealth logic in the
 *  sim and place the stylized_bush.glb models in the arena. */
export const BATTLE_OBSTACLES: BattleObstacle[] = [
  { x: 285, y: 80, w: 100, h: 85, kind: "bush" },
  { x: 1315, y: 80, w: 100, h: 85, kind: "bush" },
  { x: 285, y: 935, w: 100, h: 85, kind: "bush" },
  { x: 1315, y: 935, w: 100, h: 85, kind: "bush" },
  { x: 280, y: 370, w: 130, h: 110, kind: "bush" },
  { x: 1290, y: 370, w: 130, h: 110, kind: "bush" },
  { x: 280, y: 620, w: 130, h: 110, kind: "bush" },
  { x: 1290, y: 620, w: 130, h: 110, kind: "bush" },
  { x: 140, y: 310, w: 120, h: 100, kind: "bush" },
  { x: 1440, y: 310, w: 120, h: 100, kind: "bush" },
  { x: 140, y: 690, w: 120, h: 100, kind: "bush" },
  { x: 1440, y: 690, w: 120, h: 100, kind: "bush" },
  { x: 510, y: 368, w: 70, h: 58, kind: "bush" },
  { x: 1120, y: 368, w: 70, h: 58, kind: "bush" },
  { x: 510, y: 674, w: 70, h: 58, kind: "bush" },
  { x: 1120, y: 674, w: 70, h: 58, kind: "bush" },
  { x: 470, y: 210, w: 76, h: 60, kind: "bush" },
  { x: 1154, y: 210, w: 76, h: 60, kind: "bush" },
  { x: 470, y: 830, w: 76, h: 60, kind: "bush" },
  { x: 1154, y: 830, w: 76, h: 60, kind: "bush" },
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
  /** Уровень бойца (1..10) — масштабирует HP/урон/скорость стрельбы бота. */
  level: number;
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
  vy: number; // vertical movement direction: -1 up, 0 idle, +1 down
  /** Bot strafe direction after firing (1 or -1). Only used by the AI. */
  strafeDir?: number;
  /** Bot only: how long (seconds) the bot has been barely moving while trying to move. */
  stuckT?: number;
  /** Bot only: direction of the last successful unblock move (1 or -1). */
  unblockDir?: number;
  /** Bush stealth: timestamp (performance.now) until which the fighter is
   *  revealed again after attacking / taking damage inside a bush. */
  revealUntil: number;
}

/** Brawl-style bush (stealth) zones — fighters can walk through bushes and
 *  are hidden from their enemy while standing inside one. */
export const BUSH_REVEAL_MS = 1200;
const BUSHES = BATTLE_OBSTACLES.filter((o) => o.kind === "bush");

/** Index of the bush rect containing (x, y), or -1 when outside any bush. */
export function bushIndexOf(x: number, y: number): number {
  for (let i = 0; i < BUSHES.length; i++) {
    const b = BUSHES[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i;
  }
  return -1;
}

/** True when the point stands inside a bush rect. */
export function isInBush(x: number, y: number): boolean {
  return bushIndexOf(x, y) >= 0;
}

/** True when a fighter is currently revealed (attacked / took damage). */
export function isRevealed(f: BattleFighter, now = performance.now()): boolean {
  return now < f.revealUntil;
}

/** Brawl-style hiding: fighter `f` cannot be seen by observer `o` when it is
 *  inside a bush, not currently revealed, and they are not standing in the
 *  SAME bush (mutual vision). Fighters outside bushes are always visible. */
export function isHiddenFrom(f: BattleFighter, o: BattleFighter): boolean {
  const fi = bushIndexOf(f.x, f.y);
  if (fi < 0) return false;
  if (performance.now() < f.revealUntil) return false;
  return fi !== bushIndexOf(o.x, o.y);
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
/* Fighters — the same rigged GLB character used in the street world.  */
/* While the GLB streams in (or if it can't be fetched) the fighter is  */
/* drawn as a procedural low-poly humanoid built from avatar colors.   */
/* ------------------------------------------------------------------ */

/** GLB normalized height inside the 0.72-scaled rig root — matches the
 *  procedural body's ~1.5-unit silhouette so scale never jumps. */
const FIGHTER_MODEL_H = 1.5;

/** One rigged GLB character instance driven by a battle-fighter ref. */
function GlbFighterBodyCore({
  fighter,
  url,
  equipped,
}: {
  fighter: MutableRefObject<BattleFighter>;
  url: string;
  equipped?: string[];
}) {
  const groupRef = useRef<THREE.Group>(null);
  // Skin system: resolve skin URL from equipped items if available
  const skinUrl = useMemo(() => (equipped ? resolveSkinUrl(equipped) : null), [equipped]);
  const { scene, animations } = useGLTF(skinUrl || url);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions } = useAnimations(animations, groupRef);
  const movingRef = useRef(fighter.current.moving);
  const previousPosition = useRef({ x: fighter.current.x, y: fighter.current.y });
  const arenaEffects = useRoyalWarriorEffects(
    clone,
    skinUrl,
    fighter.current.equipped,
    FIGHTER_MODEL_H,
    groupRef,
    useRef<THREE.Mesh | null>(null),
    movingRef,
  );

  // Normalize to FIGHTER_MODEL_H.
  // For character skins (Sketchfab), use skeleton bone heights to avoid
  // armor mesh inflation. For default models, keep bounding box.
  const normScale = useMemo(() => {
    scene.updateMatrixWorld(true);
    if (skinUrl) {
      // Include the actual soles, not only bone endpoints; external GLB
      // walking rigs often place foot geometry below the foot bones.
      const box = new THREE.Box3().setFromObject(scene);
      return FIGHTER_MODEL_H / Math.max(box.max.y - box.min.y, 0.0001);
    }
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    return FIGHTER_MODEL_H / Math.max(size.y, 0.0001);
  }, [scene, skinUrl]);

  useEffect(() => {
    clone.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      // Clone materials so every fighter owns its own material instances —
      // the GLB loader caches + SkeletonUtils.clone share materials between
      // fighters, which would make bush stealth opacity leak across rigs.
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => m.clone());
      } else if (mesh.material) {
        mesh.material = (mesh.material as THREE.Material).clone();
      }
    });
  }, [clone]);

  const clips = useMemo(() => {
    const keys = Object.keys(actions);
    const walk = keys.find((key) => key.toLowerCase().includes("walk"));
    const run = keys.find((key) => key.toLowerCase().includes("run"));
    const idle = keys.find((key) => key.toLowerCase().includes("idle"));
    return { idle, walk: walk ?? run };
  }, [actions]);

  // Start with the idle clip (or the first clip if none is named idle).
  useEffect(() => {
    const key = clips.idle ?? Object.keys(actions)[0];
    const action = key ? actions[key] : undefined;
    if (!action) return;
    action.reset().fadeIn(0.2).play();
    return () => {
      action.fadeOut(0.2);
    };
  }, [actions, clips]);

  // Crossfade idle ↔ walk from the simulation's moving flag (no re-renders).
  const currentClip = useRef<"idle" | "walk">("idle");
  useFrame((_, dt) => {
    const f = fighter.current;
    const movedX = f.x - previousPosition.current.x;
    const movedY = f.y - previousPosition.current.y;
    const actuallyMoving = f.moving && Math.hypot(movedX, movedY) > 0.01;
    movingRef.current = actuallyMoving;
    previousPosition.current.x = f.x;
    previousPosition.current.y = f.y;
    const next: "idle" | "walk" = actuallyMoving ? "walk" : "idle";
    if (next === currentClip.current) return;
    const from =
      actions[currentClip.current === "idle" ? clips.idle ?? "" : clips.walk ?? ""];
    const to = actions[next === "idle" ? clips.idle ?? "" : clips.walk ?? ""];
    if (from) from.fadeOut(0.15);
    if (to) to.reset().fadeIn(0.15).play();
    currentClip.current = next;
  });

  return (
    <group ref={groupRef} scale={normScale}>
      <primitive object={clone} />
    </group>
  );
}

/** Battle fighter body with the SAME fallback chain as the street world:
 *  primary model URL → RobotExpressive fallback (so the battle always
 *  shows the same character as the street). Only if even that fails does
 *  the procedural low-poly body take over (rig's boundary). */
function GlbFighterBody({
  fighter,
}: {
  fighter: MutableRefObject<BattleFighter>;
}) {
  const equipped = fighter.current.equipped;
  return (
    <GlbModelRetry
      fallback={
        <GlbFighterBodyCore fighter={fighter} url={FALLBACK_MODEL_URL} equipped={equipped} />
      }
    >
      <GlbFighterBodyCore fighter={fighter} url={characterModelUrl()} equipped={equipped} />
    </GlbModelRetry>
  );
}

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

/**
 * Apply bush visibility to every mesh in a fighter's current hierarchy.
 * GLTFLoader can return shared material instances, so clone each material
 * before changing opacity and force the shader to pick up the new flags.
 */
export function applyBushTransparency(
  characterGroup: THREE.Object3D,
  isInBush: boolean,
) {
  characterGroup.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const current = mesh.material;
    const materials = Array.isArray(current)
      ? current.map((material) => {
          if (material.userData._bushMaterialClone) return material;
          const unique = material.clone();
          unique.userData._bushMaterialClone = true;
          return unique;
        })
      : [
          current.userData._bushMaterialClone
            ? current
            : Object.assign(current.clone(), {
                userData: {
                  ...current.userData,
                  _bushMaterialClone: true,
                },
              }),
        ];
    mesh.material = Array.isArray(current) ? materials : materials[0];
    for (const material of materials) {
      material.transparent = isInBush;
      material.opacity = isInBush ? 0.4 : 1;
      material.needsUpdate = true;
    }
  });
}

/** Name-tag texture — dark rounded chip with the fighter's ability emoji,
 *  name and (for bots) level. Lives above the HP bar as a world-space
 *  THREE.Sprite, which automatically billboards toward the camera. */
function makeNameTex() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}

/** Paint one name-tag frame. Drawn once per fight (name/level never change). */
function drawNameSprite(
  tex: THREE.CanvasTexture,
  { name, emoji, level, isPlayer }: { name: string; emoji: string; level: number; isPlayer: boolean },
) {
  const canvas = tex.image as HTMLCanvasElement;
  const g = canvas.getContext("2d");
  if (!g) return;
  g.clearRect(0, 0, 512, 96);
  g.font = "800 44px 'Baloo 2', 'Segoe UI', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const lvl = level > 1 ? `  ·  Lv${level}` : "";
  let namePart = name;
  const maxW = 434; // leave room for the chip padding inside the 512px canvas
  const fits = (s: string) =>
    g.measureText(`${emoji}  ${s}${lvl}`).width <= maxW;
  while (namePart.length > 1 && !fits(namePart)) {
    namePart = namePart.slice(0, -1);
  }
  if (namePart !== name) namePart = `${namePart}…`;
  const label = `${emoji}  ${namePart}${lvl}`;
  const w = Math.min(474, g.measureText(label).width + 44);
  const x = (512 - w) / 2;
  g.beginPath();
  traceRoundRect(g, x, 18, w, 60, 30);
  g.fillStyle = "rgba(8,12,26,0.85)";
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = isPlayer ? "#38bdf8" : "#fb7185";
  g.stroke();
  g.fillStyle = "#ffffff";
  g.fillText(label, 256, 50);
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
  other,
  isPlayer = false,
}: {
  fighter: MutableRefObject<BattleFighter>;
  other: MutableRefObject<BattleFighter>;
  isPlayer?: boolean;
}) {
  const bodyWrap = useRef<THREE.Group>(null);
  // Tracks the last bush state so the transition gets an immediate update.
  const bushState = useRef(false);
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
  const nameTex = useMemo(makeNameTex, []);
  const nameTagDrawn = useRef(false);
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
    // ── bush stealth: hide from the enemy / render the body faded ──
    // The owner sees their own fighter ghosted (45%) while in a bush; the
    // enemy fighter is invisible while it hides and returns to full opacity
    // when revealed (attacked / took damage) or while sharing the same bush.
    const inBushF = isInBush(f.x, f.y);
    // Bush stealth visuals (Brawl-style):
    //   0 = fully opaque body,
    //   1 = ghost/faded (in a bush and not revealed),
    //   2 = completely invisible to the observer (hidden enemy).
    // A fighter is "revealed" for BUSH_REVEAL_MS after attacking, using an
    // ability or taking damage, so it temporarily returns to full opacity.
    let vis: 0 | 1 | 2;
    if (!inBushF) {
      vis = 0;
    } else if (isPlayer) {
      // Your own body: ghost while hidden, full for 1.2s while revealed so
      // you feel the bush "give you away" when you act.
      vis = isRevealed(f) ? 0 : 1;
    } else {
      // Enemy body: invisible while hidden from you, ghost in a shared bush,
      // full while revealed (attacked / took damage).
      vis = isHiddenFrom(f, other.current) ? 2 : isRevealed(f) ? 0 : 1;
    }
    const wantHidden = vis === 2;
    if (root.current.visible === wantHidden) root.current.visible = !wantHidden;
    if (barGroup.current && barGroup.current.visible === wantHidden)
      barGroup.current.visible = !wantHidden;
    const shouldApplyBushState = inBushF !== bushState.current;
    // This is the same state that drives the "GİZLENDİN" control below:
    // update the character and every attached equipment child immediately on
    // entry/exit, then keep enforcing it while inside for late GLB children.
    if (shouldApplyBushState || inBushF) {
      bushState.current = inBushF;
      if (bodyWrap.current) {
        applyBushTransparency(bodyWrap.current, inBushF);
      }
    }
    // The root visibility rule still hides an enemy from the observer; the
    // material rule above deliberately remains authoritative for both rigs.
    // paint the name tag once per fight — name/level/emoji never change
    if (!nameTagDrawn.current) {
      nameTagDrawn.current = true;
      drawNameSprite(nameTex, {
        name: f.name,
        emoji: f.ability.emoji,
        level: f.level,
        isPlayer,
      });
    }
    root.current.position.set(f.x / S, 0, f.y / S);
    // ── 4-direction facing ──
    // The royal warrior GLB's authored forward axis is opposite to the
    // procedural body's axis. Keep the shared movement coordinates intact,
    // but apply the model-specific half-turn so it walks toward its travel
    // direction instead of showing its back.
    const isRoyalWarrior = fighter.current.equipped.some(
      (item) => item === "skin-savasci-glb",
    );
    const modelTurn = isRoyalWarrior ? Math.PI : 0;
    let targetYaw: number;
    if (!f.moving) targetYaw = modelTurn;
    else if ((f.vy ?? 0) !== 0) targetYaw = (f.vy < 0 ? Math.PI : 0) + modelTurn;
    else targetYaw = (f.facing >= 0 ? Math.PI / 2 : -Math.PI / 2) + modelTurn;
    let yawDiff = targetYaw - root.current.rotation.y;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    root.current.rotation.y += yawDiff * Math.min(1, 12 * dt);
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

  // Procedural low-poly body — shown while the GLB streams in and used as
  // the permanent fallback if no character GLB can be fetched.
  const proceduralBody = (
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
          <mesh position={[0, -0.3, 0.19]}>
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
    </group>
  );

  return (
    <>
    <group ref={root} scale={0.55}>
      {/* rigged GLB character (same model as the street world); the
          procedural body renders while it loads and stays as fallback */}
      <group ref={bodyWrap}>
        <GlbModelBoundary fallback={proceduralBody}>
          <Suspense fallback={proceduralBody}>
            <GlbFighterBody fighter={fighter} />
          </Suspense>
        </GlbModelBoundary>
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
      {/* world-space head UI — billboard name chip + animated HP bar,
          both float above the head and follow the fighter */}
      <group ref={barGroup}>
        {/* name / level tag */}
        <sprite position={[0, 1.82, 0]} scale={[2.05, 0.385, 1]} renderOrder={0}>
          <spriteMaterial map={nameTex} transparent depthTest={false} />
        </sprite>
        {/* animated HP bar (white ghost trails the damage) */}
        <sprite ref={hpGhost} position={[0, 1.55, 0]} scale={[1.28, 0.095, 1]} renderOrder={1}>
          <spriteMaterial map={hpGhostTex} depthTest={false} />
        </sprite>
        <sprite ref={hpFill} position={[0, 1.55, 0]} scale={[1.28, 0.095, 1]} renderOrder={2}>
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

function SpawnCircle({
  position,
  color,
  radius = 0.62,
}: {
  position: [number, number, number];
  color: string;
  radius?: number;
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position}>
      <ringGeometry args={[radius * 0.8, radius, 40]} />
      <meshBasicMaterial color={color} transparent opacity={0.28} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Camera tuned for the portrait battle viewport.                      */
/* ------------------------------------------------------------------ */

function FollowCamera({
  playerRef,
}: {
  playerRef: MutableRefObject<BattleFighter>;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const cur = useRef(new THREE.Vector3(CX, 0.28, CZ));
  const tmp = useRef(new THREE.Vector3());
  // Keep a readable three-quarter perspective: enough height to see the map,
  // but not so steep that the battlefield becomes a flat texture.
  const el = 0.82;
  const baseZoom = 11.5; // fixed — no zoom controls

  useFrame((_, dt) => {
    const p = playerRef.current;
    const aspect = Math.max(0.2, camera.aspect);
    // Portrait screens need extra distance to show the same playable width;
    // desktop keeps the authored three-quarter framing.
    const zoom = baseZoom * THREE.MathUtils.clamp(1.22 / aspect, 1, 1.7);
    const vFov = (camera.fov * Math.PI) / 180;
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
    tmp.current.set(tx, 0.6, tz);
    cur.current.lerp(tmp.current, Math.min(1, dt * 5));
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
  mapColliderRef,
  onWorldClick,
}: {
  playerRef: MutableRefObject<BattleFighter>;
  botRef: MutableRefObject<BattleFighter>;
  projsRef: MutableRefObject<BattleProj[]>;
  fxsRef: MutableRefObject<BattleFx[]>;
  aimRef: MutableRefObject<{ active: boolean; dx: number; dy: number }>;
  mapColliderRef: MutableRefObject<BattleMapCollider[]>;
  onWorldClick: (x: number, y: number) => void;
}) {
  // Touch phones (coarse pointer) get lighter rendering: capped pixel
  // ratio + no real-time shadows, so the arena stays smooth on mobile.
  const coarse = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches,
    [],
  );
  return (
    <Canvas
      dpr={[1, coarse ? 1.5 : 2]}
      shadows={!coarse}
      camera={{ position: [CX, 7, CZ + 7], fov: 60, near: 0.1, far: 300 }}
      className="absolute inset-0"
    >
      <FollowCamera playerRef={playerRef} />
      {/* Neutral sky — the exported battle map renders as-is with its own
          textures and lighting; no artificial ground plane or fog overlay. */}
      <color attach="background" args={["#aacde4"]} />
      <ambientLight intensity={0.7} />
      <hemisphereLight args={["#ffffff", "#8a9aa8", 0.8]} />
      <directionalLight position={[12, 16, 8]} intensity={1.2} />


      {/* uploaded 5v5 battle-map environment (uniform scale, fitted) */}
      <BattleMapModel colliderRef={mapColliderRef} />

      {/* spawn pads: player starts on the Red base (top), bot on Blue */}
      <SpawnCircle position={[8.5, 0.03, 0.8]} color="#e63946" />
      <SpawnCircle position={[8.5, 0.03, 10.2]} color="#3a86ff" />

      {/* fighters */}
      <FighterRig fighter={playerRef} other={botRef} isPlayer />
      <FighterRig fighter={botRef} other={playerRef} />

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
