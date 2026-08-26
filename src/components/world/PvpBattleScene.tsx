// ⚔️ PvP duel arena — two REAL players fighting in real time.
//
// Each phone simulates its OWN fighter locally (zero input lag) and shares
// live state through a Convex presence room ("battle:<battleId>", ~10 Hz):
// position, hp, super charge, projectiles and discrete combat events.
// The OTHER fighter is rendered from those snapshots with lerp, and remote
// projectiles are extrapolated between snapshots. Damage is shooter-side:
// the shooter decides when its projectile/beam/dash connects and publishes a
// one-shot event; the target applies it. Both phones converge on the same
// HP values (each fighter's HP is published by its own phone).
//
// The arena rendering (Arena3D / FallbackArena2D) is reused unchanged —
// it just reads fighter/projectile/FX refs every frame.
import { Button } from "@/components/ui/button";
import {
  Arena3D,
  ATK_CD,
  BATTLE_OBSTACLES,
  supportsWebGL,
  type BattleFighter,
  type BattleFx,
  type BattleProj,
} from "@/components/world/Arena3D";
import { BattleJoystick, BattleLoading } from "@/components/world/BattleScene";
import { FallbackArena2D } from "@/components/world/FallbackArena2D";
import { usePresenceOthers, usePresencePublisher } from "@/hooks/use-presence";
import type { AvatarConfig } from "@/lib/avatar";
import { abilityOf } from "@/lib/shop";
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
const PROJ_RANGE = 660;
const FIGHTER_R = 22;
const PUBLISH_MS = 100; // presence snapshot cadence
const EVENT_TTL_MS = 3500; // how long a combat event stays in the publish queue
const DISCONNECT_MS = 4000; // no remote snapshot for this long → opponent gone

/** One live projectile on my side (has a stable id for the network). */
interface PvpProj {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  r: number;
  travelled: number;
  pierce: boolean;
  explodeR?: number;
}

/** One-shot combat events. Damage is shooter-side: `hit` was decided by the
 *  shooter against its view of the target; the receiver just applies it. */
/** Distribute Omit over the PvpEvent union (TS's Omit collapses unions). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

type PvpEvent =
  | { id: string; type: "hit"; dmg: number }
  | {
      id: string;
      type: "beam";
      x1: number;
      y1: number;
      angle: number;
      len: number;
      dmg: number;
      hit: boolean;
    }
  | { id: string; type: "dashHit"; dmg: number }
  | {
      id: string;
      type: "explode";
      x: number;
      y: number;
      r: number;
      dmg: number;
      hit: boolean;
    };

/** What one phone publishes about its fighter every ~100 ms. */
interface PvpPayload {
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  hp: number;
  superCharge: number;
  dashT: number;
  dashVX: number;
  dashVY: number;
  phase: number;
  projs: PvpProj[];
  events: PvpEvent[];
  ts: number;
}

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
    vy: 0,
  };
}

/** If the 3D scene crashes for any reason, fall back to the 2D arena. */
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

