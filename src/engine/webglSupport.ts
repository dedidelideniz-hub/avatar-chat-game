/**
 * 🌐 WEBGL DESTEĞİ — yeni bir WebGL bağlamı açılabiliyor mu, hangi ayarla?
 *
 * NEDEN VAR: caddede ana sahne (`GameEngine3D`) zaten bir WebGL bağlamı tutar.
 * Odaya girerken açılan EK bağlamlar, cihazın bağlam/GPU sınırına takıldığında
 * `THREE.WebGLRenderer: Error creating WebGL context.` ile oyunu ÇÖKERTİYORDU
 * (mobilde görülen hata). Üç şey yapılır:
 *
 *   1. Bağlam gerçekten açılabiliyor mu — oda sahnesi kurulmadan ÖNCE denenir.
 *      Açılamıyorsa 3D sahne HİÇ kurulmaz; oda, kodla çizilen yedek odayla
 *      gösterilir (çökmek yerine düşer).
 *   2. `powerPreference` SEÇİLİR: cadde bağlamı `high-performance` ister; bazı
 *      mobil GPU'larda ikinci bir `high-performance` bağlam reddedilir. Oda
 *      önce `default` (sakin iç mekân için yeterli ve en uyumlu), olmazsa
 *      `high-performance` ile denenir — seçilen ayar gerçek sahneye AYNEN
 *      geçirilir (deneme ile sahne aynı şeyi ister).
 *
 *      Deneme, caddenin bağlamı AYAKTAYKEN yapılır: yani "cadde varken
 *      ikinci bağlam açılabiliyor mu?" sorusu doğrudan ölçülür.
 *   3. Deneme bağlamı hemen BIRAKILIR (`WEBGL_lose_context`) — boşuna bağlam
 *      tutup sınırı zorlamayalım; gerçek sahne birazdan açılacak.
 *
 * Ayrıca kural: odanın 3D sahnesi açıkken yedek oda AVATARINI çizmez
 * (`RoomStage` → `fallback({ avatar: false })`). Yani oda, caddeye tek bağlam
 * ekler: cadde + oda = 2.
 */

/** Gerçek sahnede kullanılacak bağlam ayarı (denemeyle seçilir). */
export type WebglPowerPreference = "high-performance" | "default";

let cached: WebglPowerPreference | null | undefined;

/** Bu ayarla bağlam açılabiliyor mu? (deneme bağlamı hemen bırakılır) */
function probe(powerPreference: WebglPowerPreference): boolean {
  try {
    const canvas = document.createElement("canvas");
    const context = (canvas.getContext("webgl2", {
      powerPreference,
      failIfMajorPerformanceCaveat: false,
    }) ??
      canvas.getContext("webgl", {
        powerPreference,
        failIfMajorPerformanceCaveat: false,
      })) as WebGLRenderingContext | null;
    const lose = context?.getExtension("WEBGL_lose_context") as
      | { loseContext?: () => void }
      | null
      | undefined;
    lose?.loseContext?.();
    return !!context;
  } catch {
    return false;
  }
}

/**
 * Odaya bağlam açılabiliyor mu, hangi `powerPreference` ile?
 * `null` → hiç açılamıyor (3D oda kurulmamalı). Sonuç oturum boyunca hatırlanır.
 */
export function webglPowerPreference(): WebglPowerPreference | null {
  if (cached !== undefined) return cached;
  if (typeof document === "undefined" || !document.createElement) {
    cached = null;
    return cached;
  }
  cached = probe("default")
    ? "default"
    : probe("high-performance")
      ? "high-performance"
      : null;
  return cached;
}

/** Kısa yol: 3D oda sahnesi kurulabilir mi? */
export function canCreateWebglContext(): boolean {
  return webglPowerPreference() !== null;
}

/* ─────────────────── SON EMNİYET SUPABI (bağlam hatası) ───────────────────
 * NEDEN GEREKLİ: `@react-three/fiber` sahneyi kurarken renderer'ı ASENKRON bir
 * fonksiyonda oluşturur (`configure()`); orada çıkan bir hata React hata
 * sınırına UĞRAMAZ, "unhandled rejection" olarak sayfaya düşer ve oyunun
 * tamamını düşürür (mobilde görülen `Error creating WebGL context`).
 *
 * Bu supap, oda sahnesi AÇIKKEN gelen WebGL bağlam hatalarını yakalar,
 * konsola yazar ve oda katmanına "sahneyi bırak, yedek odaya dön" der.
 * Oda sahnesi açık değilken hiçbir şeye karışmaz (başka hatalar gizlenmez).
 */

type FailureListener = () => void;

const failureListeners = new Set<FailureListener>();
let liveCanvases = 0;
let rejectionGuardInstalled = false;

function installRejectionGuard(): void {
  if (rejectionGuardInstalled) return;
  if (typeof window === "undefined" || !window.addEventListener) return;
  rejectionGuardInstalled = true;
  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    if (liveCanvases === 0) return; // oda sahnesi kapalı → bize ait değil
    const reason = event.reason as { message?: string } | string | undefined;
    const message =
      typeof reason === "string" ? reason : (reason?.message ?? "");
    if (!/webgl context/i.test(message)) return;
    event.preventDefault?.();
    console.warn(
      "[oda sahnesi] WebGL bağlamı kurulamadı — yedek odaya dönülüyor:",
      message,
    );
    for (const listener of failureListeners) listener();
  });
}

/**
 * Oda sahnesi kurulumunu izlemeye başla. Dönen fonksiyon izlemeyi bırakır.
 * Abonelik boyunca gelen "WebGL context" redleri `onFail`e dönüşür.
 */
export function watchRoomCanvasFailures(onFail: FailureListener): () => void {
  installRejectionGuard();
  failureListeners.add(onFail);
  liveCanvases += 1;
  return () => {
    failureListeners.delete(onFail);
    liveCanvases = Math.max(0, liveCanvases - 1);
  };
}
