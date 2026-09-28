/**
 * VAELOS 3D GAME ENGINE — Street Prototype Constants
 *
 * Coordinate system:
 *   X = left/right (centered, -24..+24)
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
// Harita büyütüldü: X 32 → 48, Z 18 → 26. SVG px katmanı (`src/lib/shop.ts`,
// `src/lib/pathfinding.ts`) S = 50 ile türetilir: 48×50 = 2400 px, 26×50 = 1300 px.
export const WORLD_WIDTH = 48;   // X: -24..+24
export const WORLD_DEPTH = 26;   // Z: -13..+13

// ─── GROUND Y ───
export const GROUND_Y = 0;

// ─── PLAYER ───
export const PLAYER_3D_WIDTH = 70 / S;   // 1.4
export const PLAYER_3D_HEIGHT = 96 / S;  // 1.92

// ─── SPAWN (SVG coordinates — for compatibility with World.tsx game loop) ───
// Dünya merkezi (SVG 1200, 810) = X 0 · Z -3.2 → caddenin tam ortası.
export const SPAWN_SVG = { x: 1200, y: 810 };

// ─── CAMERA ───
export const CAMERA_ELEVATION = 0.87; // radians (~50°) — shows road + buildings
export const CAMERA_ZOOM = 9;         // distance from target
export const CAMERA_LERP_SPEED = 5;

// ─── BUILDING HEIGHT SCALE ───
// Buildings: 3-5 units tall (player = 1.92 units)
// SVG h=120 → 3.0u, h=160 → 4.0u, h=200 → 5.0u
export const BUILDING_HEIGHT_SCALE = 0.025;

// ─── ZONE BOUNDARIES (3D Z coordinates) ───
// Güney şeritleri SABİT tutuldu (tezgâh/bank/çit verisi oraya bağlı), cadde
// kuzeye doğru genişletildi: yürünebilir koridor 4.8 → 7.2 birim, kuzey çim
// şeridi 1.2 → 4.0 birim oldu.
//
//  Z = -11.2  ░░░ Kuzey çim (akçaağaç sırası, çim öbekleri) ░░░
//  Z = -7.2   ─── Kuzey kaldırım (lambalar, banklar, durak, çöp) ───
//  Z = -5.2   ═══ Ana cadde / yaya yolu (genişledi: 2.4 → 4.0) ═══
//  Z = -1.2   ─── Güney kaldırım (tezgâhlar, lambalar) ───
//  Z = +0.0   ░░░ Güney çim + sınır çiti ░░░
//  Z = +1.6   ─── Görünür alanın kenarı ───
//
export const ZONE = {
  northGrassTop: -11.2,
  northGrassBot: -7.2,
  northSidewalkTop: -7.2,
  northSidewalkBot: -5.2,
  roadTop: -5.2,
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

/**
 * Dükkan cephe paleti — her stilde ön/yan/çatı rengi, tabela ve tente uyumlu.
 * 12 dükkan bu paletten sırayla renk alır (tekdüze görünmesin).
 */
const SHOP_STYLES = [
  { front: "#f09058", side: "#d07040", roof: "#c05828", signBg: "#fff4e6", signFg: "#7a3f18", awningA: "#e8623a", awningB: "#fff0dd" },
  { front: "#dce4fa", side: "#bcc8e0", roof: "#a0aac0", signBg: "#1e40af", signFg: "#ffffff", awningA: "#2f6fd0", awningB: "#eaf2ff" },
  { front: "#f0a030", side: "#d08820", roof: "#b07018", signBg: "#7c2d12", signFg: "#ffe9b8", awningA: "#c1440e", awningB: "#ffd9a0" },
  { front: "#e8ecf0", side: "#c8ccd4", roof: "#b0b4bc", signBg: "#be185d", signFg: "#ffe4f0", awningA: "#d94f8a", awningB: "#fff0f6" },
  { front: "#e88040", side: "#c06830", roof: "#a85828", signBg: "#6d28d9", signFg: "#efe6ff", awningA: "#7c3aed", awningB: "#e9dcff" },
  { front: "#d8f0d0", side: "#b4d4a8", roof: "#94b888", signBg: "#14532d", signFg: "#e6ffe8", awningA: "#15803d", awningB: "#eafff0" },
] as const;

/** Dükkan adları — sırayla cadde boyunca dizilir. */
const SHOP_NAMES = [
  "KAFE", "MARKET", "FIRIN", "OYUNCAK", "MODA", "KİTAPÇI",
  "PASTANE", "ÇİÇEKÇİ", "TERZİ", "ECZANE", "AYAKKABI", "KUYUM",
] as const;

const SHOP_DETAILS = ["ac", "antenna", "tank", "vent"] as const;

/** Dükkan dizisi: ilk dükkanın X'i ve dükkanlar arası mesafe (birim). */
const SHOP_ROW_START_X = -(WORLD_WIDTH / 2) + 2; // -22
const SHOP_ROW_STEP = 4;

/**
 * 12 dükkan — caddenin kuzey cephesi boyunca eşit aralıkla. Genişlik/yükseklik/
 * kat/pencere/çatı detayı indekse göre döner; hepsi kuzey çim şeridinin
 * arkasında, cephe hattı `northGrassTop + 0.3`.
 */
