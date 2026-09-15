import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Maximize, MoveHorizontal, Smartphone } from "lucide-react";

/**
 * Yönerge ekranındaki "Savaştan çık" düğmesi bu pencere olayını yayar;
 * savaş sahneleri dinleyip kendi `onExit`'lerini çağırır (telefonu yan
 * çeviremeyen oyuncu — örn. ekran kilidi açıkken — burada kilitli kalmasın).
 */
export const DUEL_LEAVE_EVENT = "duel:leave";

/**
 * Savaş alanı yatay (landscape) düzen için tasarlandı. Bu modül hem ekran
 * yönünü canlı izleyen hook'u hem de telefon dikeyken gösterilen "yan çevir"
 * yönerge ekranını sağlar.
 *
 * Oyuncu telefonu yan çevirmeden yükleme ilerlemez ve savaş simülasyonu
 * durur — yani oyun gerçekten başlamaz (bkz. BattleScene / PvpBattleScene).
 */
export type LandscapeState = {
  /** Ekran dikey mi (yükseklik > genişlik)? */
  portrait: boolean;
  /** Yatay mod zorunlu mu (dikey + telefon/tablet ya da telefon ölçülü ekran)? */
  required: boolean;
  /** Dokunmatik giriş var mı — yönerge metni buna göre değişir. */
  touch: boolean;
  /** Telefonun yatay modu: viewport kısa, HUD/çerçeve kırpılır. */
  compact: boolean;
  /** Tarayıcı ekran yönünü kilitleyebiliyor mu (Android/Chrome). */
  canLock: boolean;
};

/** Bazı tarayıcılarda `screen.orientation.lock` var, ama TS lib'inde yok. */
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
};

function getOrientation(): LockableOrientation | null {
  if (typeof screen === "undefined") return null;
  return (screen.orientation as LockableOrientation | undefined) ?? null;
}

/**
 * Android APK'daki MainActivity'nin enjekte ettiği ekran yönü köprüsü.
 * Normal tarayıcı sürümünde hiç bulunmaz; bu yüzden her çağrı varlık
 * kontrolünden geçer ve asla hata fırlatmaz — web davranışı bozulmaz.
 */
type AndroidOrientationBridge = {
  landscape?: () => void;
  portrait?: () => void;
};

function androidBridge(): AndroidOrientationBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (
    window as unknown as { AndroidOrientation?: AndroidOrientationBridge }
  ).AndroidOrientation;
  return bridge ?? null;
}

/** Android APK'yı yatay (savaş alanı) moduna alır. Web'de sessizce geçer. */
// eslint-disable-next-line react-refresh/only-export-components
export function lockAndroidLandscape() {
  try {
    androidBridge()?.landscape?.();
  } catch {
    // Köprü yok ya da çağrı reddedildi: mevcut web davranışı aynen sürer.
  }
}

/** Android APK'yı dikey (uygulama) moduna döndürür. Web'de sessizce geçer. */
// eslint-disable-next-line react-refresh/only-export-components
export function lockAndroidPortrait() {
  try {
    androidBridge()?.portrait?.();
  } catch {
    // Köprü yok ya da çağrı reddedildi: mevcut web davranışı aynen sürer.
  }
}

// Savaş alanına bağlı sahne sayısı ve bekleyen "dikeye dön" zamanlayıcısı.
let activeBattles = 0;
let portraitTimer: number | null = null;

function cancelPortraitRestore() {
  if (portraitTimer === null) return;
  window.clearTimeout(portraitTimer);
  portraitTimer = null;
}

function schedulePortraitRestore() {
  cancelPortraitRestore();
  portraitTimer = window.setTimeout(() => {
    portraitTimer = null;
    // Bu arada yeni bir savaş alanı bağlanmadıysa uygulama dikeye döner.
    if (activeBattles === 0) lockAndroidPortrait();
  }, 150);
}

