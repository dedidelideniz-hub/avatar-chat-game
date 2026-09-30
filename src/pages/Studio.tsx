import { CharacterColorPicker } from "@/components/entry/CharacterColorPicker";
import { EntryCharacterStage } from "@/components/entry/EntryCharacterStage";
import {
  GameBackdrop,
  GameFooter,
  GameHeader,
  HexGate,
  RuneHalo,
} from "@/components/entry/GameChrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HairThumb } from "@/components/avatar/AvatarPreview";
import {
  characterColorLabel,
  DEFAULT_AVATAR,
  HAIR_COLORS,
  HAIR_STYLE_LABELS,
  HAIR_STYLES,
  PANTS_COLORS,
  SHOE_COLORS,
  SKIN_TONES,
  randomAvatar,
  type AvatarConfig,
} from "@/lib/avatar";
import {
  membershipInfo,
  rankFromLevel,
  WINS_PER_LEVEL,
  winsToNextLevel,
} from "@/lib/levels";
import { wornCharacterSkin } from "@/lib/shop";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Check,
  Coins,
  Crown,
  Flame,
  Gamepad2,
  Loader2,
  LogOut,
  Palette,
  Shuffle,
  Sparkles,
  Trophy,
  UserPlus,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const USERNAME_RE = /^[\p{L}\p{N}_ ]{2,20}$/u;

/** Koyu "cam" kart — ana sayfa / oyun girişiyle aynı yüzey. */
const CARD = "rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm";

/** Karanlık zeminde okunabilen metin alanı. */
const INPUT_CLASS =
  "mt-3 h-12 rounded-2xl border-white/15 bg-black/40 px-3.5 text-base font-semibold text-white placeholder:text-white/25 focus-visible:border-amber-300/60 focus-visible:ring-amber-300/25 md:text-base";

/** Kart başlığı: altın ikon + başlık (+ ince açıklama). */
function SectionTitle({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 shrink-0 text-amber-300" />
      <div className="min-w-0">
        <p className="text-sm font-black tracking-wide">{title}</p>
        {detail && (
          <p className="text-[10px] font-bold text-white/35">{detail}</p>
        )}
      </div>
    </div>
  );
}

