/**
 * 🛠️ ODA DÜZENLEME (BUILD MODE) — ızgara, mobilya kataloğu ve yerleştirme
 * matematiği. Saf (React'siz) ve maliyetsiz: ızgara/sınır hesabı burada,
 * KALICILIK ise sunucuda (`convex/furniture.ts`).
 *
 * NEDEN AYRI DOSYA: ızgara/sınır matematiği `scripts/preview-ui.tsx` içinde
 * sahne kurmadan doğrulanabilsin (bkz. `oda-modeli` senaryosu).
 *
 * EKONOMİ (neden fiyat burada): oyuncu eşyaları CADDEDEKİ STANTTAN Vaelos
 * Parası (SP) ile alır ve SAHİP OLDUĞU eşyaları evine dizer. Katalog bu yüzden
 * fiyatı da taşır; fiyatın SUNUCU tarafı kopyası (`convex/furniture.ts` →
 * `FURNITURE_PRICES`) tek doğruluk kaynağıdır — istemci fiyat göndermez,
 * yalnızca \"şu eşyayı al\" der. İki liste `scripts/preview-ui.tsx` içinde
 * karşılaştırılır (kimlik VE fiyat birebir aynı olmalı).
 *
 * SAHİPLİK & KONUM: sunucudaki her satır BİR ADET eşyadır. Konum, odanın YARIM
 * AÇIKLIĞINA GÖRE ORANSAL tutulur (`fx`/`fz`: -1…1): oda modeli değişse/başka
 * GLB yüklense bile eşyalar duvarların içinde kalır. Metreye çevirme işi tek
 * yerdedir (`placedFurniture` → `placeFurniture`: ızgara + duvar sınırı).
 *
 * MOBİLYA NEDEN PROSEDÜREL: oda eşyası için henüz GLB yok; eşyalar basit
 * prizmalarla (kutu) çizilir. GLB yüklendiğinde `FurnitureDef.modelUrl`
 * doldurulur ve çizim kutudan modele döner (`RoomStage` → `FurniturePiece`);
 * ölçüler (`w/h/d`) hem kutu hem model için aynı sınır/ızgara hesabını besler.
 */
import { ROOM_ISO } from "./constants";

/** Stanttaki eşya grupları (panelde sekmelenir). */
export type FurnitureCategory = "oturma" | "yatak" | "mutfak" | "eğlence" | "dekor";

export const FURNITURE_CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  oturma: "Oturma",
  yatak: "Yatak Odası",
  mutfak: "Mutfak",
  eğlence: "Eğlence",
  dekor: "Dekor",
};

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
  /** Stanttaki fiyat (Vaelos Parası). 0 → başlangıç takımı (hediye). */
  price: number;
  /** Stanttaki grubu. */
  category: FurnitureCategory;
  /**
   * GLB modeli (oyuncu yüklediğinde doldurulur). Doluysa kutu yerine model
   * çizilir; boşken eşya prizmayla temsil edilir.
   */
  modelUrl?: string;
}

/**
 * EŞYA KATALOĞU — ofis/oda ölçeğinde (karakter 1,75 birim).
 *
 * Ölçüler gerçek mobilya oranlarında tutuldu; `h` aynı zamanda üst yüzün
 * yüksekliğidir ve çizim `h/2` merkezli kutudan yapılır.
 */
