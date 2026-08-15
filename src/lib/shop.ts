/**
 * Sanalika Avatar Chat — street economy.
 * Shared between the Convex backend (buyItem / claimDailyBonus) and the World
 * page, so prices and stock are defined in exactly one place. Keep this file
 * dependency-free (no React imports).
 */

export const CURRENCY_NAME = "Sanalika Parası";
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

export function bubbleColorOf(id: string): BubbleColor {
  return BUBBLE_COLORS.find((c) => c.id === id) ?? BUBBLE_COLORS[0];
}

/** VIP membership — unlocks every speech-bubble color at the VIP stand. */
export const VIP_VENDOR_ID = "vip";
export const VIP_PRICE = 1500; // Sanalika Parası
export const VIP_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün
export const VIP_DURATION_DAYS = 30;

export function formatCoins(amount: number): string {
  return amount.toLocaleString("tr-TR");
}

export type WearSlot = "head" | "face" | "neck" | "hand";

/** How many items can be worn at once in each slot. */
export const WEAR_SLOT_CAPACITY: Record<WearSlot, number> = {
  head: 1,
  face: 1,
  neck: 1,
  hand: 2, // both hands
};

export const WEAR_SLOT_LABELS: Record<WearSlot, string> = {
  head: "Baş",
  face: "Yüz",
  neck: "Boyun",
  hand: "El",
};

