// 💥 Darbe efektleri — simülasyon ile görsel katman arasındaki kuyruk.
//
// NEDEN VAR: darbe geri bildirimi eskiden global efekt veri yolundan
// (`vfx.burst` + `vfx.smoke` + `vfx.coldFlameImpact` + `vfx.flash`) geçiyordu.
// O yol patlamalar için tasarlandığı için ölçüleri büyüktü: bloom nabzı
// tetikleyen ~2 birimlik parlak küre, 2.4 birim yükselen iri duman bloğu ve
// tüm ekranı ışıtan `flash`. Üçü birlikte darbe anında hem karakteri hem
// düşmanı kapatıyordu.
//
// Bu kuyruk, darbe efektini patlama efektlerinden AYIRIR: darbe yalnızca
// "nerede, temas var mı, ağır mı" bilgisini taşır; nasıl çizileceğine görsel
// katman karar verir (`arena/HitImpactVfx` → yumuşak toz pufları + minik
// kıvılcım).
//
// Anahtar DÖVÜŞÇÜDÜR: her dövüşçünün kendi efekt katmanı vardır, kuyruk
// `WeakMap` ile tutulduğu için sahneden ayrılan dövüşçünün kuyruğu da
// kendiliğinden toplanır (sızıntı yok).

export type ImpactKind =
  /** Silah teması: minik kıvılcımlar + zemin tozu. */
  | "strike"
  /** Sadece zemin tozu (havalanma, kayma, mermi çarpması). */
  | "dust"
  /** 👣 Yürüyüş adımı tozu: ayak arkasından, zeminden çıkan belirgin puf. */
  | "footstep";

export interface HitImpact {
  kind: ImpactKind;
  /** Arena piksel koordinatı (zemin düzlemi). */
  x: number;
  y: number;
  /** Silah gerçekten değdi mi? (ıska = yalnız toz, kıvılcım yok) */
  hit: boolean;
  /** Bitirici/ağır vuruş → kıvılcım bir tık daha güçlü. */
  heavy: boolean;
  /**
   * Yalnız `footstep`: adımın atıldığı yön (arena pikseli, birim vektör).
   * Toz bu yönün TERSİNE savrulur — ayak arkasından çıkar.
   */
  dirX?: number;
  dirY?: number;
  /** Üretim zamanı (ms): bayat kayıtlar yeni maça taşınmaz. */
  t: number;
}

/** Aynı dövüşçü için kuyruklanmış efektler. */
const queues = new WeakMap<object, HitImpact[]>();
/**
 * Sahiplik bilgisi olmayan efektler (örn. mermi çarpması: atıcı belli ama
 * efekt katmanı dövüşçüye bağlanmıyor). Bu kuyruğu, o karede ilk çalışan
 * dövüşçü katmanı boşaltır — katmanlar DÜNYA uzayında çizdiği için efekt aynı
 * yerde belirir (katman başına çoğalma olmaz).
 */
let globalQueue: HitImpact[] = [];

/**
 * Kuyruk üst sınırı: görsel katman yoksa (sahne kurulmadan önce) simülasyon
 * sınırsız bellek biriktirmesin.
 */
const QUEUE_MAX = 6;

/**
 * Bir darbe efekti yayınlar (görsel katman aynı karede tüketir).
 * `fighter` yerine `null` verilirse sahipsiz (global) kuyruğa yazılır.
 */
export function pushHitImpact(
  fighter: object | null,
  impact: HitImpact,
): void {
  if (!fighter) {
    if (globalQueue.length >= QUEUE_MAX) return;
    globalQueue.push(impact);
    return;
  }
  const queue = queues.get(fighter);
  if (!queue) {
    queues.set(fighter, [impact]);
    return;
  }
  if (queue.length >= QUEUE_MAX) return;
  queue.push(impact);
}

/** Sahipsiz efektleri boşaltır (yoksa `null`). */
export function drainGlobalHitImpacts(): HitImpact[] | null {
  if (globalQueue.length === 0) return null;
  const out = globalQueue;
  globalQueue = [];
  return out;
}

/**
 * Bekleyen efektleri boşaltır (yoksa `null` — kare başına dizi ayrılmaz).
 * Yalnızca ilgili dövüşçünün kendi görsel katmanı çağırır.
 */
export function drainHitImpacts(fighter: object): HitImpact[] | null {
  const queue = queues.get(fighter);
  if (!queue || queue.length === 0) return null;
  queues.set(fighter, []);
  return queue;
}
