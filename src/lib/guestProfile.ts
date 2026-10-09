/**
 * 🎭 YEREL KONUK PROFİLİ (mock) — Auth/Convex ZORUNLU OLMASIN (fail-safe).
 *
 * Ne zaman kullanılır:
 *   · `vaelos:forceGuest=1` yazılmışsa (hata kutusundaki "Çevrimdışı /
 *     Misafir Olarak Başlat" düğmesi ya da "Misafir başlat" katmanı),
 *   · veya kimlik akışı `GATE_AUTH_STEP_MS` içinde çözülmediyse/hata
 *     attıysa (`World` kapısındaki hard bypass).
 *
 * Sunucu ÇAĞRILMAZ: profil alanları `World`ün beklediği şekliyle yerelde
 * tutulur. "Kimlik doğrulanıyor" adımı PAS GEÇİLİR ve yükleme doğrudan
 * "Cadde verileri alınıyor" (adım 1) ile devam eder — sunucu yoksa bile
 * oyuncu caddeye girer, oyun oynanır, çökme olmaz.
 */
import { safeGetItem, safeRemoveItem } from "@/lib/safeStorage";
import { DEFAULT_ABILITY, DEFAULT_BUBBLE_COLOR } from "@/lib/shop";
import { DEFAULT_AVATAR } from "@/lib/avatar";

/** Misafir asıl düzenlenebilir profil kaydının şekli (World alan adlarıyla aynı). */
export interface GuestProfile {
  username: string;
  avatar: typeof DEFAULT_AVATAR;
  equipped: string[];
  items: string[];
  abilities: string[];
  equippedAbility: string;
  coins: number;
  vip: boolean;
  vipUntil: number;
  battleWins: number;
  level: number;
  bubbleColor: string;
  banned: boolean;
  houseLost: boolean;
}

/** "Misafir başlat" bayrağı (`LoadingFailSafe.startAsGuestOffline` yazar). */
export function isGuestMode(): boolean {
  try {
    return safeGetItem("vaelos:forceGuest") === "1";
  } catch {
    return false;
  }
}

/** Misafir-çevrimdışı modu kapat (ör. gerçek oturum yeniden açılınca). */
export function exitGuestMode(): void {
  safeRemoveItem("vaelos:forceGuest");
}

/** `World`ün alan adlarıyla BİREBİR uyumlu yerel mock profil. */
export function guestProfile(): GuestProfile {
  return {
    username: "Guest_Mobile",
    avatar: DEFAULT_AVATAR,
    equipped: [],
    items: [],
    abilities: [DEFAULT_ABILITY],
    equippedAbility: DEFAULT_ABILITY,
    coins: 0,
    vip: false,
    vipUntil: 0,
    battleWins: 0,
    level: 1,
    bubbleColor: DEFAULT_BUBBLE_COLOR,
    banned: false,
    houseLost: false,
  };
}
