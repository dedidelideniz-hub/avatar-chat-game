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
  Hammer,
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
import type { LucideIcon } from "lucide-react";
import type { BattleFighter } from "@/components/world/Arena3D";
// Yakın dövüş (melee) yuvasının bekleme halkası aynı sabitten ölçeklenir.
import { MELEE_CD } from "@/engine/RoyalMelee";
// 🛡️ Kule ekonomisi: HUD düğmesi bu modülün TEK kaynağını okur (yanındaki
// ORİJİNAL harita kulesi, altın bakiyesi, kule seviyesi). Yeni kule modeli
// üretilmez — altın ödenince haritadaki kule aktifleşir / seviye atlar.
import {
  MAX_TOWER_LEVEL,
  isNearTowerUpgradable,
  nearPost,
  nearTowerScreenAnchor,
  nextTowerCost,
  nextTowerStats,
  setTowerWallet,
  towerGold,
  upgradeNearTower,
} from "@/engine/BattleTowers";
import { playSound } from "@/lib/sounds";
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
 * Yetenek ikonu anahtarı — hem React tarafı (`AbilityIcon`) hem de sahne
 * düğmelerinin görünüm işaretleri (bkz. battle/abilityButtonState.ts →
 * `abilityIconKey`) AYNI tabloyu okur. Yani HUD'un yetenek yuvası ile
 * sağ-alttaki yetenek düğmesi asla farklı ikon gösteremez.
 */
export type AbilityIconKey =
  | "bomb"
  | "heal"
  | "sparkle"
  | "bolt"
  | "flame"
  | "swords";

/** Emoji → tematik vektör ikon (tek kaynak). */
const ABILITY_ICONS: Record<AbilityIconKey, LucideIcon> = {
  bomb: Bomb,
  heal: HeartPulse,
  sparkle: Sparkles,
  bolt: Zap,
  flame: Flame,
  swords: Swords,
};

/**
 * Yetenek emojisi → ikon anahtarı.
 *
 * Yetenek tanımları (src/lib/shop.ts) emoji tutar ve savaş sahneleri HUD'a
 * yalnızca o emojiyi geçer; bu yüzden eşleme emoji üzerinden yapılır ve
 * arayüzde hiç emoji gösterilmez. Bilinmeyen yetenek güvenli varsayılana
 * (çapraz kılıç) düşer.
 */
export function abilityIconKey(emoji: string): AbilityIconKey {
  switch (emoji) {
    case "💥":
      return "bomb";
    case "💚":
      return "heal";
    case "✨":
      return "sparkle";
    case "⚡":
      return "bolt";
    case "🔥":
      return "flame";
    default:
      return "swords";
  }
}

