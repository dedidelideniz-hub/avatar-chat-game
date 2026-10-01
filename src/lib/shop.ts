/**
 * Vaelos Avatar Chat — street economy.
 * Shared between the Convex backend (buyItem / claimDailyBonus) and the World
 * page, so prices and stock are defined in exactly one place. Keep this file
 * dependency-free (no React imports).
 */

import {
  S,
  SIDE_STREETS,
  SIDE_STREET_SOUTH,
  SIDE_STREET_W,
  WORLD_DEPTH,
  WORLD_WIDTH,
  WORLD_Z_MAX,
  STALLS,
  LAMPS,
  BENCHES,
  BUS_STOPS,
  TRASH_CANS,
  DIRECTION_SIGNS,
  BENCH_WIDTH,
  ZONE,
  WITCH_SHOP_WALKWAY,
} from "../engine/constants";

/* ── SVG px katmanı ───────────────────────────────────────────
   Oyun mantığı (tıklama → yürüme, yol bulma, mini harita, satıcı
   etkileşimi) 3D dünyanın düzleştirilmiş SVG karşılığını kullanır.
   Dönüşüm `GameEngine3D`'deki `svgToWorld` ile BİREBİR aynı olmalı:

     x3 = svgX / S - WORLD_WIDTH / 2
     z3 = WORLD_Z_MAX - svgY / S

   Yani 1 dünya birimi = S px; px katmanının y = 0 kenarı Z = `WORLD_Z_MAX`
   (haritanın en GÜNEY kenarı), y = MAP_H kenarı ise `WORLD_Z_MIN`'dir.
   Harita büyüdüğünde (X 32→48, Z 18→28 ve kuzeye arka sokak) yalnızca
   `engine/constants` içindeki WORLD_* ve ZONE değişir; aşağıdaki
   yerleşimlerin tamamı bu dönüşümden türetildiği için kendiliğinden
   ölçeklenir (elle px güncellemek gerekmez).
   ──────────────────────────────────────────────────────────── */

export const MAP_W = WORLD_WIDTH * S;
export const MAP_H = WORLD_DEPTH * S;

/** Dünya X'i → harita px'i. */
export function svgX(x: number): number {
  return (x + WORLD_WIDTH / 2) * S;
}

/** Dünya Z'si → harita px'i (kuzey = büyük y, ekranda aşağı). */
export function svgY(z: number): number {
  return (WORLD_Z_MAX - z) * S;
}

export const CURRENCY_NAME = "Vaelos Parası";
export const CURRENCY_EMOJI = "🪙";
export const STARTING_COINS = 500;
export const DAILY_BONUS = 150;
export const DAILY_BONUS_MS = 24 * 60 * 60 * 1000;

/**
 * Speech-bubble colors. Everyone gets the default (white) bubble; the
 * colored bubbles are a VIP membership perk (see VIP_VENDOR_ID below).
 */
export interface BubbleColor {
  id: string;
  name: string;
  hex: string; // bubble fill
  text: string; // text drawn on the bubble
  stroke: string; // outline (white border like the classic comic bubble)
  strokeOpacity: number;
  vip: boolean; // true → requires an active VIP membership
}

export const BUBBLE_COLORS: BubbleColor[] = [
  {
    id: "beyaz",
    name: "Beyaz",
    hex: "#ffffff",
    text: "#2b2320",
    stroke: "#3d2f2a",
    strokeOpacity: 0.22,
    vip: false,
  },
  {
    id: "nane",
    name: "Nane",
    hex: "#14b8a6",
    text: "#ffffff",
    stroke: "#ffffff",
    strokeOpacity: 0.95,
    vip: true,
  },
  {
    id: "sari",
    name: "Sarı",
    hex: "#f7c948",
    text: "#2b2320",
    stroke: "#ffffff",
    strokeOpacity: 0.95,
    vip: true,
  },
  {
    id: "gri",
    name: "Gri",
    hex: "#9ca3af",
    text: "#1f2937",
    stroke: "#ffffff",
    strokeOpacity: 0.95,
    vip: true,
  },
  {
    id: "siyah",
    name: "Siyah",
    hex: "#1f2937",
    text: "#ffffff",
    stroke: "#ffffff",
    strokeOpacity: 0.95,
    vip: true,
  },
  {
    id: "pembe",
    name: "Pembe",
    hex: "#ec4899",
    text: "#ffffff",
    stroke: "#ffffff",
    strokeOpacity: 0.95,
    vip: true,
  },
  {
    id: "kirmizi",
    name: "Kırmızı",
    hex: "#ef4444",
    text: "#ffffff",
    stroke: "#ffffff",
    strokeOpacity: 0.95,
    vip: true,
  },
  {
    id: "antrasit",
    name: "Antrasit",
    hex: "#4b5563",
    text: "#ffffff",
    stroke: "#ffffff",
    strokeOpacity: 0.95,
    vip: true,
  },
  {
    id: "turuncu",
    name: "Turuncu",
    hex: "#f97316",
    text: "#ffffff",
    stroke: "#ffffff",
    strokeOpacity: 0.95,
    vip: true,
  },
];

