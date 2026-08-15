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

export function formatCoins(amount: number): string {
  return amount.toLocaleString("tr-TR");
}

export interface Product {
  id: string;
  name: string;
  emoji: string;
  price: number; // in Sanalika Parası
  description: string;
  vendorId: string;
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

/** Where the player can stand to interact with a stall. */
export const VENDOR_INTERACT_X = 735;
export const VENDOR_INTERACT_RADIUS = 150;

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
  },
  {
    id: "dondurma-cikolata",
    name: "Çikolatalı Dondurma",
    emoji: "🍫",
    price: 40,
    description: "Bol çikolata soslu, kaçamaklı bir tat.",
    vendorId: "dondurma",
  },
  {
    id: "dondurma-mix",
    name: "Karışık Külah",
    emoji: "🍨",
    price: 55,
    description: "Üç top, üç lezzet — hangisini seçeceksin?",
    vendorId: "dondurma",
  },
  // Balon standı
  {
    id: "balon-kirmizi",
    name: "Kırmızı Balon",
    emoji: "🎈",
    price: 60,
    description: "En klasik, en parlak balon.",
    vendorId: "balon",
  },
  {
    id: "balon-gokkusagi",
    name: "Gökkuşağı Balonu",
    emoji: "🌈",
    price: 90,
    description: "Rengârenk, rüzgârda dans eder.",
    vendorId: "balon",
  },
  {
    id: "balon-yildiz",
    name: "Yıldız Balon",
    emoji: "⭐",
    price: 120,
    description: "Akşam oldu mu bile ışıl ışıl parlar.",
    vendorId: "balon",
  },
  // Oyuncakçı
  {
    id: "oyuncak-ayi",
    name: "Oyuncak Ayı",
    emoji: "🧸",
    price: 150,
    description: "Yumuşacık, sarılmaya her an hazır.",
    vendorId: "oyuncak",
  },
  {
    id: "oyuncak-araba",
    name: "Minik Araba",
    emoji: "🚗",
    price: 110,
    description: "Vınn! Caddede hız rekoru kırmaya hazır.",
    vendorId: "oyuncak",
  },
  {
    id: "oyuncak-top",
    name: "Zıpzıp Top",
    emoji: "⚽",
    price: 70,
    description: "Kaldırımda zıplat, eğlenceyi yakala.",
    vendorId: "oyuncak",
  },
  // Moda standı
  {
    id: "moda-gozluk",
    name: "Güneş Gözlüğü",
    emoji: "🕶️",
    price: 180,
    description: "Caddede şıklığın tamamlayıcısı.",
    vendorId: "moda",
  },
  {
    id: "moda-sapka",
    name: "Hasır Şapka",
    emoji: "👒",
    price: 140,
    description: "Güneşten korur, havalı durur.",
    vendorId: "moda",
  },
  {
    id: "moda-atki",
    name: "Renkli Atkı",
    emoji: "🧣",
    price: 100,
    description: "Serin akşam yürüyüşlerine merhaba.",
    vendorId: "moda",
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

/** World bounds the player can walk in. */
export const WORLD_BOUNDS = {
  minX: 28,
  maxX: 1572,
  minY: 505,
  maxY: 878,
};

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
