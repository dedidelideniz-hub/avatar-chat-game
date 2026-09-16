import { motion } from "framer-motion";
import { Check, Loader2, ShieldCheck, Star, Swords } from "lucide-react";
import type { ReactNode } from "react";

/** Giriş yüklemesinin adımları — sıraya göre yanar. */
export const ENTRY_STEPS = [
  "Kimlik doğrulanıyor",
  "Karakter modeli indiriliyor",
  "Lig verileri alınıyor",
  "Arena bağlantısı kuruluyor",
];

export interface EntryLoaderPlayer {
  name: string;
  rankName: string;
  rankIcon: string;
  rankGradient: string;
  vip: boolean;
  level: number;
}

/**
 * MOBA tarzı oyun girişi yükleme ekranı.
 *
 * Karanlık bir "rift kapısı": altıgen çerçevenin içinde oyuncunun gerçek 3D
 * karakteri (renk tonuyla) belirir, arkasında rün halkaları döner; altta
 * adım adım yanan bir yükleme çubuğu ve oyuncunun lig/üyelik kartı vardır.
 * Hem dikey (web/APK) hem yatay düzende çalışır.
 */
export function EntryLoader({
  pct,
  stepIndex,
  player,
  tip,
  stage,
}: {
  pct: number;
  stepIndex: number;
  player: EntryLoaderPlayer | null;
  tip: string;
  /** Hexagon panelin içine çizilen 3D sahne. */
  stage: ReactNode;
}) {
  const shown = Math.floor(pct);

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[#05070f] text-white">
      {/* ── arka plan katmanları ─────────────────────────────── */}
      <div className="entry-grid pointer-events-none absolute inset-0 opacity-70" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(224,178,92,0.10)_0%,transparent_58%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_28%,rgba(2,4,10,0.92)_100%)]" />
      <div className="entry-beam pointer-events-none absolute -top-24 left-1/4 h-[130%] w-24 -rotate-6 bg-gradient-to-b from-amber-300/25 via-transparent to-transparent blur-2xl" />
      <div
        className="entry-beam pointer-events-none absolute -top-24 right-1/4 h-[130%] w-16 rotate-6 bg-gradient-to-b from-sky-300/20 via-transparent to-transparent blur-2xl"
        style={{ animationDelay: "1.2s" }}
      />
      <div className="battle-load-scan pointer-events-none absolute inset-x-0 top-0 h-20" />

      {/* ── üst şerit: marka + oyuncu kartı ──────────────────── */}
      <header
        className="relative z-10 flex items-center justify-between gap-3 px-4 py-3 sm:px-8 sm:py-5"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 text-lg shadow-[0_0_22px_rgba(224,178,92,0.45)]">
            ⚔️
          </span>
          <div className="leading-none">
            <p className="text-lg font-black tracking-widest">VAELOS</p>
            <p className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.28em] text-amber-300/80">
              Sezon 1 • Mobil & Web
            </p>
          </div>
        </div>

        {player ? (
          <motion.div
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-sm"
          >
            <div className="hidden text-right sm:block">
              <p className="max-w-[130px] truncate text-xs font-extrabold">
                {player.name}
              </p>
              <p className="text-[10px] font-bold text-amber-300/90">
                {player.rankIcon} {player.rankName} • Sv. {player.level}
              </p>
            </div>
            <span
              className="flex size-9 items-center justify-center rounded-xl text-base shadow-md"
              style={{ background: player.rankGradient }}
              title={`${player.rankName} ligi`}
            >
              {player.rankIcon}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[9px] font-black tracking-wider ${
                player.vip
                  ? "bg-gradient-to-r from-amber-300 to-yellow-500 text-[#2a1d05]"
                  : "bg-white/10 text-white/70"
              }`}
            >
              {player.vip ? "VIP" : "STANDART"}
            </span>
          </motion.div>
        ) : (
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-bold text-white/60">
            <Loader2 className="size-3.5 animate-spin" />
            Hesap doğrulanıyor
          </div>
        )}
      </header>

      {/* ── orta: rift kapısı + ilerleme ────────────────────── */}
      <main className="entry-main relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-4 py-2">
        <div className="entry-stage relative flex shrink-0 items-center justify-center">
          {/* dönen rün halkaları */}
          <div className="entry-rune entry-rune-ring pointer-events-none absolute rounded-full border-4 border-dashed border-amber-400/20" />
          <div className="entry-rune-rev entry-rune-ring-sm pointer-events-none absolute rounded-full border-2 border-dotted border-sky-300/25" />
          <div className="entry-glow entry-glow-ring pointer-events-none absolute rounded-full bg-amber-400/25 blur-3xl" />

          {/* altıgen panel — içinde oyuncunun 3D karakteri */}
          <div className="entry-gate relative">
            <div className="entry-hex absolute inset-0 bg-gradient-to-b from-amber-200/80 via-amber-500/35 to-amber-800/70" />
            <div className="entry-hex absolute inset-[2px] bg-[#070b15]" />
            <div className="entry-hex absolute inset-[3px] overflow-hidden bg-gradient-to-b from-[#0b1324] via-[#070b15] to-[#04060d]">
              {stage}
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(5,7,15,0.85),transparent_55%)]" />
            </div>
            <div className="entry-hex pointer-events-none absolute inset-[3px] overflow-hidden">
              <div className="entry-sweep absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-amber-100/25 to-transparent" />
            </div>
            <div className="entry-hex pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgba(224,178,92,0.22),transparent_60%)]" />
          </div>
        </div>

        <div className="entry-side flex w-full flex-col items-center gap-4">
          <div className="text-center">
            <h1
              className="entry-headline battle-load-slam flex items-center justify-center gap-3 text-4xl font-black tracking-[0.16em] sm:text-5xl"
              style={{
                textShadow:
                  "0 0 26px rgba(224,178,92,0.55), 0 4px 0 rgba(9,13,24,0.95)",
              }}
            >
              <Swords className="size-7 shrink-0 text-amber-300 sm:size-9" />
              VAELOS
            </h1>
            <p className="mt-2 text-[10px] font-extrabold uppercase tracking-[0.4em] text-white/45 sm:text-[11px]">
              Savaş alanına bağlanılıyor
            </p>
          </div>

          {/* adım adım yanan yükleme adımları */}
          <div className="flex w-full max-w-2xl flex-wrap items-center justify-center gap-2">
            {ENTRY_STEPS.map((label, i) => {
              const done = i < stepIndex;
              const active = i === stepIndex;
              return (
                <span
                  key={label}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-extrabold tracking-wide transition-colors sm:text-[11px] ${
                    done
                      ? "border-amber-300/40 bg-amber-400/10 text-amber-200"
                      : active
                        ? "border-sky-300/50 bg-sky-400/10 text-sky-200"
                        : "border-white/10 bg-white/5 text-white/35"
                  }`}
                >
                  {done ? (
                    <span className="entry-tick">
                      <Check className="size-3" />
                    </span>
                  ) : active ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Star className="size-3 opacity-50" />
                  )}
                  {label}
                </span>
              );
            })}
          </div>

          {/* ilerleme çubuğu */}
          <div className="w-full max-w-xl">
            <div className="flex items-end justify-between text-[11px] font-extrabold tracking-wider">
              <span key={stepIndex} className="battle-load-step text-amber-200">
                {ENTRY_STEPS[Math.min(stepIndex, ENTRY_STEPS.length - 1)]}
              </span>
              <span className="tabular-nums text-base text-yellow-300">
                %{shown}
              </span>
            </div>
            <div className="mt-2 h-3.5 overflow-hidden rounded-full border border-white/15 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div
                className="battle-load-bar h-full rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 transition-[width] duration-200 ease-linear"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p
              key={tip}
              className="entry-tip mt-3 flex items-center justify-center gap-2 text-center text-[11px] font-bold text-white/50"
            >
              <ShieldCheck className="size-3.5 shrink-0 text-amber-300/70" />
              {tip}
            </p>
          </div>
        </div>
      </main>

      {/* ── alt şerit ────────────────────────────────────────── */}
      <footer
        className="relative z-10 flex items-center justify-between px-4 pb-3 text-[9px] font-extrabold uppercase tracking-[0.22em] text-white/25 sm:px-8 sm:pb-5"
        style={{
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        <span>⚙️ Vaelos Games</span>
        <span className="hidden sm:inline">Sürüm 3.0</span>
        <span>APK • WEB</span>
      </footer>
    </div>
  );
}
