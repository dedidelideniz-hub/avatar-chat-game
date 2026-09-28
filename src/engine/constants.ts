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
// Harita kuzeye doğru büyütüldü: dükkanların ARKASINA ikinci bir cadde (arka
// sokak) ve ana caddeyi ona bağlayan DİKEY ara sokaklar eklendi. Bu yüzden
// harita artık Z = 0'a göre ortalanmış değil:
//   · Z ekseni : WORLD_Z_MIN (-22, en kuzey) .. WORLD_Z_MAX (+6, en güney)
//   · SVG px   : 1 birim = S px; y = 0 en GÜNEY kenardır →
//                `svgY(z) = (WORLD_Z_MAX - z) * S` (bkz. `src/lib/shop.ts`)
//   · harita   : 48×50 = 2400 px geniş · 28×50 = 1400 px yüksek
// Dönüşümün sıfır noktası tek yerden yönetilir: `WORLD_Z_MAX`.
export const WORLD_WIDTH = 48;    // X: -24..+24
export const WORLD_Z_MIN = -22;   // en kuzey (uzak) kenar
export const WORLD_Z_MAX = 6;     // en güney (yakın) kenar
export const WORLD_DEPTH = WORLD_Z_MAX - WORLD_Z_MIN;          // 28
export const WORLD_CENTER_Z = (WORLD_Z_MIN + WORLD_Z_MAX) / 2; // -8

// ─── GROUND Y ───
export const GROUND_Y = 0;

// ─── PLAYER ───
export const PLAYER_3D_WIDTH = 70 / S;   // 1.4
export const PLAYER_3D_HEIGHT = 96 / S;  // 1.92

// ─── SPAWN (SVG coordinates — for compatibility with World.tsx game loop) ───
// X 0 · Z -3.2 → ana caddenin tam ortası. px değerleri dönüşümden türetilir
// (`svgX(0)` = 1200, `svgY(-3.2)` = 460) — harita büyüdüğünde elle güncellenmez.
export const SPAWN_SVG = { x: (WORLD_WIDTH / 2) * S, y: (WORLD_Z_MAX + 3.2) * S };

// ─── CAMERA ───
export const CAMERA_ELEVATION = 0.87; // radians (~50°) — shows road + buildings
export const CAMERA_ZOOM = 9;         // distance from target
export const CAMERA_LERP_SPEED = 5;

// ─── CAMERA — BİNA ARKASI / ÜST SOKAK ───
// Saydamlık yerine kamera açısı otomatik açılır: oyuncu dükkan sırasının
// arkasına (üst/arka sokağa) geçtikçe kamera daha dik (top-down) bir açıya ve
// biraz daha yükseğe taşınır; caddeye dönünce eski açıya yumuşakça döner.
// Z kuzeye doğru KÜÇÜLÜR: `OPEN_Z_START`ta geçiş başlar, `OPEN_Z_FULL`de
// (bina arkası) tamamen açık kamera açısına ulaşılır.
export const CAMERA_BACK_ELEVATION = 1.15; // radians (~66°) — neredeyse tepeden
export const CAMERA_BACK_ZOOM = 10.5;      // biraz daha uzak → daha geniş görüş
export const CAMERA_OPEN_Z_START = -10.6;  // geçiş başlangıcı (dükkan cephesi)
export const CAMERA_OPEN_Z_FULL = -12.8;   // tam açık (dükkanların arkası)
export const CAMERA_OPEN_LERP_SPEED = 3.2; // açı/yükseklik geçiş yumuşaklığı

// ─── BUILDING HEIGHT SCALE ───
// Buildings: 3-5 units tall (player = 1.92 units)
// SVG h=120 → 3.0u, h=160 → 4.0u, h=200 → 5.0u
export const BUILDING_HEIGHT_SCALE = 0.025;

