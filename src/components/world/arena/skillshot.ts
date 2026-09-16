// 🎯 Skillshot (menzilli nişan) sistemi.
//
// Eskiden yetenekler düşmanı haritanın neresinde olursa olsun otomatik olarak
// kilitliyor ve mermi/efekt onun üzerine gidiyordu (1500 px'e kadar). Bu modül
// o davranışı kaldırıp LoL / Wild Rift tarzı menzilli nişanı kurar:
//
//   1) MAX_RANGE (4 birim = 200 px) — hiçbir atış bu mesafeden öteye gitmez;
//      menzil sonunda mermi sönüp yok olur (bkz. ProjectilePool).
//   2) Düşman yalnızca menzil İÇİNDEyse otomatik kilitlenir (quick tap).
//      Menzil dışındaysa atış karakterin baktığı yöne gider.
//   3) Aktif nişan (butonu basılı tutup sürükleme) her zaman kazanır:
//      nişan varsa kilit yok, atış tam o yöne gider.
//
// `aimState` React state DEĞİL, paylaşılan mutable bir nesnedir: HUD giriş
// katmanı yazar, Arena3D'deki 3B nişan göstergesi her karede okur — böylece
// nişan alırken hiçbir React yeniden çizimi olmaz.
import { S } from "./shared";

/** Yeteneğin ulaşabileceği en uzak mesafe (birim). Karakter gövdesi 1.5 birim
 *  olduğundan 4 birim ≈ karakterin hemen önündeki kısa menzil: haritayı
 *  kaplamaz, "3-4 metre ileri" hissi verir. */
export const MAX_RANGE_UNITS = 4;
/** Aynı mesafe oyun biriminde (px) — simülasyon px uzayında çalışır. */
export const MAX_RANGE_PX = MAX_RANGE_UNITS * S;
/** Merminin menzil sonunda sönmeye başladığı mesafe (px). Kısa menzilde
 *  uçuşun yarısı sönük görünmesin diye menzile göre küçük tutulur. */
export const RANGE_FADE_PX = 40;

/** Skillshot şeridinin (yerdeki ok) genişliği — birim. */
export const SKILLSHOT_WIDTH = 0.55;

/** Nişan durumu: kim, hangi yöne nişan alıyor? (bkz. dosya başı notu) */
export const aimState = {
  /** Yetenek butonu basılı tutuluyor mu? */
  ability: false,
  /** Hangi yetenek: renk ve okunurluk için. */
  kind: "super" as "super" | "ult",
  /** Ham nişan vektörü (−1..1). 0/0 → otomatik (menzil içi kilit veya bakış). */
  dx: 0,
  dy: 0,
  /** Düz vuruş nişanı (sağ butonu basılı tutup sürükleme). */
  basic: false,
  basicDx: 0,
  basicDy: 0,
};

/**
 * Ateş Topu'nun patlama mesafesi (px). Simülasyondaki
 * `pr.explodeR && pr.travelled >= FIREBALL_RANGE_PX` kontrolü hem bot
 * arenasında hem PvP'de bu sabiti okur — görsel sönme ile patlama aynı
 * noktada gerçekleşsin diye tek yerden tutuluyor.
 */
export const FIREBALL_RANGE_PX = MAX_RANGE_PX;
/** Menzil sonuna yaklaşan merminin sönme çarpanı (1 → 0). */
export function rangeFade(travelled: number, range: number): number {
  const start = range - RANGE_FADE_PX;
  if (travelled <= start) return 1;
  return Math.max(0, 1 - (travelled - start) / RANGE_FADE_PX);
}

export interface AimDir {
  /** Normalize edilmiş yön. */
  x: number;
  y: number;
  /** Yön menzil içindeki düşmana kilitlendi mi? */
  locked: boolean;
}

/** Karakterin baktığı yön (gövde 4 yönlü döner: yukarı/aşağı veya sağ/sol). */
export function facingDir(f: { facing: number; vy: number }): AimDir {
  if (f.vy < 0) return { x: 0, y: -1, locked: false };
  if (f.vy > 0) return { x: 0, y: 1, locked: false };
  return { x: f.facing >= 0 ? 1 : -1, y: 0, locked: false };
}

/** İki nokta arasındaki mesafe (px). */
export function distPx(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Düşman menzil içinde mi? */
export function inRange(
  caster: { x: number; y: number },
  target: { x: number; y: number },
  rangePx = MAX_RANGE_PX,
): boolean {
  return distPx(caster, target) <= rangePx;
}

/**
 * Atışın gideceği yönü çözer.
 *
 * @param aimDx/aimDy aktif nişan vektörü (joystick). Büyüklüğü > 0.15 ise
 *   nişan geçerli sayılır ve yön tamamen oyuncunun gösterdiğidir.
 * @param canLock false ise (ör. düşman çalıda gizliyken) otomatik kilit yok.
 * @param rangePx otomatik kilidin geçerli olduğu menzil.
 */
export function resolveAim(
  caster: { x: number; y: number; facing: number; vy: number },
  enemy: { x: number; y: number } | null,
  aimDx = 0,
  aimDy = 0,
  opts: { canLock?: boolean; rangePx?: number } = {},
): AimDir {
  const mag = Math.hypot(aimDx, aimDy);
  if (mag > 0.15) {
    return { x: aimDx / mag, y: aimDy / mag, locked: false };
  }
  const rangePx = opts.rangePx ?? MAX_RANGE_PX;
  if (
    enemy &&
    (opts.canLock ?? true) &&
    distPx(caster, enemy) <= rangePx
  ) {
    const dx = enemy.x - caster.x;
    const dy = enemy.y - caster.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d, locked: true };
  }
  // Menzil dışında kilit yok: karakterin baktığı yöne, tam menzile atış.
  return facingDir(caster);
}

/**
 * Yönün menzil sonundaki noktası. `spawnProj` bir hedef nokta beklediği için
 * atışlar doğrudan bu noktaya nişanlanır — böylece hem yön hem de menzil
 * sınırı tek yerden verilir.
 */
export function rangePoint(
  from: { x: number; y: number },
  dir: { x: number; y: number },
  rangePx = MAX_RANGE_PX,
): { x: number; y: number } {
  return { x: from.x + dir.x * rangePx, y: from.y + dir.y * rangePx };
}

/** Kaynak menzil içinde ve yönün açısal genişliği içinde mi (ışın/yarık)? */
export function aimedHit(
  from: { x: number; y: number },
  dir: { x: number; y: number },
  target: { x: number; y: number },
  opts: { rangePx?: number; halfAngle?: number } = {},
): boolean {
  const rangePx = opts.rangePx ?? MAX_RANGE_PX;
  const halfAngle = opts.halfAngle ?? 0.42;
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d > rangePx) return false;
  if (d < 1) return true;
  const dot = (dx / d) * dir.x + (dy / d) * dir.y;
  return dot >= Math.cos(halfAngle);
}
