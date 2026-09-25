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
}
