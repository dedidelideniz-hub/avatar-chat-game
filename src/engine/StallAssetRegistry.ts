/**
 * Stall Asset Registry — central, data-driven system for all 3D stalls.
 *
 * Each vendor stall is registered once here. The game engine reads from
 * this registry to place, render, collide, and interact with stalls.
 *
 * Adding a new stall = one `registerStall()` call. No changes to the
 * game engine or shop logic required.
 *
 * Architecture:
 *   StallDef (this file)
 *     → procedural geometry builder  OR  GLB model path
 *       → Stall3D / GlbStall in GameEngine3D.tsx
 *         → collision, interaction point, vendor NPC
 *           → shop system (shop.ts)
 */

import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════════
 *  Types
 * ═══════════════════════════════════════════════════════════════ */

export type StallCategory =
  | "blacksmith"
  | "armor"
  | "weapon"
  | "archery"
  | "mage"
  | "accessory"
  | "cosmetic"
  | "general";

/**
 * Describes one vendor stall — either a procedural mesh factory or a
 * GLB model reference. The game engine reads these to place stalls
 * in the world.
 */
export interface StallAssetDef {
  /** Unique stall ID (matches the vendor ID in shop.ts). */
  id: string;

  /** Display name for the stall. */
  name: string;

  /** Stall category. */
  category: StallCategory;

  /** GLB model path (optional — for future real GLB stalls). */
  glbPath?: string;

  /** Procedural geometry factory (fallback when no GLB). */
  build?: (def: StallAssetDef) => THREE.Object3D;

  /** Awning color (procedural). */
  color: string;

  /** Awning accent/stripe color (procedural). */
  accent: string;

  /** Collision box half-extents [halfW, halfD]. */
  collisionHalfW: number;
  collisionHalfD: number;

  /** Vendor NPC offset from stall center [x, z] (procedural). */
  vendorOffset: [number, number];

  /** Vendor facing direction (1 = default, -1 = flipped). */
  vendorFacing: number;

  /** Interaction click radius (3D units). */
  interactionRadius: number;

  /** Stall visual scale (1 = default). */
  scale: number;

  /** Ground Y offset (0 = on ground). */
  groundOffset: number;
}

/* ═══════════════════════════════════════════════════════════════
 *  Registry (module-level singleton)
 * ═══════════════════════════════════════════════════════════════ */

const registry = new Map<string, StallAssetDef>();

/** Register a single stall definition. */
export function registerStall(def: StallAssetDef): void {
  registry.set(def.id, def);
}

/** Register multiple stall definitions at once. */
export function registerStallBatch(defs: StallAssetDef[]): void {
  for (const def of defs) registry.set(def.id, def);
}

/** Look up a stall definition by vendor ID. */
export function getStallDef(id: string): StallAssetDef | undefined {
  return registry.get(id);
}

/** Check if a stall definition exists. */
export function hasStallDef(id: string): boolean {
  return registry.has(id);
}

/** Get all registered stall IDs. */
export function allStallIds(): string[] {
  return Array.from(registry.keys());
}

/** Get all stall definitions for a specific category. */
export function stallsForCategory(category: StallCategory): StallAssetDef[] {
  return Array.from(registry.values()).filter((d) => d.category === category);
}

/* ═══════════════════════════════════════════════════════════════
 *  Default stall definitions
 * ═══════════════════════════════════════════════════════════════ */

export const DEFAULT_STALLS: StallAssetDef[] = [
  {
    id: "dondurma",
    name: "Dondurma Tezgâhı",
    category: "cosmetic",
    color: "#ff8fb3",
    accent: "#ffffff",
    collisionHalfW: 0.7,
    collisionHalfD: 0.3,
    vendorOffset: [0, 0.5],
    vendorFacing: 1,
    interactionRadius: 0.8,
    scale: 1,
    groundOffset: 0,
  },
  {
    id: "balon",
    name: "Balon Standı",
    category: "cosmetic",
    color: "#14b8a6",
    accent: "#ffffff",
    collisionHalfW: 0.7,
    collisionHalfD: 0.3,
    vendorOffset: [0, 0.5],
    vendorFacing: 1,
    interactionRadius: 0.8,
    scale: 1,
    groundOffset: 0,
  },
  {
    id: "oyuncak",
    name: "Oyuncakçı",
    category: "cosmetic",
    color: "#f59e0b",
    accent: "#ffd166",
    collisionHalfW: 0.7,
    collisionHalfD: 0.3,
    vendorOffset: [0, 0.5],
    vendorFacing: 1,
    interactionRadius: 0.8,
    scale: 1,
    groundOffset: 0,
  },
  {
    id: "moda",
    name: "Moda Standı",
    category: "accessory",
    color: "#a855f7",
    accent: "#ffd166",
    collisionHalfW: 0.7,
    collisionHalfD: 0.3,
    vendorOffset: [0, 0.5],
    vendorFacing: 1,
    interactionRadius: 0.8,
    scale: 1,
    groundOffset: 0,
  },
  {
    id: "vip",
    name: "VIP Köşesi",
    category: "general",
    color: "#f59e0b",
    accent: "#ffd166",
    collisionHalfW: 0.7,
    collisionHalfD: 0.3,
    vendorOffset: [0, 0.5],
    vendorFacing: 1,
    interactionRadius: 0.8,
    scale: 1,
    groundOffset: 0,
  },
];

// Register defaults on module load.
registerStallBatch(DEFAULT_STALLS);
