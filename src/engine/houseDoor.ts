/**
 * 🏠 EV KAPISI — menzil deposu ve eylem etiketi.
 *
 * Evler artık yürünerek girilen hacimler DEĞİL: bina katıdır ve oyuncu ancak
 * önündeki kaldırıma kadar yaklaşır (bkz. `constants.HOUSE_TRIGGER`). Eve giriş,
 * kapının önünde beliren üç boyutlu düğmeyle olur. Bu dosya, o düğmenin
 * ihtiyaç duyduğu iki şeyi tutar:
 *
 *   1) `benchSeat.ts` ile aynı desendeki KÜÇÜK DEPO — oyun döngüsü (px katmanı)
 *      menzildeki arsayı her karede yazar, 3D katman (`GameEngine3D`) okur.
 *      Böylece React ağacına kare başına prop geçmez.
 *   2) SAF etiket hesabı (`houseDoorAction`): düğmenin ne yazacağı yalnızca
 *      arsanın sahipliğine bağlıdır ve React'siz test edilebilir.
 *
 * Yazma/okuma yönü: World.tsx → `setHouseNear` · GameEngine3D → `getHouseNear`,
 * `requestHouseEnter` · World.tsx → `consumeHouseEnterRequest`.
 */

/** Bir evin 3D katmana ve arayüze giden özeti (Convex `houses.list`ten gelir). */
export interface HouseView {
  /** Evin kurulu olduğu arsa = `constants.BUILDINGS` gözü. */
  plotIndex: number;
  /** Ev sahibinin oyuncu adı (kapı levhasında yazar). */
  ownerName: string;
  /** Evin adı — sahibi değiştirebilir. */
  name: string;
  /** Toplam ziyaret sayısı. */
  visits: number;
  /** Son ziyaretçiler (en yeni başta). */
  visitors: string[];
  /** Bu ev yerel oyuncunun mu? (Sunucu kullanıcı kimliğine göre işaretler.) */
  isMine: boolean;
}

/** Düğmenin üç hâli — dördüncüsü "hiç gösterme" (`null`). */
export type HouseActionKind = "mine" | "free" | "other";

export interface HouseAction {
  kind: HouseActionKind;
  emoji: string;
  label: string;
  /** Düğmenin altındaki küçük açıklama (3D katman kullanır). */
  hint: string;
}

/**
 * Bir arsanın kapısında hangi düğme görünür?
 *
 *   · arsa BENİM      → "🏠 Evine gir"      (kendi evim)
 *   · arsa başkasının → "🚪 Ziyaret et"     (online: herkes herkesin evine girer)
 *   · arsa BOŞ + evim yok → "🏠 Evini kur"  (ilk evini buraya kurarsın)
 *   · arsa BOŞ + evim var → `null`          (boş arsalarda düğme çıkmaz: oyuncu
 *                                            zaten bir arsaya sahip; cadde
 *                                            boyunca gereksiz düğme yağmuru olmaz)
 */
export function houseDoorAction(
  plotIndex: number,
  houses: readonly HouseView[],
): HouseAction | null {
  const here = houses.find((h) => h.plotIndex === plotIndex);
  if (here?.isMine) {
    return { kind: "mine", emoji: "🏠", label: "Evine gir", hint: here.name };
  }
  if (here) {
    return {
      kind: "other",
      emoji: "🚪",
      label: "Ziyaret et",
      hint: here.name,
    };
  }
  if (houses.some((h) => h.isMine)) return null;
  return {
    kind: "free",
    emoji: "🏠",
    label: "Evini kur",
    hint: "Boş arsa",
  };
}

/** Yerel oyuncunun evi (yoksa `null`) — arayüz ve 3D katman bunu kullanır. */
export function myHouse(houses: readonly HouseView[]): HouseView | null {
  return houses.find((h) => h.isMine) ?? null;
}

/** Belirli bir arsadaki ev (yoksa `null`). */
export function houseAt(
  plotIndex: number,
  houses: readonly HouseView[],
): HouseView | null {
  return houses.find((h) => h.plotIndex === plotIndex) ?? null;
}

/* ─────────────────────────── MENZİL DEPOSU ─────────────────────────── */

let near: number | null = null;
let enterRequested = false;

/** Oyun döngüsü her değişimde çağırır: oyuncunun menzilindeki arsa. */
export function setHouseNear(plotIndex: number | null): void {
  near = plotIndex;
}

/** Menzildeki arsa (3D düğme bunu kullanır; yoksa `null`). */
export function getHouseNear(): number | null {
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
