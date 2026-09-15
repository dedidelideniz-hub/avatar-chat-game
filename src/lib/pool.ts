// ♻️ Nesne havuzu (object pooling) + O(1) dizi silme yardımcıları.
//
// Neden: Savaş sahnesi her karede mermi/efekt üretip yok ediyor. `destroy()`
// yapıp yenisini `new`'lemek yerine nesneleri havuza geri verip tekrar
// kullanıyoruz; böylece Garbage Collector sürekli devreye girmez ve kare
// süreleri (frame time) sabit kalır — yani takılmalar biter.
//
// Kullanım örneği:
//   const pool = createObjectPool<Bullet>(() => ({ x: 0, y: 0, vx: 0, vy: 0 }));
//   const b = pool.acquire();   // yeni ayırma yok (havuzda varsa)
//   b.x = 10; ...
//   pool.release(b);            // destroy() yerine: havuza geri ver

/** Havuzlanan nesnelerin ortak sözleşmesi: hiçbir şey (herhangi bir nesne). */
export type Poolable = object;

export interface ObjectPool<T extends Poolable> {
  /** Havuzdan bir nesne al. Havuz boşsa `create()` ile yeni nesne üretilir. */
  acquire(): T;
  /** Ölen nesneyi yok etme, havuza geri ver. */
  release(obj: T): void;
  /** Havuzda şu an bekleyen (tekrar kullanılabilir) nesne sayısı. */
  readonly free: number;
  /** Debug/ölçüm: toplam kaç kez yeni nesne ayrıldı. */
  readonly created: number;
}

/**
 * Basit free-list havuzu.
 *
 * @param create Yeni nesne fabrikası. Alanların tamamı başlangıç değeriyle
 *   tanımlanmalı (böylece nesne şekli — hidden class — asla değişmez, V8
 *   yeniden optimize etmek zorunda kalmaz).
 * @param maxFree Havuzda tutulacak en fazla ölü nesne (bellek tavanı).
 * @param reset `release` sırasında nesneyi sıfırlamak için (opsiyonel).
 */
export function createObjectPool<T extends Poolable>(
  create: () => T,
  options: { maxFree?: number; reset?: (obj: T) => void } = {},
): ObjectPool<T> {
  const { maxFree = 512, reset } = options;
  const freeList: T[] = [];
  let created = 0;

  return {
    acquire(): T {
      const reused = freeList.pop();
      if (reused !== undefined) return reused;
      created++;
      return create();
    },
    release(obj: T): void {
      if (reset) reset(obj);
      if (freeList.length < maxFree) freeList.push(obj);
    },
    get free() {
      return freeList.length;
    },
    get created() {
      return created;
    },
  };
}

/**
 * `arr[i]`'yi diziden O(1)'de çıkarır: son elemanı boşalan yuvaya taşır.
 *
 * `splice(i, 1)` dizinin kalanını kaydırır (her elemanı taşır, yeni dizi
 * ayırabilir). Sıranın korunması gerekmeyen havuz listelerinde (mermi, efekt)
 * swap-remove kullanmak hem daha hızlı hem çöp üretmez.
 */
export function swapRemove<T>(arr: T[], i: number): void {
  const last = arr.length - 1;
  if (i !== last) arr[i] = arr[last];
  arr.pop();
}

/**
 * Listeyi yerinde sıkıştırır: `keep` false dönen her eleman `onDead`'a verilir
 * ve diziden çıkarılır. Yeni dizi ayırmaz (`.filter()` yerine) ve eleman
 * sırasını KORUR. Geriye kalan eleman sayısını döndürür.
 */
export function sweepInPlace<T>(
  arr: T[],
  keep: (item: T) => boolean,
  onDead?: (item: T) => void,
): number {
  let count = 0;
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (keep(item)) {
      arr[count++] = item;
    } else if (onDead) {
      onDead(item);
    }
  }
  arr.length = count;
  return count;
}
