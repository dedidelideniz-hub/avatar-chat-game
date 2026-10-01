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
  /**
   * Gözün dikili olduğu GLB modeli. YOKSA GÖZ BOŞ KALIR — hiçbir şey
   * çizilmez (bkz. `engine/GlbBuilding.tsx`).
   *
   * Bina satırı artık prosedürel `Building` geometrisiyle değil, tek tek
   * eklenen modellerle kurulur: `public/models/` altına yeni bir GLB konup
   * ilgili göze bu alan yazıldığında bina otomatik olarak dikilir (ölçek,
   * zemin ve cephe hizası `buildingModelPrep.ts` içinde ÖLÇÜLEREK bulunur).
   */
  modelUrl?: string;
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

/* ── MODEL DİKİLEN GÖZLER ─────────────────────────────────────
   Satır artık prosedürel geometriyle değil, GLB modelleriyle kurulur.
   Aşağıdaki iki sabit yalnızca "hangi göz hangi modele sahip" bilgisini
   taşır; ölçek ve hizalamayı `GlbBuilding` modelden ÖLÇEREK yapar. */

/** Cadı dükkânı modeli (bkz. `engine/WitchShop.tsx`, `public/ASSETS.md`). */
export const WITCH_SHOP_MODEL_URL = "/models/witch_shop.glb";

/**
 * Cadı dükkânının dikildiği göz — 2 → X −13.0 (satırın batı blokları).
 *
 * GÖZÜN SEÇİM SEBEBİ: dükkânın kapı yolu batı komşusu DİKEY ARA SOKAKTAN
 * (X −16) cephe boyunca uzanır (bkz. `WITCH_SHOP_WALKWAY`). Cephenin önündeki
 * kaldırım şeridi sokak mobilyasıyla (lamba/bank/durak/tabela) dolu ve hepsi
 * KATI cisim: kaldırımı çimden kesen dikey bir koridor A* ızgarasında tek
 * hücreye düşüp karakteri sıkıştırıyordu. Ara sokaktan gelen yol HİÇBİR
 * propla kesişmez — bu yüzden bu göz seçildi.
 */
export const WITCH_SHOP_INDEX = 2;

/**
 * Bina GÖZLERİ — İKİ sıra: (1) ana cadde boyunca 12 göz, (2) arka caddenin
 * arkasında 8 göz. İki sıranın da cephesi güneye (kameraya) bakar; cephe
 * hattı kendi çim şeridinin kuzey/arka kenarından 0.3 birim içeride durur.
 *
 * GÖZLER BOŞTUR: yalnızca `modelUrl` atanmış göz dikilir. Renk/pencere/tabela
 * alanları prosedürel `Building` bileşeni için duruyor (o bileşen şu an
 * ÇİZİLMİYOR) ve yeni model geldikçe gözü tarif eden veri olarak kalıyor.
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
    modelUrl: i === WITCH_SHOP_INDEX ? WITCH_SHOP_MODEL_URL : undefined,
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
    // Arka sıra da boş: modeller eklendikçe buraya yazılacak.
  })),
];

/* ════════════════════════════════════════════════════════════
   CADI DÜKKÂNI (oyuncu evi) — giriş yolu ve kapı menzili
   ════════════════════════════════════════════════════════════ */

/** Cadı dükkânının göz tanımı — hem render hem yürünebilirlik buradan okur. */
export const WITCH_SHOP_DEF: BuildingDef = BUILDINGS[WITCH_SHOP_INDEX];

/* ════════════════════════════════════════════════════════════
   🏠 OYUNCU EVİ — caddede TEK ev, İÇİ her oyuncuya özel oda

   Ev YÜRÜNEREK GİRİLEN bir hacim DEĞİL: bina KATI bir kutudur, içine/üstüne
   çıkılamaz (bkz. `lib/shop.ts` → yürünebilir bölgeler). Oyuncu kapının önüne
   gelir, üç boyutlu "Evine gir" düğmesi belirir; düğmeye basınca kısa bir
   yükleme ekranı çıkar ve oyuncunun KENDİ odası açılır (`components/world/
   HouseRoom.tsx`).

   Ev KURULMAZ, ARSA SEÇİLMEZ: kapı caddede tek tanedir (cadı dükkânı modeli,
   `WITCH_SHOP_INDEX`) ve oda, oyuncu ilk kez girdiğinde sunucuda OTOMATİK
   açılır (`convex/houses.ts`).
   ════════════════════════════════════════════════════════════ */

