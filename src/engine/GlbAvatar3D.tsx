import { Suspense, useEffect, useMemo, useRef, Component } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import { useGLTF, useAnimations } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { PLAYER_3D_HEIGHT, WORLD_WIDTH, WORLD_DEPTH, S } from "./constants";

/* ═══════════════════════════════════════════════════════════════
 * GLB AVATAR SYSTEM — replaces the SVG/Html avatar in gameplay.
 *
 * Architecture:
 *   useGLTF (cached per URL — ONE download for all characters)
 *   → SkeletonUtils.clone per instance (independent skeletons)
 *   → normalized to exactly PLAYER_3D_HEIGHT
 *   → idle/walk AnimationAction crossfade (no React re-renders)
 *   → facing (±1) → smooth rotation.y
 *   → equipment attached to BONES via findBone() — items inherit
 *     bone position/rotation/animation automatically.
 *
 * Character asset resolution:
 *   1. ?glb=<url> query param (instant testing with any GLB)
 *   2. /models/character.glb (drop a custom character here)
 *   3. RobotExpressive fallback (proven rigged test model)
 *
 * Debug: add ?svg=1 to the URL to restore the old SVG avatars.
 * ═══════════════════════════════════════════════════════════════ */

export const CHARACTER_MODEL_URL = "/models/character.glb";
export const FALLBACK_MODEL_URL =
  "https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb";

/** ?svg=1 restores the legacy SVG avatars for debugging. */
export const SVG_DEBUG_MODE =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("svg");

export function characterModelUrl(): string {
  if (typeof window === "undefined") return FALLBACK_MODEL_URL;
  const param = new URLSearchParams(window.location.search).get("glb");
  return param || CHARACTER_MODEL_URL;
}

/* ── Bone lookup / attachment ─────────────────────────────────── */

/* ── Equipment slot system ─────────────────────────────────── */

/**
 * One slot per body location. Items declare their slot; the slot maps to
 * one or many bones (HANDS/FEET attach to BOTH bones, one item instance
 * per bone — clones share geometry/material so it stays cheap).
 */
export type EquipSlot =
  | "HEAD"
  | "FACE"
  | "NECK"
  | "CHEST"
  | "HANDS"
  | "MAIN_HAND"
  | "OFF_HAND"
  | "BACK"
  | "LEGS"
  | "FEET";

/** Bone name aliases per slot (case-insensitive substring match).
 *  Works with Mixamo / Blender / custom rig names. */
export const BONE_ALIASES: Record<EquipSlot, string[]> = {
  HEAD: ["head", "mixamorig:head"],
  FACE: ["head", "mixamorig:head"],
  NECK: ["neck", "mixamorig:neck"],
  CHEST: ["chest", "spine", "mixamorig:spine"],
  HANDS: [
    "lefthand", "hand_l", "handleft", "mixamorig:lefthand",
    "righthand", "hand_r", "handright", "mixamorig:righthand",
  ],
  MAIN_HAND: ["righthand", "hand_r", "handright", "mixamorig:righthand"],
  OFF_HAND: ["lefthand", "hand_l", "handleft", "mixamorig:lefthand"],
  BACK: ["spine", "chest", "mixamorig:spine"],
  LEGS: ["hip", "upleg", "mixamorig:leftupleg", "mixamorig:rightupleg"],
  FEET: [
    "leftfoot", "foot_l", "mixamorig:leftfoot",
    "rightfoot", "foot_r", "mixamorig:rightfoot",
  ],
};

export type BoneSlot = EquipSlot;

/** Finds the first object whose name matches any alias (case-insensitive). */
export function findBone(
  root: THREE.Object3D,
  slot: BoneSlot,
): THREE.Object3D | null {
  const aliases = BONE_ALIASES[slot];
  let found: THREE.Object3D | null = null;
  root.traverse((obj) => {
    if (found) return;
    const name = obj.name.toLowerCase();
    if (aliases.some((a) => name.includes(a))) found = obj;
  });
  return found;
}

