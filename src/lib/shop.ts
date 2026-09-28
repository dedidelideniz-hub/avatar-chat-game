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
  ZONE,
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

export const WALKABLE_ZONES: Rect[] = [
  band(ZONE.southSidewalkBot, ZONE.southSidewalkTop), // güney kaldırım (tezgâhlar)
  band(ZONE.roadBot, ZONE.roadTop), // ana cadde / yaya yolu
  band(ZONE.northSidewalkBot, ZONE.northSidewalkTop), // kuzey kaldırım
  // Arka sokak: kaldırım + asfalt + karşı kaldırım tek parça hâlinde.
  band(ZONE.backWalkTop, ZONE.backNorthWalkBot),
  ...SIDE_STREET_ZONES,
];

export const PLAYER_SPEED = 80; // world units per second — natural walking pace
export const PLAYER_RADIUS = 20;

/** Axis-aligned rectangle in world coordinates. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Solid objects the player cannot walk through (stalls).
 * Positions converted from 3D engine layout.
 */
/** Tezgâh ayak izi (X 1.6 × Z 0.6 birim). */
const STALL_W_PX = 1.6 * S;
const STALL_D_PX = 0.6 * S;

// Vendor stall tables — tezgâh sayısı/konumu değişirse kendiliğinden uyar.
export const OBSTACLES: Rect[] = STALLS.map((stall) => ({
  x: svgX(stall.x) - STALL_W_PX / 2,
  y: svgY(stall.z) - STALL_D_PX / 2,
  w: STALL_W_PX,
  h: STALL_D_PX,
}));
