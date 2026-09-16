import { EntryCharacterStage } from "@/components/entry/EntryCharacterStage";
import { EntryLoader } from "@/components/entry/EntryLoader";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { CHARACTER_COLORS, characterColorLabel } from "@/lib/avatar";
import { membershipInfo, rankFromLevel, WINS_PER_LEVEL, winsToNextLevel } from "@/lib/levels";
import { useProgress } from "@react-three/drei";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Coins,
  Crown,
  Flame,
  Gamepad2,
  LogOut,
  Palette,
  Trophy,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

/** Yükleme sırasında dönen ipuçları (MOBA yükleme ekranı geleneği). */
const TIPS = [
  "Joystick ile hareket et; yeteneği basılı tutup nişan al, bırakınca ateş eder.",
  "Neredeyse ölürken geri çekil — canın savaş dışında yenilenir.",
  "Menzil göstergesi kırmızıya dönerse hedefin dışındasın demektir.",
  "Günün hediye kutusunu caddeden topla, Vaelos Parası kazan.",
  "VIP üyelik tüm konuşma balonu renklerini açar.",
  "Zafer kazandıkça lig atlarsın: Bronz'dan Efsane'ye kadar yüksel.",
];

/**
 * MOBA tarzı oyun girişi.
 *
 * Akış: kısa bir yükleme ekranı (karakter modeli + lig ve üyelik verisi
 * gerçekten yüklenirken ilerler) → oyuncu kartı + sadece RENK seçimi →
 * oyuna giriş. Hem web hem Android APK içinde aynı ekrandır; dokunmatik
 * için büyük hedefler ve güvenli alan (safe-area) boşlukları kullanır.
 */