export const DEFAULT_BUBBLE_COLOR = "beyaz";

/**
 * Battle supers (Brawl-styled). Every fighter has a base attack; the super is
 * a special ability charged by dealing and taking damage. The player buys
 * supers here (shop), bots each have a fixed one.
 */
export type AbilityId =
  | "temel" // piercing strong shot (free default)
  | "isik" // long beam
  | "simsek" // dash through the enemy
  | "sifa" // heal self
  | "ates"; // exploding fireball

export interface AbilityDef {
  id: AbilityId;
  name: string;
  emoji: string;
  description: string;
  price: number; // SP (0 = free default)
}

export const ABILITIES: AbilityDef[] = [
  {
    id: "temel",
    name: "Güçlü Vuruş",
    emoji: "💥",
    description: "Delip geçen dev bir atış — herkese varsayılan.",
    price: 0,
  },
  {
    id: "sifa",
    name: "Can Doldurma",
    emoji: "💚",
    description: "Anında canının %45'ini geri kazandırır.",
    price: 350,
  },
  {
    id: "isik",
    name: "Işık Huzmesi",
    emoji: "✨",
    description: "İleri doğru uzun bir ışık huzmesi fırlatır.",
    price: 400,
  },
  {
    id: "simsek",
    name: "Şimşek Adımı",
    emoji: "⚡",
    description: "Öne hızla kayar, yoluna çıkanı yaralar.",
    price: 500,
  },
  {
    id: "ates",
    name: "Ateş Topu",
    emoji: "🔥",
    description: "Hedef noktada patlayan dev bir ateş topu.",
    price: 600,
  },
];

export const DEFAULT_ABILITY = "temel";

export function abilityOf(id: string): AbilityDef {
  return ABILITIES.find((a) => a.id === id) ?? ABILITIES[0];
}

export function isAbilityId(id: string): boolean {
  return ABILITIES.some((a) => a.id === id);
}

export function bubbleColorOf(id: string): BubbleColor {
  return BUBBLE_COLORS.find((c) => c.id === id) ?? BUBBLE_COLORS[0];
}

/** VIP membership — unlocks every speech-bubble color at the VIP stand. */
export const VIP_VENDOR_ID = "vip";
export const VIP_PRICE = 1500; // Vaelos Parası
export const VIP_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün
export const VIP_DURATION_DAYS = 30;

export function formatCoins(amount: number): string {
  return amount.toLocaleString("tr-TR");
}

export type WearSlot =
  | "head"
  | "face"
  | "neck"
  | "hand"
  | "chest"
  | "back"
  | "hands"
  | "feet"
  | "legs";

/** How many items can be worn at once in each slot. */
export const WEAR_SLOT_CAPACITY: Record<WearSlot, number> = {
  head: 1,
  face: 1,
  neck: 1,
  hand: 2, // both hands (main + off-hand)
  chest: 1,
  back: 1,
  hands: 1,
  feet: 1,
  legs: 1,
};

export const WEAR_SLOT_LABELS: Record<WearSlot, string> = {
  head: "Baş",
  face: "Yüz",
  neck: "Boyun",
  hand: "El",
  chest: "Gövde",
  back: "Sırt",
  hands: "Eller",
  feet: "Ayaklar",
  legs: "Bacaklar",
};

