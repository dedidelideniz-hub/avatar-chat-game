// The Sanalika street — tap to walk, chat with vendors, shop with SP.
import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { EquippedItems } from "@/components/avatar/EquippedItems";
import { Button } from "@/components/ui/button";
import { BagSheet, ShopSheet, VipSheet } from "@/components/world/ShopSheets";
import BattleScene from "@/components/world/BattleScene";
import { ChatPanel, type ChatMessage } from "@/components/world/ChatPanel";
import { StreetScene } from "@/components/world/StreetScene";
import { api } from "@/convex/_generated/api";
import { DEFAULT_AVATAR, type AvatarConfig } from "@/lib/avatar";
import {
  ABILITIES,
  abilityOf,
  bubbleColorOf,
  BUBBLE_COLORS,
  CURRENCY_EMOJI,
  DAILY_BONUS_MS,
  DEFAULT_ABILITY,
  DEFAULT_BUBBLE_COLOR,
  formatCoins,
  GIFT_BOX,
  GIFT_CLICK_RADIUS,
  OBSTACLES,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  VENDORS,
  VIP_VENDOR_ID,
  WALKABLE_ZONES,
  WORLD_BOUNDS,
  vendorAtPoint,
  type AbilityId,
  type Rect,
  type Vendor,
} from "@/lib/shop";
import { isMuted, playSound, toggleMuted, unlockAudio } from "@/lib/sounds";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Backpack,
  Flower2,
  Footprints,
  MessageCircle,
  Puzzle,
  Send,
  Smartphone,
  Swords,
  UserRound,
  Volume2,
  VolumeX,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const WORLD_W = 1600;
const WORLD_H = 900;
const PLAYER_W = 70;
const PLAYER_H = 96;
// Spawn on the open road, clear of every stall obstacle — the old spawn
// point (800, 760) sat inside the VIP stand's collision box, which pinned
// the player and made walking impossible.
const SPAWN = { x: 800, y: 610 };

/** Random things the vendors say in the street chat. */
const VENDOR_PHRASES: Record<string, string[]> = {
  dondurma: ["Dondurmaaa! 🍦", "Serin serin dondurmalar!", "Bugün çileklisi bol!"],
  balon: ["Balon alır mısın? 🎈", "Gökkuşağı balonu kalmadı!", "Rengârenk balonlar!"],
  oyuncak: ["Oyuncaklarım çok tatlı 🧸", "Ayıcık sana sarılmak ister!", "Zıpzıp topu kaçırma!"],
  moda: ["Yeni sezon burada! 🕶️", "Şapka sana çok yakışır!", "Caddede şıklık önemli!"],
  vip: ["Sana özel fırsat! 👑", "Balonun rengârenk olsun!", "VIP üyelikle her renk senin!"],
};

/** An autonomous street walker — a bot that wanders the road on its own. */
interface BotDef {
  id: string;
  name: string;
  color: string; // chat accent for this bot
  speed: number; // world units / second (slower than the player)
  x: number; // spawn point (must be on the walkable road)
  y: number;
  config: AvatarConfig;
  equipped: string[]; // small touches so they look lived-in
  ability: AbilityId; // battle super (Brawl-styled)
}

const BOT_DEFS: BotDef[] = [
  {
    id: "bot-ada",
    name: "Ada",
    color: "#ec4899",
    speed: 120,
    x: 450,
    y: 690,
    config: {
      skin: "#ffd1a3",
      hair: "long",
      hairColor: "#6b4423",
      shirt: "#ec4899",
      pants: "#1e293b",
      shoes: "#111827",
    },
    equipped: ["moda-sapka"],
    ability: "isik",
  },
  {
    id: "bot-mert",
    name: "Mert",
    color: "#0ea5e9",
    speed: 150,
    x: 1100,
    y: 700,
    config: {
      skin: "#e8a87c",
      hair: "spiky",
      hairColor: "#1c1917",
      shirt: "#3b82f6",
      pants: "#334155",
      shoes: "#374151",
    },
    equipped: ["moda-gozluk"],
    ability: "simsek",
  },
  {
    id: "bot-elif",
    name: "Elif",
    color: "#a855f7",
    speed: 105,
    x: 250,
    y: 820,
    config: {
      skin: "#f5c19a",
      hair: "curly",
      hairColor: "#b45309",
      shirt: "#14b8a6",
      pants: "#14532d",
      shoes: "#22c55e",
    },
    equipped: ["balon-kirmizi"],
    ability: "sifa",
  },
  {
    id: "bot-kaan",
    name: "Kaan",
    color: "#f59e0b",
    speed: 135,
    x: 1350,
    y: 810,
    config: {
      skin: "#b97e4f",
      hair: "short",
      hairColor: "#1c1917",
      shirt: "#f97316",
      pants: "#111827",
      shoes: "#ef4444",
    },
    equipped: ["oyuncak-top"],
    ability: "ates",
  },
];

/** Little things the bots say while wandering the street. */
const BOT_PHRASES = [
  "Caddede yürümek çok keyifli! 🚶",
  "Dondurmacı Emre'nin külahına bayılıyorum!",
  "Bu günlerde balonlar çok popüler 🎈",
  "Bugün hava harika, değil mi? ☀️",
  "Yeni şapkamı nasıl buldun? 👒",
  "Tezgâhları gezmeyi çok seviyorum!",
];

