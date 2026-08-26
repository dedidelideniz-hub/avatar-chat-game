/**
 * SANALIKA 3D GAME ENGINE — Street Prototype Constants
 *
 * Coordinate system:
 *   X = left/right (centered, -16..+16)
 *   Y = up (0 = ground)
 *   Z = forward/back (positive = toward camera)
 *
 * Scale: 1 Three.js unit ≈ 1 meter
 * Player reference: 1.92 units tall (≈ 1.7m person)
 *
 * Camera: 50° elevation, 9-unit distance, 70° FOV
 *   → player at ~52% screen height (center-lower, ideal for gameplay)
 *   → buildings at ~18% screen top (visible but not dominant)
 *   → roads at ~30-50% (main visual area)
 */

// ─── SCALE ───
export const S = 50;

// ─── WORLD SIZE ───
export const WORLD_WIDTH = 32;   // X: -16..+16
export const WORLD_DEPTH = 18;   // Z: -9..+9

// ─── GROUND Y ───
export const GROUND_Y = 0;

// ─── PLAYER ───
export const PLAYER_3D_WIDTH = 70 / S;   // 1.4
export const PLAYER_3D_HEIGHT = 96 / S;  // 1.92

// ─── SPAWN (SVG coordinates — for compatibility with World.tsx game loop) ───
export const SPAWN_SVG = { x: 800, y: 610 };

// ─── CAMERA ───
export const CAMERA_ELEVATION = 0.87; // radians (~50°) — shows road + buildings
export const CAMERA_ZOOM = 9;         // distance from target
export const CAMERA_LERP_SPEED = 5;

// ─── BUILDING HEIGHT SCALE ───
// Buildings: 3-5 units tall (player = 1.92 units)
// SVG h=120 → 3.0u, h=160 → 4.0u, h=200 → 5.0u
export const BUILDING_HEIGHT_SCALE = 0.025;

// ─── ZONE BOUNDARIES (3D Z coordinates) ───
// These define the ground layout:
//
//  Z = -6.0  ░░░ North grass (trees, benches) ░░░
//  Z = -4.8  ─── North sidewalk ───
//  Z = -3.4  ═══ Main pedestrian road ═══
//  Z = -1.0  ─── South sidewalk (vendors, flower boxes) ───
//  Z = +0.4  ░░░ South grass / grass border ░░░
//  Z = +2.0  ─── Edge of visible area ───
//
export const ZONE = {
  northGrassTop: -6.0,
  northGrassBot: -4.8,
  northSidewalkTop: -4.8,
  northSidewalkBot: -3.6,
  roadTop: -3.6,
  roadBot: -1.2,
  southSidewalkTop: -1.2,
  southSidewalkBot: 0.0,
  southGrassTop: 0.0,
  southGrassBot: 1.6,
  edge: 2.4,
} as const;

// ─── BUILDING DEFINITIONS ───
export interface BuildingDef {
  /** 3D X position (center of building) */
  x: number;
  /** 3D width */
  w: number;
  /** 3D height (already scaled) */
  h: number;
  /** 3D depth (into scene) */
  d: number;
  /** Front face color (facing road/camera) */
  front: string;
  /** Side face color */
  side: string;
  /** Roof color */
  roof: string;
  /** Number of floors (for window rows) */
  floors: number;
  /** Number of windows per floor */
  windows: number;
  /** Z position of front face (south side) */
  frontZ: number;
}

export const BUILDINGS: BuildingDef[] = [
  // Left cluster — small shops
  { x: -12, w: 2.6, h: 3.2, d: 2.0, front: "#f09058", side: "#d07040", roof: "#c05828", floors: 2, windows: 2, frontZ: ZONE.northGrassTop + 0.3 },
  { x: -8.8, w: 2.0, h: 4.0, d: 1.8, front: "#dce4fa", side: "#bcc8e0", roof: "#a0aac0", floors: 3, windows: 2, frontZ: ZONE.northGrassTop + 0.3 },
  // Center — taller landmark building
  { x: -5.6, w: 3.0, h: 5.0, d: 2.2, front: "#f0a030", side: "#d08820", roof: "#b07018", floors: 3, windows: 3, frontZ: ZONE.northGrassTop + 0.3 },
  // Right cluster — smaller shops
  { x: -2.0, w: 2.2, h: 3.5, d: 1.8, front: "#e8ecf0", side: "#c8ccd4", roof: "#b0b4bc", floors: 2, windows: 2, frontZ: ZONE.northGrassTop + 0.3 },
  { x: 1.6, w: 2.6, h: 4.2, d: 2.0, front: "#e88040", side: "#c06830", roof: "#a85828", floors: 3, windows: 3, frontZ: ZONE.northGrassTop + 0.3 },
];

