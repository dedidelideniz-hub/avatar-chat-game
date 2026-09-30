import { motion } from "framer-motion";
import { Check, Loader2, ShieldCheck, Star, Swords } from "lucide-react";
import type { ReactNode } from "react";
import {
  CrestEmblem,
  GameBackdrop,
  GameFooter,
  GameHeader,
  HexGate,
  RuneHalo,
} from "./GameChrome";

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
 * MOBA tarzı yükleme ekranı.
 *
 * Karanlık bir "rift kapısı": altıgen çerçevenin içinde oyuncunun gerçek 3D
 * karakteri (renk tonuyla) belirir, arkasında rün halkaları döner; altta
 * adım adım yanan bir yükleme çubuğu ve oyuncunun lig/üyelik kartı vardır.
 *
 * Aynı bileşen İKİ yerde kullanılır ve metinleri dışarıdan alır:
 *   · oyun girişi (`Entry`) — `stage` olarak oyuncunun 3D karakteri verilir,
 *   · cadde kapısı (`World`) — `stage` verilmez, altıgende arma gösterilir
 *     (cadde zaten arkada render ediliyor; ikinci bir WebGL bağlamı açmayız).
 *
 * Hem dikey (web/APK) hem yatay düzende çalışır.
 */
export function EntryLoader({
  pct,
  stepIndex,
  player,
  tip,
  stage,
  steps = ENTRY_STEPS,
  subtitle = "Savaş alanına bağlanılıyor",
  crestLabel,
  pendingLabel = "Hesap doğrulanıyor",
}: {
  pct: number;
  stepIndex: number;
  player: EntryLoaderPlayer | null;
  tip: string;
  /** Hexagon panelin içine çizilen 3D sahne (verilmezse arma çizilir). */
  stage?: ReactNode;
  /** Yükleme adımlarının başlıkları. */
  steps?: string[];
  /** Başlığın altındaki ince yazı. */
  subtitle?: string;
  /** `stage` yokken altıgende gösterilecek kısa etiket. */
  crestLabel?: string;
  /** Oyuncu kartı hazır olmadan önce sağda görünen yazı. */
  pendingLabel?: string;
}) {
  const shown = Math.floor(pct);
  const activeStep = steps[Math.min(stepIndex, steps.length - 1)];

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[#05070f] text-white">
      <GameBackdrop />

      {/* ── üst şerit: marka + oyuncu kartı ──────────────────── */}
      <GameHeader
        right={
          player ? (
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
              {pendingLabel}
            </div>
          )
        }
      />

      {/* ── orta: rift kapısı + ilerleme ────────────────────── */}
      <main className="entry-main relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-4 py-2">
        <div className="entry-stage relative flex shrink-0 items-center justify-center">
          <RuneHalo />
          <HexGate>{stage ?? <CrestEmblem label={crestLabel} />}</HexGate>
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
              {subtitle}
            </p>
          </div>

          {/* adım adım yanan yükleme adımları */}
          <div className="flex w-full max-w-2xl flex-wrap items-center justify-center gap-2">
            {steps.map((label, i) => {
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
                {activeStep}
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

      <GameFooter />
    </div>
  );
}
