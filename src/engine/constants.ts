/**
 * ═══════════════════════════════════════════════════════════════
 * SANALIKA 3D GAME ENGINE — World Constants
 * ═══════════════════════════════════════════════════════════════
 *
 * COORDINATE SYSTEM:
 *   X = right / left (world width)
 *   Y = up / down (vertical height) — always vertical
 *   Z = forward / backward (world depth)
 *
 * The SVG 2D world uses X-Y where Y goes down.
 * The 3D world uses X-Z as the ground plane, Y as height.
 * SVG  → 3D:  x_3d = svgX - WORLD_W/2,  z_3d = -(svgY - GROUND_ZSvg),
 *             y_3d = height above ground
 *
 * GROUND Y = 0. All objects sit on top.
 * ═══════════════════════════════════════════════════════════════
 */

// ─── SVG WORLD DIMENSIONS (from existing StreetScene) ───
export const SVG_WORLD_W = 1600;
export const SVG_WORLD_H = 900;

// ─── 3D SCALE: how many SVG units = 1 Three.js unit ───
export const S = 100; // 1 Three.js unit = 100 SVG units = ~1.77m

// ─── 3D WORLD DIMENSIONS ───
export const WORLD_WIDTH = SVG_WORLD_W / S;  // 16
export const WORLD_DEPTH = SVG_WORLD_H / S;  // 9
export const WORLD_CX = WORLD_WIDTH / 2;     // 8 (center X)
export const WORLD_CZ = WORLD_DEPTH / 2;     // 4.5 (center Z)

// ─── GROUND Y = 0 ───
export const GROUND_Y = 0;

// ─── ZONE Y-VALUES in SVG space ───
// These define the horizontal bands of the map:
export const SVG_BUILDINGS_TOP = 0;       // buildings zone (y=0..470)
export const SVG_BUILDINGS_BOTTOM = 470;  // buildings end / sidewalk starts
export const SVG_SIDEWALK_TOP = 470;      // top sidewalk (y=470..555)
export const SVG_ROAD_TOP = 555;          // pedestrian promenade (y=555..685)
export const SVG_ROAD_BOTTOM = 685;       // promenade end / vendor zone
export const SVG_VENDOR_ZONE = 820;       // vendor stalls end
export const SVG_GRASS_TOP = 820;         // bottom grass (y=820..900)
export const SVG_GRASS_BOTTOM = 900;

// ─── 3D ZONE Z-VALUES (converted) ───
export const ZONE_BUILDINGS_Z = -(SVG_BUILDINGS_BOTTOM - SVG_WORLD_H / 2) / S;  // ~-4.3
export const ZONE_SIDEWALK_Z = -(SVG_ROAD_TOP - SVG_WORLD_H / 2) / S;           // ~-1.3
export const ZONE_ROAD_Z = -(SVG_ROAD_BOTTOM - SVG_WORLD_H / 2) / S;            // ~-1.3
export const ZONE_VENDOR_Z = -(SVG_VENDOR_ZONE - SVG_WORLD_H / 2) / S;          // ~-0.3

// ─── PLAYER REFERENCE ───
// SVG player: 70×96 units. In 3D: ~0.7 wide, ~0.96 tall.
export const PLAYER_3D_WIDTH = 70 / S;   // 0.7
export const PLAYER_3D_HEIGHT = 96 / S;  // 0.96

// ─── SPAWN POINT (SVG coordinates) ───
export const SPAWN_SVG = { x: 800, y: 610 };

// ─── CAMERA SETTINGS ───
export const CAMERA_ELEVATION = 0.95; // radians (~54°)
export const CAMERA_ZOOM = 14;        // distance from target
export const CAMERA_LERP_SPEED = 5;   // follow smoothing

// ─── BUILDING DEFINITIONS (from StreetScene) ───
// Each building: { x, w, h } in SVG units, placed at SVG_BUILDINGS_BOTTOM
export interface BuildingDef {
  x: number;       // left edge SVG X
  w: number;       // width SVG
  h: number;       // height SVG (how tall)
  front: string;   // front face color
  side: string;    // side face color
  top: string;     // roof color
  floors: number;
  windows: number; // windows per floor
  hasShop?: boolean;
}

