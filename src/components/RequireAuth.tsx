import { useAuth } from "@/hooks/use-auth";
import { Loader2, Swords } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

/**
 * Korumalı rota sarmalayıcısı.
 *
 * Hesap durumu öğrenilirken oyuncuya ana sayfa / oyun girişi / yükleme
 * ekranlarıyla AYNI karanlık "rift" ekranı gösterilir — böylece korumalı bir
 * sayfaya girerken araya beyaz bir ekran sıkışmaz. Giriş yapılmamışsa amaçlanan
 * yol (`returnTo`) korunarak `/auth`a gönderilir; giriş sonrası oyuncu tam
 * olarak gitmek istediği sayfaya döner.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) {
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
