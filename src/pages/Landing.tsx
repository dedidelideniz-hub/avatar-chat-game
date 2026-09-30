import { EntryCharacterStage } from "@/components/entry/EntryCharacterStage";
import {
  GameBackdrop,
  GameFooter,
  GameHeader,
  HexGate,
  RuneHalo,
} from "@/components/entry/GameChrome";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { CHARACTER_COLORS } from "@/lib/avatar";
import { rankFromLevel } from "@/lib/levels";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Coins,
  Crown,
  Gamepad2,
  LogIn,
  LogOut,
  MessageCircle,
  Palette,
  Play,
  ShieldCheck,
  Store,
  Swords,
  UserPlus,
} from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";

/**
 * ANA SAYFA — oyunun giriş kapısı (MOBİL OYUN TARZI).
 *
 * Eskiden uzun, web sitesi gibi kayan bir tanıtım sayfasıydı. Artık oyun girişi
 * ve yükleme ekranlarıyla AYNI görsel dilde TEK bir tam ekran "kapı":
 * karanlık rift arka planı, altıgen çerçevede gerçek 3D karakter, üstte hesap
 * durumu ve altta oyuna sokacak tek büyük düğme. Cep telefonunda tam ekran,
 * masaüstünde ise ortalanmış bir telefon sütunu olarak çalışır.
 *
 * Akış: OYNA → (giriş yapılmadıysa `/auth` → sonra `/entry`) → `/entry`
 * (yükleme + karakter rengi) → `/world` (cadde). Yani her CTA oyuncuyu
 * doğrudan oyuna sokar.
 */