export const BUILDINGS: BuildingDef[] = [
  // Row of buildings along the top (y=0..470 in SVG)
  { x: 10, w: 110, h: 180, front: "#e88040", side: "#c06830", top: "#f09058", floors: 4, windows: 3 },
  { x: 130, w: 90, h: 140, front: "#dce4fa", side: "#bcc8e0", top: "#e8ecf8", floors: 3, windows: 2 },
  { x: 230, w: 120, h: 200, front: "#f09058", side: "#d07040", top: "#ff9060", floors: 5, windows: 3 },
  { x: 360, w: 80, h: 160, front: "#e8ecf0", side: "#c8ccd4", top: "#f0f0f4", floors: 4, windows: 2, hasShop: true },
  { x: 450, w: 100, h: 120, front: "#e88040", side: "#c06830", top: "#f09058", floors: 3, windows: 3 },
  { x: 560, w: 90, h: 180, front: "#dce4fa", side: "#bcc8e0", top: "#e8ecf8", floors: 4, windows: 2 },
  { x: 660, w: 110, h: 150, front: "#f09058", side: "#d07040", top: "#ff9060", floors: 3, windows: 3 },
  { x: 780, w: 100, h: 170, front: "#e88040", side: "#c06830", top: "#f09058", floors: 4, windows: 2 },
  { x: 890, w: 80, h: 130, front: "#e8ecf0", side: "#c8ccd4", top: "#f0f0f4", floors: 3, windows: 2 },
  { x: 980, w: 120, h: 200, front: "#f09058", side: "#d07040", top: "#ff9060", floors: 5, windows: 3 },
  { x: 1110, w: 90, h: 160, front: "#e88040", side: "#c06830", top: "#f09058", floors: 4, windows: 2 },
  { x: 1210, w: 100, h: 140, front: "#dce4fa", side: "#bcc8e0", top: "#e8ecf8", floors: 3, windows: 3 },
  { x: 1320, w: 110, h: 180, front: "#f09058", side: "#d07040", top: "#ff9060", floors: 4, windows: 3 },
  { x: 1440, w: 90, h: 150, front: "#e88040", side: "#c06830", top: "#f09058", floors: 3, windows: 2 },
  { x: 1540, w: 50, h: 120, front: "#e8ecf0", side: "#c8ccd4", top: "#f0f0f4", floors: 3, windows: 1 },
];

// ─── TREE POSITIONS (SVG coordinates) ───
export interface TreePos {
  x: number;   // SVG X
  y: number;   // SVG Y (bottom of tree)
  scale: number; // 3D scale multiplier
  variant: number; // color variant 0|1|2
}

export const TREES: TreePos[] = [
  // Top sidewalk trees
  { x: 310, y: 548, scale: 1.5, variant: 0 },
  { x: 550, y: 548, scale: 1.55, variant: 1 },
  { x: 820, y: 548, scale: 1.5, variant: 2 },
  { x: 1180, y: 548, scale: 1.6, variant: 0 },
  { x: 1490, y: 548, scale: 1.5, variant: 1 },
  // Bottom grass trees
  { x: 80, y: 890, scale: 1.8, variant: 0 },
  { x: 240, y: 895, scale: 1.85, variant: 2 },
  { x: 420, y: 888, scale: 1.9, variant: 1 },
  { x: 620, y: 892, scale: 1.8, variant: 0 },
  { x: 840, y: 888, scale: 2.0, variant: 2 },
  { x: 1020, y: 894, scale: 1.85, variant: 1 },
  { x: 1200, y: 890, scale: 1.9, variant: 0 },
  { x: 1380, y: 893, scale: 1.8, variant: 2 },
  { x: 1540, y: 889, scale: 1.85, variant: 1 },
];

// ─── LAMP POSITIONS (SVG) ───
export interface LampPos {
  x: number;
  y: number;
}

export const LAMPS: LampPos[] = [
  { x: 180, y: 810 },
  { x: 400, y: 810 },
  { x: 620, y: 810 },
  { x: 840, y: 810 },
  { x: 1060, y: 810 },
  { x: 1280, y: 810 },
  { x: 1500, y: 810 },
];

// ─── FLOWER BOX POSITIONS ───
export interface FlowerBoxPos {
  x: number;
  y: number;
}

export const FLOWER_BOXES: FlowerBoxPos[] = [
  { x: 160, y: 820 },
  { x: 460, y: 820 },
  { x: 760, y: 820 },
  { x: 1060, y: 820 },
  { x: 1360, y: 820 },
];

// ─── BENCH POSITIONS ───
export const BENCHES: FlowerBoxPos[] = [
  { x: 350, y: 816 },
  { x: 1150, y: 816 },
];

// ─── TREE VARIANT COLORS ───
export const TREE_FOLIAGE_COLORS = [
  ["#4cc040", "#3aa030"],  // Variant 0: bright green
  ["#2eb83e", "#1e9830"],  // Variant 1: teal-green
  ["#60c838", "#48a828"],  // Variant 2: warm yellow-green
];

export const TREE_TRUNK_COLOR = "#7a5230";

// ─── STALL / VENDOR POSITIONS (SVG) ───
// These match the VENDORS array in shop.ts
export interface StallDef {
  x: number;
  y: number;
  color: string;
  accent: string;
}

export const STALLS: StallDef[] = [
  { x: 280, y: 745, color: "#ff8fb3", accent: "#ffffff" },
  { x: 620, y: 745, color: "#14b8a6", accent: "#ffffff" },
  { x: 980, y: 745, color: "#f59e0b", accent: "#ffd166" },
  { x: 1340, y: 745, color: "#a855f7", accent: "#ffd166" },
  { x: 820, y: 745, color: "#f59e0b", accent: "#ffd166" }, // VIP
];