/**
 * EV MENZİLİ — evin kapısının önündeki alan.
 *
 * Oyuncu bu dikdörtgenin içindeyken kapı "menzilde" sayılır ve "Evine gir"
 * düğmesi belirir. Alan, kapı yolunun bittiği kaldırımdan başlayıp binanın
 * CEPHE HATTIINDA (`frontZ`) biter: yoldan gelen oyuncu kapıya dayandığında da,
 * kaldırımdan geçen oyuncu kapının önüne geldiğinde de düğme görünür. Aradaki
 * çim şeridi yürünemediği için alanın o kısmı zaten ölüdür.
 */
export const HOUSE_TRIGGER = {
  /** Kapı merkezine göre yarım genişlik (kapı + avlu genişliği). */
  halfX: 1.1,
  /** Güney sınır: kaldırımın cadde kenarı (caddeden geçerken düğme belirmez). */
  southZ: ZONE.northSidewalkBot,
  /** Kuzey sınır: binanın cephe hattı (`frontZ`) — avlunun son santimi dahil. */
  northZ: ZONE.northGrassTop + 0.3,
} as const;

/** Arsa X sınırları (dünya birimi) — menzil testi buradan okur. */
export function houseTriggerBounds(x: number): { west: number; east: number } {
  return { west: x - HOUSE_TRIGGER.halfX, east: x + HOUSE_TRIGGER.halfX };
}

/**
 * Satırda DİKİLİ binaların model URL'leri (`BUILDINGS`ten türetilir).
 *
 * Ön yükleme ve yükleme kapısı bu listeyi kullanır: bina modelleri ağır
 * olabilir (ör. `witch_shop.glb` ~26 MB) ve cadde açıldıktan SONRA inmeye
 * başlarlarsa oyuncu boş arsaya bakar ("ev gelmemiş"). Bu yüzden indirme
 * giriş ekranında başlar ve yükleme kapısı bu modelleri bekler.
 */
export const BUILDING_MODEL_URLS: readonly string[] = BUILDINGS.map(
  (b) => b.modelUrl,
).filter((url): url is string => typeof url === "string" && url.length > 0);

/**
 * CADI DÜKKÂNI GİRİŞ YOLU — ölçüler tek yerde.
 *
 * Yol, KUZEY KALDIRIMINDAN başlar (ana caddeye kadar inmez): kaldırımdan çime
 * geçer, çimi aşar ve kapının önünde genişleyen avluda BİTER — binanın içi
 * yürünemez (bkz. `lib/shop.ts` → `WITCH_SHOP_WALK_ZONES`). İki parçadır:
 *
 *   1) YOL ŞERİDİ (`x ± pathHalfW`, `pathSouthZ` … `pathNorthZ`):
 *      dar (0.8 birim) taş yol. Kaldırımı, caddenin hemen kuzeyindeki lamba
 *      (−14) ile yön tabelası (−12) ARASINDAKİ boşluktan geçer — kaldırım
 *      şeridinin tamamı sokak mobilyasıyla dolu olduğu için yolun geçebileceği
 *      tek temiz aralık burasıdır.
 *   2) ÖN AVLU (`x ± foreHalfW`, `pathNorthZ` … `frontZ`):
 *      kapının önünde genişleyen avlu. Avlu BİNANIN CEPHE HATTINDA BİTER —
 *      binanın içi artık YÜRÜNEMEZ (bkz. `HOUSE_*`); oyuncu kapının önüne
 *      kadar gelir ve "Evine gir" düğmesiyle evine girer.
 *
 * Ölçüler karaktere göre: `PLAYER_RADIUS` 0.4 birim. Avlu/giriş 1.4 birim
 * geniş → gövde duvarlara değmeden geçer. Yol şeridi 0.8 birim: lamba ile
 * tabelanın bıraktığı 1.65 birimlik aralıkta `pushOutOfObstacles` yarıçapı
 * (0.4) kadarı düşülünce karaktere kalan tam koridor budur — yani karakter
 * iki propa da değmeden geçer.
 */