/** Finds ALL bones for a slot — used by paired slots (HANDS, FEET, LEGS). */
export function findBones(
  root: THREE.Object3D,
  slot: BoneSlot,
): THREE.Object3D[] {
  const aliases = BONE_ALIASES[slot];
  const found: THREE.Object3D[] = [];
  root.traverse((obj) => {
    const name = obj.name.toLowerCase();
    if (aliases.some((a) => name.includes(a))) found.push(obj);
  });
  return found;
}

/** Attaches `item` to the bone for `slot`. Returns false if bone missing. */
export function attachToBone(
  root: THREE.Object3D,
  slot: BoneSlot,
  item: THREE.Object3D,
): boolean {
  const bone = findBone(root, slot);
  if (!bone) return false;
  bone.add(item);
  return true;
}

/* ── Equipment builders — lightweight procedural meshes ───────── */
/* All sizes are fractions of the model's native height H so they
 * scale correctly with any character GLB. Items are added to bones,
 * so they inherit the group's normalization scale automatically. */

function mat(color: string, opts?: Partial<THREE.MeshStandardMaterialParameters>) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts });
}

/** Maps an equipped product id → (equipment slot, mesh factory).
 *  `slot: "HAND"` = auto-assign: first item → MAIN_HAND, second → OFF_HAND
 *  (matches the shop's hand-slot capacity of 2). */
const EQUIPMENT_BUILDERS: Record<
  string,
  { slot: EquipSlot | "HAND"; build: (H: number) => THREE.Object3D }