export const FURNITURE: readonly FurnitureDef[] = [
  // ── Oturma ────────────────────────────────────────────────────────────
  { id: "sofa", label: "Koltuk", emoji: "🛋️", w: 1.6, h: 0.7, d: 0.8, color: "#8c4a3f", accent: "#d9c3a1", price: 540, category: "oturma" },
  { id: "chair", label: "Sandalye", emoji: "💺", w: 0.5, h: 0.9, d: 0.5, color: "#8a5a34", accent: "#b98a5c", price: 180, category: "oturma" },
  { id: "table", label: "Sehpa", emoji: "🪵", w: 0.9, h: 0.45, d: 0.9, color: "#9c6b3d", accent: "#c98d55", price: 260, category: "oturma" },
  { id: "desk", label: "Çalışma masası", emoji: "🪑", w: 1.4, h: 0.75, d: 0.7, color: "#a9713f", accent: "#c98d55", price: 320, category: "oturma" },
  { id: "shelf", label: "Kitaplık", emoji: "📚", w: 1.2, h: 1.8, d: 0.35, color: "#7a5230", accent: "#a9713f", price: 380, category: "oturma" },
  // ── Yatak Odası ───────────────────────────────────────────────────────
  { id: "bed", label: "Yatak", emoji: "🛏️", w: 2.0, h: 0.55, d: 1.4, color: "#b98a5c", accent: "#f4efe4", price: 780, category: "yatak" },
  { id: "wardrobe", label: "Gardırop", emoji: "🚪", w: 1.4, h: 2.0, d: 0.6, color: "#7a5230", accent: "#a9713f", price: 690, category: "yatak" },
  { id: "mirror", label: "Ayna", emoji: "🪞", w: 0.8, h: 1.6, d: 0.1, color: "#b0bec5", accent: "#eceff1", price: 300, category: "yatak" },
  // ── Mutfak ────────────────────────────────────────────────────────────
  { id: "fridge", label: "Buzdolabı", emoji: "🧊", w: 0.7, h: 1.7, d: 0.7, color: "#cfd8dc", accent: "#90a4ae", price: 820, category: "mutfak" },
  { id: "counter", label: "Mutfak tezgâhı", emoji: "🍳", w: 1.8, h: 0.9, d: 0.6, color: "#c98d55", accent: "#5f6b6d", price: 600, category: "mutfak" },
  { id: "stool", label: "Tabure", emoji: "🪑", w: 0.45, h: 0.65, d: 0.45, color: "#8a5a34", accent: "#c98d55", price: 140, category: "mutfak" },
  // ── Eğlence ───────────────────────────────────────────────────────────
  { id: "tv", label: "Televizyon", emoji: "📺", w: 1.3, h: 0.8, d: 0.15, color: "#2b2320", accent: "#6b7f8a", price: 640, category: "eğlence" },
  { id: "jukebox", label: "Müzik kutusu", emoji: "🎵", w: 1.0, h: 1.4, d: 0.5, color: "#7b3f2e", accent: "#f0c987", price: 980, category: "eğlence" },
  { id: "pool", label: "Bilardo masası", emoji: "🎱", w: 2.0, h: 0.8, d: 1.1, color: "#1f6b4a", accent: "#c98d55", price: 1200, category: "eğlence" },
  { id: "piano", label: "Piyano", emoji: "🎹", w: 1.6, h: 1.0, d: 0.7, color: "#2b2320", accent: "#f4efe4", price: 1600, category: "eğlence" },
  { id: "aquarium", label: "Akvaryum", emoji: "🐠", w: 1.1, h: 0.7, d: 0.5, color: "#2c6d8a", accent: "#7fd6f0", price: 560, category: "eğlence" },
  // ── Dekor ─────────────────────────────────────────────────────────────
  { id: "rug", label: "Kilim", emoji: "🧶", w: 1.6, h: 0.04, d: 1.0, color: "#a8433a", accent: "#f0d9a8", price: 120, category: "dekor" },
  { id: "lamp", label: "Lamba", emoji: "💡", w: 0.35, h: 1.5, d: 0.35, color: "#4a3527", accent: "#ffe9a8", price: 160, category: "dekor" },
  { id: "plant", label: "Saksı", emoji: "🪴", w: 0.45, h: 0.9, d: 0.45, color: "#8a5a34", accent: "#5faa38", price: 90, category: "dekor" },
  { id: "clock", label: "Duvar saati", emoji: "🕰️", w: 0.6, h: 0.6, d: 0.12, color: "#6b4a2f", accent: "#f4efe4", price: 260, category: "dekor" },
  { id: "fireplace", label: "Şömine", emoji: "🔥", w: 1.4, h: 1.3, d: 0.5, color: "#8a5a34", accent: "#ff9d4d", price: 1400, category: "dekor" },
  { id: "statue", label: "Altın heykel", emoji: "🗿", w: 0.5, h: 1.8, d: 0.5, color: "#d4af37", accent: "#f7e08a", price: 2400, category: "dekor" },
];

/** Kimliğe göre eşya; bilinmeyen kimlik katalog başına düşer (çökme yok). */
export function furnitureById(id: string): FurnitureDef {
  return FURNITURE.find((f) => f.id === id) ?? FURNITURE[0];
}

/** Stantta satılan eşyalar (başlangıç takımı da satın alınabilir — fazladan adet). */
export function furnitureOf(category: FurnitureCategory): FurnitureDef[] {
  return FURNITURE.filter((f) => f.category === category);
}

/** Odaya dizilmiş tek bir eşya (ızgara konumu odanın merkezine GÖRE). */
export interface PlacedItem {
  key: string;
  id: string;
  /** Odanın merkezine göre YEREL konum (ızgaraya oturmuş). */
  x: number;
  z: number;
  /** Sunucudaki eşya satırı (kaldırma/dizme bu satırı hedefler). */
  rowId: string;
}

/**
 * Sunucudan gelen SAHİP OLUNAN eşya satırı.
 *
 * `fx`/`fz` boşsa eşya DOLAPTA (satın alınmış ama dizilmemiş); doluysa odada
 * durur. Konum oransaldır (bkz. dosya başlığı).
 */
export interface OwnedFurniture {
  rowId: string;
  itemId: string;
  fx?: number;
  fz?: number;
}

/** Odada DURAN eşyalar (`fx/fz` dolu satırlar) — oransaldan metreye çevrilir. */
export function placedFurniture(
  owned: readonly OwnedFurniture[],
  half: { x: number; z: number },
): PlacedItem[] {
  return owned
    .filter((row) => row.fx !== undefined && row.fz !== undefined)
    .map((row) => {
      const def = furnitureById(row.itemId);
      const spot = placeFurniture(
        { x: row.fx! * half.x, z: row.fz! * half.z },
        def,
        half,
      );
      return { key: row.rowId, id: def.id, x: spot.x, z: spot.z, rowId: row.rowId };
    });
}