export interface Product {
  id: string;
  name: string;
  emoji: string;
  price: number; // in Vaelos Parası
  description: string;
  vendorId: string;
  /** Body slot where the item is shown while equipped. */
  slot: WearSlot;
  /** Emoji used on the avatar when equipped (defaults to `emoji`). */
  wearEmoji?: string;
  /** GLB URL for 3D character preview in shop (skin products). */
  skinUrl?: string;
}

export function wearEmojiOf(product: Product): string {
  return product.wearEmoji ?? product.emoji;
}

export interface Vendor {
  id: string;
  name: string;
  short: string;
  emoji: string;
  color: string; // awning main color
  accent: string; // awning stripe color
  x: number; // stall center in world coordinates
  y: number; // ground line of the stall
}

/**
 * Satıcı kimlikleri (kimlik/simge/ad) — renk ve KONUM 3D tezgâh verisinden
 * (`STALLS`, `engine/constants`) türetilir. Böylece tezgâhı cadde üzerinde
 * başka bir X'e taşımak için tek yer değiştirilir; 2D katman (tıklama,
 * engeller, mini harita) otomatik hizalanır.
 */
const VENDOR_IDENTITY = [
  { id: "dondurma", name: "Emre'nin Dondurma Tezgâhı", short: "Dondurma", emoji: "🍦" },
  { id: "balon", name: "Zeynep'in Balon Standı", short: "Balonlar", emoji: "🎈" },
  { id: "oyuncak", name: "Oyuncakçı Dede", short: "Oyuncakçı", emoji: "🧸" },
  { id: "moda", name: "Selin'in Moda Standı", short: "Moda", emoji: "🕶️" },
  { id: "silahci", name: "Kemal'in Silah Dükkanı", short: "Silahçı", emoji: "⚔️" },
  { id: VIP_VENDOR_ID, name: "Kraliyet VIP Köşesi", short: "VIP Üyelik", emoji: "👑" },
] as const;

/** Satıcının tezgâhın önünde durduğu Z çizgisi (tezgâh merkezinden 0.3 birim güney). */
const VENDOR_ROW_Z = STALLS[0].z - 0.3;

export const VENDORS: Vendor[] = VENDOR_IDENTITY.map((identity, i) => {
  // `STALLS` ile aynı sırada: dondurma, balon, oyuncak, moda, silahçı, VIP.
  const stall = STALLS[i];
  return {
    ...identity,
    color: stall.color,
    accent: stall.accent,
    x: svgX(stall.x),
    y: svgY(VENDOR_ROW_Z),
  };
});

/**
 * All old legacy products (balloon, ice cream, toy, etc.) have been removed.
 * Each product here maps 1:1 to an EquipmentDef in GlbAvatar3D.tsx.
 * The `id` must match the EquipmentRegistry item ID exactly.
 *
 * Slot rules:
 *   head/face/neck/chest/back/hands/feet/legs → 1 item per slot
 *   hand → up to 2 items (main + off-hand)
 *
 * VENDORS (stall references) are preserved for the 3D world layout.
 */
export const PRODUCTS: Product[] = [
  // ═══ Selin'in Moda Standı — Karakter Skinleri ═══
  {
    id: "skin-samuray",
    name: "Samuray Savaşçı",
    emoji: "⚔️",
    price: 1200,
    description:
      "Stilize düşük poligon samuray — idle/walk/run/jump animasyonları dahil.",
    vendorId: "moda",
    slot: "chest",
    skinUrl: "/models/skin-samuray.glb",
  },
  {
    id: "skin-sevalye",
    name: "Şövalye Karakter",
    emoji: "🛡️",
    price: 1500,
    description:
      "Detaylı şövalye zırhlı karakter — idle/walk animasyonları dahil.",
    vendorId: "moda",
    slot: "chest",
    skinUrl: "/models/skin-sevalye.glb",
  },
  {
    id: "skin-savasci-glb",
    name: "Kraliyet Savaşçısı",
    emoji: "⚔️",
    price: 1350,
    description:
      "Tam gövdeli, ayakları görünür savaşçı karakter — animasyonlu GLB skin.",
    vendorId: "moda",
    slot: "chest",
    skinUrl: "/models/skin-savasci.glb",
  },
];

