/**
 * VARLIK KUYRUĞU — Android/WebView'de başlangıç bellek zirvesini düşürür.
 *
 * KÖK NEDEN (ölçüldü): Cadde açılırken AYNI ANDA 8+ GLB indirilip parse
 * ediliyordu — `ground` + `maple_tree` (2,3 MB) + `grass_clump` + `character`
 * + `witch_shop` (43 MiB GPU dokusu) + oyuncu skini + oda modeli (1,5 sn
 * sonra) + iki zırh modeli (9 sn sonra). Dosya boyutları küçültülmüş olsa da
 * GLTFLoader her modeli bağımsız olarak: indirir → JSON/meshopt çözer →
 * WebP dokularını decode eder → GPU'ya yükler. Hepsi paralel olduğu için
 * Android WebView'in işleyici (renderer) süreci geçici olarak tepe yapar ve
 * JavaScript hatası vermeden öldürülür ("Hay aksi / Yeniden Yükle").
 *
 * ÇÖZÜM (bu modül): Ağır varlıkları SIRAYA KOY. Caddeyi çizmek için gereken
 * iki KRİTİK varlık (çim zemin + karakter) doğrudan yüklenir; diğerleri
 * (ağaç → çim öbekleri → binalar → skin → oda → zırh) cadde AÇILDIKTAN sonra
 * kuyruktan TEK TEK geçer:
 *
 *   Android/WebView : aynı anda 1 ağır varlık  (limit 1)
 *   Masaüstü        : aynı anda 2 ağır varlık  (limit 2)
 *
 * Böylece başlangıçtaki eşzamanlı decode/upload zirvesi "varlıkların
 * toplamı"ndan "en büyük tek varlık"a iner.
 *
 * GÜVENLİK: Kuyruk asla kalıcı olarak kilitlenmez —
 *   · `unlockBackgroundAssets()` çağrılmazsa `AUTO_UNLOCK_MS` sonra kendini açar,
 *   · bir slot `SLOT_TIMEOUT_MS` içinde "bitti" demezse serbest bırakılır
 *     (yüklemeyi yapan bileşen yine de devam eder; yalnızca sıra ilerler),
 *   · hiçbir hata yukarı fırlatılmaz: başarısız varlık atlanır, oyun devam eder;
 *     bir görev reddedilen bir promise dönerse o da BURADA karşılanır
 *     (yakalanmayan bir reddi geliştirme katmanı "Build Error" gösterir).
 */
import { useEffect, useSyncExternalStore } from "react";
import { assetPreloadingSuppressed } from "./worldDebug";

/**
 * ARKA PLAN sırası — küçük sayı önce yüklenir. Sıra kullanıcı isteğiyle aynı:
 * ağaç → çim öbekleri → binalar → skin → oda → zırh.
 */
export const ASSET_ORDER = {
  tree: 10,
  grass: 11,
  building: 12,
  skin: 13,
  room: 14,
  equipment: 15,
} as const;

/**
 * Düşük/orta seviye Android/WebView: aynı anda TEK ağır varlık. İki modelin
 * dokularını aynı anda decode etmek, tam da kaçındığımız zirveyi yaratıyordu.
 */
export const MOBILE_ASSET_LIMIT = 1;
/** Masaüstü: iki ağır varlık — deneyim gereksiz yere yavaşlamasın. */
export const DESKTOP_ASSET_LIMIT = 2;
/** Slot bu süre içinde tamamlanmazsa serbest bırakılır (kuyruk kilitlenmez). */
export const SLOT_TIMEOUT_MS = 20_000;
/** `unlockBackgroundAssets()` çağrılmazsa kuyruk bu süre sonra kendini açar. */
export const AUTO_UNLOCK_MS = 15_000;
/** İki boşta-görev arasında en az bu kadar ara (oda → zırh → zırh). */
export const IDLE_TASK_GAP_MS = 2_500;

/* ── Cihaz ölçütü ─────────────────────────────────────────────────────── */

/**
 * "Düşük/orta seviye Android/WebView" ölçütü: mobil kullanıcı aracısı VE dar
 * ekran. Yalnızca genişliğe bakmak yetmez (yatay telefonda 800 px olur) — bu
 * yüzden ikisi birlikte değerlendirilir.
 */
export function isLowMemoryAssetDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator?.userAgent ?? "";
  if (/Android|iPhone|iPad|iPod|Mobile|WebView/i.test(ua)) return true;
  return window.innerWidth < 768;
}

/** Kuyruktan aynı anda geçebilecek arka plan varlık sayısı. */
export function assetConcurrencyLimit(): number {
  return isLowMemoryAssetDevice()
    ? MOBILE_ASSET_LIMIT
    : DESKTOP_ASSET_LIMIT;
}

/* ── Debug (yalnızca bayrakla; üretimde konsolu doldurmaz) ─────────────── */

function debugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.location.search.includes("assetDebug")) return true;
    return window.localStorage.getItem("vaelos:assetDebug") === "1";
  } catch {
    return false;
  }
}

/** `?assetDebug` (veya localStorage `vaelos:assetDebug=1`) ile açılır. */
export const ASSET_DEBUG = debugEnabled();

function logMemory(tag: string): void {
  if (!ASSET_DEBUG) return;
  const memory = (
    performance as unknown as {
      memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number };
    }
  ).memory;
  if (!memory?.usedJSHeapSize) return;
  console.log(
    `[MEMORY] ${tag} heap=${(memory.usedJSHeapSize / 1048576).toFixed(1)} MiB` +
      (memory.jsHeapSizeLimit
        ? ` / limit=${(memory.jsHeapSizeLimit / 1048576).toFixed(0)} MiB`
        : ""),
  );
}

/* ── Kuyruk durumu (modül düzeyi: yeniden montajda sıfırlanmaz) ────────── */

interface PendingRequest {
  url: string;
  order: number;
  seq: number;
}

interface IdleTask {
  label: string;
  order: number;
  seq: number;
  run: () => void | Promise<unknown>;
}

const pending: PendingRequest[] = [];
const active = new Map<string, number>();
/** Bir kez sıra verilen URL bir daha geciktirilmez (drei önbelleği paylaşılır). */
const granted = new Set<string>();
const idleTasks: IdleTask[] = [];
const listeners = new Set<() => void>();

let backgroundUnlocked = false;
let unlockTimer: number | null = null;
let idleGapUntil = 0;
let seq = 0;

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function pump(): void {
  if (!backgroundUnlocked) return;
  const limit = assetConcurrencyLimit();
  let changed = false;

  while (active.size < limit && pending.length > 0) {
    pending.sort((a, b) => a.order - b.order || a.seq - b.seq);
    const next = pending.shift() as PendingRequest;
    if (granted.has(next.url)) continue;

    granted.add(next.url);
    const timer = window.setTimeout(() => {
      // Yükleme hâlâ sürüyor olabilir: sırayı serbest bırak, kuyruğu KİLİTLEME.
      active.delete(next.url);
      if (ASSET_DEBUG) {
        console.warn(`[ASSET] timeout ${next.url} (sıra serbest bırakıldı)`);
      }
      emit();
      pump();
    }, SLOT_TIMEOUT_MS);
    active.set(next.url, timer);
    changed = true;
    if (ASSET_DEBUG) {
      console.log(`[ASSET] start ${next.url} (sıra ${active.size}/${limit})`);
      logMemory("asset start");
    }
  }

  if (changed) emit();
  runIdleTasks();
}

/** Boşta bekleyen görevleri (oda/zırh ön yüklemeleri) sırayla çalıştırır. */
function runIdleTasks(): void {
  if (!backgroundUnlocked) return;
  if (active.size > 0 || pending.length > 0) return;
  if (Date.now() < idleGapUntil) return;
  const task = idleTasks.shift();
  if (!task) return;
  idleGapUntil = Date.now() + IDLE_TASK_GAP_MS;
  try {
    if (ASSET_DEBUG) console.log(`[ASSET] task start ${task.label}`);
    const result = task.run();
    // Görev hem senkron hem async olabilir. Dönen promise reddedilirse ve
    // yakalanmazsa "unhandled rejection" olur: geliştirme katmanı bunu tam
    // ekran "Build Error" olarak gösterir (ör. iptal edilmiş bir GLB indirmesi
    // `TypeError: Failed to fetch` verir). Arka plan görevi kritik DEĞİLDİR —
    // burada karşılanır, oyun aynen devam eder.
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      void (result as Promise<unknown>).catch((error: unknown) => {
        console.warn(`[ASSET] task reddedildi: ${task.label}`, error);
      });
    }
  } catch (error) {
    // Kritik OLMAYAN iş: başarısız olursa oyun devam eder.
    console.warn(`[ASSET] task başarısız: ${task.label}`, error);
  }
  if (ASSET_DEBUG) console.log(`[ASSET] task done ${task.label}`);
  // Bekleyen görev varsa arayı bekleyip sırayı kendiliğinden sürdür — aksi
  // halde bir sonraki görev yeni bir `pump()` tetiklenene kadar beklerdi.
  if (idleTasks.length > 0 && typeof window !== "undefined") {
    window.setTimeout(() => pump(), IDLE_TASK_GAP_MS + 50);
  }
}

function ensureAutoUnlock(): void {
  if (backgroundUnlocked || unlockTimer !== null) return;
  if (typeof window === "undefined") return;
  unlockTimer = window.setTimeout(() => {
    unlockTimer = null;
    if (!backgroundUnlocked) unlockBackgroundAssets();
  }, AUTO_UNLOCK_MS);
}

