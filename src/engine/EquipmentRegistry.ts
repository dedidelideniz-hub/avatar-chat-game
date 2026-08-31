import * as THREE from "three";

export type EquipSlot = "HEAD" | "FACE" | "NECK" | "CHEST" | "HANDS" | "MAIN_HAND" | "OFF_HAND" | "BACK" | "LEGS" | "FEET" | "HAND";

export interface GripOffset {
  /** Translation applied after bone-scale compensation (item-local units). */
  position?: [number, number, number];
  /** Extra rotation applied on top of the item's authored rotation (radians, XYZ order). */
  rotation?: [number, number, number];
  /** Uniform multiplier applied after bone-scale compensation. */
  scale?: number;
}

export interface EquipmentDef {
  id: string;
  slot: EquipSlot;
  handSlot?: "MAIN_HAND" | "OFF_HAND";
  fullBody?: boolean;
  skinUrl?: string;
  build?: (modelHeight: number) => THREE.Object3D;
  glbPath?: string;
  positionOffset?: [number, number, number];
  rotationOffset?: [number, number, number];
  scale?: number;
  /**
   * Weapon grip transform applied to a wrapper group BETWEEN the bone and
   * the weapon mesh:
   *   bone → gripGroup(gripOffset) → weapon item
   * It composes with (and is applied after) positionOffset/rotationOffset,
   * so axis-misaligned rigs can be corrected per item without touching the
   * shared attachment pipeline.
   */
  gripOffset?: GripOffset;
  icon?: string;
}

const registry = new Map<string, EquipmentDef>();
export function registerEquipment(def: EquipmentDef): void { registry.set(def.id, def); }
export function registerEquipmentBatch(defs: EquipmentDef[]): void { for (const def of defs) registry.set(def.id, def); }
export function getEquipmentDef(id: string): EquipmentDef | undefined { return registry.get(id); }
export function hasEquipmentDef(id: string): boolean { return registry.has(id); }
export function allEquipmentIds(): string[] { return Array.from(registry.keys()); }
export function equipmentForSlot(slot: EquipSlot): EquipmentDef[] { return Array.from(registry.values()).filter((d) => d.slot === slot || d.slot === "HAND"); }

export const BONE_ALIASES: Record<EquipSlot, string[]> = {
  HEAD: ["head", "mixamorig:head"], FACE: ["head", "mixamorig:head"], NECK: ["neck", "mixamorig:neck"],
  CHEST: ["chest", "spine", "torso", "mixamorig:spine"],
  HANDS: ["lefthand", "hand_l", "handleft", "mixamorig:lefthand", "righthand", "hand_r", "handright", "mixamorig:righthand", "handr", "handl"],
  MAIN_HAND: ["righthand", "hand_r", "handright", "mixamorig:righthand", "righthandindex1"],
  OFF_HAND: ["lefthand", "hand_l", "handleft", "mixamorig:lefthand", "lefthandindex1"],
  HAND: ["lefthand", "hand_l", "handleft", "mixamorig:lefthand", "righthand", "hand_r", "handright", "mixamorig:righthand", "handr", "handl"],
  BACK: ["spine", "chest", "torso", "mixamorig:spine"],
  LEGS: ["hip", "upleg", "mixamorig:leftupleg", "mixamorig:rightupleg", "upperleg", "lowerleg"],
  FEET: ["leftfoot", "foot_l", "mixamorig:leftfoot", "rightfoot", "foot_r", "mixamorig:rightfoot", "footl", "footr"],
};

export const MULTI_BONE_SLOTS: ReadonlySet<EquipSlot> = new Set(["HANDS", "LEGS", "FEET"]);

/**
 * Specificity of an alias hit. Plain `includes` matching mis-ranks rigs
 * whose bone names chain words: alias "handr" matches
 * "mixamorigLeftHandRing1" ("...HandRing1") — putting the weapon on the
 * LEFT ring finger instead of the RIGHT hand. Scoring fixes this:
 *   100 exact name · 80 full word (separator-bounded) ·
 *    60 ends at boundary · 40 starts at boundary · 10 mid-word substring
 */
function aliasScore(name: string, alias: string): number {
  if (name === alias) return 100;
  const idx = name.indexOf(alias);
  if (idx === -1) return -1;
  const isSep = (c: string | undefined) => c === undefined || !/[a-z0-9]/.test(c);
  const startOk = isSep(idx === 0 ? undefined : name[idx - 1]);
  const endOk = isSep(name[idx + alias.length]);
  if (startOk && endOk) return 80;
  if (endOk) return 60;
  if (startOk) return 40;
  return 10;
}

function bestAliasScore(name: string, aliases: string[]): number {
  let best = -1;
  for (const a of aliases) best = Math.max(best, aliasScore(name, a));
  return best;
}

export function findBone(root: THREE.Object3D, slot: EquipSlot): THREE.Object3D | null {
  const aliases = BONE_ALIASES[slot];
  let found: THREE.Object3D | null = null;
  let bestScore = -1;
  root.traverse((obj) => {
    const score = bestAliasScore(obj.name.toLowerCase(), aliases);
    if (score > bestScore) { bestScore = score; found = obj; }
  });
  return bestScore >= 0 ? found : null;
}
export function findBones(root: THREE.Object3D, slot: EquipSlot): THREE.Object3D[] {
  const aliases = BONE_ALIASES[slot];
  const scored: { obj: THREE.Object3D; score: number; order: number }[] = [];
  root.traverse((obj) => {
    const score = bestAliasScore(obj.name.toLowerCase(), aliases);
    if (score >= 0) scored.push({ obj, score, order: scored.length });
  });
  // Highest specificity first; stable traversal order for ties.
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map((s) => s.obj);
}

export function loadEquipmentGlb(_glbPath: string, _modelHeight: number): THREE.Object3D | null { return null; }
export function equipMat(color: string, opts?: Partial<THREE.MeshStandardMaterialParameters>): THREE.MeshStandardMaterial { return new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts }); }

export function resolveSkinUrl(equipped: string[]): string | null {
  for (const id of equipped) { const def = registry.get(id); if (def?.skinUrl) return def.skinUrl; }
  return null;
}