/** Product lookup helpers. */
export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function getVendor(id: string): Vendor | undefined {
  return VENDORS.find((v) => v.id === id);
}

export function productsOf(vendorId: string): Product[] {
  return PRODUCTS.filter((p) => p.vendorId === vendorId);
}

/**
 * Kuşanılmış TAM karakter skini (Kraliyet Savaşçısı / Samuray / Şövalye).
 *
 * KURAL: hazır karakter modelleri ORİJİNAL renklerini (yazarın dokularını)
 * korur — oyuncunun seçtiği renk yalnızca VARSAYILAN görünümü boyar. Bu
 * yüzden skin giyiliyken renk seçimi hiç açılmaz (boşa renk hakkı harcanmaz)
 * ve 3D tarafta boyama uygulanmaz (bkz. applyCharacterTint çağrıları).
 */
export function wornCharacterSkin(
  equipped: string[] | undefined,
): Product | undefined {
  return (equipped ?? [])
    .map((id) => getProduct(id))
    .find((product) => product !== undefined && product.skinUrl !== undefined);
}

/** Daily gift box position + reach radius (harita px; caddenin ortası, Z -2.4). */
export const GIFT_BOX = {
  x: svgX(0),
  y: svgY(-2.4),
  radius: 115,
};

/** Click radius on the gift box itself (world coordinates). */
export const GIFT_CLICK_RADIUS = 70;

/**
 * Where the vendor person stands behind each counter. The market page opens
 * only when tapping the vendor character itself — the rest of the stall
 * (awning, counter, wares) is scenery. The sprite is drawn at
 * translate(vendor.x - 27, vendor.y - 120) at 54x70 world units; the box
 * adds a small tap margin so the target stays comfortable on phones.
 *
 * The box is centered slightly left of the stall (centerX -18) because in
 * portrait the vendor sprite is counter-rotated about its feet, which moves
 * its visual center ~35 units left of the stall center — the tap target
 * follows the sprite in both orientations.
 */
const VENDOR_CLICK_BOX = { centerX: -18, halfW: 45, top: -124, bottom: -48 };

/** The vendor whose character contains this point, if any. */
export function vendorAtPoint(x: number, y: number): Vendor | undefined {
  return VENDORS.find(
    (v) =>
      x >= v.x + VENDOR_CLICK_BOX.centerX - VENDOR_CLICK_BOX.halfW &&
      x <= v.x + VENDOR_CLICK_BOX.centerX + VENDOR_CLICK_BOX.halfW &&
      y >= v.y + VENDOR_CLICK_BOX.top &&
      y <= v.y + VENDOR_CLICK_BOX.bottom,
  );
}

/**
 * World bounds the player can walk in — yürünebilir bantların (güney kaldırım
 * üstünden kuzey kaldırımın çim sınırına kadar) px karşılığı.
 */
export const WORLD_BOUNDS = {
  minX: 28,
  maxX: MAP_W - 28,
  minY: svgY(SIDE_STREET_SOUTH),     // Z +4.0  → dikey sokakların güney ağzı
  maxY: svgY(ZONE.backNorthWalkBot), // Z -17.4 → arka sokağın kuzey kaldırımı
};

/**
 * Where the player may walk — the asphalt road + narrow shop walkway.
 *
 * Map layout (3D engine → SVG coordinates):
 *   y   0..450  = buildings (north, off-screen above)
 *   y 450..510  = south sidewalk (vendor stalls)
 *   y 510..630  = MAIN ROAD (pedestrian promenade)
 *   y 630..690  = north sidewalk
 *   y 690..900  = north grass + buildings
 *
 * The character walks on the road + sidewalks.
 */
/**
 * Bir Z bandını yürünebilir dikdörtgene çevirir. `zSouth` bandın caddeye bakan
 * (büyük Z) kenarı, `zNorth` çim tarafındaki (küçük Z) kenarıdır — px katmanı
 * kuzeyde büyük y ile çizilir.
 */
