/**
 * 🌐 WEBGL BAĞLAM YÖNETİMİ — kaç bağlam açık, hangisi bırakılabilir?
 *
 * NEDEN VAR: oyunun her 3D parçası KENDİ WebGL bağlamını açar (cadde, oda,
 * profil kartı, giriş sahnesi, mağaza önizlemesi, arena). Tarayıcılar — hele
 * mobildekiler — çok az sayıda bağlama izin verir ve `THREE.WebGLRenderer`
 * yeni bir bağlam açamayınca `Error creating WebGL context.` ile HATA VERİR.
 * Bu hata `@react-three/fiber`ın ASENKRON `configure()` çağrısının içinde
 * çıktığı için React hata sınırına UĞRAMAZ ve oyunun tamamını düşürür.
 *
 * Üç kaynaktan biri tükeniyor: (a) sayfa başına bağlam sayısı sınırı,
 * (b) GPU belleği, (c) sökülen canvas'ların bağlamlarını BIRAKMAMASI —
 * `renderer.dispose()` bağlamı serbest bırakmaz, yalnızca
 * `forceContextLoss()` bırakır. Bu yüzden:
 *
 *   1. `registerCanvasContext` / `releaseCanvasContext`: AÇIK bağlamlar burada
 *      tutulur; her canvas sökülürken bağlamını BIRAKIR (`WebglCanvas.tsx`).
 *   2. `releaseExpendableContext`: yer gerekirse EN UCUZ (korunmayan) bağlam
 *      bırakılır ve yeniden denenir — önizleme/yedek canvas'lar feda edilir,
 *      caddede yürüyen oyuncu asla düşürülmez.
 *   3. `watchCanvasFailures`: asenkron bağlam hatalarını yakalar
 *      (`unhandledrejection`), konsola yazar ve sahibine "yeniden dene" der.
 *      Böylece oyun ÇÖKMEZ.
 *
 * Öncelik kuralı: cadde sahnesi `PROTECTED_PRIORITY`dir ve ASLA bırakılmaz.
 */

import type * as THREE from "three";

/** Gerçek sahnede kullanılacak bağlam ayarı (denemeyle seçilir). */
export type WebglPowerPreference = "high-performance" | "default";

/** Bu öncelik ve üstü bağlamlar (`releaseExpendableContext`) ASLA bırakılmaz. */
export const PROTECTED_PRIORITY = 100;

/* ─────────────────────────── 1) DENEME (probe) ───────────────────────────
 * Bu ayarla bir bağlam açılabiliyor mu? Deneme bağlamı HEMEN bırakılır
 * (`WEBGL_lose_context`) — boşuna bağlam tutup sınırı zorlamayalım.
 */
export function probe(powerPreference: WebglPowerPreference): boolean {
  if (typeof document === "undefined" || !document.createElement) return false;
  try {
    const canvas = document.createElement("canvas");
    const options = { powerPreference, failIfMajorPerformanceCaveat: false };
    const context = (canvas.getContext("webgl2", options) ??
      canvas.getContext("webgl", options)) as WebGLRenderingContext | null;
    const lose = context?.getExtension?.("WEBGL_lose_context") as
      | { loseContext?: () => void }
      | null
      | undefined;
    lose?.loseContext?.();
    return !!context;
  } catch {
    return false;
  }
}

/** Kısa yol: varsayılan ayarla bağlam açılabiliyor mu? */
export function canCreateWebglContext(): boolean {
  return probe("default");
}

/* ──────────────────── 2) AÇIK BAĞLAMLARIN KAYIT DEFTERİ ─────────────────── */

interface ManagedContext {
  gl: THREE.WebGLRenderer;
  element: HTMLCanvasElement;
  /** Küçük = feda edilmesi daha kolay. Cadde `PROTECTED_PRIORITY`dir. */
  priority: number;
}

const managed: ManagedContext[] = [];

/** Bu renderer'ı "açık bağlamlar" defterine yaz. */
export function registerCanvasContext(
  gl: THREE.WebGLRenderer,
  priority = 10,
): void {
  if (!gl) return;
  if (managed.some((m) => m.gl === gl)) return;
  managed.push({ gl, element: gl.domElement, priority });
}

/** Defterden düş (bağlamı bırakmadan). */
export function unregisterCanvasContext(gl: THREE.WebGLRenderer): void {
  const index = managed.findIndex((m) => m.gl === gl);
  if (index >= 0) managed.splice(index, 1);
}

/**
 * Bağlamı HEMEN bırak: GPU belleği ve "bağlam yuvası" serbest kalır.
 * Sıra önemlidir — `dispose()` tek başına bağlamı serbest BIRAKMAZ.
 */
export function releaseCanvasContext(gl: THREE.WebGLRenderer): void {
  unregisterCanvasContext(gl);
  try {
    gl.forceContextLoss?.();
    gl.dispose?.();
    const element = gl.domElement;
    if (element) {
      element.width = 0;
      element.height = 0;
    }
  } catch {
    /* bağlam zaten ölmüşse sorun değil */
  }
}

/**
 * Sıradaki EN UCUZ (en düşük öncelikli, korunmayan) bağlamı bırak.
 * Yer açıldıysa `true` döner.
 */