// ─── TREE DEFINITIONS (3D positions) ───
export interface TreeDef {
  x: number;
  z: number;
  scale: number;
  variant: number;
}

export const TREES: TreeDef[] = [
  // North grass — behind buildings
  { x: -14.5, z: -5.3, scale: 0.9, variant: 0 },
  { x: -10.5, z: -5.5, scale: 0.85, variant: 1 },
  { x: -7.0,  z: -5.3, scale: 0.9, variant: 2 },
  { x: -3.5,  z: -5.5, scale: 0.8, variant: 0 },
  // Roadside trees — left and right
  { x: 5.0,   z: -5.0, scale: 0.85, variant: 1 },
  { x: 9.0,   z: -5.2, scale: 0.9, variant: 2 },
  { x: 12.5,  z: -5.0, scale: 0.85, variant: 0 },
  // South grass
  { x: -12.0, z: 0.8,  scale: 0.9, variant: 1 },
  { x: -7.0,  z: 1.0,  scale: 0.85, variant: 2 },
  { x: -2.0,  z: 0.8,  scale: 0.9, variant: 0 },
  { x: 4.0,   z: 1.0,  scale: 0.85, variant: 1 },
  { x: 10.0,  z: 0.8,  scale: 0.9, variant: 2 },
];

// ─── TREE COLORS ───
export const TREE_FOLIAGE_COLORS = [
  ["#4cc040", "#3aa030"], // vibrant green
  ["#2eb83e", "#1e9830"], // teal green
  ["#60c838", "#48a828"], // yellow-green
];
export const TREE_TRUNK_COLOR = "#7a5230";

// ─── LAMP POSITIONS ───
export interface LampDef { x: number; z: number; }

export const LAMPS: LampDef[] = [
  // Along north sidewalk
  { x: -13, z: -4.0 },
  { x: -7,  z: -4.0 },
  { x: -1,  z: -4.0 },
  { x: 5,   z: -4.0 },
  // Along south sidewalk
  { x: -10, z: -0.4 },
  { x: -4,  z: -0.4 },
  { x: 2,   z: -0.4 },
  { x: 8,   z: -0.4 },
];

// ─── BENCH POSITIONS ───
export interface BenchDef { x: number; z: number; }

export const BENCHES: BenchDef[] = [
  { x: -9, z: -4.0 },   // north sidewalk, near shop
  { x: 3,  z: -0.4 },   // south sidewalk, near market
  { x: 11, z: -0.4 },   // south sidewalk, near trees
];

// ─── FLOWER BOX POSITIONS ───
export interface FlowerBoxDef { x: number; z: number; }

export const FLOWER_BOXES: FlowerBoxDef[] = [
  { x: -11, z: -4.2 },  // north sidewalk, between buildings
  { x: -4,  z: -4.2 },
  { x: 2,   z: -4.2 },
  { x: -6,  z: -0.2 },  // south sidewalk
  { x: 6,   z: -0.2 },
];

// ─── VENDOR STALL POSITIONS ───
export interface StallDef { x: number; z: number; color: string; accent: string; }

export const STALLS: StallDef[] = [
  { x: -11, z: -0.6, color: "#ff8fb3", accent: "#ffffff" },  // Dondurma
  { x: -6,  z: -0.6, color: "#14b8a6", accent: "#ffffff" },  // Balon
  { x: -1,  z: -0.6, color: "#f59e0b", accent: "#ffd166" },  // Oyuncakçı
  { x: 4,   z: -0.6, color: "#a855f7", accent: "#ffd166" },  // Moda
  { x: 9,   z: -0.6, color: "#b91c1c", accent: "#fbbf24" },  // Silahçı
  { x: 14,  z: -0.6, color: "#f59e0b", accent: "#ffd166" },  // VIP
];

// ─── SVG WORLD DIMENSIONS (for backward compatibility) ───
export const SVG_WORLD_W = WORLD_WIDTH * S;
export const SVG_WORLD_H = WORLD_DEPTH * S;