> = {
  // ── HEAD ──
  "moda-sapka": {
    slot: "HEAD",
    build: (H) => {
      const g = new THREE.Group();
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16 * H, 0.16 * H, 0.015 * H, 20),
        mat("#e8c96a"),
      );
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.1 * H, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        mat("#f0d67a"),
      );
      dome.position.y = 0.005 * H;
      g.add(brim, dome);
      g.position.y = 0.06 * H;
      return g;
    },
  },
  // ── FACE ──
  "moda-gozluk": {
    slot: "FACE",
    build: (H) => {
      const g = new THREE.Group();
      const lensGeo = new THREE.BoxGeometry(0.05 * H, 0.035 * H, 0.01 * H);
      const dark = mat("#222222", { roughness: 0.3, metalness: 0.2 });
      const l = new THREE.Mesh(lensGeo, dark);
      l.position.x = -0.032 * H;
      const r = new THREE.Mesh(lensGeo, dark);
      r.position.x = 0.032 * H;
      const bridge = new THREE.Mesh(
        new THREE.BoxGeometry(0.018 * H, 0.008 * H, 0.01 * H),
        dark,
      );
      g.add(l, r, bridge);
      g.position.set(0, 0.045 * H, 0.09 * H); // front of the face
      return g;
    },
  },
  // ── NECK ──
  "moda-atki": {
    slot: "NECK",
    build: (H) => {
      const g = new THREE.Group();
      const wrap = new THREE.Mesh(
        new THREE.TorusGeometry(0.055 * H, 0.018 * H, 10, 20),
        mat("#d43a3a"),
      );
      wrap.rotation.x = Math.PI / 2;
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.035 * H, 0.09 * H, 0.015 * H),
        mat("#d43a3a"),
      );
      tail.position.set(0.02 * H, -0.05 * H, 0.05 * H);
      g.add(wrap, tail);
      g.position.y = 0.02 * H;
      return g;
    },
  },
  // ── CHEST — armor plate fitted to the torso via the chest/spine bone.
  //  Attaching to the bone (not world space) means it follows breathing,
  //  idle sway and every animation frame automatically.
  "moda-zirh": {
    slot: "CHEST",
    build: (H) => {
      const g = new THREE.Group();
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17 * H, 0.14 * H, 0.24 * H, 14),
        mat("#3f6fd0", { metalness: 0.35, roughness: 0.4 }),
      );
      plate.position.y = 0.1 * H;
      const trim = new THREE.Mesh(
        new THREE.TorusGeometry(0.155 * H, 0.012 * H, 8, 20),
        mat("#c8a23a", { metalness: 0.6, roughness: 0.3 }),
      );
      trim.rotation.x = Math.PI / 2;
      trim.position.y = 0.2 * H;
      g.add(plate, trim);
      return g;
    },
  },
  // ── BACK — backpack offset behind the upper spine (model forward = +Z).
  "moda-canta": {
    slot: "BACK",
    build: (H) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.15 * H, 0.19 * H, 0.08 * H),
        mat("#c2571f"),
      );
      const flap = new THREE.Mesh(
        new THREE.BoxGeometry(0.15 * H, 0.07 * H, 0.085 * H),
        mat("#8a3c12"),
      );
      flap.position.y = 0.06 * H;
      g.add(body, flap);
      g.position.set(0, 0.12 * H, -0.12 * H); // behind the torso
      return g;
    },
  },
  // ── HANDS — gloves: one instance per hand bone (both hands).
  "moda-eldiven": {
    slot: "HANDS",
    build: (H) => {
      const glove = new THREE.Mesh(
        new THREE.SphereGeometry(0.05 * H, 12, 10),
        mat("#d0483a"),
      );
      glove.scale.set(1, 1.25, 1);
      return glove;
    },
  },
  // ── FEET — boots: one instance per foot bone.
  "moda-bot": {
    slot: "FEET",
    build: (H) => {
      const boot = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.BoxGeometry(0.09 * H, 0.1 * H, 0.1 * H),
        mat("#5a3a1e"),
      );
      shaft.position.y = 0.05 * H;
      const toe = new THREE.Mesh(
        new THREE.BoxGeometry(0.09 * H, 0.05 * H, 0.12 * H),
        mat("#4a2f18"),
      );
      toe.position.set(0, 0.012 * H, 0.03 * H);
      boot.add(shaft, toe);
      return boot;
    },
  },
  // ── MAIN_HAND — weapon held in the right hand.
  "moda-kilic": {
    slot: "MAIN_HAND",
    build: (H) => {
      const g = new THREE.Group();
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.028 * H, 0.3 * H, 0.01 * H),
        mat("#cfd6dd", { metalness: 0.7, roughness: 0.25 }),
      );
      blade.position.y = 0.2 * H;
      const guard = new THREE.Mesh(
        new THREE.BoxGeometry(0.09 * H, 0.02 * H, 0.03 * H),
        mat("#c8a23a", { metalness: 0.6, roughness: 0.3 }),
      );
      guard.position.y = 0.045 * H;
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014 * H, 0.014 * H, 0.08 * H, 8),
        mat("#6b4423"),
      );
      grip.position.y = 0.005 * H;
      g.add(blade, guard, grip);
      return g;
    },
  },
  // ── OFF_HAND — shield held in the left hand.
  "moda-kalkan": {
    slot: "OFF_HAND",
    build: (H) => {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09 * H, 0.09 * H, 0.02 * H, 18),
        mat("#3f6fd0", { metalness: 0.3, roughness: 0.45 }),
      );
      disc.rotation.x = Math.PI / 2;
      const boss = new THREE.Mesh(
        new THREE.SphereGeometry(0.025 * H, 10, 8),
        mat("#c8a23a", { metalness: 0.6, roughness: 0.3 }),
      );
      boss.position.z = 0.02 * H;
      g.add(disc, boss);
      g.position.z = 0.05 * H; // in front of the palm
      return g;
    },
  },
  // ── HAND items (auto: first → MAIN_HAND, second → OFF_HAND) ──
  "dondurma-cilek": handCone("#ff8fa3"),
  "dondurma-cikolata": handCone("#8a5a3b"),
  "dondurma-mix": handCone("#f2c9a0"),
  "balon-kirmizi": handBalloon("#e83a3a"),
  "balon-gokkusagi": handBalloon("#4ad0e8"),
  "balon-yildiz": handBalloon("#ffd94a"),
  "oyuncak-ayi": handItem("HAND", (H) => {
    const bear = new THREE.Mesh(
      new THREE.SphereGeometry(0.045 * H, 14, 12),
      mat("#a5714f"),
    );
    bear.position.y = 0.04 * H;
    return bear;
  }),
  "oyuncak-araba": handItem("HAND", (H) => {
    const car = new THREE.Mesh(
      new THREE.BoxGeometry(0.08 * H, 0.03 * H, 0.045 * H),
      mat("#e03a3a"),
    );
    car.position.y = 0.015 * H;
    return car;
  }),
  "oyuncak-top": handItem("HAND", (H) => {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.04 * H, 14, 12),
      mat("#f5f5f5"),
    );
    ball.position.y = 0.04 * H;
    return ball;
  }),
};

