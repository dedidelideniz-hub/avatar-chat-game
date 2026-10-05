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

/**
 * GERÇEK SAHNENİN KULLANACAĞI `powerPreference` — en son BAŞARILI denemeden.
 *
 * NEDEN GEREKLİ: kapı (`useCanvasGate`) `default` ile deneyip BAŞARILI olunca
 * "hazır" der; ama `@react-three/fiberı`in `<Canvas>`ı varsayılan olarak
 * `high-performance` ister. `default` açılabilirken `high-performance`
 * reddedilen cihazlarda (yazılımsal/headless GPU) kapı geçilir, sonra R3F
 * `configure()` reddeder → "Error creating WebGL context". Bu değer denemenin
 * DOĞRULADIĞI ayarı tüm sahnelerin `<Canvas gl={{ powerPreference }}`ına verir.
 */
let verifiedPower: WebglPowerPreference = "default";

/** Denemeyle DOĞRULANMIŞ bağlam ayarı (kapı geçildikten sonra günceldir). */
export function verifiedPowerPreference(): WebglPowerPreference {
  return verifiedPower;
}

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
    if (context) verifiedPower = powerPreference;
    lose?.loseContext?.();
    // Boyutları SIFIRLA: `loseContext` bağlamı kayıp işaretler ama çizim
    // tamponu (GPU belleği + bağlam yuvası) hemen boşalmayabilir. `releaseCanvasContext` ile
    // aynı numara — deneme bağlamı, gerçek sahne kurulmadan ÖNCE tamamen
    // bırakılsın ki "deneme + sahne" aynı anda iki yuva tutmasın (mobilde
    // `Error creating WebGL context` bunun yüzünden çıkıyordu).
    canvas.width = 0;
    canvas.height = 0;
    // Yuva zamanlayıcısını işle: denemenin tuttuğu yuva da bir "bırakma"dır,
    // gerçek canvas ondan hemen sonra kurulmamalıdır (`webglContextSlotDelay`).
    markContextReleased();
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

/* ────── BAĞLAM YUVASI ZAMANLAYICISI (yarışın kökü) ──────
 * Bağlam bırakma SENKRON DEĞİLDİR: `forceContextLoss()` / `loseContext()`
 * yuvayı işaretler ama tarayıcı yuvayı bir sonraki görevde boşaltır. Bu arada
 * yeni bir canvas kurulursa cihaz, "üçüncü bağlam" istenmiş gibi görür ve
 * `THREE.WebGLRenderer: Error creating WebGL context.` ile reddeder. Bu hata
 * `@react-three/fiber`ın ASENKRON `configure()`ından geldiği için React hata
 * sınırına UĞRAMAZ.
 *
 * Bu yüzden bırakmalar zaman damgasıyla işlenir ve YENİ canvas'lar
 * `webglContextSlotDelay()` kadar bekletilir (`WebglCanvas.useCanvasGate`).
 * Rota geçişlerinde (giriş → cadde → oda) eski sahnenin canvas'ı bu yüzden
 * "hâlâ açık" görünüyordu — hatanın asıl kaynağı buydu.
 */
let lastReleaseAt = 0;

/** Bırakma işleminden sonra yuvanın oturması için beklenen süre (ms). */
export const CONTEXT_SETTLE_MS = 220;

/**
 * ARDIŞIK CANVAS'LAR ARASINDAKİ PAY (ms).
 *
 * Aynı anda birden çok sahne kurulunca (cadde + oda + avatar; ya da oda
 * açılırken yedek oda avatarı) hepsi TEK görevde bağlam ister ve cihaz
 * isteklerin bir kısmını reddeder. Sıralı bir yerleşim kuyruğu, her yeni
 * canvas'ı bir öncekinden `CONTEXT_STAGGER_MS` kadar sonra kurar; bağlam
 * istekleri böylece TIRMANMAZ, teker teker açılır.
 */
export const CONTEXT_STAGGER_MS = 140;

/** Bir sonraki canvas'ın kurulabileceği en erken an (yerleşim kuyruğu). */
let nextSlotAt = 0;

/**
 * Yeni bir `<Canvas>` için sıra al: KAÇ ms beklenmeli? (`setTimeout` ile).
 *
 * Hem son bırakmanın oturmasını (`webglContextSlotDelay`) hem de AYNI ANDA
 * kurulmaya çalışan diğer sahnelerin payını (`nextSlotAt`) hesaba katar. Her
 * çağrı kuyruğu bir adım ileri taşır — böylece beş sahne aynı karede bağlam
 * istemek yerine sırayla ister (mobildeki `Error creating WebGL context`
 * redlerinin bir kaynağı buydu).
 */
export function reserveContextSlot(): number {
  const now = Date.now();
  const wait = Math.max(32, webglContextSlotDelay() + 32, nextSlotAt - now);
  nextSlotAt = now + wait + CONTEXT_STAGGER_MS;
  return wait;
}

/** Bir bağlamın (veya denemenin) bırakıldığını işaretle. */
function markContextReleased(): void {
  lastReleaseAt = Date.now();
}

/**
 * Yeni bir `<Canvas>` kurmadan ÖNCE beklenmesi gereken süre (ms).
 * Son bırakmanın üzerinden `CONTEXT_SETTLE_MS` geçmediyse kalan süreyi verir.
 */