/** Renk seçme satırı (ten / saç / pantolon / ayakkabı). */
function SwatchRow({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-amber-200/80">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((color) => {
          const isSelected = selected === color;
          return (
            <button
              key={color}
              type="button"
              aria-label={`${label}: ${color}`}
              aria-pressed={isSelected}
              onClick={() => onSelect(color)}
              className={`size-9 rounded-2xl border transition-transform active:scale-95 ${
                isSelected
                  ? "border-white/80 ring-2 ring-amber-300 ring-offset-2 ring-offset-[#0a0f1c]"
                  : "border-white/15 hover:border-white/40"
              }`}
              style={{ backgroundColor: color }}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * AVATAR STÜDYOSU — oyunun karakter ekranı (MOBİL OYUN TARZI).
 *
 * Ana sayfa, oyun girişi ve yükleme ekranlarıyla AYNI görsel dil: karanlık
 * rift arka planı, altıgen çerçevede canlı 3D karakter, cam kartlarda
 * üyelik/lig bilgisi ve karakter ayarları.
 *
 * KARAKTER RENGİ ortak bileşenden gelir (`CharacterColorPicker`): oyun
 * girişindeki "renk seçme" ekranıyla TEK kaynaktır — aynı palet, aynı VIP
 * kilitleri, aynı tek-seferlik kural. İki ekran birbiriyle çelişmez.
 */
export default function Studio() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const profile = useQuery(api.profiles.getMyProfile);
  const saveProfile = useMutation(api.profiles.saveProfile);

  const [username, setUsername] = useState("");
  const [config, setConfig] = useState<AvatarConfig>(DEFAULT_AVATAR);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const initialized = useRef(false);

  // Kayıtlı profili tam olarak BİR kez yükle (reaktif güncellemelerde
  // oyuncunun yazdıklarının üzerine yazmasın).
  useEffect(() => {
    if (profile && !initialized.current) {
      initialized.current = true;
      setUsername(profile.username);
      setConfig(profile.avatar);
    }
  }, [profile]);

  const hasProfile = profile !== null && profile !== undefined;
  const loading = profile === undefined;
  /** Anonim (misafir) hesap: kalıcı hesaba yükseltilebilir. */
  const isGuest = user?.isAnonymous === true;
  const isVip = profile?.vip ?? false;
  // 👑 RENK HAKKI: karakter rengi TEK SEFER seçilir (VIP üyeler serbestçe
  // değiştirir). Sunucu tarafı da aynı kuralı zorlar (profiles.saveProfile).
  const colorLocked = (profile?.colorChosen ?? false) && !isVip;
  // 👑 HAZIR KARAKTER GÖRÜNÜMÜ (Kraliyet Savaşçısı / Samuray / Şövalye):
  // modeller orijinal renklerini korur, seçilen renk onlara uygulanmaz.
  const skinWorn = wornCharacterSkin(profile?.equipped);
  const colorDisabled = colorLocked || skinWorn !== undefined;

  const wins = profile?.battleWins ?? 0;
  const level = profile?.level ?? 1;
  const rank = rankFromLevel(level);
  const membership = membershipInfo(isVip, profile?.vipUntil ?? undefined);
  const toNext = winsToNextLevel(wins);
  const levelPct =
    toNext === null
      ? 100
      : Math.round(((wins % WINS_PER_LEVEL) / WINS_PER_LEVEL) * 100);

  const handleSave = async () => {
    const trimmed = username.trim();
    if (!USERNAME_RE.test(trimmed)) {
      setUsernameError(
        "Kullanıcı adı 2-20 karakter olmalı ve yalnızca harf, rakam, alt çizgi ve boşluk içerebilir.",
      );
      return;
    }
    setUsernameError(null);
    setIsSaving(true);
    try {
      // Renk hakkı kilitliyse kayıt HER ZAMAN kayıtlı rengi taşır: saç/yüz/
      // kıyafet düzenlemeleri kaydedilebilsin, sunucu renk değişikliği diye
      // reddetmesin.
      const avatar = colorDisabled
        ? { ...config, shirt: profile?.avatar.shirt ?? config.shirt }
        : config;
      await saveProfile({ username: trimmed, avatar });
      toast.success(
        hasProfile ? "Avatarın güncellendi! ✨" : "Avatarın oluşturuldu! 🎉",
      );
      // Yeni oyuncu karakterini yarattığında doğrudan oyun girişine geçer
      // (yükleme ekranı → lig/üyelik kartı → savaşa hazır).
      if (!hasProfile) navigate("/entry");
    } catch (error) {
      console.error("Profil kaydedilemedi:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Profil kaydedilemedi. Tekrar dene.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleRandom = () => {
    setConfig((c) => {
      const next = randomAvatar();
      // Renk kilitliyken/skin giyiliyken renk korunur (rastgele seçim rengi
      // bozmaz).
      return colorDisabled ? { ...next, shirt: c.shirt } : next;
    });
  };

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[#05070f] text-white">
      <GameBackdrop />

      {/* Seçilen karakter rengi arkada hafif bir parıltı */}
      <div
        className="pointer-events-none absolute -top-24 left-1/3 size-[30rem] rounded-full opacity-15 blur-3xl transition-colors duration-500"
        style={{ background: config.shirt }}
      />

      {/* ── üst şerit: marka + oyuncu kartı ───────────────────────── */}
      <GameHeader
        subtitle="Sezon 1 • Avatar Stüdyosu"
        right={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-sm">
              <div className="hidden text-right sm:block">
                <p className="max-w-[130px] truncate text-xs font-extrabold">
                  {username.trim() || profile?.username || "Oyuncu"}
                </p>
                <p className="text-[10px] font-bold text-amber-300/90">
                  {rank.icon} {rank.name} • Sv. {level}
                </p>
              </div>
              <span
                className="flex size-9 items-center justify-center rounded-xl text-base shadow-md"
                style={{ background: rank.gradient }}
                title={`${rank.name} ligi`}
              >
                {rank.icon}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-black tracking-wider ${
                  isVip
                    ? "bg-gradient-to-r from-amber-300 to-yellow-500 text-[#2a1d05]"
                    : isGuest
                      ? "bg-white/10 text-amber-200/90"
                      : "bg-white/10 text-white/70"
                }`}
              >
                {isVip ? "VIP" : isGuest ? "MİSAFİR" : "STANDART"}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              aria-label="Çıkış yap"
              title="Çıkış yap"
              className="rounded-full text-white/60 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        }
      />

      <main className="relative z-10 mx-auto grid w-full max-w-6xl gap-6 px-4 pb-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-8">
        {/* ── SOL: canlı 3D karakter (yapışkan) ────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative lg:sticky lg:top-4 lg:self-start"
        >
          <div className="entry-stage entry-stage-studio relative flex items-center justify-center">
            <RuneHalo />
            <HexGate>
              {loading ? (
                <div className="flex h-full w-full items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-amber-300/80" />
                </div>
              ) : (
                <EntryCharacterStage
                  equipped={profile?.equipped ?? []}
                  color={config.shirt}
                  spin
                  className="h-full w-full"
                />
              )}
            </HexGate>
          </div>

          <div className="mt-3 flex flex-col items-center gap-2">
            <span className="max-w-[220px] truncate rounded-2xl border border-white/10 bg-white/5 px-5 py-1.5 text-sm font-extrabold">
              {username.trim() || "Kullanıcı adın"}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-white/50">
              <span className="size-2 rounded-full bg-emerald-400" />
              Dünyaya girişe hazır
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200">
              <Palette className="size-3" />
              {skinWorn
                ? `${skinWorn.emoji} ${skinWorn.name}`
                : characterColorLabel(config.shirt)}
            </span>
          </div>
        </motion.section>

        {/* ── SAĞ: karakter ayarları ───────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
          className="flex flex-col gap-4"
        >
          {/* kullanıcı adı */}
          <div className={CARD}>
            <SectionTitle
              icon={UserRound}
              title="Kullanıcı Adı"
              detail="Dünyada böyle tanınırsın"
            />
            <Input
              id="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (usernameError) setUsernameError(null);
              }}
              placeholder="örn. GezginKedi"
              maxLength={20}
              className={INPUT_CLASS}
              aria-invalid={usernameError !== null}
            />
            {usernameError && (
              <p className="mt-1.5 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[11px] font-bold leading-4 text-red-200">
                {usernameError}
              </p>
            )}
          </div>

          {/* üyelik + lig */}
          <div className={CARD}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">
                  Üyelik Durumu
                </p>
                <p className="mt-1 flex items-center gap-2 text-base font-black">
                  {isVip ? (
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
                { icon: Trophy, label: "Zafer", value: wins },
                { icon: Flame, label: "Seviye", value: level },
                { icon: Coins, label: "Para", value: profile?.coins ?? 0 },
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

          {/* misafir hesabı kalıcı hâle getir */}
          {isGuest && (
            <div className="rounded-3xl border border-amber-300/25 bg-amber-300/[0.07] p-4 backdrop-blur-sm">
              <SectionTitle
                icon={UserPlus}
                title="Misafir Hesap"
                detail="Bu cihaza bağlı · e-posta ile kalıcı yap"
              />
              <p className="mt-2 text-[11px] font-semibold leading-5 text-white/55">
                Şu an misafir olarak oynuyorsun. E-posta ile giriş yaparsan
                hesabın kalıcı olur ve başka bir cihazdan da oynayabilirsin.
              </p>
              <Button
                type="button"
                onClick={() => navigate("/auth?returnTo=/studio")}
                className="mt-3 h-11 w-full rounded-2xl border border-amber-300/40 bg-amber-300/15 text-xs font-black tracking-wide text-amber-100 hover:bg-amber-300/25"
              >
                <UserPlus className="size-4" />
                HESABI KALICI YAP
              </Button>
            </div>
          )}

          {/* karakter rengi — giriş ekranıyla AYNI bileşen */}
          <div className={CARD}>
            <SectionTitle
              icon={Palette}
              title="Karakter Rengi"
              detail="Ana karakteri boyar · botlar kendi rengini giyer"
            />
            <CharacterColorPicker
              color={config.shirt}
              onSelect={(shirt) => setConfig((c) => ({ ...c, shirt }))}
              isVip={isVip}
              locked={colorLocked}
              wornSkinName={skinWorn?.name}
            />
          </div>

          {/* beden: ten + saç */}
          <div className={CARD}>
            <SectionTitle icon={Sparkles} title="Beden ve Saç" />
            <div className="mt-3 space-y-4">
              <SwatchRow
                label="Ten Rengi"
                values={SKIN_TONES}
                selected={config.skin}
                onSelect={(skin) => setConfig((c) => ({ ...c, skin }))}
              />

              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-amber-200/80">
                  Saç Stili
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {HAIR_STYLES.map((style) => {
                    const isSelected = config.hair === style;
                    return (
                      <button
                        key={style}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() =>
                          setConfig((c) => ({ ...c, hair: style }))
                        }
                        className={`flex flex-col items-center gap-1 rounded-2xl border px-2 pb-2 pt-1.5 transition-colors ${
                          isSelected
                            ? "border-amber-300/60 bg-amber-300/10 ring-2 ring-amber-300/30"
                            : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
                        }`}
                      >
                        <HairThumb
                          style={style}
                          color={config.hairColor}
                          className="size-10"
                        />
                        <span className="text-[10px] font-bold text-white/50">
                          {HAIR_STYLE_LABELS[style]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <SwatchRow
                label="Saç Rengi"
                values={HAIR_COLORS}
                selected={config.hairColor}
                onSelect={(hairColor) =>
                  setConfig((c) => ({ ...c, hairColor }))
                }
              />
            </div>
          </div>

          {/* kombin: pantolon + ayakkabı */}
          <div className={CARD}>
            <SectionTitle icon={Sparkles} title="Kombin" />
            <div className="mt-3 space-y-4">
              <SwatchRow
                label="Alt (Pantolon)"
                values={PANTS_COLORS}
                selected={config.pants}
                onSelect={(pants) => setConfig((c) => ({ ...c, pants }))}
              />
              <SwatchRow
                label="Ayakkabı"
                values={SHOE_COLORS}
                selected={config.shoes}
                onSelect={(shoes) => setConfig((c) => ({ ...c, shoes }))}
              />
            </div>
          </div>

          {/* eylemler */}
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving || loading}
              className="entry-ready h-14 w-full rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 text-base font-black tracking-wide text-[#22160a] hover:from-amber-200 hover:to-orange-400"
            >
              {isSaving ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  KAYDEDİLİYOR...
                </>
              ) : (
                <>
                  <Check className="size-5" />
                  {hasProfile ? "DEĞİŞİKLİKLERİ KAYDET" : "AVATARIMI OLUŞTUR"}
                </>
              )}
            </Button>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleRandom}
                disabled={isSaving}
                className="h-11 flex-1 rounded-2xl border-white/15 bg-white/5 text-xs font-extrabold text-white hover:bg-white/10 hover:text-white"
              >
                <Shuffle className="size-4" />
                RASTGELE
              </Button>
              {hasProfile && (
                <Button
                  type="button"
                  onClick={() => navigate("/entry")}
                  className="h-11 flex-1 rounded-2xl border border-white/15 bg-white/5 text-xs font-extrabold text-white hover:bg-white/10 hover:text-white"
                >
                  <Gamepad2 className="size-4" />
                  OYUNA GİR
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/")}
                className="h-11 flex-1 rounded-2xl border-white/15 bg-white/5 text-xs font-extrabold text-white hover:bg-white/10 hover:text-white"
              >
                ANA SAYFA
              </Button>
            </div>

            <p className="flex items-center justify-center gap-1.5 text-center text-[10px] font-bold text-white/35">
              <Sparkles className="size-3 text-amber-300/70" />
              Profilin sanal dünyadaki görünümünü belirler — istediğin zaman
              değiştirebilirsin.
            </p>
          </div>
        </motion.section>
      </main>

      <GameFooter />
    </div>
  );
}
