// The Vaelos street — tap to walk, chat with vendors, shop with SP.
import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { CHAT_BUBBLE_MS } from "@/engine/ChatBubble3D";
import {
  GameEngine3D,
  raycastScreenToSVG,
  svgToWorld,
  worldToScreen,
} from "@/engine/GameEngine3D";

/** Dev-only Phase 1 GLB avatar test toggle: add ?glbtest=1 to the URL. */
const glbTestParam =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("glbtest");
import {
  BENCHES,
  BENCH_INTERACT_RADIUS,
  BENCH_STAND_FALLBACKS,
  BUILDINGS,
  benchFacing,
  benchSeatSpot,
  benchStandSpot,
  HOUSE_TRIGGER,
  houseTriggerBounds,
  WITCH_SHOP_DEF,
  PLAYER_3D_HEIGHT,
  SEAT_TRANSITION_SECONDS,
  SPAWN_SVG,
  S,
} from "@/engine/constants";
import { GlbProfileAvatar } from "@/engine/GlbAvatar3D";
import {
  consumeBenchSitRequest,
  setBenchSeatState,
} from "@/engine/benchSeat";
import {
  consumeHouseEnterRequest,
  setHouseNear,
  setHouseOwned,
  type HouseView,
} from "@/engine/houseDoor";
import { HouseRoom } from "@/components/world/HouseRoom";
import { FurnitureStandSheet } from "@/components/world/FurnitureStandSheet";
import { preloadRoomModel } from "@/engine/RoomStage";
import { useLatestRoomShot, useRoomShot } from "@/engine/roomShot";
import { hasCharacterSkin } from "@/engine/EquipmentRegistry";
import { starterFurniture } from "@/engine/roomBuild";
import { useIsMobile } from "@/hooks/use-mobile";

import { EquippedItems } from "@/components/avatar/EquippedItems";
import { EntryLoader } from "@/components/entry/EntryLoader";
import { Button } from "@/components/ui/button";
import { BagSheet, ShopSheet, VipSheet } from "@/components/world/ShopSheets";
import { ChatPanel, type ChatMessage } from "@/components/world/ChatPanel";
import {
  HousePreview,
  TradeSheet,
  WagerAnnouncement,
  WagerChallengeSheet,
  WagerInvitePopup,
  WagerWaitingBanner,
  describeWager,
  type IncomingWager,
} from "@/components/world/WagerSheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  usePresenceOthers,
  usePresencePublisher,
  type PresenceEntry,
} from "@/hooks/use-presence";
import { DEFAULT_AVATAR, type AvatarConfig } from "@/lib/avatar";
import { AUTH_TIMEOUT_MS, withTimeout } from "@/lib/withTimeout";
import {
  ABILITIES,
  abilityOf,
  BUBBLE_COLORS,
  circleHitsObstacles,
  CURRENCY_EMOJI,
  DAILY_BONUS_MS,
  DEFAULT_ABILITY,
  DEFAULT_BUBBLE_COLOR,
  formatCoins,
  GIFT_BOX,
  GIFT_CLICK_RADIUS,
  inWalkable,
  MAP_H,
  MAP_W,
  nearestWalkable,
  OBSTACLES,
  pushOutOfObstacles,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  svgX,
  svgY,
  VENDORS,
  VIP_VENDOR_ID,
  WALKABLE_ZONES,
  WORLD_BOUNDS,
  type AbilityId,
  type Rect,
  type Vendor,
} from "@/lib/shop";
import { findPath } from "@/lib/pathfinding";
import { isMuted, playSound, toggleMuted, unlockAudio } from "@/lib/sounds";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Backpack,
  Flower2,
  Footprints,
  Home,
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
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { VisualDebug } from "@/components/debug/VisualDebug";
import { levelFromWins, rankFromLevel, WINS_PER_LEVEL } from "@/lib/levels";
import { preloadStreetModels, STREET_TIPS } from "@/engine/streetPreload";
// 🧪 3D İZOLASYON TEŞHİSİ (APK çökmesini bölerek bulmak için) — bkz. bu
// dosyadaki `stageMode` dalları ve `engine/worldDebug`.
import {
  StageDomOnly,
  WorldStageProbe,
} from "@/engine/WorldStageProbe";
import { WorldStageDock } from "@/components/world/WorldStageDock";
import {
  isStageIsolation,
  traceStep,
  usesStageCanvas,
  worldDiagnosticsEnabled,
  worldStage,
} from "@/engine/worldDebug";
import {
  ASSET_ORDER,
  enqueueIdleTask,
  unlockBackgroundAssets,
} from "@/engine/assetQueue";

/* ── ⚡ DÜELLO SAHNELERİ TEMBEL YÜKLENİR ────────────────────────────────
   `BattleScene` / `PvpBattleScene` eskiden STATİK ithal ediliyordu. Bu iki
   modül kurulum anında arena haritasını (`5v5_game_map.glb`, 5,5 MB)
   `useGLTF.preload` ile ÖNDEN indiriyordu; yani `/world` açılır açılmaz
   harita caddenin kendi modelleriyle YARIŞARAK iniyor, belleği şişiriyor ve
   ilk kareler yavaşlıyordu. Telefon tarayıcısı/WebView'ı bu zirvede süreci
   öldürüyor ("Hay aksi! Bu web sayfasını görüntülerken bir hata oluştu.") ve
   yükleme ekranı donmuş kalıyordu. Arena kodu + haritası artık YALNIZCA maç
   gerçekten başlarken indirilir: cadde kapısı açılırken bellek ve bant
   genişliği tamamen caddeye kalır. */
const LazyBattleScene = lazy(() => import("@/components/world/BattleScene"));
const LazyPvpBattleScene = lazy(
  () => import("@/components/world/PvpBattleScene"),
);

/** Tembel düello sahnesi: parça inerken hiçbir şey çizilmez (kapı durur). */
function BattleScene(props: ComponentProps<typeof LazyBattleScene>) {
  return (
    <Suspense fallback={null}>
      <LazyBattleScene {...props} />
    </Suspense>
  );
}
function PvpBattleScene(props: ComponentProps<typeof LazyPvpBattleScene>) {
  return (
    <Suspense fallback={null}>
      <LazyPvpBattleScene {...props} />
    </Suspense>
  );
}

// Harita px katmanı: 1 dünya birimi = `S` px (bkz. `engine/constants`).
// Boyutlar artık elle yazılmıyor — dünya büyüyünce kendiliğinden ölçeklenir.
const WORLD_W = MAP_W;
const WORLD_H = MAP_H;
const PLAYER_W = 70;
const PLAYER_H = 96;
/**
 * ⚠️ BU İKİ SABİT BURADA (modülün en başında) TANIMLI OLMAK ZORUNDA.
 *
 * `BOT_PATHS` modül yüklenirken bir kez kurulur ve bot yolları `BOT_RADIUS`
 * ile doğrulanır — yani `BOT_RADIUS` okunması modül başlatılmasının EN
 * BAŞINDA olur. Aşağıda (propların yanında) tanımlanırsa `const`un geçici
 * ölü bölgesine (TDZ) düşer ve uygulama “Cannot access 'BOT_RADIUS' before
 * initialization” ile çöker. Tip denetimi bunu yakalamaz; çalışma zamanı
 * hatasıdır.
 */
/** İki karakter merkezi bu mesafeden yakınsa birbirlerinin İÇİNDEN geçemesinler. */
const CHAR_MIN_DIST = PLAYER_RADIUS * 2.2;
/**
 * 🚶‍♂️ Botların GÖVDE YARIÇAPI — yol doğrulamasında kullanılır.
 * Botlar oyuncuyla aynı sprite'ı taşır: yolları nokta nokta değil,
 * `PLAYER_RADIUS` kadar şişirilmiş engellerle doğrulanır.
 */
const BOT_RADIUS = PLAYER_RADIUS;
// Spawn on the open road, clear of every stall obstacle — the old spawn
// point sat inside the VIP stand's collision box, which pinned the player
// and made walking impossible. `SPAWN_SVG` dünya merkezine göre tanımlıdır.
const SPAWN = { x: SPAWN_SVG.x, y: SPAWN_SVG.y };

/** Random things the vendors say in the street chat. */
const VENDOR_PHRASES: Record<string, string[]> = {
  dondurma: [
    "Dondurmaaa! 🍦",
    "Serin serin dondurmalar!",
    "Bugün çileklisi bol!",
  ],
  balon: [
    "Balon alır mısın? 🎈",
    "Gökkuşağı balonu kalmadı!",
    "Rengârenk balonlar!",
  ],
  oyuncak: [
    "Oyuncaklarım çok tatlı 🧸",
    "Ayıcık sana sarılmak ister!",
    "Zıpzıp topu kaçırma!",
  ],
  moda: [
    "Yeni sezon burada! 🕶️",
    "Şapka sana çok yakışır!",
    "Caddede şıklık önemli!",
  ],
  silahci: [
    "Kılıçlar burada! ⚔️",
    "Savaşa hazır mısın?",
    "En sağlam zırhlar benim tezgâhta!",
  ],
  vip: [
    "Sana özel fırsat! 👑",
    "Balonun rengârenk olsun!",
    "VIP üyelikle her renk senin!",
  ],
};

/** An autonomous street walker — a bot that wanders the road on its own. */
interface BotDef {
  id: string;
  level: number; // 1..10 — drives battle strength
  name: string;
  color: string; // chat accent for this bot
  speed: number; // world units / second (slower than the player)
  x: number; // spawn point (must be on the walkable road)
  y: number;
  config: AvatarConfig;
  equipped: string[]; // small touches so they look lived-in
  ability: AbilityId; // battle super (Brawl-styled)
  isVendor?: boolean; // true for vendor NPCs at stalls
}

