import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, RefreshCw, Swords } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

/**
 * Korumalı rota sarmalayıcısı.
 *
 * Hesap durumu öğrenilirken oyuncuya ana sayfa / oyun girişi / yükleme
 * ekranlarıyla AYNI karanlık "rift" ekranı gösterilir — böylece korumalı bir
 * sayfaya girerken araya beyaz bir ekran sıkışmaz. Giriş yapılmamışsa amaçlanan
 * yol (`returnTo`) korunarak `/auth`a gönderilir; giriş sonrası oyuncu tam
 * olarak gitmek istediği sayfaya döner.
 *
 * 🛡️ APK/WebView dayanıklılığı: mobilde ağ el değiştirirken ya da uygulama
 * arka plandan dönerken kimlik sorgusu HİÇ sonuçlanmayabiliyordu — ekran
 * sonsuza kadar "Hesap doğrulanıyor"da kalıp uygulama düşüyordu. Artık
 * yükleme uzarsa oyuncuya "Yeniden Dene" gösterilir ve 8 sn sonunda akış
 * anonim (konuk) oturuma düşerek devam eder.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const {
    isLoading,
    isAuthenticated,
    stalled,
    guestFallbackDue,
    signInAsGuest,
  } = useAuth();
  const location = useLocation();
  const [guestError, setGuestError] = useState<string | null>(null);
  const guestAttempted = useRef(false);

  // ⚠️ Korunmuş sayfa BİR KEZ çözüldükten sonra, hesap sorgusu kısa süreliğine
  // `undefined`'a dönse bile (Convex yeniden bağlanırken veya WebView arka
  // plandan dönerken OLUR) yükleme ekranına DÜŞME. Aksi halde altındaki sayfa
  // (ör. `World`) sökülüp yeniden monte edilir ve kendi yükleme durumu —
  // "cadde kapısı" — baştan başlar. Mobilde dalgalı ağda bu döngü caddeyi
  // kalıcı olarak "%14 · Kimlik doğrulanıyor"da bırakabiliyordu.
  const settled = useRef(false);
  if (!isLoading) settled.current = true;

  // 🔑 Konuk (anonim) oturuma düş: kimlik akışı zaman aşımına uğrarsa
  //    çökmek/kilitlenmek yerine misafir olarak devam et.
  const tryGuestSession = useCallback(async () => {
    setGuestError(null);
    try {
      await signInAsGuest();
      return true;
    } catch (error) {
      console.warn("[Vaelos] konuk girişi başarısız:", error);
      setGuestError(
        error instanceof Error
          ? error.message
          : "Misafir girişi başarısız oldu.",
      );
      return false;
    }
  }, [signInAsGuest]);

  useEffect(() => {
    if (!guestFallbackDue || guestAttempted.current || isAuthenticated) return;
    guestAttempted.current = true;
    void tryGuestSession();
  }, [guestFallbackDue, isAuthenticated, tryGuestSession]);

  const handleRetry = useCallback(() => {
    void tryGuestSession().then((ok) => {
      // Konuk oturum da kurulamadıysa sayfayı tazele: yeni bir Convex
      // el sıkışması, ölü soketle takılı kalan oturumu kurtarabilir.
      if (!ok) window.location.reload();
    });
  }, [tryGuestSession]);

  if (isLoading && !settled.current) {
    return (
      <main className="relative flex min-h-[100dvh] flex-col items-center justify-center gap-4 overflow-hidden bg-[#05070f] text-white">
        <div className="entry-grid pointer-events-none absolute inset-0 opacity-60" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(224,178,92,0.10)_0%,transparent_58%)]" />
        <div className="relative flex items-center gap-3">
          <Swords className="size-5 text-amber-300" strokeWidth={1.8} />
          <span className="text-lg font-black tracking-[0.22em]">VAELOS</span>
        </div>
        <p className="relative flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.32em] text-white/45">
          <Loader2 className="size-3.5 animate-spin text-amber-300/80" />
          Hesap doğrulanıyor
        </p>
        {stalled && (
          <div className="relative flex w-full max-w-xs flex-col items-center gap-2 px-6">
            <p className="text-center text-[11px] font-semibold leading-5 text-white/50">
              Bağlantı beklenenden uzun sürdü. Misafir olarak devam edebilirsin.
            </p>
            <Button
              type="button"
              onClick={handleRetry}
              className="h-11 w-full rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 text-sm font-black tracking-wide text-[#22160a] hover:from-amber-200 hover:to-orange-400"
            >
              <RefreshCw className="size-4" />
              Yeniden Dene
            </Button>
            {guestError && (
              <p className="text-center text-[10px] font-semibold leading-4 text-red-300/80">
                {guestError}
              </p>
            )}
          </div>
        )}
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }

  return children;
}