export function webglContextSlotDelay(): number {
  if (lastReleaseAt === 0) return 0;
  const since = Date.now() - lastReleaseAt;
  return since >= CONTEXT_SETTLE_MS ? 0 : CONTEXT_SETTLE_MS - since;
}

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
  markContextReleased();
  // Bağlam yükü değişti: "hangi powerPreference açılabiliyor?" cevabı artık
  // bayat olabilir, bir sonraki kurulumda yeniden ölçülür.
  cached = null;
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
  delayMs = 50,
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
 *
 * ⚠️ ÖNBELLEKLİDİR: yalnızca `<Canvas>`ın `gl` ayarını beslemek için kullanılır
 * (kapı geçildikten SONRA çalışır). Kapının "şu an bağlam açılabiliyor mu?"
 * sorusunu bununla sormak YETMEZ — önbellek, ilk sahne kurulduktan sonra hep
 * dolu kalır ve yuva dolu olsa bile yeni canvas'ı kurmaya izin verir
 * (bkz. `probeWebglContext`).
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

/**
 * KAPININ CANLI ÖLÇÜMÜ — önbelleği KULLANMAZ.
 *
 * NEDEN GEREKLİ: `useCanvasGate` yeni bir `<Canvas>` kurmadan önce "bağlam
 * açılabiliyor mu?" diye sorar. Bu soruyu önbellekli `webglPowerPreference()`
 * ile sormak SESSİZ bir delik bırakıyordu: önbellek bir kez dolduğunda
 * (ilk 3D sahne kurulduğunda) kapı hep "hazır" der, oysa o anda yuva dolu
 * olabilir. Örnek: oyuncu caddeyi gezip eve girerken oda canvas'ı istenir;
 * cadde bağlamı + oda bağlamı + yedek odanın avatar bağlamı cihazın sınırını
 * aşarsa `configure()` `THREE.WebGLRenderer: Error creating WebGL context.`
 * fırlatır. R3F bu reddi yakalamaz (`.catch` yok) → "unhandled rejection"
 * olur ve önizleme "Build Error" olarak düşer.
 *
 * Bu fonksiyon HER ÇAĞRIDA gerçek bir deneme bağlamı açar ve hemen bırakır;
 * açılamıyorsa feda edilebilir bir bağlamı bırakıp BİR KEZ daha dener. `null`
 * dönerse çağıran taraf (`useCanvasGate`) yedeğe düşer ve `configure()` HİÇ
 * çalıştırılmaz — yani hata hiç doğmaz.
 */
export function probeWebglContext(): WebglPowerPreference | null {
  if (typeof document === "undefined" || !document.createElement) return null;
  // Önbelleği tazele: sahne sayısı değiştiği için eski cevap bayat olabilir.
  cached = null;
  if (probe("default")) return (cached = "default");
  if (probe("high-performance")) return (cached = "high-performance");
  // Yuva dolu olabilir: en ucuz (korunmayan) sahneyi feda edip yeniden dene.
  // Cadde `PROTECTED_PRIORITY` olduğu için oyuncunun yürüdüğü sahne ASLA
  // düşürülmez; feda edilen bağlam kendini yeniden kurar (`useWebglRetry`).
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
let failureGuardInstalled = false;

function installFailureGuard(): void {
  if (failureGuardInstalled) return;
  if (typeof window === "undefined" || !window.addEventListener) return;
  failureGuardInstalled = true;
  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const reason = event.reason as { message?: string } | string | undefined;
    const message =
      typeof reason === "string" ? reason : (reason?.message ?? "");
    if (!/webgl context/i.test(message)) return;
    // `configure()` reddi HİÇBİR ZAMAN sayfaya düşmemeli: dinleyen sahne varsa
    // o yeniden dener, yoksa bile sayfa yaşar (geliştirme katmanı bu reddi
    // "build error" olarak göstermesin diye işaretlenir).
    event.preventDefault?.();
    console.warn(
      "[webgl] Bağlam kurulamadı — kurtarma devrede (sahne yeniden denenecek):",
      message,
    );
    for (const listener of [...failureListeners]) listener();
  });
}

/**
 * Supabı UYGULAMA AÇILIŞINDA kur (`main.tsx`).
 *
 * `watchCanvasFailures` supabı zaten tembelce kurar; ama o gecikme, 3D sahnenin
 * HİÇ aboneliği olmadığı anlarda (ör. giriş ekranı) gelen reddin sayfaya
 * düşmesine yetebiliyordu. Açılışta kurmak bu pencereyi tamamen kapatır ve
 * "Error creating WebGL context" bir daha ASLA `unhandledrejection` olarak
 * dışarı çıkmaz.
 */
export function ensureWebglFailureGuard(): void {
  installFailureGuard();
}

/**
 * Bağlam kurulumunu izlemeye başla. Dönen fonksiyon izlemeyi bırakır.
 * Abonelik boyunca gelen "WebGL context" redleri `onFail`e dönüşür.
 */
export function watchCanvasFailures(onFail: FailureListener): () => void {
  installFailureGuard();
  failureListeners.add(onFail);
  return () => {
    failureListeners.delete(onFail);
  };
}