export interface Product {
  id: string;
  name: string;
  emoji: string;
  price: number; // in Sanalika Parası
  description: string;
  vendorId: string;
  /** Body slot where the item is shown while equipped. */
  slot: WearSlot;
  /** Emoji used on the avatar when equipped (defaults to `emoji`). */
  wearEmoji?: string;
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

export const VENDORS: Vendor[] = [
  {
    id: "dondurma",
    name: "Emre'nin Dondurma Tezgâhı",
    short: "Dondurma",
    emoji: "🍦",
    color: "#ff8fb3",
    accent: "#ffffff",
    x: 280,
    y: 745,
  },
  {
    id: "balon",
    name: "Zeynep'in Balon Standı",
    short: "Balonlar",
    emoji: "🎈",
    color: "#14b8a6",
    accent: "#ffffff",
    x: 620,
    y: 745,
  },
  {
    id: "oyuncak",
    name: "Oyuncakçı Dede",
    short: "Oyuncakçı",
    emoji: "🧸",
    color: "#f59e0b",
    accent: "#ffd166",
    x: 980,
    y: 745,
  },
  {
    id: "moda",
    name: "Selin'in Moda Standı",
    short: "Moda",
    emoji: "🕶️",
    color: "#a855f7",
    accent: "#ffd166",
    x: 1340,
    y: 745,
  },
  {
    id: VIP_VENDOR_ID,
    name: "Kraliyet VIP Köşesi",
    short: "VIP Üyelik",
    emoji: "👑",
    color: "#f59e0b",
    accent: "#ffd166",
    x: 820,
    y: 745,
  },
];

export const PRODUCTS: Product[] = [
  // Dondurma tezgâhı
  {
    id: "dondurma-cilek",
    name: "Çilekli Dondurma",
    emoji: "🍓",
    price: 40,
    description: "Taze çilekli, külah dolusu yaz klasiği.",
    vendorId: "dondurma",
    slot: "hand",
    wearEmoji: "🍦",
  },
  {
    id: "dondurma-cikolata",
    name: "Çikolatalı Dondurma",
    emoji: "🍫",
    price: 40,
    description: "Bol çikolata soslu, kaçamaklı bir tat.",
    vendorId: "dondurma",
    slot: "hand",
    wearEmoji: "🍦",
  },
  {
    id: "dondurma-mix",
    name: "Karışık Külah",
    emoji: "🍨",
    price: 55,
    description: "Üç top, üç lezzet — hangisini seçeceksin?",
    vendorId: "dondurma",
    slot: "hand",
    wearEmoji: "🍨",
  },
  // Balon standı
  {
    id: "balon-kirmizi",
    name: "Kırmızı Balon",
    emoji: "🎈",
    price: 60,
    description: "En klasik, en parlak balon.",
    vendorId: "balon",
    slot: "hand",
  },
  {
    id: "balon-gokkusagi",
    name: "Gökkuşağı Balonu",
    emoji: "🌈",
    price: 90,
    description: "Rengârenk, rüzgârda dans eder.",
    vendorId: "balon",
    slot: "hand",
  },
  {
    id: "balon-yildiz",
    name: "Yıldız Balon",
    emoji: "⭐",
    price: 120,
    description: "Akşam oldu mu bile ışıl ışıl parlar.",
    vendorId: "balon",
    slot: "hand",
  },
  // Oyuncakçı
  {
    id: "oyuncak-ayi",
    name: "Oyuncak Ayı",
    emoji: "🧸",
    price: 150,
    description: "Yumuşacık, sarılmaya her an hazır.",
    vendorId: "oyuncak",
    slot: "hand",
  },
  {
    id: "oyuncak-araba",
    name: "Minik Araba",
    emoji: "🚗",
    price: 110,
    description: "Vınn! Caddede hız rekoru kırmaya hazır.",
    vendorId: "oyuncak",
    slot: "hand",
  },
  {
    id: "oyuncak-top",
    name: "Zıpzıp Top",
    emoji: "⚽",
    price: 70,
    description: "Kaldırımda zıplat, eğlenceyi yakala.",
    vendorId: "oyuncak",
    slot: "hand",
  },
  // Moda standı
  {
    id: "moda-gozluk",
    name: "Güneş Gözlüğü",
    emoji: "🕶️",
    price: 180,
    description: "Caddede şıklığın tamamlayıcısı.",
    vendorId: "moda",
    slot: "face",
  },
  {
    id: "moda-sapka",
    name: "Hasır Şapka",
    emoji: "👒",
    price: 140,
    description: "Güneşten korur, havalı durur.",
    vendorId: "moda",
    slot: "head",
  },
  {
    id: "moda-atki",
    name: "Renkli Atkı",
    emoji: "🧣",
    price: 100,
    description: "Serin akşam yürüyüşlerine merhaba.",
    vendorId: "moda",
    slot: "neck",
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

/** Daily gift box position + reach radius (world coordinates). */
export const GIFT_BOX = {
  x: 800,
  y: 852,
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
 */
const VENDOR_CLICK_BOX = { halfW: 34, top: -124, bottom: -48 };

/** The vendor whose character contains this point, if any. */
export function vendorAtPoint(x: number, y: number): Vendor | undefined {
  return VENDORS.find(
    (v) =>
      x >= v.x - VENDOR_CLICK_BOX.halfW &&
      x <= v.x + VENDOR_CLICK_BOX.halfW &&
      y >= v.y + VENDOR_CLICK_BOX.top &&
      y <= v.y + VENDOR_CLICK_BOX.bottom,
  );
}

/** World bounds the player can walk in. */
export const WORLD_BOUNDS = {
  minX: 28,
  maxX: 1572,
  minY: 505,
  maxY: 878,
};

/**
 * Where the player may walk — the street corridor (road + shop walkway).
 * Everything outside these zones (buildings, park, top sidewalk, grass edges)
 * is blocked, so the character stays on the streets.
 */
export const WALKABLE_ZONES: Rect[] = [
  { x: 28, y: 578, w: 1544, h: 274 }, // y 578..852 (road through the shops)
];

export const PLAYER_SPEED = 265; // world units per second
export const PLAYER_RADIUS = 20;

/** Axis-aligned rectangle in world coordinates. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Solid objects the player cannot walk through (stalls, trees, lamps).
 * Must match the drawings in StreetScene.
 */
export const OBSTACLES: Rect[] = [
  // vendor stalls (counter front)
  { x: 200, y: 655, w: 160, h: 105 },
  { x: 540, y: 655, w: 160, h: 105 },
  { x: 740, y: 655, w: 160, h: 105 },
  { x: 900, y: 655, w: 160, h: 105 },
  { x: 1260, y: 655, w: 160, h: 105 },
  // top sidewalk trees (x 200 / 820 / 1420)
  { x: 182, y: 478, w: 36, h: 62 },
  { x: 802, y: 478, w: 36, h: 62 },
  { x: 1402, y: 478, w: 36, h: 62 },
  // bottom sidewalk trees (x 120 / 1500)
  { x: 104, y: 828, w: 32, h: 52 },
  { x: 1484, y: 828, w: 32, h: 52 },
  // street lamps (x 480 / 1120)
  { x: 468, y: 480, w: 24, h: 62 },
  { x: 1108, y: 480, w: 24, h: 62 },
];
