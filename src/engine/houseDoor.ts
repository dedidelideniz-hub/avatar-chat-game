/**
 * 🏠 EV KAPISI — menzil deposu, giriş isteği ve odanın özet tipi.
 *
 * Ev, YÜRÜNEREK GİRİLEN bir hacim DEĞİLDİR: bina katıdır (bkz.
 * `constants.HOUSE_TRIGGER` + `lib/shop.ts` → yürünebilir bölgeler). Oyuncu
 * kapının önüne gelir; kapıda beliren "Evine gir" düğmesine basar; oyun kısa
 * bir yükleme ekranı gösterir ve oyuncunun KENDİ odası açılır
 * (`components/world/HouseRoom.tsx`).
 *
 * Oda her oyuncuya özeldir ve sunucuda tutulur (`convex/houses.ts`): ilk
 * girişte OTOMATİK oluşur — arsa seçme/kurulum yoktur. Adı, giriş sayısı ve
 * ziyaretçi defteri oyuncuya aittir. Kapı ise caddede TEK tanedir; herkes aynı
 * kapıyı kullanır.
 *
 * Bu dosya, `benchSeat.ts` ile aynı desendeki KÜÇÜK DEPOYU tutar: oyun döngüsü
 * (px katmanı) menzil durumunu yazar, 3D katman (`GameEngine3D`) okur ve
 * düğme yalnızca bir istek bırakır; isteği oyun döngüsü tüketir. Böylece React
 * ağacına kare başına prop geçmez ve kapı kararı tek yerde kalır.
 */

/** Kapıda beliren düğmenin yazısı (tek hâl: kapı hep aynı). */
export const HOUSE_ENTER_LABEL = { emoji: "🏠", label: "Evine gir" } as const;

/** Odanın arayüze giden özeti (`convex/houses.ts` → `enter`/`visit` döner). */
export interface HouseView {
  /** Odanın sahibinin görünen adı. */
  ownerName: string;
  /** Odanın adı — sahibi değiştirebilir. */
  name: string;
  /** Odaya giriş sayısı (sahip + ziyaretçiler). */
  visits: number;
  /** Son ziyaretçiler (en yeni başta). */
  visitors: string[];
  /** Bu oda yerel oyuncunun mu? (Sunucu kimliğe göre işaretler.) */
  isMine: boolean;
}

/* ─────────────────────────── MENZİL DEPOSU ─────────────────────────── */

let near = false;
let enterRequested = false;

/** Oyun döngüsü her değişimde çağırır: oyuncu evin kapı menzilinde mi? */
export function setHouseNear(isNear: boolean): void {
  near = isNear;
}

/** Kapı menzilinde miyiz? (3D düğme bunu kullanır.) */
export function getHouseNear(): boolean {
  return near;
}

/** 3D düğmeden gelen "evine gir" isteği (px katmanı bir sonraki karede tüketir). */
export function requestHouseEnter(): void {
  enterRequested = true;
}

/** İstek varsa `true` döner ve isteği temizler. */
export function consumeHouseEnterRequest(): boolean {
  if (!enterRequested) return false;
  enterRequested = false;
  return true;
}