export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, signOut } = useAuth();
  // Giriş yapılmamışsa sorgu `null` döner (bkz. convex/profiles.getMyProfile).
  const profile = useQuery(api.profiles.getMyProfile);

  const color = profile?.avatar.shirt ?? CHARACTER_COLORS[0].hex;
  const rank = rankFromLevel(profile?.level ?? 1);
  const isVip = profile?.vip ?? false;

  const equipped = useMemo(() => profile?.equipped ?? [], [profile]);

  const playLabel = isAuthenticated ? "DEVAM ET" : "OYNA";
  const goPlay = () => navigate(isAuthenticated ? "/entry" : "/auth");

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[#05070f] text-white">
      <GameBackdrop />

      {/* seçilen karakter rengi arkada hafif bir parıltı */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 size-[32rem] -translate-x-1/2 rounded-full opacity-20 blur-3xl transition-colors duration-500"
        style={{ background: color }}
      />

      <GameHeader
        subtitle={isAuthenticated ? "Sezon 1 • Kaldığın yerden" : "Sezon 1 • Ücretsiz oyna"}
        right={
          isAuthenticated ? (
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-sm">
              <div className="hidden text-right sm:block">
                <p className="max-w-[120px] truncate text-xs font-extrabold">
                  {profile?.username ?? "Oyuncu"}
                </p>
                <p className="text-[10px] font-bold text-amber-300/90">
                  {rank.icon} {rank.name} • Sv. {profile?.level ?? 1}
                </p>
              </div>
              <span
                className="flex size-9 items-center justify-center rounded-xl text-base shadow-md"
                style={{ background: rank.gradient }}
                title={`${rank.name} ligi`}
              >
                {rank.icon}
              </span>
              {isVip && (
                <span className="rounded-full bg-gradient-to-r from-amber-300 to-yellow-500 px-2 py-0.5 text-[9px] font-black tracking-wider text-[#2a1d05]">
                  VIP
                </span>
              )}
              <button
                type="button"
                onClick={() => void signOut()}
                aria-label="Çıkış yap"
                title="Çıkış yap"
                className="flex size-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate("/auth")}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-extrabold text-white/80 backdrop-blur-sm transition-colors active:bg-white/10"
            >
              <LogIn className="size-3.5 text-amber-300" />
              {isLoading ? "Kontrol ediliyor" : "GİRİŞ / KAYIT"}
            </button>
          )
        }
      />

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 pb-2 sm:max-w-lg sm:gap-5">
        {/* ── karakter vitrini: altıgen çerçevede GERÇEK 3D karakter ── */}
        <div className="entry-stage relative flex shrink-0 items-center justify-center">
          <RuneHalo />
          <HexGate>
            <EntryCharacterStage
              equipped={equipped}
              color={color}
              spin
              className="h-full w-full"
            />
          </HexGate>
        </div>

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
          <p className="mt-2 text-[10px] font-extrabold uppercase tracking-[0.36em] text-white/45 sm:text-[11px]">
            Caddede yaşa, savaş, sohbet et
          </p>
        </div>

        {/* ── hesaplı oyuncu: para / lig / seviye şeridi ── */}
        {isAuthenticated && (
          <div className="grid w-full grid-cols-3 gap-2">
            {[
              { icon: Coins, label: "Para", value: profile?.coins ?? 0 },
              { icon: Swords, label: "Zafer", value: profile?.battleWins ?? 0 },
              { icon: ShieldCheck, label: "Seviye", value: profile?.level ?? 1 },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2.5 text-center backdrop-blur-sm"
              >
                <s.icon className="mx-auto size-4 text-amber-300/80" />
                <p className="mt-1 text-sm font-black tabular-nums">
                  {s.value}
                </p>
                <p className="text-[9px] font-extrabold uppercase tracking-wider text-white/40">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── ana eylemler ── */}
        <div className="flex w-full flex-col gap-2">
          <motion.button
            type="button"
            onClick={goPlay}
            whileTap={{ scale: 0.97 }}
            className="entry-ready flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 text-base font-black tracking-wide text-[#22160a] shadow-[0_10px_30px_-10px_rgba(224,178,92,0.9)]"
          >
            {isAuthenticated ? (
              <Play className="size-5" />
            ) : (
              <Gamepad2 className="size-5" />
            )}
            {playLabel}
          </motion.button>

          {!isAuthenticated && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/auth")}
                className="h-11 flex-1 rounded-2xl border-white/15 bg-white/5 text-sm font-extrabold text-white hover:bg-white/10 hover:text-white"
              >
                <LogIn className="size-4" />
                GİRİŞ YAP
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/auth")}
                className="h-11 flex-1 rounded-2xl border-white/15 bg-white/5 text-sm font-extrabold text-white hover:bg-white/10 hover:text-white"
              >
                <UserPlus className="size-4" />
                KAYIT OL
              </Button>
            </div>
          )}

          <p className="flex items-center justify-center gap-1.5 text-center text-[10px] font-bold text-white/40">
            <ShieldCheck className="size-3 text-amber-300/70" />
            {isAuthenticated
              ? "Karakterin ve paran hesabına kayıtlı — kaldığın yerden devam et."
              : "E-posta ile 20 saniyede hesap aç ya da misafir olarak dene."}
          </p>
        </div>

        {/* ── oyun modları (kompakt, kaydırmasız) ── */}
        <div className="grid w-full grid-cols-3 gap-2">
          {[
            {
              icon: Palette,
              title: "Stüdyo",
              desc: "Karakterini yarat",
              onClick: () => navigate(isAuthenticated ? "/studio" : "/auth"),
            },
            {
              icon: Store,
              title: "Cadde",
              desc: "Tezgâhtan alışveriş",
              onClick: goPlay,
            },
            {
              icon: Swords,
              title: "Arena",
              desc: "Düelloya gir",
              onClick: goPlay,
            },
          ].map((m) => (
            <motion.button
              key={m.title}
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={m.onClick}
              className="flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-3 text-center backdrop-blur-sm transition-colors active:bg-white/10"
            >
              <m.icon className="size-4 text-amber-300/85" />
              <span className="text-[11px] font-black tracking-wide">
                {m.title}
              </span>
              <span className="text-[9px] font-bold leading-3 text-white/40">
                {m.desc}
              </span>
            </motion.button>
          ))}
        </div>

        {/* ── nasıl oynanır ── */}
        <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3 backdrop-blur-sm">
          <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-amber-200/80">
            <MessageCircle className="size-3.5" />
            Nasıl oynanır?
          </p>
          <ul className="mt-2 space-y-1.5">
            {[
              "Joystick ile yürü, caddede istediğin yere git.",
              "Tezgâhın önünde dur → satıcıyla konuş, satın al.",
              "Banklara otur, konuşma balonlarıyla sohbet et.",
            ].map((step) => (
              <li
                key={step}
                className="flex items-start gap-2 text-[11px] font-semibold leading-4 text-white/60"
              >
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-300/80" />
                {step}
              </li>
            ))}
          </ul>
          {isVip ? (
            <p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-amber-200/80">
              <Crown className="size-3" />
              VIP üyeliğin aktif — tüm balon renkleri ve premium renkler açık.
            </p>
          ) : null}
        </div>
      </main>

      <GameFooter />
    </div>
  );
}