// ─── ZONE BOUNDARIES (3D Z coordinates) ───
// Ana cadde (kuzey çim şeridi + dükkanlar) aynen korundu; kuzeyine, dükkan
// sırasının ARKASINA arka sokak + ikinci bina sırası eklendi.
//
//  Z = -21.9  ▓▓▓ Arka sıra binaların arka duvarı ▓▓▓
//  Z = -20.1  ▓▓▓ Arka sıra binaların cephesi (OTEL, SİNEMA…) ▓▓▓
//  Z = -17.4  ░░░ Arka çim (ağaç sırası) — sınır çiti hattı ░░░
//  Z = -16.4  ─── Arka sokağın kuzey kaldırımı (lamba, çöp) ───
//  Z = -14.0  ═══ ARKA CADDE (binaların arkası, 2.4 birim) ═══
//  Z = -13.0  ─── Arka kaldırım (lamba, bank, durak) ───
//  Z = -12.9  ▓▓▓ Dükkanların arka duvarı ▓▓▓
//  Z = -10.9  ▓▓▓ Dükkan cepheleri ▓▓▓
//  Z = -11.2  ░░░ Kuzey çim (akçaağaç sırası, çim öbekleri) ░░░
//  Z = -7.2   ─── Kuzey kaldırım (lambalar, banklar, durak, çöp) ───
//  Z = -5.2   ═══ Ana cadde / yaya yolu ═══
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
  // ── binaların arkası (kuzey uzatma) ──
  backWalkTop: -13.0,       // arka kaldırımın güney kenarı (dükkan arkalarına bitişik)
  backWalkBot: -14.0,       // arka kaldırımın kuzey kenarı → asfalt başlar
  backRoadTop: -14.0,
  backRoadBot: -16.4,       // arka cadde (2.4 birim)
  backNorthWalkTop: -16.4,
  backNorthWalkBot: -17.4,  // arka caddenin kuzey kaldırımı
  backGrassTop: -17.4,      // arka çim şeridi (güney kenar = sınır çiti hattı)
  backGrassBot: -20.4,      // arka çim şeridi (kuzey kenar)
} as const;

/* ════════════════════════════════════════════════════════════
   DİKEY ARA SOKAKLAR — "yollar yukarı aşağı çıksın"
   Ana caddeyi kuzey-güney yönünde kesen ve dükkan bloklarının ARASINDAN
   geçip arka caddeye ulaşan sokaklar. Güneyde güney çim şeridine doğru kısa
   bir ağız bırakırlar (Z +4.0'a kadar), yani cadde iki yöne de devam eder.
   ════════════════════════════════════════════════════════════ */
/** Sokak merkezleri (X). Bina blokları bu X'lerin çevresinde boşluk bırakır. */
export const SIDE_STREETS: number[] = [-16, 0, 16];
/** Sokak genişliği (X, birim) — asfalt ve yürünebilir kolon aynı genişlikte. */
export const SIDE_STREET_W = 2.8;
/** Sokağın güney ucu (ana caddenin güneyine taşan ağız). */
export const SIDE_STREET_SOUTH = 4.0;

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

/**
 * Dükkan cephe merkezleri (X). Sıra artık dört bloğa bölünmüş: aradaki
 * boşluklar `SIDE_STREETS` sokak ağızlarıdır, yani dikey sokaklar dükkanların
 * ARASINDAN geçer. Kenar bloklar dar (2.0), orta bloklar geniş (2.4).
 */
const SHOP_CENTERS = [
  -21.4, -18.8,
  // Orta bloğun sokağa bakan iki dükkanı 0.4 birim daha dışarıda: oyuncu
  // (yarıçap 0.4) sokak kolonunun kenarında (X ±1.4) dükkan köşesine değmesin.
  -13.0, -9.6, -6.2, -3.2,
  3.2, 6.2, 9.6, 13.0,
  18.8, 21.4,
] as const;

/** Arka caddenin kuzeyindeki ikinci bina sırası (cepheleri güneye bakar). */
const BACK_CENTERS = [-13.0, -9.6, -6.2, -2.8, 2.8, 6.2, 9.6, 13.0] as const;
const BACK_NAMES = [
  "OTEL", "SİNEMA", "POSTANE", "KÜTÜPHANE",
  "BELEDİYE", "SPOR", "SANAT EVİ", "KLİNİK",
] as const;

/**
 * Binalar İKİ sıra: (1) ana cadde boyunca 12 dükkan, (2) arka caddenin
 * arkasında 8 bina. İki sıranın da cephesi güneye (kameraya) bakar; cephe
 * hattı kendi çim şeridinin kuzey/arka kenarından 0.3 birim içeride durur.
 */
