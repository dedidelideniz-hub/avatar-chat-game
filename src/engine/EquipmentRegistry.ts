/**
 * Equipment Registry — central, data-driven system for all 3D equipment.
 *
 * Every wearable/held item is registered here once. The avatar system
 * reads from this registry to attach the correct 3D mesh (procedural or
 * GLB) to the correct bone at runtime.
 *
 * Adding a new item = one `registerEquipment()` call. No changes to the
 * avatar, shop, or inventory code required.
 *
 * Architecture:
 *   Product (shop.ts)
 *     → EquipmentDef (this file)
 *       → procedural builder  OR  GLB model path
 *         → attachEquippedToModel() in GlbAvatar3D.tsx
 *           → bone attachment (inherits animation automatically)
 */

import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════════
 *  Types
 * ═══════════════════════════════════════════════════════════════ */

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
  | "FEET"
  | "HAND";

/**
 * Describes one equipment item — either a procedural mesh factory or a
 * GLB model reference. Both attach to a bone at runtime.
 */
export interface EquipmentDef {
  /** Unique item ID (matches the shop product ID). */
  id: string;

  /** Body slot this item occupies. */
  slot: EquipSlot;

  /**
   * For `slot: "HAND"` items, which hand should this item occupy?
   * Determines MAIN_HAND vs OFF_HAND assignment in attachEquippedToModel.
   * Only used when slot is "hand" (case-insensitive).
   */
  handSlot?: "MAIN_HAND" | "OFF_HAND";

  /**
   * Procedural mesh factory. Called with the character's model height
   * (in native units) and returns a THREE.Object3D to attach to the bone.
   * If both `build` and `glbPath` are set, `build` takes priority.
   */
  build?: (modelHeight: number) => THREE.Object3D;

  /**
   * Path to a GLB/GLTF model for this equipment item.
   * The model is loaded lazily on first use and cached.
   * Only used when `build` is not provided.
   */
  glbPath?: string;

  /** Position offset applied after attaching to the bone (bone-local). */
  positionOffset?: [number, number, number];

  /** Rotation offset applied after attaching to the bone (Euler XYZ, radians). */
  rotationOffset?: [number, number, number];

  /** Scale multiplier applied after attaching to the bone. */
  scale?: number;

  /** Shop item emoji / icon (for UI display). */
  icon?: string;
}

/* ═══════════════════════════════════════════════════════════════
 *  Registry (module-level singleton)
 * ═══════════════════════════════════════════════════════════════ */

const registry = new Map<string, EquipmentDef>();

/** Register a single equipment definition. */
export function registerEquipment(def: EquipmentDef): void {
  registry.set(def.id, def);
}

/** Register multiple equipment definitions at once. */
export function registerEquipmentBatch(defs: EquipmentDef[]): void {
  for (const def of defs) registry.set(def.id, def);
}

/** Look up an equipment definition by product ID. */
export function getEquipmentDef(id: string): EquipmentDef | undefined {
  return registry.get(id);
}

/** Check if an equipment definition exists. */
export function hasEquipmentDef(id: string): boolean {
  return registry.has(id);
}

/** Get all registered equipment IDs. */
export function allEquipmentIds(): string[] {
  return Array.from(registry.keys());
}

/** Get all equipment definitions for a specific slot. */
export function equipmentForSlot(slot: EquipSlot): EquipmentDef[] {
  return Array.from(registry.values()).filter(
    (d) => d.slot === slot || d.slot === "HAND",
  );
}

/* ═══════════════════════════════════════════════════════════════
 *  Bone Name Aliases
 * ═══════════════════════════════════════════════════════════════ */

/** Bone name aliases per slot (case-insensitive substring match).
 *  Works with Mixamo / Blender / custom rig names. */