function band(zSouth: number, zNorth: number): Rect {
  return { x: 0, y: svgY(zSouth), w: MAP_W, h: (zSouth - zNorth) * S };
}

/**
 * Dikey ara sokakların yürünebilir kolonları: her sokak, güney ağzından
 * (Z +4.0) arka sokağın kuzey kaldırımına (Z -17.4) kadar kesintisizdir —
 * yani dükkan bloklarının ARASINDAN geçip binaların arkasına ulaşır.
 */
export const SIDE_STREET_ZONES: Rect[] = SIDE_STREETS.map((x) => ({
  x: svgX(x - SIDE_STREET_W / 2),
  y: svgY(SIDE_STREET_SOUTH),
  w: SIDE_STREET_W * S,
  h: (SIDE_STREET_SOUTH - ZONE.backNorthWalkBot) * S,
}));

/**
 * Bir dünya dikdörtgenini (`westX`…`eastX` × `southZ`…`northZ`) px `Rect`e
 * çevirir. `band` yalnızca caddenin TAM genişliğini kaplar; cadı dükkânı yolu
 * gibi dar şeritler için bu yardımcı kullanılır.
 */
function span(westX: number, southZ: number, eastX: number, northZ: number): Rect {
  return {
    x: svgX(westX),
    y: svgY(southZ),
    w: (eastX - westX) * S,
    h: (southZ - northZ) * S,
  };
}

/**
 * CADI DÜKKÂNI GİRİŞ YOLU (bkz. `constants.WITCH_SHOP_WALKWAY`).
 *
 * Yol AŞAĞIDAKİ CADDEYE BAĞLANIR: asfaltın içinden başlar, güney ve kuzey
 * kaldırımı geçer, çimi aşar, kapının önünde genişleyip binanın İÇİNE girer.
 *
 * NEDEN DAR (0.8 birim): kuzey kaldırımı sokak mobilyasıyla (lamba/bank/
 * otobüs durağı/tabela) dolu ve hepsi KATI cisimdir; engeller A* ızgarasına
 * `PLAYER_RADIUS` kadar şişirilerek yakılır. Dükkânın önündeki lamba (−14) ile
 * yön tabelası (−12) arasında kalan temiz aralık 1.65 birimdir; şişirme
 * düşülünce karaktere kalan tam koridor bu 0.8 birimdir — yani yol, İKİ PROPA
 * DA DEĞMEDEN geçen tek güzergâhtır (karakter yarıçapı 0.4 birim).
 */
export const WITCH_SHOP_WALK_ZONES: Rect[] = [
  // 1) Caddeye bağlanan dar yol şeridi (asfalt → kaldırımlar → çim → avlu).
  span(
    WITCH_SHOP_WALKWAY.x - WITCH_SHOP_WALKWAY.pathHalfW,
    WITCH_SHOP_WALKWAY.pathSouthZ,
    WITCH_SHOP_WALKWAY.x + WITCH_SHOP_WALKWAY.pathHalfW,
    WITCH_SHOP_WALKWAY.pathNorthZ,
  ),
  // 2) Kapının önündeki avlu + binanın İÇİNE giren koridor.
  span(
    WITCH_SHOP_WALKWAY.x - WITCH_SHOP_WALKWAY.foreHalfW,
    WITCH_SHOP_WALKWAY.pathNorthZ,
    WITCH_SHOP_WALKWAY.x + WITCH_SHOP_WALKWAY.foreHalfW,
    WITCH_SHOP_WALKWAY.insideZ,
  ),
];

export const WALKABLE_ZONES: Rect[] = [
  band(ZONE.southSidewalkBot, ZONE.southSidewalkTop), // güney kaldırım (tezgâhlar)
  band(ZONE.roadBot, ZONE.roadTop), // ana cadde / yaya yolu
  band(ZONE.northSidewalkBot, ZONE.northSidewalkTop), // kuzey kaldırım
  // Arka sokak: kaldırım + asfalt + karşı kaldırım tek parça hâlinde.
  band(ZONE.backWalkTop, ZONE.backNorthWalkBot),
  ...SIDE_STREET_ZONES,
  // Cadı dükkânının kapı yolu (tek bina — diğerleri etkilenmez).
  ...WITCH_SHOP_WALK_ZONES,
];