export const WITCH_SHOP_WALKWAY = {
  /** Binanın (ve kapının) X merkezi. */
  x: WITCH_SHOP_DEF.x,
  /** Yol şeridinin yarı genişliği (dar taş yol). */
  pathHalfW: 0.4,
  /** Avlunun/girişin yarı genişliği (kapı genişliği). */
  foreHalfW: 0.7,
  /**
   * Yolun GÜNEY ucunun Z'si — KUZEY KALDIRIMININ içinde biter.
   *
   * Yol ana caddeye kadar inmez: kaldırıma kadar gelmesi yeter. Kuzey
   * kaldırımı Z −7.2…−5.2'dir; yol `northSidewalkBot`ın 0.2 birim kuzeyinde
   * (−5.4) biter, yani kaldırımın İÇİNDE durur ve kaldırım bandıyla
   * KESİNTİSİZ birleşir (A* ızgarasında da ortak hücre oluşur → yol, caddeye
   * kaldırım üzerinden bağlıdır).
   */
  pathSouthZ: ZONE.northSidewalkBot - 0.2,
  /** Yol şeridinin bittiği, avlunun başladığı Z (binanın 0.9 önü). */
  pathNorthZ: WITCH_SHOP_DEF.frontZ + 0.9,
  /** Binanın cephe hattı — avlunun kapıyla buluştuğu Z. */
  frontZ: WITCH_SHOP_DEF.frontZ,
  /**
   * Kuzey sınır çitinde yolun açtığı boşluk yarı genişliği (`fenceSegments`).
   * Yol, kaldırımı çimden ayıran hattı (Z = `ZONE.northGrassBot`) kestiği için
   * çit orada bölünür; yoksa görünen çit yolun ortasından geçerdi.
   */
  fenceGapHalf: 0.4 + 0.2,
} as const;

/* ════════════════════════════════════════════════════════════
   🏠 ODANIN İÇİ — oyuncu evinin odası (`public/models/room.glb`)

   Kapıdaki "Evine gir" düğmesiyle açılan oda, GERÇEK bir iç mekân modelidir.
   Model ölçülür ve odaya oturtulur (`engine/roomModelPrep.ts`): sabit ölçek
   yazılmaz, çünkü modeller farklı kaynaklardan geliyor ve hiçbiri dünya
   biriminde değil — kutudan ölçek ve konum TÜRETİLİR.

   MODEL YOKSA (dosya inmemiş/bozuk): oda, kodla çizilen YEDEK odaya düşer
   (bkz. `components/world/HouseRoom.tsx`) — oyuncu yine odasını görür, cadde
   ve kapı akışı bozulmaz. Model hazır olduğunda yedek oda yumuşakça kaybolur.
   ════════════════════════════════════════════════════════════ */

export const ROOM_MODEL_URL = "/models/room.glb";

/** Odanın modele göre kurulumu (hepsi ölçülen kutudan türetilir). */
export const ROOM_FIT = {
  /** Odanın EN GENİŞ yatay kenarı bu birime ölçeklenir (≈ 8 m geniş salon). */
  span: 8,
  /** Odada duran karakterin boyu — sokaktaki avatarla aynı okunacak ölçek. */
  characterHeight: 1.75,
  /** Karakter odanın merkezinden NE KADAR öne (kameraya) dursun. */
  standZ: 0.25,
} as const;