export const BONE_ALIASES: Record<EquipSlot, string[]> = {
  HEAD: ["head", "mixamorig:head"],
  FACE: ["head", "mixamorig:head"],
  NECK: ["neck", "mixamorig:neck"],
  CHEST: ["chest", "spine", "torso", "mixamorig:spine"],
  HANDS: [
    // Mixamo
    "lefthand", "hand_l", "handleft", "mixamorig:lefthand",
    "righthand", "hand_r", "handright", "mixamorig:righthand",
    // Rigify (Blender) — HandR, HandL
    "handr", "handl",
  ],
  MAIN_HAND: [
    "righthand", "hand_r", "handright", "mixamorig:righthand",
    "handr", // Rigify: HandR
  ],
  OFF_HAND: [
    "lefthand", "hand_l", "handleft", "mixamorig:lefthand",
    "handl", // Rigify: HandL
  ],
  HAND: [
    "lefthand", "hand_l", "handleft", "mixamorig:lefthand",
    "righthand", "hand_r", "handright", "mixamorig:righthand",
    "handr", "handl", // Rigify
  ],
  BACK: ["spine", "chest", "torso", "mixamorig:spine"],
  LEGS: [
    // Mixamo
    "hip", "upleg", "mixamorig:leftupleg", "mixamorig:rightupleg",
    // Rigify — UpperLegL, LowerLegL, etc.
    "upperleg", "lowerleg",
  ],
  FEET: [
    // Mixamo
    "leftfoot", "foot_l", "mixamorig:leftfoot",
    "rightfoot", "foot_r", "mixamorig:rightfoot",
    // Rigify — FootL, FootR
    "footl", "footr",
  ],
};

/**
 * Slots that genuinely need equipment on multiple bones (paired limbs).
 * All other slots are single-target: only the first matching bone is used
 * to avoid duplicate equipment instances (e.g. Spine + Spine1 + Spine2).
 */
export const MULTI_BONE_SLOTS: ReadonlySet<EquipSlot> = new Set([
  "HANDS",
  "LEGS",
  "FEET",
]);

/** Finds the first object whose name matches any alias (case-insensitive). */
export function findBone(
  root: THREE.Object3D,
  slot: EquipSlot,
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
  slot: EquipSlot,
): THREE.Object3D[] {
  const aliases = BONE_ALIASES[slot];
  const found: THREE.Object3D[] = [];
  root.traverse((obj) => {
    const name = obj.name.toLowerCase();
    if (aliases.some((a) => name.includes(a))) found.push(obj);
  });
  return found;
}

/* ═══════════════════════════════════════════════════════════════
 *  GLB Equipment Loader (lazy, cached)
 * ═══════════════════════════════════════════════════════════════ */

const glbCache = new Map<string, THREE.Group>();

/**
 * Loads a GLB equipment model and returns a clone ready for attachment.
 * The original is cached; each call returns an independent clone so
 * multiple characters can wear the same item.
 */
export function loadEquipmentGlb(
  glbPath: string,
  modelHeight: number,
): THREE.Object3D | null {
  // We use a dynamic import to avoid adding drei/GLTFLoader to the
  // initial bundle. In practice, drei's useGLTF is used inside React
  // components — this function is for non-React contexts (like the
  // registry's build function called from useEffect).
  //
  // For React contexts, prefer the useGlbEquipment() hook in
  // GlbAvatar3D.tsx which uses useGLTF directly.
  //
  // This function is a placeholder for future non-React usage.
  // The actual GLB loading happens in the React component layer.
  console.warn(
    `[EquipmentRegistry] GLB loading for "${glbPath}" should go through React (useGLTF). ` +
    `Direct loadEquipmentGlb() is not yet implemented outside React.`,
  );
  return null;
}

/* ═══════════════════════════════════════════════════════════════
 *  Helper: shared material factory
 * ═══════════════════════════════════════════════════════════════ */

export function equipMat(
  color: string,
  opts?: Partial<THREE.MeshStandardMaterialParameters>,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts });
}
