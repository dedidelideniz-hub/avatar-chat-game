/**
 * Zaman aşımı yardımcıları.
 *
 * NEDEN GEREKLİ: mobil WebView'da ağ istekleri bazen HİÇ sonuçlanmaz — ne
 * başarı ne hata döner (ağ değişimi, uygulamanın arka plana atılması, ölü
 * soket). Bu durumda `await signIn(...)` sonsuza kadar bekler, yükleme ekranı
 * kilitlenir ve kullanıcı uygulamadan atılır. Bu yardımcı, sözü belirli bir
 * süre sonra reddederek akışın devam etmesini sağlar.
 */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(
      `${label} ${Math.max(1, Math.round(ms / 1000))} saniye içinde yanıt vermedi.`,
    );
    this.name = "TimeoutError";
  }
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

/** `promise` belirtilen süre içinde çözülmezse `TimeoutError` ile reddeder. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "İstek",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new TimeoutError(label, ms));
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Kimlik doğrulama istekleri için sabit zaman aşımı (5 sn). */
export const AUTH_TIMEOUT_MS = 5000;

/** "Kimlik doğrulanıyor" adımı bu süre içinde çözülmezse misafire düşülür. */
export const AUTH_GUEST_FALLBACK_MS = 8000;
