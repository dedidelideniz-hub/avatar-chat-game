/**
 * 🛠️ ODA DÜZENLEME (BUILD MODE) — ızgara, mobilya kataloğu ve yerleştirme
 * matematiği. Saf (React'siz) ve TAMAMEN İSTEMCİ TARAFI: hiçbir yere
 * kaydedilmez, oda kapanınca biter (kalıcı değil — bilinçli).
 *
 * NEDEN AYRI DOSYA: ızgara/sınır matematiği `scripts/preview-ui.tsx` içinde
 * sahne kurmadan doğrulanabilsin (bkz. `oda-modeli` senaryosu).
 *
 * MOBİLYA NEDEN PROSEDÜREL: projede oda eşyası için GLB yok ve dışa bağımlı
 * varlık eklemek istemiyoruz; eşyalar basit prizmalarla (kutu) çizilir. Önemli
 * olan görsel zenginlik değil, DAVRANIŞ: 0,5 m ızgaraya oturmak ve duvar
 * sınırlarından dışarı çıkamamak.
 */
import { ROOM_ISO } from "./constants";

/** Odada dizilebilen bir eşya tanımı (istemci kataloğu). */
export interface FurnitureDef {
  id: string;
  /** Panelde görünen ad. */
  label: string;
  /** Panelde görünen simge. */
  emoji: string;
  /** Gövde ölçüleri (birim): genişlik · yükseklik · derinlik. */
  w: number;
  h: number;
  d: number;
  /** Gövde rengi. */
  color: string;
  /** Varsa üst vurgu rengi (minder/tezgâh). */
  accent?: string;
}

/**
 * EŞYA KATALOĞU — ofis/oda ölçeğinde (karakter 1,75 birim).
 *
 * Ölçüler gerçek mobilya oranlarında tutuldu; `h` aynı zamanda üst yüzün
 * yüksekliğidir ve çizim `h/2` merkezli kutudan yapılır.
 */
export const FURNITURE: readonly FurnitureDef[] = [
  { id: "desk", label: "Çalışma masası", emoji: "🪑", w: 1.4, h: 0.75, d: 0.7, color: "#a9713f", accent: "#c98d55" },
  { id: "chair", label: "Sandalye", emoji: "💺", w: 0.5, h: 0.9, d: 0.5, color: "#8a5a34", accent: "#b98a5c" },
  { id: "shelf", label: "Kitaplık", emoji: "📚", w: 1.2, h: 1.8, d: 0.35, color: "#7a5230", accent: "#a9713f" },
  { id: "sofa", label: "Koltuk", emoji: "🛋️", w: 1.6, h: 0.7, d: 0.8, color: "#8c4a3f", accent: "#d9c3a1" },
  { id: "table", label: "Sehpa", emoji: "🪵", w: 0.9, h: 0.45, d: 0.9, color: "#9c6b3d", accent: "#c98d55" },
  { id: "plant", label: "Saksı", emoji: "🪴", w: 0.45, h: 0.9, d: 0.45, color: "#8a5a34", accent: "#5faa38" },
  { id: "lamp", label: "Lamba", emoji: "💡", w: 0.35, h: 1.5, d: 0.35, color: "#4a3527", accent: "#ffe9a8" },
  { id: "rug", label: "Kilim", emoji: "🧶", w: 1.6, h: 0.04, d: 1.0, color: "#a8433a", accent: "#f0d9a8" },
];

/** Kimliğe göre eşya; bilinmeyen kimlik katalog başına düşer (çökme yok). */
export function furnitureById(id: string): FurnitureDef {
  return FURNITURE.find((f) => f.id === id) ?? FURNITURE[0];
}

/** Bir değeri ızgaraya yuvarlar (en yakın çizgi). */
export function snapToGrid(value: number, step: number = ROOM_ISO.grid): number {
  if (!(step > 0)) return value;
  return Math.round(value / step) * step;
}

/** Izgarada yukarı (merkezden uzağa doğru +) en yakın çizgi. */
export function snapUp(value: number, step: number = ROOM_ISO.grid): number {
  if (!(step > 0)) return value;
  return Math.ceil(value / step) * step;
}

/** Izgarada aşağı (merkeze doğru −) en yakın çizgi. */
export function snapDown(value: number, step: number = ROOM_ISO.grid): number {
  if (!(step > 0)) return value;
  return Math.floor(value / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Bir eksende, eşyanın sığdığı EN DIŞTAKİ ızgara çizgileri. */
function gridLimits(
  halfRoom: number,
  halfItem: number,
  step: number,
): { lo: number; hi: number; fallback: { lo: number; hi: number } } {
  const legalLo = -halfRoom + halfItem;
  const legalHi = halfRoom - halfItem;
  return {
    lo: snapUp(legalLo, step),
    hi: snapDown(legalHi, step),
    fallback: { lo: legalLo, hi: legalHi },
  };
}

/**
 * Eşyayı odanın zeminine oturtur: hem 0,5 m IZGARAYA yuvarlar hem de DUVAR
 * SINIRLARININ içinde tutar. İkisi çatışırsa SINIR kazanır — eşyanın duvarın
 * dışına taşmasındansa ızgaradan birkaç santim sapması yeğdir.
 *
 * `point`: odanın merkezine göre YEREL nokta (raycaster → `toRoomLocal`).
 * `def`: eşya tanımı — yarı genişliği/derinliği sınıra katılır.
 */
export function placeFurniture(
  point: { x: number; z: number },
  def: FurnitureDef,
  half: { x: number; z: number },
  margin: number = ROOM_ISO.wallMargin,
): { x: number; z: number } {
  const step = ROOM_ISO.grid;
  const halfItemX = def.w / 2 + margin;
  const halfItemZ = def.d / 2 + margin;

  const place = (value: number, halfRoom: number, halfItem: number) => {
    const limit = gridLimits(halfRoom, halfItem, step);
    const snapped = snapToGrid(value, step);
    // Oda eşyadan küçükse (limit aralığı ters döner) ızgara bırakılır: sınır
    // her koşulda korunur.
    if (limit.lo > limit.hi) return clamp(snapped, limit.fallback.lo, limit.fallback.hi);
    return clamp(snapped, limit.lo, limit.hi);
  };

  return {
    x: place(point.x, half.x, halfItemX),
    z: place(point.z, half.z, halfItemZ),
  };
}
