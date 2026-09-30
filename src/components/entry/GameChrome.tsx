import { Swords } from "lucide-react";
import type { ReactNode } from "react";

/**
 * MOBİL OYUN ARAYÜZÜ — ortak kabuk parçaları.
 *
 * Ana sayfa, giriş/kayıt ekranı ve iki yükleme ekranı (oyun girişi + cadde)
 * AYNI görsel dili paylaşsın diye karanlık "rift" arka planı, üst şerit ve alt
 * şerit burada tek yerde tanımlanır. Ekranlar yalnızca ORTA içeriklerini
 * farklılaştırır; böylece cep telefonunda tam ekran, konsol/masaüstünde ise
 * ortalanmış telefon benzeri bir sütun olarak tutarlı görünür.
 *
 * Tüm animasyon sınıfları `src/index.css` içindedir (`entry-*`, `battle-load-*`)
 * ve bu projede zaten kullanılıyor — burada yeni stil uydurulmaz.
 */

/** Karanlık arka plan katmanları: ızgara, ışınlar, tarama çizgisi. */
export function GameBackdrop({ grid = 0.7 }: { grid?: number }) {
  return (
    <>
      <div
        className="entry-grid pointer-events-none absolute inset-0"
        style={{ opacity: grid }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(224,178,92,0.10)_0%,transparent_58%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_28%,rgba(2,4,10,0.92)_100%)]" />
      <div className="entry-beam pointer-events-none absolute -top-24 left-1/4 h-[130%] w-24 -rotate-6 bg-gradient-to-b from-amber-300/25 via-transparent to-transparent blur-2xl" />
      <div
        className="entry-beam pointer-events-none absolute -top-24 right-1/4 h-[130%] w-16 rotate-6 bg-gradient-to-b from-sky-300/20 via-transparent to-transparent blur-2xl"
        style={{ animationDelay: "1.2s" }}
      />
      <div className="battle-load-scan pointer-events-none absolute inset-x-0 top-0 h-20" />
    </>
  );
}

/**
 * Üst şerit — sol tarafta oyun arması ve adı, sağ tarafta verilen içerik
 * (oyuncu kartı, hesap düğmesi, dil/ses…). Güvenli alan (çentik) boşlukları
 * `env(safe-area-inset-*)` ile korunur.
 */
export function GameHeader({
  right,
  subtitle = "Sezon 1 • Mobil & Web",
  title = "VAELOS",
}: {
  right?: ReactNode;
  subtitle?: string;
  title?: string;
}) {
  return (
    <header
      className="relative z-10 flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-8 sm:py-5"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 text-lg shadow-[0_0_22px_rgba(224,178,92,0.45)]">
          ⚔️
        </span>
        <div className="min-w-0 leading-none">
          <p className="truncate text-lg font-black tracking-widest">
            {title}
          </p>
          <p className="mt-1 truncate text-[9px] font-extrabold uppercase tracking-[0.28em] text-amber-300/80">
            {subtitle}
          </p>
        </div>
      </div>
      {right}
    </header>
  );
}

/** Alt şerit — stüdyo imzası ve platform bilgisi. */
export function GameFooter({ note }: { note?: string }) {
  return (
    <footer
      className="relative z-10 flex shrink-0 items-center justify-between gap-3 px-4 pb-3 text-[9px] font-extrabold uppercase tracking-[0.22em] text-white/25 sm:px-8 sm:pb-5"
      style={{
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      <span>⚙️ Vaelos Games</span>
      <span className="hidden sm:inline">{note ?? "Sürüm 3.0"}</span>
      <span>APK • WEB</span>
    </footer>
  );
}

/**
 * Altıgen "rift kapısı" paneli — yükleme ekranındaki 3D karakterin ve ana
 * sayfadaki karakter vitrininin çerçevesi. İçine verilen içerik `overflow-hidden`
 * bir altıgenin içinde çizilir.
 */
export function HexGate({
  children,
  className,
  showSweep = true,
}: {
  children?: ReactNode;
  className?: string;
  showSweep?: boolean;
}) {
  return (
    <div className={`entry-gate relative ${className ?? ""}`}>
      <div className="entry-hex absolute inset-0 bg-gradient-to-b from-amber-200/80 via-amber-500/35 to-amber-800/70" />
      <div className="entry-hex absolute inset-[2px] bg-[#070b15]" />
      <div className="entry-hex absolute inset-[3px] overflow-hidden bg-gradient-to-b from-[#0b1324] via-[#070b15] to-[#04060d]">
        {children}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(5,7,15,0.85),transparent_55%)]" />
      </div>
      {showSweep && (
        <div className="entry-hex pointer-events-none absolute inset-[3px] overflow-hidden">
          <div className="entry-sweep absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-amber-100/25 to-transparent" />
        </div>
      )}
      <div className="entry-hex pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgba(224,178,92,0.22),transparent_60%)]" />
    </div>
  );
}

/**
 * Dönen rün halkaları — `HexGate`ın arkasına serilir. Yükleme ekranında olduğu
 * gibi ana sayfada da karakterin arkasında döner.
 */
export function RuneHalo() {
  return (
    <>
      <div className="entry-rune entry-rune-ring pointer-events-none absolute rounded-full border-4 border-dashed border-amber-400/20" />
      <div className="entry-rune-rev entry-rune-ring-sm pointer-events-none absolute rounded-full border-2 border-dotted border-sky-300/25" />
      <div className="entry-glow entry-glow-ring pointer-events-none absolute rounded-full bg-amber-400/25 blur-3xl" />
    </>
  );
}

/**
 * Altıgen panelin içinde, 3D sahne yerine kullanılan arma: yükleme sırasında
 * ikinci bir WebGL bağlamı açmadan aynı "oyun kapısı" hissini verir.
 */
export function CrestEmblem({ label }: { label?: string }) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-3">
      <Swords
        className="battle-load-float size-14 text-amber-300 drop-shadow-[0_0_26px_rgba(224,178,92,0.75)] sm:size-16"
        strokeWidth={1.6}
      />
      {label && (
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-200/80">
          {label}
        </p>
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_115%,rgba(224,178,92,0.35),transparent_62%)]" />
    </div>
  );
}