function handCone(color: string) {
  return handItem("HAND", (H) => {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.028 * H, 0.07 * H, 12),
      mat("#e8b87a"),
    );
    cone.position.y = 0.035 * H;
    const scoop = new THREE.Mesh(
      new THREE.SphereGeometry(0.03 * H, 12, 10),
      mat(color),
    );
    scoop.position.y = 0.08 * H;
    g.add(cone, scoop);
    return g;
  });
}

function handBalloon(color: string) {
  return handItem("HAND", (H) => {
    const g = new THREE.Group();
    const balloon = new THREE.Mesh(
      new THREE.SphereGeometry(0.055 * H, 14, 12),
      mat(color, { roughness: 0.35 }),
    );
    balloon.position.y = 0.22 * H; // floats above the hand
    const string = new THREE.Mesh(
      new THREE.CylinderGeometry(0.002 * H, 0.002 * H, 0.16 * H, 6),
      mat("#dddddd"),
    );
    string.position.y = 0.08 * H;
    g.add(balloon, string);
    return g;
  });
}

function handItem(
  slot: EquipSlot | "HAND",
  build: (H: number) => THREE.Object3D,
) {
  return { slot, build };
}

// Position conversion constants (mirror GameEngine3D's sX/sZ helpers).
const WORLD_W = WORLD_WIDTH / 2;
const WORLD_D = WORLD_DEPTH / 2;

/**
 * Attaches all equipped items to the model's bones. Returns a cleanup
 * function that removes every attached item. Shared by the gameplay
 * avatar and the Studio portrait.
 */
export function attachEquippedToModel(
  clone: THREE.Object3D,
  equipped: string[],
  modelHeight: number,
): () => void {
  const attached: THREE.Object3D[] = [];
  const usedSlots = new Set<EquipSlot>();

  for (const id of equipped) {
    const def = EQUIPMENT_BUILDERS[id];
    if (!def) continue; // graceful fallback: no 3D asset for this item yet

    let slot = def.slot;
    if (slot === "HAND") {
      // Auto-assign: first hand item → MAIN_HAND, second → OFF_HAND.
      if (!usedSlots.has("MAIN_HAND")) slot = "MAIN_HAND";
      else if (!usedSlots.has("OFF_HAND")) slot = "OFF_HAND";
      else continue; // both hands full — don't stack a third item
    }

    const item = def.build(modelHeight);
    const bones = findBones(clone, slot);
    if (bones.length === 0) continue; // rig has no bone for this slot

    // Paired slots (HANDS/FEET) get one instance per bone — clones share
    // geometry + material, so the extra instances are nearly free.
    bones.forEach((bone, i) => {
      const inst = i === 0 ? item : item.clone();
      bone.add(inst); // inherits bone position/rotation/animation
      attached.push(inst);
    });
    usedSlots.add(slot);
  }

  return () => {
    for (const item of attached) item.removeFromParent();
  };
}

/** Resolves the idle/walk clip keys from an actions map (case-insensitive). */
export function resolveIdleWalk(
  actions: Record<string, THREE.AnimationAction | null>,
) {
  let idle: string | undefined;
  let walk: string | undefined;
  for (const k of Object.keys(actions)) {
    const lk = k.toLowerCase();
    if (!idle && lk.includes("idle")) idle = k;
    if (!walk && (lk.includes("walk") || lk.includes("run"))) walk = k;
  }
  return { idle, walk };
}

/* ── Error boundary with fallback-model retry ─────────────────── */

export class GlbModelBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/* ── Core avatar (one instance per character) ─────────────────── */

interface GlbAvatarCoreProps {
  url: string;
  posRef: React.RefObject<{ x: number; y: number }>;
  facingRef: React.RefObject<number>;
  equipped: string[];
  lerpSpeed?: number;
}