/* ── Dışa açık API ────────────────────────────────────────────────────── */

/** Cadde açıldıktan sonra çağrılır: arka plan sırası ANCAK bundan sonra akar. */
export function unlockBackgroundAssets(): void {
  if (backgroundUnlocked) return;
  backgroundUnlocked = true;
  if (unlockTimer !== null) {
    window.clearTimeout(unlockTimer);
    unlockTimer = null;
  }
  if (ASSET_DEBUG) {
    console.log(
      `[ASSET] street unlocked — arka plan sırası açıldı (limit ${assetConcurrencyLimit()})`,
    );
    logMemory("street unlocked");
  }
  pump();
}

/** Bir URL için sıra isteği (aynı URL için tekrar çağrılırsa yinelenmez). */
export function requestAssetSlot(url: string, order: number): void {
  if (!url || typeof window === "undefined") return;
  // 🧪 İZOLASYON MODU: arka plan yüklemesi TAMAMEN kapalı. Aksi halde kuyruğun
  // kendi otomatik açılması (`AUTO_UNLOCK_MS`), "boş canvas" aşamasında bile
  // ağaç/bina indirmeye başlar ve ölçümü kirletirdi.
  if (assetPreloadingSuppressed()) return;
  if (granted.has(url)) return;
  if (pending.some((request) => request.url === url)) return;
  pending.push({ url, order, seq: seq++ });
  ensureAutoUnlock();
  pump();
}

/** Sıra verilmiş bir varlık TAMAMLANDI: slot serbest, sıra ilerler. */
export function markAssetReady(url: string): void {
  const timer = active.get(url);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    active.delete(url);
  }
  if (ASSET_DEBUG) {
    console.log(`[ASSET] done ${url}`);
    logMemory("asset done");
  }
  emit();
  pump();
}

/**
 * Bileşen söküldü: SADECE bekleyen istek iptal edilir.
 *
 * İşgal edilmiş slot BURADA bırakılmaz: React `StrictMode` geliştirmede
 * efekti iki kez çalıştırır (kur → temizle → kur). Slotu burada bırakmak,
 * "kur" anında verilen sıranın hemen silinmesine ve kuyruğun bir SONRAKİ
 * ağır varlığı aynı anda başlatmasına yol açıyordu (yani tam da kaçındığımız
 * eşzamanlılık). Sıra zaten `AssetReadySignal` (model çözülünce) ya da
 * `SLOT_TIMEOUT_MS` supabıyla bırakılır — ikisi de her durumda çalışır.
 */
export function cancelAssetSlot(url: string): void {
  const index = pending.findIndex((request) => request.url === url);
  if (index >= 0) pending.splice(index, 1);
  emit();
  pump();
}

/** Yükleme kuyruğu BOŞKEN çalışacak görev (oda modeli, zırh ısıtması). */
export function enqueueIdleTask(
  order: number,
  label: string,
  run: () => void,
): void {
  // 🧪 İzolasyon modunda (aşama 1–8) hiçbir arka plan yüklemesi kuyruğa girmez.
  if (assetPreloadingSuppressed()) return;
  idleTasks.push({ order, label, seq: seq++, run });
  idleTasks.sort((a, b) => a.order - b.order || a.seq - b.seq);
  ensureAutoUnlock();
  pump();
}

/** Test/gözlem: kuyruk anlık görüntüsü. */
export function assetQueueSnapshot(): {
  active: number;
  pending: number;
  granted: number;
  unlocked: boolean;
  limit: number;
} {
  return {
    active: active.size,
    pending: pending.length,
    granted: granted.size,
    unlocked: backgroundUnlocked,
    limit: assetConcurrencyLimit(),
  };
}

/* ── React bağlantısı ─────────────────────────────────────────────────── */

/**
 * Bu varlık için sıra VERİLDİ mi? `false` dönerken yükleme BAŞLAMAZ — bileşen
 * `null` döndürmeli ve `useGLTF`'i ayrı (alt) bir bileşende çağırmalıdır.
 */
export function useAssetSlot(url: string, order: number): boolean {
  const allowed = useSyncExternalStore(
    subscribe,
    () => (url ? granted.has(url) : false),
    () => false,
  );
  useEffect(() => {
    if (!url) return;
    requestAssetSlot(url, order);
    return () => cancelAssetSlot(url);
  }, [url, order]);
  return allowed;
}

/**
 * Yükleme TAMAMLANDI sinyali: `useGLTF` çözdükten SONRA monte olan ağacın
 * içine konur (örn. modelin çizildiği grubun kardeşi). Montaj anında sırayı
 * serbest bırakır; böylece kuyruk bir sonraki ağır varlığa geçer.
 */
export function AssetReadySignal({ url }: { url: string }): null {
  useEffect(() => {
    markAssetReady(url);
  }, [url]);
  return null;
}
