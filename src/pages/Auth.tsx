import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  CrestEmblem,
  GameBackdrop,
  GameFooter,
  GameHeader,
  HexGate,
  RuneHalo,
} from "@/components/entry/GameChrome";
import { useAuth } from "@/hooks/use-auth";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Mail,
  ShieldCheck,
  Swords,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

/**
 * Giriş sonrası varış noktası.
 *
 * `returnTo` yalnızca site İÇİ bir yolsa kabul edilir (açık yönlendirme
 * koruması: `//evil.com` reddedilir). Varsayılan, oyunun gerçek giriş kapısı
 * olan `/entry`dir — ana sayfaya geri dönüp oyuncuyu döngüde bırakmayız.
 */
function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/entry",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

/** Ana eylem düğmesi — ana sayfa ve oyun girişindekiyle aynı altın gradyan. */
const PRIMARY_BUTTON =
  "h-12 w-full rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 text-sm font-black tracking-wide text-[#22160a] shadow-[0_10px_30px_-12px_rgba(224,178,92,0.9)] hover:from-amber-200 hover:to-orange-400";

/** İkincil (koyu) düğme — cam görünümlü. */
const GHOST_BUTTON =
  "h-12 w-full rounded-2xl border-white/15 bg-white/5 text-sm font-extrabold text-white hover:bg-white/10 hover:text-white";

/** Karanlık zeminde okunabilen giriş alanı. */
const INPUT_CLASS =
  "h-12 rounded-2xl border-white/15 bg-black/40 px-3.5 text-base text-white placeholder:text-white/25 focus-visible:border-amber-300/60 focus-visible:ring-amber-300/25 md:text-base";

/** Kod kutuları: her rakam kendi yuvarlak kutusunda. */
const OTP_SLOT_CLASS =
  "h-12 w-11 rounded-2xl border border-white/15 bg-black/40 text-base font-black text-white shadow-none first:rounded-l-2xl last:rounded-r-2xl data-[active=true]:border-amber-300/70 data-[active=true]:ring-amber-300/25";