function GlbAvatarCore({ url, posRef, facingRef, equipped, lerpSpeed = 14 }: GlbAvatarCoreProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);

  // Per-instance clone with independent skeleton (shares GPU resources).
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);

  const { actions } = useAnimations(animations, groupRef);

  // Normalize to exactly PLAYER_3D_HEIGHT — never trust authored scale.
  const { normScale, modelHeight } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const h = Math.max(size.y, 0.0001);
    return { normScale: PLAYER_3D_HEIGHT / h, modelHeight: h };
  }, [scene]);

  // Shadow casting on every mesh.
  useEffect(() => {
    clone.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
      }
    });
  }, [clone]);

  // Resolve idle/walk clips once.
  const clips = useMemo(() => resolveIdleWalk(actions), [actions]);

  // Play idle initially.
  useEffect(() => {
    const key = clips.idle ?? Object.keys(actions)[0];
    const action = key ? actions[key] : undefined;
    if (!action) return;
    action.reset().fadeIn(0.3).play();
    return () => {
      action.fadeOut(0.3);
    };
  }, [actions, clips]);

  // Movement/animation state (refs — zero React re-renders per frame).
  const smoothPos = useRef<{ x: number; y: number } | null>(null);
  const movingRef = useRef(false);
  const currentClip = useRef<"idle" | "walk">("idle");
  // Initial yaw from the ±1 facing flag; afterwards yaw follows movement.
  const targetYaw = useRef(
    (facingRef.current ?? 1) < 0 ? -Math.PI / 2 : Math.PI / 2,
  );
  const initDone = useRef(false);

  useFrame((_, dt) => {
    const group = groupRef.current;
    const p = posRef.current;
    if (!group || !p) return;

    // Snap on first frame (avoid lerp across the map from origin).
    if (!initDone.current) {
      initDone.current = true;
      smoothPos.current = { x: p.x, y: p.y };
    }
    const sp = smoothPos.current!;

    // Smooth interpolation toward target (same pipeline as SVG avatar).
    const lerpFactor = Math.min(1, lerpSpeed * dt);
    sp.x += (p.x - sp.x) * lerpFactor;
    sp.y += (p.y - sp.y) * lerpFactor;
    group.position.set(sp.x / S - WORLD_W, 0.02, -(sp.y / S - WORLD_D));

    // Walking detection from position delta (same threshold as SVG avatar).
    const dx = Math.abs(p.x - sp.x);
    const dy = Math.abs(p.y - sp.y);
    const moving = dx > 0.3 || dy > 0.3;

    // Crossfade idle ↔ walk.
    if (moving !== movingRef.current) {
      movingRef.current = moving;
      const nextClip: "idle" | "walk" = moving ? "walk" : "idle";
      if (nextClip !== currentClip.current) {
        const from = actions[currentClip.current === "idle" ? clips.idle ?? "" : clips.walk ?? ""];
        const to = actions[nextClip === "idle" ? clips.idle ?? "" : clips.walk ?? ""];
        if (from) from.fadeOut(0.2);
        if (to) to.reset().fadeIn(0.2).play();
        currentClip.current = nextClip;
      }
    }

    // Facing: derive yaw from the ACTUAL movement direction on the X/Z
    // plane (not just the ±1 left/right facing flag). World conversion:
    //   worldX = svgX / S - W/2,  worldZ = -(svgY / S - D/2)
    // The model's natural forward axis is +Z, so the target yaw for a
    // movement direction (dx, dz) is atan2(dx, dz):
    //   right  (dx=+1, dz=0)  → yaw=+π/2  (faces +X)
    //   left   (dx=-1, dz=0)  → yaw=-π/2  (faces -X)
    //   up     (dx=0,  dz=-1) → yaw=π     (faces -Z, back to camera)
    //   down   (dx=0,  dz=+1) → yaw=0     (faces +Z, toward camera)
    // Diagonals interpolate naturally. When idle we KEEP the last yaw so
    // the character doesn't snap back to a default facing.
    if (moving) {
      const dxw = (p.x - sp.x) / S;
      const dzw = -(p.y - sp.y) / S;
      targetYaw.current = Math.atan2(dxw, dzw);
    }
    let diff = targetYaw.current - group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    group.rotation.y += diff * Math.min(1, 10 * dt);
  });

  // Bone-based equipment attachment.
  const equippedKey = equipped.join(",");
  useEffect(() => {
    return attachEquippedToModel(clone, equipped, modelHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clone, equippedKey, modelHeight]);

  return (
    <group ref={groupRef} scale={normScale}>
      <primitive object={clone} />
    </group>
  );
}

