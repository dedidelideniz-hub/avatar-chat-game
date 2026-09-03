// ⚔️ Brawl-styled duel arena — two fighters, HP bars, projectiles and supers.
// The whole simulation runs on a rAF loop mutating plain refs (no React
// re-renders); the Arena3D component reads those refs every frame and draws
// the scene in 3D (Three.js). React only renders the HUD, controls and the
// result screen.
import { Button } from "@/components/ui/button";
import {
  Arena3D,
  ATK_CD,
  BATTLE_OBSTACLES,
  BUSH_REVEAL_MS,
  isHiddenFrom,
  supportsWebGL,
  type BattleFighter,
  type BattleFx,
  type BattleProj,
} from "@/components/world/Arena3D";
import { FallbackArena2D } from "@/components/world/FallbackArena2D";
import type { AvatarConfig } from "@/lib/avatar";
import { abilityOf, type AbilityDef } from "@/lib/shop";
import {
  playSound,
  startBattleAmbience,
  stopBattleAmbience,
} from "@/lib/sounds";
import { AnimatePresence, motion } from "framer-motion";
import { Swords, Trophy, X, Zap } from "lucide-react";
import {
  Component,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const ARENA_W = 1700;
const ARENA_H = 1100;
const HP = 1000;
const BASE_DMG = 120;
const PROJ_SPEED = 620;
/** Long enough to cross the arena diagonally so bot shots from any
 *  distance always reach the player instead of vanishing mid-air. */
const PROJ_RANGE = 1500;
const FIGHTER_R = 22;

/** Bot difficulty curves, all driven by the opponent's profile level (1-10).
 *  Level 1 plays sloppy and slow; level 10 aims true and keeps pressure on.
 *  Everything is a gentle ramp so a couple of levels is a nudge, not a wall. */
const BOT_LEVEL_MIN = 1;
const BOT_LEVEL_MAX = 10;
const botLevelT = (level: number) =>
  (clampLevel(level) - BOT_LEVEL_MIN) / (BOT_LEVEL_MAX - BOT_LEVEL_MIN);
const clampLevel = (level: number) =>
  Math.min(BOT_LEVEL_MAX, Math.max(BOT_LEVEL_MIN, Math.round(level || BOT_LEVEL_MIN)));
/** Aim jitter in radians — shrinks from ±0.14 (level 1) to ±0.03 (level 10). */
const botAimError = (level: number) => 0.14 - 0.11 * botLevelT(level);
/** Seconds between bot shots — 0.4s (level 1) down to 0.2s (level 10).
 *  Much faster than the player's 0.85s ATK_CD: bots fire continuously,
 *  with no pauses between bursts. */
const botFireInterval = (level: number) => 0.4 - 0.2 * botLevelT(level);
/** Bot move speed multiplier — 0.9x (level 1) up to 1.15x (level 10). */
const botSpeedMul = (level: number) => 0.9 + 0.25 * botLevelT(level);
/** Chance per shot the bot strafes after firing — dodgier at higher levels. */
const botStrafeChance = (level: number) => 0.15 + 0.45 * botLevelT(level);

/** Status lines that cycle under the loading bar while the arena loads. */
const LOAD_STEPS = [
  "Arena hazırlanıyor…",
  "Rakip bulunuyor…",
  "Silahlar kalibre ediliyor…",
  "Enerji yükleniyor…",
];

/** GIF-style emoji FX that float up through the loading screen. */
const LOAD_FX = [
  { e: "⚔️", left: "6%", delay: 0, dur: 4.2, size: "text-2xl" },
  { e: "⚡", left: "16%", delay: 0.9, dur: 3.4, size: "text-xl" },
  { e: "🗡️", left: "28%", delay: 1.6, dur: 4.8, size: "text-2xl" },
  { e: "✨", left: "41%", delay: 0.4, dur: 3.8, size: "text-lg" },
  { e: "💥", left: "55%", delay: 1.1, dur: 4.4, size: "text-2xl" },
  { e: "⚡", left: "66%", delay: 2.0, dur: 3.2, size: "text-xl" },
  { e: "🛡️", left: "78%", delay: 0.7, dur: 5.0, size: "text-2xl" },
  { e: "✨", left: "88%", delay: 1.4, dur: 3.6, size: "text-lg" },
  { e: "🔥", left: "95%", delay: 2.4, dur: 4.6, size: "text-xl" },
  { e: "⭐", left: "10%", delay: 2.8, dur: 4.0, size: "text-lg" },
];

function newFighter(
  name: string,
  config: AvatarConfig,
  equipped: string[],
  abilityId: string,
  x: number,
  y: number,
  facing: number,
  level = 1,
): BattleFighter {
  return {
    name,
    config,
    equipped,
    ability: abilityOf(abilityId),
    level,
    hp: HP,
    maxHp: HP,
    x,
    y,
    facing,
    phase: 0,
    moving: false,
    atkCd: 0,
    superCharge: 0,
    dashT: 0,
    dashVX: 0,
    dashVY: 0,
    dashHit: false,
    lastHitAt: -9999,
    vy: 0,
    revealUntil: -9999,
  };
}

/** Virtual joystick — drag anywhere on it to move (works with mouse + touch). */
export function BattleJoystick({
  stickRef,
}: {
  stickRef: MutableRefObject<{ x: number; y: number }>;
}) {
  const knobRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const R = 40;

  const move = (px: number, py: number) => {
    const base = knobRef.current?.parentElement;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = px - cx;
    let dy = py - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    stickRef.current = { x: dx / R, y: dy / R };
    if (knobRef.current)
      knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const reset = () => {
    stickRef.current = { x: 0, y: 0 };
    if (knobRef.current) knobRef.current.style.transform = "translate(0px, 0px)";
  };

  return (
    <div
      className="pointer-events-auto absolute bottom-4 left-4 z-10 size-28 touch-none rounded-full border-4 border-white/40 bg-white/15 backdrop-blur-[2px]"
      onPointerDown={(e) => {
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) move(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        draggingRef.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
        reset();
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
        reset();
      }}
      aria-label="Hareket joystick"
    >
      <div
        ref={knobRef}
        className="absolute top-1/2 left-1/2 -ml-6 -mt-6 size-12 rounded-full border-2 border-white/70 bg-white/50 shadow-lg"
      />
    </div>
  );
}

/** If the 3D scene crashes for any reason, fall back to the 2D arena so
 *  the battle never breaks. */
class ArenaBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("3D arena hatası — 2D moda geçiliyor:", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Gaming-style loading screen shown on arena entry — animated title,
 *  GIF-style floating FX, fighter cards and a filling progress bar. */
export function BattleLoading({
  playerName,
  playerAbility,
  opponentName,
  opponentAbility,
  pct,
  step,
}: {
  playerName: string;
  playerAbility: string;
  opponentName: string;
  opponentAbility: string;
  pct: number;
  step: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.08 }}
      transition={{ duration: 0.28 }}
      className="absolute inset-0 z-[15] flex flex-col items-center justify-center overflow-hidden bg-[#0b1020] text-white"
    >
      {/* animated grid floor + moving scanline (GIF-style) */}
      <div className="battle-load-grid pointer-events-none absolute inset-0" />
      <div className="battle-load-scan pointer-events-none absolute inset-x-0 top-0 h-24" />

      {/* floating GIF-style emoji FX */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {LOAD_FX.map((f, i) => (
          <span
            key={i}
            className={`battle-load-float ${f.size}`}
            style={{
              left: f.left,
              animationDuration: `${f.dur}s`,
              animationDelay: `${f.delay}s`,
            }}
          >
            {f.e}
          </span>
        ))}
      </div>

      {/* title */}
      <h2
        className="battle-load-slam relative z-10 flex items-center gap-3 text-4xl font-black tracking-widest sm:text-5xl"
        style={{
          textShadow:
            "0 0 24px rgba(56,189,248,0.8), 0 4px 0 rgba(15,23,42,0.9)",
        }}
      >
        <span className="battle-load-spin">⚔️</span>
        SAVAŞ ALANI
        <span className="battle-load-spin" style={{ animationDirection: "reverse" }}>
          ⚔️
        </span>
      </h2>
      <p className="relative z-10 mt-1 text-xs font-bold tracking-[0.35em] text-sky-300/80">
        SANALİKA DUEL ARENASI
      </p>

      {/* fighter cards + VS emblem */}
      <div className="relative z-10 mt-8 flex items-center gap-3 sm:gap-6">
        <div className="battle-load-card flex w-32 flex-col items-center gap-2 rounded-2xl border-2 border-white/25 bg-white/5 px-3 py-4 backdrop-blur-sm sm:w-44">
          <span className="text-4xl sm:text-5xl">{playerAbility}</span>
          <p className="w-full truncate text-center text-sm font-extrabold sm:text-base">
            {playerName}
          </p>
          <span className="rounded-full bg-sky-500/25 px-2.5 py-0.5 text-[10px] font-extrabold tracking-wider text-sky-300">
            SEN
          </span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <span
            className="battle-load-flash text-3xl font-black text-yellow-300 sm:text-4xl"
            style={{ textShadow: "0 0 18px rgba(250,204,21,0.9)" }}
          >
            VS
          </span>
          <span className="text-xl">⚡</span>
        </div>

        <div
          className="battle-load-card flex w-32 flex-col items-center gap-2 rounded-2xl border-2 border-white/25 bg-white/5 px-3 py-4 backdrop-blur-sm sm:w-44"
          style={{ animationDelay: "0.65s" }}
        >
          <span className="text-4xl sm:text-5xl">{opponentAbility}</span>
          <p className="w-full truncate text-center text-sm font-extrabold sm:text-base">
            {opponentName}
          </p>
          <span className="rounded-full bg-rose-500/25 px-2.5 py-0.5 text-[10px] font-extrabold tracking-wider text-rose-300">
            RAKİP
          </span>
        </div>
      </div>

      {/* progress bar */}
      <div className="relative z-10 mt-8 w-72 sm:w-96">
        <div className="flex items-center justify-between text-[11px] font-extrabold tracking-wider">
          <span key={step} className="battle-load-step text-sky-300">
            {LOAD_STEPS[step]}
          </span>
          <span className="tabular-nums text-yellow-300">%{pct}</span>
        </div>
        <div className="mt-2 h-4 overflow-hidden rounded-full border-2 border-white/20 bg-white/10">
          <div
            className="battle-load-bar h-full rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 transition-[width] duration-150 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[9px] font-bold text-white/35">
          <span>⚙️ SANALİKA GAMES</span>
          <span>v2.0</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function BattleScene({
  playerName,
  playerConfig,
  playerEquipped,
  playerAbility,
  opponentName,
  opponentConfig,
  opponentEquipped,
  opponentAbility,
  opponentLevel,
  onExit,
}: {
  playerName: string;
  playerConfig: AvatarConfig;
  playerEquipped: string[];
  playerAbility: string;
  opponentName: string;
  opponentConfig: AvatarConfig;
  opponentEquipped: string[];
  opponentAbility: string;
  opponentLevel: number;
  onExit: (victory: boolean) => void;
}) {
  const arenaRef = useRef<HTMLElement>(null);
  // The joystick's live direction vector.
  const joystickRef = useRef({ x: 0, y: 0 });
  // Brawl-Stars-style attack joystick: while held, drag to pick the aim
  // direction (dx/dy normalized to [-1, 1]). The aim guide follows it;
  // zero means auto-aim at the enemy. Holding keeps firing on cooldown
  // so you can shoot while walking (run-and-gun).
  const aimRef = useRef({ active: false, dx: 0, dy: 0 });
  const attackKnobRef = useRef<HTMLSpanElement>(null);

  const keysRef = useRef(new Set<string>());
  const clickTargetRef = useRef<{ x: number; y: number } | null>(null);
  const projs = useRef<BattleProj[]>([]);
  const fxs = useRef<BattleFx[]>([]);
  const resultRef = useRef<"win" | "lose" | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const player = useRef<BattleFighter>(
    newFighter(playerName, playerConfig, playerEquipped, playerAbility, 420, 180, 1, 1),
  );
  const bot = useRef<BattleFighter>(
    newFighter(opponentName, opponentConfig, opponentEquipped, opponentAbility, 1280, 920, -1, opponentLevel),
  );
  bot.current.atkCd = 0.4;

  const webglOk = useMemo(() => supportsWebGL(), []);

  const [result, setResult] = useState<"win" | "lose" | null>(null);
  const [attackHeld, setAttackHeld] = useState(false);
  const [vsShow, setVsShow] = useState(true);
  // Gaming-style loading sequence runs before the fight unlocks.
  const [phase, setPhase] = useState<"loading" | "fight">("loading");
  const startedRef = useRef(false);
  const [loadPct, setLoadPct] = useState(0);
  const [loadStep, setLoadStep] = useState(0);
  const [hud, setHud] = useState({
    ph: HP,
    ohp: HP,
    pc: 0,
    oc: 0,
    atkReady: true,
  });
  const lastHudRef = useRef({
    ph: -1,
    ohp: -1,
    pc: -1,
    oc: -1,
    atkReady: false,
  });
  const actionsRef = useRef({
    attack: () => {},
    super: () => {},
    click: (_x: number, _y: number) => {},
  });

  // Animated VS banner plays once the loading sequence finishes.
  useEffect(() => {
    if (phase !== "fight") return;
    const t = window.setTimeout(() => setVsShow(false), 1800);
    return () => window.clearTimeout(t);
  }, [phase]);

  // Gaming-style loading on arena entry: animated progress bar with cycling
  // status lines, then an orchestral "VS" sting as the fight unlocks.
  useEffect(() => {
    if (phase !== "loading") return;
    const start = performance.now();
    const DURATION = 4200;
    const STEPS = LOAD_STEPS.length;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / DURATION, 1);
      setLoadPct(Math.round(t * 100));
      setLoadStep(Math.min(Math.floor(t * STEPS), STEPS - 1));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        startedRef.current = true;
        playSound("vs");
        setPhase("fight");
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const clamp = (v: number, a: number, b: number) =>
    Math.min(Math.max(v, a), b);

  const hitsObstacle = (cx: number, cy: number, r: number) =>
    BATTLE_OBSTACLES.some((c) => {
      // Bushes are Brawl-style stealth zones: fighters walk THROUGH them
      // (and shots pass over them) — they only hide who stands inside.
      if (c.kind === "bush") return false;
      const nx = Math.max(c.x, Math.min(cx, c.x + c.w));
      const ny = Math.max(c.y, Math.min(cy, c.y + c.h));
      const dx = cx - nx;
      const dy = cy - ny;
      return dx * dx + dy * dy < r * r;
    });

  const chargeGain = (f: BattleFighter, amt: number) => {
    f.superCharge = Math.min(1, f.superCharge + amt);
  };

  const addFx = (fx: BattleFx) => {
    fxs.current.push(fx);
  };

  const floatText = (x: number, y: number, text: string, color: string) => {
    addFx({ kind: "text", x, y, ttl: 0.9, maxTtl: 0.9, text, color });
  };

  const circleFx = (
    x: number,
    y: number,
    grow: number,
    color: string,
    ttl: number,
  ) => {
    addFx({ kind: "ring", x, y, ttl, maxTtl: ttl, grow, color });
  };

  const burstFx = (
    x: number,
    y: number,
    grow: number,
    color: string,
    ttl: number,
  ) => {
    addFx({ kind: "burst", x, y, ttl, maxTtl: ttl, grow, color });
  };

  /** Spawn a cloud of soft smoke puffs that rise and spread. */
  const smokeFx = (x: number, y: number, count: number, grow = 100) => {
    for (let i = 0; i < count; i++) {
      const life = 0.7 + Math.random() * 0.5;
      addFx({
        kind: "smoke",
        x: x + (Math.random() - 0.5) * 80,
        y: y + (Math.random() - 0.5) * 80,
        ttl: life,
        maxTtl: life,
        grow: grow + Math.random() * 60,
        color: i % 2 === 0 ? "#c9c9c9" : "#b3b3b3",
      });
    }
  };

  const spawnProj = (
    owner: BattleFighter,
    ownerKey: "player" | "bot",
    tx: number,
    ty: number,
    dmg: number,
    opts: { r?: number; pierce?: boolean; speed?: number; explodeR?: number } = {},
  ) => {
    const dx = tx - owner.x;
    const dy = ty - owner.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = opts.speed ?? PROJ_SPEED;
    playSound("shoot", { volume: 0.6 });
    // Spawn just outside the fighter's radius so a shot fired while pressed
    // against a crate/fence is born in free space instead of dying on frame 1.
    const muzzleX = owner.x + (dx / d) * (FIGHTER_R + 6);
    const muzzleY = owner.y + (dy / d) * (FIGHTER_R + 6);
    projs.current.push({
      owner: ownerKey,
      x: muzzleX,
      y: muzzleY,
      vx: (dx / d) * speed,
      vy: (dy / d) * speed,
      dmg,
      r: opts.r ?? 14,
      travelled: 0,
      pierce: opts.pierce ?? false,
      explodeR: opts.explodeR,
    });
  };

  const damageEnemy = (attacker: BattleFighter, target: BattleFighter, dmg: number) => {
    if (target.hp <= 0 || resultRef.current) return;
    target.hp = Math.max(0, target.hp - dmg);
    target.lastHitAt = performance.now();
    // Taking damage in a bush reveals the victim (Brawl-style).
    target.revealUntil = performance.now() + BUSH_REVEAL_MS;
    floatText(target.x, target.y - 130, `-${dmg}`, "#ff6b6b");
    chargeGain(attacker, 0.26);
    chargeGain(target, 0.12);
    // Distinct audio for getting hurt vs. dealing damage.
    if (target === player.current) {
      playSound("hurt", { volume: 0.9, rate: 0.82 + Math.random() * 0.2 });
      playSound("hit", { volume: 0.35, rate: 1.5 });
    } else {
      playSound("hit", { volume: 0.85, rate: 0.95 + Math.random() * 0.25 });
    }
    // GIF-style feedback: arena shake on every hit.
    const arenaEl = arenaRef.current;
    if (arenaEl) {
      arenaEl.classList.remove("battle-shake");
      void arenaEl.getBoundingClientRect();
      arenaEl.classList.add("battle-shake");
    }
    if (target.hp <= 0) {
      burstFx(target.x, target.y - 40, 120, "#ffffff", 0.5);
      smokeFx(target.x, target.y - 40, 9, 150);
      endBattle(attacker === player.current ? "win" : "lose");
    }
  };

  const explodeAt = (pr: BattleProj) => {
    const r = pr.explodeR ?? 130;
    playSound("explode", { volume: 0.9, rate: 0.85 + Math.random() * 0.3 });
    burstFx(pr.x, pr.y, r, "#fdba74", 0.45);
    smokeFx(pr.x, pr.y, 7, 120);
    const target = pr.owner === "player" ? bot.current : player.current;
    const dist = Math.hypot(target.x - pr.x, target.y - pr.y);
    if (dist < r) {
      damageEnemy(
        pr.owner === "player" ? player.current : bot.current,
        target,
        pr.dmg,
      );
    }
  };

  const beamAttack = (f: BattleFighter, enemy: BattleFighter) => {
    const ang = Math.atan2(enemy.y - f.y, enemy.x - f.x);
    const len = 560;
    const ex = f.x + Math.cos(ang) * len;
    const ey = f.y + Math.sin(ang) * len;
    addFx({ kind: "beam", x1: f.x, y1: f.y, x2: ex, y2: ey, ttl: 0.32, maxTtl: 0.32 });
    const dist = Math.hypot(enemy.x - f.x, enemy.y - f.y);
    const a1 = Math.atan2(enemy.y - f.y, enemy.x - f.x);
    let da = Math.abs(a1 - ang);
    if (da > Math.PI) da = Math.PI * 2 - da;
    if (dist < len && da < 0.42) {
      damageEnemy(f, enemy, 300);
    }
  };

  const startDash = (f: BattleFighter, enemy: BattleFighter) => {
    const ang = Math.atan2(enemy.y - f.y, enemy.x - f.x);
    f.dashVX = Math.cos(ang);
    f.dashVY = Math.sin(ang);
    f.dashT = 0.32;
    f.dashHit = false;
    circleFx(f.x, f.y - 40, 60, "#a5f3fc", 0.35);
    circleFx(f.x, f.y - 60, 40, "#e0f2fe", 0.3);
  };

  const fireballAttack = (f: BattleFighter, enemy: BattleFighter) => {
    spawnProj(f, f === player.current ? "player" : "bot", enemy.x, enemy.y, 320, {
      r: 17,
      speed: 400,
      explodeR: 130,
    });
  };

  const useSuper = (f: BattleFighter, enemy: BattleFighter) => {
    f.superCharge = 0;
    playSound("super", { volume: 0.9 });
    smokeFx(f.x, f.y - 20, 4, 80);
    switch (f.ability.id) {
      case "isik":
        beamAttack(f, enemy);
        break;
      case "simsek":
        playSound("dash");
        startDash(f, enemy);
        break;
      case "sifa": {
        const heal = Math.round(f.maxHp * 0.45);
        f.hp = Math.min(f.maxHp, f.hp + heal);
        floatText(f.x, f.y - 135, `+${heal}`, "#4ade80");
        circleFx(f.x, f.y - 40, 70, "#86efac", 0.5);
        circleFx(f.x, f.y - 40, 45, "#bbf7d0", 0.4);
        break;
      }
      case "ates":
        fireballAttack(f, enemy);
        break;
      default: // temel — piercing strong shot
        spawnProj(f, f === player.current ? "player" : "bot", enemy.x, enemy.y, 240, {
          r: 20,
          pierce: true,
          speed: 560,
        });
    }
  };

  const tryAttack = useCallback((aimX?: number, aimY?: number) => {
    const p = player.current;
    const b = bot.current;
    if (
      !startedRef.current ||
      resultRef.current ||
      p.hp <= 0 ||
      p.dashT > 0 ||
      p.atkCd > 0
    )
      return;
    p.atkCd = ATK_CD;
    let tx: number;
    let ty: number;
    const aimMag = Math.hypot(aimX ?? 0, aimY ?? 0);
    if (aimMag > 0.15) {
      // aimed shot — fire along the dragged joystick direction
      tx = p.x + (aimX! / aimMag) * 120;
      ty = p.y + (aimY! / aimMag) * 120;
    } else {
      // no drag (or keyboard) — auto-aim at the enemy. A fighter hiding in
      // a bush cannot be auto-locked (Brawl-style).
      if (isHiddenFrom(b, p)) return;
      tx = b.x;
      ty = b.y - 40;
    }
    p.facing = tx >= p.x ? 1 : -1;
    spawnProj(p, "player", tx, ty, BASE_DMG);
    // Firing (even from a bush) reveals the shooter for a moment.
    p.revealUntil = performance.now() + BUSH_REVEAL_MS;
  }, []);

  const trySuper = useCallback(() => {
    const p = player.current;
    const b = bot.current;
    if (
      !startedRef.current ||
      resultRef.current ||
      p.hp <= 0 ||
      p.dashT > 0 ||
      p.superCharge < 1
    )
      return;
    // Targeted supers cannot lock a fighter hiding in a bush (heal is fine).
    if (p.ability.id !== "sifa" && isHiddenFrom(b, p)) return;
    useSuper(p, b);
    // Using an ability inside a bush reveals the caster for a moment.
    p.revealUntil = performance.now() + BUSH_REVEAL_MS;
  }, []);

  const moveFighter = (f: BattleFighter, dx: number, dy: number, dt: number) => {
    let moved = false;
    let nx = clamp(f.x + dx, 40, ARENA_W - 40);
    if (!hitsObstacle(nx, f.y, FIGHTER_R)) {
      f.x = nx;
      moved = Math.abs(dx) > 0.01;
    }
    let ny = clamp(f.y + dy, 40, ARENA_H - 40);
    if (!hitsObstacle(f.x, ny, FIGHTER_R)) {
      f.y = ny;
      moved = moved || Math.abs(dy) > 0.01;
    }
    if (Math.abs(dx) > 0.01) f.facing = dx > 0 ? 1 : -1;
    f.moving = Math.hypot(dx, dy) > 0.5;
    // Track vertical direction for body facing (up/down pose)
    if (f.moving) {
      if (Math.abs(dy) > Math.abs(dx)) f.vy = dy > 0 ? 1 : -1;
      else f.vy = 0; // horizontal movement
    } else {
      f.vy = 0;
    }
    if (f.moving) f.phase += dt * 10;
  };

  const endBattle = (win: "win" | "lose") => {
    if (resultRef.current) return;
    resultRef.current = win;
    setResult(win);
    stopBattleAmbience();
    playSound(win === "win" ? "win" : "lose");
  };

  // ---- main loop ----
  useEffect(() => {
    startBattleAmbience();
    let superReadyPlayed = false;
    let stepAcc = 0;
    let botStepAcc = 0;
    // Bush stealth: where the bot last saw the player, plus patrol waypoints
    // used while the player is hidden so the bot keeps hunting (no sight
    // through bushes).
    let lastSeenX = 420;
    let lastSeenY = 180;
    let patrolT = 0;
    let patrolX = 850;
    let patrolY = 550;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Space",
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
        ].includes(e.code)
      ) {
        e.preventDefault();
      }
      keysRef.current.add(e.code);
      if (e.code === "Space" || e.code === "Enter") {
        aimRef.current.active = true;
        actionsRef.current.attack();
      }
      if (e.code === "KeyE" || e.code === "ShiftLeft" || e.code === "ShiftRight")
        actionsRef.current.super();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
      if (e.code === "Space" || e.code === "Enter") aimRef.current.active = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    actionsRef.current = {
      attack: tryAttack,
      super: trySuper,
      click: (x: number, y: number) => {
        clickTargetRef.current = { x, y };
      },
    };

    let raf = 0;
    let last = performance.now();

    const step = (dt: number) => {
      const p = player.current;
      const b = bot.current;
      // freeze the simulation until the loading sequence finishes
      if (!startedRef.current || resultRef.current) return;

      p.atkCd = Math.max(0, p.atkCd - dt);
      b.atkCd = Math.max(0, b.atkCd - dt);

      // Run-and-gun: keep firing while the attack button is held (or Space
      // is down) so you can shoot while walking with the joystick. The shot
      // follows the dragged aim direction; zero means auto-aim.
      if (aimRef.current.active && p.atkCd <= 0) {
        tryAttack(aimRef.current.dx, aimRef.current.dy);
      }

      // --- player movement (keys + click target) ---
      let vx = 0;
      let vy = 0;
      const keys = keysRef.current;
      if (keys.has("ArrowLeft") || keys.has("KeyA")) vx -= 1;
      if (keys.has("ArrowRight") || keys.has("KeyD")) vx += 1;
      if (keys.has("ArrowUp") || keys.has("KeyW")) vy -= 1;
      if (keys.has("ArrowDown") || keys.has("KeyS")) vy += 1;
      if (vx !== 0 || vy !== 0) {
        // Cardinal-only: clamp to dominant axis (no diagonal)
        if (vx !== 0 && vy !== 0) {
          if (Math.abs(vx) >= Math.abs(vy)) vy = 0;
          else vx = 0;
        }
        clickTargetRef.current = null;
      } else {
        // virtual joystick (mobile) — live direction while dragging
        const jx = joystickRef.current.x;
        const jy = joystickRef.current.y;
        if (Math.abs(jx) > 0.1 || Math.abs(jy) > 0.1) {
          // Keep the joystick's screen-space axes intact: right is +X and
          // down is +Y in the arena coordinate system. The previous code
          // inverted vertical input, which made down move up and also made
          // left/right feel inconsistent after axis selection.
          if (Math.abs(jx) >= Math.abs(jy)) {
            vx = jx;
            vy = 0;
          } else {
            vx = 0;
            vy = jy;
          }
          clickTargetRef.current = null;
        }
      }
      if (vx === 0 && vy === 0 && clickTargetRef.current) {
        const dx = clickTargetRef.current.x - p.x;
        const dy = clickTargetRef.current.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 24) clickTargetRef.current = null;
        else {
          // Cardinal-only: move along dominant axis
          if (Math.abs(dx) >= Math.abs(dy)) { vx = dx > 0 ? 1 : -1; vy = 0; }
          else { vx = 0; vy = dy > 0 ? 1 : -1; }
        }
      }
      if (p.dashT > 0) {
        p.dashT -= dt;
        moveFighter(p, p.dashVX * 820 * dt, p.dashVY * 820 * dt, dt);
        if (!p.dashHit && Math.hypot(b.x - p.x, b.y - p.y) < 90) {
          p.dashHit = true;
          damageEnemy(p, b, 200);
        }
        if (p.dashT <= 0) p.dashHit = false;
      } else {
        moveFighter(p, vx * 90 * dt, vy * 90 * dt, dt);
      }

      // --- footstep ticks while walking (continuous battle audio) ---
      if (p.moving && p.dashT <= 0) {
        stepAcc += dt;
        if (stepAcc > 0.3) {
          stepAcc = 0;
          playSound("step", {
            volume: 0.16,
            rate: 0.8 + Math.random() * 0.5,
          });
          smokeFx(p.x, p.y - 6, 2, 20); // footstep dust
        }
      } else {
        stepAcc = 0;
      }
      if (b.moving && b.dashT <= 0) {
        botStepAcc += dt;
        if (botStepAcc > 0.34) {
          botStepAcc = 0;
          playSound("step", { volume: 0.08, rate: 0.7 + Math.random() * 0.4 });
          smokeFx(b.x, b.y - 6, 2, 20); // footstep dust
        }
      } else {
        botStepAcc = 0;
      }

      // --- bot AI ---
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const dist = Math.hypot(dx, dy) || 1;
      // Bush stealth: the bot can only see/engage the player while the
      // player is outside a bush, revealed (attacked / hit recently), or
      // standing in the same bush as the bot.
      const botCanSee = !isHiddenFrom(p, b);
      if (botCanSee) {
        lastSeenX = p.x;
        lastSeenY = p.y;
      }
      if (b.dashT > 0) {
        b.dashT -= dt;
        moveFighter(b, b.dashVX * 820 * dt, b.dashVY * 820 * dt, dt);
        if (!b.dashHit && Math.hypot(p.x - b.x, p.y - b.y) < 90) {
          b.dashHit = true;
          damageEnemy(b, p, 200);
        }
        if (b.dashT <= 0) b.dashHit = false;
      } else {
        const levelT = botLevelT(b.level);
        let mx = 0;
        let my = 0;
        if (!botCanSee) {
          // Player vanished into a bush — cruise to the last known spot,
          // then patrol nearby waypoints so the bot keeps hunting instead of
          // standing still (it gets no sight through the bush).
          const ldx = lastSeenX - b.x;
          const ldy = lastSeenY - b.y;
          const ld = Math.hypot(ldx, ldy) || 1;
          if (ld < 90) {
            patrolT -= dt;
            if (patrolT <= 0) {
              patrolT = 0.7 + Math.random() * 1.3;
              const pa = Math.random() * Math.PI * 2;
              const prr = 150 + Math.random() * 280;
              patrolX = clamp(b.x + Math.cos(pa) * prr, 60, ARENA_W - 60);
              patrolY = clamp(b.y + Math.sin(pa) * prr, 60, ARENA_H - 60);
            }
            const pdx = patrolX - b.x;
            const pdy = patrolY - b.y;
            const pd = Math.hypot(pdx, pdy) || 1;
            mx = pdx / pd;
            my = pdy / pd;
          } else {
            mx = ldx / ld;
            my = ldy / ld;
          }
        } else if (dist > 340) {
          mx = dx / dist;
          my = dy / dist;
        } else if (dist < 200) {
          mx = -dx / dist;
          my = -dy / dist;
        } else {
          mx = dy / dist;
          my = -dx / dist;
        }
        // Higher-level bots weave: add a slow perpendicular sway so they are
        // harder to hit while still closing or holding range.
        if (levelT > 0 && botCanSee) {
          const sway = Math.sin(performance.now() / 900 + b.phase) * levelT * 0.55;
          mx += (dy / dist) * sway;
          my += (-dx / dist) * sway;
        }
        const speed = 90 * botSpeedMul(b.level);
        const beforeX = b.x;
        const beforeY = b.y;
        // Try the natural vector first; diagonal motion lets the bot slide
        // around corners instead of repeatedly colliding on one cardinal axis.
        moveFighter(b, mx * speed * dt, my * speed * dt, dt);
        // Stuck detection: if the bot covered far less ground than expected
        // (even partially blocked), accumulate a stuck timer. This catches the
        // "grinding along a wall" case that zero-displacement checks miss.
        const expected = speed * dt;
        if (Math.hypot(b.x - beforeX, b.y - beforeY) < expected * 0.35) {
          b.stuckT = (b.stuckT ?? 0) + dt;
        } else {
          b.stuckT = 0;
        }
        if (b.stuckT > 0.12) {
          // Unblock: sweep the desired direction in 45° steps on both sides
          // until the bot can actually move again, so it never stays pinned
          // against an obstacle (and never stops firing because of it).
          b.unblockDir = b.unblockDir ?? (Math.random() < 0.5 ? 1 : -1);
          const unblockDir: number = b.unblockDir;
          const base = Math.atan2(dy, dx);
          let escaped = false;
          for (let side = 0; side < 2 && !escaped; side++) {
            const sign: number = side === 0 ? unblockDir : -unblockDir;
            for (let a = 1; a <= 4 && !escaped; a++) {
              const ang = base + sign * a * (Math.PI / 4);
              const tx = b.x;
              const ty = b.y;
              moveFighter(
                b,
                Math.cos(ang) * speed * dt,
                Math.sin(ang) * speed * dt,
                dt,
              );
              if (Math.hypot(b.x - tx, b.y - ty) > expected * 0.3) {
                escaped = true;
                b.unblockDir = sign;
              } else {
                b.x = tx;
                b.y = ty;
              }
            }
          }
          // Absolute last resort: slide the bot slightly sideways so it can
          // never remain stuck forever — but only into FREE space. Never
          // teleport onto or through an obstacle.
          if (!escaped) {
            const ang = base + (Math.PI / 2) * unblockDir;
            const sx = clamp(b.x + Math.cos(ang) * expected * 2, 40, ARENA_W - 40);
            const sy = clamp(b.y + Math.sin(ang) * expected * 2, 40, ARENA_H - 40);
            if (!hitsObstacle(sx, sy, FIGHTER_R)) {
              b.x = sx;
              b.y = sy;
            }
          }
          b.stuckT = 0;
        }
        b.facing = (botCanSee ? dx : mx) > 0 ? 1 : -1;
      }

      // The shot check runs every frame, outside the movement/dash branches,
      // so nothing (stuck sweep, dash, strafe) can interrupt the stream of
      // bullets. The one exception: a player hiding in a bush cannot be
      // engaged at all — bots stop tracking AND firing while the target is
      // hidden, and resume the instant it is revealed again.
      if (b.atkCd <= 0 && botCanSee) {
        b.atkCd = botFireInterval(b.level);
        // Aim jitter shrinks with level — low levels genuinely miss.
        const err = (Math.random() - 0.5) * 2 * botAimError(b.level);
        spawnProj(
          b,
          "bot",
          p.x + Math.cos(Math.atan2(dy, dx) + err) * 60,
          p.y + Math.sin(Math.atan2(dy, dx) + err) * 60,
          BASE_DMG,
        );
        // Shooting (even from a bush) reveals the shooter for a moment.
        b.revealUntil = performance.now() + BUSH_REVEAL_MS;
        // Higher-level bots strafe after firing, so they are harder to
        // punish while still shooting.
        if (Math.random() < botStrafeChance(b.level)) {
          b.strafeDir = (b.strafeDir ?? (Math.random() < 0.5 ? 1 : -1)) * -1;
          const sx = (dy / dist) * b.strafeDir;
          const sy = (-dx / dist) * b.strafeDir;
          moveFighter(b, sx * 70 * dt, sy * 70 * dt, dt);
        }
      }

      // Bot super: passively charges quickly over time (faster at higher
      // levels) on top of the charge earned by dealing damage, and it fires
      // the ult the instant the bar is full — no range gate, no waiting.
      b.superCharge = Math.min(
        1,
        b.superCharge + dt * (0.15 + 0.15 * botLevelT(b.level)),
      );
      // The ult fires the moment the bar is full — unless the target hides
      // in a bush (self-heal is fine anywhere). Using it reveals the bot.
      if (b.superCharge >= 1 && (b.ability.id === "sifa" || botCanSee)) {
        useSuper(b, p);
        b.revealUntil = performance.now() + BUSH_REVEAL_MS;
      }

      // --- projectiles ---
      for (let i = projs.current.length - 1; i >= 0; i--) {
        const pr = projs.current[i];
        pr.travelled += Math.hypot(pr.vx, pr.vy) * dt;
        const nx = pr.x + pr.vx * dt;
        const ny = pr.y + pr.vy * dt;
        if (hitsObstacle(nx, ny, pr.r)) {
          // ALL projectiles smack into obstacles (player and bot alike) —
          // little thud + sparks. Bots compensate by keeping their unblock
          // sweep going, so they reposition instead of relying on shots
          // passing through cover.
          playSound("thud", { volume: 0.3, rate: 0.7 + Math.random() * 0.4 });
          burstFx(nx, ny, 55, "#d9c29a", 0.3);
          projs.current.splice(i, 1);
          continue;
        }
        pr.x = nx;
        pr.y = ny;
        const target = pr.owner === "player" ? bot.current : player.current;
        const hitDist = Math.hypot(target.x - pr.x, target.y - pr.y);
        if (hitDist < pr.r + FIGHTER_R) {
          if (pr.explodeR) {
            explodeAt(pr);
          } else {
            damageEnemy(
              pr.owner === "player" ? player.current : bot.current,
              target,
              pr.dmg,
            );
          }
          if (!pr.pierce) {
            projs.current.splice(i, 1);
            continue;
          }
        }
        if (pr.explodeR && pr.travelled >= 720) {
          explodeAt(pr);
          projs.current.splice(i, 1);
        } else if (pr.travelled >= PROJ_RANGE && !pr.explodeR) {
          projs.current.splice(i, 1);
        }
      }

      // --- one-shot effects ---
      for (let i = fxs.current.length - 1; i >= 0; i--) {
        fxs.current[i].ttl -= dt;
        if (fxs.current[i].ttl <= 0) fxs.current.splice(i, 1);
      }

      // --- super ready jingle (fires once when the bar fills) ---
      if (p.superCharge >= 1 && !superReadyPlayed) {
        superReadyPlayed = true;
        playSound("whoosh", { volume: 0.65 });
      } else if (p.superCharge < 1) {
        superReadyPlayed = false;
      }

      // --- HUD (React, only when values changed) ---
      const ph = Math.round(p.hp / 5) * 5;
      const ohp = Math.round(b.hp / 5) * 5;
      const pc = Math.round(p.superCharge * 20) / 20;
      const oc = Math.round(b.superCharge * 20) / 20;
      const atkReady = p.atkCd <= 0;
      const lh = lastHudRef.current;
      if (
        ph !== lh.ph ||
        ohp !== lh.ohp ||
        pc !== lh.pc ||
        oc !== lh.oc ||
        atkReady !== lh.atkReady
      ) {
        lastHudRef.current = { ph, ohp, pc, oc, atkReady };
        setHud({ ph, ohp, pc, oc, atkReady });
      }
    };

    const loop = (now: number) => {
      try {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        step(dt);
      } catch (err) {
        console.error("Savaş döngüsü hatası:", err);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      stopBattleAmbience();
    };
  }, [tryAttack, trySuper]);

  const abilityEmoji = abilityOf(playerAbility).emoji;
  const oppAbilityEmoji = abilityOf(opponentAbility).emoji;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-4">
      <div className="relative flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-3xl border-4 border-[#3d2f2a]/40 bg-[#1b2233] shadow-2xl">
        {/* HUD top — compact strip: HP bars and names now float above each
            fighter's head inside the arena (world-space UI) */}
        <div className="flex shrink-0 items-center justify-between gap-2 bg-gradient-to-r from-[#232b40] to-[#2a3350] px-3 py-2 text-white">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-500/25 text-sm font-extrabold">
              {playerName.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex items-center gap-1 text-[11px] font-extrabold text-sky-300">
              <Zap className="size-3.5" />
              {Math.round(hud.pc * 100)}%
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-extrabold">
              <Swords className="size-3.5" /> SAVAŞ
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Savaşı bırak"
              onClick={() => onExitRef.current(false)}
              className="text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex min-w-0 items-center justify-end gap-2">
            <div className="hidden items-center gap-1 text-[11px] font-extrabold text-rose-300 sm:flex">
              <Zap className="size-3.5" />
              {Math.round(hud.oc * 100)}%
            </div>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rose-500/25 text-sm font-extrabold">
              {opponentName.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </div>

        {/* arena — 3D scene */}
        <main
          ref={arenaRef}
          className="relative min-h-0 flex-1 touch-none overflow-hidden"
        >
          {/* 3D arena with the rigged GLB characters; falls back to the
              2D SVG arena if WebGL/3D rendering is unavailable */}
          <ArenaBoundary
            fallback={
              <FallbackArena2D
                playerRef={player}
                botRef={bot}
                projsRef={projs}
                fxsRef={fxs}
                aimRef={aimRef}
                onWorldClick={(x, y) => actionsRef.current.click(x, y)}
              />
            }
          >
            <Arena3D
              playerRef={player}
              botRef={bot}
              projsRef={projs}
              fxsRef={fxs}
              aimRef={aimRef}
              onWorldClick={(x, y) => actionsRef.current.click(x, y)}
            />
          </ArenaBoundary>

          {/* cinematic vignette — pulls the eye to the action */}
          <div className="arena-vignette pointer-events-none absolute inset-0 z-[6]" />

          {/* animated VS intro banner — GIF-style entrance */}
          {vsShow && phase === "fight" && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="vs-banner flex flex-col items-center gap-2 rounded-3xl border-4 border-yellow-300/80 bg-[#151b2e]/85 px-10 py-6 text-center text-white shadow-2xl">
                <span className="text-5xl font-black tracking-widest text-yellow-300">
                  ⚔️ VS ⚔️
                </span>
                <span className="text-sm font-extrabold">
                  {playerName} vs {opponentName}
                </span>
              </div>
            </div>
          )}

          {/* gaming-style loading screen on entry */}
          <AnimatePresence>
            {phase === "loading" && (
              <BattleLoading
                playerName={playerName}
                playerAbility={abilityEmoji}
                opponentName={opponentName}
                opponentAbility={oppAbilityEmoji}
                pct={loadPct}
                step={loadStep}
              />
            )}
          </AnimatePresence>

          {/* controls */}
          {/* virtual joystick — drag to move (works with mouse + touch) */}
          <BattleJoystick stickRef={joystickRef} />

          <div className="pointer-events-none absolute right-3 bottom-3 z-10 flex flex-col items-end gap-2">
            <button
              type="button"
              onPointerDown={(e) => {
                // Fire instantly (even while holding the joystick) instead of
                // waiting for a click, and never let the tap fall through to
                // the arena's tap-to-move plane.
                e.stopPropagation();
                e.preventDefault();
                actionsRef.current.super();
              }}
              aria-label="Süper yetenek"
              className={`pointer-events-auto flex size-16 items-center justify-center rounded-full border-4 shadow-xl transition-transform active:scale-90 ${
                hud.pc >= 1
                  ? "super-ready border-yellow-300 bg-gradient-to-br from-yellow-400 to-amber-500 text-amber-950"
                  : "border-white/30 bg-white/10 text-white/70"
              }`}
            >
              <span className="text-2xl font-extrabold">
                {hud.pc >= 1 ? abilityEmoji : Math.round(hud.pc * 100) + "%"}
              </span>
            </button>
            <button
              type="button"
              onPointerDown={(e) => {
                // Press the attack button, then drag to aim (Brawl Stars
                // style): the aim guide follows your finger and releasing
                // fires in that direction. Holding still keeps firing on
                // cooldown so you can shoot while walking with the joystick.
                e.stopPropagation();
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                aimRef.current = { active: true, dx: 0, dy: 0 };
                setAttackHeld(true);
                if (attackKnobRef.current)
                  attackKnobRef.current.style.transform = "translate(0px, 0px)";
              }}
              onPointerMove={(e) => {
                if (!aimRef.current.active) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                let dx = e.clientX - cx;
                let dy = e.clientY - cy;
                const d = Math.hypot(dx, dy);
                const R = 42;
                if (d > R) {
                  dx = (dx / d) * R;
                  dy = (dy / d) * R;
                }
                aimRef.current.dx = dx / R;
                aimRef.current.dy = dy / R;
                // turn the fighter toward the aim direction so the
                // direction is obvious while aiming
                if (Math.abs(aimRef.current.dx) > 0.2) {
                  player.current.facing = aimRef.current.dx >= 0 ? 1 : -1;
                }
                if (attackKnobRef.current)
                  attackKnobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
              }}
              onPointerUp={() => {
                // release — fire the aimed (or auto-aimed) shot
                tryAttack(aimRef.current.dx, aimRef.current.dy);
                aimRef.current = { active: false, dx: 0, dy: 0 };
                setAttackHeld(false);
                if (attackKnobRef.current)
                  attackKnobRef.current.style.transform = "translate(0px, 0px)";
              }}
              onPointerCancel={() => {
                aimRef.current = { active: false, dx: 0, dy: 0 };
                setAttackHeld(false);
                if (attackKnobRef.current)
                  attackKnobRef.current.style.transform = "translate(0px, 0px)";
              }}
              onLostPointerCapture={() => {
                aimRef.current = { active: false, dx: 0, dy: 0 };
                setAttackHeld(false);
                if (attackKnobRef.current)
                  attackKnobRef.current.style.transform = "translate(0px, 0px)";
              }}
              aria-label="Saldır — basılı tut ve sürükle: nişan al"
              className={`pointer-events-auto relative flex size-20 touch-none items-center justify-center overflow-visible rounded-full border-4 border-white/70 text-3xl text-white shadow-xl transition-all duration-150 ${
                attackHeld
                  ? "scale-90 border-yellow-200 bg-gradient-to-br from-sky-300 to-blue-500 shadow-[0_0_28px_rgba(56,189,248,0.85)]"
                  : "bg-gradient-to-br from-sky-400 to-blue-600 active:scale-90"
              }`}
            >
              💥
              {/* aim knob — slides in the dragged direction */}
              <span
                ref={attackKnobRef}
                className="pointer-events-none absolute top-1/2 left-1/2 -ml-3.5 -mt-3.5 flex size-7 items-center justify-center rounded-full border-2 border-white bg-white/85 text-[10px] shadow-lg"
              >
                🎯
              </span>
            </button>
            <span className="rounded-full bg-black/45 px-2 py-0.5 text-[9px] font-extrabold tracking-wide text-white/85">
              BAS → SÜRÜKLE → NİŞAN AL
            </span>
          </div>
        </main>

        {/* result screen */}
        <AnimatePresence>
          {result !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            >
              {result === "win" && (
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  {["🎉", "⭐", "✨", "🎊", "💛", "🌟"].map((e, i) => (
                    <span
                      key={i}
                      className="confetti text-2xl"
                      style={{
                        left: `${6 + i * 15}%`,
                        animationDuration: `${2.4 + (i % 3) * 0.7}s`,
                        animationDelay: `${i * 0.22}s`,
                      }}
                    >
                      {e}
                    </span>
                  ))}
                </div>
              )}
              <motion.div
                initial={{ scale: 0.85, opacity: 0, y: 16 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                className="w-full max-w-sm rounded-3xl border-2 border-white/20 bg-[#151b2e] p-8 text-center text-white shadow-2xl"
              >
                <div className="text-6xl">{result === "win" ? "🏆" : "💀"}</div>
                <h2 className="mt-3 text-2xl font-extrabold">
                  {result === "win" ? "Zafer!" : "Yenildin"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {result === "win"
                    ? `${opponentName} yere serildi! Kazanç hesabına yüklendi (+150 SP).`
                    : `${opponentName} seni yendi. Tekrar dene — yeteneklerini mağazadan güçlendirebilirsin!`}
                </p>
                <Button
                  className="mt-6 w-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-base font-extrabold text-white shadow-lg hover:from-indigo-400 hover:to-fuchsia-400"
                  onClick={() => onExitRef.current(result === "win")}
                >
                  <Trophy className="size-4" /> Caddeye Dön
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