export function releaseExpendableContext(): boolean {
  let victim: ManagedContext | null = null;
  for (const entry of managed) {
    if (entry.priority >= PROTECTED_PRIORITY) continue;
    if (!victim || entry.priority < victim.priority) victim = entry;
  }
  if (!victim) return false;
  // Feda edilen sahne boşta kalır: bunu GÖRÜNÜR kıl ki "neden karardı?"
  // sorusu sessizce geçiştirilmesin.
  console.warn(
    "[webgl] Bağlam yuvası dolu — en ucuz sahne feda ediliyor (priority",
    victim.priority,
    ")",
  );
  releaseCanvasContext(victim.gl);
  return true;
}

/* ───────── 3) SÖKÜLÜRKEN BIRAKMA (StrictMode'a dayanıklı) ─────────
 * NEDEN GECİKMELİ: geliştirme modunda React (StrictMode) aynı canvas'ı hemen
 * yeniden kurar. Bağlamı senkron bırakırsak yeni renderer ÖLÜ bağlam alır
 * (bir canvas'a ikinci kez `getContext` çağrısı aynı — artık kayıp — bağlamı
 * döndürür). Bu yüzden bırakma kısa bir süre geciktirilir ve canvas yeniden
 * kurulursa iptal edilir.
 */
const pendingRelease = new WeakMap<HTMLCanvasElement, number>();

export function scheduleCanvasRelease(
  gl: THREE.WebGLRenderer,
  delayMs = 400,
): void {
  const element = gl.domElement;
  if (!element || typeof window === "undefined") {
    releaseCanvasContext(gl);
    return;
  }
  const pending = pendingRelease.get(element);
  if (pending !== undefined) window.clearTimeout(pending);
  const id = window.setTimeout(() => {
    pendingRelease.delete(element);
    releaseCanvasContext(gl);
  }, delayMs);
  pendingRelease.set(element, id);
  // Sahnede artık yok: acil yer gerekirse bu bağlam sayılmaz.
  unregisterCanvasContext(gl);
}

/** Aynı canvas yeniden kuruldiyse bekleyen bırakmayı iptal et. */
export function cancelScheduledRelease(element: HTMLCanvasElement): void {
  const pending = pendingRelease.get(element);
  if (pending === undefined) return;
  window.clearTimeout(pending);
  pendingRelease.delete(element);
}

/** Kaç bağlam defterde duruyor? (teşhis/kontrol için) */
export function managedContextCount(): number {
  return managed.length;
}

/* ─────────────────────── 4) AYAR SEÇİMİ (powerPreference) ───────────────── */

let cached: WebglPowerPreference | null = null;

/**
 * Yeni bir bağlam hangi `powerPreference` ile açılmalı? `null` → açılamıyor.
 *
 * Önce `default` denenir (sakin iç mekânlar için yeterli ve en uyumlu; cadde
 * bağlamı `high-performance` tuttuğu için bazı mobil GPU'larda ikinci bir
 * `high-performance` bağlam reddedilir), olmazsa `high-performance` denenir.
 * İkisi de olmazsa feda edilebilir bir bağlam bırakılıp YENİDEN denenir.
 */
export function webglPowerPreference(): WebglPowerPreference | null {
  if (cached) return cached;
  if (typeof document === "undefined" || !document.createElement) return null;
  if (probe("default")) return (cached = "default");
  if (probe("high-performance")) return (cached = "high-performance");
  if (releaseExpendableContext()) {
    if (probe("default")) return (cached = "default");
    if (probe("high-performance")) return (cached = "high-performance");
  }
  return null;
}

/* ─────────────────── 5) ASENKRON BAĞLAM HATALARI (supap) ───────────────────
 * `@react-three/fiber` sahneleri ASENKRON kurar (`configure()`): orada çıkan
 * bir hata React hata sınırına UĞRAMAZ, "unhandled rejection" olarak sayfaya
 * düşer ve oyunun tamamını düşürür (mobilde görülen
 * `Error creating WebGL context`). Bu supap o redi yakalar, konsola yazar ve
 * dinleyenlere (bkz. `WebglCanvas.useWebglRetry`) haberi verir.
 */

type FailureListener = () => void;

const failureListeners = new Set<FailureListener>();
let watchedCanvases = 0;
let failureGuardInstalled = false;

function installFailureGuard(): void {
  if (failureGuardInstalled) return;
  if (typeof window === "undefined" || !window.addEventListener) return;
  failureGuardInstalled = true;
  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    if (watchedCanvases === 0) return; // hiç 3D sahne yok → bize ait değil
    const reason = event.reason as { message?: string } | string | undefined;
    const message =
      typeof reason === "string" ? reason : (reason?.message ?? "");
    if (!/webgl context/i.test(message)) return;
    event.preventDefault?.();
    console.warn(
      "[webgl] Bağlam kurulamadı — kurtarma devrede (sahne yeniden denenecek):",
      message,
    );
    for (const listener of [...failureListeners]) listener();
  });
}

/**
 * Bağlam kurulumunu izlemeye başla. Dönen fonksiyon izlemeyi bırakır.
 * Abonelik boyunca gelen "WebGL context" redleri `onFail`e dönüşür.
 */
export function watchCanvasFailures(onFail: FailureListener): () => void {
  installFailureGuard();
  failureListeners.add(onFail);
  watchedCanvases += 1;
  return () => {
    failureListeners.delete(onFail);
    watchedCanvases = Math.max(0, watchedCanvases - 1);
  };
}