/**
 * Odanın kamerası — odanın ÖN (güney, +Z) kenarından içeri bakar.
 *
 * Kamera odaya DİKİZ yerleştirilir (sabit bir "diorama" açısı): oyuncu odanın
 * içinde duran karakteri ve arkasındaki mekânı görür. Yükseklik/hedef, odanın
 * ölçülen yüksekliğine göre kısılır (`roomModelPrep.planRoomCamera`) — alçak
 * bir modelde kamera tavanın dışında kalmasın.
 */
export const ROOM_CAMERA = {
  /** Dikey görüş açısı. */
  fov: 48,
  /** Göz yüksekliği (birim) — karakterin göz hizası. */
  eyeY: 1.6,
  /** Bakış hedefinin yüksekliği. */
  targetY: 1.3,
  /** Kameranın odanın ön kenarından içeri girme miktarı. */
  inset: 0.8,
  /** Bakış hedefinin oda merkezinden kuzeye kayması (birim). */
  targetZ: 1.1,
  /** Kameranın karaktere en yakın kalabileceği mesafe (dar odalarda). */
  minDistance: 1.4,
} as const;

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
 * Çim örtüsünün toplam açıklığı (kare).
 *
 * Oynanabilir alan yalnızca 48×28 birim olsa da zemin ÇOK daha geniş
 * döşenir: oyuncu haritanın kenarına gidip dışarı baktığında artık düz mavi
 * bir boşluk değil, ufka kadar uzanan çim görür. Ufuk `GameEngine3D`'deki
 * uzaklık sisiyle (fog) gökyüzü rengine bağlanır — sisi geçen mesafede
 * zemin biter, yani döşemenin kenarı HİÇ görünmez.
 *
 * Ölçü: kameranın merkezden en uzak konumu ≈ 45 birim (oynanabilir alanın
 * köşesi + takip mesafesi). Sis `far` = 120 olduğu için kenarın sisin
 * dışında kalması yeterli: 400/2 − 45 = 155 > 120 ✔
 */
export const GRASS_GROUND_SPAN = 400;

/**
 * Tek bölge: caddenin ve binaların altındaki tüm zemin (eski "arka plan çimi"
 * + kuzey ve güney yeşil şeritleri) ve onun çok geniş uzantısı.
 *
 * Yol (0.008) ve kaldırım (0.005) bu zeminin hemen üstünde kaldığı için çim
 * sadece yeşil alanlarda görünür. Bölge TEK olduğundan karo ızgarası da
 * tektir → dikiş ya da desen kayması olmaz (`buildGrassGroundPlacements`
 * ızgarayı bölge merkezine göre kurar).
 *
 * NOT: Yürünebilirlik bu bölgeye göre DEĞİL `WALKABLE_ZONES`e göre
 * belirlenir; uzayan çim oynanabilir alanı büyütmez — çitlerin dışı hâlâ
 * yürünemez (bkz. `lib/shop.ts` → `inWalkable`).
 */
export const GRASS_GROUND_ZONES: GrassGroundZoneDef[] = [
  {
    x: 0,
    z: WORLD_CENTER_Z,
    w: GRASS_GROUND_SPAN,
    d: GRASS_GROUND_SPAN,
    y: GRASS_GROUND_Y,
  },
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
   *   `1`  (varsayılan): arkalık -Z'de, bank +Z'ye bakar (camere / güney).
   *   `-1`            : 180° döndürülmüş; arkalık +Z'de, bank -Z'ye bakar.
   *
   * KURAL: bank, ARKASI dönük olduğu yere sırtını verir ve oturan kişi YOLA
   * bakar. Yani kuzey kaldırım bankları güneye (yola, `1`), güney kaldırım
   * bankları kuzeye (yola, `-1`) bakar. Karakter `rotation.y = facing === 1 ?
   * 0 : π` yönüne döner (bkz. `GlbAvatar3D` ve `World.tsx`).
   *
   * Önceden güney kaldırım bankları da `1` idi: karakter caddeye sırtını
   * dönüp çimenliğe bakıyordu — ekran görüntüsündeki "ters oturmuş" görünüm.
   */
  facing?: 1 | -1;
}