/** Bir eşyanın kaç adedi dizili? (katalog sayacı için) */
export function countPlaced(
  owned: readonly OwnedFurniture[],
  itemId: string,
): number {
  return owned.filter((row) => row.itemId === itemId && row.fx !== undefined)
    .length;
}

/** Bir eşyanın kaç adedi DOLAPTA (dizilmeye hazır)? */
export function countFree(
  owned: readonly OwnedFurniture[],
  itemId: string,
): number {
  return owned.filter((row) => row.itemId === itemId && row.fx === undefined)
    .length;
}

/** Dolaptaki ilk boş adet (dizilecek satır); yoksa `null`. */
export function firstFree(
  owned: readonly OwnedFurniture[],
  itemId: string,
): OwnedFurniture | null {
  return (
    owned.find((row) => row.itemId === itemId && row.fx === undefined) ?? null
  );
}

/** Yerel metre konumunu odanın yarı açıklığına göre ORANA çevirir (-1…1). */
export function furnitureRatios(
  x: number,
  z: number,
  half: { x: number; z: number },
): { fx: number; fz: number } {
  const ratio = (value: number, span: number) =>
    span > 0 ? Math.round(Math.min(1, Math.max(-1, value / span)) * 1e4) / 1e4 : 0;
  return { fx: ratio(x, half.x), fz: ratio(z, half.z) };
}

/**
 * BAŞLANGIÇ TAKIMI — oyuncu odayı ilk açtığında HEDİYE olarak sahip olduğu
 * eşyalar (oransal konumlar). Sunucuya bu listeyle tohumlanır (`furniture.ts`
 * → `seedStarter`), yani hediye eşyalar da GERÇEK sahiplik satırlarıdır:
 * kaldırılabilir, taşınabilir, fazladan adedi stanttan alınabilir.
 */
export function starterFurniture(): OwnedFurniture[] {
  return DEFAULT_DECOR.map((decor, i) => ({
    rowId: `d${i}_${decor.id}`,
    itemId: decor.id,
    fx: decor.fx,
    fz: decor.fz,
  }));
}

/** Açılış dekorunun tek parçası — oransal (yarım açıklığa göre) konum. */
export interface DefaultDecorDef {
  id: string;
  /** X oranı (-1…1): -1 sol duvar, +1 sağ duvar. */
  fx: number;
  /** Z oranı (-1…1): -1 arka duvar, +1 ön (kameraya yakın) duvar. */
  fz: number;
}

/**
 * AÇILIŞ DEKORU — odanın hazır geldiği eşya (oransal konum).
 *
 * NEDEN VAR: oda modeli BOŞ bir mekân (`empty_office_space`); hiçbir şey
 * dizilmediğinde oyuncu ilk girdiğinde çıplak bir kutu görüyor ve oda "eksik"
 * okunuyor. Oda bu yüzden az sayıda eşyayla AÇILIR — oyuncu düzenleme modunda
 * bunları da kaldırıp kendi düzenini kurabilir (aynı araçlar, aynı davranış).
 *
 * KONUM ORANSALDIR (`fx`/`fz`: odanın YARIM açıklığına göre -1…1): odanın
 * ölçüsü modelden ÖLÇÜLEREK bulunduğu için sabit metre yazılamaz — oransal
 * konum her modelde duvarların içinde kalır. Gerçek yerleşimi `defaultDecorFor`
 * yapar: oransal noktayı metreye çevirir, 0,5 m ızgaraya oturtur ve duvar
 * sınırına kırpar (tek doğruluk kaynağı: `placeFurniture`).
 *
 * KAPI ÖNÜ BOŞ BIRAKILIR: çıkış kapısı arka (kameradan UZAK) duvarın TAM
 * ORTASINDA — dekor o duvarın yalnızca İKİ YANINA dizilir (kapı kapanmasın).
 * Sol/sağ duvarlar değil, ARKA duvar tercih edildi: eşyalar zaten dikey
 * eksende derinlikleriyle (d) arka duvara yaslanacak şekilde çiziliyor.
 */
export const DEFAULT_DECOR: readonly DefaultDecorDef[] = [
  { id: "rug", fx: 0, fz: 0.15 },
  { id: "shelf", fx: -0.62, fz: -0.9 },
  { id: "sofa", fx: 0.62, fz: -0.86 },
  { id: "lamp", fx: -0.8, fz: -0.05 },
  { id: "table", fx: 0.3, fz: 0.42 },
  { id: "chair", fx: 0.12, fz: 0.62 },
  { id: "plant", fx: -0.85, fz: 0.55 },
];

/**
 * Açılış dekorunu odanın ÖLÇÜLEN yarı açıklığına yerleştirir.
 *
 * Anahtarlar `d{i}_` ile başlar: oyuncunun kendi dizdiği eşyaların satır
 * kimliklerinin yanında karışmaz, ama davranışları AYNIDIR — düzenleme
 * modunda dokununca kalkar (sunucuda da `lift` çağrılır).
 */
export function defaultDecorFor(half: { x: number; z: number }): PlacedItem[] {
  return placedFurniture(starterFurniture(), half);
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