/* ── Public component with fallback-model retry ───────────────── */

export interface GlbAvatar3DProps {
  posRef: React.RefObject<{ x: number; y: number }>;
  facingRef: React.RefObject<number>;
  equipped: string[];
  lerpSpeed?: number;
}

/** Primary URL can be overridden per-instance (used by the fallback). */
export function GlbAvatar3D({ url, ...props }: GlbAvatar3DProps & { url?: string }) {
  const primary = url ?? characterModelUrl();

  // If already on the fallback model, render directly (no retry loop).
  if (primary === FALLBACK_MODEL_URL) {
    return (
      <Suspense fallback={null}>
        <GlbAvatarCore url={primary} {...props} />
      </Suspense>
    );
  }

  return (
    <GlbModelBoundary
      fallback={
        <Suspense fallback={null}>
          <GlbAvatarCore url={FALLBACK_MODEL_URL} {...props} />
        </Suspense>
      }
    >
      <Suspense fallback={null}>
        <GlbAvatarCore url={primary} {...props} />
      </Suspense>
    </GlbModelBoundary>
  );
}

// Warm the cache for the fallback so the retry is instant.
useGLTF.preload(FALLBACK_MODEL_URL);

/* ── Character portrait (Studio / selection screens) ──────────── */

interface PortraitCoreProps {
  url: string;
  equipped: string[];
  height: number;
  spin: boolean;
}

/** Static character shown facing the camera with its idle animation. */
function GlbPortraitCore({ url, equipped, height, spin }: PortraitCoreProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions } = useAnimations(animations, groupRef);

  const { normScale, modelHeight } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const h = Math.max(size.y, 0.0001);
    return { normScale: height / h, modelHeight: h };
  }, [scene, height]);

  // Play the idle clip (or the first clip as a fallback).
  useEffect(() => {
    const { idle } = resolveIdleWalk(actions);
    const key = idle ?? Object.keys(actions)[0];
    const action = key ? actions[key] : undefined;
    if (!action) return;
    action.reset().fadeIn(0.3).play();
    return () => {
      action.fadeOut(0.3);
    };
  }, [actions]);

  // Bone-based equipment.
  const equippedKey = equipped.join(",");
  useEffect(() => {
    return attachEquippedToModel(clone, equipped, modelHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clone, equippedKey, modelHeight]);

  // Gentle turntable so the whole character can be inspected.
  useFrame((_, dt) => {
    if (spin && groupRef.current) {
      groupRef.current.rotation.y += dt * 0.6;
    }
  });

  return (
    <group ref={groupRef} position={[0, -height / 2, 0]} scale={normScale}>
      <primitive object={clone} />
    </group>
  );
}

export interface GlbCharacterPortraitProps {
  equipped?: string[];
  /** Rendered height in world units. */
  height?: number;
  /** Slow turntable rotation (default true). */
  spin?: boolean;
}

/**
 * Retry wrapper shared by every GLB consumer: renders `children` with the
 * primary model URL, and if that model can't be fetched, re-renders
 * `fallback` (which should load FALLBACK_MODEL_URL) instead. If the primary
 * URL already IS the fallback, children render without a boundary.
 */