export default function PvpBattleScene({
  battleId,
  mySessionId,
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
  battleId: string;
  mySessionId: string;
  playerName: string;
  playerConfig: AvatarConfig;
  playerEquipped: string[];
  playerAbility: string;
  opponentName: string;
  opponentConfig: AvatarConfig;
  opponentEquipped: string[];
  opponentAbility: string;
  onExit: (
    victory: boolean,
    reason: "win" | "lose" | "draw" | "forfeit" | "leave",
  ) => void;
}) {
  const arenaRef = useRef<HTMLElement>(null);
  const room = `battle:${battleId}`;
  const { publish } = usePresencePublisher(room);
  const { others } = usePresenceOthers<PvpPayload>(room, mySessionId);

  const joystickRef = useRef({ x: 0, y: 0 });
  const aimRef = useRef({ active: false, dx: 0, dy: 0 });
  const attackKnobRef = useRef<HTMLSpanElement>(null);
  const keysRef = useRef(new Set<string>());
  const clickTargetRef = useRef<{ x: number; y: number } | null>(null);

  const player = useRef<BattleFighter>(
    newFighter(playerName, playerConfig, playerEquipped, playerAbility, 420, 180, 1),
  );
  const bot = useRef<BattleFighter>(
    newFighter(opponentName, opponentConfig, opponentEquipped, opponentAbility, 1280, 920, -1),
  );

  const ownProjs = useRef<PvpProj[]>([]);
  const remoteProjs = useRef(new Map<string, PvpProj>());
  const projs = useRef<BattleProj[]>([]); // merged render list
  const fxs = useRef<BattleFx[]>([]);
  const pendingEvents = useRef<PvpEvent[]>([]);
  const eventBornAt = useRef(new Map<string, number>());
  const seenEvents = useRef(new Map<string, number>());
  const evSeq = useRef(0);
  const projSeq = useRef(0);

  // Latest snapshot of the remote fighter (targets for the lerp).
  const remoteTarget = useRef({
    x: 1280,
    y: 920,
    facing: -1,
    moving: false,
    hp: HP,
    superCharge: 0,
    phase: 0,
  });
  const lastRemoteAt = useRef(0);
  const remoteConnected = useRef(false);

  const resultRef = useRef<"win" | "lose" | "draw" | "forfeit" | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const publishRef = useRef(publish);
  publishRef.current = publish;
  // phase lives in a ref too so the rAF loop always sees the current value
  const phaseRef = useRef<"loading" | "waiting" | "fight">("loading");

  const webglOk = useMemo(() => supportsWebGL(), []);
  const [result, setResult] = useState<"win" | "lose" | "draw" | "forfeit" | null>(null);
  const [attackHeld, setAttackHeld] = useState(false);
  const [vsShow, setVsShow] = useState(true);
  const [phase, setPhase] = useState<"loading" | "waiting" | "fight">("loading");
  phaseRef.current = phase;
  const startedRef = useRef(false);
  const [loadPct, setLoadPct] = useState(0);
  const [loadStep, setLoadStep] = useState(0);
  const [hud, setHud] = useState({ ph: HP, ohp: HP, pc: 0, oc: 0, atkReady: true });
  const lastHudRef = useRef({ ph: -1, ohp: -1, pc: -1, oc: -1, atkReady: false });
  const actionsRef = useRef({
    attack: () => {},
    super: () => {},
    click: (_x: number, _y: number) => {},
  });

  /* ------------------------- local FX helpers ------------------------- */

  const addFx = (fx: BattleFx) => {
    fxs.current.push(fx);
  };

  const floatText = (x: number, y: number, text: string, color: string) => {
    addFx({ kind: "text", x, y, ttl: 0.9, maxTtl: 0.9, text, color });
  };

  const burstFx = (x: number, y: number, grow: number, color: string, ttl: number) => {
    addFx({ kind: "burst", x, y, ttl, maxTtl: ttl, grow, color });
  };

  const circleFx = (x: number, y: number, grow: number, color: string, ttl: number) => {
    addFx({ kind: "ring", x, y, ttl, maxTtl: ttl, grow, color });
  };

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

  /** I took damage (a remote hit event landed on me). */
  const damageMe = (dmg: number) => {
    const p = player.current;
    if (resultRef.current || p.hp <= 0) return;
    p.hp = Math.max(0, p.hp - dmg);
    p.lastHitAt = performance.now();
    floatText(p.x, p.y - 130, `-${dmg}`, "#ff6b6b");
    playSound("hurt", { volume: 0.9, rate: 0.82 + Math.random() * 0.2 });
    playSound("hit", { volume: 0.35, rate: 1.5 });
    p.superCharge = Math.min(1, p.superCharge + 0.12);
    const arenaEl = arenaRef.current;
    if (arenaEl) {
      arenaEl.classList.remove("battle-shake");
      void arenaEl.getBoundingClientRect();
      arenaEl.classList.add("battle-shake");
    }
  };

  /** Apply a one-shot combat event sent by the other phone. */
  const applyRemoteEvent = (ev: PvpEvent) => {
    const p = player.current;
    if (resultRef.current || p.hp <= 0) return;
    switch (ev.type) {
      case "hit":
        damageMe(ev.dmg);
        break;
      case "beam": {
        const x2 = ev.x1 + Math.cos(ev.angle) * ev.len;
        const y2 = ev.y1 + Math.sin(ev.angle) * ev.len;
        addFx({ kind: "beam", x1: ev.x1, y1: ev.y1, x2, y2, ttl: 0.32, maxTtl: 0.32 });
        if (ev.hit) damageMe(ev.dmg);
        break;
      }
      case "dashHit":
        damageMe(ev.dmg);
        break;
      case "explode": {
        burstFx(ev.x, ev.y, ev.r, "#fdba74", 0.45);
        smokeFx(ev.x, ev.y, 7, 120);
        if (ev.hit) damageMe(ev.dmg);
        break;
      }
    }
  };

  /* --------------------- incoming network handling -------------------- */

  /** Announce myself the moment the arena mounts so the opponent sees me. */
  useEffect(() => {
    const p = player.current;
    publishRef.current({
      x: p.x,
      y: p.y,
      facing: p.facing,
      moving: false,
      hp: HP,
      superCharge: 0,
      dashT: 0,
      dashVX: 0,
      dashVY: 0,
      phase: 0,
      projs: [],
      events: [],
      ts: performance.now(),
    });
  }, []);

  useEffect(() => {
    const d = others[0]?.data;
    if (!d || typeof d.x !== "number") return;
    remoteConnected.current = true;
    lastRemoteAt.current = performance.now();
    remoteTarget.current = {
      x: d.x,
      y: d.y,
      facing: typeof d.facing === "number" ? d.facing : 1,
      moving: !!d.moving,
      hp: d.hp,
      superCharge: d.superCharge,
      phase: d.phase,
    };
    // reconcile remote projectiles with the snapshot (corrects drift)
    const next = new Map<string, PvpProj>();
    for (const pr of d.projs ?? []) {
      next.set(pr.id, { ...pr });
    }
    remoteProjs.current = next;
    // apply unseen one-shot events
    for (const ev of d.events ?? []) {
      if (!ev || !ev.id) continue;
      if (seenEvents.current.has(ev.id)) continue;
      seenEvents.current.set(ev.id, performance.now());
      applyRemoteEvent(ev);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [others]);

  /* ------------------------- combat actions --------------------------- */

  const pushEvent = (ev: DistributiveOmit<PvpEvent, "id">) => {
    const id = `ev${evSeq.current++}`;
    pendingEvents.current.push({ id, ...ev } as PvpEvent);
    eventBornAt.current.set(id, performance.now());
  };

  const spawnProj = (
    tx: number,
    ty: number,
    dmg: number,
    opts: { r?: number; pierce?: boolean; speed?: number; explodeR?: number } = {},
  ) => {
    const p = player.current;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = opts.speed ?? PROJ_SPEED;
    playSound("shoot", { volume: 0.6 });
    ownProjs.current.push({
      id: `pr${projSeq.current++}`,
      x: p.x,
      y: p.y,
      vx: (dx / d) * speed,
      vy: (dy / d) * speed,
      dmg,
      r: opts.r ?? 14,
      travelled: 0,
      pierce: opts.pierce ?? false,
      explodeR: opts.explodeR,
    });
    if (ownProjs.current.length > 24) {
      ownProjs.current.splice(0, ownProjs.current.length - 24);
    }
  };

  /** My fireball detonated — FX here, damage event to the target. */
  const explodeAt = (pr: PvpProj) => {
    const r = pr.explodeR ?? 130;
    playSound("explode", { volume: 0.9, rate: 0.85 + Math.random() * 0.3 });
    burstFx(pr.x, pr.y, r, "#fdba74", 0.45);
    smokeFx(pr.x, pr.y, 7, 120);
    const b = bot.current;
    const hit = Math.hypot(b.x - pr.x, b.y - pr.y) < r;
    pushEvent({ type: "explode", x: pr.x, y: pr.y, r, dmg: pr.dmg, hit });
    if (hit) {
      floatText(b.x, b.y - 130, `-${pr.dmg}`, "#ff6b6b");
      b.lastHitAt = performance.now();
      player.current.superCharge = Math.min(1, player.current.superCharge + 0.26);
    }
  };

  const beamAttack = () => {
    const p = player.current;
    const b = bot.current;
    const ang = Math.atan2(b.y - p.y, b.x - p.x);
    const len = 560;
    const ex = p.x + Math.cos(ang) * len;
    const ey = p.y + Math.sin(ang) * len;
    addFx({ kind: "beam", x1: p.x, y1: p.y, x2: ex, y2: ey, ttl: 0.32, maxTtl: 0.32 });
    const dist = Math.hypot(b.x - p.x, b.y - p.y);
    const hit = dist < len;
    pushEvent({ type: "beam", x1: p.x, y1: p.y, angle: ang, len, dmg: 300, hit });
    if (hit) {
      floatText(b.x, b.y - 130, "-300", "#ff6b6b");
      b.lastHitAt = performance.now();
    }
  };

  const startDash = () => {
    const p = player.current;
    const b = bot.current;
    const ang = Math.atan2(b.y - p.y, b.x - p.x);
    p.dashVX = Math.cos(ang);
    p.dashVY = Math.sin(ang);
    p.dashT = 0.32;
    p.dashHit = false;
    circleFx(p.x, p.y - 40, 60, "#a5f3fc", 0.35);
    circleFx(p.x, p.y - 60, 40, "#e0f2fe", 0.3);
  };

  const useSuper = () => {
    const p = player.current;
    p.superCharge = 0;
    playSound("super", { volume: 0.9 });
    smokeFx(p.x, p.y - 20, 4, 80);
    switch (p.ability.id) {
      case "isik":
        beamAttack();
        break;
      case "simsek":
        playSound("dash");
        startDash();
        break;
      case "sifa": {
        const heal = Math.round(p.maxHp * 0.45);
        p.hp = Math.min(p.maxHp, p.hp + heal);
        floatText(p.x, p.y - 135, `+${heal}`, "#4ade80");
        circleFx(p.x, p.y - 40, 70, "#86efac", 0.5);
        circleFx(p.x, p.y - 40, 45, "#bbf7d0", 0.4);
        break;
      }
      case "ates":
        spawnProj(bot.current.x, bot.current.y, 320, { r: 17, speed: 400, explodeR: 130 });
        break;
      default:
        spawnProj(bot.current.x, bot.current.y, 240, { r: 20, pierce: true, speed: 560 });
    }
  };

  const tryAttack = useCallback((aimX?: number, aimY?: number) => {
    const p = player.current;
    if (!startedRef.current || resultRef.current || p.hp <= 0 || p.dashT > 0 || p.atkCd > 0)
      return;
    p.atkCd = ATK_CD;
    let tx: number;
    let ty: number;
    const aimMag = Math.hypot(aimX ?? 0, aimY ?? 0);
    if (aimMag > 0.15) {
      tx = p.x + (aimX! / aimMag) * 120;
      ty = p.y + (aimY! / aimMag) * 120;
    } else {
      tx = bot.current.x;
      ty = bot.current.y - 40;
    }
    p.facing = tx >= p.x ? 1 : -1;
    spawnProj(tx, ty, BASE_DMG);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trySuper = useCallback(() => {
    const p = player.current;
    if (!startedRef.current || resultRef.current || p.hp <= 0 || p.dashT > 0 || p.superCharge < 1)
      return;
    useSuper();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

  const hitsObstacle = (cx: number, cy: number, r: number) =>
    BATTLE_OBSTACLES.some((c) => {
      const nx = Math.max(c.x, Math.min(cx, c.x + c.w));
      const ny = Math.max(c.y, Math.min(cy, c.y + c.h));
      const dx = cx - nx;
      const dy = cy - ny;
      return dx * dx + dy * dy < r * r;
    });

  const moveFighter = (f: BattleFighter, dx: number, dy: number, dt: number) => {
    let nx = clamp(f.x + dx, 40, ARENA_W - 40);
    if (!hitsObstacle(nx, f.y, FIGHTER_R)) f.x = nx;
    let ny = clamp(f.y + dy, 40, ARENA_H - 40);
    if (!hitsObstacle(f.x, ny, FIGHTER_R)) f.y = ny;
    if (Math.abs(dx) > 0.01) f.facing = dx > 0 ? 1 : -1;
    f.moving = Math.hypot(dx, dy) > 0.5;
    if (f.moving) {
      if (Math.abs(dy) > Math.abs(dx)) f.vy = dy > 0 ? 1 : -1;
      else f.vy = 0;
    } else {
      f.vy = 0;
    }
    if (f.moving) f.phase += dt * 10;
  };

  const endBattle = (win: "win" | "lose" | "draw" | "forfeit") => {
    if (resultRef.current) return;
    resultRef.current = win;
    setResult(win);
    stopBattleAmbience();
    if (win === "win") playSound("win");
    else if (win === "lose") playSound("lose");
  };

  /* --------------------------- main loop ------------------------------ */

  useEffect(() => {
    let superReadyPlayed = false;
    let stepAcc = 0;
    let lastPub = 0;
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
      if (resultRef.current) return;

      // --- remote fighter: lerp toward the latest snapshot ---
      const t = remoteTarget.current;
      const k = Math.min(1, dt * 9);
      b.x += (t.x - b.x) * k;
      b.y += (t.y - b.y) * k;
      b.facing = t.facing;
      b.moving = t.moving;
      if (t.moving) b.phase += dt * 10;
      if (t.hp < b.hp - 1) {
        // enemy took a hit on their phone — reflect it here
        const diff = Math.round(b.hp - t.hp);
        b.lastHitAt = performance.now();
        floatText(b.x, b.y - 130, `-${diff}`, "#ff6b6b");
        playSound("hit", { volume: 0.85, rate: 0.95 + Math.random() * 0.25 });
      }
      b.hp = t.hp;
      b.superCharge = t.superCharge;
      b.maxHp = HP;

      // --- remote projectiles: extrapolate between snapshots ---
      for (const pr of remoteProjs.current.values()) {
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        pr.travelled += Math.hypot(pr.vx, pr.vy) * dt;
        if (pr.travelled >= PROJ_RANGE) remoteProjs.current.delete(pr.id);
      }

      // freeze the sim until both fighters are connected + loading finished
      if (phaseRef.current !== "fight" || !startedRef.current) return;

      // --- disconnect guard ---
      if (
        remoteConnected.current &&
        performance.now() - lastRemoteAt.current > DISCONNECT_MS
      ) {
        endBattle("forfeit");
        return;
      }

      p.atkCd = Math.max(0, p.atkCd - dt);

      // run-and-gun: hold the attack button (or Space) to keep firing
      if (aimRef.current.active && p.atkCd <= 0) {
        tryAttack(aimRef.current.dx, aimRef.current.dy);
      }

      // --- movement (keys + joystick + click target) ---
      let vx = 0;
      let vy = 0;
      const keys = keysRef.current;
      if (keys.has("ArrowLeft") || keys.has("KeyA")) vx -= 1;
      if (keys.has("ArrowRight") || keys.has("KeyD")) vx += 1;
      if (keys.has("ArrowUp") || keys.has("KeyW")) vy -= 1;
      if (keys.has("ArrowDown") || keys.has("KeyS")) vy += 1;
      if (vx !== 0 || vy !== 0) {
        if (vx !== 0 && vy !== 0) {
          if (Math.abs(vx) >= Math.abs(vy)) vy = 0;
          else vx = 0;
        }
        clickTargetRef.current = null;
      } else {
        const jx = joystickRef.current.x;
        const jy = joystickRef.current.y;
        if (Math.abs(jx) > 0.1 || Math.abs(jy) > 0.1) {
          if (Math.abs(jx) >= Math.abs(jy)) { vx = jx > 0 ? 1 : -1; vy = 0; }
          else { vx = 0; vy = jy > 0 ? 1 : -1; }
          clickTargetRef.current = null;
        }
      }
      if (vx === 0 && vy === 0 && clickTargetRef.current) {
        const dx = clickTargetRef.current.x - p.x;
        const dy = clickTargetRef.current.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 24) clickTargetRef.current = null;
        else {
          if (Math.abs(dx) >= Math.abs(dy)) { vx = dx > 0 ? 1 : -1; vy = 0; }
          else { vx = 0; vy = dy > 0 ? 1 : -1; }
        }
      }
      if (p.dashT > 0) {
        p.dashT -= dt;
        moveFighter(p, p.dashVX * 820 * dt, p.dashVY * 820 * dt, dt);
        if (!p.dashHit && Math.hypot(b.x - p.x, b.y - p.y) < 90) {
          p.dashHit = true;
          pushEvent({ type: "dashHit", dmg: 200 });
          floatText(b.x, b.y - 130, "-200", "#ff6b6b");
          burstFx(b.x, b.y - 40, 90, "#e0f2fe", 0.4);
          b.lastHitAt = performance.now();
          playSound("hit", { volume: 0.9, rate: 1.1 });
          player.current.superCharge = Math.min(1, player.current.superCharge + 0.26);
        }
        if (p.dashT <= 0) p.dashHit = false;
      } else {
        moveFighter(p, vx * 90 * dt, vy * 90 * dt, dt);
      }

      // --- footsteps while walking ---
      if (p.moving && p.dashT <= 0) {
        stepAcc += dt;
        if (stepAcc > 0.3) {
          stepAcc = 0;
          playSound("step", { volume: 0.16, rate: 0.8 + Math.random() * 0.5 });
          smokeFx(p.x, p.y - 6, 2, 20);
        }
      } else {
        stepAcc = 0;
      }

      // --- my projectiles ---
      for (let i = ownProjs.current.length - 1; i >= 0; i--) {
        const pr = ownProjs.current[i];
        pr.travelled += Math.hypot(pr.vx, pr.vy) * dt;
        const nx = pr.x + pr.vx * dt;
        const ny = pr.y + pr.vy * dt;
        if (hitsObstacle(nx, ny, pr.r)) {
          playSound("thud", { volume: 0.3, rate: 0.7 + Math.random() * 0.4 });
          burstFx(nx, ny, 55, "#d9c29a", 0.3);
          ownProjs.current.splice(i, 1);
          continue;
        }
        pr.x = nx;
        pr.y = ny;
        const hitDist = Math.hypot(b.x - pr.x, b.y - pr.y);
        if (hitDist < pr.r + FIGHTER_R) {
          if (pr.explodeR) {
            explodeAt(pr);
          } else {
            pushEvent({ type: "hit", dmg: pr.dmg });
            floatText(b.x, b.y - 130, `-${pr.dmg}`, "#ff6b6b");
            b.lastHitAt = performance.now();
            burstFx(pr.x, pr.y - 40, 60, "#fda4af", 0.3);
            playSound("hit", { volume: 0.85, rate: 0.95 + Math.random() * 0.25 });
            player.current.superCharge = Math.min(1, player.current.superCharge + 0.26);
          }
          if (!pr.pierce) {
            ownProjs.current.splice(i, 1);
            continue;
          }
        }
        if (pr.explodeR && pr.travelled >= 720) {
          explodeAt(pr);
          ownProjs.current.splice(i, 1);
        } else if (pr.travelled >= PROJ_RANGE && !pr.explodeR) {
          ownProjs.current.splice(i, 1);
        }
      }

      // --- one-shot FX decay ---
      for (let i = fxs.current.length - 1; i >= 0; i--) {
        fxs.current[i].ttl -= dt;
        if (fxs.current[i].ttl <= 0) fxs.current.splice(i, 1);
      }

      // --- super ready jingle ---
      if (p.superCharge >= 1 && !superReadyPlayed) {
        superReadyPlayed = true;
        playSound("whoosh", { volume: 0.65 });
      } else if (p.superCharge < 1) {
        superReadyPlayed = false;
      }

      // --- result checks ---
      if (p.hp <= 0) {
        endBattle("lose");
      } else if (b.hp <= 0) {
        endBattle(p.hp > 0 ? "win" : "draw");
      }
    };

    const loop = (now: number) => {
      try {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        step(dt);

        // merged render list: my projectiles (blue) + remote (red)
        const merged: BattleProj[] = [];
        for (const pr of ownProjs.current) {
          merged.push({
            owner: "player",
            x: pr.x,
            y: pr.y,
            vx: pr.vx,
            vy: pr.vy,
            dmg: pr.dmg,
            r: pr.r,
            travelled: pr.travelled,
            pierce: pr.pierce,
            explodeR: pr.explodeR,
          });
        }
        for (const pr of remoteProjs.current.values()) {
          merged.push({
            owner: "bot",
            x: pr.x,
            y: pr.y,
            vx: pr.vx,
            vy: pr.vy,
            dmg: pr.dmg,
            r: pr.r,
            travelled: pr.travelled,
            pierce: pr.pierce,
            explodeR: pr.explodeR,
          });
        }
        projs.current = merged.slice(0, 26);

        // drop expired events from the publish queue + prune seen-ids
        const cutoff = performance.now() - EVENT_TTL_MS;
        pendingEvents.current = pendingEvents.current.filter((e) => {
          const born = eventBornAt.current.get(e.id);
          return born === undefined || born > cutoff;
        });
        for (const [id, ts] of seenEvents.current) {
          if (ts < cutoff) seenEvents.current.delete(id);
        }

        // publish my live state at ~10 Hz
        if (now - lastPub > PUBLISH_MS) {
          lastPub = now;
          const p = player.current;
          publishRef.current({
            x: p.x,
            y: p.y,
            facing: p.facing,
            moving: p.moving,
            hp: Math.round(p.hp),
            superCharge: p.superCharge,
            dashT: p.dashT,
            dashVX: p.dashVX,
            dashVY: p.dashVY,
            phase: p.phase,
            projs: ownProjs.current.map((pr) => ({ ...pr })),
            events: pendingEvents.current.map((e) => ({ ...e })),
            ts: now,
          });
        }

        // HUD (React, only when values changed)
        const ph = Math.round(player.current.hp / 5) * 5;
        const ohp = Math.round(bot.current.hp / 5) * 5;
        const pc = Math.round(player.current.superCharge * 20) / 20;
        const oc = Math.round(bot.current.superCharge * 20) / 20;
        const atkReady = player.current.atkCd <= 0;
        const lh = lastHudRef.current;
        if (ph !== lh.ph || ohp !== lh.ohp || pc !== lh.pc || oc !== lh.oc || atkReady !== lh.atkReady) {
          lastHudRef.current = { ph, ohp, pc, oc, atkReady };
          setHud({ ph, ohp, pc, oc, atkReady });
        }
      } catch (err) {
        console.error("PvP döngüsü hatası:", err);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryAttack, trySuper]);

  // ---- gaming loading sequence, then wait for the opponent to connect ----
  useEffect(() => {
    if (phase !== "loading") return;
    const start = performance.now();
    const DURATION = 3000;
    const STEPS = 4;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / DURATION, 1);
      setLoadPct(Math.round(t * 100));
      setLoadStep(Math.min(Math.floor(t * STEPS), STEPS - 1));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        startedRef.current = true;
        if (remoteConnected.current) {
          playSound("vs");
          setPhase("fight");
        } else {
          setPhase("waiting");
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // when waiting, start the fight as soon as the opponent appears
  useEffect(() => {
    if (phase !== "waiting") return;
    if (remoteConnected.current) {
      playSound("vs");
      setPhase("fight");
    }
  }, [phase, others]);

  // battle ambience once the fight unlocks; VS banner auto-hides
  useEffect(() => {
    if (phase !== "fight") return;
    void startBattleAmbience();
    const t = window.setTimeout(() => setVsShow(false), 1800);
    return () => window.clearTimeout(t);
  }, [phase]);

  const abilityEmoji = abilityOf(playerAbility).emoji;
  const oppAbilityEmoji = abilityOf(opponentAbility).emoji;

  const RESULT_UI: Record<string, { emoji: string; title: string; msg: string }> = {
    win: {
      emoji: "🏆",
      title: "Zafer!",
      msg: `${opponentName} yere serildi! Kazanç hesabına yüklendi (+150 SP).`,
    },
    lose: {
      emoji: "💀",
      title: "Yenildin",
      msg: `${opponentName} seni yendi. Tekrar dene — yeteneklerini mağazadan güçlendirebilirsin!`,
    },
    draw: {
      emoji: "🤝",
      title: "Berabere!",
      msg: "İkiniz de aynı anda yere serildiniz. Rövanş ne zaman?",
    },
    forfeit: {
      emoji: "📡",
      title: "Rakip koptu",
      msg: `${opponentName} bağlantısı koptu. Caddeye dönebilirsin.`,
    },
  };

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
              <Swords className="size-3.5" /> PVP
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Savaşı bırak"
              onClick={() => onExitRef.current(false, "leave")}
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

        {/* arena */}
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

          <div className="arena-vignette pointer-events-none absolute inset-0 z-[6]" />

          {/* VS intro banner */}
          {vsShow && phase === "fight" && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="vs-banner flex flex-col items-center gap-2 rounded-3xl border-4 border-yellow-300/80 bg-[#151b2e]/85 px-10 py-6 text-center text-white shadow-2xl">
                <span className="text-5xl font-black tracking-widest text-yellow-300">
                  ⚔️ VS ⚔️
                </span>
                <span className="text-sm font-extrabold">
                  {playerName} vs {opponentName}
                </span>
                <span className="text-[11px] font-extrabold tracking-wider text-sky-300/90">
                  GERÇEK ZAMANLI PVP
                </span>
              </div>
            </div>
          )}

          {/* loading / waiting screens */}
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
            {phase === "waiting" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[15] flex flex-col items-center justify-center gap-4 bg-[#0b1020]/95 text-white"
              >
                <span className="battle-load-spin text-5xl">⏳</span>
                <h3 className="text-xl font-extrabold tracking-widest text-sky-300">
                  RAKİP BEKLENİYOR…
                </h3>
                <p className="max-w-xs text-center text-sm font-semibold text-white/60">
                  {opponentName} savaş alanına katılıyor. İkisi de hazır olunca
                  dövüş başlar!
                </p>
                <div className="h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
                  <div className="battle-load-bar h-full w-full origin-left animate-pulse rounded-full bg-gradient-to-r from-sky-400 to-blue-500" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* controls */}
          <BattleJoystick stickRef={joystickRef} />

          <div className="pointer-events-none absolute right-3 bottom-3 z-10 flex flex-col items-end gap-2">
            <button
              type="button"
              onPointerDown={(e) => {
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
                if (Math.abs(aimRef.current.dx) > 0.2) {
                  player.current.facing = aimRef.current.dx >= 0 ? 1 : -1;
                }
                if (attackKnobRef.current)
                  attackKnobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
              }}
              onPointerUp={() => {
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
                <div className="text-6xl">{RESULT_UI[result].emoji}</div>
                <h2 className="mt-3 text-2xl font-extrabold">
                  {RESULT_UI[result].title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {RESULT_UI[result].msg}
                </p>
                <Button
                  className="mt-6 w-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-base font-extrabold text-white shadow-lg hover:from-indigo-400 hover:to-fuchsia-400"
                  onClick={() =>
                    onExitRef.current(
                      result === "win",
                      result === "win"
                        ? "win"
                        : result === "lose"
                          ? "lose"
                          : (result as "draw" | "forfeit"),
                    )
                  }
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