export const BENCHES: BenchDef[] = [
  // Sadece 3 bank, hepsi ANA CADDE (kuzey) kaldırımının ÇİM/ÇİT KENARINDA:
  // `z = -6.85` → arkalık çit hattına (-7.2) yaslanır, önü CADDEYE bakar.
  // Kaldırımın ortasında (yürüyüş hattında) bank YOK; yaya geçitlerinin (X
  // -16/0/16) ve otobüs duraklarının (sokak mobilyası) üzerinde de bank YOK.
  // Bank ayak izi 1.6 birim geniş → komşu prop'lardan en az ~1.7 birim uzak.
  { x: -10.5, z: -6.85 },  // lamba -14 ile -7 arası (OYUNCAK/FIRIN önü)
  { x: 4.5,   z: -6.85 },  // PASTANE/ÇİÇEKÇİ önü (çöp 2.4 ile lamba 7 arası)
  { x: 19,    z: -6.85 },  // doğu ucu (lamba 21 ile geçit 16 arası, AYAKKABI/KUYUM önü)
];

// ─── BENCH SITTING GEOMETRY ───
/**
 * BANK ÖLÇÜLERİ (dünya birimi). Referans: oyuncu 1.92 birim.
 *
 * ÖLÇEK NEDEN BÜYÜDÜ: eski bank 0.55 × 0.24 birimdi — yetişkin bir insan
 * için ~0.55 m geniş, 0.24 m yüksek bir bank. Karakterin arkasında
 * kaybolduğu için "bankta oturuyor" okunmuyordu (bkz. Bench3D). Yeni
 * ölçüler gerçek park bankı oranlarında.
 */
export const BENCH_WIDTH = 1.6;
/**
 * Oturma yüzeyinin Z derinliği (çıtaların dış kenarları arası).
 *
 * 0.56: gerçek park banklarından biraz derin — bilinçli. Oyuncu avatarları
 * tıknaz (varsayılan avatar 1.28 birim derin!), 0.44'lik minderde bankın
 * oturma yüzeyi gövdenin altında tamamen kayboluyordu ("bankın içine
 * gömülmüş" görünüm). Daha derin + 4 çıtalı minder gövdenin altında
 * görünür kalır.
 */
export const BENCH_SEAT_DEPTH = 0.56;
/** Oturma çıtalarının üst yüzeyi (bkz. `GameEngine3D › Bench3D`). */
export const BENCH_SEAT_TOP = 0.46;
/**
 * Oturan KALÇA EKLEMİNİN (uyluk kökleri) NOMİNAL dünya yüksekliği — yalnızca
 * kaba geometri kontrolü (`scripts/check-bench-sit.ts`) içindir.
 *
 * NEDEN MİNDER + ~15 CM: kalça KEMİĞİ mindere oturmaz; mindere değen kısım
 * onun altındaki kalça/but DOKUSUdur. Bu doku modelden modele değişir, bu
 * yüzden ÇALIŞMA ZAMANINDA her model için AYRICA ÖLÇÜLÜR (`SitPose.ts`
 * `measureSeatPad`: kalça ekleminin altındaki en alçak tepe noktası) ve kalça
 * mindere tam oturtulur. Buradaki sabit yalnızca o ölçümün tipik değeridir
 * (ölçülen: varsayılan avatar 0.07, savaşçı 0.17, samuray 0.23, şövalye 0.16).
 */
