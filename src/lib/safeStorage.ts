import type { TokenStorage } from "@convex-dev/auth/react";

/**
 * WebView/APK notu: bazı Android WebView yapılandırmalarında — özellikle
 * `file://` ile açılan paketlerde, gizli modda ya da depolaması kapatılmış
 * uygulamalarda — `window.localStorage`'a ERİŞMEK bile istisna atar
 * ("SecurityError: The operation is insecure"). `@convex-dev/auth` oturum
 * token'larını varsayılan olarak localStorage'a yazar; bu istisna kimlik
 * doğrulama akışını bozar ve APK'da uygulamayı çökertir.
 *
 * Bu sarmalayıcı depolamayı DENEMEKLE sınırlar: erişilemiyorsa bellekte
 * tutulan bir yedeğe düşer, hiçbir zaman istisna sızdırmaz. Bellek yedeği
 * uygulama açık kaldığı sürece oturumu korur (APK için yeterli: Android
 * WebView zaten oturum boyunca yaşar).
 */

const memory = new Map<string, string>();

function openBrowserStorage(): Storage | null {
  try {
    const store = window.localStorage;
    // Yazma iznini de dene: bazı WebView'larda nesne vardır ama yazma atar.
    const probe = "__vaelos_storage_probe__";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

const backing = typeof window === "undefined" ? null : openBrowserStorage();

/** Kalıcı depolama gerçekten çalışıyor mu? (APK teşhisi / güvenli yedek kararı) */
export const storagePersistent = backing !== null;

export function safeGetItem(key: string): string | null {
  try {
    if (backing) {
      const value = backing.getItem(key);
      if (value !== null) return value;
    }
  } catch {
    /* erişim yazma sırasında düşerse bellek yedeğine in */
  }
  return memory.get(key) ?? null;
}

export function safeSetItem(key: string, value: string): void {
  // Bellek yedeği ÖNCE yazılır: depolama reddetse bile bu oturumda okunur.
  memory.set(key, value);
  try {
    backing?.setItem(key, value);
  } catch {
    /* kalıcı yazma reddedildi — bellek yedeği yeterli */
  }
}

export function safeRemoveItem(key: string): void {
  memory.delete(key);
  try {
    backing?.removeItem(key);
  } catch {
    /* yok sayılır */
  }
}

/**
 * `@convex-dev/auth` için TokenStorage: oturum token'ları mobil WebView'da da
 * güvenle okunup yazılabilsin. `ConvexAuthProvider`'a `storage` olarak verilir.
 */
export const authTokenStorage: TokenStorage = {
  getItem: (key) => safeGetItem(key),
  setItem: (key, value) => {
    safeSetItem(key, value);
  },
  removeItem: (key) => {
    safeRemoveItem(key);
  },
};
