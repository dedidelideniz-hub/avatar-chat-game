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
export const VIP_PRICE = 1500; // Sanalika Parası
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
  price: number; // in Sanalika Parası
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

export const VENDORS: Vendor[] = [
  {
    id: "dondurma",
    name: "Emre'nin Dondurma Tezgâhı",
    short: "Dondurma",
    emoji: "🍦",
    color: "#ff8fb3",
    accent: "#ffffff",
    x: 250,
    y: 495,
  },
  {
    id: "balon",
    name: "Zeynep'in Balon Standı",
    short: "Balonlar",
    emoji: "🎈",
    color: "#14b8a6",
    accent: "#ffffff",
    x: 500,
    y: 495,
  },
  {
    id: "oyuncak",
    name: "Oyuncakçı Dede",
    short: "Oyuncakçı",
    emoji: "🧸",
    color: "#f59e0b",
    accent: "#ffd166",
    x: 750,
    y: 495,
  },
  {
    id: "moda",
    name: "Selin'in Moda Standı",
    short: "Moda",
    emoji: "🕶️",
    color: "#a855f7",
    accent: "#ffd166",
    x: 1000,
    y: 495,
  },
  {
    id: "silahci",
    name: "Kemal'in Silah Dükkanı",
    short: "Silahçı",
    emoji: "⚔️",
    color: "#b91c1c",
    accent: "#fbbf24",
    x: 1250,
    y: 495,
  },
  {
    id: VIP_VENDOR_ID,
    name: "Kraliyet VIP Köşesi",
    short: "VIP Üyelik",
    emoji: "👑",
    color: "#f59e0b",
    accent: "#ffd166",
    x: 1500,
    y: 495,
  },
];

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
    description: "Stilize düşük poligon samuray — idle/walk/run/jump animasyonları dahil.",
    vendorId: "moda",
    slot: "chest",
    skinUrl: "/models/skin-samuray.glb",
  },
  {
    id: "skin-sevalye",
    name: "Şövalye Karakter",
    emoji: "🛡️",
    price: 1500,
    description: "Detaylı şövalye zırhlı karakter — idle/walk animasyonları dahil.",
    vendorId: "moda",
    slot: "chest",
    skinUrl: "/models/skin-samuray.glb",
  },
  {
    id: "skin-savasci-glb",
    name: "Kraliyet Savaşçısı",
    emoji: "⚔️",
    price: 1350,
    description: "Tam gövdeli, ayakları görünür savaşçı karakter — animasyonlu GLB skin.",
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

/** Daily gift box position + reach radius (world coordinates). */
export const GIFT_BOX = {
  x: 800,
  y: 570,
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

/** World bounds the player can walk in. */
export const WORLD_BOUNDS = {
  minX: 28,
  maxX: 1572,
  minY: 450,
  maxY: 690,
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
export const WALKABLE_ZONES: Rect[] = [
  // South sidewalk (vendor stalls zone, y=450..510)
  { x: 0, y: 450, w: 1600, h: 60 },
  // Main pedestrian road (y=510..630)
  { x: 0, y: 510, w: 1600, h: 120 },
  // North sidewalk (y=630..690)
  { x: 0, y: 630, w: 1600, h: 60 },
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
export const OBSTACLES: Rect[] = [
  // Vendor stall tables (south sidewalk, matching 3D stall positions)
  { x: 210, y: 465, w: 80, h: 30 },
  { x: 460, y: 465, w: 80, h: 30 },
  { x: 710, y: 465, w: 80, h: 30 },
  { x: 960, y: 465, w: 80, h: 30 },
  { x: 1210, y: 465, w: 80, h: 30 },
  { x: 1460, y: 465, w: 80, h: 30 }, // Silahçı stall
];