/** A random walkable spot on the street for bots to wander to. */
function randomWalkTarget(): { x: number; y: number } {
  const zone = WALKABLE_ZONES[0];
  for (let i = 0; i < 12; i++) {
    const x = zone.x + 40 + Math.random() * (zone.w - 80);
    const y = zone.y + 40 + Math.random() * (zone.h - 80);
    if (inWalkable(x, y)) return { x, y };
  }
  return { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
}

/** Speech-bubble width adapts to the message and the sender's name. */
function bubbleWidth(text: string, name: string) {
  return Math.min(
    190,
    Math.max(150, text.length * 7 + 26, name.length * 7.5 + 28),
  );
}

const sheetPanel = {
  initial: { y: 40, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 40, opacity: 0 },
  transition: { duration: 0.25, ease: "easeOut" as const },
};

/** Bottom control bar button — gradient circle like the Sanalika client. */
function BarBtn({
  icon: Icon,
  label,
  badge,
  tone,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  badge?: number;
  tone: "sky" | "purple";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`relative flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-white text-[#2b3a4a] shadow-md transition-transform active:scale-90 sm:size-11 ${
        tone === "sky"
          ? "bg-gradient-to-br from-sky-200 to-sky-400"
          : "bg-gradient-to-br from-fuchsia-200 to-purple-400"
      }`}
    >
      <Icon className="size-4 sm:size-5" />
      {badge !== undefined && badge > 0 && (
        <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border border-white bg-red-500 text-[10px] font-extrabold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

/** Shared bottom-sheet chrome for in-game panels. */
function GameSheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-30 bg-black/45 backdrop-blur-[2px]"
      />
      <motion.div
        {...sheetPanel}
        className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-lg rounded-t-3xl border border-b-0 border-border bg-card p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-full"
            onClick={onClose}
            aria-label="Kapat"
          >
            <X className="size-4" />
          </Button>
        </div>
        {children}
      </motion.div>
    </>
  );
}

/** ✨ Ability shop — buy and equip battle supers with SP. */
function AbilitiesSheet({
  coins,
  abilities,
  equippedAbility,
  onBuy,
  onEquip,
  onClose,
}: {
  coins: number;
  abilities: string[];
  equippedAbility: string;
  onBuy: (id: string) => void;
  onEquip: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <GameSheet
      title="✨ Yetenek Mağazası"
      subtitle="Süper yetenekler — savaş alanında seni zafere taşır."
      onClose={onClose}
    >
      <div className="mt-5 space-y-3">
        {ABILITIES.map((a) => {
          const owned = abilities.includes(a.id);
          const equipped = equippedAbility === a.id;
          return (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background p-3"
            >
              <span className="text-3xl">{a.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-extrabold">
                  {a.name}
                  {equipped && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                      KUŞANILI
                    </span>
                  )}
                </p>
                <p className="text-[11px] leading-4 text-muted-foreground">
                  {a.description}
                </p>
              </div>
              {owned ? (
                equipped ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    disabled
                  >
                    Kuşanılı
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() => onEquip(a.id)}
                  >
                    Kuşan
                  </Button>
                )
              ) : a.price === 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  disabled
                >
                  Varsayılan
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={coins < a.price}
                  onClick={() => onBuy(a.id)}
                >
                  {CURRENCY_EMOJI} {formatCoins(a.price)}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-center text-xs font-semibold text-muted-foreground">
        Yetenek, savaşta süper güç olarak kullanılır — hasar vererek
        doldurulur. ⚔️
      </p>
    </GameSheet>
  );
}

/**
 * Compact profile card shown in the top-right corner when tapping a
 * character (the player or one of the bots). No names float under feet
 * anymore — this is where you learn who somebody is.
 */
function CharacterCard({
  avatar,
  name,
  subtitle,
  badge,
  stats,
  action,
  onClose,
}: {
  avatar: React.ReactNode;
  name: string;
  subtitle: string;
  badge?: React.ReactNode;
  stats: React.ReactNode;
  action?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      data-profile-card
      className="pointer-events-auto absolute top-2 right-2 z-20 w-64 rounded-3xl border-2 border-white bg-[#fffaf0] p-4 shadow-2xl"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Kapat"
        className="absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-full bg-[#3d2f2a]/10 text-[#3d2f2a] transition-colors hover:bg-[#3d2f2a]/20"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-center gap-3 pr-7">
        <div className="relative shrink-0">{avatar}</div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 font-extrabold text-[#2b2320]">
            <span className="truncate">{name}</span>
            {badge}
          </div>
          <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
            {subtitle}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-[#28c840]">
            <span className="size-2 rounded-full bg-[#28c840]" /> Çevrimiçi
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">{stats}</div>
      {action && <div className="mt-3">{action}</div>}
    </motion.div>
  );
}

/** Player identity card. */
function ProfileSheet({
  username,
  config,
  equipped,
  coins,
  items,
  isVip,
  onClose,
  onEdit,
}: {
  username: string;
  config: AvatarConfig;
  equipped: string[];
  coins: number;
  items: string[];
  isVip: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <GameSheet title={`👤 ${username}`} subtitle="Sanalika Kimliği" onClose={onClose}>
      <div className="mt-5 flex items-center gap-5">
        <div className="relative shrink-0">
          <AvatarPreview config={config} className="block h-32 w-auto" />
          <EquippedItems
            equipped={equipped}
            className="pointer-events-none absolute inset-0 h-32 w-auto"
          />
        </div>
        <div className="space-y-2 text-sm">
          {isVip && (
            <p className="flex w-fit items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-3 py-1 text-xs font-extrabold text-white shadow-sm">
              👑 VIP Üye
            </p>
          )}
          <p className="flex items-center gap-2 font-extrabold">
            <span className="text-lg">{CURRENCY_EMOJI}</span> {formatCoins(coins)} SP
          </p>
          <p className="flex items-center gap-2 font-extrabold">
            <span className="text-lg">🎒</span> {items.length} ürün
          </p>
          <p className="flex items-center gap-2 font-bold text-muted-foreground">
            <span className="size-2 rounded-full bg-[#28c840]" /> Çevrimiçi
          </p>
        </div>
      </div>
      <Button className="mt-6 w-full rounded-full" onClick={onEdit}>
        Stüdyo'da düzenle
      </Button>
    </GameSheet>
  );
}

/** Quick-travel list of the street stalls + the daily gift box. */
function StallsSheet({
  onClose,
  onGo,
}: {
  onClose: () => void;
  onGo: (x: number, y: number, label: string) => void;
}) {
  return (
    <GameSheet
      title="🗺️ Tezgâhlar"
      subtitle="Bir yer seç — karakterin oraya kadar yürür."
      onClose={onClose}
    >
      <div className="mt-5 grid grid-cols-2 gap-3">
        {VENDORS.map((v) => (
          <div
            key={v.id}
            className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background p-3"
          >
            <span className="text-2xl">{v.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold">{v.short}</p>
              <p className="truncate text-[11px] text-muted-foreground">{v.name}</p>
            </div>
            <Button
              size="sm"
              className="rounded-full"
              onClick={() => onGo(v.x, v.y + 35, v.short)}
            >
              Git
            </Button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onGo(GIFT_BOX.x, GIFT_BOX.y - 50, "Hediye kutusu")}
          className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-background p-3 text-left transition-colors hover:bg-accent"
        >
          <span className="text-2xl">🎁</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold">Hediye kutusu</p>
            <p className="text-[11px] text-muted-foreground">Günlük +150 SP</p>
          </div>
          <span className="text-xs font-extrabold text-primary">Git</span>
        </button>
      </div>
    </GameSheet>
  );
}

function circleHitsRect(cx: number, cy: number, r: number, rect: Rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/** True when the point is on the walkable street (and not inside an obstacle). */
function inWalkable(x: number, y: number) {
  return (
    WALKABLE_ZONES.some(
      (z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h,
    ) &&
    !OBSTACLES.some(
      (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
    )
  );
}

export default function World() {
  const navigate = useNavigate();
  const profile = useQuery(api.profiles.getMyProfile);
  const claimDaily = useMutation(api.profiles.claimDailyBonus);
  const setBubbleColor = useMutation(api.profiles.setBubbleColor);
  const buyAbility = useMutation(api.profiles.buyAbility);
  const equipAbility = useMutation(api.profiles.equipAbility);
  const battleVictory = useMutation(api.profiles.battleVictory);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldGroupRef = useRef<SVGGElement>(null);
  const playerRef = useRef<SVGGElement>(null);
  const spriteRef = useRef<SVGGElement>(null);

  const posRef = useRef({ x: SPAWN.x, y: SPAWN.y });
  const facingRef = useRef(1);
  const keysRef = useRef(new Set<string>());
  const viewRef = useRef({ vw: WORLD_W, vh: WORLD_H });
  const camRef = useRef({ x: -1, y: -1 });

  const [shopVendor, setShopVendor] = useState<Vendor | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const nextIdRef = useRef(1);
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatOpenRef = useRef(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [stallsOpen, setStallsOpen] = useState(false);
  const [vipOpen, setVipOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [targetMarker, setTargetMarker] = useState<{ x: number; y: number } | null>(null);
  const targetRef = useRef<{ x: number; y: number } | null>(null);
  const stuckRef = useRef({ x: 0, y: 0, since: 0 });
  // Autonomous bots: positions/animations live in refs (mutated every frame
  // without re-rendering React); only their speech bubbles are React state.
  const botRefs = useRef(new Map<string, SVGGElement>());
  const botsRef = useRef(
    BOT_DEFS.map((def) => ({
      def,
      pos: { x: def.x, y: def.y },
      target: null as { x: number; y: number } | null,
      facing: 1,
      phase: Math.random() * 10,
      moving: false,
      pauseUntil: 0,
    })),
  );
  const [botBubbles, setBotBubbles] = useState<Record<string, string | null>>(
    {},
  );
  // Which character profile is open in the top-right card ("me" or a bot id).
  const [viewing, setViewing] = useState<string | null>(null);
  const viewedBot =
    viewing !== null && viewing !== "me"
      ? BOT_DEFS.find((b) => b.id === viewing) ?? null
      : null;
  // Ability shop + duel invites + active battle.
  const [abilitiesOpen, setAbilitiesOpen] = useState(false);
  const [invite, setInvite] = useState<{
    botId: string;
    status: "waiting" | "accepted" | "rejected";
  } | null>(null);
  const [battle, setBattle] = useState<{
    opponent: BotDef;
    playerAbility: string;
    opponentAbility: string;
  } | null>(null);
  const battleRef = useRef(battle);
  battleRef.current = battle;

  const [soundOn, setSoundOn] = useState(() => !isMuted());

  // Unlock audio on the first user gesture (mobile browsers require it).
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const coins = profile?.coins ?? 0;
  const items = profile?.items ?? [];
  const equipped = profile?.equipped ?? [];
  const abilities = profile?.abilities ?? [DEFAULT_ABILITY];
  const equippedAbility = profile?.equippedAbility ?? DEFAULT_ABILITY;
  const username = profile?.username ?? "Misafir";
  const config = profile?.avatar ?? DEFAULT_AVATAR;
  const isVip = profile?.vip ?? false;
  const vipUntil = profile?.vipUntil ?? 0;
  const bubbleColorId = profile?.bubbleColor ?? DEFAULT_BUBBLE_COLOR;
  const bubbleDef = bubbleColorOf(bubbleColorId);
  const giftClaimed =
    profile !== undefined &&
    (profile?.lastDailyClaim ?? 0) > Date.now() - DAILY_BONUS_MS;
  // Speech bubble width adapts to the message and the sender's name.
  const bubbleW = bubble
    ? Math.min(190, Math.max(150, bubble.length * 7 + 26, username.length * 7.5 + 28))
    : 0;

  // Track the container size → visible world window for the camera.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return;
      // Cover-style camera: on portrait phones the world is taller than the
      // screen, so the view shows the full 900-unit street height and the
      // camera pans sideways after the player; wide screens show the full
      // width and pan vertically. Either way the street never letterboxes
      // into a tiny strip — the character stays big and readable.
      const scale = Math.max(w / WORLD_W, h / WORLD_H);
      viewRef.current = {
        vw: Math.min(w / scale, WORLD_W),
        vh: Math.min(h / scale, WORLD_H),
      };
      worldGroupRef.current?.setAttribute("transform", "");
      // Force the camera to re-apply the matching viewBox next frame.
      camRef.current = { x: -1, y: -1 };
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Game loop: input → physics → sprite, camera and interaction updates.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
          e.code,
        )
      ) {
        e.preventDefault();
      }
      keysRef.current.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let raf = 0;
    let last = performance.now();
    let phase = 0;

    const loop = (now: number) => {
      try {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      // While the duel arena is open the street player freezes.
      const inBattle = battleRef.current !== null;
      const keys = keysRef.current;
      let vx = 0;
      let vy = 0;
      // `moving` and `pos` are also read by the sprite/camera code below.
      let moving = false;
      const pos = posRef.current;
      if (!inBattle) {
      if (keys.has("ArrowLeft") || keys.has("KeyA")) vx -= 1;
      if (keys.has("ArrowRight") || keys.has("KeyD")) vx += 1;
      if (keys.has("ArrowUp") || keys.has("KeyW")) vy -= 1;
      if (keys.has("ArrowDown") || keys.has("KeyS")) vy += 1;
      // Cancel auto-walk when the player takes over with the keyboard.
      if (keysRef.current.size > 0 && targetRef.current) {
        targetRef.current = null;
        setTargetMarker(null);
      }
      // Auto-walk target (click-to-move, stalls map, gift box).
      const target = targetRef.current;
      if (target) {
        const p = posRef.current;
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 24) {
          targetRef.current = null;
          setTargetMarker(null);
        } else {
          // Track whether the player is actually making progress. If they
          // stay pinned (wall/stall) for a moment, cancel the walk so the
          // marker doesn't linger — but keep heading toward the target every
          // single frame while it is active.
          const movedSince = Math.hypot(
            p.x - stuckRef.current.x,
            p.y - stuckRef.current.y,
          );
          if (movedSince > 2) {
            stuckRef.current = { x: p.x, y: p.y, since: now };
          } else if (now - stuckRef.current.since > 2000) {
            // Blocked on the way — give up so the marker doesn't linger.
            targetRef.current = null;
            setTargetMarker(null);
          }
          if (targetRef.current) {
            vx = dx / dist;
            vy = dy / dist;
          }
        }
      }
      const len = Math.hypot(vx, vy);
      moving = len > 0.05;
      if (len > 1) {
        vx /= len;
        vy /= len;
      }

      if (moving) {
        phase += dt * 10;
        const nx = Math.min(Math.max(pos.x + vx * PLAYER_SPEED * dt, WORLD_BOUNDS.minX), WORLD_BOUNDS.maxX);
        const ny = Math.min(Math.max(pos.y + vy * PLAYER_SPEED * dt, WORLD_BOUNDS.minY), WORLD_BOUNDS.maxY);
        // Resolve collisions axis by axis (obstacles + walkable street zones).
        let px = nx;
        let py = pos.y;
        for (const r of OBSTACLES) {
          if (circleHitsRect(px, py, PLAYER_RADIUS, r)) {
            px = pos.x;
            break;
          }
        }
        if (!inWalkable(px, py)) px = pos.x;
        py = Math.min(Math.max(ny, WORLD_BOUNDS.minY), WORLD_BOUNDS.maxY);
        for (const r of OBSTACLES) {
          if (circleHitsRect(px, py, PLAYER_RADIUS, r)) {
            py = pos.y;
            break;
          }
        }
        if (!inWalkable(px, py)) py = pos.y;
        pos.x = px;
        pos.y = py;
        if (Math.abs(vx) > 0.05) facingRef.current = vx;
      }
      }

      // Sprite: bob + limb swing while walking, face movement direction.
      spriteRef.current?.classList.toggle("walking", moving);
      const flip = facingRef.current < 0 ? -1 : 1;
      const bob = moving ? Math.sin(phase) * 5 : 0;
      const ty = -PLAYER_H + bob;
      if (spriteRef.current) {
        spriteRef.current.setAttribute(
          "transform",
          flip === 1
            ? `translate(${-PLAYER_W / 2} ${ty})`
            : `scale(-1 1) translate(${-PLAYER_W / 2} ${ty})`,
        );
      }
      if (playerRef.current) {
        playerRef.current.setAttribute(
          "transform",
          `translate(${pos.x} ${pos.y})`,
        );
      }

      // Follow camera — the world always fills the screen (cover, no
      // letterboxing): portrait phones show the full street height and pan
      // sideways after the player; wide screens show the full width and pan
      // vertically. While walking the camera tracks the player; when idle it
      // stays put so the scroll arrows can explore the rest of the street.
      const view = viewRef.current;
      if (view.vw > 0) {
        const maxX = Math.max(WORLD_W - view.vw, 0);
        const maxY = Math.max(WORLD_H - view.vh, 0);
        const followX = Math.min(Math.max(pos.x - view.vw / 2, 0), maxX);
        const followY = Math.min(Math.max(pos.y - view.vh / 2, 0), maxY);
        const prev = camRef.current;
        let camX = prev.x >= 0 ? prev.x : followX;
        let camY = prev.y >= 0 ? prev.y : followY;
        if (moving || keysRef.current.size > 0 || targetRef.current) {
          // Walking (keys or tap-to-walk) → follow the player.
          camX = followX;
          camY = followY;
        }
        if (Math.abs(camX - prev.x) > 0.01 || Math.abs(camY - prev.y) > 0.01) {
          camRef.current = { x: camX, y: camY };
          svgRef.current?.setAttribute(
            "viewBox",
            `${camX.toFixed(2)} ${camY.toFixed(2)} ${view.vw.toFixed(2)} ${view.vh.toFixed(2)}`,
          );
        }
      }

      // Autonomous bots wander the street — pick waypoints, walk, animate.
      for (const bot of botsRef.current) {
        const botEl0 = botRefs.current.get(bot.def.id);
        if (botEl0) botEl0.style.display = "";
        // The challenged bot teleports to the arena while fighting.
        if (battleRef.current?.opponent.id === bot.def.id) {
          if (botEl0) botEl0.style.display = "none";
          continue;
        }
        const now = performance.now();
        if (bot.pauseUntil > now) {
          bot.moving = false;
        } else if (bot.target === null) {
          // Rest a moment, then pick a new spot to stroll to.
          bot.pauseUntil = now + 1200 + Math.random() * 2200;
          bot.target = randomWalkTarget();
        } else {
          const dx = bot.target.x - bot.pos.x;
          const dy = bot.target.y - bot.pos.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 20) {
            bot.target = null;
          } else {
            const vx = dx / dist;
            const vy = dy / dist;
            const nx = Math.min(
              Math.max(
                bot.pos.x + vx * bot.def.speed * dt,
                WORLD_BOUNDS.minX,
              ),
              WORLD_BOUNDS.maxX,
            );
            const ny = Math.min(
              Math.max(
                bot.pos.y + vy * bot.def.speed * dt,
                WORLD_BOUNDS.minY,
              ),
              WORLD_BOUNDS.maxY,
            );
            // Same axis-by-axis collision as the player (stalls + curbs).
            let px = nx;
            let py = bot.pos.y;
            for (const r of OBSTACLES) {
              if (circleHitsRect(px, py, PLAYER_RADIUS, r)) {
                px = bot.pos.x;
                break;
              }
            }
            if (!inWalkable(px, py)) px = bot.pos.x;
            py = Math.min(Math.max(ny, WORLD_BOUNDS.minY), WORLD_BOUNDS.maxY);
            for (const r of OBSTACLES) {
              if (circleHitsRect(px, py, PLAYER_RADIUS, r)) {
                py = bot.pos.y;
                break;
              }
            }
            if (!inWalkable(px, py)) py = bot.pos.y;
            bot.pos.x = px;
            bot.pos.y = py;
            bot.phase += dt * 8;
            bot.moving = true;
            if (Math.abs(vx) > 0.05) bot.facing = vx;
            // Blocked by a stall / curb? Pick a fresh waypoint next frame.
            if (Math.abs(px - nx) > 0.01 || Math.abs(py - ny) > 0.01) {
              bot.target = null;
            }
          }
        }
        // Apply to the DOM imperatively — no React re-render per frame.
        const botEl = botRefs.current.get(bot.def.id);
        if (botEl) {
          botEl.setAttribute(
            "transform",
            `translate(${bot.pos.x} ${bot.pos.y})`,
          );
          const sprite = botEl.querySelector(
            ".bot-sprite",
          ) as SVGGElement | null;
          const flip = bot.facing < 0 ? -1 : 1;
          const bob = bot.moving ? Math.sin(bot.phase) * 5 : 0;
          if (sprite) {
            sprite.classList.toggle("walking", bot.moving);
            sprite.setAttribute(
              "transform",
              flip === 1
                ? `translate(${-PLAYER_W / 2} ${-PLAYER_H + bob})`
                : `scale(-1 1) translate(${-PLAYER_W / 2} ${-PLAYER_H + bob})`,
            );
          }
        }
      }

      } catch (err) {
        // A single bad frame must never kill the game loop.
        console.error("Oyun döngüsü hatası:", err);
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev.slice(-40), msg]);
    if (!chatOpenRef.current) setUnread((u) => u + 1);
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      playSound("chat");
      appendMessage({
        id: nextIdRef.current++,
        from: username,
        text: trimmed,
        isMe: true,
      });
      setBubble(trimmed.length > 36 ? `${trimmed.slice(0, 36)}…` : trimmed);
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
      bubbleTimerRef.current = setTimeout(() => setBubble(null), 4000);
    },
    [appendMessage, username],
  );

  const openChat = () => {
    playSound("click");
    chatOpenRef.current = true;
    setChatOpen(true);
    setUnread(0);
  };
  const closeChat = () => {
    chatOpenRef.current = false;
    setChatOpen(false);
  };

  /** Pick a speech-bubble color (VIP colors are enforced server-side). */
  const handleSelectColor = useCallback(
    async (colorId: string) => {
      try {
        await setBubbleColor({ colorId });
        const def = BUBBLE_COLORS.find((c) => c.id === colorId);
        playSound("buy");
        toast.success(`${def?.name ?? "Renk"} balon rengi seçildi! 🎨`);
      } catch (error) {
        console.error("Balon rengi hatası:", error);
        toast.error(
          error instanceof Error ? error.message : "Renk değiştirilemedi.",
        );
      }
    },
    [setBubbleColor],
  );

  /** Invite a character to a duel — they accept or reject after a moment. */
  const handleInvite = useCallback(
    (bot: BotDef) => {
      if (invite || battle) return;
      playSound("invite");
      setInvite({ botId: bot.id, status: "waiting" });
      appendMessage({
        id: nextIdRef.current++,
        from: "Sistem",
        text: `${bot.name} savaşa davet edildi… ⚔️`,
      });
      window.setTimeout(() => {
        if (Math.random() < 0.25) {
          playSound("decline");
          setInvite({ botId: bot.id, status: "rejected" });
          appendMessage({
            id: nextIdRef.current++,
            from: bot.name,
            text: "Şu an savaşamıyorum, kusura bakma! 🙏",
            color: bot.color,
          });
          window.setTimeout(() => setInvite(null), 2600);
        } else {
          playSound("accept");
          setInvite({ botId: bot.id, status: "accepted" });
          appendMessage({
            id: nextIdRef.current++,
            from: bot.name,
            text: "Kabul! Hadi savaş alanına! ⚔️🔥",
            color: bot.color,
          });
          window.setTimeout(() => {
            playSound("vs");
            setBattle({
              opponent: bot,
              playerAbility: equippedAbility,
              opponentAbility: bot.ability,
            });
            setInvite(null);
            setViewing(null);
            setAbilitiesOpen(false);
          }, 1000);
        }
      }, 1400 + Math.random() * 1200);
    },
    [invite, battle, appendMessage, equippedAbility],
  );

  /** Close the arena and (on victory) credit the SP reward. */
  const endBattle = useCallback(
    async (victory: boolean) => {
      if (victory) {
        try {
          const newCoins = await battleVictory();
          toast.success(
            `🏆 Zafer! +150 SP kazandın — yeni bakiye: ${formatCoins(newCoins)}`,
          );
        } catch (error) {
          console.error("Ödül hatası:", error);
          toast.error(
            error instanceof Error ? error.message : "Ödül alınamadı.",
          );
        }
      } else {
        toast.info("Savaş alanından ayrıldın.");
      }
      setBattle(null);
    },
    [battleVictory],
  );

  const handleBuyAbility = useCallback(
    async (abilityId: string) => {
      try {
        await buyAbility({ abilityId });
        const def = ABILITIES.find((a) => a.id === abilityId);
        playSound("buy");
        toast.success(
          `${def?.emoji ?? ""} ${def?.name ?? "Yetenek"} satın alındı ve kuşanıldı!`,
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Satın alma başarısız.",
        );
      }
    },
    [buyAbility],
  );

  const handleEquipAbility = useCallback(
    async (abilityId: string) => {
      try {
        await equipAbility({ abilityId });
        const def = ABILITIES.find((a) => a.id === abilityId);
        playSound("click");
        toast.success(
          `${def?.emoji ?? ""} ${def?.name ?? "Yetenek"} kuşanıldı!`,
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Kuşanılamadı.",
        );
      }
    },
    [equipAbility],
  );

  /** Close the chat and open the VIP stand page. */
  const openVipFromChat = useCallback(() => {
    closeChat();
    setVipOpen(true);
  }, []);

  /** Auto-walk toward a spot on the street (stalls map / gift box). */
  const goTo = useCallback((x: number, y: number, label: string) => {
    if (!inWalkable(x, y)) return;
    playSound("click");
    targetRef.current = { x, y };
    const p = posRef.current;
    stuckRef.current = { x: p.x, y: p.y, since: performance.now() };
    setTargetMarker({ x, y });
    setStallsOpen(false);
    setProfileOpen(false);
    toast.info(`${label} yoluna çıkıldı 🚶`);
  }, []);

  // Street greeting + vendors occasionally chatting keeps the street alive.
  // Their chat only lands in the chat panel — no speech bubbles float above
  // the stalls, so no text pops up while walking around the market.
  useEffect(() => {
    appendMessage({
      id: nextIdRef.current++,
      from: "Cadde",
      text: "👋 Sanalika Caddesi'ne hoş geldin! Satıcıya dokunup market sayfasını açabilirsin.",
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timer = setTimeout(() => {
        if (Math.random() < 0.55 && BOT_DEFS.length > 0) {
          // A bot says something — a chat line + a brief speech bubble.
          const bot = BOT_DEFS[Math.floor(Math.random() * BOT_DEFS.length)];
          const text =
            BOT_PHRASES[Math.floor(Math.random() * BOT_PHRASES.length)];
          appendMessage({
            id: nextIdRef.current++,
            from: bot.name,
            text,
            color: bot.color,
          });
          setBotBubbles((prev) => ({ ...prev, [bot.id]: text }));
          setTimeout(() => {
            setBotBubbles((prev) => ({ ...prev, [bot.id]: null }));
          }, 4000);
        } else {
          const vendor = VENDORS[Math.floor(Math.random() * VENDORS.length)];
          const pool = VENDOR_PHRASES[vendor.id];
          const text = pool[Math.floor(Math.random() * pool.length)];
          appendMessage({
            id: nextIdRef.current++,
            from: vendor.short,
            text,
            color: vendor.color,
          });
        }
        schedule();
      }, 9000 + Math.random() * 7000);
    };
    schedule();
    return () => {
      if (timer) clearTimeout(timer);
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    };
  }, [appendMessage]);

  /**
   * Set a move destination on the street and mark it with the target square.
   * The tap is clamped into the walkable street corridor, so tapping near the
   * curb (or slightly off due to rendering rounding) always results in a walk.
   */
  const pickTarget = useCallback((wx: number, wy: number) => {
    const zone = WALKABLE_ZONES[0];
    const x = Math.min(Math.max(wx, zone.x), zone.x + zone.w);
    const y = Math.min(Math.max(wy, zone.y), zone.y + zone.h);
    targetRef.current = { x, y };
    const p = posRef.current;
    stuckRef.current = { x: p.x, y: p.y, since: performance.now() };
    setTargetMarker({ x, y });
  }, []);

  const handleClaim = async () => {
    if (giftClaimed || claiming) return;
    setClaiming(true);
    try {
      await claimDaily();
      playSound("coin");
      toast.success("🎁 +150 SP kazandın! Tezgâhlara bakmaya ne dersin?");
    } catch (error) {
      console.error("Hediye kutusu hatası:", error);
      toast.error(
        error instanceof Error ? error.message : "Kutu açılamadı. Tekrar dene.",
      );
    } finally {
      setClaiming(false);
    }
  };

  /**
   * Click/tap on the street: tapping the vendor character opens its market
   * page (animated bottom sheet), the gift box claims the daily bonus, and
   * anywhere else walks the character there. Approaching stalls shows no
   * labels or popup text — the stalls only respond to a tap on the vendor.
   */
  const handleWorldClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (
        shopVendor ||
        bagOpen ||
        chatOpen ||
        profileOpen ||
        stallsOpen ||
        vipOpen ||
        battleRef.current
      )
        return;
      const target = e.target as HTMLElement;
      if (target.closest("button") || target.closest("[data-profile-card]"))
        return;
      // Map the tap to world coordinates through the SVG's own screen CTM.
      // This is exact even when the world is letterboxed or the camera has
      // moved — it never depends on viewport bookkeeping that could be stale.
      const svg = svgRef.current;
      if (!svg) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const svgPt = new DOMPoint(e.clientX, e.clientY).matrixTransform(
        ctm.inverse(),
      );
      const wx = svgPt.x;
      const wy = svgPt.y;
      // Tapping a character (player or bot) opens their profile card.
      const p = posRef.current;
      if (
        wx >= p.x - 34 &&
        wx <= p.x + 34 &&
        wy >= p.y - 100 &&
        wy <= p.y + 10
      ) {
        setViewing("me");
        return;
      }
      for (const bot of botsRef.current) {
        if (
          wx >= bot.pos.x - 34 &&
          wx <= bot.pos.x + 34 &&
          wy >= bot.pos.y - 100 &&
          wy <= bot.pos.y + 10
        ) {
          setViewing(bot.def.id);
          return;
        }
      }
      // Tapping anywhere else closes the profile card.
      setViewing(null);
      // Tapping the stall itself opens its market page (VIP stand opens the
      // membership page instead).
      const vendor = vendorAtPoint(wx, wy);
      if (vendor) {
        playSound("click");
        if (vendor.id === VIP_VENDOR_ID) {
          setVipOpen(true);
        } else {
          setShopVendor(vendor);
        }
        return;
      }
      // Tapping the gift box claims the daily bonus.
      if (Math.hypot(wx - GIFT_BOX.x, wy - GIFT_BOX.y) <= GIFT_CLICK_RADIUS) {
        handleClaim();
        return;
      }
      pickTarget(wx, wy);
    },
    [
      shopVendor,
      bagOpen,
      chatOpen,
      profileOpen,
      stallsOpen,
      vipOpen,
      pickTarget,
      handleClaim,
    ],
  );

  return (
    <div className="fixed inset-x-0 top-0 h-dvh flex items-center justify-center overflow-hidden bg-[#e9dcc0] text-foreground select-none">
      {/* Framed game window: dark top bar, the street, beige control bar. */}
      <div className="relative flex h-full w-full max-w-[1560px] flex-col overflow-hidden border-4 border-[#3d2f2a]/20 bg-[#33324a] shadow-2xl sm:rounded-[30px]">
        {/* top bar — wallet & player */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-2 py-1.5 text-white sm:px-3 sm:py-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-full bg-white/10 text-white hover:bg-white/20"
              onClick={() => navigate("/studio")}
              aria-label="Stüdyo"
            >
              <ArrowLeft className="size-4" />
            </Button>
            <span className="hidden text-sm font-extrabold tracking-tight sm:block">
              {username}
            </span>
            <button
              type="button"
              onClick={() => {
                const m = toggleMuted();
                setSoundOn(!m);
                if (!m) playSound("click");
              }}
              className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label={soundOn ? "Sesi kapat" : "Sesi aç"}
              title={soundOn ? "Sesi kapat" : "Sesi aç"}
            >
              {soundOn ? (
                <Volume2 className="size-4" />
              ) : (
                <VolumeX className="size-4" />
              )}
            </button>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm font-extrabold">
            {CURRENCY_EMOJI} {formatCoins(coins)}
            <span className="text-[10px] font-bold text-white/60">SP</span>
            <button
              type="button"
              onClick={() => goTo(GIFT_BOX.x, GIFT_BOX.y - 50, "Hediye kutusu")}
              className="flex size-6 items-center justify-center rounded-full bg-[#28c840] text-sm font-extrabold leading-none text-white shadow-md transition-transform active:scale-90"
              aria-label="Hediye kutusuna git"
              title="Günlük hediye kutusuna git"
            >
              +
            </button>
          </span>
        </div>

        {/* The game area: the street is drawn in landscape world units and
            the camera (viewBox) zooms + pans so it always fills this area —
            no rotation, no letterboxing, on any phone orientation. */}
        <main
          ref={containerRef}
          className="relative min-h-0 flex-1 touch-none overflow-hidden"
          style={{
            background:
              "linear-gradient(90deg, #aee571 0%, #d9eee5 45%, #bfe3ff 100%)",
          }}
          onClick={handleWorldClick}
        >
        <svg
          ref={svgRef}
          viewBox="0 0 1600 900"
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full"
        >
          {/* The whole street, one SVG group in 1600x900 world units. */}
          <g ref={worldGroupRef}>
          <StreetScene giftClaimed={giftClaimed} />

          {/* move-target marker — the touched spot, shown as a clear square */}
          {targetMarker !== null && (
            <g
              transform={`translate(${targetMarker.x} ${targetMarker.y})`}
              className="move-marker"
            >
              <rect
                x={-26}
                y={-26}
                width={52}
                height={52}
                rx={9}
                fill="#ffffff"
                opacity={0.3}
                stroke="#ff6b4a"
                strokeWidth={3}
                strokeDasharray="7 5"
              />
              <circle cx="0" cy="0" r="4" fill="#ff6b4a" />
            </g>
          )}

          {/* player */}
          <g ref={playerRef}>
            <g ref={spriteRef}>
              <AvatarPreview
                width={PLAYER_W}
                height={PLAYER_H}
                config={config}
              />
              <EquippedItems
                equipped={equipped}
                width={PLAYER_W}
                height={PLAYER_H}
              />
            </g>
            {/* speech bubble above the player's head — classic rounded comic
                bubble with a white border and tail, in the chosen color */}
            {bubble !== null && (
              <g
                transform={`translate(${-bubbleW / 2} -144)`}
                className="speech-bubble"
              >
                <rect
                  width={bubbleW}
                  height={58}
                  rx={22}
                  fill={bubbleDef.hex}
                  stroke={bubbleDef.stroke}
                  strokeOpacity={bubbleDef.strokeOpacity}
                  strokeWidth={3.5}
                />
                <path
                  d={`M${bubbleW / 2 - 11} 58 L${bubbleW / 2} 72 L${bubbleW / 2 + 11} 58 Z`}
                  fill={bubbleDef.hex}
                  stroke={bubbleDef.stroke}
                  strokeOpacity={bubbleDef.strokeOpacity}
                  strokeWidth={3.5}
                  strokeLinejoin="round"
                />
                <text
                  x={bubbleW / 2}
                  y={19}
                  textAnchor="middle"
                  fontSize={10.5}
                  fontWeight={900}
                  letterSpacing={0.8}
                  fill={bubbleDef.text}
                >
                  {username}
                </text>
                <text
                  x={bubbleW / 2}
                  y={41}
                  textAnchor="middle"
                  fontSize={12.5}
                  fontWeight={800}
                  fill={bubbleDef.text}
                >
                  {bubble}
                </text>
              </g>
            )}
          </g>

          {/* autonomous bots — wander the street with name tags + bubbles */}
          {botsRef.current.map((bot) => {
            const bubbleText = botBubbles[bot.def.id] ?? null;
            const bw = bubbleText ? bubbleWidth(bubbleText, bot.def.name) : 0;
            return (
              <g
                key={bot.def.id}
                ref={(el) => {
                  if (el) botRefs.current.set(bot.def.id, el);
                  else botRefs.current.delete(bot.def.id);
                }}
              >
                <g className="bot-sprite">
                  <AvatarPreview
                    width={PLAYER_W}
                    height={PLAYER_H}
                    config={bot.def.config}
                  />
                  <EquippedItems
                    equipped={bot.def.equipped}
                    width={PLAYER_W}
                    height={PLAYER_H}
                  />
                </g>
                {/* occasional speech bubble */}
                {bubbleText !== null && (
                  <g
                    transform={`translate(${-bw / 2} -144)`}
                    className="speech-bubble"
                  >
                    <rect
                      width={bw}
                      height={58}
                      rx={22}
                      fill="#ffffff"
                      stroke="#3d2f2a"
                      strokeOpacity={0.22}
                      strokeWidth={3.5}
                    />
                    <path
                      d={`M${bw / 2 - 11} 58 L${bw / 2} 72 L${bw / 2 + 11} 58 Z`}
                      fill="#ffffff"
                      stroke="#3d2f2a"
                      strokeOpacity={0.22}
                      strokeWidth={3.5}
                      strokeLinejoin="round"
                    />
                    <text
                      x={bw / 2}
                      y={19}
                      textAnchor="middle"
                      fontSize={10.5}
                      fontWeight={900}
                      letterSpacing={0.8}
                      fill="#2b2320"
                    >
                      {bot.def.name}
                    </text>
                    <text
                      x={bw / 2}
                      y={41}
                      textAnchor="middle"
                      fontSize={12.5}
                      fontWeight={800}
                      fill="#2b2320"
                    >
                      {bubbleText}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          </g>
        </svg>

        {/* character profile card — tapping a character opens it here */}
        <AnimatePresence>
          {viewing !== null &&
            (viewing === "me" ? (
              <CharacterCard
                key="me"
                name={username}
                subtitle="Sanalika Caddesi sakini"
                badge={
                  isVip ? (
                    <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                      👑 VIP
                    </span>
                  ) : null
                }
                avatar={
                  <>
                    <AvatarPreview
                      config={config}
                      className="block h-24 w-auto"
                    />
                    <EquippedItems
                      equipped={equipped}
                      className="pointer-events-none absolute inset-0 h-24 w-auto"
                    />
                  </>
                }
                stats={
                  <>
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-extrabold text-emerald-700">
                      {CURRENCY_EMOJI} {formatCoins(coins)} SP
                    </span>
                    <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-extrabold text-sky-700">
                      🎒 {items.length} ürün
                    </span>
                  </>
                }
                action={
                  <Button
                    size="sm"
                    className="w-full rounded-full"
                    onClick={() => navigate("/studio")}
                  >
                    Stüdyo'da düzenle
                  </Button>
                }
                onClose={() => setViewing(null)}
              />
            ) : viewedBot ? (
              <CharacterCard
                key={viewedBot.id}
                name={viewedBot.name}
                subtitle="Sanalika Caddesi sakini"
                avatar={
                  <>
                    <AvatarPreview
                      config={viewedBot.config}
                      className="block h-24 w-auto"
                    />
                    <EquippedItems
                      equipped={viewedBot.equipped}
                      className="pointer-events-none absolute inset-0 h-24 w-auto"
                    />
                  </>
                }
                stats={
                  <>
                    <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-extrabold text-sky-700">
                      🎒 {viewedBot.equipped.length} ürün
                    </span>
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-extrabold text-amber-700">
                      {abilityOf(viewedBot.ability).emoji}{" "}
                      {abilityOf(viewedBot.ability).name}
                    </span>
                  </>
                }
                action={
                  invite?.botId === viewedBot.id &&
                  invite.status === "waiting" ? (
                    <Button size="sm" disabled className="w-full rounded-full">
                      Davet bekleniyor…
                    </Button>
                  ) : invite?.botId === viewedBot.id &&
                    invite.status === "rejected" ? (
                    <p className="rounded-full bg-red-500/10 px-3 py-2 text-center text-xs font-extrabold text-red-600">
                      Savaşı reddetti 😔
                    </p>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow hover:from-orange-400 hover:to-rose-400"
                      onClick={() => handleInvite(viewedBot)}
                    >
                      <Swords className="size-4" /> Savaşa Davet Et
                    </Button>
                  )
                }
                onClose={() => setViewing(null)}
              />
            ) : null)}
        </AnimatePresence>

        {/* duel arena — full-screen overlay while fighting */}
        {battle && (
          <BattleScene
            playerName={username}
            playerConfig={config}
            playerEquipped={equipped}
            playerAbility={battle.playerAbility}
            opponentName={battle.opponent.name}
            opponentConfig={battle.opponent.config}
            opponentEquipped={battle.opponent.equipped}
            opponentAbility={battle.opponentAbility}
            onExit={endBattle}
          />
        )}

        </main>

        {/* bottom control bar — Sanalika style: all buttons centered in one
            row (visible at once, no scrolling needed) with a full-width chat
            input below. Clear of the phone's home indicator (safe-area). */}
        <div className="shrink-0 border-t-4 border-[#3d2f2a]/15 bg-[#f3e0bd] pb-[max(env(safe-area-inset-bottom),0.5rem)]">
          <div className="flex min-w-0 items-center overflow-x-auto px-2 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="mx-auto flex w-max items-center gap-1 sm:gap-2.5">
              <BarBtn tone="sky" icon={Smartphone} label="Stüdyo" onClick={() => { playSound("click"); navigate("/studio"); }} />
              <BarBtn
                tone="sky"
                icon={UserRound}
                label="Profilim"
                onClick={() => { playSound("click"); setProfileOpen(true); }}
              />
              <BarBtn tone="sky" icon={Backpack} label="Çanta" badge={items.length} onClick={() => { playSound("click"); setBagOpen(true); }} />
              <BarBtn
                tone="sky"
                icon={Footprints}
                label="Tezgâhlar"
                onClick={() => { playSound("click"); setStallsOpen(true); }}
              />
              <span
                className="h-8 w-px shrink-0 bg-[#3d2f2a]/15"
                aria-hidden
              />
              <BarBtn tone="purple" icon={MessageCircle} label="Sohbet" badge={unread} onClick={openChat} />
              <BarBtn
                tone="purple"
                icon={Puzzle}
                label="Yakında"
                onClick={() => { playSound("click"); toast.info("Bu özellik yakında geliyor! 🔧"); }}
              />
              <BarBtn
                tone="purple"
                icon={Wand2}
                label="Yetenekler"
                onClick={() => { playSound("click"); setAbilitiesOpen(true); }}
              />
              <BarBtn
                tone="purple"
                icon={Flower2}
                label="Yakında"
                onClick={() => { playSound("click"); toast.info("Bu özellik yakında geliyor! 🌸"); }}
              />
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(chatDraft);
              setChatDraft("");
            }}
            className="px-2 pt-2"
          >
            <div className="relative mx-auto w-full max-w-2xl">
              <input
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                placeholder="Merhaba Sanalika! Mesajını yaz…"
                maxLength={120}
                autoComplete="off"
                aria-label="Sohbet mesajı"
                className="h-11 w-full rounded-full border-2 border-white bg-white pl-5 pr-14 text-sm font-semibold text-foreground shadow-inner outline-none placeholder:text-muted-foreground/60 focus:border-primary"
              />
              <button
                type="submit"
                className="absolute top-1.5 right-1.5 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform active:scale-90"
                aria-label="Mesajı gönder"
              >
                <Send className="size-4" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* sheets live outside the touch-none game area so their lists scroll */}
      <AnimatePresence>
        {shopVendor && (
          <ShopSheet
            key="shop"
            vendor={shopVendor}
            coins={coins}
            owned={items}
            onClose={() => setShopVendor(null)}
          />
        )}
        {bagOpen && (
          <BagSheet
            key="bag"
            items={items}
            equipped={equipped}
            coins={coins}
            onClose={() => setBagOpen(false)}
            onBrowseStalls={() => setBagOpen(false)}
          />
        )}
        {chatOpen && (
          <ChatPanel
            key="chat"
            messages={messages}
            username={username}
            bubbleColor={bubbleColorId}
            isVip={isVip}
            onSelectColor={handleSelectColor}
            onOpenVip={openVipFromChat}
            onSend={handleSend}
            onClose={closeChat}
          />
        )}
        {profileOpen && (
          <ProfileSheet
            key="profile"
            username={username}
            config={config}
            equipped={equipped}
            coins={coins}
            items={items}
            isVip={isVip}
            onClose={() => setProfileOpen(false)}
            onEdit={() => navigate("/studio")}
          />
        )}
        {stallsOpen && (
          <StallsSheet
            key="stalls"
            onClose={() => setStallsOpen(false)}
            onGo={goTo}
          />
        )}
        {vipOpen && (
          <VipSheet
            key="vip"
            coins={coins}
            isVip={isVip}
            vipUntil={vipUntil}
            onClose={() => setVipOpen(false)}
          />
        )}
        {abilitiesOpen && (
          <AbilitiesSheet
            key="abilities"
            coins={coins}
            abilities={abilities}
            equippedAbility={equippedAbility}
            onBuy={handleBuyAbility}
            onEquip={handleEquipAbility}
            onClose={() => setAbilitiesOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* loading / no-profile overlays */}
      {profile === undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="size-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        </div>
      )}
      {profile !== undefined && profile !== null && profile.banned && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-red-500/40 bg-card p-6 text-center shadow-2xl">
            <span className="text-5xl">🚫</span>
            <h2 className="mt-3 text-xl font-extrabold">
              Hesabın oyundan yasaklandı
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Yönetici tarafından engellendin. Sanalika Caddesi'ne girişin şu
              an kapalı — detay için yöneticiye başvurabilirsin.
            </p>
            <Button
              className="mt-5 w-full rounded-full"
              onClick={() => navigate("/")}
            >
              Ana sayfaya dön
            </Button>
          </div>
        </div>
      )}
      {profile === null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-2xl">
            <span className="text-4xl">🎭</span>
            <h2 className="mt-3 text-xl font-extrabold">
              Önce karakterini oluştur
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Caddede yürüyebilmen için bir avatara ihtiyacın var. Bir dakikanı
              alır.
            </p>
            <Button
              className="mt-5 w-full rounded-full"
              onClick={() => navigate("/studio")}
            >
              Avatar Stüdyosu'na git
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