export const BUILDINGS: BuildingDef[] = [
  ...SHOP_CENTERS.map((x, i) => ({
    x,
    w: Math.abs(x) > 17 ? 2.0 : 2.4,
    h: 3.2 + (i % 3) * 0.6 + (i % 2) * 0.4,
    d: 1.8 + (i % 2) * 0.2,
    floors: 2 + (i % 2),
    windows: 2 + ((i + 1) % 2),
    frontZ: ZONE.northGrassTop + 0.3,
    roofDetail: SHOP_DETAILS[i % SHOP_DETAILS.length],
    ...SHOP_STYLES[i % SHOP_STYLES.length],
    signText: SHOP_NAMES[i],
  })),
  ...BACK_CENTERS.map((x, i) => ({
    x,
    w: 2.4,
    h: 3.0 + (i % 3) * 0.7 + (i % 2) * 0.5,
    d: 1.8,
    floors: 2 + (i % 2),
    windows: 2 + (i % 2),
    frontZ: ZONE.backGrassBot + 0.3,
    roofDetail: SHOP_DETAILS[(i + 2) % SHOP_DETAILS.length],
    ...SHOP_STYLES[(i + 3) % SHOP_STYLES.length],
    signText: BACK_NAMES[i],
  })),
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
  /** Bu X merkezlerinin `avoidRadius` çevresine ağaç dikilmez. */
  avoidX?: readonly number[];
  /** Kaçınılacak yarıçap (birim) — sokak ağızlarını boş bırakır. */
  avoidRadius?: number;
}

/**
 * Dikey sokak ağızlarının çevresinde bırakılacak ağaç boşluğu (birim).
 *
 * Sıralar 4 birim adımla dizildiği için sokak merkezlerine en yakın ağaçlar
 * ya TAM merkezde (0) ya 2 birim uzakta olur; bu eşik tam merkezdeki ağacı
 * eler, 2 birimdeki komşuyu korur (2 - 0.4 = 1.6 > sokak yarı genişliği 1.4).
 */
export const TREE_AVOID_RADIUS = 1.6;

/**
 * Üç sıra. Güney sırası yarım aralık kaydırıldı (`startX` farkı): karşılıklı
 * ağaçlar tam hizada durunca ızgara yapay görünüyor, kaydırma düzeni bozmadan
 * doğallık katıyor. Tüm sıralar `SIDE_STREETS` ağızlarını boş bırakır.
 */
