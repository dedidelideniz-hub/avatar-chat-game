// The Sanalika street — tap to walk, chat with vendors, shop with SP.
import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { StreetScene } from "@/components/world/StreetScene";
import { GameEngine3D, raycastScreenToSVG } from "@/engine/GameEngine3D";
import { useIsMobile } from "@/hooks/use-mobile";

import { EquippedItems } from "@/components/avatar/EquippedItems";
import { Button } from "@/components/ui/button";
import { BagSheet, ShopSheet, VipSheet } from "@/components/world/ShopSheets";
import BattleScene from "@/components/world/BattleScene";
import PvpBattleScene from "@/components/world/PvpBattleScene";
import { ChatPanel, type ChatMessage } from "@/components/world/ChatPanel";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  usePresenceOthers,
  usePresencePublisher,
  type PresenceEntry,
} from "@/hooks/use-presence";
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
import { findPath } from "@/lib/pathfinding";
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
    speed: 80,
    x: 450,
    y: 580,
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
    speed: 80,
    x: 1100,
    y: 560,
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
    speed: 80,
    x: 250,
    y: 540,
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
    speed: 80,
    x: 1350,
    y: 600,
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

/** Live presence payload — what other players see about you on the street. */
interface WorldPresence {
  name: string;
  config: AvatarConfig;
  equipped: string[];
  ability: string;
  vip: boolean;
  x: number;
  y: number;
  facing: number;
  vy?: number;
  moving: boolean;
  inBattle?: boolean;
}

/** Fighter identity captured at invite time (name / avatar / equipped / super). */
interface FighterInfo {
  name: string;
  config: AvatarConfig;
  equipped: string[];
  ability: string;
}

/** An incoming PvP duel invite shown as an overlay on the street. */
interface PvpInvite {
  battleId: string;
  challenger: FighterInfo;
  createdAt: number;
}

/** Smoothed position of a remote player's sprite (lerped each frame). */
interface RemoteState {
  x: number;
  y: number;
  facing: number;
  vy: number;
  moving: boolean;
  phase: number;
}

/** Little things the bots say while wandering the street. */
const BOT_PHRASES = [
  "Caddede yürümek çok keyifli! 🚶",
  "Dondurmacı Emre'nin külahına bayılıyorum!",
  "Bu günlerde balonlar çok popüler 🎈",
  "Bugün hava harika, değil mi? ☀️",
  "Yeni şapkamı nasıl buldun? 👒",
  "Tezgâhları gezmeyi çok seviyorum!",
];

/** Deterministic PRNG so every device walks the bots the same way. */
function djb2(str: string) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random walkable spot on the street (seeded — same on every device). */
function randomWalkablePoint(rng: () => number) {
  const zone = WALKABLE_ZONES[0];
  for (let i = 0; i < 16; i++) {
    const x = zone.x + 40 + rng() * (zone.w - 80);
    const y = zone.y + 40 + rng() * (zone.h - 80);
    if (inWalkable(x, y)) return { x, y };
  }
  return { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
}

/** True when the straight line between two points stays on the street. */
function segmentClear(ax: number, ay: number, bx: number, by: number) {
  const steps = 10;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!inWalkable(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

/** A closed walking loop per bot: wait, stroll to the next point, repeat. */
interface BotPath {
  pts: { x: number; y: number }[];
  wait: number[]; // seconds spent standing at each point
  walk: number[]; // seconds spent walking from point i to point i+1
  total: number; // loop duration in seconds
}

function buildBotPath(def: BotDef): BotPath {
  const rng = mulberry32(djb2(def.id));
  // Generate 8 destination waypoints
  const waypoints: { x: number; y: number }[] = [{ x: def.x, y: def.y }];
  for (let i = 0; i < 8; i++) {
    let next: { x: number; y: number } | null = null;
    for (let attempt = 0; attempt < 14 && next === null; attempt++) {
      const cand = randomWalkablePoint(rng);
      const last = waypoints[waypoints.length - 1];
      if (segmentClear(last.x, last.y, cand.x, cand.y)) next = cand;
    }
    waypoints.push(next ?? waypoints[waypoints.length - 1]);
  }
  waypoints.push({ x: def.x, y: def.y }); // close the loop

  // Insert cardinal-only intermediate points between each destination.
  // Between A and B: go horizontal first, then vertical (L-shape = no diagonal).
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    pts.push(a);
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dx > 2 && dy > 2) {
      // L-shape: horizontal first, then vertical
      pts.push({ x: b.x, y: a.y });
    }
  }
  pts.push(waypoints[waypoints.length - 1]);

  // Build per-point wait and walk arrays (must be pts.length each).
  // Only the original destinations have non-zero wait; intermediate cardinal
  // points get zero wait so the bot passes through them without pausing.
  const destSet = new Set(waypoints.map((p) => `${p.x},${p.y}`));
  const wait: number[] = [];
  const walk: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const isDest = destSet.has(`${pts[i].x},${pts[i].y}`);
    wait.push(isDest ? 0.8 + rng() * 2.4 : 0);
    const next = pts[(i + 1) % pts.length];
    const d = Math.hypot(next.x - pts[i].x, next.y - pts[i].y);
    walk.push(d / def.speed);
  }
  const total =
    wait.reduce((a, b) => a + b, 0) + walk.reduce((a, b) => a + b, 0);
  return { pts, wait, walk, total };
}

