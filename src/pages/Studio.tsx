import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HairThumb, AvatarPreview } from "@/components/avatar/AvatarPreview";
import {
  DEFAULT_AVATAR,
  HAIR_STYLE_LABELS,
  HAIR_STYLES,
  PANTS_COLORS,
  SHIRT_COLORS,
  SHOE_COLORS,
  SKIN_TONES,
  HAIR_COLORS,
  randomAvatar,
  type AvatarConfig,
} from "@/lib/avatar";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Check, LogOut, Shuffle, Sparkles, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const USERNAME_RE = /^[\p{L}\p{N}_ ]{2,20}$/u;

function GameLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 44 44" className="size-9" aria-hidden="true">
        <rect x="1" y="1" width="42" height="42" rx="12" fill="#ff6b4a" />
        <circle cx="22" cy="20" r="12" fill="#ffd1a3" />
        <path d="M10 20 C10 7 34 7 34 20 C28 12 16 12 10 20 Z" fill="#6b4423" />
        <circle cx="18.5" cy="21" r="1.7" fill="#2b2320" />
        <circle cx="25.5" cy="21" r="1.7" fill="#2b2320" />
        <path
          d="M18.5 25 Q22 28.5 25.5 25"
          stroke="#2b2320"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <span className="text-xl font-extrabold tracking-tight">Meydan</span>
    </div>
  );
}

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
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
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
              className={`size-8 rounded-full border border-black/10 shadow-sm transition-transform hover:scale-110 ${
                isSelected
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-card"
                  : ""
              }`}
              style={{ backgroundColor: color }}
            />
          );
        })}
      </div>
    </div>
  );
}

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

  // Prefill from the saved profile exactly once (not on every reactive update).
  useEffect(() => {
    if (profile && !initialized.current) {
      initialized.current = true;
      setUsername(profile.username);
      setConfig(profile.avatar);
    }
  }, [profile]);

  const hasProfile = profile !== null && profile !== undefined;
  const loading = profile === undefined;

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
      await saveProfile({ username: trimmed, avatar: config });
      toast.success(
        hasProfile ? "Avatarın güncellendi! ✨" : "Avatarın oluşturuldu! 🎉",
      );
    } catch (error) {
      console.error("Profil kaydedilemedi:", error);
      toast.error(
        error instanceof Error ? error.message : "Profil kaydedilemedi. Tekrar dene.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <button type="button" onClick={() => navigate("/")} aria-label="Ana sayfa">
            <GameLogo />
          </button>
          <div className="flex items-center gap-3">
            {user?.name && (
              <span className="hidden items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-bold sm:flex">
                <UserRound className="size-4 text-primary" />
                {user.name}
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={handleSignOut}
            >
              <LogOut className="size-4" />
              Çıkış
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Avatar Stüdyosu
          </span>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            {hasProfile ? "Profilini düzenle" : "Karakterini yarat"}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            {hasProfile
              ? "Görünümünü veya kullanıcı adını değiştir — meydana dilediğin gibi dön."
              : "Kendine benzeyen ya da tamamen hayal ürünü bir avatar seç. Sonra meydanda herkes seni böyle görecek."}
          </p>
        </motion.div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* Live preview */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-gradient-to-b from-[#ffe4c2] via-[#fff3e0] to-[#eaf9d8] shadow-lg">
              <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-[#ffc53d]/50 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-10 -left-8 size-36 rounded-full bg-[#5cb85c]/30 blur-2xl" />
              <div className="flex min-h-[320px] flex-col items-center justify-end px-8 pb-6 pt-10 sm:min-h-[380px]">
                <span className="absolute right-5 top-5 rounded-full bg-card/90 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-primary shadow-sm">
                  {hasProfile ? "Profilin" : "Yeni avatar"}
                </span>
                <div className="pointer-events-none absolute right-10 top-10 size-6 rounded-full bg-[#ffc53d] opacity-90 shadow-inner" />
                <div className="pointer-events-none absolute left-12 top-16 size-3.5 rounded-full bg-white/80" />
                <div className="pointer-events-none absolute left-1/2 top-14 h-1 w-24 -translate-x-1/2 rounded-full bg-white/50" />
                {loading ? (
                  <div className="flex h-[300px] items-center">
                    <div className="size-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
                  </div>
                ) : (
                  <div className="animate-float">
                    <AvatarPreview
                      config={config}
                      className="block h-auto w-full max-w-[240px]"
                    />
                  </div>
                )}
                <div className="relative mb-2 mt-1 rounded-full border border-border bg-card px-5 py-1.5 shadow-sm">
                  <p className="max-w-[220px] truncate text-sm font-extrabold">
                    {username.trim() || "Kullanıcı adın"}
                  </p>
                </div>
                <div className="mb-4 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <span className="size-2 rounded-full bg-[#28c840]" />
                  Meydana girişe hazır
                </div>
              </div>
            </div>
          </div>

          {/* Editor */}
          <div className="rounded-[2rem] border border-border/70 bg-card p-6 shadow-sm sm:p-8">
            <div className="space-y-6">
              <div>
                <label
                  htmlFor="username"
                  className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground"
                >
                  Kullanıcı Adı
                </label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (usernameError) setUsernameError(null);
                  }}
                  placeholder="örn. GezginKedi"
                  maxLength={20}
                  className="mt-2 h-11 rounded-2xl text-base font-semibold"
                  aria-invalid={usernameError !== null}
                />
                {usernameError && (
                  <p className="mt-1.5 text-xs font-semibold text-destructive">
                    {usernameError}
                  </p>
                )}
              </div>

              <SwatchRow
                label="Ten Rengi"
                values={SKIN_TONES}
                selected={config.skin}
                onSelect={(skin) => setConfig((c) => ({ ...c, skin }))}
              />

              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
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
                            ? "border-primary bg-primary/10 ring-2 ring-primary/25"
                            : "border-border bg-background hover:bg-accent"
                        }`}
                      >
                        <HairThumb
                          style={style}
                          color={config.hairColor}
                          className="size-10"
                        />
                        <span className="text-[10px] font-bold text-muted-foreground">
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
                onSelect={(hairColor) => setConfig((c) => ({ ...c, hairColor }))}
              />

              <SwatchRow
                label="Üst (Kıyafet)"
                values={SHIRT_COLORS}
                selected={config.shirt}
                onSelect={(shirt) => setConfig((c) => ({ ...c, shirt }))}
              />

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

              <div className="flex flex-col gap-3 border-t border-border/70 pt-6 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-full"
                  onClick={() => setConfig(randomAvatar())}
                  disabled={isSaving}
                >
                  <Shuffle className="size-4" />
                  Rastgele dene
                </Button>
                <Button
                  type="button"
                  className="flex-1 rounded-full text-base"
                  onClick={handleSave}
                  disabled={isSaving || loading}
                >
                  {isSaving ? (
                    <>
                      <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                      Kaydediliyor...
                    </>
                  ) : (
                    <>
                      <Check className="size-4" />
                      {hasProfile ? "Değişiklikleri Kaydet" : "Avatarımı Oluştur"}
                    </>
                  )}
                </Button>
              </div>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" />
                Profilin meydandaki görünümünü belirler — istediğin zaman değiştirebilirsin.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
