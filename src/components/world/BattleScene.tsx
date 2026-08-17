// ⚔️ Brawl-styled duel arena — two fighters, HP bars, projectiles and supers.
// The whole simulation runs on a rAF loop mutating plain refs (no React
// re-renders); the Arena3D component reads those refs every frame and draws
// the scene in 3D (Three.js). React only renders the HUD, controls and the
// result screen.
import { Button } from "@/components/ui/button";
import {
  Arena3D,
  BATTLE_OBSTACLES,
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
const ATK_CD = 0.85;
const PROJ_SPEED = 620;
const PROJ_RANGE = 660;
const FIGHTER_R = 22;

function newFighter(
  name: string,
  config: AvatarConfig,
  equipped: string[],
  abilityId: string,
  x: number,
  y: number,
  facing: number,
): BattleFighter {
  return {
    name,
    config,
    equipped,
    ability: abilityOf(abilityId),
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
  };
}

/** Virtual joystick — drag anywhere on it to move (works with mouse + touch). */
function BattleJoystick({
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

export default function BattleScene({
  playerName,
  playerConfig,
  playerEquipped,
  playerAbility,
  opponentName,
  opponentConfig,
  opponentEquipped,
  opponentAbility,
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
  onExit: (victory: boolean) => void;
}) {
  const arenaRef = useRef<HTMLElement>(null);
  // The joystick's live direction vector.
  const joystickRef = useRef({ x: 0, y: 0 });

  const keysRef = useRef(new Set<string>());
  const clickTargetRef = useRef<{ x: number; y: number } | null>(null);
  const projs = useRef<BattleProj[]>([]);
  const fxs = useRef<BattleFx[]>([]);
  const resultRef = useRef<"win" | "lose" | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const player = useRef<BattleFighter>(
    newFighter(playerName, playerConfig, playerEquipped, playerAbility, 420, 180, 1),
  );
  const bot = useRef<BattleFighter>(
    newFighter(opponentName, opponentConfig, opponentEquipped, opponentAbility, 1280, 920, -1),
  );
  bot.current.atkCd = 1;

  const webglOk = useMemo(() => supportsWebGL(), []);

  const [result, setResult] = useState<"win" | "lose" | null>(null);
  const [vsShow, setVsShow] = useState(true);
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

  // Animated VS banner plays once on entry, then disappears.
  useEffect(() => {
    const t = window.setTimeout(() => setVsShow(false), 1700);
    return () => window.clearTimeout(t);
  }, []);

  const clamp = (v: number, a: number, b: number) =>
    Math.min(Math.max(v, a), b);

  const hitsObstacle = (cx: number, cy: number, r: number) =>
    BATTLE_OBSTACLES.some((c) => {
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
    projs.current.push({
      owner: ownerKey,
      x: owner.x,
      y: owner.y,
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

  const tryAttack = useCallback(() => {
    const p = player.current;
    const b = bot.current;
    if (resultRef.current || p.hp <= 0 || p.dashT > 0 || p.atkCd > 0) return;
    p.atkCd = ATK_CD;
    p.facing = b.x >= p.x ? 1 : -1;
    spawnProj(p, "player", b.x, b.y - 40, BASE_DMG);
  }, []);

  const trySuper = useCallback(() => {
    const p = player.current;
    const b = bot.current;
    if (resultRef.current || p.hp <= 0 || p.dashT > 0 || p.superCharge < 1) return;
    useSuper(p, b);
  }, []);

  const moveFighter = (f: BattleFighter, dx: number, dy: number, dt: number) => {
    let nx = clamp(f.x + dx, 40, ARENA_W - 40);
    if (!hitsObstacle(nx, f.y, FIGHTER_R)) f.x = nx;
    let ny = clamp(f.y + dy, 40, ARENA_H - 40);
    if (!hitsObstacle(f.x, ny, FIGHTER_R)) f.y = ny;
    if (Math.abs(dx) > 0.01) f.facing = dx > 0 ? 1 : -1;
    f.moving = Math.hypot(dx, dy) > 0.5;
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
    playSound("vs");
    startBattleAmbience();
    let superReadyPlayed = false;
    let stepAcc = 0;
    let botStepAcc = 0;
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
      if (e.code === "Space" || e.code === "Enter") actionsRef.current.attack();
      if (e.code === "KeyE" || e.code === "ShiftLeft" || e.code === "ShiftRight")
        actionsRef.current.super();
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
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
      if (resultRef.current) return;

      p.atkCd = Math.max(0, p.atkCd - dt);
      b.atkCd = Math.max(0, b.atkCd - dt);

      // --- player movement (keys + click target) ---
      let vx = 0;
      let vy = 0;
      const keys = keysRef.current;
      if (keys.has("ArrowLeft") || keys.has("KeyA")) vx -= 1;
      if (keys.has("ArrowRight") || keys.has("KeyD")) vx += 1;
      if (keys.has("ArrowUp") || keys.has("KeyW")) vy -= 1;
      if (keys.has("ArrowDown") || keys.has("KeyS")) vy += 1;
      if (vx !== 0 || vy !== 0) {
        const l = Math.hypot(vx, vy);
        vx /= l;
        vy /= l;
        clickTargetRef.current = null;
      } else {
        // virtual joystick (mobile) — live direction while dragging
        const jx = joystickRef.current.x;
        const jy = joystickRef.current.y;
        if (Math.abs(jx) > 0.1 || Math.abs(jy) > 0.1) {
          vx = jx;
          vy = jy;
          clickTargetRef.current = null;
        }
      }
      if (vx === 0 && vy === 0 && clickTargetRef.current) {
        const dx = clickTargetRef.current.x - p.x;
        const dy = clickTargetRef.current.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 24) clickTargetRef.current = null;
        else {
          vx = dx / d;
          vy = dy / d;
        }
      }
      if (p.dashT > 0) {
        p.dashT -= dt;
        moveFighter(p, p.dashVX * 950 * dt, p.dashVY * 950 * dt, dt);
        if (!p.dashHit && Math.hypot(b.x - p.x, b.y - p.y) < 90) {
          p.dashHit = true;
          damageEnemy(p, b, 200);
        }
        if (p.dashT <= 0) p.dashHit = false;
      } else {
        moveFighter(p, vx * 300 * dt, vy * 300 * dt, dt);
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
      if (b.dashT > 0) {
        b.dashT -= dt;
        moveFighter(b, b.dashVX * 950 * dt, b.dashVY * 950 * dt, dt);
        if (!b.dashHit && Math.hypot(p.x - b.x, p.y - b.y) < 90) {
          b.dashHit = true;
          damageEnemy(b, p, 200);
        }
        if (b.dashT <= 0) b.dashHit = false;
      } else {
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        const dist = Math.hypot(dx, dy) || 1;
        let mx = 0;
        let my = 0;
        if (dist > 340) {
          mx = dx / dist;
          my = dy / dist;
        } else if (dist < 200) {
          mx = -dx / dist;
          my = -dy / dist;
        } else {
          mx = dy / dist;
          my = -dx / dist;
        }
        moveFighter(b, mx * 190 * dt, my * 190 * dt, dt);
        b.facing = dx > 0 ? 1 : -1;
        if (b.atkCd <= 0 && dist < 640) {
          b.atkCd = 1.05;
          const err = (Math.random() - 0.5) * 0.16;
          spawnProj(
            b,
            "bot",
            p.x + Math.cos(Math.atan2(dy, dx) + err) * 60,
            p.y + Math.sin(Math.atan2(dy, dx) + err) * 60,
            BASE_DMG,
          );
        }
        if (b.superCharge >= 1 && dist < 680) {
          useSuper(b, p);
        }
      }

      // --- projectiles ---
      for (let i = projs.current.length - 1; i >= 0; i--) {
        const pr = projs.current[i];
        pr.travelled += Math.hypot(pr.vx, pr.vy) * dt;
        const nx = pr.x + pr.vx * dt;
        const ny = pr.y + pr.vy * dt;
        if (hitsObstacle(nx, ny, pr.r)) {
          // projectiles smack into obstacles — little thud + sparks
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
        {/* HUD top */}
        <div className="flex shrink-0 items-center justify-between gap-2 bg-gradient-to-r from-[#232b40] to-[#2a3350] px-3 py-2 text-white">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-500/25 text-sm font-extrabold">
              {playerName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-sm font-extrabold">
                <span className="truncate">{playerName}</span>
                <span className="text-[10px]">{abilityEmoji}</span>
              </p>
              <div className="mt-1 h-2.5 w-16 overflow-hidden rounded-full bg-white/15 min-[420px]:w-28 sm:w-44">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-400 transition-all"
                  style={{ width: `${(hud.ph / HP) * 100}%` }}
                />
              </div>
            </div>
            <div className="ml-1 hidden items-center gap-1 text-[11px] font-extrabold text-sky-300 sm:flex">
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
            <div className="min-w-0 text-right">
              <p className="flex items-center justify-end gap-1 text-sm font-extrabold">
                <span className="text-[10px]">{oppAbilityEmoji}</span>
                <span className="truncate">{opponentName}</span>
              </p>
              <div className="mt-1 ml-auto h-2.5 w-16 overflow-hidden rounded-full bg-white/15 min-[420px]:w-28 sm:w-44">
                <div
                  className="ml-auto h-full rounded-full bg-gradient-to-r from-rose-400 to-red-500 transition-all"
                  style={{ width: `${(hud.ohp / HP) * 100}%` }}
                />
              </div>
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
          {webglOk ? (
            <ArenaBoundary
              fallback={
                <FallbackArena2D
                  playerRef={player}
                  botRef={bot}
                  projsRef={projs}
                  fxsRef={fxs}
                  onWorldClick={(x, y) => actionsRef.current.click(x, y)}
                />
              }
            >
              <Arena3D
                playerRef={player}
                botRef={bot}
                projsRef={projs}
                fxsRef={fxs}
                onWorldClick={(x, y) => actionsRef.current.click(x, y)}
              />
            </ArenaBoundary>
          ) : (
            <FallbackArena2D
              playerRef={player}
              botRef={bot}
              projsRef={projs}
              fxsRef={fxs}
              onWorldClick={(x, y) => actionsRef.current.click(x, y)}
            />
          )}

          {/* cinematic vignette — pulls the eye to the action */}
          <div className="arena-vignette pointer-events-none absolute inset-0 z-[6]" />

          {/* animated VS intro banner — GIF-style entrance */}
          {vsShow && (
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

          {/* controls */}
          {/* virtual joystick — drag to move (works with mouse + touch) */}
          <BattleJoystick stickRef={joystickRef} />

          <div className="pointer-events-none absolute right-3 bottom-3 z-10 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => actionsRef.current.super()}
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
              onClick={() => actionsRef.current.attack()}
              aria-label="Saldır"
              className="pointer-events-auto flex size-20 items-center justify-center rounded-full border-4 border-white/70 bg-gradient-to-br from-sky-400 to-blue-600 text-3xl text-white shadow-xl transition-transform active:scale-90"
            >
              💥
            </button>
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