const BOT_DEFS: BotDef[] = [
  {
    id: "bot-ada",
    level: 2,
    name: "Ada",
    color: "#ec4899",
    speed: 80,
    x: 520, // X -13.6 · Z -3.4 (caddenin batı yarısı)
    y: 470,
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
    level: 3,
    name: "Mert",
    color: "#0ea5e9",
    speed: 80,
    x: 1680, // X +9.6 · Z -2.4
    y: 420,
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
    level: 1,
    name: "Elif",
    color: "#a855f7",
    speed: 80,
    x: 300, // X -18 · Z -4.4 (batı ucu, kuzey şeride yakın)
    y: 520,
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
    level: 4,
    name: "Kaan",
    color: "#f59e0b",
    speed: 80,
    x: 2080, // X +17.6 · Z -3.0 (doğu ucu)
    y: 450,
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
  {
    id: "bot-zeynep",
    level: 5,
    name: "Zeynep",
    color: "#f43f5e",
    speed: 80,
    x: 900, // X -6.0 · Z -2.4
    y: 380,
    config: {
      skin: "#f7c8a0",
      hair: "long",
      hairColor: "#7c2d12",
      shirt: "#e11d48",
      pants: "#1f2937",
      shoes: "#0f172a",
    },
    equipped: ["moda-atki"],
    ability: "ates",
  },
  {
    id: "bot-selin",
    level: 6,
    name: "Selin",
    color: "#06b6d4",
    speed: 80,
    x: 1250, // X +1.0 · Z -1.4 (caddenin ortası)
    y: 620,
    config: {
      skin: "#ffd9b8",
      hair: "curly",
      hairColor: "#3f2a1f",
      shirt: "#0891b2",
      pants: "#334155",
      shoes: "#e2e8f0",
    },
    equipped: ["moda-canta"],
    ability: "simsek",
  },
  {
    id: "bot-baris",
    level: 3,
    name: "Barış",
    color: "#22c55e",
    speed: 80,
    x: 760, // X -8.8 · Z -0.8 (güney kaldırım hattı)
    y: 560,
    config: {
      skin: "#d9a273",
      hair: "spiky",
      hairColor: "#422006",
      shirt: "#16a34a",
      pants: "#1e293b",
      shoes: "#f8fafc",
    },
    equipped: ["moda-eldiven"],
    ability: "sifa",
  },
  {
    id: "bot-naz",
    level: 7,
    name: "Naz",
    color: "#8b5cf6",
    speed: 80,
    x: 1750, // X +11.0 · Z -0.6 (doğu-güney)
    y: 620,
    config: {
      skin: "#f2c6a0",
      hair: "long",
      hairColor: "#4c1d95",
      shirt: "#7c3aed",
      pants: "#0f172a",
      shoes: "#a78bfa",
    },
    equipped: ["moda-zirh"],
    ability: "isik",
  },
  {
    id: "bot-tolga",
    level: 8,
    name: "Tolga",
    color: "#ef4444",
    speed: 80,
    x: 340, // X -17.2 · Z -4.4 (batı ucu)
    y: 300,
    config: {
      skin: "#a9703f",
      hair: "short",
      hairColor: "#0c0a09",
      shirt: "#dc2626",
      pants: "#111827",
      shoes: "#450a0a",
    },
    equipped: ["moda-kalkan"],
    ability: "ates",
  },
  {
    id: "bot-deniz",
    level: 2,
    name: "Deniz",
    color: "#0ea5e9",
    speed: 80,
    x: 2280, // X +21.6 · Z -1.0 (doğu kapısı)
    y: 520,
    config: {
      skin: "#ffd1a3",
      hair: "curly",
      hairColor: "#0369a1",
      shirt: "#0284c7",
      pants: "#1e3a8a",
      shoes: "#f1f5f9",
    },
    equipped: ["moda-gozluk"],
    ability: "temel",
  },
  {
    id: "bot-umut",
    level: 9,
    name: "Umut",
    color: "#eab308",
    speed: 80,
    x: 1500, // X +6.0 · Z -0.6
    y: 620,
    config: {
      skin: "#e8b98a",
      hair: "short",
      hairColor: "#292524",
      shirt: "#ca8a04",
      pants: "#1c1917",
      shoes: "#78350f",
    },
    equipped: ["moda-kilic"],
    ability: "simsek",
  },
  {
    id: "bot-ceren",
    level: 1,
    name: "Ceren",
    color: "#ec4899",
    speed: 80,
    x: 420, // X -15.6 · Z -5.0 (kuzey-batı)
    y: 250,
    config: {
      skin: "#ffe0c2",
      hair: "long",
      hairColor: "#9a3412",
      shirt: "#db2777",
      pants: "#312e81",
      shoes: "#fbcfe8",
    },
    equipped: ["moda-sapka"],
    ability: "temel",
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
  /**
   * Baş üstü sohbet baloncuğu metni (Sanalika/Habbo stili). Mesaj
   * gönderilince hemen yayınlanır, baloncuk kaybolunca `null` gider —
   * böylece baloncuk TÜM telefonlarda aynı karakterin üstünde görünür.
   */
  speech?: string | null;
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
  for (let i = 0; i < 48; i++) {
    const x = zone.x + 40 + rng() * (zone.w - 80);
    const y = zone.y + 40 + rng() * (zone.h - 80);
    // Gövde yarıçapı kadar da boş olmalı: bot bir tezgâhın/lambanın içine
    // yarım girmesin.
    if (inWalkable(x, y) && !circleHitsObstacles(x, y, BOT_RADIUS)) {
      return { x, y };
    }
  }
  return { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
}

/**
 * Bir nokta hem yürünebilir hem de karakter gövdesiyle engellere değmiyor mu?
 * `radius` verilmezse yalnızca nokta testi yapılır (eski davranış).
 */
function pointClear(x: number, y: number, radius = 0) {
  if (!inWalkable(x, y)) return false;
  return radius <= 0 || !circleHitsObstacles(x, y, radius);
}

/** True when the straight line between two points stays on the street. */
function segmentClear(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius = 0,
) {
  const steps = 16;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!pointClear(ax + (bx - ax) * t, ay + (by - ay) * t, radius)) return false;
  }
  return pointClear(bx, by, radius);
}

/** A closed walking loop per bot: wait, stroll to the next point, repeat. */
interface BotPath {
  pts: { x: number; y: number }[];
  wait: number[]; // seconds spent standing at each point
  walk: number[]; // seconds spent walking from point i to point i+1
  total: number; // loop duration in seconds
}

/** Bir L-bacağı (yatay + dikey, ya da düz çizgi) tamamen temiz mi? */
function botLegClear(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  // Ara nokta YALNIZCA iki eksende de fark varsa eklenir (aşağıda, `pts`
  // kurulurken); doğrulama da tam olarak aynı şekli ölçmeli.
  if (dx > 2 && dy > 2) {
    const corner = { x: b.x, y: a.y };
    return (
      pointClear(corner.x, corner.y, BOT_RADIUS) &&
      segmentClear(a.x, a.y, corner.x, corner.y, BOT_RADIUS) &&
      segmentClear(corner.x, corner.y, b.x, b.y, BOT_RADIUS)
    );
  }
  return segmentClear(a.x, a.y, b.x, b.y, BOT_RADIUS);
}

function buildBotPath(def: BotDef): BotPath {
  const rng = mulberry32(djb2(def.id));
  const start = { x: def.x, y: def.y };

  // Tur KAPALI olduğu için yalnızca ara noktalar değil KAPANIŞ bacağı (son ara
  // nokta → başlangıç) da temiz olmalı. Eskiden kapanış bacağı sonradan tek bir
  // nokta değiştirilerek yamanıyordu; bu da ondan ÖNCEKİ bacağı geçersiz
  // kılabiliyordu (bot yine bir prop'un içinden kesebiliyordu). Artık turun
  // TAMAMI baştan üretilir ve TÜM bacaklar — kapanış dahil — gövde yarıçapıyla
  // doğrulanır.
  let waypoints: { x: number; y: number }[] = [];
  for (let round = 0; round < 32 && waypoints.length === 0; round++) {
    const draft: { x: number; y: number }[] = [start];
    let ok = true;
    for (let i = 0; i < 8 && ok; i++) {
      const last = draft[draft.length - 1];
      let next: { x: number; y: number } | null = null;
      for (let attempt = 0; attempt < 24 && next === null; attempt++) {
        const cand = randomWalkablePoint(rng);
        if (botLegClear(last, cand)) next = cand;
      }
      if (next) draft.push(next);
      else ok = false;
    }
    if (!ok) continue;
    // Kapanış bacağı: son ara noktadan başlangıca dönüş.
    if (!botLegClear(draft[draft.length - 1], start)) continue;
    draft.push(start);
    waypoints = draft;
  }
  if (waypoints.length === 0) {
    // Beklenmedik dar bir bantta tur kurulamazsa bot SABİT dursun: içinden
    // geçmektense hiç yürümemesi yeğdir.
    waypoints = [start, start];
  }

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

const sheetPanel = {
  initial: { y: 40, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 40, opacity: 0 },
  transition: { duration: 0.25, ease: "easeOut" as const },
};

/** Bottom control bar button — gradient circle like the Vaelos client. */
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
  tone: "sky" | "purple" | "rose";
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
          : tone === "rose"
            ? "bg-gradient-to-br from-amber-200 to-rose-400"
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
        Yetenek, savaşta süper güç olarak kullanılır — hasar vererek doldurulur.
        ⚔️
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
  house,
  action,
  onClose,
}: {
  avatar: React.ReactNode;
  name: string;
  subtitle: string;
  badge?: React.ReactNode;
  stats: React.ReactNode;
  /** 🏠 Karakterin evi — izometrik önizleme (ad/boyut). */
  house?: React.ReactNode;
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
      {house && <div className="mt-3">{house}</div>}
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
    <GameSheet
      title={`👤 ${username}`}
      subtitle="Vaelos Kimliği"
      onClose={onClose}
    >
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
            <span className="text-lg">{CURRENCY_EMOJI}</span>{" "}
            {formatCoins(coins)} SP
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
  onOpenFurniture,
}: {
  onClose: () => void;
  onGo: (x: number, y: number, label: string) => void;
  /** Mobilya standını aç (eşya alımı — SP ile). */
  onOpenFurniture: () => void;
}) {
  return (
    <GameSheet
      title="🗺️ Tezgâhlar"
      subtitle="Bir yer seç — karakterin oraya kadar yürür."
      onClose={onClose}
    >
      {/* 🛋️ MOBİLYA STANTI — caddede yürümeye gerek yok: ev eşyaları buradan
          alınır, dizme işi evin içinde ("Evi Düzenle"). */}
      <button
        type="button"
        onClick={onOpenFurniture}
        className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-[#d9a53b]/60 bg-[#f0c987]/25 p-3 text-left transition-colors hover:bg-[#f0c987]/40"
      >
        <span className="text-2xl">🛋️</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold">Mobilya Stantı</p>
          <p className="text-[11px] text-muted-foreground">
            Ev eşyaları — Vaelos Parası ile al, evine diz
          </p>
        </div>
        <span className="text-xs font-extrabold text-primary">Aç</span>
      </button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {VENDORS.map((v) => (
          <div
            key={v.id}
            className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background p-3"
          >
            <span className="text-2xl">{v.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold">{v.short}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {v.name}
              </p>
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

/* Yürünebilirlik testi ve konumu caddeye geri çeken yardımcılar
   (`inWalkable`, `nearestWalkable`) `@/lib/shop` içindedir: çitlerin
   belirlediği yürünebilir alan oradaki `WALKABLE_ZONES` ile tanımlıdır ve
   bu fonksiyonlar ölçüm betiklerinden de çağrılır
   (bkz. `scripts/check-walkable-clamp.ts`). */

/**
 * 🪑 Bank oturma noktaları (px) — 3D dünyada tanımlı BENCHES'ten türetilir,
 * yani harita büyüdüğünde elle güncellenmesi gerekmez. `facing` oturan
 * karakterin baktığı yöndür ve `Bench3D` ile aynı kaynaktan gelir.
 */
const BENCH_SEATS: { x: number; y: number; facing: 1 | -1 }[] = BENCHES.map(
  (def) => {
    const spot = benchSeatSpot(def);
    return { x: svgX(spot.x), y: svgY(spot.z), facing: benchFacing(def) };
  },
);
/** Oturma etkileşiminin px cinsinden menzili. */
const BENCH_RADIUS_PX = BENCH_INTERACT_RADIUS * S;

/**
 * 🏠 EV KAPISI MENZİLİ (px) — `constants.HOUSE_TRIGGER`ten türetilir, elle
 * yazılmaz. Oyuncu bu dikdörtgene girince evin kapısında "Evine gir" düğmesi
 * belirir (bkz. `houseDoor`). Sınırlar 3D katmanla aynı kaynaktan geldiği için
 * düğme ile menzil ayrışamaz.
 */
const HOUSE_DOOR_PX = (() => {
  const { west, east } = houseTriggerBounds(WITCH_SHOP_DEF.x);
  return {
    west: svgX(west),
    east: svgX(east),
    // `svgY` ters çevirir: büyük Z (güney) → küçük y. Şerit [south, north].
    south: svgY(HOUSE_TRIGGER.southZ),
    north: svgY(HOUSE_TRIGGER.northZ),
  };
})();
/**
 * Bankın ÖNÜNDE durulacak px noktası — karakter oraya YÜRÜR, sonra oturur
 * (ışınlanma yok). En yakın yürünebilir mesafe seçilir: kaldırımın dışına
 * taşan banklarda (güney kaldırım, `facing: 1`) mesafe kısalır; hiçbiri
 * yürünebilir değilse oturma noktasının kendisi döner.
 */
function benchStandPx(index: number): { x: number; y: number } {
  const def = BENCHES[index];
  for (const offset of BENCH_STAND_FALLBACKS) {
    const spot = benchStandSpot(def, offset);
    const x = svgX(spot.x);
    const y = svgY(spot.z);
    if (inWalkable(x, y)) return { x, y };
  }
  return { x: BENCH_SEATS[index].x, y: BENCH_SEATS[index].y };
}
/** Bankın önündeki durağa bu kadar yaklaşınca oturma geçişi başlar (px). */
const SIT_ARRIVE_PX = 22;

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

/**
 * Cadde yükleme ekranının adımları — sırayla yanar. Metinler gerçekten
 * yapılan işi anlatır: sahne kapının ARKASINDA kurulurken bunlar çalışır.
 */
const STREET_LOAD_STEPS = [
  "Kimlik doğrulanıyor",
  "Cadde verileri alınıyor",
  "Çevre modelleri indiriliyor",
  "Karakter yerleştiriliyor",
  "Ana cadde çiziliyor",
];

/**
 * 🚪 CADDE KAPISI — OTURUM HAFIZASI (modül düzeyi).
 *
 * `World` sayfası yeniden monte edilebilir: React `StrictMode` (geliştirme)
 * ya da hesap sorgusunun Convex yeniden bağlanırken bir an `undefined`'a
 * düşmesi (mobilde dalgalı ağda çok sık olur — bkz. `RequireAuth`). Kapı
 * durumu bileşenin İÇİNDE tutulsaydı her yeniden montajda sıfırlanırdı:
 * yüzde yeniden %14'e, emniyet supabının sayacı da baştan başlar ve ekran
 * KALICI olarak "%14 · Kimlik doğrulanıyor"da takılı kalırdı — Android APK'da
 * tam olarak bu görülüyordu. Bu yüzden kapı durumu modül düzeyinde tutulur:
 *   · kapı BİR KEZ açıldıktan sonra oturum boyunca açık kalır (yeniden
 *     montajda kullanıcıya ikinci kez yükleme ekranı gösterilmez),
 *   · emniyet supabı SABİT bir zaman damgasına bağlıdır; yeniden montaj onu
 *     baştan başlatamaz.
 */
const GATE_VALVE_MS = 6500;
/** "Kimlik doğrulanıyor" adımı bu süre içinde çözülmezse süreç kilitlenmez:
 *  adım TAMAMLANMIŞ sayılır, oturum yoksa anonim (konuk) oturuma düşülür ve
 *  yükleme bir sonraki adımdan ("Cadde verileri alınıyor") devam eder. */
const GATE_AUTH_STEP_MS = 2000;
/** Hesap sorgusu (`profiles.getMyProfile`) bu süre içinde sonuçlanmazsa
 *  sonsuz spinner yerine "Yeniden Dene" katmanı gösterilir. */
const PROFILE_STALL_MS = 6000;
const gateSession: { startMs: number | null; opened: boolean } = {
  startMs: null,
  opened: false,
};

export default function World() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  // 🧪 İZOLASYON AŞAMASI: 0 = normal oyun. 1–8 = gerçek 3D motoru devreden
  // çıkar ve yerine `WorldStageProbe` (tek değişkenli ölçüm) geçer. Bu mod
  // YALNIZCA teşhis içindir; aşama 0'da davranış eskisiyle BİREBİR aynıdır
  // (aşağıdaki bütün `stageMode` dalları kapalı kalır).
  const stage = worldStage();
  const stageMode = isStageIsolation();
  const showDock = worldDiagnosticsEnabled();
  const profile = useQuery(api.profiles.getMyProfile);
  // 🛡️ Kapının "Kimlik doğrulanıyor" bekçisi için: oturum durumu ve konuk
  // girişi. (Korunmuş rota olsa da mobil ağ kopmalarında oturum gerileyebilir.)
  const { isAuthenticated } = useConvexAuth();
  const { signIn: authSignIn } = useAuthActions();
  const claimDaily = useMutation(api.profiles.claimDailyBonus);
  const setBubbleColor = useMutation(api.profiles.setBubbleColor);
  const buyAbility = useMutation(api.profiles.buyAbility);
  const equipAbility = useMutation(api.profiles.equipAbility);
  const battleVictory = useMutation(api.profiles.battleVictory);
  // 🏠 Oyuncu evleri (bkz. `convex/houses.ts`): ONLINE ve reaktif — başka bir
  // oyuncu ev kurduğunda/değiştirdiğinde cadde kendiliğinden güncellenir.
  // 🏠 Ev (oda) sunucusu: oda İLK GİRİŞTE OTOMATİK açılır — arsa/kurulum yok.
  const enterHouse = useMutation(api.houses.enter);
  const renameHouse = useMutation(api.houses.rename);
  const visitHouse = useMutation(api.houses.visit);
  // 🏠 Profil kartındaki ev önizlemesi (yalnız görüntü — ad).
  const myHouseView = useQuery(api.houses.mine);
  // 🏚️ EV KAYBI (bkz. `convex/houses.ts`): profil `houseLost` bayrağını taşır.
  // Evini düelloda/takasta kaybeden oyuncuya girişte BEDAVA ev açılmaz; bu
  // bayrak hem kapı düğmesini hem giriş denemesini dürüstçe yönlendirir.
  const houseLost = profile?.houseLost === true;
  // Kapı düğmesi (3D) "eve girilebilir mi" bilgisini buradan okur.
  useEffect(() => {
    // Sorgular yüklenene kadar yazma (düğme yanlışlıkla "Ev yok" görünmesin).
    if (profile === undefined || myHouseView === undefined) return;
    setHouseOwned(!(houseLost && myHouseView === null));
  }, [profile, myHouseView, houseLost]);
  // 📸 Kendi evimin gerçek fotoğrafı (odaya girdiğimde yakalanır).
  const myRoomShot = useRoomShot(myHouseView?.roomId);
  // 🛋️ MOBİLYA EKONOMİSİ (bkz. `convex/furniture.ts`): oyuncu eşyaları
  // CADDEDEKİ STANTTAN Vaelos Parası ile alır ve SAHİP OLDUKLARINI evine dizer.
  // Yerleşim sunucuda tutulur: oda kapanıp açılsa da düzen yerinde kalır.
  const myFurniture = useQuery(api.furniture.myFurniture);
  const placeRoomItem = useMutation(api.furniture.place);
  const liftRoomItem = useMutation(api.furniture.lift);
  const seedRoomFurniture = useMutation(api.furniture.seedStarter);
  const sendChat = useMutation(api.chat.send);
  const createBattle = useMutation(api.battles.createBattle);
  const acceptBattle = useMutation(api.battles.acceptBattle);
  const declineBattle = useMutation(api.battles.declineBattle);
  const finishBattle = useMutation(api.battles.finishBattle);
  const cancelBattle = useMutation(api.battles.cancelBattle);
  // ⚔️ BAHİSLİ DÜELLO: altın/ev ortaya koyan yüksek riskli düellolar.
  const acceptWager = useMutation(api.wagers.accept);
  const declineWager = useMutation(api.wagers.decline);
  const cancelWager = useMutation(api.wagers.cancel);
  const finishWager = useMutation(api.wagers.finish);
  // ⚔️ BOT BAHİSİ: cadde botları gerçek profil satırı olmadığı için SP-only,
  // yerel kabul akışı + sunucuda rehin/ödeme (bkz. `convex/wagers.ts`).
  const startBotWager = useMutation(api.wagers.startBotWager);
  const finishBotWager = useMutation(api.wagers.finishBotWager);
  const refundBotWagers = useMutation(api.wagers.refundBotWagers);
  // 🏠 TAKAS: gerçek oyuncuya ev/para takas daveti (mevcut
  // `wagers.create` akışıyla ev + SP rehine alınır).
  const createWager = useMutation(api.wagers.create);

  // Visual Debug toggle — Ctrl+Shift+D
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setDebugOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldGroupRef = useRef<SVGGElement>(null);
  const playerSvgRef = useRef<SVGSVGElement>(null);
  const playerWorldGroupRef = useRef<SVGGElement>(null);
  const playerRef = useRef<SVGGElement>(null);
  const spriteRef = useRef<SVGGElement>(null);
  const avatarSvgCache = useRef<SVGSVGElement | null>(null);
  const remoteSpriteCache = useRef(new Map<string, SVGGElement>());
  const remotePoseCache = useRef(new Map<string, SVGSVGElement>());
  const remotePlayerSelectRef = useRef<
    ((entry: PresenceEntry<WorldPresence>) => void) | null
  >(null);

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
  // 🏠 ODA: kapıdaki "Evine gir" (ya da HUD'daki "Evim") → doğrudan oyuncunun
  // kendi odası (`room`). Arada TAM EKRAN yükleme ekranı YOKTUR: oda açılır,
  // 3D sahne kurulurken yedek oda görünür (bkz. `HouseRoom` başlığı).
  const [room, setRoom] = useState<{ view: HouseView } | null>(null);
  // 🛒 MOBİLYA STANTI: caddeden ya da evin içinden (düzenleme tepsisindeki
  // "Stant" düğmesi) açılan satın alma paneli.
  const [standOpen, setStandOpen] = useState(false);
  // Komşunun odasındayken ONUN eşyaları gösterilir (kendi dolabın değil).
  const neighborFurniture = useQuery(
    api.furniture.byOwnerName,
    room && !room.view.isMine ? { ownerName: room.view.ownerName } : "skip",
  );
  const roomFurniture = room?.view.isMine
    ? (myFurniture ?? [])
    : (neighborFurniture ?? []);
  /**
   * 🎁 BAŞLANGIÇ TAKIMI — oda ilk kez açıldığında HEDİYE edilen eşyalar.
   *
   * NEDEN: oda modeli boş bir mekân; hiç eşya olmasa oyuncu çıplak bir kutu
   * görürdü. Hediye, sunucuda GERÇEK satırlar olarak tohumlanır (`seedStarter`)
   * ve yalnızca BİR KEZ verilir (`houses.furnitureSeeded`): oyuncu hepsini
   * kaldırsa bile geri gelmez. Konumlar oransal olduğu için istemci gönderir
   * (`starterFurniture`), doğrulama ve adet sınırı sunucudadır.
   */
  const seedTriedRef = useRef(false);
  useEffect(() => {
    if (!room?.view.isMine) return;
    // Sorgu yüklenmediyse (`undefined`/`null`) ya da oyuncunun eşyası varsa
    // dokunma: hediye, "eşya yok" cevabı GELDİKTEN sonra bir kez tohumlanır.
    if (!myFurniture || myFurniture.length > 0) return;
    if (seedTriedRef.current) return; // bu oturumda bir kez denendi
    seedTriedRef.current = true;
    void seedRoomFurniture({
      items: starterFurniture().map((row) => ({
        itemId: row.itemId,
        fx: row.fx ?? 0,
        fz: row.fz ?? 0,
      })),
    });
  }, [room, myFurniture, seedRoomFurniture]);
  const [vipOpen, setVipOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [targetMarker, setTargetMarker] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const targetRef = useRef<{ x: number; y: number } | null>(null);
  // 🪵 Çarpma ("donk"): son ses anı + önceki karede dayanıyor muyduk (kenar
  // tetikleme — duvara yaslanınca ses tekrarlanıp makineleşmesin).
  const bumpAtRef = useRef(0);
  const blockedRef = useRef(false);
  // 🪑 Bank: hangi bankın menzilinde olduğumuz (buton) ve oturulan bank.
  const [nearBench, setNearBench] = useState<number | null>(null);
  const [seatBench, setSeatBench] = useState<number | null>(null);
  const nearBenchRef = useRef<number | null>(null);
  const seatBenchRef = useRef<number | null>(null);
  // 🏠 Kapı menzilinde miyiz (3D "Evine gir" düğmesi bunu okur) ve oda
  // penceresi/yüklemesi açık mı (oyun döngüsü karakteri dondurur).
  const houseNearRef = useRef(false);
  const roomOpenRef = useRef(false);
  /** Giriş sürüyor mu — çift tıklama iki kez oda açmasın. */
  const roomBusyRef = useRef(false);
  // Kalktıktan sonra kısa bir süre tekrar oturmayı engeller (aynı banka
  // dokununca "kalk → hemen otur" titremesi olmasın).
  const sitCooldownRef = useRef(0);
  // 🪑 Banka yürüyüş isteği (bankın önündeki durağa varınca oturulur).
  const sitRequestRef = useRef<{ index: number; x: number; y: number } | null>(
    null,
  );
  // 🪑 Oturma/kalkma yer değiştirmesi — konum bu aralıkta lerp ile kayar.
  const seatMoveRef = useRef<{
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    t: number;
  } | null>(null);
  const stuckRef = useRef({ x: 0, y: 0, since: 0 });
  const waypointsRef = useRef<{ x: number; y: number }[]>([]);
  const waypointIdxRef = useRef(0);
  // Autonomous bots: positions/animations live in refs (mutated every frame
  // without re-rendering React); only their speech bubbles are React state.
  const botRefs = useRef(new Map<string, SVGGElement>());
  // Cache querySelector results for bots to avoid per-frame DOM traversal.
  const botSpriteCache = useRef(new Map<string, SVGGElement>());
  const botPoseCache = useRef(new Map<string, SVGSVGElement>());
  // Botların kare başına ÇÖZÜLMÜŞ konumlarından ÖNCEKİ "taban" konumları
  // (paylaşılan saatten türeyen yol üzerindeki nokta). Ayrıştırma itmesi
  // yalnızca bu taban konumlara bakar → sıraya bağlı olmayan, deterministik
  // bir çözüm (her cihazda aynı).
  const botBaseRef = useRef<({ x: number; y: number } | null)[]>([]);
  const botsRef = useRef([
    ...BOT_DEFS.map((def) => ({
      def,
      pos: { x: def.x, y: def.y },
      facing: 1,
      vy: 0,
      phase: 0,
      moving: false,
      path: BOT_PATHS.get(def.id)!,
      offset: ((djb2(def.id) % 997) / 997) * 40,
    })),
    // Vendor NPCs — static shopkeepers at their stalls
    ...VENDORS.map((v) => ({
      def: {
        id: v.id,
        name: v.short,
        color: v.color,
        speed: 0,
        x: v.x,
        y: v.y,
        config: {
          skin: "#ffd1a3",
          hair: "short",
          hairColor: "#3d2f2a",
          shirt: v.color,
          pants: "#3d3040",
          shoes: "#2a2020",
        } as AvatarConfig,
        equipped: [] as string[],
        ability: "isik" as AbilityId,
        isVendor: true,
      },
      pos: { x: v.x, y: v.y },
      facing: 1,
      vy: 0,
      phase: 0,
      moving: false,
      path: { pts: [], wait: [], walk: [], total: 0 } as BotPath,
      offset: 0,
    })),
  ]);
  const [botBubbles, setBotBubbles] = useState<Record<string, string | null>>(
    {},
  );
  // Which character profile is open in the top-right card ("me" or a bot id).
  const [viewing, setViewing] = useState<string | null>(null);
  const viewedBot =
    viewing !== null && viewing !== "me"
      ? (BOT_DEFS.find((b) => b.id === viewing) ?? null)
      : null;
  // Ability shop + duel invites + active battle.
  const [abilitiesOpen, setAbilitiesOpen] = useState(false);
  const [invite, setInvite] = useState<{
    botId: string;
    status: "waiting" | "accepted" | "rejected";
  } | null>(null);
  const [battle, setBattle] = useState<{
    opponent: BotDef;
    opponentLevel: number;
    playerAbility: string;
    opponentAbility: string;
    /** Bahisli bot düellosu ise özet — arena duyurusunu tetikler. */
    highStakes?: { summary: string };
    /** ⚔️ RAUND SAYISI: takas maçları 3 raunt (en iyi 3'ün) oynanır. */
    rounds?: number;
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
    /** Bahisli düello ise özet — arena duyurusu için (yüksek bahis HUD'i). */
    highStakes?: { summary: string; houseName?: string };
  } | null>(null);
  // ⚔️ Bahis sözleşmesi durumları: forma açık mı, bekleyen davetim, bana gelen
  // davet ve aktif bahis (dövüş sonunda ödeme için).
  const [wagerChallenge, setWagerChallenge] = useState<{
    name: string;
  } | null>(null);
  const [wagerPending, setWagerPending] = useState<{
    wagerId: string;
    name: string;
    summary: string;
  } | null>(null);
  const [wagerInvite, setWagerInvite] = useState<IncomingWager | null>(null);
  const [wagerBusy, setWagerBusy] = useState(false);
  const [activeWager, setActiveWager] = useState<{
    wagerId: string;
    summary: string;
    houseName?: string;
  } | null>(null);
  const activeWagerRef = useRef(activeWager);
  activeWagerRef.current = activeWager;
  // Arena başında birkaç saniye görünen "yüksek bahis" duyurusu.
  const [wagerAnnounce, setWagerAnnounce] = useState(false);
  useEffect(() => {
    if (!pvpBattle?.highStakes && !battle?.highStakes) {
      setWagerAnnounce(false);
      return;
    }
    setWagerAnnounce(true);
    const id = window.setTimeout(() => setWagerAnnounce(false), 4500);
    return () => window.clearTimeout(id);
  }, [pvpBattle?.highStakes, battle?.highStakes]);
  // ⚔️ BOT BAHİSİ: form, botun cevap bekleyişi ve aktif bahis (ödeme için).
  const [botWagerChallenge, setBotWagerChallenge] = useState<{
    bot: BotDef;
  } | null>(null);
  const [botWagerPending, setBotWagerPending] = useState<{
    botId: string;
    botName: string;
    summary: string;
  } | null>(null);
  const [activeBotWager, setActiveBotWager] = useState<{
    botWagerId: string;
    summary: string;
  } | null>(null);
  const activeBotWagerRef = useRef(activeBotWager);
  activeBotWagerRef.current = activeBotWager;
  // 🏠 TAKAS sayfası hedefi: cadde sakini (`bot`) ya da gerçek oyuncu (ad).
  const [tradeChallenge, setTradeChallenge] = useState<{
    opponentName: string;
    bot?: BotDef;
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
  const battleWins = profile?.battleWins ?? 0;
  const level = profile?.level ?? levelFromWins(battleWins);
  const nextLevelWins = level >= 10 ? null : level * WINS_PER_LEVEL;
  const vipUntil = profile?.vipUntil ?? 0;
  const bubbleColorId = profile?.bubbleColor ?? DEFAULT_BUBBLE_COLOR;
  const giftClaimed =
    profile !== undefined &&
    (profile?.lastDailyClaim ?? 0) > Date.now() - DAILY_BONUS_MS;
  const rank = rankFromLevel(level);

  /* ── CADDE YÜKLEME KAPISI ─────────────────────────────────────────
     Sahne kapının ARKASINDA kurulur: `GameEngine3D` caddenin temel
     modellerini (çim zemin, ağaçlar, çim öbekleri, karakter) sahnenin kendi
     `useGLTF` önbelleğiyle bekler, ilk kareleri çizer ve `onSceneReady` ile
     haber verir. Kapı bu iki sinyali beklediği için oyuncu caddeyi ilk kez
     donarak/eksik görmez — eskiden "girdikten sonra render oluyordu". */
  const [gateSceneReady, setGateSceneReady] = useState(false);
  const [gateForced, setGateForced] = useState(false);
  const [gatePct, setGatePct] = useState(0);
  // Kapı oturum boyunca bir kez açılır; yeniden montajda tekrar gösterilmez.
  // İZOLASYON MODUNDA kapı HİÇ beklemez: aşamanın kendi sonda paneli zaten
  // ne olduğunu söyler; kapı bekleseydi "Cadde verileri alınıyor" ekranının
  // arkasında hangi aşamanın çöktüğünü ayırt edemezdik.
  const [gateOpen, setGateOpen] = useState(gateSession.opened || stageMode);
  const [gateTipIndex, setGateTipIndex] = useState(0);

  const handleSceneReady = useCallback(() => {
    traceStep("world:scene-ready");
    setGateSceneReady(true);
  }, []);

  // 🧪 İZ: hangi aşamada olduğumuz ve kapının açıldığı an KALICI olarak
  // yazılır. APK çökerse bir sonraki açılışta teşhis paneli bu son adımı
  // gösterir — "ne kadar sonra ve nerede öldü?" sorusu tahminle değil
  // kayıtla yanıtlanır (bkz. `engine/worldDebug` → `traceStep`).
  useEffect(() => {
    traceStep("world:mounted", `aşama ${stage}`);
  }, [stage]);
  useEffect(() => {
    if (gateOpen) traceStep("world:gate-open");
  }, [gateOpen]);

  /**
   * 🏠 ODA MODELİNİ ERKEN İNDİR — odaya giriş ANINDA açılsın.
   *
   * Oda modeli ağırdır (bkz. `constants.ROOM_MODEL_URL`). İndirme cadde ilk
   * kez çizildikten kısa süre sonra kendiliğinden başlar; oyuncu kapıya
   * vardığında oda çoğunlukla HAZIR olur. Böylece odaya girişte ekrana ne bir
   * yükleme katmanı ne de uydurma/yedek bir oda basılır — oda doğrudan açılır.
   * 1,5 sn gecikme bilinçli: önce oyuncu caddeyi görsün, indirme caddenin kendi
   * modelleriyle/ilk kareleriyle yarışmasın.
   */
  useEffect(() => {
    if (!gateSceneReady || stageMode) return;
    // 🚦 ODA MODELİ KUYRUK SONUNDA: eskiden sahne hazır olduktan 1,5 sn sonra
    // KOŞULSUZ indiriliyordu — tam da ağaç/bina/zırh yüklemeleriyle aynı anda.
    // Artık kuyruk BOŞTA olduğunda (ağır varlıklar bittikten sonra) çalışır.
    const timer = window.setTimeout(
      () => enqueueIdleTask(ASSET_ORDER.room, "oda modeli", preloadRoomModel),
      1500,
    );
    return () => window.clearTimeout(timer);
  }, [gateSceneReady, stageMode]);

  // Kapının beklediği EK modeller: YOK.
  //
  // Kök neden düzeltmesi: kapı artık YALNIZCA kritik varlıkları bekler
  // (çim zemin + karakter — bkz. `GameEngine3D` → `StreetAssetsProbe`).
  // Ağır binalar (cadı dükkânı 43 MiB GPU dokusu) ve oyuncu skini kapıyı
  // geciktirmez; cadde açıldıktan sonra `engine/assetQueue` sırasıyla TEK TEK
  // yüklenir ve model hazır olduğunda arsaya oturur. Böylece "caddeyi açmak"
  // için gereken eşzamanlı GLB sayısı 6'dan 2'ye iner.
  const gateModelUrls = useMemo<readonly string[]>(() => [], []);

  // KRİTİK cadde modellerini (zemin + karakter) hemen indirmeye başla.
  // Ağır/çevresel modeller BURADA ön yüklenmez (bkz. `preloadStreetModels`).
  // ⚠️ İZOLASYON MODUNDA ön yükleme YOK: aşamaya yalnızca o aşamanın varlıkları
  // girmeli, yoksa ölçüm kirlenir (bkz. `worldDebug` → `assetPreloadingSuppressed`).
  useEffect(() => {
    if (stageMode) return;
    preloadStreetModels();
  }, [stageMode]);

  // 🔓 CADDE AÇILDI: arka plan yükleme sırası ANCAK bundan sonra akar
  // (ağaç → çim öbekleri → bina → skin → oda → zırh, tek tek). Kapı kapanmadan
  // hiçbir ağır model parse edilmez; böylece başlangıç bellek zirvesi düşer.
  useEffect(() => {
    // İzolasyon modunda arka plan sırası (ağaç → çim → bina → skin → oda →
    // zırh) KAPALI kalır: "aşama 3 = zemin" derken ağacın da inmesi ölçümü
    // anlamsız kılardı. Sonda kendi varlıklarını tek tek yükler.
    if (stageMode) return;
    if (gateOpen) unlockBackgroundAssets();
  }, [gateOpen, stageMode]);

  // İlerleme hedefi — ZAMANA bağlı (model sayacına DEĞİL).
  //
  // Eskiden hedef `useProgress()` (drei'nin yükleme yöneticisi) ile
  // hesaplanıyordu. Ama bu sayaç güvenilir DEĞİL: Android WebView'de modeller
  // inmese de 0'da kalıyor ve ekran tam olarak "%14 · Kimlik doğrulanıyor"da
  // DONUYORDU (kimi zaman animasyon ortasında "%4" görünüyordu). Şimdi hedef,
  // gerçek sahne sinyali (`gateSceneReady`) gelene kadar ZAMANLA yükselir ve
  // %92'de bekler; sahne hazır olunca (ya da emniyet supabı devreye girince)
  // %100 olur. Böylece çubuk her zaman akar, ekran asla donmuş görünmez ve
  // yükleme hiçbir zaman üçüncü parti bir sayaçın keyfine bağlı kalmaz.
  const [gateTarget, setGateTarget] = useState(14);
  useEffect(() => {
    if (gateForced || gateSceneReady) {
      setGateTarget(100);
      return;
    }
    const id = window.setInterval(() => {
      setGateTarget((t) =>
        t >= 92 ? 92 : Math.min(92, t + (t < 60 ? 2 : 0.8)),
      );
    }, 200);
    return () => window.clearInterval(id);
  }, [gateForced, gateSceneReady]);

  useEffect(() => {
    if (gateOpen) return;
    const cap = gateTarget >= 99.5 ? 100 : 92;
    const id = window.setInterval(() => {
      setGatePct((p) =>
        Math.min(cap, gateTarget, p + (p < 60 ? 4.5 : p < 88 ? 2 : 0.9)),
      );
    }, 60);
    return () => window.clearInterval(id);
  }, [gateOpen, gateTarget]);

  // Emniyet supabı: ağ takılırsa (ya da modeller bu cihazda hiç inmezse)
  // yükleme ekranı SONSUZA kadar kalmasın.
  //
  // Bir kerelik `setTimeout` yerine ZAMAN DAMGASINA bağlı yoklama: sayaç
  // yeniden montajda baştan başlamaz ve arka planda kısılan/sıkışan
  // zamanlayıcılar bile sonraki tikte yakalar.
  useEffect(() => {
    if (gateSession.startMs === null) gateSession.startMs = Date.now();
    const deadline = gateSession.startMs + GATE_VALVE_MS;
    const expired = () => Date.now() >= deadline;
    if (expired()) {
      setGateForced(true);
      return;
    }
    const id = window.setInterval(() => {
      if (expired()) {
        window.clearInterval(id);
        setGateForced(true);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  // Supap devreye girdiğinde çubuğu hemen %100'e tamamla (donmuş görünmesin).
  useEffect(() => {
    if (gateForced) setGatePct((p) => (p < 100 ? 100 : p));
  }, [gateForced]);

  useEffect(() => {
    if (gateOpen) return;
    const id = window.setInterval(
      () => setGateTipIndex((i) => (i + 1) % STREET_TIPS.length),
      2600,
    );
    return () => window.clearInterval(id);
  }, [gateOpen]);

  // Kapı, sahne hazır olduğunda (gateSceneReady) YA DA emniyet supabı devreye
  // girdiğinde (gateForced) açılır. Supap devredeyse yüzdenin %100'e ulaşması
  // BEKLENMEZ: aksi halde kısılan ilerleme aralığı kapıyı yine takılı
  // bırakabilirdi.
  useEffect(() => {
    if (gateOpen) return;
    if (!gateForced && gatePct < 99.5) return;
    const id = window.setTimeout(
      () => setGateOpen(true),
      gateForced && gatePct < 99.5 ? 360 : 420,
    );
    return () => window.clearTimeout(id);
  }, [gateOpen, gateForced, gatePct]);

  // Kapı bir kez açıldı: oturum boyunca açık kalır (yeniden montaj koruması).
  useEffect(() => {
    if (gateOpen) gateSession.opened = true;
  }, [gateOpen]);

  // 🛡️ KİMLİK ADIMI BEKÇİSİ (APK'da "%18 · Kimlik doğrulanıyor" takılması).
  //
  // Kapının ilk adımı kimlik verisinin gelmesini bekler. Mobil WebView'da bu
  // veri HİÇ gelmeyebiliyor (ölü soket) ve ekran kilitleniyordu. Bekçi, kısa
  // bir süre (2 sn) sonunda adımı TAMAMLANMIŞ sayar; oturum da yoksa anonim
  // (konuk) oturuma düşer. Böylece akış bir sonraki adımdan devam eder,
  // süreç kilitli kalmaz — yükleme ekranı hiçbir koşulda donmuş görünmez.
  const [gateAuthStepDone, setGateAuthStepDone] = useState(false);
  const gateGuestTried = useRef(false);
  useEffect(() => {
    if (profile !== undefined) {
      setGateAuthStepDone(true);
      return;
    }
    const id = window.setTimeout(
      () => setGateAuthStepDone(true),
      GATE_AUTH_STEP_MS,
    );
    return () => window.clearTimeout(id);
  }, [profile]);

  useEffect(() => {
    if (!gateAuthStepDone || gateGuestTried.current || isAuthenticated) return;
    gateGuestTried.current = true;
    // Zaman aşımı şart: `signIn` bazı WebView'larda hiç sonuçlanmıyor.
    void withTimeout(
      authSignIn("anonymous"),
      AUTH_TIMEOUT_MS,
      "Misafir girişi",
    ).catch((error: unknown) => {
      console.warn("[Vaelos] kapıda konuk girişi başarısız:", error);
    });
  }, [gateAuthStepDone, isAuthenticated, authSignIn]);

  // 🧯 PROFİL SORGUSU TAKILMASI: `profiles.getMyProfile` bazı mobil
  // WebView'larda HİÇ sonuçlanmıyor (ölü soket). Eskiden ekranda sonsuza
  // kadar dönen bir halka kalıyordu ve oyuncunun hiçbir çıkışı yoktu. Artık
  // bu süre sonunda dürüst bir "Yeniden Dene" katmanı gösterilir.
  const [profileStalled, setProfileStalled] = useState(false);
  useEffect(() => {
    if (profile !== undefined) {
      setProfileStalled(false);
      return;
    }
    const id = window.setTimeout(
      () => setProfileStalled(true),
      PROFILE_STALL_MS,
    );
    return () => window.clearTimeout(id);
  }, [profile]);

  // Kapı yalnızca hesap hazır olduğunda çizilir: profil yoksa/banlıysa zaten
  // kendi bilgi katmanı görünür (aşağıdaki `profile === null` blokları).
  const gateVisible =
    !stageMode &&
    !gateOpen &&
    profile !== undefined &&
    profile !== null &&
    !profile.banned;
  const pctStepIndex =
    gatePct < 20 ? 0 : gatePct < 40 ? 1 : gatePct < 62 ? 2 : gatePct < 84 ? 3 : 4;
  // Kimlik adımı bekçisi tamamlandıysa ilk adımda TAKILI kalma: en az
  // "Cadde verileri alınıyor" adımından devam et.
  const gateStepIndex = Math.max(gateAuthStepDone ? 1 : 0, pctStepIndex);

  // Kapı açılana kadar sahne "hazır" sayılmaz: kapı kapanmadan yürümeye
  // başlamayalım (jest/klavye girdisi kapı açıldıktan sonra işlenir).
  const gateOpenRef = useRef(false);
  useEffect(() => {
    gateOpenRef.current = gateOpen;
  }, [gateOpen]);
  // Online street — publish my position and watch other real players.
  const { publish, sessionId } = usePresencePublisher("world");
  // PvP: incoming duel invites addressed to my session + the fight document.
  const invites = useQuery(api.battles.listInvites, { sessionId });
  const activeBattleId = pvpBattle?.battleId ?? pvpChallenge?.battleId ?? null;
  const battleDoc = useQuery(
    api.battles.getBattle,
    activeBattleId ? { battleId: activeBattleId as Id<"battles"> } : "skip",
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
  // 💬 Kendi sohbet baloncuğum: `speechRef` varlık yayınına eklenir ve
  // diğer telefonlar baloncuğu bu oyuncunun başının üstünde çizer.
  const speechRef = useRef<string | null>(null);
  const publishSpeech = useCallback(
    (text: string | null) => {
      speechRef.current = text;
      const p = posRef.current;
      publish({
        ...profileRef.current,
        x: p.x,
        y: p.y,
        facing: facingRef.current,
        moving: false,
        speech: text,
      });
    },
    [publish],
  );
  const othersRef = useRef<PresenceEntry<WorldPresence>[]>([]);
  const { others: liveOthers } = usePresenceOthers<WorldPresence>(
    "world",
    sessionId,
  );
  othersRef.current = liveOthers;
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
  // 🏠 Takas/profil: karşı oyuncunun evi (varsa adı gösterilir).
  const viewedRemoteHouse = useQuery(
    api.houses.view,
    viewedRemote?.data?.name ? { ownerName: viewedRemote.data.name } : "skip",
  );
  // 📸 Karşı oyuncunun oda fotoğrafı (odayı ziyaret ettiysem) + en son
  // yakalanan oda fotoğrafı (oda kimliği olmayan evler için temsilî görüntü).
  const remoteRoomShot = useRoomShot(viewedRemoteHouse?.roomId);
  const latestRoomShot = useLatestRoomShot();
  // 🏠 Takas sayfası bilgisi: kendi evim (satır kimliğiyle) + evsiz rakip
  // kuralı. Cadde sakini için ad verilmez (her zaman evsiz sayılır).
  const tradeInfo = useQuery(
    api.wagers.challengeInfo,
    tradeChallenge
      ? tradeChallenge.bot
        ? {}
        : { opponentName: tradeChallenge.opponentName }
      : "skip",
  );

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
        // Baloncuk 5 sn görünür; yayın bunu tazeleyip sonra siler.
        speech: speechRef.current,
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

  // ⚔️ Bana gelen BAHİSLİ düello davetleri — düz davetten önce gösterilir.
  const wagerInvites = useQuery(api.wagers.listInvites);
  useEffect(() => {
    if (!wagerInvites || wagerInvites.length === 0) {
      setWagerInvite(null);
      return;
    }
    if (pvpBattle || battle || pvpChallenge) return;
    setWagerInvite(wagerInvites[0]);
  }, [wagerInvites, pvpBattle, battle, pvpChallenge]);

  // Gönderdiğim bahsin canlı durumu: `active` olunca (rakip kabul etti) iki
  // taraf da bahsin açtığı `battles` satırıyla arenaya girer.
  const pendingWagerDoc = useQuery(
    api.wagers.getWager,
    wagerPending
      ? { wagerId: wagerPending.wagerId as Id<"wagerMatches"> }
      : "skip",
  );
  useEffect(() => {
    if (!wagerPending || !pendingWagerDoc) return;
    if (pendingWagerDoc.status === "active" && pendingWagerDoc.battleId) {
      playSound("vs");
      setActiveWager({
        wagerId: wagerPending.wagerId,
        summary: wagerPending.summary,
      });
      setPvpBattle({
        battleId: pendingWagerDoc.battleId as string,
        role: "challenger",
        highStakes: { summary: wagerPending.summary },
      });
      setWagerPending(null);
      setViewing(null);
    } else if (pendingWagerDoc.status === "completed") {
      toast.info("Bahis daveti reddedildi 😔");
      setWagerPending(null);
    }
  }, [pendingWagerDoc, wagerPending]);

  // Bekleyen bahsim zaman aşımına uğrarsa (getWager null) şeridi kapat.
  useEffect(() => {
    if (!wagerPending) return;
    if (pendingWagerDoc === null) {
      toast.info("Bahis davetinin süresi doldu.");
      setWagerPending(null);
    }
  }, [pendingWagerDoc, wagerPending]);

  // ⚔️ Sayfa yenilenince yarıda kalan bot bahsi rehini iade edilir
  // (idempotent — aktif bahis yoksa hiçbir şey yapmaz). Yalnızca BİR kez:
  // süren maçın rehini yeniden bağlanma yüzünden iade edilmesin.
  const botWagerRefundedRef = useRef(false);
  useEffect(() => {
    if (botWagerRefundedRef.current) return;
    botWagerRefundedRef.current = true;
    void refundBotWagers().catch(() => {});
  }, [refundBotWagers]);

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

  /**
   * 🏠 Komşular: caddede çevrimiçi diğer oyuncuların adları. Odada "komşuya
   * geç" listesini besler (`HouseRoom` → `neighbors`). Ad tekrarları (aynı
   * oyuncunun iki sekmesi) tekilleştirilir.
   */
  const neighborNames = useMemo(() => {
    const names = liveOthers
      .map((entry) => entry.data?.name)
      .filter(
        (name): name is string => typeof name === "string" && name.length > 0,
      );
    return Array.from(new Set(names));
  }, [liveOthers]);

  /**
   * Odaya girerken arkada kalan katmanları kapat.
   *
   * Açık bir profil/çanta/karakter kartı kendi WebGL canvas'ını (avatarını)
   * tutuyor; oda sahnesiyle birlikte mobilde bağlam sınırı aşılıyor ve oyun
   * `Error creating WebGL context` ile çöküyordu. Oda, oyun alanının ÜSTÜNÜ
   * kapladığı için arkada kalan katmanların kapanması hem doğru hem zorunludur:
   * oyuncu o katmanlara zaten dokunamaz.
   *
   * ANA HUD (üst şerit + alt kontrol çubuğu + SOHBET) BUNLARA DAHİL DEĞİLDİR:
   * oda artık tam ekran değil, ana kabuğun İÇİNDE bir katman (bkz.
   * `HouseRoom` başlığı); üst/alt çubuklar evin içinde de görünür ve çalışır.
   */
  const closeOverlays = useCallback(() => {
    setViewing(null);
    setProfileOpen(false);
    setBagOpen(false);
    setVipOpen(false);
    setStallsOpen(false);
    setAbilitiesOpen(false);
  }, []);

  /**
   * 🏠 KAPI: "Evine gir" → DOĞRUDAN oyuncunun KENDİ odası.
   *
   * Oda sunucuda otomatik açılır (`houses.enter`): ilk girişte kayıt oluşur.
   * Arada TAM EKRAN yükleme ekranı YOKTUR — oyuncu "gir"e bastığı an oda
   * açılır; 3D oda hazır olana kadar oda alanı şeffaf kalır (arkada cadde
   * görünür, oyuncuya yedek/uydurma bir oda GÖSTERİLMEZ) ve 3D oda hazır olunca
   * açılır. Oda modeli ağır olduğu için indirme cadde hazır olur olmaz başlar ve
   * kapıya yaklaşınca da yeniden tetiklenir (`preloadRoomModel`).
   */
  const enterMyRoom = useCallback(async () => {
    if (roomBusyRef.current || roomOpenRef.current) return;
    // 🏚️ EVİ YOK: evini kaybeden oyuncuya girişte BEDAVA ev açılmaz (bkz.
    // `houses.enter`). Ham Convex hatası göstermek yerine ne yapacağını söyle.
    if (houseLost && myHouseView === null) {
      playSound("error");
      toast.info(
        "🏚️ Evin yok — bir düello ya da takas kazanarak yeni ev edinebilirsin.",
      );
      return;
    }
    roomBusyRef.current = true;
    playSound("click");
    // Oda modeli ağır olabilir: indirme oda açılırken başlar, oyuncu odaya
    // girdiğinde model ya hazırdır ya da yedek oda görünürken tamamlanır.
    preloadRoomModel();
    closeOverlays();
    // Odaya girerken yürüme/yol kalmasın (karakter kapının önünde dursun).
    targetRef.current = null;
    waypointsRef.current = [];
    waypointIdxRef.current = 0;
    setTargetMarker(null);
    try {
      const view = await enterHouse({});
      if (view) {
        setRoom({ view });
        roomOpenRef.current = true;
      }
    } catch (error) {
      console.error("Eve giriş hatası:", error);
      // Sunucu mesajı Convex tarafından sarılabilir ([CONVEX M(...)]); "Evin
      // yok" durumunu yakalayıp ham metni değil, anlaşılır yönlendirmeyi göster.
      const message = error instanceof Error ? error.message : "";
      toast.error(
        message.includes("Evin yok")
          ? "🏚️ Evin yok — bir düello ya da takas kazanarak yeni ev edinebilirsin."
          : message || "Eve girilemedi. Tekrar dene.",
      );
    } finally {
      roomBusyRef.current = false;
    }
  }, [enterHouse, closeOverlays, houseLost, myHouseView]);

  /**
   * Komşunun odasına geç — adın onun ziyaretçi defterine yazılır (online).
   *
   * Kendi odana girerken olduğu gibi arada yükleme ekranı YOKTUR: oda, sunucu
   * yanıtı gelir gelmez açılır ve karakter komşunun odasının kapısından doğar.
   */
  const enterNeighborRoom = useCallback(
    async (ownerName: string) => {
      if (roomBusyRef.current) return;
      roomBusyRef.current = true;
      preloadRoomModel();
      closeOverlays();
      try {
        const view = await visitHouse({ ownerName });
        if (view) {
          setRoom({ view });
          roomOpenRef.current = true;
          toast.info(`🚪 ${ownerName} odasına girdin`);
        }
      } catch (error) {
        console.error("Ziyaret hatası:", error);
        toast.error(
          error instanceof Error ? error.message : "Ziyaret edilemedi.",
        );
      } finally {
        roomBusyRef.current = false;
      }
    },
    [visitHouse, closeOverlays],
  );

  /** Odanın adını kaydet (yalnızca sahibi). */
  const renameMyRoom = useCallback(
    async (name: string) => {
      try {
        const view = await renameHouse({ name });
        if (view) setRoom({ view });
        toast.success("🏠 Oda adı güncellendi.");
      } catch (error) {
        console.error("Oda adı hatası:", error);
        toast.error(error instanceof Error ? error.message : "Kaydedilemedi.");
      }
    },
    [renameHouse],
  );

  /** Kapıdan çık — caddeye dön. */
  const exitRoom = useCallback(() => {
    playSound("click");
    roomOpenRef.current = false;
    setRoom(null);
  }, []);

  /** Oturma durumunu 3D katmanın deposuna yazar (avatar + "Otur" düğmesi). */
  const publishBenchSeat = useCallback(() => {
    setBenchSeatState({
      near: nearBenchRef.current,
      seated: seatBenchRef.current,
    });
  }, []);

  /**
   * 🪑 Banka yerleşme — konum ANİMASYONLA mindere kayar (`seatMoveRef`).
   * Oturma pozunu avatarın kendi yumuşak geçişi (SIT_BLEND_SPEED) yapar;
   * ikisi aynı sürede (`SEAT_TRANSITION_SECONDS`) bittiği için karakter
   * "yürüyerek yerleşiyor" gibi okunur.
   */
  const sitOnBench = useCallback(
    (index: number) => {
      if (index < 0 || index >= BENCH_SEATS.length) return;
      if (seatBenchRef.current === index) return;
      const seat = BENCH_SEATS[index];
      const p = posRef.current;
      sitRequestRef.current = null;
      seatMoveRef.current = {
        fromX: p.x,
        fromY: p.y,
        toX: seat.x,
        toY: seat.y,
        t: 0,
      };
      playSound("click");
      seatBenchRef.current = index;
      setSeatBench(index);
      nearBenchRef.current = null;
      setNearBench(null);
      targetRef.current = null;
      waypointsRef.current = [];
      waypointIdxRef.current = 0;
      setTargetMarker(null);
      publishBenchSeat();
      toast.info("Banka oturuldu 🪑");
    },
    [publishBenchSeat],
  );

  /**
   * 🪑 BANKTA OTURMA İSTEĞİ — IŞINLANMA YOK.
   *
   * Sıra: dokunma/düğme → bankın ÖNÜNDEKİ durağa YÜRÜ → durağa varınca
   * `sitDown`. Böylece karakter bankın yanına kadar kendi adımlarıyla gider;
   * yalnızca son yarım birimlik yerleşme animasyonla geçilir.
   */
  const requestSit = useCallback(
    (index: number) => {
      if (index < 0 || index >= BENCH_SEATS.length) return;
      if (seatBenchRef.current === index) return;
      if (seatBenchRef.current !== null || seatMoveRef.current !== null) return;
      const stand = benchStandPx(index);
      const seat = BENCH_SEATS[index];
      const p = posRef.current;
      // Bankın MENZİLİNDEYSEK (yani "Otur" düğmesi görünüyorsa) doğrudan
      // oturma geçişi başlar. Eskiden yalnızca bankın ÖNÜNDEKİ duraktan 22 px
      // yakınsak oturuluyordu; menzil içinde ama duraktan uzaktayken karakter
      // durağa yürütülüyordu — kullanıcı bankın yanındayken bu "Bankın yanına
      // gidiliyor" diyip hatalı okunuyordu. Menzil ölçüsü, "Otur" düğmesinin
      // görünme koşuluyla AYNIDIR (`BENCH_RADIUS_PX`), böylece düğmeyi gören
      // oyuncu bastığında tereddütsüz oturur.
      if (
        Math.hypot(p.x - seat.x, p.y - seat.y) <= BENCH_RADIUS_PX ||
        Math.hypot(p.x - stand.x, p.y - stand.y) <= SIT_ARRIVE_PX
      ) {
        sitOnBench(index);
        return;
      }
      sitRequestRef.current = { index, x: stand.x, y: stand.y };
      const path = findPath(p.x, p.y, stand.x, stand.y);
      if (path.length > 1) {
        waypointsRef.current = path.slice(1);
        waypointIdxRef.current = 0;
        targetRef.current = path[path.length - 1];
      } else {
        waypointsRef.current = [];
        targetRef.current = { x: stand.x, y: stand.y };
      }
      stuckRef.current = { x: p.x, y: p.y, since: performance.now() };
      setTargetMarker({ x: stand.x, y: stand.y });
      playSound("click");
      toast.info("Bankın yanına gidiliyor 🚶");
    },
    [sitOnBench],
  );

  /**
   * Hareket girdisinde bankın yürünebilir ön noktasına kalk; avatar aynı
   * karede kayıtlı kemik dönüşümlerini ve ayakta durma animasyonunu geri alır.
   */
  const standUp = useCallback(() => {
    const index = seatBenchRef.current;
    if (index === null) return;
    seatBenchRef.current = null;
    setSeatBench(null);
    sitRequestRef.current = null;
    const stand = benchStandPx(index);
    seatMoveRef.current = null;
    posRef.current.x = stand.x;
    posRef.current.y = stand.y;
    // Bankın üstüne dokunulmuşsa hedef SİLİNİR: aksi hâlde kalktıktan sonra
    // döngüdeki "banka dokunuldu" tespiti aynı banka yeniden oturturdu.
    const t = targetRef.current;
    if (
      t &&
      BENCH_SEATS.some((b) => Math.hypot(b.x - t.x, b.y - t.y) <= BENCH_RADIUS_PX)
    ) {
      targetRef.current = null;
      waypointsRef.current = [];
      waypointIdxRef.current = 0;
      setTargetMarker(null);
    }
    sitCooldownRef.current = performance.now() + 600;
    publishBenchSeat();
  }, [publishBenchSeat]);

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
      // Yükleme kapısı açılmadan klavye girdisi işlenmez (karakter sahne
      // kurulurken yürümeye başlamasın).
      if (!gateOpenRef.current) return;
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
        const inBattle =
          battleRef.current !== null || pvpBattleRef.current !== null;
        const keys = keysRef.current;
        let vx = 0;
        let vy = 0;
        // `moving` and `pos` are also read by the sprite/camera code below.
        let moving = false;
        // Bir engel/karakter yüzünden bu karede ilerleme engellendi mi?
        let bumped = false;
        const pos = posRef.current;
        // 🪑 OTURMA/KALKMA GEÇİŞİ: konum iki nokta arasında smoothstep ile
        // kayar — banka dokununca karakter ışınlanmaz, yürür ve yerleşir.
        const seatMove = seatMoveRef.current;
        if (seatMove) {
          seatMove.t = Math.min(1, seatMove.t + dt / SEAT_TRANSITION_SECONDS);
          const k = seatMove.t * seatMove.t * (3 - 2 * seatMove.t);
          pos.x = seatMove.fromX + (seatMove.toX - seatMove.fromX) * k;
          pos.y = seatMove.fromY + (seatMove.toY - seatMove.fromY) * k;
          if (seatMove.t >= 1) seatMoveRef.current = null;
        }
        // Bankta otururken hareket kilitlidir: konum banka sabitlenir,
        // otomatik yürüme iptal edilir. Tuşa basmak kalkma sayılır.
        const seatIndex = seatBenchRef.current;
        if (seatIndex !== null) {
          if (seatMoveRef.current === null) {
            const seatPos = BENCH_SEATS[seatIndex];
            pos.x = seatPos.x;
            pos.y = seatPos.y;
          }
          // Tuşa basmak ya da yere dokunmak kalkma sayılır; dokunma hedefi
          // SİLİNMEZ, böylece karakter kalkıp o noktaya yürür.
          if (keysRef.current.size > 0 || targetRef.current !== null) {
            standUp();
          } else if (seatMoveRef.current === null) {
            targetRef.current = null;
            waypointsRef.current = [];
            waypointIdxRef.current = 0;
          }
        } else if (sitRequestRef.current !== null) {
          // 🪑 Bankın önündeki durağa VARINCA oturulur.
          const req = sitRequestRef.current;
          const distToStand = Math.hypot(req.x - pos.x, req.y - pos.y);
          const targetDone =
            targetRef.current === null && waypointsRef.current.length === 0;
          if (distToStand <= SIT_ARRIVE_PX) {
            sitOnBench(req.index);
          } else if (
            // Yedek varış ölçütü: bank artık KATI cisim olduğu için A* durağı
            // birkaç px kısa çözebiliyor (durağın hücresi bankın şişirilmiş
            // gölgesinde kalır) ve tam `SIT_ARRIVE_PX` içine girmek
            // başarısız olabiliyordu — oyuncu bankın önünde durup "oturmuyor"
            // kalıyordu. Yürüyüş bittiğinde bank etkileşim menzilinde
            // olduğumuz sürece otur.
            targetDone &&
            Math.hypot(
              BENCH_SEATS[req.index].x - pos.x,
              BENCH_SEATS[req.index].y - pos.y,
            ) <= BENCH_RADIUS_PX
          ) {
            sitOnBench(req.index);
          } else if (targetDone) {
            // Yürüyüş iptal edildi (tuş/sıkışma) → istek düşer.
            sitRequestRef.current = null;
          }
        } else if (
          targetRef.current !== null &&
          seatMoveRef.current === null &&
          now >= sitCooldownRef.current
        ) {
          // 🪑 BANKA DOKUNULDU: dokunma hedefi bir bankın menzilindeyse, oraya
          // yürümek yerine "bankın önüne yürü + otur" isteğine çevrilir —
          // yani karakter ışınlanmak yerine bankın yanına kadar yürür.
          const tapped = targetRef.current;
          for (let i = 0; i < BENCH_SEATS.length; i++) {
            const b = BENCH_SEATS[i];
            if (Math.hypot(b.x - tapped.x, b.y - tapped.y) <= BENCH_RADIUS_PX) {
              requestSit(i);
              break;
            }
          }
        }
        // 🪑 3D "Otur" düğmesinden gelen istek varsa bu karede işlenir.
        // Düğme yalnızca menzilde görünür; yine de önce bankın yanına yürünür.
        if (consumeBenchSitRequest() && seatBenchRef.current === null) {
          const requested = nearBenchRef.current;
          if (requested !== null && now >= sitCooldownRef.current) {
            requestSit(requested);
          }
        }
        if (
          !inBattle &&
          // 🏠 Oda açıkken (ya da kapı yüklenirken) sokaktaki karakter
          // DONAR: kapıdan içeri girdiğinde caddede yürümeye devam etmesin.
          !roomOpenRef.current &&
          seatBenchRef.current === null &&
          seatMoveRef.current === null
        ) {
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
          } else if (targetRef.current) {
            // YOL DÜĞÜMÜ YOK — hedefle aynı ızgara hücresindeyiz (A* tek düğüm
            // döndürdü, bkz. `findPath`in `startNode === goalNode` dalı).
            // Eskiden bu durumda YALNIZCA yukarıdaki `wp.length > 0` dalı
            // çalıştığı için hiçbir şey olmuyordu: hedef asılı kalıyor,
            // karakter yerinden kıpırdamıyordu. Bankın önünde donup "Bankın
            // yanına gidiliyor" yazmasının sebebi buydu. Doğrudan hedefe yürü
            // ve varınca temizle (varış eşiği, yol düğümüyle aynı: 18 px).
            const t = targetRef.current;
            const tdx = t.x - pos.x;
            const tdy = t.y - pos.y;
            if (Math.hypot(tdx, tdy) <= 18) {
              targetRef.current = null;
              waypointsRef.current = [];
              waypointIdxRef.current = 0;
              setTargetMarker(null);
            } else if (Math.abs(tdx) >= Math.abs(tdy)) {
              vx = tdx > 0 ? 1 : -1;
            } else {
              vy = tdy > 0 ? 1 : -1;
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
            const fromX = pos.x;
            const fromY = pos.y;
            const stepX = vx * PLAYER_SPEED * dt;
            const stepY = vy * PLAYER_SPEED * dt;

            // ── 1. Try moving on both axes ──
            let px = Math.min(
              Math.max(pos.x + stepX, WORLD_BOUNDS.minX),
              WORLD_BOUNDS.maxX,
            );
            let py = Math.min(
              Math.max(pos.y + stepY, WORLD_BOUNDS.minY),
              WORLD_BOUNDS.maxY,
            );
            let hitX = false;
            let hitY = false;
            for (const r of OBSTACLES) {
              if (circleHitsRect(px, py, PLAYER_RADIUS, r)) {
                hitX = true;
                hitY = true;
                break;
              }
            }

            // ── 2. If blocked, try sliding: X only, then Y only ──
            if (hitX) {
              const tryX = Math.min(
                Math.max(pos.x + stepX, WORLD_BOUNDS.minX),
                WORLD_BOUNDS.maxX,
              );
              const tryY = pos.y;
              let blockedX = false;
              for (const r of OBSTACLES) {
                if (circleHitsRect(tryX, tryY, PLAYER_RADIUS, r)) {
                  blockedX = true;
                  break;
                }
              }
              if (!blockedX && inWalkable(tryX, tryY)) {
                px = tryX;
                py = tryY;
                hitX = false;
                hitY = false;
              } else {
                const tryX2 = pos.x;
                const tryY2 = Math.min(
                  Math.max(pos.y + stepY, WORLD_BOUNDS.minY),
                  WORLD_BOUNDS.maxY,
                );
                let blockedY = false;
                for (const r of OBSTACLES) {
                  if (circleHitsRect(tryX2, tryY2, PLAYER_RADIUS, r)) {
                    blockedY = true;
                    break;
                  }
                }
                if (!blockedY && inWalkable(tryX2, tryY2)) {
                  px = tryX2;
                  py = tryY2;
                  hitX = false;
                  hitY = false;
                } else {
                  px = pos.x;
                  py = pos.y;
                }
              }
            }
            // ── 2b. Çit sınırı: İPTAL değil, KAYMA ──
            // Eskiden hedef geçersizse konum tümden iptal ediliyordu
            // (`px = pos.x`); çapraz joystick girdisinde ya da çite
            // dayanınca karakter "takılıp kalıyordu". Artık konum
            // yürünebilir alana İZDÜŞÜRÜLÜR: kenar boyunca kayar, ama
            // asla çitin ilerisine (çime) çıkamaz.
            const snapped = nearestWalkable(px, py, pos);
            px = snapped.x;
            py = snapped.y;

            pos.x = px;
            pos.y = py;
            // ── Çarpma tespiti ("donk") ──
            // Amaçlanan adımın büyük kısmı engellendiyse (düz engel) çarpma
            // sayılır. Engel BOYUNCA KAYARKEN amaçlanan yol alındığı için ses
            // çalmaz — sürtünme gürültü yapmaz.
            const intended = Math.hypot(stepX, stepY);
            const advanced = Math.hypot(px - fromX, py - fromY);
            if (intended > 0.01 && advanced < intended * 0.35) bumped = true;
            // Update facing from horizontal movement direction. When moving
            // purely vertically, preserve the last horizontal facing so the
            // character doesn't snap to an arbitrary direction.
            if (Math.abs(vx) > 0.1) facingRef.current = vx > 0 ? 1 : -1;
            vyRef.current = vy;
          } else {
            // Reset vertical direction when stopped so sprite returns to normal.
            vyRef.current = 0;
          }

          // ── Karakter ayrıştırma + engel dışına itme (HER KARE) ──
          // Eskiden bu yalnızca `moving` iken çalışıyordu: DURAN oyuncunun
          // içinden botlar/diğer oyuncular geçebiliyordu. Artık her karede:
          //   1) örtüşen karakterler yarım yarım itilir (yalnızca oyuncu
          //      itilir; botlar deterministik yollarında kalır),
          //   2) konum hiçbir prop'un İÇİNDE kalamaz (`pushOutOfObstacles`),
          //   3) son olarak yürünebilir alana/sınıra kırpılır.
          if (
            !inBattle &&
            seatBenchRef.current === null &&
            seatMoveRef.current === null
          ) {
            let px = pos.x;
            let py = pos.y;
            let pushed = 0;
            // Botlar / satıcılar.
            for (const bot of botsRef.current) {
              const dx = px - bot.pos.x;
              const dy = py - bot.pos.y;
              const dist = Math.hypot(dx, dy);
              if (dist < CHAR_MIN_DIST && dist > 0.1) {
                const push = (CHAR_MIN_DIST - dist) / 2;
                px += (dx / dist) * push;
                py += (dy / dist) * push;
                pushed = Math.max(pushed, push);
              }
            }
            // Diğer gerçek oyuncular.
            for (const remote of othersRef.current) {
              const d = remote.data;
              if (!d || typeof d.x !== "number" || typeof d.y !== "number")
                continue;
              const st = remoteStatesRef.current.get(remote.sessionId);
              const rx = st ? st.x : d.x;
              const ry = st ? st.y : d.y;
              const dx = px - rx;
              const dy = py - ry;
              const dist = Math.hypot(dx, dy);
              if (dist < CHAR_MIN_DIST && dist > 0.1) {
                const push = (CHAR_MIN_DIST - dist) / 2;
                px += (dx / dist) * push;
                py += (dy / dist) * push;
                pushed = Math.max(pushed, push);
              }
            }
            // Bir prop'un içine itildiysek en yakın dışarı noktaya çık.
            const ejected = pushOutOfObstacles(px, py, PLAYER_RADIUS);
            px = Math.min(
              Math.max(ejected.x, WORLD_BOUNDS.minX),
              WORLD_BOUNDS.maxX,
            );
            py = Math.min(
              Math.max(ejected.y, WORLD_BOUNDS.minY),
              WORLD_BOUNDS.maxY,
            );
            if (!inWalkable(px, py)) {
              const settled = nearestWalkable(px, py, pos);
              px = settled.x;
              py = settled.y;
            }
            if (px !== pos.x || py !== pos.y) {
              if (pushed > 8) bumped = true;
              pos.x = px;
              pos.y = py;
            }
          }

          // 🪵 Çarpma sesi — engel/karakter dayandığında TEK bir "donk".
          // Kenar tetikleme: duvara yaslı kalırken ses tekrarlanmaz; ayrılıp
          // yeniden çarpınca (kısa bir kilit sonrası) yine çalar.
          if (bumped) {
            const bumpNow = performance.now();
            if (!blockedRef.current && bumpNow - bumpAtRef.current > 200) {
              bumpAtRef.current = bumpNow;
              playSound("bump");
            }
            blockedRef.current = true;
          } else {
            blockedRef.current = false;
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
                speech: speechRef.current,
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
              speech: speechRef.current,
            });
          }
        }

        // 🏠 EV KAPISI MENZİLİ — evin kapısının önündeki alan
        // (`HOUSE_DOOR_PX`). Değer değişmedikçe depoya yazılmaz, böylece kare
        // başına React güncellemesi olmaz; düğmeyi 3D katman çizer.
        if (seatBenchRef.current === null) {
          const zone = HOUSE_DOOR_PX;
          const isNear =
            pos.x >= zone.west &&
            pos.x <= zone.east &&
            pos.y >= zone.south &&
            pos.y <= zone.north;
          if (houseNearRef.current !== isNear) {
            houseNearRef.current = isNear;
            setHouseNear(isNear);
            // Oyuncu kapıya yaklaşır yaklaşmaz oda modeli ÖNCEDEN indirilir:
            // "Evine gir"e basıldığında oda yedek odada beklemeden açılsın
            // (ağır model indirmesi tıklamadan sonraya kalmasın).
            if (isNear) preloadRoomModel();
          }
        }
        // 🏠 3D "Evine gir" düğmesinden gelen istek (bkz. `houseDoor`).
        if (consumeHouseEnterRequest() && houseNearRef.current) {
          void enterMyRoom();
        }

        // 🪑 En yakın bank — oturma butonu yalnızca menzile girince görünür.
        // Değer değişmedikçe state yazılmaz (kare başına re-render olmaz).
        if (seatBenchRef.current === null) {
          let best: number | null = null;
          let bestDist = BENCH_RADIUS_PX;
          for (let i = 0; i < BENCH_SEATS.length; i++) {
            const d = Math.hypot(
              BENCH_SEATS[i].x - pos.x,
              BENCH_SEATS[i].y - pos.y,
            );
            if (d < bestDist) {
              bestDist = d;
              best = i;
            }
          }
          if (nearBenchRef.current !== best) {
            nearBenchRef.current = best;
            setNearBench(best);
            publishBenchSeat();
          }
        }

        // Sprite: bob + limb swing while walking, body faces the walking
        // direction — SNAPPED flip (no lerp through zero!) + smooth
        // vertical scale for perspective.
        spriteRef.current?.classList.toggle("walking", moving);
        // Directional avatar pose: idle (front), walk-up (back), walk-down (front), walk-side (side).
        const avatarSvg =
          avatarSvgCache.current ??
          (spriteRef.current?.querySelector(
            "svg[data-pose]",
          ) as SVGSVGElement | null);
        if (avatarSvg && !avatarSvgCache.current)
          avatarSvgCache.current = avatarSvg;
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
        const targetVScale = moving ? 1 + vyRef.current * 0.12 : 1;
        const prevVScale = spriteRef.current?.dataset.vscale
          ? Number(spriteRef.current.dataset.vscale)
          : 1;
        const newVScale =
          prevVScale + (targetVScale - prevVScale) * Math.min(1, dt * 12);
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
        if (
          spriteRef.current &&
          spriteRef.current.dataset.vscale !== String(newVScale)
        ) {
          spriteRef.current.dataset.flip = String(flip);
          spriteRef.current.dataset.vscale = String(newVScale);
        }
        if (spriteRef.current) {
          spriteRef.current.setAttribute("transform", newTransform);
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
          if (
            Math.abs(camX - prev.x) > 0.01 ||
            Math.abs(camY - prev.y) > 0.01
          ) {
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
        const bots = botsRef.current;
        const nBots = bots.length;
        const botBase = botBaseRef.current;
        if (botBase.length < nBots) botBase.length = nBots;
        // ── 1) TABAN konumlar: paylaşılan saat → yol üzerindeki nokta.
        //       Her cihazda birebir aynı (deterministik).
        for (let i = 0; i < nBots; i++) {
          const b = bots[i];
          const path = b.path;
          if (
            !path ||
            path.pts.length === 0 ||
            battleRef.current?.opponent.id === b.def.id
          ) {
            botBase[i] = null;
            continue;
          }
          const wallT =
            (Date.now() + serverOffsetRef.current) / 1000 + b.offset;
          const bt = ((wallT % path.total) + path.total) % path.total;
          botPosAt(path, bt, botScratch);
          const slot = botBase[i] ?? { x: 0, y: 0 };
          slot.x = botScratch.x;
          slot.y = botScratch.y;
          botBase[i] = slot;
        }
        for (let bi = 0; bi < nBots; bi++) {
          const bot = bots[bi];
          // Skip vendors (static shopkeepers with no movement path)
          if (!bot.path || bot.path.pts.length === 0) continue;
          const botEl0 = botRefs.current.get(bot.def.id);
          if (botEl0) botEl0.style.display = "";
          // The challenged bot teleports to the arena while fighting.
          if (battleRef.current?.opponent.id === bot.def.id) {
            if (botEl0) botEl0.style.display = "none";
            continue;
          }
          const wallT =
            (Date.now() + serverOffsetRef.current) / 1000 + bot.offset;
          const t =
            ((wallT % bot.path.total) + bot.path.total) % bot.path.total;
          botPosAt(bot.path, t, botScratch);
          // ── 2) Bot ↔ bot ayrıştırma: botlar da birbirinin İÇİNDEN geçmesin.
          //       İtme YALNIZCA taban konumlara (yani saate) bağlıdır —
          //       oyuncunun/uzak oyuncuların konumuna DEĞİL. Böylece sonuç yine
          //       deterministiktir: her cihaz aynı botu aynı yerde gösterir.
          //       (Oyuncu tarafında itme yerel oyuncuya uygulanır, bkz.
          //       yukarıdaki "Karakter ayrıştırma" bloğu.)
          let bpx = botScratch.x;
          let bpy = botScratch.y;
          for (let j = 0; j < nBots; j++) {
            if (j === bi) continue;
            const other = botBase[j];
            if (!other) continue;
            const dx = bpx - other.x;
            const dy = bpy - other.y;
            const dist = Math.hypot(dx, dy);
            if (dist < CHAR_MIN_DIST && dist > 0.1) {
              const push = (CHAR_MIN_DIST - dist) / 2;
              bpx += (dx / dist) * push;
              bpy += (dy / dist) * push;
            }
          }
          // ── 3) İtmeden sonra bot yine de bir prop'un içinde çim üzerinde
          //       kalmasın: önce katı cisimlerden dışarı, sonra caddeye geri.
          const botEject = pushOutOfObstacles(bpx, bpy, BOT_RADIUS);
          if (inWalkable(botEject.x, botEject.y)) {
            bpx = botEject.x;
            bpy = botEject.y;
          } else {
            const botSettle = nearestWalkable(botEject.x, botEject.y, {
              x: botScratch.x,
              y: botScratch.y,
            });
            bpx = botSettle.x;
            bpy = botSettle.y;
          }
          bot.pos.x = bpx;
          bot.pos.y = bpy;
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
            if (botEl.getAttribute("transform") !== botT)
              botEl.setAttribute("transform", botT);
            const sprite =
              botSpriteCache.current.get(bot.def.id) ??
              (botEl.querySelector(".bot-sprite") as SVGGElement | null);
            if (sprite && !botSpriteCache.current.has(bot.def.id))
              botSpriteCache.current.set(bot.def.id, sprite);
            if (sprite) {
              sprite.classList.toggle("walking", bot.moving);
              const botSvg =
                botPoseCache.current.get(bot.def.id) ??
                (sprite.querySelector(
                  "svg[data-pose]",
                ) as SVGSVGElement | null);
              if (botSvg && !botPoseCache.current.has(bot.def.id))
                botPoseCache.current.set(bot.def.id, botSvg);
              if (botSvg) {
                if (!bot.moving) botSvg.dataset.pose = "idle";
                else if (bot.vy < 0) botSvg.dataset.pose = "walk-up";
                else if (bot.vy > 0) botSvg.dataset.pose = "walk-down";
                else botSvg.dataset.pose = "walk-side";
              }
              const botFlip = bot.facing < 0 ? -1 : 1;
              const botVy = bot.vy ?? 0;
              const targetBotVS = bot.moving ? 1 + botVy * 0.12 : 1;
              const prevBotVS = sprite.dataset.vscale
                ? Number(sprite.dataset.vscale)
                : 1;
              const newBotVS =
                prevBotVS + (targetBotVS - prevBotVS) * Math.min(1, dt * 12);
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
          const sprite =
            remoteSpriteCache.current.get(remote.sessionId) ??
            (el.querySelector(".remote-sprite") as SVGGElement | null);
          if (sprite && !remoteSpriteCache.current.has(remote.sessionId))
            remoteSpriteCache.current.set(remote.sessionId, sprite);
          if (sprite) {
            sprite.classList.toggle("walking", st.moving);
            // Directional avatar pose for remote players.
            const rSvg =
              remotePoseCache.current.get(remote.sessionId) ??
              (sprite.querySelector("svg[data-pose]") as SVGSVGElement | null);
            if (rSvg && !remotePoseCache.current.has(remote.sessionId))
              remotePoseCache.current.set(remote.sessionId, rSvg);
            if (rSvg) {
              if (!st.moving) rSvg.dataset.pose = "idle";
              else if (st.vy < 0) rSvg.dataset.pose = "walk-up";
              else if (st.vy > 0) rSvg.dataset.pose = "walk-down";
              else rSvg.dataset.pose = "walk-side";
            }
            const bob = st.moving ? Math.sin(st.phase) * 5 : 0;
            // Full-body facing: horizontal flip + vertical perspective.
            const rFlip = st.facing < 0 ? -1 : 1;
            const targetRVS = st.moving ? 1 + st.vy * 0.12 : 1;
            const prevRVS = sprite.dataset.vscale
              ? Number(sprite.dataset.vscale)
              : 1;
            const newRVS =
              prevRVS + (targetRVS - prevRVS) * Math.min(1, dt * 16);
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
      // SPEECH BUBBLE — Sanalika/Habbo stili: mesaj gönderilir gönderilmez
      // karakterin baş üstünde görünür (sohbet satırı sunucudan gelince
      // düşer). Uzun mesaj kısaltılır, baloncuk DOM içinde sarar.
      // Baloncuk ~3 satıra kadar sarabilir (max-width 210px); daha uzun
      // mesajlar kısaltılır, sohbet panelinde tam metin kalır.
      const shown = trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
      setBubble(shown);
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
      // Baloncuk 5 sn ekranda kalır, sonra yumuşakça kaybolur (bkz.
      // ChatBubble3D → CHAT_BUBBLE_FADE_MS).
      bubbleTimerRef.current = setTimeout(() => {
        setBubble(null);
        publishSpeech(null);
      }, CHAT_BUBBLE_MS);
      // Diğer telefonlar da baloncuğu hemen görsün (varlık yayınına ekle).
      publishSpeech(shown);
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
    [appendMessage, publishSpeech, sendChat],
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
      window.setTimeout(
        () => {
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
                opponentLevel: bot.level,
                playerAbility: equippedAbility,
                opponentAbility: bot.ability,
              });
              setInvite(null);
              setViewing(null);
              setAbilitiesOpen(false);
            }, 1000);
          }
        },
        1400 + Math.random() * 1200,
      );
    },
    [invite, battle, appendMessage, equippedAbility],
  );

  /** Close the arena and (on victory) credit the SP reward. */
  const endBattle = useCallback(
    async (victory: boolean) => {
      // ⚔️ Bahisli BOT düellosu: ödül standart +150 yerine BAHİSTEN gelir —
      // kazanırsan 2× SP, kaybedersen ortaya koyduğun SP gider.
      const wager = activeBotWagerRef.current;
      if (wager) {
        try {
          const res = await finishBotWager({
            botWagerId: wager.botWagerId as Id<"botWagers">,
            won: victory,
          });
          if (victory) {
            toast.success(
              `🏆 Dev kazanç! +${formatCoins(res?.payout ?? 0)} SP — bahis: ${wager.summary}`,
            );
          } else {
            toast.info(`Bahsi kaybettin — ${wager.summary} gitti. 😬`);
          }
        } catch (error) {
          console.error("Bot bahsi ödeme hatası:", error);
        }
        setActiveBotWager(null);
      } else if (victory) {
        try {
          const newCoins = await battleVictory();
          toast.success(
            `🏆 Zafer! +150 SP kazandın — yeni bakiye: ${formatCoins(newCoins.coins)}`,
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
    [battleVictory, finishBotWager],
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

  /** ⚔️ Bahis sözleşmesi formunu aç (bir oyuncuya meydan okuma). */
  const openWagerChallenge = useCallback(
    (name: string) => {
      if (pvpBattle || pvpChallenge || battle || wagerPending) return;
      playSound("click");
      setWagerChallenge({ name });
      setViewing(null);
    },
    [pvpBattle, pvpChallenge, battle, wagerPending],
  );

  /**
   * ⚔️ Bahis sözleşmesi formunu YEREL bir cadde sakini için aç.
   *
   * ArayüzDE hiçbir fark yoktur (`WagerChallengeSheet` aynı başlık, aynı
   * seçenekler, aynı ev bahsi); yalnızca gönderim yerel akışa düşer.
   */
  const openLocalWagerChallenge = useCallback(
    (bot: BotDef) => {
      if (pvpBattle || pvpChallenge || battle || wagerPending || botWagerPending)
        return;
      playSound("click");
      setBotWagerChallenge({ bot });
      setViewing(null);
    },
    [pvpBattle, pvpChallenge, battle, wagerPending, botWagerPending],
  );

  /**
   * ⚔️ YEREL BAHİS AKIŞI: rakip bir an "düşünür", sonra kabul/red eder.
   *
   * Kabulde SP (ve ortaya konduysa ev) rehine alınır (`startBotWager`) ve
   * bahisli arena açılır. Karşı tarafın evi her zaman BOŞ EV'dir (değersiz):
   * kazanırsan sana yeni, eşyasız bir ev açılır.
   */
  const handleBotWagerSent = useCallback(
    (info: {
      opponentName: string;
      goldAmount: number;
      houseId?: string;
      houseName?: string;
    }) => {
      const bot = botWagerChallenge?.bot;
      setBotWagerChallenge(null);
      if (!bot) return;
      const summary = describeWager(info.goldAmount, info.houseName);
      setBotWagerPending({ botId: bot.id, botName: bot.name, summary });
      window.setTimeout(() => {
        setBotWagerPending(null);
        if (Math.random() < 0.25) {
          playSound("decline");
          appendMessage({
            id: `local-${nextIdRef.current++}`,
            from: bot.name,
            text: "Bu bahsi almıyorum, kusura bakma! 😅",
            color: bot.color,
          });
          toast.info(`${bot.name} bahisli düelloyu reddetti.`);
          return;
        }
        void (async () => {
          try {
            const res = await startBotWager({
              botId: bot.id,
              botName: bot.name,
              goldAmount: info.goldAmount,
              wageredHouseId: info.houseId
                ? (info.houseId as Id<"houses">)
                : undefined,
            });
            playSound("vs");
            setActiveBotWager({
              botWagerId: res.botWagerId as string,
              summary,
            });
            appendMessage({
              id: `local-${nextIdRef.current++}`,
              from: bot.name,
              text: `Bahis kabul! ${summary} ortada — kazanan hepsini alır! ⚔️💰`,
              color: bot.color,
            });
            setBattle({
              opponent: bot,
              opponentLevel: bot.level,
              playerAbility: equippedAbility,
              opponentAbility: bot.ability,
              highStakes: { summary },
            });
            setViewing(null);
            setAbilitiesOpen(false);
          } catch (error) {
            console.error("Bot bahsi hatası:", error);
            toast.error(
              error instanceof Error ? error.message : "Bahis başlatılamadı.",
            );
          }
        })();
      }, 1400 + Math.random() * 1200);
    },
    [botWagerChallenge, startBotWager, equippedAbility, appendMessage],
  );

  /**
   * 🏠 TAKAS sayfasını aç (bir karakterin profilinden). Rakip cadde sakiniyse
   * yerel 3 rauntluk takas maçı, gerçek oyuncuysa ev/SP bahisli düello daveti.
   */
  const openTrade = useCallback(
    (args: { opponentName: string; bot?: BotDef }) => {
      if (
        pvpBattle ||
        pvpChallenge ||
        battle ||
        wagerPending ||
        botWagerPending ||
        tradeChallenge
      )
        return;
      playSound("click");
      setTradeChallenge(args);
      setViewing(null);
    },
    [
      pvpBattle,
      pvpChallenge,
      battle,
      wagerPending,
      botWagerPending,
      tradeChallenge,
    ],
  );

  /**
   * 🏠 TAKAS ONAYI: "Takası onayla → savaşa hazır ol" sonrası.
   * Cadde sakiniyle 3 RAUNTluk (`BattleScene rounds=3`) takas maçı başlar ve ev/SP
   * sunucuda rehine alınır; gerçek oyuncuda mevcut ev/SP düello daveti açılır.
   */
  const handleTradeConfirm = useCallback(
    (info: {
      goldAmount: number;
      houseId?: string;
      houseName?: string;
      houseStaked: boolean;
      opponentGoldAmount: number;
    }) => {
      const target = tradeChallenge;
      setTradeChallenge(null);
      if (!target) return;
      const summary = describeWager(info.goldAmount, info.houseName);

      // ── Cadde sakini: yerel 3 rauntluk maç + sunucuda rehin ──
      if (target.bot) {
        const bot = target.bot;
        setBotWagerPending({ botId: bot.id, botName: bot.name, summary });
        window.setTimeout(() => {
          setBotWagerPending(null);
          void (async () => {
            try {
              const res = await startBotWager({
                botId: bot.id,
                botName: bot.name,
                goldAmount: info.goldAmount,
                wageredHouseId: info.houseId
                  ? (info.houseId as Id<"houses">)
                  : undefined,
              });
              playSound("vs");
              setActiveBotWager({
                botWagerId: res.botWagerId as string,
                summary,
              });
              appendMessage({
                id: `local-${nextIdRef.current++}`,
                from: bot.name,
                text: `Takas kabul! ${summary} ortada — 3 raunt, kazanan hepsini alır! 🏠⚔️`,
                color: bot.color,
              });
              setBattle({
                opponent: bot,
                opponentLevel: bot.level,
                playerAbility: equippedAbility,
                opponentAbility: bot.ability,
                highStakes: { summary },
                rounds: 3,
              });
              setViewing(null);
              setAbilitiesOpen(false);
            } catch (error) {
              console.error("Takas hatası:", error);
              toast.error(
                error instanceof Error ? error.message : "Takas başlatılamadı.",
              );
            }
          })();
        }, 1200 + Math.random() * 900);
        return;
      }

      // ── Gerçek oyuncu: ev/SP bahisli düello daveti (mevcut akış) ──
      void (async () => {
        try {
          const res = await createWager({
            opponentName: target.opponentName,
            goldAmount: info.goldAmount,
            wageredHouseId: info.houseId
              ? (info.houseId as Id<"houses">)
              : undefined,
            mySessionId: sessionId,
            me: { name: username, config, equipped, ability: equippedAbility },
          });
          playSound("invite");
          setWagerPending({
            wagerId: res.wagerId,
            name: target.opponentName,
            summary,
          });
        } catch (error) {
          console.error("Takas daveti hatası:", error);
          toast.error(
            error instanceof Error
              ? error.message
              : "Takas daveti gönderilemedi.",
          );
        }
      })();
    },
    [
      tradeChallenge,
      startBotWager,
      createWager,
      equippedAbility,
      appendMessage,
      sessionId,
      username,
      config,
      equipped,
    ],
  );

  /**
   * ⚔️ ARENA "Meydan Oku": caddede en yakın gerçek oyuncuya bahisli düello
   * sözleşmesi aç. Yakında kimse yoksa uyarır (rakip seçmek için profiline
   * dokunmak da aynı formu açar).
   */
  const handleArenaChallenge = useCallback(() => {
    if (pvpBattle || pvpChallenge || battle || wagerPending || botWagerPending)
      return;
    const me = posRef.current;
    let best: { name: string; dist: number } | null = null;
    for (const o of othersRef.current) {
      const d = o.data;
      if (!d || !d.name) continue;
      const dist = Math.hypot(d.x - me.x, d.y - me.y);
      if (!best || dist < best.dist) best = { name: d.name, dist };
    }
    if (best) {
      openWagerChallenge(best.name);
      return;
    }
    // Yakında GERÇEK oyuncu yok → caddenin bot sakinleri de bahse girebilir:
    // en yakın (satıcı olmayan) botla bahisli düello formu açılır.
    let botBest: { bot: BotDef; dist: number } | null = null;
    for (const b of botsRef.current) {
      const def = b.def;
      // Satıcı NPC'ler (level'sız) bahse girmez; tip daraltması da burada.
      if (def.isVendor || !("level" in def)) continue;
      const dist = Math.hypot(b.pos.x - me.x, b.pos.y - me.y);
      if (!botBest || dist < botBest.dist) botBest = { bot: def, dist };
    }
    if (!botBest) {
      playSound("error");
      toast.info("Etrafta meydan okuyacak kimse yok.");
      return;
    }
    openLocalWagerChallenge(botBest.bot);
  }, [
    pvpBattle,
    pvpChallenge,
    battle,
    wagerPending,
    botWagerPending,
    openWagerChallenge,
    openLocalWagerChallenge,
  ]);

  /** Bahis daveti gönderildi — bekleyiş şeridini kur. */
  const handleWagerSent = useCallback(
    (info: {
      wagerId: string;
      opponentName: string;
      goldAmount: number;
      houseName?: string;
    }) => {
      const summary = describeWager(info.goldAmount, info.houseName);
      setWagerChallenge(null);
      setWagerPending({
        wagerId: info.wagerId,
        name: info.opponentName,
        summary,
      });
      toast.success(
        `${info.opponentName} oyuncusuna bahisli meydan okuma gönderildi! [${summary}]`,
      );
    },
    [],
  );

  /** Bana gelen bahisli meydan okumayı kabul et — doğrulama + rehin sunucuda. */
  const handleAcceptWager = useCallback(async () => {
    const inv = wagerInvite;
    if (!inv) return;
    setWagerBusy(true);
    try {
      const res = await acceptWager({
        wagerId: inv.wagerId as Id<"wagerMatches">,
        me: { name: username, config, equipped, ability: equippedAbility },
      });
      const summary = describeWager(inv.goldAmount, inv.wageredHouseName);
      playSound("vs");
      setActiveWager({ wagerId: inv.wagerId, summary, houseName: inv.wageredHouseName });
      setPvpBattle({
        battleId: res.battleId as string,
        role: "opponent",
        highStakes: { summary, houseName: inv.wageredHouseName },
      });
      setWagerInvite(null);
      setViewing(null);
    } catch (error) {
      console.error("Bahis kabul hatası:", error);
      toast.error(
        error instanceof Error ? error.message : "Bahis kabul edilemedi.",
      );
    } finally {
      setWagerBusy(false);
    }
  }, [
    wagerInvite,
    acceptWager,
    username,
    config,
    equipped,
    equippedAbility,
  ]);

  /** Gelen bahis davetini reddet — rehin çözülür. */
  const handleDeclineWager = useCallback(async () => {
    const inv = wagerInvite;
    if (!inv) return;
    try {
      await declineWager({ wagerId: inv.wagerId as Id<"wagerMatches"> });
    } catch (error) {
      console.error("Bahis reddetme hatası:", error);
    }
    playSound("decline");
    setWagerInvite(null);
  }, [wagerInvite, declineWager]);

  /** Gönderdiğim bahsi iptal et. */
  const handleCancelWager = useCallback(async () => {
    const cur = wagerPending;
    if (!cur) return;
    try {
      await cancelWager({ wagerId: cur.wagerId as Id<"wagerMatches"> });
    } catch (error) {
      console.error("Bahis iptal hatası:", error);
    }
    setWagerPending(null);
  }, [wagerPending, cancelWager]);

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
      await declineBattle({
        battleId: inv.battleId as Id<"battles">,
        sessionId,
      });
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
            `🏆 Zafer! +150 SP kazandın — yeni bakiye: ${formatCoins(newCoins.coins)}`,
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
      // ⚔️ Bahisli düelloyu KAPAT: kazanan tüm altını alır, iddiaya konan ev
      // mülkiyet olarak devredilir. Sunucu idempotenttir; berabere/iptalde
      // rehin çözülür (iki taraf da kendi bahsini geri alır).
      const wager = activeWagerRef.current;
      if (wager) {
        // Sunucuya KAZANAN ROLÜ bildirilir (kimlik değil): berabere/iptal
        // dışında kaybeden taraf bahsini kaybeder — bağlantı koparan (forfeit)
        // da kaybetmiş sayılır, yoksa kaçarak bahisten sıyrılırdı.
        const myRole = cur.role === "challenger" ? "challenger" : "target";
        const otherRole = myRole === "challenger" ? "target" : "challenger";
        const winnerRole =
          reason === "draw"
            ? undefined
            : victory
              ? myRole
              : otherRole;
        try {
          await finishWager({
            wagerId: wager.wagerId as Id<"wagerMatches">,
            winnerRole,
          });
        } catch (error) {
          console.error("Bahis ödeme hatası:", error);
        }
        setActiveWager(null);
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
    [battleVictory, finishBattle, finishWager],
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
        toast.error(error instanceof Error ? error.message : "Kuşanılamadı.");
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
      text: "👋 Vaelos Caddesi'ne hoş geldin! Satıcıya dokunup market sayfasını açabilirsin.",
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timer = setTimeout(
        () => {
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
            }, CHAT_BUBBLE_MS);
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
        },
        9000 + Math.random() * 7000,
      );
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
        room !== null ||
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
      // ── Screen-space character hit testing ──
      // Uses a tight rectangular (AABB) hit test matching the visible avatar size
      // instead of a large circle that catches clicks beside the character.
      let closestId: string | null = null;
      let closestDist = Infinity;
      // Half-extents for the rectangular hit area (tight to visible avatar ~70×96 SVG)
      const HIT_HW = 30; // half-width  → total width ~60 px
      const HIT_HH = 42; // half-height → total height ~84 px
      const VENDOR_HIT_HW = 22;
      const VENDOR_HIT_HH = 34;

      const checkChar = (
        id: string,
        svgX: number,
        svgY: number,
        hw: number,
        hh: number,
      ) => {
        const wp = svgToWorld(svgX, svgY);
        const sp = worldToScreen(wp.x, PLAYER_3D_HEIGHT / 2, wp.z, container);
        if (!sp) return;
        const dx = Math.abs(screenX - sp.sx);
        const dy = Math.abs(screenY - sp.sy);
        // Tight rectangle test — click must be inside the avatar bounds
        if (dx <= hw && dy <= hh) {
          const dist = dx + dy; // Manhattan distance as tiebreaker
          if (dist < closestDist) {
            closestDist = dist;
            closestId = id;
          }
        }
      };

      // Check local player
      const p = posRef.current;
      checkChar("me", p.x, p.y, HIT_HW, HIT_HH);

      // Check bots/vendors — vendors get a tighter hit area
      for (const bot of botsRef.current) {
        const isV =
          "isVendor" in bot.def &&
          !!(bot.def as { isVendor?: boolean }).isVendor;
        checkChar(
          bot.def.id,
          bot.pos.x,
          bot.pos.y,
          isV ? VENDOR_HIT_HW : HIT_HW,
          isV ? VENDOR_HIT_HH : HIT_HH,
        );
      }

      // Check remote players
      for (const remote of othersRef.current) {
        const d = remote.data;
        if (!d || typeof d.x !== "number" || typeof d.y !== "number") continue;
        const st = remoteStatesRef.current.get(remote.sessionId);
        const rx = st ? st.x : d.x;
        const ry = st ? st.y : d.y;
        checkChar(`remote:${remote.sessionId}`, rx, ry, HIT_HW, HIT_HH);
      }

      if (closestId) {
        // Unified system: check if this is a vendor NPC
        const clickedBot = botsRef.current.find((b) => b.def.id === closestId);
        const isVendor =
          clickedBot &&
          "isVendor" in clickedBot.def &&
          (clickedBot.def as { isVendor?: boolean }).isVendor;
        if (isVendor) {
          const vendorDef = VENDORS.find((v) => v.id === closestId);
          if (vendorDef) {
            playSound("click");
            if (closestId === VIP_VENDOR_ID) {
              setVipOpen(true);
            } else {
              setShopVendor(vendorDef);
            }
            return;
          }
        }
        setViewing(closestId);
        return;
      }

      // Tapping anywhere else closes the profile card and checks gift box.
      setViewing(null);
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
      room,
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
          {/* Oturma durumu 3D katmana AYRICA prop olarak da geçilir: avatarın
              oturup oturmadığı tek bir paylaşılan modül deposuna bağlı
              kalmasın. Prop dolu olduğunda avatar onu kullanır, boşken depoya
              düşer; böylece "Otur" → oturma zincirinde sessiz bir kopukluk
              olamaz. */}
          {/* 🧪 İZOLASYON AŞAMASI (1–8): gerçek motor BURADA ÇİZİLMEZ.
              Aşama 1 canvas'sız DOM ekranıdır (3D tamamen kapalı), 2–8 ise
              tek değişkenli ölçüm yapan minimal sonda canvas'ıdır (boş →
              zemin → karakter → ağaç → çim → bina → skin). Aşama 0/9'da ise
              aşağıdaki gerçek motor eskisiyle BİREBİR aynı çalışır. */}
          {stageMode ? (
            usesStageCanvas() ? (
              <WorldStageProbe stage={stage} isMobile={isMobile} />
            ) : (
              <StageDomOnly />
            )
          ) : (
          <GameEngine3D
            playerPosRef={posRef}
            playerConfig={config}
            playerEquipped={equipped}
            facingRef={facingRef}
            botsRef={botsRef}
            moveTarget={targetMarker}
            isMobile={isMobile}
            glbTest={glbTestParam}
            presenceSessionId={sessionId}
            onSceneReady={handleSceneReady}
            readyModelUrls={gateModelUrls}
            // 🏠 Oda açıkken cadde GÖRÜNMEZ: sahne durdurulur. Arka planda
            // çizmeye devam etmek GPU'yu ve bağlam yuvalarını boşa tüketiyor
            // ve odanın kendi WebGL bağlamını açmasını engelliyordu.
            // Duraklatma çizimi durdurur; sahne ayakta kalır (exit → devam).
            paused={room !== null}
            seat={
              seatBench !== null
                ? {
                    facing: BENCH_SEATS[seatBench].facing,
                    yaw: BENCH_SEATS[seatBench].facing === 1 ? 0 : Math.PI,
                  }
                : null
            }
            // 💬 Sohbet baloncuğu: mesaj gönderilince baş üstünde görünür
            // (Sanalika/Habbo stili; içinde "İsim: mesaj" yazar),
            // `CHAT_BUBBLE_MS` sonra kaybolur.
            speech={bubble}
            speechName={username}
            speechColorId={bubbleColorId}
            botSpeech={botBubbles}
          />
          )}

          {/* character profile card — tapping a character opens it here */}
          <AnimatePresence>
            {viewing !== null &&
              (viewing === "me" ? (
                <CharacterCard
                  key="me"
                  name={username}
                  subtitle={`Vaelos Caddesi sakini · Level ${level}`}
                  badge={
                    <>
                      <span className="flex shrink-0 items-center rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-400 px-2 py-0.5 text-[10px] font-black text-white shadow-md">
                        ✦ LV {level}
                      </span>
                      {isVip ? (
                        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                          👑 VIP
                        </span>
                      ) : null}
                    </>
                  }
                  avatar={
                    <GlbProfileAvatar
                      equipped={equipped}
                      className="block size-24"
                    />
                  }
                  stats={
                    <>
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-extrabold text-emerald-700">
                        {CURRENCY_EMOJI} {formatCoins(coins)} SP
                      </span>
                      <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-extrabold text-sky-700">
                        🎒 {items.length} ürün
                      </span>
                      <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-extrabold text-violet-700">
                        ⚔️ {battleWins} galibiyet · Level {level}
                      </span>
                    </>
                  }
                  house={
                    <HousePreview
                      // 🏠 Ev yoksa "Ev yok" göster (uydurma ad yazma): kaybedilen
                      // ev geri gelmez, kart da durumu dürüstçe yansıtır.
                      name={myHouseView?.name}
                      tone={config.shirt}
                      hint="🏠 Evini göster"
                      image={
                        myHouseView ? (myRoomShot ?? latestRoomShot) : null
                      }
                    />
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
                  subtitle={`Vaelos Caddesi sakini · Level ${viewedBot.level}`}
                  badge={
                    <span className="animate-pulse rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-400 px-2 py-0.5 text-[10px] font-black text-white shadow-md">
                      ✦ LV {viewedBot.level}
                    </span>
                  }
                  avatar={
                    <GlbProfileAvatar
                      equipped={viewedBot.equipped}
                      className="block size-24"
                    />
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
                  house={
                    <HousePreview
                      // 🪑 Botların evi her zaman BOŞ ODA: gerçek bir oda fotoğrafı
                      // yoktur (hepsi aynı görünmesin diye zemin tonu karaktere özel).
                      name={`${viewedBot.name} Odası`}
                      tone={viewedBot.color}
                      empty
                    />
                  }
                  action={
                    invite?.botId === viewedBot.id &&
                    invite.status === "waiting" ? (
                      <Button
                        size="sm"
                        disabled
                        className="w-full rounded-full"
                      >
                        Davet bekleniyor…
                      </Button>
                    ) : invite?.botId === viewedBot.id &&
                      invite.status === "rejected" ? (
                      <p className="rounded-full bg-red-500/10 px-3 py-2 text-center text-xs font-extrabold text-red-600">
                        Savaşı reddetti 😔
                      </p>
                    ) : (
                      <div className="flex w-full flex-col gap-2">
                        <Button
                          size="sm"
                          className="w-full rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow hover:from-orange-400 hover:to-rose-400"
                          onClick={() => handleInvite(viewedBot)}
                        >
                          <Swords className="size-4" /> Savaşa Davet Et
                        </Button>
                        {/* ⚔️ Botlara karşı bahis: yakında gerçek oyuncu yokken
                            de SP'yi ortaya koyabilirsin. */}
                        <Button
                          size="sm"
                          className="w-full rounded-full bg-gradient-to-r from-red-600 to-amber-500 font-black text-white shadow hover:from-red-500 hover:to-amber-400"
                          onClick={() => openLocalWagerChallenge(viewedBot)}
                        >
                          💰 Bahisli Meydan Oku
                        </Button>
                        {/* 🏠 TAKAS: ev ve/veya para ortaya — 3 rauntluk maç. */}
                        <Button
                          size="sm"
                          className="w-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 font-black text-white shadow hover:from-emerald-500 hover:to-teal-400"
                          onClick={() =>
                            openTrade({ opponentName: viewedBot.name, bot: viewedBot })
                          }
                        >
                          🏠 Takas Et
                        </Button>
                      </div>
                    )
                  }
                  onClose={() => setViewing(null)}
                />
              ) : viewedRemote ? (
                <CharacterCard
                  key={viewedRemote.sessionId}
                  name={viewedRemote.data?.name ?? "Oyuncu"}
                  subtitle="Vaelos Caddesi sakini"
                  badge={
                    viewedRemote.data?.vip ? (
                      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                        👑 VIP
                      </span>
                    ) : null
                  }
                  avatar={
                    <GlbProfileAvatar
                      equipped={viewedRemote.data?.equipped ?? []}
                      className="block size-24"
                    />
                  }
                  stats={
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-extrabold text-amber-700">
                      {
                        abilityOf(viewedRemote.data?.ability ?? DEFAULT_ABILITY)
                          .emoji
                      }{" "}
                      {
                        abilityOf(viewedRemote.data?.ability ?? DEFAULT_ABILITY)
                          .name
                      }
                    </span>
                  }
                  house={
                    <HousePreview
                      name={
                        viewedRemoteHouse?.name ??
                        `${viewedRemote.data?.name ?? "Oyuncu"} Odası`
                      }
                      // Her oyuncunun evi kendi görünümünde olsun: kendi oda
                      // fotoğrafı varsa o, yoksa karakterin gömlek tonuyla çizim.
                      tone={viewedRemote.data?.config?.shirt}
                      image={remoteRoomShot}
                    />
                  }
                  action={
                    <div className="flex w-full flex-col gap-2">
                      <Button
                        size="sm"
                        className="w-full rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow hover:from-orange-400 hover:to-rose-400"
                        onClick={() => handleChallengeRemote(viewedRemote)}
                      >
                        <Swords className="size-4" /> Savaşa Davet Et
                      </Button>
                      {/* ⚔️ Yüksek riskli bahisli düello — SP ve/veya ev ortaya. */}
                      <Button
                        size="sm"
                        className="w-full rounded-full bg-gradient-to-r from-red-600 to-amber-500 font-black text-white shadow hover:from-red-500 hover:to-amber-400"
                        onClick={() =>
                          openWagerChallenge(viewedRemote.data?.name ?? "Oyuncu")
                        }
                      >
                        💰 Bahisli Meydan Oku
                      </Button>
                      {/* 🏠 TAKAS: ev ve/veya para ortaya — 3 rauntluk maç. */}
                      <Button
                        size="sm"
                        className="w-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 font-black text-white shadow hover:from-emerald-500 hover:to-teal-400"
                        onClick={() =>
                          openTrade({
                            opponentName: viewedRemote.data?.name ?? "Oyuncu",
                          })
                        }
                      >
                        🏠 Takas Et
                      </Button>
                    </div>
                  }
                  onClose={() => setViewing(null)}
                />
              ) : null)}
          </AnimatePresence>

          {/* ⚔️ BAHİSLİ DÜELLO: gelen meydan okuma (altın/ev bahsi bildirimi). */}
          <AnimatePresence>
            {wagerInvite && !battle && !pvpBattle && !pvpChallenge && (
              <WagerInvitePopup
                invite={wagerInvite}
                busy={wagerBusy}
                onAccept={handleAcceptWager}
                onDecline={handleDeclineWager}
              />
            )}
          </AnimatePresence>

          {/* ⚔️ Bahis daveti gönderildi — rakip cevap veriyor. */}
          <AnimatePresence>
            {wagerPending && !pvpBattle && (
              <WagerWaitingBanner
                name={wagerPending.name}
                summary={wagerPending.summary}
                onCancel={handleCancelWager}
              />
            )}
          </AnimatePresence>

          {/* ⚔️ BOT bahsi: bot cevap veriyor (henüz rehin yok). */}
          <AnimatePresence>
            {botWagerPending && !battle && (
              <WagerWaitingBanner
                name={botWagerPending.botName}
                summary={botWagerPending.summary}
                onCancel={() => setBotWagerPending(null)}
              />
            )}
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
              opponentLevel={battle.opponentLevel}
              rounds={battle.rounds}
              onExit={endBattle}
            />
          )}

          {/* PvP duel arena — two real phones, live via the battles doc + room */}
          {pvpBattle &&
            battleDoc?.opponent &&
            battleDoc.status !== "waiting" && (
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

          {/* 🎺 YÜKSEK BAHİSLİ DÜELLO DUYURUSU — bahisli maç başlarken ekrana
              devasa kırmızı/altın duyuru düşer. */}
          <WagerAnnouncement show={wagerAnnounce} />

          {/* 🏠 ODA — "Evine gir" sonrası açılan iç mekân. Sahibi adını
              değiştirebilir, komşuların odasına geçilebilir; sokaktaki
              karakter aynı modelle odada durur. */}
          <AnimatePresence>
            {room && (
              <HouseRoom
                key="room"
                view={room.view}
                equipped={equipped}
                // 🎨 KARAKTER RENGİ: odada da CADDEDEKİ renk geçerli. Karakter
                // asla başka bir renge bürünmez — seçilen rengi (`config.shirt`)
                // taşır. Karakter derisi (skin) kuşanılmışsa doğal rengi korunur.
                tint={hasCharacterSkin(equipped) ? undefined : config.shirt}
                // 💬 SOHBET BALONCUĞU — caddede olduğu GİBİ evin içinde de
                // görünür: aynı `bubble` durumu, aynı ad ve aynı renk.
                // Odanın tek farkı eşya dizmektir; sohbet kısıtlanmaz.
                speech={bubble}
                speechName={username}
                speechColorId={bubbleColorId}
                neighbors={neighborNames}
                // 🛋️ EŞYA: kendi odanda dolabın + yerleşimin, komşunun odasında
                // ONUN düzeni gelir (yazma uçları yalnızca satır sahibine açık).
                furniture={roomFurniture}
                onPlaceItem={(rowId, fx, fz, rot) => {
                  void placeRoomItem({
                    rowId: rowId as Id<"furniture">,
                    fx,
                    fz,
                    // Dönüş de kalıcı: eşya odadan çıkıp gelince aynı açıda durur.
                    rot,
                  });
                }}
                onLiftItem={(rowId) => {
                  void liftRoomItem({ rowId: rowId as Id<"furniture"> });
                }}
                // 🛒 Stant: eşya alımı evin içinden de yapılabilir.
                onOpenStand={() => {
                  playSound("click");
                  setStandOpen(true);
                }}
                onRename={(name) => void renameMyRoom(name)}
                onVisit={(who) => void enterNeighborRoom(who)}
                onExit={exitRoom}
              />
            )}
          </AnimatePresence>

        </main>

        {/* bottom control bar — Vaelos style: all buttons centered in one
            row (visible at once, no scrolling needed) with a full-width chat
            input below. Clear of the phone's home indicator (safe-area). */}
        <div className="shrink-0 border-t-4 border-[#3d2f2a]/15 bg-[#f3e0bd] pb-[max(env(safe-area-inset-bottom),0.5rem)]">
          <div className="flex min-w-0 items-center overflow-x-auto px-2 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="mx-auto flex w-max items-center gap-1 sm:gap-2.5">
              <BarBtn
                tone="sky"
                icon={Smartphone}
                label="Stüdyo"
                onClick={() => {
                  playSound("click");
                  navigate("/studio");
                }}
              />
              <BarBtn
                tone="sky"
                icon={UserRound}
                label="Profilim"
                onClick={() => {
                  playSound("click");
                  setProfileOpen(true);
                }}
              />
              <BarBtn
                tone="sky"
                icon={Backpack}
                label="Çanta"
                badge={items.length}
                onClick={() => {
                  playSound("click");
                  setBagOpen(true);
                }}
              />
              <BarBtn
                tone="sky"
                icon={Footprints}
                label="Tezgâhlar"
                onClick={() => {
                  playSound("click");
                  setStallsOpen(true);
                }}
              />
              {/* 🏠 Evim — kapıya yürümeden eve gir (aynı yükleme + oda).
                  Oda SUNUCUDA tutulur ve ilk girişte otomatik açılır. */}
              <BarBtn
                tone="sky"
                icon={Home}
                label="Evim"
                onClick={() => void enterMyRoom()}
              />
              <span className="h-8 w-px shrink-0 bg-[#3d2f2a]/15" aria-hidden />
              <BarBtn
                tone="purple"
                icon={MessageCircle}
                label="Sohbet"
                badge={unread}
                onClick={openChat}
              />
              <BarBtn
                tone="purple"
                icon={Puzzle}
                label="Yakında"
                onClick={() => {
                  playSound("click");
                  toast.info("Bu özellik yakında geliyor! 🔧");
                }}
              />
              <BarBtn
                tone="purple"
                icon={Wand2}
                label="Yetenekler"
                onClick={() => {
                  playSound("click");
                  setAbilitiesOpen(true);
                }}
              />
              {/* ⚔️ Arena: yakındaki oyuncuya BAHİSLİ meydan okuma (SP/ev). */}
              <BarBtn
                tone="rose"
                icon={Swords}
                label="Meydan Oku"
                onClick={handleArenaChallenge}
              />
              <BarBtn
                tone="purple"
                icon={Flower2}
                label="Yakında"
                onClick={() => {
                  playSound("click");
                  toast.info("Bu özellik yakında geliyor! 🌸");
                }}
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
                placeholder="Merhaba Vaelos! Mesajını yaz…"
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
        {/* 🛒 MOBİLYA STANTI — caddeden ya da evin içinden açılır; eşya SP ile
            alınır ve dolaba girer, dizme "Evi Düzenle"de yapılır. */}
        {standOpen && (
          <FurnitureStandSheet
            key="furniture-stand"
            coins={coins}
            onClose={() => setStandOpen(false)}
          />
        )}
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
            onOpenFurniture={() => {
              playSound("click");
              setStallsOpen(false);
              setStandOpen(true);
            }}
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
        {wagerChallenge && (
          <WagerChallengeSheet
            key="wager-challenge"
            opponentName={wagerChallenge.name}
            myCoins={coins}
            mySessionId={sessionId}
            me={{
              name: username,
              config,
              equipped,
              ability: equippedAbility,
            }}
            onClose={() => setWagerChallenge(null)}
            onSent={handleWagerSent}
          />
        )}
        {botWagerChallenge && (
          <WagerChallengeSheet
            key="bot-wager-challenge"
            opponentName={botWagerChallenge.bot.name}
            myCoins={coins}
            mySessionId={sessionId}
            me={{
              name: username,
              config,
              equipped,
              ability: equippedAbility,
            }}
            local
            onClose={() => setBotWagerChallenge(null)}
            onSent={() => {}}
            onLocalSent={handleBotWagerSent}
          />
        )}
        {tradeChallenge && (
          <TradeSheet
            key="trade"
            opponentName={tradeChallenge.opponentName}
            myCoins={coins}
            myHouse={
              tradeInfo?.myHouse
                ? {
                    id: String(tradeInfo.myHouse.id),
                    name: tradeInfo.myHouse.name,
                  }
                : null
            }
            opponentHouseName={
              tradeChallenge.bot
                ? "Boş Ev"
                : (viewedRemoteHouse?.name ?? "Boş Ev")
            }
            onClose={() => setTradeChallenge(null)}
            onConfirm={handleTradeConfirm}
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
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/70 px-6 text-center backdrop-blur-sm">
          <div className="size-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          {profileStalled && (
            <>
              <p className="max-w-xs text-sm font-semibold leading-6 text-muted-foreground">
                Hesap bilgilerine ulaşılamadı. Bağlantın zayıf olabilir —
                yeniden denemek genellikle çözer.
              </p>
              <Button
                className="rounded-full"
                onClick={() => window.location.reload()}
              >
                Yeniden Dene
              </Button>
            </>
          )}
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
              Yönetici tarafından engellendin. Vaelos Caddesi'ne girişin şu an
              kapalı — detay için yöneticiye başvurabilirsin.
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

      {/* ── CADDE YÜKLEME EKRANI ──────────────────────────────────────
          Oyun girişindeki ekranın (EntryLoader) AYNISI: sahne arkada kurulur,
          varlıklar + ilk kareler hazır olunca ekran yumuşakça açılır. Cadde
          hazır olmadan oyuncu sahneyi görmez. */}
      <AnimatePresence>
        {gateVisible && (
          <motion.div
            key="street-gate"
            className="fixed inset-0 z-[80]"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <EntryLoader
              pct={gatePct}
              stepIndex={gateStepIndex}
              tip={STREET_TIPS[gateTipIndex]}
              subtitle="Ana caddeye bağlanılıyor"
              crestLabel="Cadde kuruluyor"
              pendingLabel="Cadde hazırlanıyor"
              steps={STREET_LOAD_STEPS}
              player={{
                name: username,
                rankName: rank.name,
                rankIcon: rank.icon,
                rankGradient: rank.gradient,
                vip: isVip,
                level,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Visual Debug — always-visible DEV button + conditional panel */}
      <button
        onPointerDown={(e) => {
          e.stopPropagation();
          setDebugOpen(true);
        }}
        onClick={() => setDebugOpen(true)}
        className="fixed bottom-4 right-4 z-[99999] flex size-11 items-center justify-center rounded-full border border-white/20 bg-black/70 text-sm font-bold text-white shadow-lg backdrop-blur-sm active:scale-95"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        🔧
      </button>
      {debugOpen && (
        <VisualDebug
          containerRef={containerRef}
          equipped={equipped}
          username={username}
          onClose={() => setDebugOpen(false)}
        />
      )}

      {/* 🐞 3D İZOLASYON PANELİ — APK'da aşama seçmenin TEK yolu (bkz.
          `WorldStageDock`). Aşama 0'da yalnızca `?worldDebug` / APK kabuğu /
          `vaelos:worldDebug=1` bayrağıyla görünür; aşama 1–8'de her zaman. */}
      {showDock && <WorldStageDock />}
    </div>
  );
}