export function GlbModelRetry({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const primary = characterModelUrl();
  if (primary === FALLBACK_MODEL_URL) return <>{children}</>;
  return <GlbModelBoundary fallback={fallback}>{children}</GlbModelBoundary>;
}

/**
 * 3D character portrait for the character-selection screen. Renders the
 * same GLB character used in gameplay, with idle animation and equipped
 * items attached to bones. Must be placed inside a <Canvas>.
 */
export function GlbCharacterPortrait({
  equipped = [],
  height = 2.2,
  spin = true,
}: GlbCharacterPortraitProps) {
  const primary = characterModelUrl();

  if (primary === FALLBACK_MODEL_URL) {
    return (
      <Suspense fallback={null}>
        <GlbPortraitCore url={primary} equipped={equipped} height={height} spin={spin} />
      </Suspense>
    );
  }  return (
    <GlbModelBoundary
      fallback={
        <Suspense fallback={null}>
          <GlbPortraitCore url={FALLBACK_MODEL_URL} equipped={equipped} height={height} spin={spin} />
        </Suspense>
      }
    >
      <Suspense fallback={null}>
        <GlbPortraitCore url={primary} equipped={equipped} height={height} spin={spin} />
      </Suspense>
    </GlbModelBoundary>
  );
}

/* ── Profile card avatar (self-contained mini Canvas) ──────────── */

interface ProfileModelProps {
  url: string;
  equipped: string[];
  height: number;
}

/**
 * Character shown in the profile card: plays the idle animation and
 * periodically looks left/right (head/eye motion) instead of staring
 * straight ahead. Faces the camera at all times.
 */
function GlbProfileModel({ url, equipped, height }: ProfileModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions } = useAnimations(animations, groupRef);

  const { normScale, modelHeight } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const h = Math.max(size.y, 0.0001);
    return { normScale: height / h, modelHeight: h };
  }, [scene, height]);

  // Idle animation.
  useEffect(() => {
    const { idle } = resolveIdleWalk(actions);
    const key = idle ?? Object.keys(actions)[0];
    const action = key ? actions[key] : undefined;
    if (!action) return;
    action.reset().fadeIn(0.3).play();
    return () => {
      action.fadeOut(0.3);
    };
  }, [actions]);

  // Bone-based equipment.
  const equippedKey = equipped.join(",");
  useEffect(() => {
    return attachEquippedToModel(clone, equipped, modelHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clone, equippedKey, modelHeight]);

  // Look around: smooth layered sine produces natural left/right glances
  // (±~28°) with occasional off-beat drift, like the character is curious.
  const head = useMemo(() => findBone(clone, "HEAD"), [clone]);
  useFrame((state, dt) => {
    if (!head) return;
    const t = state.clock.elapsedTime;
    const target = Math.sin(t * 0.8) * 0.3 + Math.sin(t * 0.27) * 0.18;
    head.rotation.y += (target - head.rotation.y) * Math.min(1, 5 * dt);
  });

  return (
    <group ref={groupRef} position={[0, -height / 2, 0]} scale={normScale}>
      <primitive object={clone} />
    </group>
  );
}

export interface GlbProfileAvatarProps {
  equipped?: string[];
  /** Character height in world units inside the mini scene. */
  height?: number;
  /** Wrapper className — size it here (e.g. "h-24 w-24"). */
  className?: string;
}

/**
 * Animated 3D character for the profile card. Fully self-contained
 * (own transparent Canvas) — drop it anywhere in JSX. Uses the SAME
 * cached GLB as the game, idle animation + left/right eye/head motion,
 * equipment attached to bones.
 */
export function GlbProfileAvatar({
  equipped = [],
  height = 2,
  className,
}: GlbProfileAvatarProps) {
  const primary = characterModelUrl();

  const sceneFor = (url: string) => (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, height * 1.7], fov: 35 }}
      gl={{ alpha: true, antialias: true }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[2, 3, 4]} intensity={1.4} />
      <Suspense fallback={null}>
        <GlbProfileModel url={url} equipped={equipped} height={height} />
      </Suspense>
    </Canvas>
  );

  return (
    <div className={className}>
      {primary === FALLBACK_MODEL_URL ? (
        sceneFor(primary)
      ) : (
        <GlbModelBoundary fallback={sceneFor(FALLBACK_MODEL_URL)}>
          {sceneFor(primary)}
        </GlbModelBoundary>
      )}
    </div>
  );
}