/** Where a bot stands at loop-time t (seconds) — pure & deterministic. */
function botPosAt(
  path: BotPath,
  t: number,
  out: { x: number; y: number; moving: boolean; facing: number },
) {
  let acc = 0;
  const n = path.pts.length;
  for (let i = 0; i < n; i++) {
    if (t < acc + path.wait[i]) {
      out.x = path.pts[i].x;
      out.y = path.pts[i].y;
      out.moving = false;
      return;
    }
    acc += path.wait[i];
    const dur = path.walk[i];
    if (t < acc + dur) {
      const a = path.pts[i];
      const b = path.pts[(i + 1) % n];
      const k = dur === 0 ? 1 : (t - acc) / dur;
      out.x = a.x + (b.x - a.x) * k;
      out.y = a.y + (b.y - a.y) * k;
      out.moving = k < 0.99;
      out.facing = b.x >= a.x ? 1 : -1;
      return;
    }
    acc += dur;
  }
  out.x = path.pts[0].x;
  out.y = path.pts[0].y;
  out.moving = false;
}

// Precomputed once at module load — identical on every device.
const BOT_PATHS = new Map(BOT_DEFS.map((d) => [d.id, buildBotPath(d)]));

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

/** Real players from other phones — rendered from live presence data. */
function RemotePlayers({
  sessionId,
  remoteRefs,
  remoteStatesRef,
  othersRef,
  onCount,
}: {
  sessionId: string;
  remoteRefs: React.RefObject<Map<string, SVGGElement>>;
  remoteStatesRef: React.RefObject<Map<string, RemoteState>>;
  othersRef: React.RefObject<PresenceEntry<WorldPresence>[]>;
  onCount: (n: number) => void;
}) {
  const { others } = usePresenceOthers<WorldPresence>("world", sessionId);

  useEffect(() => {
    othersRef.current = others;
    onCount(others.length + 1);
    const live = new Set(others.map((o) => o.sessionId));
    for (const key of [...remoteStatesRef.current.keys()]) {
      if (!live.has(key)) remoteStatesRef.current.delete(key);
    }
  }, [others, othersRef, remoteStatesRef, onCount]);

  return (
    <>
      {others.map((remote) => {
        const d = remote.data;
        if (!d || !d.config || typeof d.x !== "number") return null;
        return (
          <g
            key={remote.sessionId}
            className="remote-player"
            ref={(el) => {
              if (el) remoteRefs.current.set(remote.sessionId, el);
              else remoteRefs.current.delete(remote.sessionId);
            }}
          >
            <g className="remote-sprite">
              <AvatarPreview
                width={PLAYER_W}
                height={PLAYER_H}
                config={d.config}
              />
              <EquippedItems
                equipped={d.equipped ?? []}
                width={PLAYER_W}
                height={PLAYER_H}
              />
            </g>
          </g>
        );
      })}
    </>
  );
}

