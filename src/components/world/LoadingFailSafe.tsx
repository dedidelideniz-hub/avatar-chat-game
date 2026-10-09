/**
 * 🧯 YÜKLEME KATMANI FAIL-SAFE KALKANI (Catch-All).
 *
 * AMAÇ: Uygulama HER NE OLURSA OLSUN AÇIK KALSIN. Yükleme ekranı görünürken
 * bir bileşen patlarsa ya da işlenmeyen bir söz reddi (unhandledrejection /
 * global error) yükselirse siyah ekran + uygulama atması YOK:
 *
 *   · `GateErrorBoundary` — yükleme katmanının en üstünü saran senkron sınır;
 *     çöküşü yakalayıp kırmızı kutuda `err.message` gösterir.
 *   · `useCrashShield` — render dışı kalan hatalar için global dinleyici.
 *   · İki yol da aynı kutuyu çizer: mesaj + "Çevrimdışı / Misafir Olarak
 *     Başlat" düğmesi. Düğme `vaelos:forceGuest=1` yazar ve sayfayı tazeler;
 *     bir sonraki açılışta kimlik akışı beklenmez, `World` kendi yerel mock
 *     konuk profiliyle (Guest_Mobile) caddeyi açar.
 */
import { Component, useEffect, useState, type ReactNode } from "react";
import { safeSetItem } from "@/lib/safeStorage";

/** "Misafir olarak başlat" bayrağı — `lib/guestProfile` okur. */
export const FORCE_GUEST_KEY = "vaelos:forceGuest";

/** Çevrimdışı/misafir modda başlat: bayrağı yaz ve taze bir açılış yap. */
export function startAsGuestOffline(): void {
  safeSetItem(FORCE_GUEST_KEY, "1");
  // Tam tazeleme: Convex soketleri ve React ağacı sıfırdan kurulur.
  window.location.reload();
}

function CrashBox({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#05070f] p-5">
      <div className="w-full max-w-sm rounded-3xl border-2 border-red-500/60 bg-red-950/70 p-5 shadow-2xl">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-red-300">
          ⚠️ Beklenmeyen hata
        </p>
        <p className="mt-2 max-h-32 overflow-y-auto break-words rounded-xl bg-black/50 p-3 text-xs font-semibold leading-5 text-red-100">
          {message}
        </p>
        <button
          type="button"
          onClick={startAsGuestOffline}
          className="mt-4 h-11 w-full rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 text-sm font-black tracking-wide text-[#22160a] active:scale-95"
        >
          🎭 Çevrimdışı / Misafir Olarak Başlat
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 h-10 w-full rounded-2xl border border-white/20 bg-white/10 text-xs font-bold text-white/80 active:scale-95"
        >
          Yeniden Dene
        </button>
      </div>
    </div>
  );
}

/**
 * Yükleme katmanının EN ÜSTÜNÜ saran catch-all sınırı: alttaki bileşenlerden
 * herhangi biri render sırasında fırlatırsa uygulama düşmez — kırmızı kutu
 * görünür ve oyuncu misafir olarak devam edebilir.
 */
export class GateErrorBoundary extends Component<
  { children: ReactNode },
  { message: string | null }
> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return {
      message:
        error instanceof Error
          ? error.message
          : String(error ?? "Bilinmeyen hata"),
    };
  }

  componentDidCatch(error: unknown) {
    console.error("[Vaelos] yükleme katmanı çöküşü yakalandı:", error);
  }

  render() {
    if (this.state.message) return <CrashBox message={this.state.message} />;
    return this.props.children;
  }
}

/**
 * Catch-all hata kalkanı: render DIŞINDA kalan hatalar (global `error` olayı
 * ve `unhandledrejection`) yakalanır ve mesajı döndürür. Mesaj kutuyu BİR KEZ
 * doldurur: ilk hata en önemlidir; ardışık gürültü ekranı doldurmasın.
 */
export function useCrashShield(): string | null {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      setMessage((prev) => prev ?? (event.message || "Bilinmeyen hata"));
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason: unknown = event.reason;
      setMessage(
        (prev) =>
          prev ??
          (reason instanceof Error
            ? reason.message
            : String(reason ?? "İşlenmeyen söz reddi")),
      );
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return message;
}

/** Kalkan mesajı varsa kutuyu çizer (yükleme ekranı görünürken). */
export function CrashShield({ message }: { message: string | null }) {
  return message ? <CrashBox message={message} /> : null;
}