/**
 * Savaş alanına giriş/çıkışta Android APK'nın ekran yönünü yönetir: sahne
 * bağlanınca yatay, savaş alanından çıkılınca tekrar dikey.
 *
 * Dikeye dönüş kısa bir gecikmeyle yapılır ve sahne bu arada yeniden
 * bağlanırsa iptal edilir; böylece bir düellodan diğerine geçerken ya da
 * React StrictMode'un geliştirme modundaki mount-unmount-mount döngüsünde
 * ekran gereksiz yere dikeye dönmez. Tarayıcıda köprü olmadığı için hiçbir
 * yan etkisi yoktur.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useAndroidBattleOrientation() {
  useEffect(() => {
    activeBattles += 1;
    cancelPortraitRestore();
    lockAndroidLandscape();
    return () => {
      activeBattles -= 1;
      if (activeBattles > 0) return;
      activeBattles = 0;
      schedulePortraitRestore();
    };
  }, []);
}

function readState(): LandscapeState {
  if (typeof window === "undefined") {
    return {
      portrait: false,
      required: false,
      touch: false,
      compact: false,
      canLock: false,
    };
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  const mq = window.matchMedia?.("(orientation: portrait)");
  const portrait = mq ? mq.matches : h > w;
  const touch =
    (window.matchMedia?.("(pointer: coarse)").matches ?? false) ||
    (navigator.maxTouchPoints ?? 0) > 0;
  // Dikey pencereli masaüstü tarayıcılar zorlanmaz: kapı yalnızca gerçek
  // dokunmatik cihazlarda (telefon/tablet) ya da telefon ölçüsündeki dar
  // ekranlarda kapanır.
  const phoneish = Math.min(w, h) <= 560;
  const orientation = getOrientation();
  return {
    portrait,
    required: portrait && (touch || phoneish),
    touch,
    compact: !portrait && Math.min(w, h) <= 560,
    // Android APK': native köprü varsa yatay kilidi o taraf üstlenir, bu
    // yüzden "Tam ekran yap ve yataya kilitle" düğmesi orada da gösterilir.
    canLock:
      (!!orientation && typeof orientation.lock === "function") ||
      androidBridge() !== null,
  };
}

/** Ekran yönünü canlı izler ve yatay mod gerekip gerekmediğini döndürür. */
// eslint-disable-next-line react-refresh/only-export-components
export function useLandscapeGate(): LandscapeState {
  const [state, setState] = useState<LandscapeState>(readState);

  useEffect(() => {
    const update = () =>
      setState((prev) => {
        const next = readState();
        return prev.portrait === next.portrait &&
          prev.required === next.required &&
          prev.touch === next.touch &&
          prev.compact === next.compact &&
          prev.canLock === next.canLock
          ? prev
          : next;
      });
    update();
    const mq = window.matchMedia?.("(orientation: portrait)");
    mq?.addEventListener("change", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      mq?.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return state;
}

/**
 * Telefon dikeyken tüm savaş alanını kaplayan yönerge ekranı. Kapalı
 * değilken altta kalan hiçbir kontrole dokunulamaz, bu yüzden oyuncu
 * yanlışlıkla yarım ekranla oynamaya başlamaz.
 */
export function LandscapeGate({
  visible,
  touch = true,
  canLock = false,
}: {
  visible: boolean;
  touch?: boolean;
  canLock?: boolean;
}) {
  const goLandscape = async () => {
    // Android APK: köprü varsa önce native ekran yönünü yataya çevir.
    lockAndroidLandscape();
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen();
      }
      const orientation = getOrientation();
      if (orientation?.lock) await orientation.lock("landscape");
    } catch {
      // Tarayıcı izin vermiyorsa sessizce geç: yönerge metni yeterli.
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          role="dialog"
          aria-modal="true"
          aria-label="Telefonu yan çevir"
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-[#0b1020] px-6 text-center text-white"
        >
          <div className="battle-load-grid pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(3,6,16,0.88)_100%)]" />

          <motion.div
            initial={{ scale: 0.9, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="relative flex flex-col items-center gap-5"
          >
            {/* yan çevirme animasyonu — telefon sola devrilip geri geliyor */}
            <div className="flex items-center justify-center gap-3">
              <MoveHorizontal className="rotate-phone-arrow size-7 text-sky-400" />
              <div className="relative flex size-24 items-center justify-center rounded-3xl border-2 border-sky-400/40 bg-sky-400/10 shadow-[0_0_40px_rgba(56,189,248,0.28)]">
                <span className="rotate-phone-icon text-sky-300">
                  <Smartphone className="size-12" />
                </span>
              </div>
              <MoveHorizontal className="rotate-phone-arrow size-7 text-sky-400" />
            </div>

            <div>
              <span className="inline-block rounded-full border border-amber-300/60 bg-amber-400/15 px-3 py-1 text-[11px] font-black tracking-[0.2em] text-amber-300">
                YATAY MOD
              </span>
              <h2 className="mt-3 text-2xl font-black tracking-wide sm:text-3xl">
                {touch ? "TELEFONU YAN ÇEVİR" : "PENCEREYİ GENİŞLET"}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm font-semibold text-slate-300">
                Savaş alanı yatay düzende oynanır. Ekran yatay olduğu anda
                savaş kaldığı yerden devam eder.
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-bold text-slate-300">
              <span className="size-2 animate-pulse rounded-full bg-amber-400" />
              Oyun, ekran yatay olana kadar duraklatıldı
            </div>

            <div className="flex flex-col items-center gap-3">
              {touch && canLock && (
                <button
                  type="button"
                  onClick={() => void goLandscape()}
                  className="flex items-center gap-2 rounded-full border border-sky-400/50 bg-sky-500/20 px-5 py-2.5 text-xs font-extrabold tracking-wide text-sky-200 transition-colors active:bg-sky-500/30"
                >
                  <Maximize className="size-4" />
                  Tam ekran yap ve yataya kilitle
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent(DUEL_LEAVE_EVENT))
                }
                className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 underline underline-offset-4 transition-colors active:text-slate-200"
              >
                <LogOut className="size-3.5" />
                Savaştan çık
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