export const PLAYER_SPEED = 80; // world units per second — natural walking pace
export const PLAYER_RADIUS = 20;

/**
 * Bir nokta yürünebilir caddede mi? (tezgâhların içi hariç)
 *
 * Yürünebilirlik MANTIKSAL alandır, görünen zemine göre değil: çitlerin
 * ÇİM tarafında kalan her yer yürünemez. Bu yüzden oyuncunun konumu her karede
 * bu testten geçmek zorundadır (bkz. `nearestWalkable`).
 */
export function inWalkable(x: number, y: number): boolean {
  return (
    WALKABLE_ZONES.some(
      (z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h,
    ) &&
    !OBSTACLES.some(
      (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
    )
  );
}

/**
 * Konumu YÜRÜNEBİLİR alana geri çeker — oyuncu çitin ilerisine geçemez.
 *
 * Neden gerekli: konumu değiştiren tek şey oyuncunun kendi girdisi değil.
 * Karakter AYRIŞTIRMA itmesi (botlar, satıcılar, diğer oyuncular) konumu
 * `PLAYER_RADIUS * 2.2` kadar yana taşır; bu itme eskiden yalnızca
 * `WORLD_BOUNDS`e kırpılıyordu. Yani bir bot oyuncuyu çitin ÖTESİNE, çime
 * itebiliyordu ve orada yürünebilir hiçbir komşu olmadığı için karakter
 * kilitlenip "takılıp kalıyordu".
 *
 * Çözüm: yürünebilir bölgelerin birleşimine EN YAKIN nokta bulunur (kenarlara
 * dik izdüşüm) ve oyuncu oraya alınır:
 *   · zaten geçerliyse konum AYNEN korunur (gereksiz oynama yok),
 *   · çitin ötesine taşmışsa en yakın cadde kenarına geri çekilir,
 *   · izdüşüm bir tezgâhın (engel) içine düşerse eski GEÇERLİ konum korunur.
 *
 * Böylece oyuncu çim üzerinde ASLA kalamaz ve sıkışamaz.
 */
export function nearestWalkable(
  x: number,
  y: number,
  /** İzdüşüm de geçersiz olursa dönülecek son geçerli konum. */
  fallback?: { x: number; y: number },
): { x: number; y: number } {
  if (inWalkable(x, y)) return { x, y };

  let best = Number.POSITIVE_INFINITY;
  let bx = x;
  let by = y;
  for (const z of WALKABLE_ZONES) {
    const cx = Math.min(Math.max(x, z.x), z.x + z.w);
    const cy = Math.min(Math.max(y, z.y), z.y + z.h);
    const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
    if (d < best) {
      best = d;
      bx = cx;
      by = cy;
    }
  }

  // İzdüşüm noktası geçerliyse (yani tezgâha denk gelmiyorsa) onu kullan.
  if (inWalkable(bx, by)) return { x: bx, y: by };

  // Aksi hâlde son geçerli konuma dön (yoksa izdüşümü kullan).
  if (fallback && inWalkable(fallback.x, fallback.y)) {
    return { x: fallback.x, y: fallback.y };
  }
  return { x: bx, y: by };
}

/** Axis-aligned rectangle in world coordinates. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Katı cisimler — karakterler (oyuncu, botlar, satıcılar, diğer oyuncular)
 * bunların İÇİNDEN GEÇEMEZ. Hem doğrudan hareket çarpışmasında (`circleHitsRect`)
 * hem `inWalkable`/`nearestWalkable` hem de A* yol bulmada (bkz. `pathfinding.ts`
 * — engeller `PLAYER_RADIUS` kadar şişirilip ızgaraya "yakılır") kullanılır.
 *
 * NEDEN ARTIK ADRESLER DE VAR: eskiden yalnızca 6 tezgâh engeldi. Bank, lamba,
 * otobüs durağı, çöp kutusu ve yön tabelası yürünebilir kaldırım şeridinin
 * İÇİNDE duruyordu — karakterler içlerinden geçiyor ve üstlerine çıkabiliyordu
 * (bkz. "DURAK 34" bankının üstünde duran oyuncu). Artık hepsi katı.
 *
 * Ayak izleri `engine/constants`teki yerleşimlerden + 3D prop ölçülerinden
 * türetilir; yerleşim değişirse kendiliğinden uyar.
 */
export const OBSTACLES: Rect[] = [
  // Tezgâh masaları (X 1.6 × Z 0.6 birim) — satıcıların arkasında durur.
  ...STALLS.map((s) => propRect(s.x, s.z, 1.6, 0.6)),
  // Sokak lambaları (ince direk + taban).
  ...LAMPS.map((l) => propRect(l.x, l.z, 0.34, 0.34)),
  // Çöp kutuları.
  ...TRASH_CANS.map((t) => propRect(t.x, t.z, 0.46, 0.46)),
  // Yön tabelaları (direk + plakalar).
  ...DIRECTION_SIGNS.map((d) => propRect(d.x, d.z, 0.36, 0.36)),
  // Park bankları (BENCH_WIDTH en × ~0.9 derinlik — çıtalar + ayaklar).
  ...BENCHES.map((b) => propRect(b.x, b.z, BENCH_WIDTH, 0.9)),
  // Otobüs durakları (çatı 1.8 × gövde 0.72 birim + saçak).
  ...BUS_STOPS.map((b) => propRect(b.x, b.z, 1.9, 0.95)),
];

/** Dünya merkezli (x,z) + dünya birimi (w,d) → piksel `Rect`. */
function propRect(x: number, z: number, w: number, d: number): Rect {
  const wPx = w * S;
  const dPx = d * S;
  return { x: svgX(x) - wPx / 2, y: svgY(z) - dPx / 2, w: wPx, h: dPx };
}

/**
 * Bir daire (karakter) katı cisimlerin içindeyse en yakın DIŞARI noktaya taşır.
 *
 * Neden gerekli: karakter konumu yalnızca kendi girdisiyle değişmez — ayrıştırma
 * itmesi (botlar, satıcılar, diğer oyuncular) onu bir prop'un içine sokabilir.
 * Bu fonksiyon en kısa eksen boyunca dışarı iter; `nearestWalkable` ile birlikte
 * kullanıldığında karakter ne prop içinde kalır ne de çime taşar.
 */
export function pushOutOfObstacles(x: number, y: number, radius: number): { x: number; y: number } {
  let px = x;
  let py = y;
  for (const r of OBSTACLES) {
    const cx = Math.min(Math.max(px, r.x), r.x + r.w);
    const cy = Math.min(Math.max(py, r.y), r.y + r.h);
    const dx = px - cx;
    const dy = py - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      px = cx + (dx / d) * radius;
      py = cy + (dy / d) * radius;
    } else {
      // Merkez dikdörtgenin İÇİNDE: en sığ kenardan dışarı it.
      const left = px - r.x;
      const right = r.x + r.w - px;
      const top = py - r.y;
      const bottom = r.y + r.h - py;
      const m = Math.min(left, right, top, bottom);
      if (m === left) px = r.x - radius;
      else if (m === right) px = r.x + r.w + radius;
      else if (m === top) py = r.y - radius;
      else py = r.y + r.h + radius;
    }
  }
  return { x: px, y: py };
}

/**
 * Bir konum, `radius` yarıçaplı bir karakterin gövdesiyle KATI cisimlerden
 * herhangi birine değiyor mu?
 *
 * `inWalkable` yalnızca NOKTA testi yapar (karakterin merkezi). Botların
 * yolları nokta nokta doğrulanırken bu yetersiz kalıyordu: merkez çizgisi bir
 * tezgâhın yanından "temiz" geçse bile gövdenin yarısı tezgâhın/ bankın
 * İÇİNDEN geçebiliyordu. Bu fonksiyon merkez testine gövde yarıçapını da katar.
 */
export function circleHitsObstacles(
  x: number,
  y: number,
  radius: number,
): boolean {
  const r2 = radius * radius;
  for (const r of OBSTACLES) {
    const cx = Math.min(Math.max(x, r.x), r.x + r.w);
    const cy = Math.min(Math.max(y, r.y), r.y + r.h);
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < r2) return true;
  }
  return false;
}
