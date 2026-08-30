import * as THREE from "three";

export type EquipSlot = "HEAD" | "FACE" | "NECK" | "CHEST" | "HANDS" | "MAIN_HAND" | "OFF_HAND" | "BACK" | "LEGS" | "FEET" | "HAND";

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
  MAIN_HAND: ["righthand", "hand_r", "handright", "mixamorig:righthand", "handr"],
  OFF_HAND: ["lefthand", "hand_l", "handleft", "mixamorig:lefthand", "handl"],
  HAND: ["lefthand", "hand_l", "handleft", "mixamorig:lefthand", "righthand", "hand_r", "handright", "mixamorig:righthand", "handr", "handl"],
  BACK: ["spine", "chest", "torso", "mixamorig:spine"],
  LEGS: ["hip", "upleg", "mixamorig:leftupleg", "mixamorig:rightupleg", "upperleg", "lowerleg"],
  FEET: ["leftfoot", "foot_l", "mixamorig:leftfoot", "rightfoot", "foot_r", "mixamorig:rightfoot", "footl", "footr"],
};

export const MULTI_BONE_SLOTS: ReadonlySet<EquipSlot> = new Set(["HANDS", "LEGS", "FEET"]);
export function findBone(root: THREE.Object3D, slot: EquipSlot): THREE.Object3D | null {
  const aliases = BONE_ALIASES[slot]; let found: THREE.Object3D | null = null;
  root.traverse((obj) => { if (!found && aliases.some((a) => obj.name.toLowerCase().includes(a))) found = obj; }); return found;
}
export function findBones(root: THREE.Object3D, slot: EquipSlot): THREE.Object3D[] {
  const aliases = BONE_ALIASES[slot]; const found: THREE.Object3D[] = [];
  root.traverse((obj) => { if (aliases.some((a) => obj.name.toLowerCase().includes(a))) found.push(obj); }); return found;
}

export function loadEquipmentGlb(_glbPath: string, _modelHeight: number): THREE.Object3D | null { return null; }
export function equipMat(color: string, opts?: Partial<THREE.MeshStandardMaterialParameters>): THREE.MeshStandardMaterial { return new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts }); }

export function resolveSkinUrl(equipped: string[]): string | null {
  for (const id of equipped) { const def = registry.get(id); if (def?.skinUrl) return def.skinUrl; }
  return null;
}