export const BUILDINGS: BuildingDef[] = SHOP_NAMES.map((signText, i) => ({
  x: SHOP_ROW_START_X + i * SHOP_ROW_STEP,
  w: 2.2 + (i % 3) * 0.4,
  h: 3.2 + (i % 3) * 0.6 + (i % 2) * 0.4,
  d: 1.8 + (i % 2) * 0.2,
  floors: 2 + (i % 2),
  windows: 2 + ((i + 1) % 2),
  frontZ: ZONE.northGrassTop + 0.3,
  roofDetail: SHOP_DETAILS[i % SHOP_DETAILS.length],
  ...SHOP_STYLES[i % SHOP_STYLES.length],
  signText,
}));

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
  // Kuzey sırası kuzey kaldırımın hemen arkasında (eski 0.5 birim ofset korundu).
  { z: -7.7, startX: -22, endX: 22, spacing: 4 },
  { z: 0.85, startX: -20, endX: 22, spacing: 4 },
];

/* ════════════════════════════════════════════════════════════
   ÇİM ZEMİN — `public/models/grass_ground.glb` döşemesi
   Kodla çizilen düz/karo dokulu çim düzlemleri kaldırıldı; zemin
   gerçek modelin 4×4 birimlik karolarıyla döşeniyor (bkz.
   `GrassGround.tsx` + `grassGroundPrep.ts`).
   ════════════════════════════════════════════════════════════ */

/**
 * Çim yüzeyinin Y seviyesi.
 *
 * Asfalt 0.008, kaldırım 0.005 → çim 0'da kalır: hem yol/kaldırım
 * seviyesinin altında-hizasında olur hem de tabanı 0 olan proplar (ağaç,
 * bank, lamba, otobüs durağı, çöp kutusu, çit) doğrudan bu zeminin üstünde
 * durur — hiçbiri havada kalmaz, zemine gömülmez.
 */
export const GRASS_GROUND_Y = 0;

/** Çim döşemesinin kaplanacağı dikdörtgen bölge. */
export interface GrassGroundZoneDef {
  /** Bölge merkezi. */
  x: number;
  z: number;
  /** Genişlik (X) — döşeme bu genişliği boşluksuz kaplar. */
  w: number;
  /** Derinlik (Z). */
  d: number;
  /** Zemin seviyesi. */
  y: number;
}

/**
 * Tek bölge: caddenin ve binaların altındaki tüm zemin (eski "arka plan çimi"
 * + kuzey ve güney yeşil şeritleri). Yol (0.008) ve kaldırım (0.005) bu
 * zeminin hemen üstünde kaldığı için çim sadece yeşil alanlarda görünür.
 */
