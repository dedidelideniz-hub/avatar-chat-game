/**
 * 🪑 BANKA OTURMA DURUMU — px katmanı (World.tsx oyun döngüsü) ile 3D katman
 * (avatar + oturma düğmesi) arasında paylaşılan küçük modül deposu.
 *
 * NEDEN PROP DEĞİL: oturma durumu hem gövde animasyonunu (konum/yön/poz) hem
 * de sahnedeki "Otur" düğmesini besliyor. Bu depo, `equipDebug` ile aynı
 * desendir: React ağacına prop eklemeden, kare başına okunacak mutable bir
 * kaynak. Tek yazıcısı oyun döngüsüdür (`setBenchSeatState`), okuyucuları
 * `GlbAvatar3D` ve `GameEngine3D`dir.
 */
import { benchFacing, BENCHES, type SeatState } from "./constants";

let near: number | null = null;
let seated: number | null = null;
let sitRequested = false;

/** Oyun döngüsü her değişimde çağırır: menzildeki ve oturulan bank. */
export function setBenchSeatState(next: {
  near: number | null;
  seated: number | null;
}): void {
  near = next.near;
  seated = next.seated;
}

/** Oturulmuyorsa menzildeki bankın dizini (3D düğme bunu kullanır). */
export function getBenchNear(): number | null {
  return seated === null ? near : null;
}

/** Oturulan bankın dizini (yoksa null). */
export function getBenchSeated(): number | null {
  return seated;
}

/** Avatarın beklediği biçim: oturulmuyorsa null. */
export function getSeatState(): SeatState | null {
  if (seated === null) return null;
  const bench = BENCHES[seated];
  return bench ? { facing: benchFacing(bench) } : null;
}

/** 3D düğmeden gelen oturma isteği (px katmanı bir sonraki karede tüketir). */
export function requestBenchSit(): void {
  sitRequested = true;
}

/** İstek varsa `true` döner ve isteği temizler. */
export function consumeBenchSitRequest(): boolean {
  if (!sitRequested) return false;
  sitRequested = false;
  return true;
}