export const BENCH_SEAT_HEIGHT = 0.61;
/**
 * Kalça, bankın ORTASINDAN baktığı yöne bu kadar öne kayar (dünya birimi).
 *
 * NEDEN MİNDERİN ÜSTÜNDE (ön kenarda değil): kalça tam ön kenara
 * yerleştirildiğinde karakter bankın üstünde değil, havada/kenarda duruyormuş
 * gibi okunuyordu (ekran görüntüsündeki "oturmuyor" görünümü: minder
 * karakterin ARKASINDA kalıyordu). Gerçek oturuşta kalça mindere oturur,
 * uyluklar öne uzanıp minderin ön kenarını aşar ve baldırlar ön kenardan
 * sarkar — `SitPose.ts` bunu uyluk eğimi + dikey baldırla üretir.
 *
 * NEDEN TAM ORTADA DEĞİL: tıknaz avatarda bacak kısadır (uyluk ~0.25 birim);
 * kalça tam ortada olsaydı diz minderin ön kenarının GERİSİNDE kalır ve
 * baldır ön çıtaların içinden geçerdi. 0.12'de diz ön çıtanın önüne taşar,
 * baldır serbest sarkar, kalça dokusu yine de tamamen minderin üstünde kalır
 * (ölçüm: `scripts/check-sit-model-pose.ts`).
 *
 * İşaret bankın yönünden türetilir: kuzey bankında +Z, güney/arka bankında -Z.
 */
export const BENCH_SEAT_FORWARD = 0.12;
/**
 * Otururken gövdenin (omurga) geriye yatma açısı (radyan) — sırt arkalığa
 * yaslanır. Pozu uygulayan `SitPose.applySitPose` omurga kemiğini bu kadar
 * döndürür; kemik bulunamazsa kalça kemiği döner (düşme payı).
 */
export const SIT_LEAN = 0.09;
/** Bir banka oturma etkileşiminin göründüğü yarıçap (dünya birimi). */
export const BENCH_INTERACT_RADIUS = 1.35;
/**
 * Bankın ÖNÜNDE durulacak mesafe (dünya birimi) — karakter ışınlanmaz,
 * önce buraya YÜRÜR, sonra oturma geçişi başlar (bkz. World.tsx `requestSit`).
 * Kısa tutulur: kalkarken ve otururken karakterin mindere kaydığı mesafe bu
 * kadardır; uzun mesafede "kayıyor" gibi görünüyordu.
 */
export const BENCH_STAND_OFFSET = 0.6;
/** Ayakta durulacak nokta yürünebilir değilse denenecek daha kısa mesafeler. */
export const BENCH_STAND_FALLBACKS = [
  0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.2, 0.1,
] as const;
/**
 * BANKIN ARKALIK DÜZLEMİ (bank merkezinden, dünya birimi).
 *
 * Oturma yüzeyi 0.56 derin (arkası −0.28); arkalık bu yüzeyin 10 cm gerisinde
 * durur. Sebep: oturan karakterin SIRTI arkalığa yaslandığında çıtaların
 * içine girmesin — özellikle tıknaz avatarlarda gövde derinliği minderi
 * aştığı için arkalık geride olmalı (`GameEngine3D › Bench3D`).
 */
export const BENCH_BACK_OFFSET = 0.38;
/** Oturma/kalkma yer değiştirmesinin süresi (saniye) — poz geçişiyle uyumlu. */
export const SEAT_TRANSITION_SECONDS = 0.55;

/**
 * Bankın önünde durulacak dünya noktası (bank baktığı yöne `offset` kadar
 * ötede). `facing: 1` → +Z yönünde, `-1` → -Z yönünde.
 */
