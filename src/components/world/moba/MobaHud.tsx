// MOBA HUD — Wild Rift / LoL Mobile tarzı savaş alanı arayüzü.
//
// Referans ekrandaki dili kurar:
//   • Üst şerit: solda eşya karoları + oyuncu plakası, ortada VAELOS arması ve
//     iki yanında skor kutuları + maç saati, sağda rakip plakası, altın
//     sayacı ve ikon butonları.
//   • Sol üstte yuvarlak arena minimap'i (oyuncu işareti, düşman noktası,
//     görüş halkası).
//   • Sağda dikey ikon rayı (tepkiler + rakip kartı).
//   • Alt ortada yetenek barı: seviye rozeti, düz vuruş/yetenek/ulti yuvaları
//     (bekleme süresi halkasıyla) ve can/XP çubuğu.
//   • Rakip kartı: altın çerçeveli, üzerinden ışık süpürmesi geçen MOBA kartı.
//   • Uçan tepki baloncukları + ortada beceri duyurusu ("SÜPER YETENEK!").
//
// MİMARİ NOTU: savaş simülasyonu kare döngüsünde yalnızca ref'leri mutasyona
// uğratır ve kasıtlı olarak HUD için React state'i güncellemez. Bu yüzden HUD
// state ile beslenmez: sahne bir "store" kaydeder (sim ref'leri + her çizimde
// tazelenen `live` nesnesi) ve HUD bu değerleri tek bir rAF döngüsünde okuyup
// doğrudan DOM'a yazar. Değişen sayı yoksa DOM'a hiç dokunulmaz, yani savaş
// alanı ekstra React çizimi yapmaz.
//
// Kurulum: sahne `registerMobaHud(joystickRef, store)` çağrısı yapar ve HUD'u
// joystick katmanı (`BattleJoystick`) arena üzerine bindirir.
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { MutableRefObject, ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
// Emoji butonlar kaldırıldı: yetenek yuvaları ve HUD düğmeleri artık ciddi,
// tematik vektör ikonlar kullanır (oyun tanımları emoji tutmaya devam eder,
// eşleme aşağıdaki `AbilityIcon` ile yapılır).
import {
  Bomb,
  Coins,
  Crown,
  EyeOff,
  Flame,
  HeartPulse,
  LogOut,
  ScrollText,
  Shield,
  Smile,
  Sparkles,
  Sword,
  Swords,
  Zap,
} from "lucide-react";
import type { BattleFighter } from "@/components/world/Arena3D";
// Yakın dövüş (melee) yuvasının bekleme halkası aynı sabitten ölçeklenir.
import { MELEE_CD } from "@/engine/RoyalMelee";
import { cn } from "@/lib/utils";
// Cam (glassmorphism) katmanı: index.css'in sonundaki HUD bloklarını bu dosya
// günceller (index.css düzenleme aracının pencere sınırının dışında kalıyor).
import "@/styles/moba-glass.css";

/** Arena: 50 px = 1 birim (Arena3D `S`), saha 34 x 22 birim. */
const S = 50;
const ARENA_W = 34;
const ARENA_D = 22;

/** Bekleme süresi halkası geometrisi (viewBox 36x36). */
const RING_R = 15.5;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Yetenek emojisi → tematik vektör ikon.
 *
 * Yetenek tanımları (src/lib/shop.ts) emoji tutar ve savaş sahneleri HUD'a
 * yalnızca o emojiyi geçer; bu yüzden eşleme emoji üzerinden yapılır ve
 * arayüzde hiç emoji gösterilmez.
 */
function AbilityIcon({ emoji, size = 16 }: { emoji: string; size?: number }) {
  const props = { size, strokeWidth: 2.1 } as const;
  switch (emoji) {
    case "💥":
      return <Bomb {...props} />;
    case "💚":
      return <HeartPulse {...props} />;
    case "✨":
      return <Sparkles {...props} />;
    case "⚡":
      return <Zap {...props} />;
    case "🔥":
      return <Flame {...props} />;
    default:
      return <Swords {...props} />;
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const clockLabel = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60,
  ).padStart(2, "0")}`;
};

/* ------------------------------------------------------------------ */
/* Savaş alanı HUD köprüsü (store)                                     */
/* ------------------------------------------------------------------ */

/** Sahnenin her çizimde tazelediği canlı değerler. */
export interface MobaHudLive {
  /** "waiting": PvP'de rakibi beklerken (bkz. PvpBattleScene fazları). */
  phase: "loading" | "waiting" | "fight";
  clock: number;
  vsShow: boolean;
  ph: number;
  ohp: number;
  pc: number;
  oc: number;
  sc: number;
  atkReady: boolean;
  samurai: boolean;
  /** Bush gizlenmesi: oyuncu görünmezken HUD rozetini açar. */
  hidden: boolean;
}

export interface MobaHudMeta {
  playerName: string;
  opponentName: string;
  playerEmoji: string;
  opponentEmoji: string;
  playerLevel: number;
  opponentLevel: number;
  maxHp: number;
  /** Düz vuruş bekleme süresi (saniye) — halkanın ölçeği. */
  atkCd: number;
  gold?: number;
  exit: () => void;
}

/** Sahnenin yetenek barı yuvalarının çağırdığı eylemler. */
export interface MobaHudActions {
  super: () => void;
  samuraiSuper: () => void;
  melee: () => void;
}

export interface MobaHudStore {
  player: MutableRefObject<BattleFighter>;
  bot: MutableRefObject<BattleFighter>;
  live: MutableRefObject<MobaHudLive>;
  /** İki tarafın isabet skoru (üst şeritteki MOBA skor tablosu). */
  score: MutableRefObject<{ p: number; o: number }>;
  /** Yuvaların bağlandığı sahne eylemleri (yalnız yakın dövüş yuvası için). */
  actions?: MutableRefObject<MobaHudActions>;
  meta: MobaHudMeta;
}

/* Store, joystick ref'i anahtarıyla kaydedilir: iki savaş sahnesi (bot
 * düellosu ve PvP) aynı modülü kullandığı için anahtar çakışması olmaz ve
 * HUD'u render eden katman (joystick) hangi sahneye ait olduğunu bilir. */
const stores = new WeakMap<object, MobaHudStore>();

export function registerMobaHud(key: object, store: MobaHudStore): () => void {
  stores.set(key, store);
  return () => {
    stores.delete(key);
  };
}

/** Store hazır olana kadar kısa aralıklarla yoklar (ilk karede null döner). */
function useMobaStore(key: object): MobaHudStore | null {
  const [store, setStore] = useState<MobaHudStore | null>(
    () => stores.get(key) ?? null,
  );
  useEffect(() => {
    if (store) return;
    const t = window.setInterval(() => {
      const found = stores.get(key);
      if (found) {
        setStore(found);
        window.clearInterval(t);
      }
    }, 150);
    return () => window.clearInterval(t);
  }, [key, store]);
  return store;
}

/* ------------------------------------------------------------------ */
/* Görevli DOM yardımcıları (tek rAF döngüsü için)                     */
/* ------------------------------------------------------------------ */

function writeText(el: HTMLElement | null, value: string) {
  if (el && el.textContent !== value) el.textContent = value;
}

function writeWidth(el: HTMLElement | null, pct: number) {
  const v = `${(clamp01(pct) * 100).toFixed(1)}%`;
  if (el && el.style.width !== v) el.style.width = v;
}

function writeRing(el: SVGCircleElement | null, ready: number) {
  if (!el) return;
  const offset = String(RING_C * (1 - clamp01(ready)));
  if (el.getAttribute("stroke-dashoffset") !== offset) {
    el.setAttribute("stroke-dashoffset", offset);
  }
}

function toggleClass(el: HTMLElement | null, name: string, on: boolean) {
  if (el && el.classList.contains(name) !== on) el.classList.toggle(name, on);
}

/* ------------------------------------------------------------------ */
/* Uçan tepkiler + beceri duyurusu                                     */
/* ------------------------------------------------------------------ */

export type MobaBurstIcon =
  | "super"
  | "kill"
  | "hurt"
  | "clash"
  | "smile"
  | "fire";

/** Uçan tepkilerin ikonları (emoji yerine vektör). */
const BURST_ICONS: Record<MobaBurstIcon, ReactNode> = {
  super: <Sparkles size={22} strokeWidth={2.2} />,
  kill: <Crown size={22} strokeWidth={2.2} />,
  hurt: <Bomb size={22} strokeWidth={2.2} />,
  clash: <Swords size={22} strokeWidth={2.2} />,
  smile: <Smile size={22} strokeWidth={2.2} />,
  fire: <Flame size={22} strokeWidth={2.2} />,
};

export interface MobaBurstHandle {
  /** Arena üzerinde tematik bir ikon uçurur; `label` verilirse duyuru çıkar. */
  burst(icon: MobaBurstIcon, label?: string): void;
}

/** Uçuş yörüngeleri CSS'te (`.moba-floater--0…4`) tanımlıdır. */
const FLOATERS = [
  { left: 34 },
  { left: 44 },
  { left: 54 },
  { left: 62 },
  { left: 26 },
];

export const MobaEmoteBurst = forwardRef<MobaBurstHandle>(
  function MobaEmoteBurst(_props, ref) {
    const [floaters, setFloaters] = useState<
      { id: number; icon: MobaBurstIcon; i: number }[]
    >([]);
    const [banner, setBanner] = useState<{ id: number; text: string } | null>(
      null,
    );
    const seq = useRef(0);

    useImperativeHandle(ref, () => ({
      burst(icon: MobaBurstIcon, label?: string) {
        const id = ++seq.current;
        const i = id % FLOATERS.length;
        setFloaters((prev) => [...prev.slice(-5), { id, icon, i }]);
        window.setTimeout(() => {
          setFloaters((prev) => prev.filter((f) => f.id !== id));
        }, 1300);
        if (label) {
          setBanner({ id, text: label });
          window.setTimeout(() => {
            setBanner((prev) => (prev && prev.id === id ? null : prev));
          }, 1400);
        }
      },
    }));

    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {floaters.map((f) => (
          <span
            key={f.id}
            className={`moba-floater moba-floater--${f.i}`}
            style={{ left: `${FLOATERS[f.i].left}%` }}
          >
            {BURST_ICONS[f.icon]}
          </span>
        ))}
        {banner && (
          <div className="moba-banner-wrap absolute inset-x-0 top-[38%] flex justify-center">
            <span className="moba-banner">{banner.text}</span>
          </div>
        )}
      </div>
    );
  },
);

/* ------------------------------------------------------------------ */
/* Minimap                                                             */
/* ------------------------------------------------------------------ */

/**
 * Yuvarlak, MOBA dilinde arena haritası. Oyuncu işareti ve düşman noktası her
 * karede doğrudan simülasyon ref'lerinden okunur; React state kullanılmaz.
 */
function MobaArenaMap({
  playerRef,
  botRef,
}: {
  playerRef: MutableRefObject<BattleFighter>;
  botRef: MutableRefObject<BattleFighter>;
}) {
  const ally = useRef<SVGGElement>(null);
  const enemy = useRef<SVGCircleElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = playerRef.current;
      const b = botRef.current;
      if (ally.current && p) {
        ally.current.setAttribute(
          "transform",
          `translate(${(p.x / S).toFixed(2)} ${(p.y / S).toFixed(2)})`,
        );
      }
      if (enemy.current && b) {
        enemy.current.setAttribute("cx", (b.x / S).toFixed(2));
        enemy.current.setAttribute("cy", (b.y / S).toFixed(2));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playerRef, botRef]);

  return (
    <div className="moba-map pointer-events-none absolute left-2 top-2">
      <svg viewBox={`0 0 ${ARENA_W} ${ARENA_D}`} className="moba-map-svg">
        <defs>
          <radialGradient id="mobaMapGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2b3b5c" />
            <stop offset="100%" stopColor="#111826" />
          </radialGradient>
        </defs>
        <rect width={ARENA_W} height={ARENA_D} fill="url(#mobaMapGlow)" />
        {/* orman / kaya kütleleri */}
        <ellipse cx={7} cy={7.5} rx={5.6} ry={4.2} fill="#1d2b23" />
        <ellipse cx={27} cy={14.5} rx={5.4} ry={4.4} fill="#1d2b23" />
        <ellipse cx={17} cy={11} rx={4.2} ry={3.2} fill="#243244" />
        {/* koridor */}
        <path
          d="M4 3 L13 9 L21 15 L30 20"
          stroke="#3f5170"
          strokeWidth={3.2}
          fill="none"
          strokeLinecap="round"
        />
        {/* lav nehri */}
        <path
          d="M2 12.5 L11 16.5 L20 17.6 L30 18.4"
          stroke="#ff6a1f"
          strokeWidth={1.5}
          fill="none"
          strokeLinecap="round"
          opacity={0.9}
        />
        {/* üsler */}
        <rect
          x={6.4}
          y={0.4}
          width={3.2}
          height={3.2}
          rx={0.5}
          fill="#ff5a4a"
        />
        <rect
          x={24.4}
          y={18.4}
          width={3.2}
          height={3.2}
          rx={0.5}
          fill="#38c8ff"
        />
        {/* düşman işareti */}
        <circle
          ref={enemy}
          cx={26}
          cy={20}
          r={0.85}
          fill="#ff4d6d"
          stroke="#ffe0e6"
          strokeWidth={0.25}
        />
        {/* oyuncu: görüş halkası + konum işareti */}
        <g ref={ally}>
          <circle r={2.6} fill="#5ce1ff" opacity={0.16} />
          <circle r={1.6} fill="#5ce1ff" opacity={0.24} />
          <circle r={0.75} fill="#d9fbff" stroke="#0891b2" strokeWidth={0.28} />
        </g>
      </svg>
      <span className="moba-map-label">ARENA</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rakip kartı                                                         */
/* ------------------------------------------------------------------ */

function MobaOpponentCard({
  open,
  name,
  level,
  emoji,
  hpPct,
  tag,
  onStart,
  onClose,
}: {
  open: boolean;
  name: string;
  level: number;
  emoji: string;
  hpPct: number;
  tag: string;
  onStart: () => void;
  onClose: () => void;
}) {
  const [stats, setStats] = useState(false);
  if (!open) return null;
  return (
    <div className="moba-card-wrap absolute inset-0 z-[14] flex items-center justify-center">
      <div className="moba-card">
        {/* kartın üzerinden geçen altın ışık süpürmesi */}
        <span className="moba-card-sweep" aria-hidden />
        <div className="moba-card-head">
          <span className="moba-card-tag">
            <span className="moba-card-dot" aria-hidden />
            {tag}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kartı kapat"
            className="moba-icon-btn pointer-events-auto"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>

        <div className="moba-card-body">
          <div className="moba-card-avatar">
            <span className="moba-card-avatar-ring" aria-hidden />
            <span className="moba-card-avatar-face text-violet-200" aria-hidden>
              <AbilityIcon emoji={emoji} size={30} />
            </span>
            <span className="moba-card-level">{level}</span>
          </div>
          <div className="min-w-0">
            <p className="moba-card-name truncate">{name}</p>
            <p className="moba-card-sub flex items-center gap-1">
              Seviye {level} · Yetenek
              <AbilityIcon emoji={emoji} size={13} />
            </p>
            <div className="moba-card-hp">
              <span style={{ width: `${Math.round(clamp01(hpPct) * 100)}%` }} />
            </div>
          </div>
        </div>

        {stats && (
          <div className="moba-card-stats">
            <span>
              CAN <b>{Math.round(clamp01(hpPct) * 100)}%</b>
            </span>
            <span>
              SEVİYE <b>{level}</b>
            </span>
            <span className="inline-flex items-center gap-1">
              YETENEK
              <b className="inline-flex items-center">
                <AbilityIcon emoji={emoji} size={13} />
              </b>
            </span>
          </div>
        )}

        <div className="moba-card-actions">
          <button
            type="button"
            onClick={() => setStats((s) => !s)}
            className="moba-card-btn pointer-events-auto"
          >
            {stats ? "ÖZETİ GİZLE" : "İSTATİSTİK"}
          </button>
          <button
            type="button"
            onClick={onStart}
            className="moba-card-btn moba-card-btn--primary pointer-events-auto inline-flex items-center gap-1.5"
          >
            <Swords size={14} strokeWidth={2.4} aria-hidden />
            SAVAŞA BAŞLA
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Savaş alanı HUD'u                                                   */
/* ------------------------------------------------------------------ */

/** Eşya/yetenek karoları — referanstaki renkli karo sırası. */
const ITEM_CHIPS: { icon: ReactNode; tone: string }[] = [
  {
    icon: <Sword size={14} strokeWidth={2.2} />,
    tone: "from-violet-500/70 to-fuchsia-600/60",
  },
  {
    icon: <Flame size={14} strokeWidth={2.2} />,
    tone: "from-orange-500/70 to-red-600/60",
  },
  {
    icon: <Shield size={14} strokeWidth={2.2} />,
    tone: "from-emerald-500/70 to-teal-600/60",
  },
  {
    icon: <Zap size={14} strokeWidth={2.2} />,
    tone: "from-sky-500/70 to-indigo-600/60",
  },
];

/**
 * Arena üzerine bindirilen MOBA arayüzü. Sahne tarafından `BattleJoystick`
 * içinde render edilir (bkz. BattleScene/PvpBattleScene store kaydı).
 */
export function MobaArenaChrome({ storeKey }: { storeKey: object }) {
  const store = useMobaStore(storeKey);
  if (!store) return null;
  return <MobaChromeInner store={store} />;
}

function MobaChromeInner({ store }: { store: MobaHudStore }) {
  const { meta, live, score } = store;
  // ── HUD düğümleri (rAF döngüsü doğrudan bunlara yazar) ──
  const allyScore = useRef<HTMLSpanElement>(null);
  const enemyScore = useRef<HTMLSpanElement>(null);
  const clockEl = useRef<HTMLSpanElement>(null);
  const allyBar = useRef<HTMLSpanElement>(null);
  const enemyBar = useRef<HTMLSpanElement>(null);
  const allyHp = useRef<HTMLSpanElement>(null);
  const enemyHp = useRef<HTMLSpanElement>(null);
  const basicRing = useRef<SVGCircleElement>(null);
  const superRing = useRef<SVGCircleElement>(null);
  const ultRing = useRef<SVGCircleElement>(null);
  const meleeRing = useRef<SVGCircleElement>(null);
  const superSlot = useRef<HTMLDivElement>(null);
  const ultSlot = useRef<HTMLDivElement>(null);
  const meleeSlot = useRef<HTMLButtonElement>(null);
  const vitalsHp = useRef<HTMLSpanElement>(null);
  const vitalsXp = useRef<HTMLSpanElement>(null);
  const vitalsNum = useRef<HTMLSpanElement>(null);
  const burstRef = useRef<MobaBurstHandle>(null);
  // Altın sayacı: referanstaki gibi sağ üstte. Profil reaktif okunur, yani
  // maç sırasında kazanılan para da anında yansır (meta.gold varsa o kazanır).
  const profile = useQuery(api.profiles.getMyProfile);
  const gold = profile?.coins ?? meta.gold;

  // ── Nadiren değişen bayraklar (React state: kare başına çizim yok) ──
  const [phase, setPhase] = useState(live.current.phase);
  const [samurai, setSamurai] = useState(live.current.samurai);
  const [hidden, setHidden] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const flags = useRef({ phase, samurai, hidden, intro: false });

  useEffect(() => {
    let raf = 0;
    const prev = { pc: 0, ph: meta.maxHp, ohp: meta.maxHp };
    const tick = () => {
      const l = live.current;
      const s = score.current;
      const p = store.player.current;

      writeText(allyScore.current, String(s.p));
      writeText(enemyScore.current, String(s.o));
      writeText(clockEl.current, clockLabel(l.clock));

      const pct = l.ph / meta.maxHp;
      const opct = l.ohp / meta.maxHp;
      writeWidth(allyBar.current, pct);
      writeWidth(enemyBar.current, opct);
      writeText(allyHp.current, `${Math.round(clamp01(pct) * 100)}%`);
      writeText(enemyHp.current, `${Math.round(clamp01(opct) * 100)}%`);

      writeRing(basicRing.current, 1 - Math.max(0, p.atkCd) / meta.atkCd);
      writeRing(superRing.current, l.pc);
      writeRing(ultRing.current, l.sc);
      // ⚔️ Yakın dövüş: bekleme halkası doğrudan dövüşçü ref'inden okunur
      // (kare başına yeni state yok, sahne React çizimi yapmaz). Salınım
      // sürerken de kapalı kalır, yani animasyon bitmeden tekrar basılamaz.
      const meleeWait = Math.max(0, p.meleeCd, p.meleeT);
      writeRing(meleeRing.current, 1 - Math.min(1, meleeWait / MELEE_CD));
      toggleClass(superSlot.current, "moba-slot--glow", l.pc >= 1);
      toggleClass(ultSlot.current, "moba-slot--glow", l.sc >= 1);
      toggleClass(meleeSlot.current, "moba-slot--glow", meleeWait <= 0);

      writeWidth(vitalsHp.current, pct);
      writeWidth(vitalsXp.current, l.pc);
      writeText(vitalsNum.current, `${Math.round(l.ph)}/${meta.maxHp}`);

      // ── tepki tetikleyicileri: süper kullanımı, ağır hasar, devirme ──
      if (prev.pc >= 1 && l.pc < 0.2) {
        burstRef.current?.burst("super", "SÜPER YETENEK!");
      }
      if (prev.ohp > 0 && l.ohp <= 0) {
        burstRef.current?.burst("kill", "RAKİP DÜŞTÜ!");
      } else if (l.ph < prev.ph - 120) {
        burstRef.current?.burst("hurt");
      } else if (l.ohp < prev.ohp - 150) {
        burstRef.current?.burst("clash");
      }
      prev.pc = l.pc;
      prev.ph = l.ph;
      prev.ohp = l.ohp;

      // ── bayraklar (seyrek state güncellemesi) ──
      if (flags.current.phase !== l.phase) {
        flags.current.phase = l.phase;
        setPhase(l.phase);
      }
      if (flags.current.samurai !== l.samurai) {
        flags.current.samurai = l.samurai;
        setSamurai(l.samurai);
      }
      if (flags.current.hidden !== l.hidden) {
        flags.current.hidden = l.hidden;
        setHidden(l.hidden);
      }
      // Rakip kartı maç başında kendiliğinden açılır.
      if (l.phase === "fight" && l.vsShow && !flags.current.intro) {
        flags.current.intro = true;
        setCardOpen(true);
        window.setTimeout(() => setCardOpen(false), 3600);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, meta, score, store]);

  if (phase !== "fight") return null;

  return (
    <div className="moba-chrome pointer-events-none absolute inset-0 z-[9]">
      {/* ── üst şerit ── */}
      <div className="moba-top absolute inset-x-0 top-0 flex items-center gap-2 px-2 py-1.5 text-white sm:px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="moba-items hidden shrink-0 items-center gap-1 sm:flex">
            {ITEM_CHIPS.map((chip, i) => (
              <span
                key={i}
                className={cn("moba-item bg-gradient-to-br", chip.tone)}
              >
                {chip.icon}
              </span>
            ))}
          </div>
          <div className="moba-plate flex min-w-0 items-center gap-1.5">
            <span className="moba-plate-level flex shrink-0 items-center justify-center rounded-full font-black text-sky-100">
              {meta.playerLevel}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="battle-hud-name max-w-[22vw] truncate font-extrabold tracking-wide">
                {meta.playerName}
              </span>
              <span className="moba-plate-bar">
                <span
                  ref={allyBar}
                  className="moba-plate-bar-fill bg-gradient-to-r from-sky-500 to-cyan-300"
                />
              </span>
            </div>
          </div>
        </div>

        <div className="moba-center flex shrink-0 flex-col items-center">
          <div className="flex items-center gap-1.5">
            <span ref={allyScore} className="moba-score moba-score--ally">
              0
            </span>
            <div className="moba-logo">
              <span className="moba-logo-wing" aria-hidden>
                ❮
              </span>
              <span className="moba-logo-text">VAELOS</span>
              <span className="moba-logo-wing" aria-hidden>
                ❯
              </span>
            </div>
            <span ref={enemyScore} className="moba-score moba-score--enemy">
              0
            </span>
          </div>
          <span ref={clockEl} className="moba-clock">
            00:00
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <div className="moba-plate flex min-w-0 flex-row-reverse items-center gap-1.5">
            <span className="moba-plate-level flex shrink-0 items-center justify-center rounded-full font-black text-rose-100">
              {meta.opponentLevel}
            </span>
            <div className="flex min-w-0 flex-col items-end gap-0.5">
              <span className="battle-hud-name max-w-[22vw] truncate font-extrabold tracking-wide">
                {meta.opponentName}
              </span>
              <span className="moba-plate-bar">
                <span
                  ref={enemyBar}
                  className="moba-plate-bar-fill bg-gradient-to-l from-rose-500 to-orange-300"
                />
              </span>
            </div>
          </div>
          {gold !== undefined && (
            <span className="moba-gold shrink-0 items-center gap-1 font-extrabold">
              <Coins size={14} strokeWidth={2.4} className="text-amber-300" />
              <span className="tabular-nums">{Math.floor(gold)}</span>
            </span>
          )}
          <div className="flex shrink-0 items-center gap-1">
            <span
              ref={allyHp}
              className="moba-hpnum hidden font-extrabold tabular-nums sm:inline"
            >
              100%
            </span>
            <span
              ref={enemyHp}
              className="moba-hpnum hidden font-extrabold tabular-nums sm:inline"
            >
              100%
            </span>
            <button
              type="button"
              onClick={() => setCardOpen((v) => !v)}
              aria-pressed={cardOpen}
              aria-label="Rakip kartını aç"
              className={cn(
                "moba-icon-btn pointer-events-auto",
                cardOpen && "moba-icon-btn--on",
              )}
            >
              <ScrollText size={15} strokeWidth={2.2} aria-hidden />
            </button>
            <button
              type="button"
              onClick={meta.exit}
              aria-label="Savaştan çık"
              className="moba-icon-btn moba-icon-btn--danger pointer-events-auto"
            >
              <LogOut size={15} strokeWidth={2.2} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* ── minimap + sağ ray ── */}
      <MobaArenaMap playerRef={store.player} botRef={store.bot} />

      <div className="moba-rail pointer-events-auto absolute right-1.5 top-1/2 flex -translate-y-1/2 flex-col gap-1.5">
        <button
          type="button"
          onClick={() => burstRef.current?.burst("smile")}
          title="Gülen tepki gönder"
          aria-label="Gülen tepki gönder"
          className="moba-rail-btn"
        >
          <Smile size={18} strokeWidth={2.2} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => burstRef.current?.burst("fire")}
          title="Ateş tepkisi gönder"
          aria-label="Ateş tepkisi gönder"
          className="moba-rail-btn"
        >
          <Flame size={18} strokeWidth={2.2} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setCardOpen(true)}
          title="Rakip kartı"
          aria-label="Rakip kartını aç"
          className={cn("moba-rail-btn", cardOpen && "moba-rail-btn--on")}
        >
          <ScrollText size={18} strokeWidth={2.2} aria-hidden />
        </button>
      </div>

      {/* ── alt yetenek barı ── */}
      <div className="moba-abilitybar absolute bottom-2 left-1/2 flex -translate-x-1/2 items-end gap-2">
        <span className="moba-level-badge">{meta.playerLevel}</span>
        <div className="flex items-end gap-1.5">
          {/* Kraliyet Savaşçısı: YAKIN DÖVÜŞ yuvası (tek tık → sol/sağ
              çapraz kesişler, rakip yakınsa üstüne atlayan bitirici). */}
          {samurai && (
            <button
              ref={meleeSlot}
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                store.actions?.current.melee();
              }}
              title="Yakın dövüş (kılıç saldırısı)"
              aria-label="Yakın dövüş kılıç saldırısı"
              className="moba-slot moba-slot--melee pointer-events-auto"
            >
              <svg viewBox="0 0 36 36" className="moba-slot-ring">
                <circle
                  cx={18}
                  cy={18}
                  r={RING_R}
                  fill="none"
                  stroke="rgba(255,255,255,0.14)"
                  strokeWidth={2.6}
                />
                <circle
                  ref={meleeRing}
                  cx={18}
                  cy={18}
                  r={RING_R}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={0}
                  transform="rotate(-90 18 18)"
                />
              </svg>
              <span className="moba-slot-icon">
                <Swords size={22} strokeWidth={2.3} />
              </span>
            </button>
          )}
          <div className="moba-slot" title="Düz vuruş">
            <svg viewBox="0 0 36 36" className="moba-slot-ring">
              <circle
                cx={18}
                cy={18}
                r={RING_R}
                fill="none"
                stroke="rgba(255,255,255,0.14)"
                strokeWidth={2.6}
              />
              <circle
                ref={basicRing}
                cx={18}
                cy={18}
                r={RING_R}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={0}
                transform="rotate(-90 18 18)"
              />
            </svg>
            <span className="moba-slot-icon">
              <Sword size={22} strokeWidth={2.3} />
            </span>
          </div>
          <div className="moba-slot" title="Süper yetenek">
            <svg viewBox="0 0 36 36" className="moba-slot-ring">
              <circle
                cx={18}
                cy={18}
                r={RING_R}
                fill="none"
                stroke="rgba(255,255,255,0.14)"
                strokeWidth={2.6}
              />
              <circle
                ref={superRing}
                cx={18}
                cy={18}
                r={RING_R}
                fill="none"
                stroke="#facc15"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C}
                transform="rotate(-90 18 18)"
              />
            </svg>
            <span className="moba-slot-icon">
              <AbilityIcon emoji={meta.playerEmoji} size={22} />
            </span>
          </div>
          {samurai && (
            <div ref={ultSlot} className="moba-slot" title="Kraliyet ultisi">
              <svg viewBox="0 0 36 36" className="moba-slot-ring">
                <circle
                  cx={18}
                  cy={18}
                  r={RING_R}
                  fill="none"
                  stroke="rgba(255,255,255,0.14)"
                  strokeWidth={2.6}
                />
                <circle
                  ref={ultRing}
                  cx={18}
                  cy={18}
                  r={RING_R}
                  fill="none"
                  stroke="#fb923c"
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={RING_C}
                  transform="rotate(-90 18 18)"
                />
              </svg>
              <span className="moba-slot-icon">
                <Crown size={24} strokeWidth={2.3} />
              </span>
            </div>
          )}
        </div>
        <div className="moba-vitals flex flex-col gap-1">
          <span
            ref={vitalsNum}
            className="moba-vitals-num font-extrabold tabular-nums"
          >
            {meta.maxHp}/{meta.maxHp}
          </span>
          <span className="moba-vitals-bar">
            <span ref={vitalsHp} className="moba-vitals-hp" />
            <span ref={vitalsXp} className="moba-vitals-xp" />
          </span>
        </div>
      </div>

      {/* ── uçan tepkiler ── */}
      <MobaEmoteBurst ref={burstRef} />

      {/* ── rakip kartı ── */}
      <MobaOpponentCard
        open={cardOpen}
        name={meta.opponentName}
        level={meta.opponentLevel}
        emoji={meta.opponentEmoji}
        hpPct={live.current.ohp / meta.maxHp}
        tag={live.current.vsShow ? "MAÇ BAŞLIYOR" : "ONLINE"}
        onStart={() => setCardOpen(false)}
        onClose={() => setCardOpen(false)}
      />

      {/* ── gizlenme durumu (balon bir rozet) ── */}
      {hidden && (
        <div className="absolute inset-x-0 top-[52px] flex justify-center">
          <span className="battle-hidden-badge flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-950/75 px-4 py-1.5 text-xs font-extrabold tracking-wide text-emerald-200 shadow-lg backdrop-blur-sm">
            <EyeOff size={14} strokeWidth={2.4} aria-hidden />
            GİZLENDİN
          </span>
        </div>
      )}
    </div>
  );
}