export const TREE_ROWS: TreeRowDef[] = [
  // Kuzey sırası kuzey kaldırımın hemen arkasında (eski 0.5 birim ofset korundu).
  { z: -7.7, startX: -22, endX: 22, spacing: 4, avoidX: SIDE_STREETS, avoidRadius: TREE_AVOID_RADIUS },
  { z: 0.85, startX: -20, endX: 22, spacing: 4, avoidX: SIDE_STREETS, avoidRadius: TREE_AVOID_RADIUS },
  // Arka çim şeridi — arka sıra binaların önü.
  { z: -19.4, startX: -22, endX: 22, spacing: 4, avoidX: SIDE_STREETS, avoidRadius: TREE_AVOID_RADIUS },
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
  { x: 0, z: WORLD_CENTER_Z, w: WORLD_WIDTH + 4, d: WORLD_DEPTH + 4, y: GRASS_GROUND_Y },
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
  {
    // Arka çim şeridi (binaların arkasındaki yeni şerit).
    z: (ZONE.backGrassTop + ZONE.backGrassBot) / 2,
    depth: ZONE.backGrassTop - ZONE.backGrassBot,
    density: 2.0,
    seed: 511,
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
  // X 0 dikey sokağın ağzında kalır → lamba batıya kaydırıldı.
  { x: -3,  z: -6.2 },
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
  // Arka kaldırım (bant: -13.0..-14.0, merkez -13.5)
  { x: -20, z: -13.5 },
  { x: -11, z: -13.5 },
  { x: -3,  z: -13.5 },
  { x: 5,   z: -13.5 },
  { x: 13,  z: -13.5 },
  { x: 20,  z: -13.5 },
  // Arka sokağın kuzey kaldırımı (bant: -16.4..-17.4, merkez -16.9)
  { x: -8,  z: -16.9 },
  { x: 8,   z: -16.9 },
];

// ─── BENCH POSITIONS ───
export interface BenchDef {
  x: number;
  z: number;
  /**
   * Bankın baktığı yön — oturan karakterin de baktığı yön.
   *   `1`  (varsayılan): arkalık -Z'de, bank +Z'ye bakar (kamera / ana cadde).
   *   `-1`            : 180° döndürülmüş; arkalık +Z'de, bank -Z'ye bakar.
   * Sadece sırtı bir duvara dönük kalacak banklarda `-1` verilir (arka
   * sokaktaki banklar dükkan duvarına sıfır olduğu için oturan karakterin
   * bacakları duvarın içine girmesin diye çevrildi).
   */
  facing?: 1 | -1;
}

export const BENCHES: BenchDef[] = [
  { x: -10.5, z: -6.2 },  // kuzey kaldırım, lambaların arası
  { x: 4.5,   z: -6.2 },  // kuzey kaldırım
  { x: 18.5,  z: -6.2 },  // kuzey kaldırım, doğu ucu
  { x: -16,   z: -0.4 },  // güney kaldırım, bankın yanı
  { x: -1,    z: -0.4 },  // güney kaldırım, cadde ortası
  { x: 17,    z: -0.4 },  // güney kaldırım
  // Arka kaldırım — sokak ağızlarının dışında (|x| = 16 ve 0 boş kalır)
  // Duvar (-12.9) hemen güneyde kaldığı için bu üçü arkaya dönüktür.
  { x: -9.6,  z: -13.5, facing: -1 },
  { x: 3.6,   z: -13.5, facing: -1 },
  { x: 18.6,  z: -13.5, facing: -1 },
];

// ─── BENCH SITTING GEOMETRY ───
/** Bank minderi üst yüzeyi (bkz. `GameEngine3D › Bench3D`: 0.22 + 0.02/2). */
export const BENCH_SEAT_HEIGHT = 0.25;
/** Oturan kalçanın bank merkezinden baktığı yöne kayması. */
export const BENCH_SEAT_FORWARD = 0.06;
/** Bir banka oturma etkileşiminin göründüğü yarıçap (dünya birimi). */
export const BENCH_INTERACT_RADIUS = 1.15;

/**
 * Oturma noktasının dünya koordinatı — hem 3D avatara hem px katmanına
 * (`svgX`/`svgY`) aynı kaynaktan beslenir.
 */
export function benchSeatSpot(def: BenchDef): { x: number; z: number } {
  return { x: def.x, z: def.z + (def.facing ?? 1) * BENCH_SEAT_FORWARD };
}

/** Bankın baktığı yönü (1 | -1) normalize eder. */
export function benchFacing(def: BenchDef): 1 | -1 {
  return def.facing ?? 1;
}

/**
 * Oturma durumu — 3D avatara aktarılan tek bilgi. Karakterin nerede durduğu
 * `posRef`ten gelir (px), yön ise buradan.
 */
export interface SeatState {
  /** Bankın (dolayısıyla oturan karakterin) baktığı yön: +1 = +Z, -1 = -Z. */
  facing: 1 | -1;
}

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
  // Arka sokak (binaların arkası)
  { x: -6.5,  z: -13.55 },
  { x: 11,    z: -13.55 },
  { x: 5,     z: -16.9 },
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
  // Eski X -2.5 durağı dikey sokak ağzına denk geliyordu → batıya kaydırıldı.
  { x: -5.3,  z: -6.2, route: "34", color: "#0f766e" },
  // Arka sokak durağı (eski X 15.5 durağı sokak ağzındaydı).
  { x: 9.0,   z: -13.5, route: "7", color: "#b45309" },
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
  {
    // Arka sokak — caddenin arkasındaki yeni bölgenin yön tabelası.
    x: 6.8, z: -13.9,
    plates: [
      { text: "ÇARŞI", arrow: "left" },
      { text: "OTEL", arrow: "right" },
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

/** Sokak ağzında çitin bıraktığı boşluk (sokak yarı genişliği + pay). */
const FENCE_GAP = SIDE_STREET_W / 2 + 0.15;

/**
 * Bir çit hattını dikey sokak ağızlarında bölerek kesintisiz parçalara ayırır:
 * böylece yürünebilir sokak boşluğunun içinde çit kalmaz.
 */
function fenceSegments(z: number): FenceLineDef[] {
  const lines: FenceLineDef[] = [];
  const limit = WORLD_WIDTH / 2;
  let start = -limit;
  for (const street of SIDE_STREETS) {
    const cut = street - FENCE_GAP;
    if (cut > start) lines.push({ z, startX: start, endX: cut, enabled: true });
    start = street + FENCE_GAP;
  }
  if (start < limit) lines.push({ z, startX: start, endX: limit, enabled: true });
  return lines;
}

/**
 * Üç hat: güney çim (0.0), kuzey çim (-7.2) ve arka çim (-17.4). Dikey
 * sokaklar bu hatların hepsini kestiği için her hat sokak ağızlarında bölünür.
 */
export const FENCE_LINES: FenceLineDef[] = [
  ...fenceSegments(ZONE.southGrassTop),
  ...fenceSegments(ZONE.northGrassBot),
  ...fenceSegments(ZONE.backGrassTop),
];

/** Çit aralığı (birim) — çıtalar ve korkuluklar bunu kullanır. */
export const FENCE_SPACING = 0.28;

// ─── SVG WORLD DIMENSIONS (for backward compatibility) ───
export const SVG_WORLD_W = WORLD_WIDTH * S;
export const SVG_WORLD_H = WORLD_DEPTH * S;