export function benchStandSpot(
  def: BenchDef,
  offset = BENCH_STAND_OFFSET,
): { x: number; z: number } {
  const seat = benchSeatSpot(def);
  return { x: seat.x, z: seat.z + benchFacing(def) * offset };
}

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
 * Bankta oturan karakterin Y dönüşü (radyan).
 *
 * `0` = modelin ileri ekseni +Z (yani güney / kamera yönü), `Math.PI` = −Z.
 * Karakter BANKIN BAKTIĞI yöne döner — yani yüzü her zaman CADDEYE döner:
 *   • kuzey kaldırım bankı (+Z'ye bakar) → `0`  → yüz güneye, kamereye
 *   • güney kaldırım bankı (−Z'ye bakar) → `π`  → yüz kuzeye, caddeye
 *   • arka sokak bankı (−Z'ye bakar)     → `π`
 * Yön oturduğu sürece KİLİTLİDİR (`GlbAvatar3D` her karede bu değere lerp
 * eder); sadece kalkınca hareket yönüne döner.
 */
export function benchSeatYaw(def: BenchDef): number {
  return benchFacing(def) === 1 ? 0 : Math.PI;
}

/**
 * Oturma durumu — 3D avatara aktarılan tek bilgi. Karakterin nerede durduğu
 * `posRef`ten gelir (px), yön ise buradan.
 */
export interface SeatState {
  /** Bankın (dolayısıyla oturan karakterin) baktığı yön: +1 = +Z, -1 = -Z. */
  facing: 1 | -1;
  /**
   * Karakterin otururken kilitleneceği Y dönüşü (radyan) — `benchSeatYaw`.
   * Yönü tek yerden türetmek için depoda taşınır (0 = +Z / kamera,
   * π = −Z / cadde).
   */
  yaw: number;
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
  { x: 9.5,   z: -5.55 }, // kuzey kaldırım, yol kenarı
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

/** Hatta açılacak boşluk (merkez X + yarı genişlik). */
interface FenceOpening {
  x: number;
  half: number;
}

/**
 * Bir çit hattını boşlukların bulunduğu yerlerde bölerek kesintisiz parçalara
 * ayırır: böylece yürünebilir sokak boşluğunun (veya dükkân yolunun) içinde
 * çit kalmaz.
 *
 * `extraOpenings` hat başına eklenen boşluklardır — ör. cadı dükkânının kapı
 * yolu kuzey hattı kestiği için o hat ayrıca bölünür (bkz. `FENCE_LINES`).
 */
function fenceSegments(
  z: number,
  extraOpenings: readonly FenceOpening[] = [],
): FenceLineDef[] {
  const openings = [
    ...SIDE_STREETS.map((x) => ({ x, half: FENCE_GAP })),
    ...extraOpenings,
  ].sort((a, b) => a.x - b.x);

  const lines: FenceLineDef[] = [];
  const limit = WORLD_WIDTH / 2;
  let start = -limit;
  for (const opening of openings) {
    const cut = opening.x - opening.half;
    const resume = opening.x + opening.half;
    // Boşluk hattın dışında/geriye kalmışsa hattı bozmadan atla.
    if (resume <= start) continue;
    const cutAt = Math.max(cut, start);
    if (cutAt > start) {
      lines.push({ z, startX: start, endX: cutAt, enabled: true });
    }
    start = resume;
  }
  if (start < limit) lines.push({ z, startX: start, endX: limit, enabled: true });
  return lines;
}

/**
 * Üç hat: güney çim (0.0), kuzey çim (-7.2) ve arka çim (-17.4).
 *
 * Yalnızca DİKEY SOKAKLARIN KESTİĞİ hatlar bölünür: sokak asfaltı Z
 * `SIDE_STREET_SOUTH` (+4.0) ile `backNorthWalkTop` (-16.4) arasında uzanır, yani
 * güney (+0.0) ve kuzey (-7.2) hatlarını keser, ARKA hat (-17.4) ile
 * kesişmez. Arka hat da eskiden bölünüyordu → oyuncu arka yolun kuzey
 * sınırında (`WORLD_BOUNDS`) çitin ortasındaki boşlukta çıplak çimle
 * kalıyordu (ekran görüntüsü). Arka hat artık KESİNTİSİZDİR: sokak ağzı
 * olmadığı için çit duvar gibi kesilmemeli.
 *
 * KUZEY hattı ayrıca CADI DÜKKÂNI yolunda da bölünür: yol kaldırımdan çime
 * tam o hattan geçer (bkz. `WITCH_SHOP_WALKWAY`). Bu boşluk YALNIZCA kuzey
 * hattına verilir — güney hattında (Z 0.0) yol yok, orada çit kesilemezdi.
 */
export const FENCE_LINES: FenceLineDef[] = [
  ...fenceSegments(ZONE.southGrassTop),
  ...fenceSegments(ZONE.northGrassBot, [
    { x: WITCH_SHOP_WALKWAY.x, half: WITCH_SHOP_WALKWAY.fenceGapHalf },
  ]),
  { z: ZONE.backGrassTop, startX: -WORLD_WIDTH / 2, endX: WORLD_WIDTH / 2, enabled: true },
];

/** Çit aralığı (birim) — çıtalar ve korkuluklar bunu kullanır. */
export const FENCE_SPACING = 0.28;

/* ════════════════════════════════════════════════════════════
   DİKEY SOKAK KENARI ÇİTLERİ — çime geçişi kesen hatlar

   Sınır çitleri (`FENCE_LINES`) yalnızca YATAYDI (sabit Z). Dikey ara sokaklar
   bu hatları kestiği için sokak ağzında hiç çit kalmıyordu: oyuncu asfalt
   şeritte dururken iki yanı (ve güneyde önü) çitsiz çim olarak görünüyordu —
   ekran görüntüsündeki "yolun ortasında çimen" hissi. Aşağıdaki kenarlar
   sokağın TAM asfalt kenarına oturur (X = sokak ± `SIDE_STREET_W`/2) ve
   yalnızca ÇİM boyunca çekilir; kaldırım/cadde bantlarında (oralarda zaten
   çim yok) çit yoktur.
   ════════════════════════════════════════════════════════════ */
/** Z boyunca uzanan (sabit X) çit kenarı — sokak asfaltı ↔ çim sınırı. */
export interface FenceEdgeDef {
  /** Hattın sabit X'i — sokak asfaltı ile çimin birleştiği çizgi. */
  x: number;
  /** Güney ucu (büyük Z). */
  startZ: number;
  /** Kuzey ucu (küçük Z). */
  endZ: number;
  enabled: boolean;
}

/**
 * Sokak kenarında çit gereken çim aralıkları. İki bant:
 *   · güney ağız : güney kaldırım ↔ çim hattından (0.0) sokağın güney ucuna (4.0)
 *   · kuzey taraf: kuzey kaldırım (-7.2) ↔ ARKA KALDIRIM (-13.0)
 *
 * Kuzey kenar çim şeridinde (…-11.2) bitmez, arka kaldırıma kadar iner: dükkan
 * bloklarının ARASINDA da (Z -10.9…-12.9) sokağın iki yanında ~0.6 birimlik
 * çıplak çim dilimi kalıyor ve orası arka yola bakar — çit olmadan tam da
 * ekran görüntüsündeki "çitsiz çim" görünümü oluşuyordu.
 */
const FENCE_EDGE_SPANS: readonly { south: number; north: number }[] = [
  { south: SIDE_STREET_SOUTH, north: ZONE.southGrassTop },
  { south: ZONE.northGrassBot, north: ZONE.backWalkTop },
];

/** Her sokak için iki kenar (batı/doğu) × iki çim bandı = 4 kenar. */
export const FENCE_EDGES: FenceEdgeDef[] = SIDE_STREETS.flatMap((sx) =>
  [-1, 1].flatMap((side) =>
    FENCE_EDGE_SPANS.map((span) => ({
      x: sx + side * (SIDE_STREET_W / 2),
      startZ: span.south,
      endZ: span.north,
      enabled: true,
    })),
  ),
);

/**
 * Sokağın GÜNEY UCUNU kapatan yatay hat (Z = sokak ağzının bittiği çizgi).
 * Sokak burada harita kenarında çıkmaza girer; kapak olmadan asfalt çim içinde
 * yarıda kesilmiş gibi görünüyordu. Kapak, yürünebilir sınırın (`WORLD_BOUNDS`)
 * tam üstünde durur: görünen çit ile çarpışma hattı aynı yerdir.
 */
export const FENCE_CAPS: FenceLineDef[] = SIDE_STREETS.map((sx) => ({
  z: SIDE_STREET_SOUTH,
  startX: sx - SIDE_STREET_W / 2,
  endX: sx + SIDE_STREET_W / 2,
  enabled: true,
}));

// ─── SVG WORLD DIMENSIONS (for backward compatibility) ───
export const SVG_WORLD_W = WORLD_WIDTH * S;
export const SVG_WORLD_H = WORLD_DEPTH * S;