export default function World() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const profile = useQuery(api.profiles.getMyProfile);
  const claimDaily = useMutation(api.profiles.claimDailyBonus);
  const setBubbleColor = useMutation(api.profiles.setBubbleColor);
  const buyAbility = useMutation(api.profiles.buyAbility);
  const equipAbility = useMutation(api.profiles.equipAbility);
  const battleVictory = useMutation(api.profiles.battleVictory);
  const sendChat = useMutation(api.chat.send);
  const createBattle = useMutation(api.battles.createBattle);
  const acceptBattle = useMutation(api.battles.acceptBattle);
  const declineBattle = useMutation(api.battles.declineBattle);
  const finishBattle = useMutation(api.battles.finishBattle);
  const cancelBattle = useMutation(api.battles.cancelBattle);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldGroupRef = useRef<SVGGElement>(null);
  const playerSvgRef = useRef<SVGSVGElement>(null);
    const playerWorldGroupRef = useRef<SVGGElement>(null);
  const playerRef = useRef<SVGGElement>(null);
  const spriteRef = useRef<SVGGElement>(null);
  const avatarSvgCache = useRef<SVGSVGElement | null>(null);
  const remoteSpriteCache = useRef(new Map<string, SVGGElement>());
  const remotePoseCache = useRef(new Map<string, SVGSVGElement>());

  const posRef = useRef({ x: SPAWN.x, y: SPAWN.y });
  const facingRef = useRef(1);
  const movingRef = useRef(false);
  const vyRef = useRef(0); // vertical direction: -1 up, +1 down, 0 idle
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
  // Server chat messages already appended (dedupe against the live query).
  const seenServerIds = useRef(new Set<string>());
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatOpenRef = useRef(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [stallsOpen, setStallsOpen] = useState(false);
  const [vipOpen, setVipOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [targetMarker, setTargetMarker] = useState<{ x: number; y: number } | null>(null);
  const targetRef = useRef<{ x: number; y: number } | null>(null);
  const stuckRef = useRef({ x: 0, y: 0, since: 0 });
  const waypointsRef = useRef<{ x: number; y: number }[]>([]);
  const waypointIdxRef = useRef(0);
  // Autonomous bots: positions/animations live in refs (mutated every frame
  // without re-rendering React); only their speech bubbles are React state.
  const botRefs = useRef(new Map<string, SVGGElement>());
  // Cache querySelector results for bots to avoid per-frame DOM traversal.
  const botSpriteCache = useRef(new Map<string, SVGGElement>());
  const botPoseCache = useRef(new Map<string, SVGSVGElement>());
  const botsRef = useRef(
    BOT_DEFS.map((def) => ({
      def,
      pos: { x: def.x, y: def.y },
      facing: 1,
      vy: 0,
      phase: 0,
      moving: false,
      path: BOT_PATHS.get(def.id)!,
      // A deterministic time offset per bot so they don't all start together.
      offset: ((djb2(def.id) % 997) / 997) * 40,
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

  // PvP duels against real players — invite → accept → live fight (synced
  // through the battles table + a per-battle presence room).
  const [pvpInvite, setPvpInvite] = useState<PvpInvite | null>(null);
  const [pvpChallenge, setPvpChallenge] = useState<{
    battleId: string;
    opponentSessionId: string;
    opponentName: string;
  } | null>(null);
  const [pvpBattle, setPvpBattle] = useState<{
    battleId: string;
    role: "challenger" | "opponent";
  } | null>(null);
  const pvpBattleRef = useRef(pvpBattle);
  pvpBattleRef.current = pvpBattle;

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

  // Online street — publish my position and watch other real players.
  const { publish, sessionId } = usePresencePublisher("world");
  // PvP: incoming duel invites addressed to my session + the fight document.
  const invites = useQuery(api.battles.listInvites, { sessionId });
  const activeBattleId = pvpBattle?.battleId ?? pvpChallenge?.battleId ?? null;
  const battleDoc = useQuery(
    api.battles.getBattle,
    activeBattleId
      ? { battleId: activeBattleId as Id<"battles"> }
      : "skip",
  );
  // Shared server clock: bots are driven by (local time + offset) so every
  // device walks them at the same phase, even when phone clocks differ.
  // Live street chat — messages typed by ANY player land on every phone.
  const serverMessages = useQuery(api.chat.list, { room: "world" });
  const serverClock = useQuery(api.world.clock, {
    t: Math.floor(Date.now() / 15_000),
  });
  const serverOffsetRef = useRef(0);
  useEffect(() => {
    if (serverClock) {
      serverOffsetRef.current = serverClock.serverTime - Date.now();
    }
  }, [serverClock]);
  const profileRef = useRef({
    name: username,
    config,
    equipped,
    ability: equippedAbility,
    vip: isVip,
  });
  const othersRef = useRef<PresenceEntry<WorldPresence>[]>([]);
  const remoteRefs = useRef(new Map<string, SVGGElement>());
  const remoteStatesRef = useRef(new Map<string, RemoteState>());
  const lastPublishRef = useRef(0);
  const lastPubMovingRef = useRef(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const onCountChange = useCallback((n: number) => {
    setOnlineCount((prev) => (prev === n ? prev : n));
  }, []);
  // Profile card target for a real player from another phone.
  const viewedRemote =
    viewing !== null && viewing.startsWith("remote:")
      ? (othersRef.current.find(
          (o) => o.sessionId === viewing.slice("remote:".length),
        ) ?? null)
      : null;

  // When the profile loads, announce yourself so others see you in the street.
  useEffect(() => {
    if (!profile || profile.banned) return;
    profileRef.current = {
      name: profile.username,
      config: profile.avatar,
      equipped: profile.equipped ?? [],
      ability: profile.equippedAbility ?? DEFAULT_ABILITY,
      vip: profile.vip,
    };
    const p = posRef.current;
    publish({
      ...profileRef.current,
      x: p.x,
      y: p.y,
      facing: facingRef.current,
      moving: false,
    });
  }, [profile, publish]);

  // Keep my street session fresh even while standing still (so others always
  // see me), and flag when I'm inside a duel arena.
  useEffect(() => {
    if (!profile || profile.banned) return;
    const id = window.setInterval(() => {
      const prof = profileRef.current;
      const p = posRef.current;
      publish({
        ...prof,
        x: p.x,
        y: p.y,
        facing: facingRef.current,
        moving: false,
        inBattle: battleRef.current !== null || pvpBattleRef.current !== null,
      });
    }, 2000);
    return () => window.clearInterval(id);
  }, [profile, publish]);

  // A fresh duel invite pops up as an overlay until answered or replaced.
  useEffect(() => {
    if (!invites || invites.length === 0) {
      if (!pvpBattle) setPvpInvite(null);
      return;
    }
    if (pvpBattle || battle || pvpChallenge) return;
    setPvpInvite(invites[0]);
  }, [invites, pvpBattle, battle, pvpChallenge]);

  // Challenger side: watch the fight document — it flips to "fighting" when
  // the opponent accepts, or "done" if they decline / the invite expires.
  useEffect(() => {
    if (!pvpChallenge) return;
    if (!battleDoc) {
      toast.info("Davetinin süresi doldu.");
      setPvpChallenge(null);
      return;
    }
    if (battleDoc.status === "fighting") {
      playSound("vs");
      setPvpBattle({ battleId: pvpChallenge.battleId, role: "challenger" });
      setPvpChallenge(null);
      setViewing(null);
    } else if (battleDoc.status === "done") {
      toast.info(
        battleDoc.winner === "declined"
          ? "Rakip daveti reddetti 😔"
          : "Davet iptal edildi.",
      );
      setPvpChallenge(null);
    }
  }, [battleDoc, pvpChallenge]);

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
      // Force the camera to re-apply next frame.
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

      // While a duel arena (bot or PvP) is open the street player freezes.
      const inBattle = battleRef.current !== null || pvpBattleRef.current !== null;
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
      // Clamp to 4 cardinal directions only — no diagonal movement.
      if (vx !== 0 && vy !== 0) {
        if (Math.abs(vx) >= Math.abs(vy)) vy = 0;
        else vx = 0;
      }
      // Cancel auto-walk when the player takes over with the keyboard.
      if (keysRef.current.size > 0 && targetRef.current) {
        targetRef.current = null;
        waypointsRef.current = [];
        waypointIdxRef.current = 0;
        setTargetMarker(null);
      }
      // Auto-walk: follow A* waypoints, advancing along the path.
      const wp = waypointsRef.current;
      if (wp.length > 0 && targetRef.current) {
        const p = posRef.current;
        // Advance waypoint index when close enough.
        let wi = waypointIdxRef.current;
        if (wi < wp.length) {
          const w = wp[wi];
          const wd = Math.hypot(w.x - p.x, w.y - p.y);
          if (wd < 18) wi++;
          waypointIdxRef.current = wi;
        }
        if (wi >= wp.length) {
          // Reached the final destination.
          targetRef.current = null;
          waypointsRef.current = [];
          waypointIdxRef.current = 0;
          setTargetMarker(null);
        } else {
          // Move toward current waypoint.
          const w = wp[wi];
          const dx = w.x - p.x;
          const dy = w.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 1) {
            // Clamp to dominant cardinal axis — no diagonal movement.
            if (Math.abs(dx) >= Math.abs(dy)) {
              vx = dx > 0 ? 1 : -1;
              vy = 0;
            } else {
              vx = 0;
              vy = dy > 0 ? 1 : -1;
            }
          }
          // Failsafe: if stuck for 3 seconds, cancel.
          const movedSince = Math.hypot(
            p.x - stuckRef.current.x,
            p.y - stuckRef.current.y,
          );
          if (movedSince > 2) {
            stuckRef.current = { x: p.x, y: p.y, since: now };
          } else if (now - stuckRef.current.since > 3000) {
            targetRef.current = null;
            waypointsRef.current = [];
            waypointIdxRef.current = 0;
            setTargetMarker(null);
          }
        }
      }
      const len = Math.hypot(vx, vy);
      moving = len > 0.05;
      movingRef.current = moving;
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
        // Update facing from horizontal movement direction. When moving
        // purely vertically, preserve the last horizontal facing so the
        // character doesn't snap to an arbitrary direction.
        if (Math.abs(vx) > 0.1) facingRef.current = vx > 0 ? 1 : -1;
        vyRef.current = vy;
      } else {
        // Reset vertical direction when stopped so sprite returns to normal.
        vyRef.current = 0;
      }

      // Share my position with the street — throttled while walking, plus a
      // final "stopped" update so nobody sees you gliding forever.
      const prof = profileRef.current;
      if (!inBattle && moving) {
        if (now - lastPublishRef.current > 150) {
          lastPublishRef.current = now;
          publish({
            ...prof,
            x: pos.x,
            y: pos.y,
            facing: facingRef.current,
            vy: vyRef.current,
            moving: true,
          });
        }
        lastPubMovingRef.current = true;
      } else if (lastPubMovingRef.current) {
        lastPubMovingRef.current = false;
        lastPublishRef.current = 0;
        publish({
          ...prof,
            x: pos.x,
            y: pos.y,
            facing: facingRef.current,
            vy: 0,
            moving: false,
        });
      }
      }

      // Sprite: bob + limb swing while walking, body faces the walking
      // direction — SNAPPED flip (no lerp through zero!) + smooth
      // vertical scale for perspective.
      spriteRef.current?.classList.toggle("walking", moving);
      // Directional avatar pose: idle (front), walk-up (back), walk-down (front), walk-side (side).
      const avatarSvg = avatarSvgCache.current ?? (spriteRef.current?.querySelector("svg[data-pose]") as SVGSVGElement | null);
      if (avatarSvg && !avatarSvgCache.current) avatarSvgCache.current = avatarSvg;
      if (avatarSvg) {
        if (!moving) avatarSvg.dataset.pose = "idle";
        else if (vyRef.current < 0) avatarSvg.dataset.pose = "walk-up";
        else if (vyRef.current > 0) avatarSvg.dataset.pose = "walk-down";
        else avatarSvg.dataset.pose = "walk-side";
      }
      const bob = moving ? Math.sin(phase) * 5 : 0;
      // FLIP: snap instantly — lerping through 0 makes the sprite
      // disappear for ~150ms, which looks like teleporting.
      const flip = facingRef.current < 0 ? -1 : 1;
      // VERTICAL SCALE: lerp smoothly — never crosses zero.
      const targetVScale = moving ? (1 + vyRef.current * 0.12) : 1;
      const prevVScale = spriteRef.current?.dataset.vscale ? Number(spriteRef.current.dataset.vscale) : 1;
      const newVScale = prevVScale + (targetVScale - prevVScale) * Math.min(1, dt * 12);
      // Build transform string — only write to DOM if it actually changed.
      const scaleY = newVScale;
      let newTransform: string;
      if (flip === 1 && Math.abs(scaleY - 1) < 0.005) {
        newTransform = `translate(0 ${(bob - PLAYER_H).toFixed(1)})`;
      } else if (Math.abs(scaleY - 1) < 0.005) {
        newTransform = `translate(0 ${(bob - PLAYER_H).toFixed(1)}) translate(${PLAYER_W / 2} ${PLAYER_H / 2}) scale(${flip} 1) translate(${-PLAYER_W / 2} ${-PLAYER_H / 2})`;
      } else {
        newTransform = `translate(0 ${(bob - PLAYER_H).toFixed(1)}) translate(${PLAYER_W / 2} ${PLAYER_H / 2}) scale(${flip} ${scaleY.toFixed(3)}) translate(${-PLAYER_W / 2} ${-PLAYER_H / 2})`;
      }
      if (spriteRef.current && spriteRef.current.dataset.vscale !== String(newVScale)) {
        spriteRef.current.dataset.flip = String(flip);
        spriteRef.current.dataset.vscale = String(newVScale);
      }
      if (spriteRef.current) {
        spriteRef.current.setAttribute(
          "transform",
          newTransform,
        );
      }
      if (playerRef.current) {
        const px = pos.x.toFixed(1);
        const py = pos.y.toFixed(1);
        const curTransform = playerRef.current.getAttribute("transform");
        const newTransform = `translate(${px} ${py})`;
        if (curTransform !== newTransform) {
          playerRef.current.setAttribute("transform", newTransform);
        }
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
          // Sync both SVG viewBoxes
          const vb = `${camX.toFixed(2)} ${camY.toFixed(2)} ${view.vw.toFixed(2)} ${view.vh.toFixed(2)}`;
          playerSvgRef.current?.setAttribute("viewBox", vb);
          svgRef.current?.setAttribute("viewBox", vb);
        }
      }

      // Autonomous bots — a deterministic time-based loop, so every phone
      // sees the exact same bots at the exact same spots (no local
      // randomness, no drift between devices).
      const botScratch = { x: 0, y: 0, moving: false, facing: 1 };
      for (const bot of botsRef.current) {
        const botEl0 = botRefs.current.get(bot.def.id);
        if (botEl0) botEl0.style.display = "";
        // The challenged bot teleports to the arena while fighting.
        if (battleRef.current?.opponent.id === bot.def.id) {
          if (botEl0) botEl0.style.display = "none";
          continue;
        }
        const wallT =
          (Date.now() + serverOffsetRef.current) / 1000 + bot.offset;
        const t = ((wallT % bot.path.total) + bot.path.total) % bot.path.total;
        botPosAt(bot.path, t, botScratch);
        bot.pos.x = botScratch.x;
        bot.pos.y = botScratch.y;
        bot.moving = botScratch.moving;
        if (botScratch.moving) bot.facing = botScratch.facing;
        bot.phase = botScratch.moving ? t * 8 : 0;
        // Track bot's vertical movement direction from path segment.
        if (botScratch.moving && bot.path) {
          const n2 = bot.path.pts.length;
          const seg2 = Math.floor((t / bot.path.total) * n2) % n2;
          const pa = bot.path.pts[seg2];
          const pb = bot.path.pts[(seg2 + 1) % n2];
          const dy2 = pb.y - pa.y;
          bot.vy = Math.abs(dy2) > 1 ? Math.sign(dy2) : 0;
        } else {
          bot.vy = 0;
        }
        // Apply to the DOM imperatively — no React re-render per frame.
        const botEl = botRefs.current.get(bot.def.id);
        if (botEl) {
          const botT = `translate(${bot.pos.x.toFixed(1)} ${bot.pos.y.toFixed(1)})`;
          if (botEl.getAttribute("transform") !== botT) botEl.setAttribute("transform", botT);
          const sprite = botSpriteCache.current.get(bot.def.id) ?? botEl.querySelector(".bot-sprite") as SVGGElement | null;
          if (sprite && !botSpriteCache.current.has(bot.def.id)) botSpriteCache.current.set(bot.def.id, sprite);
          if (sprite) {
            sprite.classList.toggle("walking", bot.moving);
            const botSvg = botPoseCache.current.get(bot.def.id) ?? sprite.querySelector("svg[data-pose]") as SVGSVGElement | null;
            if (botSvg && !botPoseCache.current.has(bot.def.id)) botPoseCache.current.set(bot.def.id, botSvg);
            if (botSvg) {
              if (!bot.moving) botSvg.dataset.pose = "idle";
              else if (bot.vy < 0) botSvg.dataset.pose = "walk-up";
              else if (bot.vy > 0) botSvg.dataset.pose = "walk-down";
              else botSvg.dataset.pose = "walk-side";
            }
            const botFlip = bot.facing < 0 ? -1 : 1;
            const botVy = bot.vy ?? 0;
            const targetBotVS = bot.moving ? (1 + botVy * 0.12) : 1;
            const prevBotVS = sprite.dataset.vscale ? Number(sprite.dataset.vscale) : 1;
            const newBotVS = prevBotVS + (targetBotVS - prevBotVS) * Math.min(1, dt * 12);
            const bob = bot.moving ? Math.sin(bot.phase) * 5 : 0;
            const botSpriteT = `translate(0 ${(bob - PLAYER_H).toFixed(1)}) translate(${PLAYER_W / 2} ${PLAYER_H / 2}) scale(${botFlip} ${newBotVS.toFixed(3)}) translate(${-PLAYER_W / 2} ${-PLAYER_H / 2})`;
            if (sprite.getAttribute("transform") !== botSpriteT) {
              sprite.dataset.flip = String(botFlip);
              sprite.dataset.vscale = String(newBotVS);
              sprite.setAttribute("transform", botSpriteT);
            }
          }
        }
      }

      // Other real players — glide their sprites toward the shared positions.
      for (const remote of othersRef.current) {
        const d = remote.data;
        const el = remoteRefs.current.get(remote.sessionId);
        if (
          !d ||
          typeof d.x !== "number" ||
          typeof d.y !== "number" ||
          !d.config ||
          !el
        ) {
          continue;
        }
        let st = remoteStatesRef.current.get(remote.sessionId);
        if (!st) {
          st = {
            x: d.x,
            y: d.y,
            facing: typeof d.facing === "number" ? d.facing : 1,
            vy: 0,
            moving: !!d.moving,
            phase: 0,
          };
          remoteStatesRef.current.set(remote.sessionId, st);
        }
        const k = Math.min(1, dt * 9);
        st.x += (d.x - st.x) * k;
        st.y += (d.y - st.y) * k;
        if (Math.abs(d.x - st.x) > 1.5) st.facing = d.x >= st.x ? 1 : -1;
        st.vy = typeof d.vy === "number" ? d.vy : 0;
        st.moving = !!d.moving;
        if (st.moving) st.phase += dt * 10;
        el.setAttribute("transform", `translate(${st.x} ${st.y})`);
        const sprite = remoteSpriteCache.current.get(remote.sessionId) ?? el.querySelector(
          ".remote-sprite",
        ) as SVGGElement | null;
        if (sprite && !remoteSpriteCache.current.has(remote.sessionId)) remoteSpriteCache.current.set(remote.sessionId, sprite);
        if (sprite) {
          sprite.classList.toggle("walking", st.moving);
          // Directional avatar pose for remote players.
          const rSvg = remotePoseCache.current.get(remote.sessionId) ?? sprite.querySelector("svg[data-pose]") as SVGSVGElement | null;
          if (rSvg && !remotePoseCache.current.has(remote.sessionId)) remotePoseCache.current.set(remote.sessionId, rSvg);
          if (rSvg) {
            if (!st.moving) rSvg.dataset.pose = "idle";
            else if (st.vy < 0) rSvg.dataset.pose = "walk-up";
            else if (st.vy > 0) rSvg.dataset.pose = "walk-down";
            else rSvg.dataset.pose = "walk-side";
          }
          const bob = st.moving ? Math.sin(st.phase) * 5 : 0;
          // Full-body facing: horizontal flip + vertical perspective.
          const rFlip = st.facing < 0 ? -1 : 1;
          const targetRVS = st.moving ? (1 + st.vy * 0.12) : 1;
          const prevRVS = sprite.dataset.vscale ? Number(sprite.dataset.vscale) : 1;
          const newRVS = prevRVS + (targetRVS - prevRVS) * Math.min(1, dt * 16);
          sprite.dataset.flip = String(rFlip);
          sprite.dataset.vscale = String(newRVS);
          // Scale around sprite center — no teleport.
          sprite.setAttribute(
            "transform",
            `translate(0 ${bob - PLAYER_H})` +
            ` translate(${PLAYER_W / 2} ${PLAYER_H / 2})` +
            ` scale(${rFlip} ${newRVS.toFixed(3)})` +
            ` translate(${-PLAYER_W / 2} ${-PLAYER_H / 2})`,
          );
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
    setMessages((prev) => [...prev.slice(-80), msg]);
    if (!chatOpenRef.current) setUnread((u) => u + 1);
  }, []);

  // Live street chat — messages sent from other phones appear here as they
  // land (server chat rows), so the street really is shared between devices.
  useEffect(() => {
    if (!serverMessages || !profile) return;
    for (const m of serverMessages) {
      if (seenServerIds.current.has(m._id)) continue;
      seenServerIds.current.add(m._id);
      appendMessage({
        id: m._id,
        from: m.senderName,
        text: m.text,
        color: m.color,
        isMe: m.senderId === profile.userId,
      });
    }
  }, [serverMessages, appendMessage, profile]);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      playSound("chat");
      // Speech bubble appears instantly; the chat row lands when the server
      // confirms the message (so every phone sees it too).
      setBubble(trimmed.length > 36 ? `${trimmed.slice(0, 36)}…` : trimmed);
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
      bubbleTimerRef.current = setTimeout(() => setBubble(null), 4000);
      try {
        const msg = await sendChat({ room: "world", text: trimmed });
        seenServerIds.current.add(msg._id);
        appendMessage({
          id: msg._id,
          from: msg.senderName,
          text: msg.text,
          color: msg.color,
          isMe: true,
        });
      } catch (error) {
        console.error("Mesaj hatası:", error);
        toast.error(
          error instanceof Error ? error.message : "Mesaj gönderilemedi.",
        );
      }
    },
    [appendMessage, username, sendChat],
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
      if (invite || battle || pvpBattle || pvpChallenge) return;
      playSound("invite");
      setInvite({ botId: bot.id, status: "waiting" });
      appendMessage({
        id: `local-${nextIdRef.current++}`,
        from: "Sistem",
        text: `${bot.name} savaşa davet edildi… ⚔️`,
      });
      window.setTimeout(() => {
        if (Math.random() < 0.25) {
          playSound("decline");
          setInvite({ botId: bot.id, status: "rejected" });
          appendMessage({
            id: `local-${nextIdRef.current++}`,
            from: bot.name,
            text: "Şu an savaşamıyorum, kusura bakma! 🙏",
            color: bot.color,
          });
          window.setTimeout(() => setInvite(null), 2600);
        } else {
          playSound("accept");
          setInvite({ botId: bot.id, status: "accepted" });
          appendMessage({
            id: `local-${nextIdRef.current++}`,
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

  /** Challenge a real player (from their street profile card) to a PvP duel. */
  const handleChallengeRemote = useCallback(
    async (remote: PresenceEntry<WorldPresence>) => {
      if (!remote.data) return;
      if (pvpBattle || pvpChallenge || battle) return;
      try {
        const { battleId } = await createBattle({
          mySessionId: sessionId,
          opponentSessionId: remote.sessionId,
          me: {
            name: username,
            config,
            equipped,
            ability: equippedAbility,
          },
        });
        playSound("invite");
        setPvpChallenge({
          battleId,
          opponentSessionId: remote.sessionId,
          opponentName: remote.data.name ?? "Oyuncu",
        });
        setViewing(null);
        appendMessage({
          id: `local-${nextIdRef.current++}`,
          from: "Sistem",
          text: `${remote.data.name ?? "Oyuncu"} savaşa davet edildi… ⚔️`,
        });
        toast.success(
          `${remote.data.name ?? "Oyuncu"} savaşa davet edildi! Cevabı bekleniyor…`,
        );
      } catch (error) {
        console.error("PvP daveti hatası:", error);
        toast.error(
          error instanceof Error ? error.message : "Davet gönderilemedi.",
        );
      }
    },
    [
      createBattle,
      sessionId,
      username,
      config,
      equipped,
      equippedAbility,
      pvpBattle,
      pvpChallenge,
      battle,
      appendMessage,
    ],
  );

  /** Answer an incoming duel invite — both phones enter the arena. */
  const handleAcceptInvite = useCallback(async () => {
    const inv = pvpInvite;
    if (!inv) return;
    try {
      await acceptBattle({
        battleId: inv.battleId as Id<"battles">,
        sessionId,
        me: { name: username, config, equipped, ability: equippedAbility },
      });
      playSound("accept");
      setPvpBattle({ battleId: inv.battleId, role: "opponent" });
      setPvpInvite(null);
      appendMessage({
        id: `local-${nextIdRef.current++}`,
        from: "Sistem",
        text: `⚔️ ${inv.challenger.name} ile düello başlıyor!`,
      });
    } catch (error) {
      console.error("PvP kabul hatası:", error);
      toast.error(
        error instanceof Error ? error.message : "Davet kabul edilemedi.",
      );
    }
  }, [
    pvpInvite,
    acceptBattle,
    sessionId,
    username,
    config,
    equipped,
    equippedAbility,
    appendMessage,
  ]);

  const handleDeclineInvite = useCallback(async () => {
    const inv = pvpInvite;
    if (!inv) return;
    try {
      await declineBattle({ battleId: inv.battleId as Id<"battles">, sessionId });
    } catch (error) {
      console.error("PvP reddetme hatası:", error);
    }
    playSound("decline");
    setPvpInvite(null);
  }, [pvpInvite, declineBattle, sessionId]);

  /** Close the PvP arena: award SP on a win and record the result. */
  const endPvpBattle = useCallback(
    async (
      victory: boolean,
      reason: "win" | "lose" | "draw" | "forfeit" | "leave",
    ) => {
      const cur = pvpBattleRef.current;
      if (!cur) return;
      if (victory) {
        try {
          const newCoins = await battleVictory();
          toast.success(
            `🏆 Zafer! +150 SP kazandın — yeni bakiye: ${formatCoins(newCoins)}`,
          );
        } catch (error) {
          console.error("PvP ödül hatası:", error);
          toast.error(
            error instanceof Error ? error.message : "Ödül alınamadı.",
          );
        }
      } else if (reason === "draw") {
        toast.info("Berabere! 🤝");
      } else if (reason === "forfeit") {
        toast.info("Rakip bağlantısı koptu.");
      } else {
        toast.info("Savaş alanından ayrıldın.");
      }
      try {
        const winner = victory
          ? cur.role
          : reason === "draw" || reason === "forfeit"
            ? "forfeit"
            : cur.role === "challenger"
              ? "opponent"
              : "challenger";
        await finishBattle({ battleId: cur.battleId as Id<"battles">, winner });
      } catch (error) {
        console.error("Düello kaydı hatası:", error);
      }
      setPvpBattle(null);
    },
    [battleVictory, finishBattle],
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
    const p = posRef.current;
    const path = findPath(p.x, p.y, x, y);
    if (path.length > 1) {
      waypointsRef.current = path.slice(1);
      waypointIdxRef.current = 0;
      targetRef.current = path[path.length - 1];
    } else {
      waypointsRef.current = [];
      targetRef.current = { x, y };
    }
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
    // Clamp to world bounds only — no zone clamping
    const x = Math.max(WORLD_BOUNDS.minX, Math.min(wx, WORLD_BOUNDS.maxX));
    const y = Math.max(WORLD_BOUNDS.minY, Math.min(wy, WORLD_BOUNDS.maxY));
    const p = posRef.current;
    const path = findPath(p.x, p.y, x, y);
    if (path.length > 1) {
      waypointsRef.current = path.slice(1);
      waypointIdxRef.current = 0;
      targetRef.current = path[path.length - 1];
    } else {
      waypointsRef.current = [];
      targetRef.current = { x, y };
    }
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
        battleRef.current ||
        pvpBattleRef.current
      )
        return;
      const target = e.target as HTMLElement;
      if (target.closest("button") || target.closest("[data-profile-card]"))
        return;
      // Map the tap to world coordinates using the camera state.
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      // Raycast: project screen click through 3D camera onto ground plane
      const rayResult = raycastScreenToSVG(e.clientX, e.clientY, container);
      let wx: number;
      let wy: number;
      if (rayResult) {
        wx = rayResult.x;
        wy = rayResult.y;
      } else {
        // Fallback: linear SVG conversion if raycast fails
        const cs = viewRef.current;
        const cx = camRef.current.x >= 0 ? camRef.current.x : 0;
        const cy = camRef.current.y >= 0 ? camRef.current.y : 0;
        wx = cx + (screenX / rect.width) * cs.vw;
        wy = cy + (screenY / rect.height) * cs.vh;
      }
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
      // A real player from another phone — open their profile card too.
      for (const remote of othersRef.current) {
        const d = remote.data;
        if (!d || typeof d.x !== "number" || typeof d.y !== "number")
          continue;
        const st = remoteStatesRef.current.get(remote.sessionId);
        const rx = st ? st.x : d.x;
        const ry = st ? st.y : d.y;
        if (
          wx >= rx - 34 &&
          wx <= rx + 34 &&
          wy >= ry - 100 &&
          wy <= ry + 10
        ) {
          setViewing(`remote:${remote.sessionId}`);
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
            <span className="hidden items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-extrabold text-emerald-300 lg:flex">
              <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
              {onlineCount} çevrimiçi
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
          style={{ zIndex: 1, isolation: "isolate" }}
          onClick={handleWorldClick}
        >
                <GameEngine3D
          playerPosRef={posRef}
          playerConfig={config}
          playerEquipped={equipped}
          facingRef={facingRef}
          bots={botsRef.current.map((b) => ({
            id: b.def.id,
            x: b.pos.x,
            y: b.pos.y,
            config: b.def.config,
            equipped: b.def.equipped,
            isMoving: b.moving,
            facing: b.facing,
          }))}
          moveTarget={targetMarker}
          isMobile={isMobile}
        />

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
            ) : viewedRemote ? (
              <CharacterCard
                key={viewedRemote.sessionId}
                name={viewedRemote.data?.name ?? "Oyuncu"}
                subtitle="Sanalika Caddesi sakini"
                badge={
                  viewedRemote.data?.vip ? (
                    <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                      👑 VIP
                    </span>
                  ) : null
                }
                avatar={
                  <>
                    <AvatarPreview
                      config={viewedRemote.data?.config ?? DEFAULT_AVATAR}
                      className="block h-24 w-auto"
                    />
                    <EquippedItems
                      equipped={viewedRemote.data?.equipped ?? []}
                      className="pointer-events-none absolute inset-0 h-24 w-auto"
                    />
                  </>
                }
                stats={
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-extrabold text-amber-700">
                    {abilityOf(viewedRemote.data?.ability ?? DEFAULT_ABILITY)
                      .emoji}{" "}
                    {abilityOf(viewedRemote.data?.ability ?? DEFAULT_ABILITY)
                      .name}
                  </span>
                }
                action={
                  <Button
                    size="sm"
                    className="w-full rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow hover:from-orange-400 hover:to-rose-400"
                    onClick={() => handleChallengeRemote(viewedRemote)}
                  >
                    <Swords className="size-4" /> Savaşa Davet Et
                  </Button>
                }
                onClose={() => setViewing(null)}
              />
            ) : null)}
        </AnimatePresence>

        {/* PvP duel invite — another player challenges you to a live fight */}
        <AnimatePresence>
          {pvpInvite && !battle && !pvpBattle && !pvpChallenge && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.85, y: 24, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 12, opacity: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 26 }}
                className="w-full max-w-sm rounded-3xl border-2 border-white/70 bg-[#fffaf0] p-6 text-center shadow-2xl"
              >
                <div className="mx-auto flex w-fit items-center justify-center gap-4">
                  <div className="relative shrink-0">
                    <AvatarPreview
                      config={pvpInvite.challenger.config}
                      className="block h-20 w-auto"
                    />
                    <EquippedItems
                      equipped={pvpInvite.challenger.equipped}
                      className="pointer-events-none absolute inset-0 h-20 w-auto"
                    />
                  </div>
                  <Swords className="size-9 animate-bounce text-orange-500" />
                </div>
                <h2 className="mt-4 text-lg font-extrabold text-[#2b2320]">
                  {pvpInvite.challenger.name} seni savaşa davet ediyor!
                </h2>
                <p className="mt-1 text-xs font-semibold text-muted-foreground">
                  Gerçek bir oyuncuya karşı canlı düello ⚔️
                </p>
                <div className="mt-5 flex gap-3">
                  <Button
                    size="lg"
                    className="flex-1 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow hover:from-rose-400 hover:to-orange-400"
                    onClick={handleAcceptInvite}
                  >
                    <Swords className="size-4" /> Kabul Et
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="flex-1 rounded-full"
                    onClick={handleDeclineInvite}
                  >
                    Reddet
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PvP challenge sent — waiting for the opponent to answer */}
        <AnimatePresence>
          {pvpChallenge && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-4"
            >
              <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border-2 border-white/70 bg-[#fffaf0] px-4 py-2.5 shadow-xl">
                <span className="size-3 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                <p className="text-xs font-extrabold text-[#2b2320]">
                  {pvpChallenge.opponentName} cevap veriyor…
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await cancelBattle({
                        battleId: pvpChallenge.battleId as Id<"battles">,
                        sessionId,
                      });
                    } catch (error) {
                      console.error("Davet iptal hatası:", error);
                    }
                    setPvpChallenge(null);
                  }}
                  className="flex size-7 items-center justify-center rounded-full bg-[#3d2f2a]/10 text-[#3d2f2a] transition-colors hover:bg-[#3d2f2a]/20"
                  aria-label="Daveti iptal et"
                >
                  <X className="size-4" />
                </button>
              </div>
            </motion.div>
          )}
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

        {/* PvP duel arena — two real phones, live via the battles doc + room */}
        {pvpBattle && battleDoc?.opponent && battleDoc.status !== "waiting" && (
          <PvpBattleScene
            battleId={pvpBattle.battleId}
            mySessionId={sessionId}
            playerName={
              pvpBattle.role === "challenger"
                ? battleDoc.challenger.name
                : battleDoc.opponent.name
            }
            playerConfig={
              pvpBattle.role === "challenger"
                ? battleDoc.challenger.config
                : battleDoc.opponent.config
            }
            playerEquipped={
              pvpBattle.role === "challenger"
                ? battleDoc.challenger.equipped
                : battleDoc.opponent.equipped
            }
            playerAbility={
              pvpBattle.role === "challenger"
                ? battleDoc.challenger.ability
                : battleDoc.opponent.ability
            }
            opponentName={
              pvpBattle.role === "challenger"
                ? battleDoc.opponent.name
                : battleDoc.challenger.name
            }
            opponentConfig={
              pvpBattle.role === "challenger"
                ? battleDoc.opponent.config
                : battleDoc.challenger.config
            }
            opponentEquipped={
              pvpBattle.role === "challenger"
                ? battleDoc.opponent.equipped
                : battleDoc.challenger.equipped
            }
            opponentAbility={
              pvpBattle.role === "challenger"
                ? battleDoc.opponent.ability
                : battleDoc.challenger.ability
            }
            onExit={endPvpBattle}
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
