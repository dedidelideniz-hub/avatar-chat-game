// ⚔️ Brawl-styled duel arena — two fighters, HP bars, projectiles and supers.
// The whole simulation runs on a rAF loop mutating SVG directly; React only
// renders the static arena, the HUD (updated a few times per second) and the
// result screen.
import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { EquippedItems } from "@/components/avatar/EquippedItems";
import { Button } from "@/components/ui/button";
import type { AvatarConfig } from "@/lib/avatar";
import { abilityOf, type AbilityDef } from "@/lib/shop";
import { AnimatePresence, motion } from "framer-motion";
import { Swords, Trophy, X, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const ARENA_W = 1400;
const ARENA_H = 800;
const HP = 1000;
const BASE_DMG = 120;
const ATK_CD = 0.85;
const PROJ_SPEED = 620;
const PROJ_RANGE = 660;
const FIGHTER_R = 22;
const CHAR_W = 70;
const CHAR_H = 96;

/** Arena obstacles — crates that block movement and projectiles. */
const CRATES = [
  { x: 300, y: 270, w: 120, h: 120 },
  { x: 980, y: 270, w: 120, h: 120 },
  { x: 300, y: 560, w: 120, h: 120 },
  { x: 980, y: 560, w: 120, h: 120 },
  { x: 640, y: 400, w: 120, h: 120 },
];

const SVG_NS = "http://www.w3.org/2000/svg";

interface Fighter {
  name: string;
  config: AvatarConfig;
  equipped: string[];
  ability: AbilityDef;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  facing: number;
  phase: number;
  moving: boolean;
  atkCd: number;
  superCharge: number;
  dashT: number;
  dashVX: number;
  dashVY: number;
  dashHit: boolean;
}

interface Proj {
  el: SVGGElement;
  owner: "player" | "bot";
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  r: number;
  travelled: number;
  pierce: boolean;
  explodeR?: number; // AoE radius on impact (fireball)
}

interface Fx {
  el: SVGElement;
  ttl: number;
  maxTtl: number;
  kind: "text" | "circle" | "rect";
  x0: number;
  y0: number;
  grow: number;
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
  const svgRef = useRef<SVGSVGElement>(null);
  const fxRef = useRef<SVGGElement>(null);
  const pRef = useRef<SVGGElement>(null);
  const bRef = useRef<SVGGElement>(null);
  const pSpriteRef = useRef<SVGGElement>(null);
  const bSpriteRef = useRef<SVGGElement>(null);
  const pBarRef = useRef<SVGRectElement>(null);
  const bBarRef = useRef<SVGRectElement>(null);
  const pChargeRef = useRef<SVGRectElement>(null);
  const bChargeRef = useRef<SVGRectElement>(null);

  const keysRef = useRef(new Set<string>());
  const clickTargetRef = useRef<{ x: number; y: number } | null>(null);
  const projs = useRef<Proj[]>([]);
  const fxs = useRef<Fx[]>([]);
  const resultRef = useRef<"win" | "lose" | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const player = useRef<Fighter>({
    name: playerName,
    config: playerConfig,
    equipped: playerEquipped,
    ability: abilityOf(playerAbility),
    hp: HP,
    maxHp: HP,
    x: 250,
    y: 400,
    facing: 1,
    phase: 0,
    moving: false,
    atkCd: 0,
    superCharge: 0,
    dashT: 0,
    dashVX: 0,
    dashVY: 0,
    dashHit: false,
  });
  const bot = useRef<Fighter>({
    name: opponentName,
    config: opponentConfig,
    equipped: opponentEquipped,
    ability: abilityOf(opponentAbility),
    hp: HP,
    maxHp: HP,
    x: 1150,
    y: 400,
    facing: -1,
    phase: 0,
    moving: false,
    atkCd: 1,
    superCharge: 0,
    dashT: 0,
    dashVX: 0,
    dashVY: 0,
    dashHit: false,
  });

  const [result, setResult] = useState<"win" | "lose" | null>(null);
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

  const clamp = (v: number, a: number, b: number) =>
    Math.min(Math.max(v, a), b);

  const hitsCrate = (cx: number, cy: number, r: number) =>
    CRATES.some((c) => {
      const nx = Math.max(c.x, Math.min(cx, c.x + c.w));
      const ny = Math.max(c.y, Math.min(cy, c.y + c.h));
      const dx = cx - nx;
      const dy = cy - ny;
      return dx * dx + dy * dy < r * r;
    });

  const chargeGain = (f: Fighter, amt: number) => {
    f.superCharge = Math.min(1, f.superCharge + amt);
  };

  const floatText = (x: number, y: number, text: string, color: string) => {
    const el = document.createElementNS(SVG_NS, "text");
    el.setAttribute("x", `${x}`);
    el.setAttribute("y", `${y}`);
    el.setAttribute("text-anchor", "middle");
    el.setAttribute("font-size", "26");
    el.setAttribute("font-weight", "900");
    el.setAttribute("fill", color);
    el.setAttribute("stroke", "#ffffff");
    el.setAttribute("stroke-width", "3");
    el.setAttribute("paint-order", "stroke");
    el.textContent = text;
    fxRef.current?.appendChild(el);
    fxs.current.push({ el, ttl: 0.9, maxTtl: 0.9, kind: "text", x0: x, y0: y, grow: 0 });
  };

  const circleFx = (
    x: number,
    y: number,
    r: number,
    fill: string,
    ttl: number,
    grow = 0,
  ) => {
    const el = document.createElementNS(SVG_NS, "circle");
    el.setAttribute("cx", `${x}`);
    el.setAttribute("cy", `${y}`);
    el.setAttribute("r", `${r}`);
    el.setAttribute("fill", fill);
    fxRef.current?.appendChild(el);
    fxs.current.push({ el, ttl, maxTtl: ttl, kind: "circle", x0: x, y0: y, grow });
  };

  const lineFx = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    stroke: string,
    width: number,
    ttl: number,
  ) => {
    const el = document.createElementNS(SVG_NS, "line");
    el.setAttribute("x1", `${x1}`);
    el.setAttribute("y1", `${y1}`);
    el.setAttribute("x2", `${x2}`);
    el.setAttribute("y2", `${y2}`);
    el.setAttribute("stroke", stroke);
    el.setAttribute("stroke-width", `${width}`);
    el.setAttribute("stroke-linecap", "round");
    fxRef.current?.appendChild(el);
    fxs.current.push({ el, ttl, maxTtl: ttl, kind: "rect", x0: x1, y0: y1, grow: 0 });
  };

  const spawnProj = (
    owner: Fighter,
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
    const g = document.createElementNS(SVG_NS, "g");
    const glow = document.createElementNS(SVG_NS, "circle");
    glow.setAttribute("r", `${(opts.r ?? 14) + 7}`);
    glow.setAttribute("fill", "#ffffff");
    glow.setAttribute("opacity", "0.35");
    const body = document.createElementNS(SVG_NS, "circle");
    body.setAttribute("r", `${opts.r ?? 14}`);
    body.setAttribute("fill", ownerKey === "player" ? "#38bdf8" : "#fb7185");
    body.setAttribute("stroke", "#ffffff");
    body.setAttribute("stroke-width", "3");
    g.appendChild(glow);
    g.appendChild(body);
    g.setAttribute("transform", `translate(${owner.x} ${owner.y})`);
    fxRef.current?.appendChild(g);
    projs.current.push({
      el: g,
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

  const damageEnemy = (attacker: Fighter, target: Fighter, dmg: number) => {
    if (target.hp <= 0 || resultRef.current) return;
    target.hp = Math.max(0, target.hp - dmg);
    floatText(target.x, target.y - 130, `-${dmg}`, "#ff6b6b");
    chargeGain(attacker, 0.26);
    chargeGain(target, 0.12);
    if (target.hp <= 0) {
      circleFx(target.x, target.y - 40, 20, "#ffffff", 0.5, 90);
      endBattle(attacker === player.current ? "win" : "lose");
    }
  };

  const explodeAt = (pr: Proj) => {
    const r = pr.explodeR ?? 130;
    circleFx(pr.x, pr.y, 18, "#fdba74", 0.45, 120);
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

  const beamAttack = (f: Fighter, enemy: Fighter) => {
    const ang = Math.atan2(enemy.y - f.y, enemy.x - f.x);
    const len = 560;
    const ex = f.x + Math.cos(ang) * len;
    const ey = f.y + Math.sin(ang) * len;
    lineFx(f.x, f.y - 40, ex, ey - 40, "#ffe066", 46, 0.32);
    lineFx(f.x, f.y - 40, ex, ey - 40, "#fff7cc", 20, 0.32);
    const dist = Math.hypot(enemy.x - f.x, enemy.y - f.y);
    const a1 = Math.atan2(enemy.y - f.y, enemy.x - f.x);
    let da = Math.abs(a1 - ang);
    if (da > Math.PI) da = Math.PI * 2 - da;
    if (dist < len && da < 0.42) {
      damageEnemy(f, enemy, 300);
    }
  };

  const startDash = (f: Fighter, enemy: Fighter) => {
    const ang = Math.atan2(enemy.y - f.y, enemy.x - f.x);
    f.dashVX = Math.cos(ang);
    f.dashVY = Math.sin(ang);
    f.dashT = 0.32;
    f.dashHit = false;
    circleFx(f.x, f.y - 40, 24, "#a5f3fc", 0.35, 40);
    circleFx(f.x, f.y - 60, 16, "#e0f2fe", 0.3, 30);
  };

  const fireballAttack = (f: Fighter, enemy: Fighter) => {
    spawnProj(f, f === player.current ? "player" : "bot", enemy.x, enemy.y, 320, {
      r: 17,
      speed: 400,
      explodeR: 130,
    });
  };

  const useSuper = (f: Fighter, enemy: Fighter) => {
    f.superCharge = 0;
    switch (f.ability.id) {
      case "isik":
        beamAttack(f, enemy);
        break;
      case "simsek":
        startDash(f, enemy);
        break;
      case "sifa": {
        const heal = Math.round(f.maxHp * 0.45);
        f.hp = Math.min(f.maxHp, f.hp + heal);
        floatText(f.x, f.y - 135, `+${heal}`, "#4ade80");
        circleFx(f.x, f.y - 40, 20, "#86efac", 0.5, 60);
        circleFx(f.x, f.y - 40, 12, "#bbf7d0", 0.4, 40);
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

  const moveFighter = (f: Fighter, dx: number, dy: number, dt: number) => {
    let nx = clamp(f.x + dx, 40, ARENA_W - 40);
    if (!hitsCrate(nx, f.y, FIGHTER_R)) f.x = nx;
    let ny = clamp(f.y + dy, 40, ARENA_H - 40);
    if (!hitsCrate(f.x, ny, FIGHTER_R)) f.y = ny;
    if (Math.abs(dx) > 0.01) f.facing = dx > 0 ? 1 : -1;
    f.moving = Math.hypot(dx, dy) > 0.5;
    if (f.moving) f.phase += dt * 10;
  };

  const endBattle = (win: "win" | "lose") => {
    if (resultRef.current) return;
    resultRef.current = win;
    setResult(win);
  };

  // ---- main loop ----
  useEffect(() => {
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
      } else if (clickTargetRef.current) {
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
        if (
          !p.dashHit &&
          Math.hypot(b.x - p.x, b.y - p.y) < 90
        ) {
          p.dashHit = true;
          damageEnemy(p, b, 200);
        }
        if (p.dashT <= 0) p.dashHit = false;
      } else {
        moveFighter(p, vx * 300 * dt, vy * 300 * dt, dt);
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
        if (dist > 310) {
          mx = dx / dist;
          my = dy / dist;
        } else if (dist < 180) {
          mx = -dx / dist;
          my = -dy / dist;
        } else {
          mx = dy / dist;
          my = -dx / dist;
        }
        // nudge away from crates so the bot doesn't hug walls
        moveFighter(b, mx * 190 * dt, my * 190 * dt, dt);
        b.facing = dx > 0 ? 1 : -1;
        if (b.atkCd <= 0 && dist < 580) {
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
        if (b.superCharge >= 1 && dist < 620) {
          useSuper(b, p);
        }
      }

      // --- projectiles ---
      for (let i = projs.current.length - 1; i >= 0; i--) {
        const pr = projs.current[i];
        const distTravelled = Math.hypot(pr.vx, pr.vy) * dt;
        pr.travelled += distTravelled;
        const nx = pr.x + pr.vx * dt;
        const ny = pr.y + pr.vy * dt;
        if (hitsCrate(nx, ny, pr.r)) {
          fxRef.current?.removeChild(pr.el);
          projs.current.splice(i, 1);
          continue;
        }
        pr.x = nx;
        pr.y = ny;
        pr.el.setAttribute("transform", `translate(${pr.x} ${pr.y})`);
        const target =
          pr.owner === "player" ? bot.current : player.current;
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
            fxRef.current?.removeChild(pr.el);
            projs.current.splice(i, 1);
            continue;
          }
        }
        if (pr.explodeR && pr.travelled >= 720) {
          explodeAt(pr);
          fxRef.current?.removeChild(pr.el);
          projs.current.splice(i, 1);
        } else if (pr.travelled >= PROJ_RANGE && !pr.explodeR) {
          fxRef.current?.removeChild(pr.el);
          projs.current.splice(i, 1);
        }
      }

      // --- one-shot effects ---
      for (let i = fxs.current.length - 1; i >= 0; i--) {
        const fx = fxs.current[i];
        fx.ttl -= dt;
        if (fx.ttl <= 0) {
          fxRef.current?.removeChild(fx.el);
          fxs.current.splice(i, 1);
          continue;
        }
        const t = fx.ttl / fx.maxTtl;
        fx.el.setAttribute("opacity", `${t}`);
        if (fx.kind === "text") {
          fx.el.setAttribute("y", `${fx.y0 - (1 - t) * 60}`);
        } else if (fx.kind === "circle" && fx.grow > 0) {
          const r = Math.max(2, fx.grow * (1 - t));
          fx.el.setAttribute("r", `${r}`);
        }
      }

      // --- sprites + bars (imperative) ---
      const applyFighter = (
        f: Fighter,
        group: SVGGElement | null,
        sprite: SVGGElement | null,
        bar: SVGRectElement | null,
        charge: SVGRectElement | null,
      ) => {
        if (!group) return;
        group.setAttribute("transform", `translate(${f.x} ${f.y})`);
        if (sprite) {
          const flip = f.facing < 0 ? -1 : 1;
          const bob = f.moving ? Math.sin(f.phase) * 5 : 0;
          sprite.classList.toggle("walking", f.moving);
          sprite.setAttribute(
            "transform",
            flip === 1
              ? `translate(${-CHAR_W / 2} ${-CHAR_H + bob})`
              : `scale(-1 1) translate(${-CHAR_W / 2} ${-CHAR_H + bob})`,
          );
        }
        bar?.setAttribute("width", `${(f.hp / f.maxHp) * 90}`);
        charge?.setAttribute("width", `${f.superCharge * 90}`);
      };
      applyFighter(p, pRef.current, pSpriteRef.current, pBarRef.current, pChargeRef.current);
      applyFighter(b, bRef.current, bSpriteRef.current, bBarRef.current, bChargeRef.current);

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
    };
  }, [tryAttack, trySuper]);

  const handleArenaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (resultRef.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    actionsRef.current.click(pt.x, pt.y);
  };

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
              <div className="mt-1 h-2.5 w-36 overflow-hidden rounded-full bg-white/15 sm:w-44">
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
              <div className="mt-1 ml-auto h-2.5 w-36 overflow-hidden rounded-full bg-white/15 sm:w-44">
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

        {/* arena */}
        <main
          className="relative min-h-0 flex-1 touch-none overflow-hidden"
          onClick={handleArenaClick}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${ARENA_W} ${ARENA_H}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 h-full w-full"
          >
            <defs>
              <radialGradient id="arena-grass" cx="50%" cy="42%" r="75%">
                <stop offset="0%" stopColor="#7ec850" />
                <stop offset="100%" stopColor="#4c9a3a" />
              </radialGradient>
            </defs>
            <rect width={ARENA_W} height={ARENA_H} fill="url(#arena-grass)" />
            {/* boundary wall */}
            <rect
              x="20"
              y="20"
              width={ARENA_W - 40}
              height={ARENA_H - 40}
              rx="40"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.35"
              strokeWidth="10"
              strokeDasharray="26 18"
            />
            {/* center line */}
            <line
              x1={ARENA_W / 2}
              y1="60"
              x2={ARENA_W / 2}
              y2={ARENA_H - 60}
              stroke="#ffffff"
              strokeOpacity="0.18"
              strokeWidth="6"
              strokeDasharray="18 14"
            />
            {/* crates */}
            {CRATES.map((c, i) => (
              <g key={i}>
                <rect
                  x={c.x}
                  y={c.y}
                  width={c.w}
                  height={c.h}
                  rx="18"
                  fill="#8a5a2b"
                  stroke="#5f3d1c"
                  strokeWidth="6"
                />
                <rect
                  x={c.x + 12}
                  y={c.y + 12}
                  width={c.w - 24}
                  height={c.h - 24}
                  rx="10"
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity="0.25"
                  strokeWidth="4"
                  strokeDasharray="14 10"
                />
              </g>
            ))}

            {/* fighters */}
            <g ref={pRef}>
              <g ref={pSpriteRef}>
                <AvatarPreview width={CHAR_W} height={CHAR_H} config={playerConfig} />
                <EquippedItems equipped={playerEquipped} width={CHAR_W} height={CHAR_H} />
              </g>
              {/* HP + super bars */}
              <g transform="translate(-45 -118)">
                <rect width="90" height="9" rx="4.5" fill="#1f2937" />
                <rect ref={pBarRef} width="90" height="9" rx="4.5" fill="#4ade80" />
                <rect y="11" width="90" height="5" rx="2.5" fill="#334155" />
                <rect ref={pChargeRef} y="11" width="90" height="5" rx="2.5" fill="#facc15" />
              </g>
            </g>
            <g ref={bRef}>
              <g ref={bSpriteRef}>
                <AvatarPreview width={CHAR_W} height={CHAR_H} config={opponentConfig} />
                <EquippedItems equipped={opponentEquipped} width={CHAR_W} height={CHAR_H} />
              </g>
              <g transform="translate(-45 -118)">
                <rect width="90" height="9" rx="4.5" fill="#1f2937" />
                <rect ref={bBarRef} width="90" height="9" rx="4.5" fill="#fb7185" />
                <rect y="11" width="90" height="5" rx="2.5" fill="#334155" />
                <rect ref={bChargeRef} y="11" width="90" height="5" rx="2.5" fill="#facc15" />
              </g>
            </g>

            {/* projectiles + effects */}
            <g ref={fxRef} />
          </svg>

          {/* controls */}
          <div className="pointer-events-none absolute right-3 bottom-3 flex flex-col items-end gap-2 z-10">
            <button
              type="button"
              onClick={() => actionsRef.current.super()}
              aria-label="Süper yetenek"
              className={`pointer-events-auto flex size-16 items-center justify-center rounded-full border-4 shadow-xl transition-transform active:scale-90 ${
                hud.pc >= 1
                  ? "border-yellow-300 bg-gradient-to-br from-yellow-400 to-amber-500 text-amber-950"
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
