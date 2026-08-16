// The Sanalika street — tap to walk, chat with vendors, shop with SP.
import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { EquippedItems } from "@/components/avatar/EquippedItems";
import { Button } from "@/components/ui/button";
import { BagSheet, ShopSheet, VipSheet } from "@/components/world/ShopSheets";
import { ChatPanel, type ChatMessage } from "@/components/world/ChatPanel";
import { StreetScene } from "@/components/world/StreetScene";
import { api } from "@/convex/_generated/api";
import { DEFAULT_AVATAR, type AvatarConfig } from "@/lib/avatar";
import {
  bubbleColorOf,
  BUBBLE_COLORS,
  CURRENCY_EMOJI,
  DAILY_BONUS_MS,
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
  type Rect,
  type Vendor,
} from "@/lib/shop";
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
  UserRound,
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
  hideMobile,
}: {
  icon: LucideIcon;
  label: string;
  badge?: number;
  tone: "sky" | "purple";
  onClick: () => void;
  /** Keep the bottom bar uncluttered on small phones. */
  hideMobile?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`relative flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-white text-[#2b3a4a] shadow-md transition-transform active:scale-90 sm:size-11 ${
        hideMobile ? "hidden sm:flex" : ""
      } ${
        tone === "sky"
          ? "bg-gradient-to-br from-sky-200 to-sky-400"
          : "bg-gradient-to-br from-fuchsia-200 to-purple-400"
      }`}
    >
      <Icon className="size-4" />
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

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const playerRef = useRef<SVGGElement>(null);
  const spriteRef = useRef<SVGGElement>(null);
  const nameTagRef = useRef<SVGTextElement>(null);

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

  const coins = profile?.coins ?? 0;
  const items = profile?.items ?? [];
  const equipped = profile?.equipped ?? [];
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
      // Portrait phones: fit the whole street into view so every graphic
      // stays on screen. Wide screens keep the follow camera, which pans to
      // keep the player in view instead of letterboxing the world.
      const portrait = h / w > WORLD_H / WORLD_W;
      if (portrait) {
        viewRef.current = { vw: WORLD_W, vh: WORLD_H };
      } else {
        const scale = Math.max(w / WORLD_W, h / WORLD_H);
        viewRef.current = {
          vw: Math.min(w / scale, WORLD_W),
          vh: Math.min(h / scale, WORLD_H),
        };
      }
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

      const keys = keysRef.current;
      let vx = 0;
      let vy = 0;
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
      const moving = len > 0.05;
      if (len > 1) {
        vx /= len;
        vy /= len;
      }

      const pos = posRef.current;
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

      // Camera follows the player (whole world visible on wide screens).
      const view = viewRef.current;
      if (view.vw > 0) {
        const camX = Math.min(
          Math.max(pos.x - view.vw / 2, 0),
          Math.max(WORLD_W - view.vw, 0),
        );
        const camY = Math.min(
          Math.max(pos.y - view.vh / 2, 0),
          Math.max(WORLD_H - view.vh, 0),
        );
        const prev = camRef.current;
        if (
          Math.abs(camX - prev.x) > 0.01 ||
          Math.abs(camY - prev.y) > 0.01
        ) {
          camRef.current = { x: camX, y: camY };
          svgRef.current?.setAttribute(
            "viewBox",
            `${camX.toFixed(2)} ${camY.toFixed(2)} ${view.vw.toFixed(2)} ${view.vh.toFixed(2)}`,
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

  // Name tag under the player follows the saved username (crown for VIPs).
  useEffect(() => {
    if (nameTagRef.current) {
      nameTagRef.current.textContent = `${isVip ? "👑 " : ""}${username}`;
    }
  }, [username, isVip]);

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev.slice(-40), msg]);
    if (!chatOpenRef.current) setUnread((u) => u + 1);
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
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

  /** Close the chat and open the VIP stand page. */
  const openVipFromChat = useCallback(() => {
    closeChat();
    setVipOpen(true);
  }, []);

  /** Auto-walk toward a spot on the street (stalls map / gift box). */
  const goTo = useCallback((x: number, y: number, label: string) => {
    if (!inWalkable(x, y)) return;
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
        const vendor = VENDORS[Math.floor(Math.random() * VENDORS.length)];
        const pool = VENDOR_PHRASES[vendor.id];
        const text = pool[Math.floor(Math.random() * pool.length)];
        appendMessage({
          id: nextIdRef.current++,
          from: vendor.short,
          text,
          color: vendor.color,
        });
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
        vipOpen
      )
        return;
      const target = e.target as HTMLElement;
      if (target.closest("button")) return;
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
      // Tapping the stall itself opens its market page (VIP stand opens the
      // membership page instead).
      const vendor = vendorAtPoint(wx, wy);
      if (vendor) {
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
    <div className="flex h-dvh items-center justify-center bg-[#e9dcc0] text-foreground select-none">
      {/* Framed game window: dark top bar, the street, beige control bar. */}
      <div className="relative flex h-full w-full max-w-[1560px] flex-col overflow-hidden border-4 border-[#3d2f2a]/20 bg-[#33324a] shadow-2xl sm:rounded-[30px]">
        {/* top bar — wallet & player */}
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-white sm:px-3 sm:py-2">
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

        {/* Portrait letterbox bands blend into the world: sky blue above,
            grass green below, so the upright phone view looks intentional. */}
        <main
          ref={containerRef}
          className="relative min-h-0 flex-1 touch-none overflow-hidden"
          style={{
            background:
              "linear-gradient(180deg, #bfe3ff 0%, #bfe3ff 36%, #d9eee5 50%, #aee571 74%, #aee571 100%)",
          }}
          onClick={handleWorldClick}
        >
        <svg
          ref={svgRef}
          viewBox="0 0 1600 900"
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full"
        >
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
            <g transform="translate(-44 16)">
              <rect
                width="88"
                height="22"
                rx="11"
                fill="#ffffff"
                opacity="0.92"
                stroke="#3d2f2a"
                strokeOpacity="0.12"
              />
              <text
                ref={nameTagRef}
                x="44"
                y="15"
                textAnchor="middle"
                fontSize="12"
                fontWeight="800"
                fill="#2b2320"
              >
                {username}
              </text>
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
        </svg>

        </main>

        {/* bottom control bar — chat input in the center, like Sanalika */}
        <div className="flex items-center gap-1.5 border-t-4 border-[#3d2f2a]/15 bg-[#f3e0bd] px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2">
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <BarBtn tone="sky" icon={Smartphone} label="Stüdyo" onClick={() => navigate("/studio")} />
            <BarBtn
              tone="sky"
              icon={UserRound}
              label="Profilim"
              hideMobile
              onClick={() => setProfileOpen(true)}
            />
            <BarBtn tone="sky" icon={Backpack} label="Çanta" badge={items.length} onClick={() => setBagOpen(true)} />
            <BarBtn
              tone="sky"
              icon={Footprints}
              label="Tezgâhlar"
              hideMobile
              onClick={() => setStallsOpen(true)}
            />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(chatDraft);
              setChatDraft("");
            }}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <input
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              placeholder="Merhaba Sanalika!"
              maxLength={120}
              autoComplete="off"
              aria-label="Sohbet mesajı"
              className="h-10 min-w-0 flex-1 rounded-full border-2 border-white bg-white px-4 text-sm font-semibold text-foreground shadow-inner outline-none placeholder:text-muted-foreground/60 focus:border-primary"
            />
            <button
              type="submit"
              className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform active:scale-90 sm:flex"
              aria-label="Mesajı gönder"
            >
              <Send className="size-4" />
            </button>
          </form>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <BarBtn tone="purple" icon={MessageCircle} label="Sohbet" badge={unread} onClick={openChat} />
            <BarBtn
              tone="purple"
              icon={Puzzle}
              label="Yakında"
              hideMobile
              onClick={() => toast.info("Bu özellik yakında geliyor! 🔧")}
            />
            <BarBtn
              tone="purple"
              icon={Wand2}
              label="Yakında"
              hideMobile
              onClick={() => toast.info("Bu özellik yakında geliyor! ✨")}
            />
            <BarBtn
              tone="purple"
              icon={Flower2}
              label="Yakında"
              hideMobile
              onClick={() => toast.info("Bu özellik yakında geliyor! 🌸")}
            />
          </div>
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
      </AnimatePresence>

      {/* loading / no-profile overlays */}
      {profile === undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="size-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
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
