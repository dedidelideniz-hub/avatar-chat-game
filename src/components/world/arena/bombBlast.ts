// 💥 Barut patlaması posta kutusu — basit bir olay kuyruğu.
//
// NEDEN AYRI KUYRUK: patlamanın "hafif" katmanları (halkalar, alev pufları,
// barut dumanı) paylaşılan VFX listesine (`fxs`) yazılır ve `Arena3D → FxPool`
// onları tek geçişte çizer. Ağır katmanlar — zemin şok dalgası diski, savrulan
// taş parçaları (örnekleme + fizik) ve merkezdeki kılıç kesiği — kendi
// havuzlarını, uniform'larını ve fiziklerini ister; bunları tek bir bileşende
// toplamak (bkz. `BombBlastVfx`) hem okunur hem de `FxPool`un ömrüne bağlı
// kalmayan temiz bir sahiplik verir.
//
// Posta kutusu `bloomPulse`/`aimState`/`bombTrapState` ile aynı desendir:
// React state DEĞİL, paylaşılan mutable bir nesne — yazan taraf simülasyon
// (VFX veri yolu), okuyan taraf render döngüsü. Yani patlama başına hiçbir
// React yeniden çizimi olmaz.
//
// Kuyruk boyu SINIRLIDIR: uzun bir takılmadan sonra birikmiş patlamalar aynı
// karede boşalıp kareyi kilitlemesin (eskisi düşer, en yenisi kalır).
export interface BombBlastEvent {
  /** Patlama merkezi (sim uzayı, dünya px). */
  x: number;
  y: number;
  /** Patlamanın GÖRSEL yarıçapı (dünya px) = `damageR × FIREBALL_VFX_SCALE`. */
  r: number;
}

/** Aynı anda kuyrukta bekleyebilecek en fazla olay. */
const MAX_QUEUE = 6;

const queue: BombBlastEvent[] = [];
/** Kimse yazmadığında tahsis yapmamak için paylaşılan boş dizi. */
const EMPTY: BombBlastEvent[] = [];

/** Bir barut patlamasını görsel katmana bildirir (bkz. `pushBombBlastFx`). */
export function pushBombBlastEvent(x: number, y: number, r: number): void {
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push({ x, y, r });
  // Aynı anda kamera da sarsılır: patlamanın "hissettirme" yarısı budur.
  // Şiddet patlamanın GÖRSEL yarıçapından türetilir (büyük ulti > küçük tuzak)
  // ve `prefers-reduced-motion` açıkken tamamen kapanır.
  triggerCameraShake(
    prefersReducedMotion() ? 0 : Math.min(MAX_SHAKE, SHAKE_BASE + r * SHAKE_PER_R),
  );
}

/* ------------------------------------------------------------------ */
/* KAMERA SARSINTISI (camera shake)                                    */
/* ------------------------------------------------------------------ */
// NEDEN AYRI BİR KUYRUK DEĞİL: sarsıntı bir "olay listesi" değil, TEK bir
// durumdur (anlık şiddet + geçen süre). İki patlama üst üste binerse yeni bir
// sarsıntı eklemek yerine yalnızca DAHA GÜÇLÜSÜ kazanır; aksi halde iki tuzak
// aynı karede patlayınca kamera ekrandan savrulurdu.
//
// Tüketen taraf kamera takipçisidir (bkz. `ArenaCamera` → `stepCameraShake`):
// her karede bir kez `stepCameraShake(dt)` çağrılır ve dönen ofset hem kamera
// konumuna hem bakış noktasına AYNI miktarda eklenir — yani görüntü dönmez,
// bütün hâlinde sarsılır (klasik kamera titremesi).

/** Sarsıntının toplam süresi (sn). İstenen değer: 0.2 sn'de sıfıra insin. */
const SHAKE_DURATION = 0.2;
/** Patlama yarıçapından bağımsız taban şiddet (dünya birimi). */
const SHAKE_BASE = 0.06;
/** Görsel yarıçapın (dünya px) şiddete katkısı. */
const SHAKE_PER_R = 0.0017;
/** Üst sınır: arka arkaya patlamalar kamerayı kadrajdan atmasın. */
const MAX_SHAKE = 0.3;

const shake = { amp: 0, time: 0 };
/** Kimse sarsılmadığında tahsis yapmamak için paylaşılan sıfır ofseti. */
const SHAKE_ZERO = { x: 0, y: 0, z: 0 };
const shakeOut = { x: 0, y: 0, z: 0 };

let reducedMotionCache: boolean | null = null;
/** `prefers-reduced-motion` — sarsıntıya duyarlı oyuncular için bir kez okunur. */
function prefersReducedMotion(): boolean {
  if (reducedMotionCache !== null) return reducedMotionCache;
  reducedMotionCache =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reducedMotionCache;
}

/** Sarsıntıyı tetikler. Yalnızca daha güçlü olan kabul edilir (üst üste binmez). */
export function triggerCameraShake(amplitude: number): void {
  if (amplitude <= 0 || amplitude <= shake.amp) return;
  shake.amp = amplitude;
  shake.time = 0;
}

/**
 * Sarsıntıyı bir adım ilerletir ve kameraya eklenecek ofseti döndürür.
 * Zarf (envelope) `(1 - k)²`: patlama anında tepe şiddet, sonra hızla söner.
 * Üç eksen farklı frekanslarda salınır ki titreşim "organik" okunsun.
 */
export function stepCameraShake(dt: number): { x: number; y: number; z: number } {
  if (shake.amp <= 0) return SHAKE_ZERO;
  shake.time += dt;
  const k = shake.time / SHAKE_DURATION;
  if (k >= 1) {
    shake.amp = 0;
    shake.time = 0;
    return SHAKE_ZERO;
  }
  const env = shake.amp * (1 - k) * (1 - k);
  const t = shake.time;
  shakeOut.x = Math.sin(t * 62.0) * env;
  shakeOut.y = Math.sin(t * 47.0 + 1.7) * env * 0.8;
  shakeOut.z = Math.cos(t * 39.0 + 0.6) * env * 0.7;
  return shakeOut;
}

/**
 * Bekleyen olayları döndürür ve kuyruğu boşaltır (her karede bir kez).
 * Boşsa paylaşılan `EMPTY` döner: normal karelerde tahsis yok.
 */
export function drainBombBlastEvents(): BombBlastEvent[] {
  if (queue.length === 0) return EMPTY;
  const out = queue.slice();
  queue.length = 0;
  return out;
}

/** Sahne kurulurken: önceki maçtan kalan patlamalar yeni arenaya taşınmasın. */
export function resetBombBlastEvents(): void {
  queue.length = 0;
  shake.amp = 0;
  shake.time = 0;
}