/** Yetenek emojisini tematik vektör ikona çevirir. */
export function AbilityIcon({ emoji, size = 16 }: { emoji: string; size?: number }) {
  const Icon = ABILITY_ICONS[abilityIconKey(emoji)];
  return <Icon size={size} strokeWidth={2.1} />;
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

/**
 * ⚔️ YAKIN DÖVÜŞ EYLEM DÜĞMESİ — Kraliyet Savaşçısı'nın 3. yeteneği.
 *
 * Neden ayrı bir bindirme: sahne dosyalarının sağ-alt kontrol kümesinin JSX'i
 * (BattleScene / PvpBattleScene) düzenleme aracının dosya penceresinin dışında
 * kalıyor (aynı sınır `styles/moba-glass.css` başlığında yazılı). Bu yüzden
 * düğme, kümenin kavis geometrisiyle AYNI noktaya mutlak konumlanan bağımsız
 * bir katman olarak çizilir — dokunuş yine sahnenin kendi `actions.melee()`
 * eylemine gider. Yani kuralın/menzilin/hasarın tek kaynağı değişmez:
 * `arena/MeleeComponent` (sol/sağ kesişler + atlamalı bitirici).
 *
 * Görünürlük: yalnız Kraliyet Savaşçısı skini kuşanılı ve maç "fight"
 * fazındayken. Bekleme halkası ve yüzde okuması kare döngüsünde doğrudan
 * DOM'a yazılır (React yeniden çizimi yok — HUD'un genel deseni).
 */
export function MobaMeleeAction({ storeKey }: { storeKey: object }) {
  const store = useMobaStore(storeKey);
  const btn = useRef<HTMLButtonElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const pct = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!store) return;
    let raf = 0;
    const tick = () => {
      const l = store.live.current;
      const p = store.player.current;
      const wait = Math.max(0, p.meleeCd, p.meleeT);
      const ready = wait <= 0;
      if (btn.current) {
        // `hidden` React tarafında sabit tutulur: bu bileşen yeniden çizmez,
        // bayrağı kare döngüsü yazar (React aynı değeri diff'te görmez).
        btn.current.hidden = !(l.samurai && l.phase === "fight");
        toggleClass(btn.current, "is-ready", ready);
      }
      const charge = 1 - Math.min(1, wait / MELEE_CD);
      writeRing(ring.current, charge);
      writeText(pct.current, ready ? "" : `${Math.round(charge * 100)}%`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [store]);

  if (!store) return null;
  return (
    <button
      ref={btn}
      type="button"
      hidden
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        store.actions?.current.melee();
      }}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Yakın dövüş — kılıç saldırısı"
      className="battle-hud-melee moba-melee-action pointer-events-auto"
    >
      <span className="moba-slot-icon moba-melee-face" aria-hidden>
        <Swords size={24} strokeWidth={2.3} />
      </span>
      <span ref={pct} className="moba-melee-pct" />
      <svg viewBox="0 0 36 36" className="moba-slot-ring">
        <circle
          cx={18}
          cy={18}
          r={RING_R}
          fill="none"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth={2.6}
        />
        <circle
          ref={ring}
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
    </button>
  );
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
  const meleeSlot = useRef<HTMLDivElement>(null);
  const vitalsHp = useRef<HTMLSpanElement>(null);
  const vitalsXp = useRef<HTMLSpanElement>(null);
  const vitalsNum = useRef<HTMLSpanElement>(null);
  const burstRef = useRef<MobaBurstHandle>(null);
  // 💓 Kritik can uyarısı: kalp atışının son çalındığı an (ms). Can yalnız
  // kare döngüsünde okunduğu için sayaç da orada tutulur (yeni state yok).
  const lastBeat = useRef(0);
  // 🛡️ Kule istemi: haritanın orijinal kulesine yaklaşınca beliren düğme.
  const towerWrap = useRef<HTMLDivElement>(null);
  const towerBtn = useRef<HTMLButtonElement>(null);
  const towerTitle = useRef<HTMLSpanElement>(null);
  const towerCostEl = useRef<HTMLElement>(null);
  const towerPips = useRef<(HTMLElement | null)[]>([]);
  // Etiket metni yalnız seviye/fiyat değiştiğinde yazılır (writeText zaten
  // aynı değeri yazmıyor; bu ref döngüyü tamamen atlar).
  const towerLabel = useRef("");
  // Floating UI: istemin ölçüsü kare başına DEĞİL, göründüğü/etiket değiştiği
  // anda bir kez ölçülür (offsetWidth her karede okunursa zorlamalı yerleşim
  // tetiklenir). `wasOpen` yalnızca görünürlük geçişini yakalar.
  const towerSize = useRef({ w: 150, h: 46 });
  const towerMeasure = useRef(true);
  const wasOpen = useRef(false);
  const goldEl = useRef<HTMLSpanElement>(null);
  // Altın sayacı: referanstaki gibi sağ üstte. Profil reaktif okunur, yani
  // maç sırasında kazanılan para da anında yansır. Sahne açıkça bir bütçe
  // verdiyse (meta.gold — test sahasının sanal bütçesi) o kazanır.
  const profile = useQuery(api.profiles.getMyProfile);
  const gold = meta.gold ?? profile?.coins;
  // Taban bakiye ref'te tutulur: rAF döngüsü efekt kapsamına bağlı kalmadan
  // her karede GÜNCEL profili okur (kule alımında bakiye anında düşsün).
  const goldBase = useRef<number | undefined>(gold);
  goldBase.current = gold;

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

      // ── 🛡️ kule istemi + canlı altın bakiyesi ────────────────────────
      // ORİJİNAL harita kulesinin yanına gelindiğinde düğme belirir; altın
      // yetmezse kilitli görünür. Altın ANINDA düşer (towerGold = cüzdan −
      // harcanan), yani sayaç sağ üstte aynı karede azalır.
      const base = goldBase.current;
      if (base !== undefined) setTowerWallet(base);
      const cash = towerGold();
      if (base !== undefined) {
        writeText(goldEl.current, String(Math.floor(cash)));
      }
      const towerCost = nextTowerCost();
      const open = towerCost !== null && isNearTowerUpgradable();
      const poor = open && cash < (towerCost ?? 0);
      toggleClass(towerWrap.current, "moba-tower-wrap--on", open);
      toggleClass(towerWrap.current, "moba-tower-wrap--poor", poor);
      toggleClass(towerBtn.current, "moba-tower-buy--locked", poor);

      // ── KONUM: kapsül HARİTADAKİ kulenin tam üstünde süzülür (floating UI) ──
      // Hangi kuleye yaklaşırsan istem O kulenin tepesine bağlanır; ekran
      // kenarına değecekse içeride tutulur. İzdüşüm alınamazsa (kamera henüz
      // bağlanmadı / kule kameranın arkasında) `--float` sınıfı kalkar ve
      // CSS'teki yedek konum (kümenin üstü) geçerli olur.
      const wrapEl = towerWrap.current;
      const anchor = open ? nearTowerScreenAnchor() : null;
      if (wrapEl) {
        toggleClass(wrapEl, "moba-tower-wrap--float", anchor !== null);
        if (anchor) {
          if (towerMeasure.current || !wasOpen.current) {
            towerMeasure.current = false;
            towerSize.current = {
              w: wrapEl.offsetWidth,
              h: wrapEl.offsetHeight,
            };
          }
          const { w, h } = towerSize.current;
          const x = Math.min(
            Math.max(anchor.x - w / 2, 8),
            Math.max(8, anchor.w - w - 8),
          );
          const y = Math.min(
            Math.max(anchor.y - h - 18, 34),
            Math.max(34, anchor.h - h - 8),
          );
          wrapEl.style.translate = `${Math.round(x)}px ${Math.round(y)}px`;
        } else if (wasOpen.current && wrapEl.style.translate) {
          // İzdüşüm alınamadı (kule kameranın arkasında / kamera henüz bağlı
          // değil): BAYAT ofset bırakılmaz. Eskiden `translate` yalnız anchor
          // varken yazılıyordu; offset bir kez yazıldıktan sonra kalıcı
          // kalıyor ve istem yanlış yerde asılı kalıyordu.
          wrapEl.style.translate = "";
        }
      }
      wasOpen.current = open;

      const post = nearPost();
      if (open && post && towerCost !== null) {
        // Seviye pip'leri: kaçıncı seviyede olduğunu gösterir (metin yok).
        for (let i = 0; i < towerPips.current.length; i++) {
          toggleClass(
            towerPips.current[i],
            "moba-tower-buy-pip--on",
            post.level > i,
          );
        }
        const nextLevel = Math.min(MAX_TOWER_LEVEL, post.level + 1);
        const stats = nextTowerStats();
        const label = `${post.level}|${towerCost}|${nextLevel}`;
        if (towerLabel.current !== label) {
          towerLabel.current = label;
          // Başlık/fiyat uzunluğu değişti → kapsül genişliği değişir: bir
          // sonraki karede bir kez daha ölç (floating konum ortalanmış kalsın).
          towerMeasure.current = true;
          const title =
            post.level === 0 ? "Kuleyi Aktif Et" : "Kuleyi Güçlendir";
          writeText(towerTitle.current, title);
          writeText(towerCostEl.current, String(towerCost));
          if (towerBtn.current) {
            towerBtn.current.setAttribute(
              "aria-label",
              `${title} — ${towerCost} altın`,
            );
            // İstatistikler kompakt kapsülü büyütmesin: ipucunda durur.
            towerBtn.current.setAttribute(
              "title",
              stats
                ? `${title} · Sv. ${nextLevel} · ${stats.dmg} hasar · ${stats.hp} can · ${stats.range}px menzil`
                : title,
            );
          }
        }
      }

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

      // ── 💓 kritik can uyarısı (yalnız SESLİ) ───────────────────────────
      // Can %30'un altına düşünce alçak bir kalp atışı duyulur; %14'ün
      // altında hem hızlanır hem yükselir. Ekranda yeni bir uyarı katmanı
      // açılmaz — oyuncu görüşü kapanmadan sadece "tehlike" hisseder.
      const danger = l.phase === "fight" && l.ph > 0 && pct < 0.3;
      if (danger) {
        const critical = pct < 0.14;
        const gap = critical ? 620 : 1050;
        const now = performance.now();
        if (now - lastBeat.current > gap) {
          lastBeat.current = now;
          playSound("lowhp", { volume: critical ? 0.5 : 0.34 });
          // "lub-dub": ikinci vuruş 170 ms sonra, daha hafif.
          window.setTimeout(
            () => playSound("lowhp", { volume: critical ? 0.32 : 0.2 }),
            168,
          );
        }
      } else {
        // Tehlikeden çıkıldı: ilk vuruş, uyarı yeniden başladığında ~450 ms
        // sonra gelir (aniden pat diye girmez).
        lastBeat.current = performance.now() - 600;
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

  /**
   * 🛡️ Kuleyi aktif et / güçlendir — yalnız YAKINDAKİ orijinal kule için ve
   * altın yeterliyse. Yeni kule modeli kurulmaz: haritadaki kulenin seviyesi
   * artar (hasar + menzil + can). Ekonomi motoru tek kaynak olduğu için burada
   * yalnız geri bildirim (ses + duyuru) verilir.
   */
  const buildTower = () => {
    const cost = nextTowerCost();
    if (cost === null) return;
    if (towerGold() < cost) {
      playSound("error", { volume: 0.6 });
      return;
    }
    const wasPassive = (nearPost()?.level ?? 0) === 0;
    if (!upgradeNearTower()) return;
    // Kule geri bildirimi: ağır "inşa" sesi (alçak gövde + parıltı) ve altının
    // gerçekten düştüğünü duyuran kısa para çınlaması.
    playSound("towerUp", { volume: 0.9 });
    playSound("coin", { volume: 0.55, rate: 0.94 });
    burstRef.current?.burst("super", wasPassive ? "KULE AKTİF!" : "KULE GÜÇLENDİ!");
  };

  if (phase !== "fight") return null;

  return (
    <div className="moba-chrome pointer-events-none absolute inset-0 z-[9]">
      {/* ── üst şerit ── */}
      <div className="moba-top absolute inset-x-0 top-0 flex items-center gap-2 px-2 py-1 text-white sm:px-3">
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
              <span className="battle-hud-name moba-plate-name max-w-[22vw] truncate font-extrabold tracking-wide">
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
          <div className="moba-plate moba-plate--foe flex min-w-0 flex-row-reverse items-center gap-1.5">
            <span className="moba-plate-level flex shrink-0 items-center justify-center rounded-full font-black text-rose-100">
              {meta.opponentLevel}
            </span>
            <div className="flex min-w-0 flex-col items-end gap-0.5">
              <span className="battle-hud-name moba-plate-name max-w-[22vw] truncate font-extrabold tracking-wide">
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
              <span ref={goldEl} className="tabular-nums">
                {Math.floor(gold)}
              </span>
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

      {/* ── 🛡️ KULE İSTEMİ ──
          Oyuncu HARİTANIN KENDİ ORİJİNAL kulesine yaklaştığında belirir.
          Altın yetmiyorsa kilitli görünür; uzaklaşınca kaybolur. Yeni kule
          kurulmaz: altın, o kulenin aktifleşmesi / seviye atlaması için
          harcanır. Görünürlük, kilit ve etiket tek rAF döngüsünde DOM'a
          yazılır (kare başına React çizimi yok). */}
      <div ref={towerWrap} className="moba-tower-wrap absolute">
        {/* Kompakt kapsül: tek satır (ikon · başlık · seviye pip'leri · fiyat).
            Detay istatistikler `title` ipucundadır — savaş alanı kapanmaz. */}
        <span className="moba-tower-buy-hint">Altın yetersiz</span>
        <button
          ref={towerBtn}
          type="button"
          onClick={buildTower}
          className="moba-tower-buy pointer-events-auto"
          aria-label="Kuleyi güçlendir"
        >
          <span className="moba-tower-buy-icon" aria-hidden>
            <Hammer size={13} strokeWidth={2.5} />
          </span>
          <span ref={towerTitle} className="moba-tower-buy-title">
            Kuleyi Aktif Et
          </span>
          <span className="moba-tower-buy-pips" aria-hidden>
            {[0, 1, 2].map((i) => (
              <i
                key={i}
                ref={(el) => {
                  towerPips.current[i] = el;
                }}
                className="moba-tower-buy-pip"
              />
            ))}
          </span>
          <span className="moba-tower-buy-cost">
            <Coins size={11} strokeWidth={2.8} />
            <b ref={towerCostEl} className="tabular-nums">
              —
            </b>
          </span>
        </button>
      </div>

      {/* ── alt yetenek barı ── */}
      <div className="moba-abilitybar absolute bottom-2 left-1/2 flex -translate-x-1/2 items-end gap-2">
        <span className="moba-level-badge">{meta.playerLevel}</span>
        <div className="flex items-end gap-1.5">
          {/* Kraliyet Savaşçısı: YAKIN DÖVÜŞ yuvası — DURUM GÖSTERGESİ.
              Asıl eylem düğmesi sağ-alt kümenin kavisindedir (bkz.
              `MobaMeleeAction`); buradaki yuva yalnız bekleme halkasını okur,
              yani aynı yetenek için ekranda iki düğme olmaz. */}
          {samurai && (
            <div
              ref={meleeSlot}
              title="Yakın dövüş (kılıç saldırısı)"
              className="moba-slot moba-slot--melee"
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
            </div>
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
