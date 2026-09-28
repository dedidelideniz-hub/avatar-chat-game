/**
 * VAELOS 3D GAME ENGINE — Street Prototype Constants
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
  /** Vitrin tabelasındaki dükkan adı (yoksa tabela çizilmez). */
  signText?: string;
  /** Tabela zemin / yazı rengi. */
  signBg?: string;
  signFg?: string;
  /** Tente şerit renkleri (branda). */
  awningA?: string;
  awningB?: string;
  /** Çatı detayı — dükkan silüetine canlılık katar. */
  roofDetail?: "ac" | "antenna" | "tank" | "vent";
}

export const BUILDINGS: BuildingDef[] = [
  // Left cluster — small shops
  {
    x: -12, w: 2.6, h: 3.2, d: 2.0, front: "#f09058", side: "#d07040", roof: "#c05828",
    floors: 2, windows: 2, frontZ: ZONE.northGrassTop + 0.3,
    signText: "KAFE", signBg: "#fff4e6", signFg: "#7a3f18",
    awningA: "#e8623a", awningB: "#fff0dd", roofDetail: "ac",
  },
  {
    x: -8.8, w: 2.0, h: 4.0, d: 1.8, front: "#dce4fa", side: "#bcc8e0", roof: "#a0aac0",
    floors: 3, windows: 2, frontZ: ZONE.northGrassTop + 0.3,
    signText: "MARKET", signBg: "#1e40af", signFg: "#ffffff",
    awningA: "#2f6fd0", awningB: "#eaf2ff", roofDetail: "antenna",
  },
  // Center — taller landmark building
  {
    x: -5.6, w: 3.0, h: 5.0, d: 2.2, front: "#f0a030", side: "#d08820", roof: "#b07018",
    floors: 3, windows: 3, frontZ: ZONE.northGrassTop + 0.3,
    signText: "FIRIN", signBg: "#7c2d12", signFg: "#ffe9b8",
    awningA: "#c1440e", awningB: "#ffd9a0", roofDetail: "tank",
  },
  // Right cluster — smaller shops
  {
    x: -2.0, w: 2.2, h: 3.5, d: 1.8, front: "#e8ecf0", side: "#c8ccd4", roof: "#b0b4bc",
    floors: 2, windows: 2, frontZ: ZONE.northGrassTop + 0.3,
    signText: "OYUNCAK", signBg: "#be185d", signFg: "#ffe4f0",
    awningA: "#d94f8a", awningB: "#fff0f6", roofDetail: "vent",
  },
  {
    x: 1.6, w: 2.6, h: 4.2, d: 2.0, front: "#e88040", side: "#c06830", roof: "#a85828",
    floors: 3, windows: 3, frontZ: ZONE.northGrassTop + 0.3,
    signText: "MODA", signBg: "#6d28d9", signFg: "#efe6ff",
    awningA: "#7c3aed", awningB: "#e9dcff", roofDetail: "ac",
  },
];

// ─── AĞAÇ SIRALARI (caddenin yeşillik şeritleri) ───
// Ağaçlar artık tek tek elle değil, EŞİT ARALIKLI sıralar hâlinde dizilir:
// kuzeyde dükkanların önündeki çim şeridi, güneyde caddenin karşı çim şeridi.
// Model `public/models/maple_tree.glb`'dir (bkz. `VegetationModels.tsx`).
export interface TreeRowDef {
  /** Sıranın Z konumu (kuzey şerit negatif, güney şerit pozitif). */
  z: number;
  /** İlk ağacın X'i. */
  startX: number;
  /** Son ağacın X'i (dahil). */
  endX: number;
  /** Ağaçlar arası mesafe — sıra boyunca eşit. */
  spacing: number;
}

/**
 * İki sıra. Güney sırası yarım aralık kaydırıldı (`startX` farkı):
 * karşılıklı ağaçlar tam hizada durunca ızgara yapay görünüyor, kaydırma
 * düzeni bozmadan doğallık katıyor.
 */
export const TREE_ROWS: TreeRowDef[] = [
  { z: -5.3, startX: -14, endX: 14, spacing: 4 },
  { z: 0.85, startX: -12, endX: 14, spacing: 4 },
];

/* ════════════════════════════════════════════════════════════
   ÇİM KATMANI — yeşil alanların zemin kalitesi
   Düz parlak yeşil plane yerine: iki tonlu karo dokusu + ince bordür
   + rastgele dağılmış GLB çim kümeleri.
   ════════════════════════════════════════════════════════════ */

/** Çim renk paleti — pastel, göz yormayan yeşil. */
export const GRASS_TONES = {
  /** Karo açık tonu. */
  light: "#7EC850",
  /** Karo koyu tonu (satranç deseninin ikinci yeşili). */
  dark: "#6EC045",
  /** Çim kümelerinde kullanılan açık bıçak tonu. */
  bladeLight: "#8FD85F",
  /** Çim kümelerinde kullanılan koyu bıçak tonu. */
  bladeDark: "#5DA838",
  /** Kaldırıma temas eden kenardaki ince koyu yeşil bordür. */
  border: "#4C8A31",
} as const;

/** Çim karosu kenarı (dünya birimi) — doku repeat'i bundan türetilir. */
export const GRASS_TILE = 0.5;

/** Çim şeritlerinin kaldırım seviyesinden yüksekliği (ince kenar/derinlik). */
export const GRASS_LIFT = 0.07;

