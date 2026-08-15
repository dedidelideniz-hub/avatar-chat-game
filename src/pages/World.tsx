import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { EquippedItems } from "@/components/avatar/EquippedItems";
import { Button } from "@/components/ui/button";
import { BagSheet, ShopSheet } from "@/components/world/ShopSheets";
import { Joystick } from "@/components/world/Joystick";
import { StreetScene } from "@/components/world/StreetScene";
import { api } from "@/convex/_generated/api";
import { DEFAULT_AVATAR } from "@/lib/avatar";
import {
  CURRENCY_EMOJI,
  DAILY_BONUS_MS,
  formatCoins,
  GIFT_BOX,
  getVendor,
  OBSTACLES,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  VENDOR_INTERACT_RADIUS,
  VENDOR_INTERACT_X,
  VENDORS,
  WORLD_BOUNDS,
  type Rect,
  type Vendor,
} from "@/lib/shop";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft, Backpack, Keyboard } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const WORLD_W = 1600;
const WORLD_H = 900;
const PLAYER_W = 70;
const PLAYER_H = 96;
const SPAWN = { x: 800, y: 760 };

type Interaction =
  | { type: "vendor"; vendorId: string }
  | { type: "gift" }
  | null;

function circleHitsRect(cx: number, cy: number, r: number, rect: Rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

export default function World() {
  const navigate = useNavigate();
  const profile = useQuery(api.profiles.getMyProfile);
  const claimDaily = useMutation(api.profiles.claimDailyBonus);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const playerRef = useRef<SVGGElement>(null);
  const spriteRef = useRef<SVGGElement>(null);
  const nameTagRef = useRef<SVGTextElement>(null);

  const posRef = useRef({ x: SPAWN.x, y: SPAWN.y });
  const facingRef = useRef(1);
  const keysRef = useRef(new Set<string>());
  const joyRef = useRef({ x: 0, y: 0 });
  const interRef = useRef<Interaction>(null);
  const viewRef = useRef({ vw: WORLD_W, vh: WORLD_H });
  const camRef = useRef({ x: -1, y: -1 });

  const [interaction, setInteraction] = useState<Interaction>(null);
  const [shopVendor, setShopVendor] = useState<Vendor | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const coins = profile?.coins ?? 0;
  const items = profile?.items ?? [];
  const equipped = profile?.equipped ?? [];
  const username = profile?.username ?? "Misafir";
  const config = profile?.avatar ?? DEFAULT_AVATAR;
  const giftClaimed =
    profile !== undefined &&
    (profile?.lastDailyClaim ?? 0) > Date.now() - DAILY_BONUS_MS;

  // Track the container size → visible world window for the camera.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return;
      const scale = Math.max(w / WORLD_W, h / WORLD_H);
      viewRef.current = { vw: w / scale, vh: h / scale };
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
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const keys = keysRef.current;
      let vx = 0;
      let vy = 0;
      if (keys.has("ArrowLeft") || keys.has("KeyA")) vx -= 1;
      if (keys.has("ArrowRight") || keys.has("KeyD")) vx += 1;
      if (keys.has("ArrowUp") || keys.has("KeyW")) vy -= 1;
      if (keys.has("ArrowDown") || keys.has("KeyS")) vy += 1;
      vx += joyRef.current.x;
      vy += joyRef.current.y;
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
        // Resolve collisions axis by axis.
        let px = nx;
        let py = pos.y;
        for (const r of OBSTACLES) {
          if (circleHitsRect(px, py, PLAYER_RADIUS, r)) {
            px = pos.x;
            break;
          }
        }
        py = Math.min(Math.max(ny, WORLD_BOUNDS.minY), WORLD_BOUNDS.maxY);
        for (const r of OBSTACLES) {
          if (circleHitsRect(px, py, PLAYER_RADIUS, r)) {
            py = pos.y;
            break;
          }
        }
        pos.x = px;
        pos.y = py;
        if (Math.abs(vx) > 0.05) facingRef.current = vx;
      }

      // Sprite: bob while walking + face movement direction.
      const flip = facingRef.current < 0 ? -1 : 1;
      const bob = moving ? Math.sin(phase) * 3.5 : 0;
      const ty = -PLAYER_H + bob;
      if (spriteRef.current) {
        spriteRef.current.setAttribute(
          "transform",
          flip === 1
            ? `translate(${-PLAYER_W / 2} ${ty})`
            : `translate(${-PLAYER_W / 2} 0) scale(-1 1) translate(0 ${ty})`,
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

      // What is the player standing next to?
      let next: Interaction = null;
      for (const vendor of VENDORS) {
        const d = Math.hypot(
          pos.x - vendor.x,
          pos.y - VENDOR_INTERACT_X,
        );
        if (d < VENDOR_INTERACT_RADIUS) {
          next = { type: "vendor", vendorId: vendor.id };
          break;
        }
      }
      if (next === null) {
        const d = Math.hypot(pos.x - GIFT_BOX.x, pos.y - GIFT_BOX.y);
        if (d < GIFT_BOX.radius) next = { type: "gift" };
      }
      const prevInter = interRef.current;
      const changed =
        next?.type !== prevInter?.type ||
        (next?.type === "vendor" &&
          next.vendorId !==
            (prevInter?.type === "vendor" ? prevInter.vendorId : ""));
      if (changed) {
        interRef.current = next;
        setInteraction(next);
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

  // Name tag under the player follows the saved username.
  useEffect(() => {
    if (nameTagRef.current) {
      nameTagRef.current.textContent = username;
    }
  }, [username]);

  const handleMove = useCallback((x: number, y: number) => {
    joyRef.current = { x, y };
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

  const activeVendor =
    interaction?.type === "vendor"
      ? (getVendor(interaction.vendorId) ?? null)
      : null;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#bfe3ff] text-foreground select-none">
      {/* The street fills the whole screen; HUD floats on top of it. */}
      <main
        ref={containerRef}
        className="absolute inset-0 touch-none overflow-hidden"
      >
        <svg
          ref={svgRef}
          viewBox="0 0 1600 900"
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full"
        >
          <StreetScene giftClaimed={giftClaimed} />

          {/* player */}
          <g ref={playerRef}>
            {interaction !== null && (
              <ellipse
                cx="0"
                cy="8"
                rx="32"
                ry="9"
                fill="#ff6b4a"
                opacity="0.35"
              />
            )}
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
          </g>
        </svg>

        {/* floating HUD — chips sit on top of the game view */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3 sm:p-4">
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto rounded-full border-white/60 bg-white/80 shadow-lg backdrop-blur"
            onClick={() => navigate("/studio")}
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Stüdyo</span>
          </Button>
          <span className="hidden items-center gap-1.5 rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-xs font-extrabold text-foreground/70 shadow backdrop-blur lg:flex">
            <Keyboard className="size-3.5" />
            WASD / ok tuşları
          </span>
          <div className="pointer-events-auto flex items-center gap-2">
            <span
              className="flex items-center gap-1.5 rounded-full border border-white/60 bg-white/80 px-3 py-1.5 text-sm font-extrabold shadow-lg backdrop-blur"
              title="Sanalika Parası"
            >
              {CURRENCY_EMOJI} {formatCoins(coins)}{" "}
              <span className="text-[10px] font-bold text-foreground/50">
                SP
              </span>
            </span>
            <Button
              variant="outline"
              size="sm"
              className="relative rounded-full border-white/60 bg-white/80 shadow-lg backdrop-blur"
              onClick={() => setBagOpen(true)}
              aria-label="Çantam"
            >
              <Backpack className="size-4" />
              <span className="hidden sm:inline">Çanta</span>
              {items.length > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-extrabold text-primary-foreground">
                  {items.length}
                </span>
              )}
            </Button>
          </div>
        </div>

        <Joystick onMove={handleMove} className="absolute bottom-6 left-5 z-20" />

        {/* interaction prompt */}
        {!shopVendor &&
          !bagOpen &&
          interaction !== null &&
          (activeVendor !== null || interaction.type === "gift") && (
            <div className="pointer-events-none absolute inset-x-0 bottom-40 z-20 flex justify-center px-4 sm:bottom-8">
              <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-xl backdrop-blur">
                {activeVendor ? (
                  <>
                    <span className="text-3xl">{activeVendor.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold">
                        {activeVendor.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Tezgâha göz atmak ister misin?
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0 rounded-full"
                      onClick={() => setShopVendor(activeVendor)}
                    >
                      Tezgâhı aç
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-3xl">🎁</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold">Hediye kutusu</p>
                      <p className="text-xs text-muted-foreground">
                        {giftClaimed
                          ? "Bugün toplandı, yarın tekrar uğra!"
                          : "Bugünlük +150 SP kazan!"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0 rounded-full"
                      onClick={handleClaim}
                      disabled={giftClaimed || claiming}
                    >
                      {giftClaimed
                        ? "Toplandı ✓"
                        : claiming
                          ? "Açılıyor..."
                          : "Kutuyu aç"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
      </main>

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
