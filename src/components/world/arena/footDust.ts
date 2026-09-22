// 👣 footDust — yürüyen karakterin AYAK ARKASINDAN çıkan tozun konum kararı.
//
// NEDEN AYRI MODÜL: iki arena da (bot düellosu + PvP) tamamen aynı kuralı
// kullansın. Eskiden adım tozu `vfx.smoke(p.x, p.y - 6, …)` ile isteniyordu;
// bu, tozu karakterin GÖVDE MERKEZİNDEN ve zeminden yukarıdan (y - 6 px)
// çıkarıyordu — "tam ayak arkasından çıkmıyor" şikâyetinin sebebi buydu. Ayrıca
// `smoke` yolu iri, yükselen bir duman sistemidir: 2 puf + küçük büyüme ile
// neredeyse görünmez kalıyordu.
//
// Bu modül yalnızca KARARI verir (nereden, hangi ayaktan, hangi yöne); nasıl
// çizileceğine görsel katman karar verir (`arena/HitImpactVfx` → `FOOT_DUST`
// ayarı: zemine yakın, geriye savrulan, belirgin ama görüşü kapatmayan puflar).
//
// Üç kural:
//   1. Nokta, son adımdan bu yana oluşan hareket vektörünün TERSİNE kaydırılır
//      → toz ayağın arkasında belirir (0.28 birim; büyüyen bulutun alt kenarı
//      hâlâ ayak bileğinin dibinde kalır).
//   2. Her adımda sağ/sol ayak DÖNÜŞÜMLÜ seçilir → tek ayaktan çıkıyormuş gibi
//      görünmez, yürüyüş ritmi okunur.
//   3. Dikey ofset yoktur: toz zeminden (ayak hizasından) çıkar.
import { pushHitImpact } from "./hitImpacts";

/** Arena pikseli cinsinden adım izi durumu (simülasyon durumu, React state değil). */
export interface FootDustTrack {
  /** Son ölçülen konum (arena pikseli). */
  x: number;
  y: number;
  /** Son geçerli hareket yönü (birim vektör). */
  dirX: number;
  dirZ: number;
  /** Sıradaki ayak: +1 / -1 (adım başına çevrilir). */
  side: number;
}

/** Tozun ayağın ARKASINA kaydırılma miktarı (arena pikseli, S=50 → 0.28 birim). */
const BEHIND_PX = 14;
/** Sol/sağ ayak ayrımı (arena pikseli, S=50 → 0.16 birim). */
const LATERAL_PX = 8;
/** Bu mesafeden az yer değiştirdiyse yön güncellenmez (piksel). */
const MOVE_MIN_PX = 0.5;
/** Bundan büyük sıçrama (respawn/ışınlanma) toz üretmez, yalnız izi tazeler. */
const TELEPORT_PX = 120;

export function createFootDustTrack(x: number, y: number): FootDustTrack {
  return { x, y, dirX: 0, dirZ: 0, side: 0 };
}

/**
 * Karakter dururken izi tazele: sonraki adımda eski konumdan sahte bir yön
 * (ya da sahte uzun bir vektör) çıkmasın.
 */
export function holdFootTrack(track: FootDustTrack, x: number, y: number): void {
  track.x = x;
  track.y = y;
}

/**
 * Bir adım tozu isteği yayınlar (görsel katman aynı karede tüketir).
 * `owner`, dövüşçü nesnesidir — efekt o dövüşçünün kendi katmanından çıkar.
 */
export function emitFootstepDust(
  owner: object,
  track: FootDustTrack,
  x: number,
  y: number,
): void {
  const dx = x - track.x;
  const dy = y - track.y;
  track.x = x;
  track.y = y;
  const len = Math.hypot(dx, dy);

  if (len > TELEPORT_PX) return; // ışınlanma/respawn: toz yok
  if (len >= MOVE_MIN_PX) {
    track.dirX = dx / len;
    track.dirZ = dy / len;
  } else if (!track.dirX && !track.dirZ) {
    return; // yön hiç bilinmiyor → toz üretme
  }

  // Ayak dönüşümlü: bir adım sol, bir adım sağ.
  track.side = track.side >= 0 ? -1 : 1;
  // Arka vektörü (-dir) + yanal ayak kayması (dikin yönü: -dirZ, dirX).
  const px = x - track.dirX * BEHIND_PX - track.dirZ * LATERAL_PX * track.side;
  const py = y - track.dirZ * BEHIND_PX + track.dirX * LATERAL_PX * track.side;

  pushHitImpact(owner, {
    kind: "footstep",
    x: px,
    y: py,
    hit: false,
    heavy: false,
    t: performance.now(),
    dirX: track.dirX,
    dirY: track.dirZ,
  });
}