/** Form kartının üstündeki bölüm etiketi. */
function StepBadge({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-amber-300/25 bg-amber-300/10 text-amber-300">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/70">
          {title}
        </p>
        <p className="truncate text-[10px] font-bold text-white/35">{detail}</p>
      </div>
    </div>
  );
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Doğrulama kodu gönderilemedi. Lütfen tekrar dene.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);

      navigate(redirect);
    } catch (error) {
      console.error("OTP verification error:", error);

      setError("Girdiğin doğrulama kodu yanlış.");
      setIsLoading(false);

      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (error) {
      console.error("Guest login error:", error);
      setError(
        error instanceof Error
          ? `Misafir girişi başarısız: ${error.message}`
          : "Misafir girişi başarısız. Lütfen tekrar dene.",
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[#05070f] text-white">
      <GameBackdrop />

      {/* Kapının arkasındaki altın parıltı */}
      <div className="pointer-events-none absolute -top-24 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-amber-400/10 blur-3xl" />

      {/* ── üst şerit ─────────────────────────────────────────────── */}
      <GameHeader
        subtitle="Sezon 1 • Hesap kapısı"
        right={
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-extrabold text-white/80 backdrop-blur-sm transition-colors active:bg-white/10 sm:hover:bg-white/10"
          >
            <ArrowLeft className="size-3.5 text-amber-300" />
            ANA SAYFA
          </button>
        }
      />

      {/* ── orta: rift kapısı + form ──────────────────────────────── */}
      <main className="entry-main relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-4 py-3 sm:px-6">
        <div className="entry-stage entry-stage-form relative flex shrink-0 items-center justify-center">
          <RuneHalo />
          <HexGate>
            <CrestEmblem
              label={step === "signIn" ? "Hesap kapısı" : "Kod doğrulama"}
            />
          </HexGate>
        </div>

        <div className="entry-side flex w-full flex-col items-center gap-3">
          <div className="text-center">
            <h1
              className="entry-headline battle-load-slam flex items-center justify-center gap-3 text-4xl font-black tracking-[0.16em] sm:text-5xl"
              style={{
                textShadow:
                  "0 0 26px rgba(224,178,92,0.55), 0 4px 0 rgba(9,13,24,0.95)",
              }}
            >
              <Swords className="size-6 shrink-0 text-amber-300 sm:size-8" />
              VAELOS
            </h1>
            <p className="mt-2 text-[10px] font-extrabold uppercase tracking-[0.34em] text-white/45 sm:text-[11px]">
              {step === "signIn"
                ? "Savaş alanına giriş"
                : "E-postanı kontrol et"}
            </p>
          </div>

          {/* ── form kartı ────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-full rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.95)] backdrop-blur-sm"
          >
            {step === "signIn" ? (
              <>
                <StepBadge
                  icon={Mail}
                  title="E-posta ile giriş / kayıt"
                  detail="İlk girişte hesabın otomatik açılır."
                />

                <form onSubmit={handleEmailSubmit} className="mt-3">
                  <label
                    htmlFor="auth-email"
                    className="block text-[10px] font-extrabold uppercase tracking-[0.22em] text-amber-200/80"
                  >
                    E-posta adresi
                  </label>
                  <div className="mt-1.5 flex items-stretch gap-2">
                    <Input
                      id="auth-email"
                      name="email"
                      type="email"
                      required
                      inputMode="email"
                      autoComplete="email"
                      placeholder="oyuncu@ornek.com"
                      disabled={isLoading}
                      className={`flex-1 ${INPUT_CLASS}`}
                    />
                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="h-12 shrink-0 rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 px-3.5 text-sm font-black tracking-wide text-[#22160a] shadow-[0_10px_30px_-12px_rgba(224,178,92,0.9)] hover:from-amber-200 hover:to-orange-400"
                    >
                      {isLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          <span className="hidden sm:inline">KOD GÖNDER</span>
                          <span className="sm:hidden">GÖNDER</span>
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                  </div>

                  {error && (
                    <p className="mt-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[11px] font-bold leading-4 text-red-200">
                      {error}
                    </p>
                  )}
                </form>

                <div className="my-3 flex items-center gap-3">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">
                    ya da
                  </span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGuestLogin}
                  disabled={isLoading}
                  className={GHOST_BUTTON}
                >
                  <UserX className="size-4" />
                  MİSAFİR OLARAK OYNA
                </Button>
                <p className="mt-2 text-center text-[10px] font-bold leading-4 text-white/35">
                  Misafir hesaplar bu cihaza bağlıdır · ilerlemeni korumak için
                  e-posta ile giriş yap.
                </p>
              </>
            ) : (
              <>
                <StepBadge
                  icon={ShieldCheck}
                  title="Doğrulama kodu"
                  detail="6 haneli kodu gir, kapı açılsın."
                />

                <form onSubmit={handleOtpSubmit} className="mt-3">
                  <input type="hidden" name="email" value={step.email} />
                  <input type="hidden" name="code" value={otp} />

                  <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">
                      Kod gönderildi
                    </p>
                    <p className="truncate text-[12px] font-black text-amber-200">
                      {step.email}
                    </p>
                  </div>

                  <div className="mt-3 flex justify-center">
                    <InputOTP
                      value={otp}
                      onChange={setOtp}
                      maxLength={6}
                      disabled={isLoading}
                      containerClassName="gap-2 justify-center"
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          otp.length === 6 &&
                          !isLoading
                        ) {
                          // En yakın formu gönder (Enter ile doğrula).
                          const form = (e.target as HTMLElement).closest(
                            "form",
                          );
                          if (form) {
                            form.requestSubmit();
                          }
                        }
                      }}
                    >
                      <InputOTPGroup className="gap-2">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot
                            key={index}
                            index={index}
                            className={OTP_SLOT_CLASS}
                          />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {error && (
                    <p className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-center text-[11px] font-bold text-red-200">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={isLoading || otp.length !== 6}
                    className={`mt-3 ${PRIMARY_BUTTON}`}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        DOĞRULANIYOR...
                      </>
                    ) : (
                      <>
                        KODU DOĞRULA
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>

                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setError(null);
                        setOtp("");
                        setStep("signIn");
                      }}
                      disabled={isLoading}
                      className="h-11 flex-1 rounded-2xl border-white/15 bg-white/5 text-xs font-extrabold text-white hover:bg-white/10 hover:text-white"
                    >
                      Farklı e-posta
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setError(null);
                        setOtp("");
                        setStep("signIn");
                      }}
                      disabled={isLoading}
                      className="h-11 flex-1 rounded-2xl border-white/15 bg-white/5 text-xs font-extrabold text-white hover:bg-white/10 hover:text-white"
                    >
                      Yeniden gönder
                    </Button>
                  </div>
                </form>
              </>
            )}

            <p className="mt-3 border-t border-white/10 pt-2.5 text-center text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">
              🔒 Güvenli giriş ·{" "}
              <a
                href="https://freebuff.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/40 underline transition-colors hover:text-amber-200"
              >
                freebuff.com
              </a>
            </p>
          </motion.div>
        </div>
      </main>

      <GameFooter />
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
