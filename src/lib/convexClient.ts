import { ConvexReactClient } from "convex/react";

/**
 * Derlenmiş (üretim) Convex dağıtımının adresi.
 *
 * NEDEN GEREKLİ: APK içinde çalışan WebView, `import.meta.env.VITE_CONVEX_URL`
 * derleme sırasında yerine konmamışsa (ör. paketleme ayrı bir araçla
 * yapıldığında) `undefined` alır; `new ConvexReactClient(undefined)` ise
 * senkron olarak istisna atar ve uygulama DAHA İLK KAREDE çöker — kullanıcı
 * yükleme ekranında "%18 · Kimlik doğrulanıyor" görüp uygulamadan atılır.
 * Bu yedek, adres eksik/geçersizse uygulamanın yine de bağlanmasını sağlar.
 */
export const FALLBACK_CONVEX_URL = "https://canny-newt-345.convex.cloud";

/** Boş/bozuk adresi yedeğe düşürür; geçerliyse sondaki eğik çizgileri temizler. */
export function resolveConvexUrl(raw: string | null | undefined): string {
  const url =
    typeof raw === "string" ? raw.trim().replace(/\/+$/, "") : "";
  // Yalnızca gerçek http(s) adresleri kabul edilir: WebView'da `undefined`
  // ya da iç içe geçmiş boş dize (" ") en sık görülen iki hata.
  return /^https?:\/\/\S+$/i.test(url) ? url : FALLBACK_CONVEX_URL;
}

/**
 * APK/WebView uyumlu Convex istemcisi.
 *
 * - `skipConvexDeploymentUrlCheck`: adres kontrolü yalnızca `*.convex.cloud`
 *   kalıbını kabul eder; mobil paketlemede adres bir vekil/özel alan adına
 *   dönüşürse istemci hiç kurulmaz ve uygulama çöker. Mobil uyum için kontrol
 *   atlanır (adres zaten yukarıda doğrulanıyor).
 * - `unsavedChangesWarning: false`: bu uyarı `window.onbeforeunload` kullanır;
 *   Android WebView'da sayfa kapatma onayı yerel (native) köprüyü kilitleyip
 *   uygulamayı düşürebiliyor.
 */
export function createConvexClient(
  raw: string | null | undefined,
): ConvexReactClient {
  const options = {
    skipConvexDeploymentUrlCheck: true,
    unsavedChangesWarning: false,
  } as const;

  try {
    return new ConvexReactClient(resolveConvexUrl(raw), options);
  } catch (error) {
    console.error(
      "[Vaelos] Convex istemcisi asıl adresle kurulamadı, yedeğe düşülüyor:",
      error,
    );
    return new ConvexReactClient(FALLBACK_CONVEX_URL, options);
  }
}
