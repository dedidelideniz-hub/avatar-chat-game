/**
 * SANALIKA 3D GAME ENGINE — World Constants
 * Fixed scale: 1 Three.js unit ≈ 1 meter. Player = 1.7m reference.
 */

// ─── SVG WORLD DIMENSIONS ───
export const SVG_WORLD_W = 1600;
export const SVG_WORLD_H = 900;

// ─── SCALE: 1 Three.js unit = 1 SVG meter-ish ───
// Player SVG is 70×96 units. We want player ≈ 1.7 units tall in 3D.
// So: 96 SVG units → 1.7 Three.js units → S ≈ 56.5
// But for clean numbers: S = 50 → player = 1.92 units tall
export const S = 50;

// ─── 3D WORLD DIMENSIONS ───
export const WORLD_WIDTH = SVG_WORLD_W / S;   // 32
export const WORLD_DEPTH = SVG_WORLD_H / S;   // 18
export const WORLD_CX = WORLD_WIDTH / 2;      // 16
export const WORLD_CZ = WORLD_DEPTH / 2;      // 9

// ─── GROUND Y = 0 ───
export const GROUND_Y = 0;

// ─── PLAYER REFERENCE ───
export const PLAYER_3D_WIDTH = 70 / S;   // 1.4
export const PLAYER_3D_HEIGHT = 96 / S;  // 1.92

// ─── SPAWN POINT (SVG coordinates) ───
export const SPAWN_SVG = { x: 800, y: 610 };

// ─── CAMERA SETTINGS ───
// Brawl Stars-style: ~60° looking down, player visible at center-bottom
export const CAMERA_ELEVATION = 0.95; // radians (~55°)
export const CAMERA_ZOOM = 10;         // distance from target
export const CAMERA_LERP_SPEED = 5;

// ─── BUILDING HEIGHT SCALE ───
// Buildings in SVG: h=120-200. We want 3D height = 2-4 units (1-2× player).
// So multiply SVG height by this factor:
export const BUILDING_HEIGHT_SCALE = 0.01;
// h=120 → 2.4, h=160 → 3.2, h=200 → 4.0

// ─── BUILDING DEFINITIONS ───
export interface BuildingDef {
  x: number;
  w: number;
  h: number;
  front: string;
  side: string;
  top: string;
  floors: number;
  windows: number;
}

export const BUILDINGS: BuildingDef[] = [
  { x: 10, w: 110, h: 180, front: "#e88040", side: "#c06830", top: "#f09058", floors: 4, windows: 3 },
  { x: 130, w: 90, h: 140, front: "#dce4fa", side: "#bcc8e0", top: "#e8ecf8", floors: 3, windows: 2 },
  { x: 230, w: 120, h: 200, front: "#f09058", side: "#d07040", top: "#ff9060", floors: 5, windows: 3 },
  { x: 360, w: 80, h: 160, front: "#e8ecf0", side: "#c8ccd4", top: "#f0f0f4", floors: 4, windows: 2 },
  { x: 450, w: 100, h: 120, front: "#e88040", side: "#c06830", top: "#f09058", floors: 3, windows: 3 },
  { x: 560, w: 90, h: 180, front: "#dce4fa", side: "#bcc8e0", top: "#e8ecf8", floors: 4, windows: 2 },
  { x: 660, w: 110, h: 150, front: "#f09058", side: "#d07040", top: "#ff9060", floors: 3, windows: 3 },
  { x: 780, w: 100, h: 170, front: "#e88040", side: "#c06830", top: "#f09058", floors: 4, windows: 2 },
  { x: 890, w: 80, h: 130, front: "#dce4fa", side: "#bcc8e0", top: "#e8ecf8", floors: 3, windows: 2 },
  { x: 980, w: 120, h: 200, front: "#f09058", side: "#d07040", top: "#ff9060", floors: 5, windows: 3 },
  { x: 1110, w: 90, h: 160, front: "#e88040", side: "#c06830", top: "#f09058", floors: 4, windows: 2 },
  { x: 1210, w: 100, h: 140, front: "#dce4fa", side: "#bcc8e0", top: "#e8ecf8", floors: 3, windows: 3 },
  { x: 1320, w: 110, h: 180, front: "#f09058", side: "#d07040", top: "#ff9060", floors: 4, windows: 3 },
  { x: 1440, w: 90, h: 150, front: "#e88040", side: "#c06830", top: "#f09058", floors: 3, windows: 2 },
  { x: 1540, w: 50, h: 120, front: "#dce4fa", side: "#bcc8e0", top: "#e8ecf8", floors: 3, windows: 1 },
];

// ─── TREE POSITIONS (SVG coordinates) ───
export interface TreePos {
  x: number;
  y: number;
  scale: number;
  variant: number;
}

export const TREES: TreePos[] = [
  { x: 310, y: 548, scale: 1.5, variant: 0 },
  { x: 550, y: 548, scale: 1.55, variant: 1 },
  { x: 820, y: 548, scale: 1.5, variant: 2 },
  { x: 1180, y: 548, scale: 1.6, variant: 0 },
  { x: 1490, y: 548, scale: 1.5, variant: 1 },
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

// ─── LAMP POSITIONS ───
export interface LampPos { x: number; y: number; }

export const LAMPS: LampPos[] = [
  { x: 180, y: 810 }, { x: 400, y: 810 }, { x: 620, y: 810 },
  { x: 840, y: 810 }, { x: 1060, y: 810 }, { x: 1280, y: 810 }, { x: 1500, y: 810 },
];

// ─── FLOWER BOX / BENCH POSITIONS ───
export interface PosXY { x: number; y: number; }

export const FLOWER_BOXES: PosXY[] = [
  { x: 160, y: 820 }, { x: 460, y: 820 }, { x: 760, y: 820 },
  { x: 1060, y: 820 }, { x: 1360, y: 820 },
];

export const BENCHES: PosXY[] = [
  { x: 350, y: 816 }, { x: 1150, y: 816 },
];

// ─── TREE COLORS ───
export const TREE_FOLIAGE_COLORS = [
  ["#4cc040", "#3aa030"],
  ["#2eb83e", "#1e9830"],
  ["#60c838", "#48a828"],
];
export const TREE_TRUNK_COLOR = "#7a5230";

// ─── STALLS ───
export interface StallDef { x: number; y: number; color: string; accent: string; }

export const STALLS: StallDef[] = [
  { x: 280, y: 745, color: "#ff8fb3", accent: "#ffffff" },
  { x: 620, y: 745, color: "#14b8a6", accent: "#ffffff" },
  { x: 980, y: 745, color: "#f59e0b", accent: "#ffd166" },
  { x: 1340, y: 745, color: "#a855f7", accent: "#ffd166" },
  { x: 820, y: 745, color: "#f59e0b", accent: "#ffd166" },
];