export default function Entry() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const profile = useQuery(api.profiles.getMyProfile);
  const saveProfile = useMutation(api.profiles.saveProfile);

  // Karakter modelinin gerçek indirme ilerlemesi (GLB yükleyicisi).
  const { progress: modelProgress } = useProgress();

  const [phase, setPhase] = useState<"boot" | "lobby">("boot");
  const [ceiling, setCeiling] = useState(0);
  const [tip, setTip] = useState(0);
  const [color, setColor] = useState<string>(CHARACTER_COLORS[0].hex);
  const [initialized, setInitialized] = useState(false);
  const [entering, setEntering] = useState(false);
  // Emniyet supabı: model indirmesi ağ yüzünden takılırsa yükleme ekranı
  // sonsuza kadar %55'te kalmasın — bir süre sonra oyun açılır.
  const [modelStalled, setModelStalled] = useState(false);

  const hasProfile = profile !== null && profile !== undefined;

  // Profil yoksa önce karakter oluşturulmalı (Stüdyo).
  useEffect(() => {
    if (profile === null) navigate("/studio", { replace: true });
  }, [profile, navigate]);

  // Kayıtlı rengi bir kez yükle (kullanıcı seçim yaparken üzerine yazmasın).
  useEffect(() => {
    if (profile && !initialized) {
      setInitialized(true);
      setColor(profile.avatar.shirt);
    }
  }, [profile, initialized]);

  // Yükleme tavanı: gerçek iş çabuk bitse bile ekran akışı bir yükleme
  // hissi verecek kadar sürer (yaklaşık 3 sn), asla önce bitmez.
  useEffect(() => {
    if (phase !== "boot") return;
    const id = window.setInterval(() => {
      setCeiling((c) => Math.min(100, c + (c < 60 ? 3.4 : c < 90 ? 1.7 : 0.8)));
    }, 60);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    const id = window.setInterval(
      () => setTip((t) => (t + 1) % TIPS.length),
      2600,
    );
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (phase !== "boot") return;
    const id = window.setTimeout(() => setModelStalled(true), 7000);
    return () => window.clearTimeout(id);
  }, [phase]);

  // Gerçek ilerleme: hesap %30, karakter modeli %45, lig verisi %15, arena %10.
  const target = useMemo(() => {
    const data = hasProfile ? 1 : 0;
    const model = modelStalled
      ? 1
      : Math.min(1, Math.max(0, modelProgress) / 100);
    return 30 + model * 45 + data * 15 + data * 10;
  }, [hasProfile, modelProgress, modelStalled]);

  const pct = Math.min(target, ceiling);
  const stepIndex = pct < 26 ? 0 : pct < 62 ? 1 : pct < 82 ? 2 : 3;

  useEffect(() => {
    if (phase !== "boot" || pct < 99.5 || !hasProfile) return;
    const id = window.setTimeout(() => setPhase("lobby"), 420);
    return () => window.clearTimeout(id);
  }, [phase, pct, hasProfile]);

  const rank = rankFromLevel(profile?.level ?? 1);
  const membership = membershipInfo(
    profile?.vip ?? false,
    profile?.vipUntil ?? undefined,
  );
  const wins = profile?.battleWins ?? 0;
  const level = profile?.level ?? 1;
  const toNext = winsToNextLevel(wins);
  const levelPct =
    toNext === null
      ? 100
      : Math.round(((wins % WINS_PER_LEVEL) / WINS_PER_LEVEL) * 100);

  const stage = (
    <EntryCharacterStage
      equipped={profile?.equipped ?? []}
      color={color}
      spin
      className="h-full w-full"
    />
  );

  const handleEnter = async () => {
    if (!profile) return;
    setEntering(true);
    try {
      if (color !== profile.avatar.shirt) {
        await saveProfile({
          username: profile.username,
          avatar: { ...profile.avatar, shirt: color },
        });
        toast.success(`Karakter rengi "${characterColorLabel(color)}" kaydedildi.`);
      }
    } catch (error) {
      console.error("Renk kaydedilemedi:", error);
      toast.warning("Renk kaydedilemedi ama oyuna giriliyor.");
    } finally {
      setEntering(false);
      navigate("/world");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (phase === "boot") {
    return (
      <EntryLoader
        pct={pct}
        stepIndex={stepIndex}
        tip={TIPS[tip]}
        stage={stage}
        player={
          profile
            ? {
                name: profile.username,
                rankName: rank.name,
                rankIcon: rank.icon,
                rankGradient: rank.gradient,
                vip: profile.vip,
                level: profile.level,
              }
            : null
        }
      />
    );
  }

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-[#05070f] text-white">
      {/* arka plan */}
      <div className="entry-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_20%,rgba(3,5,12,0.9)_85%)]" />
      <div
        className="pointer-events-none absolute -top-24 left-1/2 size-[36rem] -translate-x-1/2 rounded-full opacity-20 blur-3xl transition-colors duration-500"
        style={{ background: color }}
      />

      {/* üst şerit */}
      <header
        className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-5"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 text-lg shadow-[0_0_22px_rgba(224,178,92,0.4)]">
            ⚔️
          </span>
          <div className="leading-none">
            <p className="text-lg font-black tracking-widest">VAELOS</p>
            <p className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.26em] text-amber-300/80">
              Oyun Girişi
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate("/studio")}
            className="rounded-full border-white/15 bg-white/5 text-xs font-bold text-white hover:bg-white/10 hover:text-white"
          >
            <Wand2 className="size-3.5" />
            <span className="hidden sm:inline">Stüdyo</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            aria-label="Çıkış yap"
            className="rounded-full text-white/60 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl gap-5 px-4 pb-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-8">
        {/* ── SOL: karakter sahnesi ─────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative"
        >
          <div className="relative overflow-hidden rounded-[2rem] border border-amber-300/20 bg-gradient-to-b from-[#0a1120] to-[#05070f] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]">
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-25 blur-2xl transition-colors duration-300"
              style={{ background: color }}
            />
            <div className="entry-grid pointer-events-none absolute inset-0 opacity-25" />

            <span className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-200 backdrop-blur">
              <Palette className="size-3" />
              {characterColorLabel(color)}
            </span>

            <EntryCharacterStage
              equipped={profile?.equipped ?? []}
              color={color}
              spin
              className="h-[42vh] min-h-[260px] w-full sm:h-[48vh]"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-extrabold">
              {profile?.username}
            </span>
            <span
              className="flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-black text-[#1d1408] shadow-md"
              style={{ background: rank.gradient }}
            >
              {rank.icon} {rank.name}
            </span>
            {profile?.vip && (
              <span className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-300 to-yellow-500 px-3.5 py-2 text-sm font-black text-[#2a1d05] shadow-md">
                <Crown className="size-4" />
                VIP
              </span>
            )}
          </div>
        </motion.section>

        {/* ── SAĞ: oyuncu kartı + renk seçimi ──────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
          className="flex flex-col gap-4"
        >
          {/* üyelik + lig kartı */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">
                  Üyelik Durumu
                </p>
                <p className="mt-1 flex items-center gap-2 text-base font-black">
                  {profile?.vip ? (
                    <Crown className="size-4 text-amber-300" />
                  ) : (
                    <Flame className="size-4 text-white/40" />
                  )}
                  {membership.label}
                </p>
                <p className="mt-0.5 text-[11px] font-bold text-amber-300/80">
                  {membership.detail}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">
                  Lig
                </p>
                <p className="mt-1 flex items-center justify-end gap-1.5 text-base font-black">
                  <span>{rank.icon}</span>
                  {rank.name}
                </p>
                <p className="mt-0.5 text-[11px] font-bold text-white/50">
                  Seviye {level}
                </p>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-white/40">
                <span>Sonraki lig</span>
                <span className="tabular-nums">
                  {toNext === null ? "En yüksek lig" : `${toNext} zafer`}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${levelPct}%`, background: rank.gradient }}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                {
                  icon: Trophy,
                  label: "Zafer",
                  value: wins,
                },
                { icon: Flame, label: "Seviye", value: level },
                {
                  icon: Coins,
                  label: "Para",
                  value: profile?.coins ?? 0,
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-white/10 bg-black/25 px-2 py-2.5"
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
          </div>

          {/* sadece renk seçimi */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Palette className="size-4 text-amber-300" />
              <p className="text-sm font-black tracking-wide">
                Karakter Rengi
              </p>
            </div>
            <p className="mt-1 text-[11px] font-semibold leading-5 text-white/45">
              Girişte yalnızca rengini seç — saç, yüz ve kıyafet detaylarını
              istediğin zaman Stüdyo'dan ayarlayabilirsin.
            </p>

            <div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-6">
              {CHARACTER_COLORS.map((c) => {
                const selected = c.hex === color;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setColor(c.hex)}
                    aria-label={c.label}
                    aria-pressed={selected}
                    title={c.label}
                    className={`group relative aspect-square w-full rounded-2xl border transition-transform active:scale-95 ${
                      selected
                        ? "border-white/80 ring-2 ring-amber-300 ring-offset-2 ring-offset-[#0a0f1c]"
                        : "border-white/15 hover:border-white/40"
                    }`}
                    style={{ backgroundColor: c.hex }}
                  >
                    {selected && (
                      <span className="entry-color-pop absolute inset-0 rounded-2xl shadow-[0_0_22px_rgba(255,255,255,0.35)]" />
                    )}
                  </button>
                );
              })}
            </div>

            <p className="mt-3 flex items-center justify-between text-[11px] font-bold text-white/50">
              <span>Seçilen renk</span>
              <span className="text-amber-200">
                {characterColorLabel(color)}
              </span>
            </p>
          </div>

          {/* eylemler */}
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              onClick={handleEnter}
              disabled={entering}
              className="entry-ready h-14 w-full rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 text-base font-black tracking-wide text-[#22160a] hover:from-amber-200 hover:to-orange-400"
            >
              <Gamepad2 className="size-5" />
              {entering ? "BAĞLANIYOR..." : "OYUNA GİR"}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/studio")}
                className="flex-1 rounded-2xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Wand2 className="size-4" />
                Detaylı Stüdyo
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/")}
                className="flex-1 rounded-2xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                Ana Sayfa
              </Button>
            </div>
          </div>
        </motion.section>
      </main>
    </div>
  );
}