/** Çim kümesi (GLB çim öbeği) dağıtım bölgesi. */
export interface GrassClumpZoneDef {
  /** Şerit merkezi (Z). */
  z: number;
  /** Şerit derinliği (Z) — kümeler bu bandın içine dağıtılır. */
  depth: number;
  /** Birim² başına küme yoğunluğu. */
  density: number;
  /** Tohum — dağılım her karede aynı kalsın. */
  seed: number;
}

export const GRASS_CLUMP_ZONES: GrassClumpZoneDef[] = [
  {
    z: (ZONE.northGrassTop + ZONE.northGrassBot) / 2,
    depth: ZONE.northGrassBot - ZONE.northGrassTop,
    density: 3.4,
    seed: 911,
  },
  {
    z: (ZONE.southGrassTop + ZONE.southGrassBot) / 2,
    depth: ZONE.southGrassBot - ZONE.southGrassTop,
    density: 3.4,
    seed: 733,
  },
];

/**
 * GLB bitki örtüsü model boyları (dünya birimi).
 * Modeller 1 birim yüksekliğe normalize edilerek yüklenir (bkz.
 * `VegetationModels.tsx`), yani buradaki sayılar doğrudan "kaç birim boyunda
 * duracak" demektir (örnek başına ayrıca ±%15 rastgele sapma biner).
 *
 * Ölçek referansı: oyuncu 1.92 birim, dükkanlar 3.2–5 birim. `maple_tree.glb`
 * ham hâlde ~312 birim boyunda geliyor → çalışma zamanında uygulanan gerçek
 * ölçek ≈ 2.4 / 312 ≈ 0.0077 (normalizasyon ölçülerek yapılır).
 */
export const VEG_SIZES = {
  /** Ağaç boyu — karakterin ~1.25 katı, dükkan zemin katından kısa. */
  tree: 2.4,
  /** Çim öbeği boyu. */
  grassClump: 0.34,
} as const;

/** Çim şeritlerinin kaldırıma bakan kenarları — bordür çizgileri. */
export const GRASS_BORDERS: number[] = [
  ZONE.northGrassBot, // kuzey çim → kuzey kaldırım
  ZONE.southGrassTop, // güney kaldırım → güney çim
  ZONE.southGrassBot, // güney çimin dış (arka) kenarı
];

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

/* ════════════════════════════════════════════════════════════
   CADDE DETAY KATMANI — "yaşayan şehir" modüler parçaları
   Tüm parçalar prosedürel (three.js) üretilir; harici GLB/PNG eklenmez.
   Yerleşimler yürünebilir alanı (Z -4.8..0) ve mevcut propları
   (lamba/çeşme/bank/tezgâh) gözeterek seçildi.
   ════════════════════════════════════════════════════════════ */

/** Yaya geçidi merkezleri (X) — şeritler yolun Z derinliğini kat eder. */
export const CROSSWALKS: number[] = [-9.5, 6.5];

// ─── ÇÖP KUTULARI ───
export interface TrashCanDef { x: number; z: number; }

export const TRASH_CANS: TrashCanDef[] = [
  { x: -9.8, z: -3.95 },  // kuzey kaldırım, bankın yanı
  { x: 8.4, z: -3.95 },   // kuzey kaldırım
  { x: -13.6, z: -0.55 }, // güney kaldırım
  { x: 6.6, z: -0.55 },   // güney kaldırım
  { x: 11.9, z: -0.55 },  // güney kaldırım, bankın yanı
];

// ─── OTOBÜS DURAĞI ───
export interface BusStopDef {
  x: number;
  z: number;
  /** Durak tabelasındaki hat numarası. */
  route: string;
  /** Tabela rengi. */
  color: string;
}

export const BUS_STOPS: BusStopDef[] = [
  { x: -15.05, z: -4.2, route: "12", color: "#1d4ed8" },
  { x: 12.0, z: -4.2, route: "34", color: "#0f766e" },
];

// ─── YÖN TABELALARI ───
export interface DirectionSignDef {
  x: number;
  z: number;
  plates: { text: string; arrow: "left" | "right" }[];
}

export const DIRECTION_SIGNS: DirectionSignDef[] = [
  {
    x: -8.9, z: -3.82,
    plates: [
      { text: "ÇARŞI", arrow: "left" },
      { text: "PLAZA", arrow: "right" },
      { text: "SAHİL", arrow: "left" },
    ],
  },
  {
    x: 7.2, z: -0.82,
    plates: [
      { text: "PLAZA", arrow: "left" },
      { text: "LİMAN", arrow: "right" },
    ],
  },
];

// ─── AHŞAP ÇİT ───
export interface FenceDef {
  x: number;
  z: number;
  /** Çıta sayısı (aralık 0.28 birim). */
  count: number;
}

export const FENCES: FenceDef[] = [
  { x: -15.2, z: 1.48, count: 9 },
  { x: 4.0, z: 1.48, count: 6 },
  { x: 12.6, z: 1.48, count: 9 },
];

/** Çit aralığı (birim) — çıtalar ve korkuluklar bunu kullanır. */
export const FENCE_SPACING = 0.28;

// ─── SVG WORLD DIMENSIONS (for backward compatibility) ───
export const SVG_WORLD_W = WORLD_WIDTH * S;
export const SVG_WORLD_H = WORLD_DEPTH * S;