export const GRASS_GROUND_ZONES: GrassGroundZoneDef[] = [
  { x: 0, z: 0, w: WORLD_WIDTH + 4, d: WORLD_DEPTH + 4, y: GRASS_GROUND_Y },
];

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
    // Alan büyüdü → yoğunluk düşürüldü (örnek sayısı makul kalsın).
    density: 2.2,
    seed: 911,
  },
  {
    z: (ZONE.southGrassTop + ZONE.southGrassBot) / 2,
    depth: ZONE.southGrassBot - ZONE.southGrassTop,
    density: 2.2,
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

// ─── LAMP POSITIONS ───
export interface LampDef { x: number; z: number; }

export const LAMPS: LampDef[] = [
  // Kuzey kaldırım (bant: -7.2..-5.2, merkez -6.2)
  { x: -21, z: -6.2 },
  { x: -14, z: -6.2 },
  { x: -7,  z: -6.2 },
  { x: 0,   z: -6.2 },
  { x: 7,   z: -6.2 },
  { x: 14,  z: -6.2 },
  { x: 21,  z: -6.2 },
  // Güney kaldırım (bant: -1.2..0.0, merkez -0.5) — tezgâhların (+3) ara boşluğuna
  { x: -18, z: -0.4 },
  { x: -10, z: -0.4 },
  { x: -2,  z: -0.4 },
  { x: 6,   z: -0.4 },
  { x: 14,  z: -0.4 },
  { x: 21,  z: -0.4 },
];

// ─── BENCH POSITIONS ───
export interface BenchDef { x: number; z: number; }

export const BENCHES: BenchDef[] = [
  { x: -10.5, z: -6.2 },  // kuzey kaldırım, lambaların arası
  { x: 4.5,   z: -6.2 },  // kuzey kaldırım
  { x: 18.5,  z: -6.2 },  // kuzey kaldırım, doğu ucu
  { x: -16,   z: -0.4 },  // güney kaldırım, bankın yanı
  { x: -1,    z: -0.4 },  // güney kaldırım, cadde ortası
  { x: 17,    z: -0.4 },  // güney kaldırım
];

// ─── VENDOR STALL POSITIONS ───
export interface StallDef { x: number; z: number; color: string; accent: string; }

export const STALLS: StallDef[] = [
  { x: -21, z: -0.6, color: "#ff8fb3", accent: "#ffffff" },  // Dondurma
  { x: -13, z: -0.6, color: "#14b8a6", accent: "#ffffff" },  // Balon
  { x: -5,  z: -0.6, color: "#f59e0b", accent: "#ffd166" },  // Oyuncakçı
  { x: 3,   z: -0.6, color: "#a855f7", accent: "#ffd166" },  // Moda
  { x: 11,  z: -0.6, color: "#b91c1c", accent: "#fbbf24" },  // Silahçı
  { x: 19,  z: -0.6, color: "#f59e0b", accent: "#ffd166" },  // VIP
];

/* ════════════════════════════════════════════════════════════
   CADDE DETAY KATMANI — "yaşayan şehir" modüler parçaları
   Tüm parçalar prosedürel (three.js) üretilir; harici GLB/PNG eklenmez.
   Yerleşimler yürünebilir alanı (Z -7.2..0) ve mevcut propları
   (lamba/çeşme/bank/tezgâh) gözeterek seçildi.
   ════════════════════════════════════════════════════════════ */

/** Yaya geçidi merkezleri (X) — şeritler yolun Z derinliğini kat eder. */
export const CROSSWALKS: number[] = [-20, -8, 4, 16];

// ─── ÇÖP KUTULARI ───
export interface TrashCanDef { x: number; z: number; }

export const TRASH_CANS: TrashCanDef[] = [
  { x: -16.5, z: -5.55 }, // kuzey kaldırım, yol kenarı
  { x: 2.4,   z: -5.55 }, // kuzey kaldırım
  { x: 9.5,   z: -5.55 }, // kuzey kaldırım, bankın yanı
  { x: 19.5,  z: -5.55 }, // kuzey kaldırım, doğu ucu
  { x: -19,   z: -0.55 }, // güney kaldırım
  { x: -8,    z: -0.55 }, // güney kaldırım
  { x: 6.5,   z: -0.55 }, // güney kaldırım
  { x: 15,    z: -0.55 }, // güney kaldırım
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
  { x: -19.5, z: -6.2, route: "12", color: "#1d4ed8" },
  { x: -2.5,  z: -6.2, route: "34", color: "#0f766e" },
  { x: 15.5,  z: -6.2, route: "7",  color: "#b45309" },
];

// ─── YÖN TABELALARI ───
export interface DirectionSignDef {
  x: number;
  z: number;
  plates: { text: string; arrow: "left" | "right" }[];
}

export const DIRECTION_SIGNS: DirectionSignDef[] = [
  {
    x: -12, z: -5.42,
    plates: [
      { text: "ÇARŞI", arrow: "left" },
      { text: "PLAZA", arrow: "right" },
      { text: "SAHİL", arrow: "left" },
    ],
  },
  {
    x: 12, z: -5.42,
    plates: [
      { text: "LİMAN", arrow: "right" },
      { text: "MÜZE", arrow: "left" },
    ],
  },
  {
    x: -9, z: -0.82,
    plates: [
      { text: "PLAZA", arrow: "left" },
      { text: "LİMAN", arrow: "right" },
    ],
  },
  {
    x: 13, z: -0.82,
    plates: [
      { text: "ÇARŞI", arrow: "left" },
      { text: "SAHİL", arrow: "right" },
    ],
  },
];

// ─── SINIR ÇİTİ (kaldırım ↔ çim hattı) ───
/**
 * Çit artık tek tek parçalar hâlinde değil, kaldırım taşı ile çim karosunun
 * BİRLEŞTİĞİ çizgi boyunca kesintisiz bir hat olarak döşenir:
 *   · güney hat: güney kaldırım (…0.0) ↔ güney çim (0.0…)   → `southGrassTop`
 *   · kuzey hat: kuzey çim (…-7.2) ↔ kuzey kaldırım (-7.2…)  → `northGrassBot`
 * Bu iki çizgi aynı zamanda yürünebilir alanın (Z -7.2…0) sınırıdır, yani
 * çit tam olarak kaldırımın kenar hizasına oturur.
 */
export interface FenceLineDef {
  /** Hattın Z'si — kaldırım taşı ile çim karosunun kesiştiği çizgi. */
  z: number;
  /** Hattın başlangıç X'i (dahil). */
  startX: number;
  /** Hattın bitiş X'i (dahil). */
  endX: number;
  /** false → bu hat çizilmez (yalnızca güney hattı istenirse). */
  enabled: boolean;
}

export const FENCE_LINES: FenceLineDef[] = [
  { z: ZONE.southGrassTop, startX: -WORLD_WIDTH / 2, endX: WORLD_WIDTH / 2, enabled: true },
  { z: ZONE.northGrassBot, startX: -WORLD_WIDTH / 2, endX: WORLD_WIDTH / 2, enabled: true },
];

/** Çit aralığı (birim) — çıtalar ve korkuluklar bunu kullanır. */
export const FENCE_SPACING = 0.28;

// ─── SVG WORLD DIMENSIONS (for backward compatibility) ───
export const SVG_WORLD_W = WORLD_WIDTH * S;
export const SVG_WORLD_H = WORLD_DEPTH * S;
