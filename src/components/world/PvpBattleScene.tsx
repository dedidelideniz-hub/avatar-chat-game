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
// 3D arena memo'lu sarmalayıcıdan gelir: HUD/sayaç state güncellemeleri
// tüm three.js öğe ağacını yeniden kurmasın (bkz. Arena3DView.tsx).
import { Arena3DView as Arena3D } from "@/components/world/Arena3DView";
import { createObjectPool, swapRemove } from "@/lib/pool";
import {
  ATK_CD,
  BUSH_REVEAL_MS,
  applyHitReaction,
  isHiddenFrom,
  isSamuraiFighter,
  SAMURAI_ULTIMATE_DAMAGE,
  startAttackAnim,
  stepAttackAnim,
  faceAimYaw,
  stepHitStun,
  supportsWebGL,
  tickAimYaw,
  type BattleFighter,
  type BattleFx,
  type BattleProj,
} from "@/components/world/Arena3D";
import { hitsRockCollision } from "@/components/world/BattleMapModel";
// 🏃 MovementComponent — zemin kontrolü, kapsül çarpışması, pürüzsüz kayma.
import {
  ARENA_H,
  ARENA_W,
  DASH_HIT_R,
  moveOnGround,
  resolveSpawn,
  stepDash,
  type GroundConfig,
} from "@/components/world/arena/MovementComponent";
// ⚔️ SkillComponent — bekleme süreleri, MAX_RANGE nişanı ve atış tablosu.
import {
  ULT_CHARGE_DEAL,
  ULT_CHARGE_TAKE,
  castSuper,
  castUltimate,
  emitUltCrack,
  gainUltCharge,
  planAim,
  planBasicAttack,
  tickCooldown,
  tickSuperPassive,
  type SkillHost,
} from "@/components/world/arena/SkillComponent";
// ⚔️ MeleeComponent — Kraliyet Savaşçısı yakın dövüşü (3. yetenek).
import {
  startMelee,
  stepMelee,
  tickMelee,
} from "@/components/world/arena/MeleeComponent";
// ✨ VFXComponent — efekt veri yolu + bloom senkronlu ışık patlamaları.
import { createVfxBus, tickFx } from "@/components/world/arena/VFXComponent";
// Darbe geri bildirimi: patlama/bloom yerine yumuşak toz + kıvılcım kuyruğu.
import { pushHitImpact } from "@/components/world/arena/hitImpacts";
// 🖐️ MUZZLE/S — atış noktası karakterin ELİNE kaydırılır (elden ateş efekti).
import { MUZZLE, S } from "@/components/world/arena/shared";
// 🎯 Skillshot (menzilli nişan): sabit maksimum menzil + menzil içi otomatik kilit.
import {
  FIREBALL_RANGE_PX,
  MAX_RANGE_PX,
  aimState,
  aimedHit,
  bodyDir,
  resolveAim,
} from "@/components/world/arena/skillshot";
import { useAbilityAim } from "@/components/world/useAbilityAim";
// Melee salınımının süresi (uzak oyuncunun animasyonu aynı saatle aksın).
import { meleeDuration } from "@/engine/RoyalMelee";
import { BattleJoystick, BattleLoading } from "@/components/world/BattleScene";
// MOBA savaş arayüzü köprüsü (üst şerit, minimap, yetenek barı, rakip
// kartı). HUD bu sahnede de ref'lerden beslenir; render joystick katmanında.
import {
  registerMobaHud,
  type MobaHudLive,
} from "@/components/world/moba/MobaHud";
import { HudClock, HudFighter } from "@/components/world/BattleTopHud";
import {
  DUEL_LEAVE_EVENT,
  useAndroidBattleOrientation,
  useLandscapeGate,
} from "@/components/world/LandscapeGate";
import { usePresenceOthers, usePresencePublisher } from "@/hooks/use-presence";
import type { AvatarConfig } from "@/lib/avatar";
import { abilityOf } from "@/lib/shop";
import {
  playSound,
  startBattleAmbience,
  stopBattleAmbience,
} from "@/lib/sounds";
import { AnimatePresence, motion } from "framer-motion";
import { Trophy, X } from "lucide-react";
import {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const HP = 1000;
const BASE_DMG = 120;
const PROJ_SPEED = 445; // mermi uçuş hızı (%28 yavaşlatıldı: 620 → 445)
/** Skillshot menzili (MAX_RANGE = 12 birim) — mermi menzil sonunda söner. */
const PROJ_RANGE = MAX_RANGE_PX;
const FIGHTER_R = 22;
const PUBLISH_MS = 100; // presence snapshot cadence
const EVENT_TTL_MS = 3500; // how long a combat event stays in the publish queue
const DISCONNECT_MS = 4000; // no remote snapshot for this long → opponent gone

/** One live projectile on my side (has a stable id for the network).
 *
 *  `BattleProj` alanlarını taşır: böylece render listesi nesneleri KOPYALAMAZ,
 *  doğrudan aynı nesneleri gösterir (kare başına ayırma yok). */
interface PvpProj extends BattleProj {
  id: string;
  /** Snapshot eşleştirme damgası: snapshot'ta görünmeyen mermi havuza döner. */
  seenTick?: number;
}

/** One-shot combat events. Damage is shooter-side: `hit` was decided by the
 *  shooter against its view of the target; the receiver just applies it. */
/** Ölü efektleri elemek için modül seviyesinde yüklem: kare/adım başına yeni
 *  closure (ve dolayısıyla çöp) üretilmesin. */

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
    }
  | {
      id: string;
      type: "samuraiCrack";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      dmg: number;
      hit: boolean;
    }
  | { id: string; type: "samuraiStart"; facing: number; vy: number }
  // ⚔️ Yakın dövüş: başlangıç (rakip ekranında da animasyon oynasın) ve
  // her vuruşun hasarı (atıcı tarafı belirler, hedef uygular).
  | {
      id: string;
      type: "meleeStart";
      facing: number;
      vy: number;
      leap: boolean;
    }
  | { id: string; type: "meleeHit"; dmg: number; hit: boolean };

/** What one phone publishes about its fighter every ~100 ms. */
interface PvpPayload {
  x: number;
  y: number;
  facing: number;
  /** Dikey bakış yönü (−1 yukarı / +1 aşağı) — ulti dönüşü için. */
  vy: number;
  moving: boolean;
  hp: number;
  superCharge: number;
  samuraiCharge: number;
  dashT: number;
  dashVX: number;
  dashVY: number;
  phase: number;
  projs: PvpProj[];
  events: PvpEvent[];
  /** Bush stealth: wall-clock timestamp until which the fighter is revealed. */
  revealAt?: number;
  /** Vuruş sarsıntısı: kalan stun süresi (saniye). Rakip ekranında da
   *  karakterin titremesi/savrulması için yayınlanır. */
  stun?: number;
  /** Düz vuruş animasyonunun kalan süresi (saniye) — rakip ekranında da
   *  vuruş pozu ve cancel penceresi aynı okunsun diye yayınlanır. */
  atkAnimT?: number;
  /** ⚔️ Yakın dövüş salınımının kalan süresi (saniye) + atlama/aşama durumu.
   *  Snapshot tazeler; aşama/atla bilgisi animasyonun doğru pozda akmasını
   *  sağlar (başlangıç olayı zaten gönderilir). */
  meleeT?: number;
  meleeCd?: number;
  meleeLeap?: boolean;
  /** 🎯 Ateş/yetenek yönü (radyan, `atan2(dx, dy)`). Rakip ekranında da gövde
   *  atış yönüne dönsün diye yayınlanır. */
  aimYaw?: number;
  /** Yön kilidinin kalan süresi (saniye) — snapshot geldikçe tazelenir. */
  aimYawT?: number;
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
    level: 1,
    hp: HP,
    maxHp: HP,
    x,
    y,
    facing,
    phase: 0,
    moving: false,
    atkCd: 0,
    /* Düz vuruş animasyonunun kalan süresi (0 = hazır). */
    atkAnimT: 0,
    superCharge: 0,
    samuraiCharge: 0,
    samuraiUltT: 0,
    samuraiUltHit: false,
    // Yakın dövüş (Kraliyet Savaşçısı 3. yetenek).
    meleeT: 0,
    meleeCd: 0,
    meleeLeap: false,
    meleeStrikes: 0,
    dashT: 0,
    dashVX: 0,
    dashVY: 0,
    dashHit: false,
    lastHitAt: -9999,
    hitStunT: 0,
    hitStunK: 0,
    kbVX: 0,
    kbVY: 0,
    vy: 0,
    revealUntil: -9999,
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

  const player = useRef<BattleFighter>(
    newFighter(
      playerName,
      playerConfig,
      playerEquipped,
      playerAbility,
      400,
      100,
      1,
    ),
  );
  const bot = useRef<BattleFighter>(
    newFighter(
      opponentName,
      opponentConfig,
      opponentEquipped,
      opponentAbility,
      1300,
      1000,
      -1,
    ),
  );
  // Resolve the local spawn after the asynchronous GLB mask is available.
  const spawnResolvedRef = useRef(false);

  const ownProjs = useRef<PvpProj[]>([]);
  const remoteProjs = useRef(new Map<string, PvpProj>());
  const projs = useRef<BattleProj[]>([]); // merged render list
  const fxs = useRef<BattleFx[]>([]);
  const pendingEvents = useRef<PvpEvent[]>([]);
  const eventBornAt = useRef(new Map<string, number>());
  const seenEvents = useRef(new Map<string, number>());
  const evSeq = useRef(0);
  const projSeq = useRef(0);
  /** Uzak mermi eşleştirmesi için artan damga. */
  const remoteTick = useRef(0);
  // ♻️ Nesne havuzu (object pooling): mermiler `destroy()` edilmez — havuza geri
  // verilir ve bir sonraki atışta yeniden kullanılır. Böylece ateş/çarpışma
  // sırasında yeni nesne ayrılmaz ve Garbage Collector takılma yaratmaz.
  const projPool = useMemo(
    () =>
      createObjectPool<PvpProj>(() => ({
        id: "",
        owner: "player",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        dmg: 0,
        r: 0,
        travelled: 0,
        pierce: false,
        explodeR: undefined,
      })),
    [],
  );

  // Latest snapshot of the remote fighter (targets for the lerp).
  const remoteTarget = useRef({
    x: 1280,
    y: 920,
    facing: -1,
    vy: 0,
    moving: false,
    hp: HP,
    superCharge: 0,
    phase: 0,
    stun: 0,
    atkAnimT: 0,
    meleeT: 0,
    meleeLeap: false,
    aimYaw: 0,
    aimYawT: 0,
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
  const [result, setResult] = useState<
    "win" | "lose" | "draw" | "forfeit" | null
  >(null);
  const [attackHeld, setAttackHeld] = useState(false);
  const [vsShow, setVsShow] = useState(true);
  const [phase, setPhase] = useState<"loading" | "waiting" | "fight">(
    "loading",
  );
  phaseRef.current = phase;
  const startedRef = useRef(false);
  // Android APK: savaş alanı bağlıyken ekran yataya kilitlenir, çıkışta
  // (ya da web'de köprü yokken) hiçbir şey değişmez.
  useAndroidBattleOrientation();
  // Yetenek butonları: basılı tut → nişan al, bırak → ateş et (skillshot).
  useAbilityAim(
    arenaRef,
    (kind, dx, dy) => {
      aimState.kind = kind;
      aimState.dx = dx;
      aimState.dy = dy;
      if (kind === "ult") actionsRef.current.samuraiSuper();
      else actionsRef.current.super();
    },
    (kind) => {
      const f = player.current;
      if (kind === "ult")
        return (
          isSamuraiFighter(f) && f.samuraiCharge >= 1 && f.samuraiUltT <= 0
        );
      return f.superCharge >= 1;
    },
  );
  // Yatay mod: telefon dikeyken düello başlamaz ve simülasyon duraklar.
  const gate = useLandscapeGate();
  const rotateRef = useRef(gate.required);
  useEffect(() => {
    rotateRef.current = gate.required;
  }, [gate.required]);

  // Yatay mod yönergesindeki "Savaştan çık": sahne dışından gelen istek.
  useEffect(() => {
    const leave = () => onExitRef.current(false, "leave");
    window.addEventListener(DUEL_LEAVE_EVENT, leave);
    return () => window.removeEventListener(DUEL_LEAVE_EVENT, leave);
  }, []);
  const [loadPct, setLoadPct] = useState(0);
  const [loadStep, setLoadStep] = useState(0);
  const [hud, setHud] = useState({
    ph: HP,
    ohp: HP,
    pc: 0,
    oc: 0,
    sc: 0,
    atkReady: true,
    hidden: false,
  });
  // Üst şeritteki maç saati (simülasyonla senkron ilerler).
  const [clock, setClock] = useState(0);
  const matchTRef = useRef(0);
  const clockShownRef = useRef(0);
  const lastHudRef = useRef({
    ph: -1,
    ohp: -1,
    pc: -1,
    oc: -1,
    sc: -1,
    atkReady: false,
    hidden: false,
  });
  const actionsRef = useRef({
    attack: () => {},
    super: () => {},
    samuraiSuper: () => {},
    melee: () => {},
    click: (_x: number, _y: number) => {},
  });

  // ── MOBA HUD köprüsü ──────────────────────────────────────────────
  // Üst şeritteki skor: iki oyuncunun birbirine isabet sayısı.
  const scoreRef = useRef({ p: 0, o: 0 });
  // HUD'un her karede okuduğu anlık değerler (React state'e yazılmaz).
  const mobaLiveRef = useRef<MobaHudLive>({
    phase: "loading",
    clock: 0,
    vsShow: false,
    ph: HP,
    ohp: HP,
    pc: 0,
    oc: 0,
    sc: 0,
    atkReady: true,
    samurai: false,
    hidden: false,
  });
  mobaLiveRef.current = {
    phase,
    clock,
    vsShow,
    ph: hud.ph,
    ohp: hud.ohp,
    pc: hud.pc,
    oc: hud.oc,
    sc: hud.sc,
    atkReady: hud.atkReady,
    samurai: isSamuraiFighter(player.current),
    hidden: hud.hidden,
  };
  useEffect(
    () =>
      registerMobaHud(joystickRef, {
        player,
        bot,
        live: mobaLiveRef,
        score: scoreRef,
        // MOBA yetenek barı: yakın dövüş yuvası sahnenin eylemini çağırır.
        actions: actionsRef,
        meta: {
          playerName,
          opponentName,
          playerEmoji: abilityOf(playerAbility).emoji,
          opponentEmoji: abilityOf(opponentAbility).emoji,
          playerLevel: player.current.level,
          opponentLevel: player.current.level,
          maxHp: HP,
          atkCd: ATK_CD,
          exit: () => onExitRef.current(false, "leave"),
        },
      }),
    [],
  );

  /* ------------------------- local FX helpers ------------------------- */

  // ✨ VFX katmanı: bütün tek seferlik efektler bu veri yolundan geçer.
  const addFx = (fx: BattleFx) => {
    fxs.current.push(fx);
  };
  const vfx = useMemo(() => createVfxBus(addFx), []);
  const floatText = vfx.text;
  const circleFx = vfx.ring;
  const burstFx = vfx.burst;
  const smokeFx = vfx.smoke;

  /** I took damage (a remote hit event landed on me). */
  const damageMe = (dmg: number) => {
    const p = player.current;
    if (resultRef.current || p.hp <= 0) return;
    p.hp = Math.max(0, p.hp - dmg);
    p.lastHitAt = performance.now();
    // Skor tablosu: alınan isabet rakibe yazılır.
    scoreRef.current.o += 1;
    // Vuruş tepkisi: ben sarsılır ve rakibin tersine savrulurum (savrulma
    // hızı yerel simülasyonda çarpışma kontrollü uygulanır).
    applyHitReaction(p, bot.current.x, bot.current.y, dmg);
    // Taking damage in a bush reveals the victim (Brawl-style).
    p.revealUntil = performance.now() + BUSH_REVEAL_MS;
    floatText(p.x, p.y - 8, `-${dmg}`, "#ff6b6b");
    playSound("hurt", { volume: 0.9, rate: 0.82 + Math.random() * 0.2 });
    playSound("hit", { volume: 0.35, rate: 1.5 });
    // ⚡ Kraliyet ultisi yalnız savaşta dolar (hasar aldıkça).
    gainUltCharge(p, ULT_CHARGE_TAKE);
    const arenaEl = arenaRef.current;
    if (arenaEl) {
      arenaEl.classList.remove("battle-shake");
      void arenaEl.getBoundingClientRect();
      arenaEl.classList.add("battle-shake");
    }
  };

  /** Rakibe isabet ettim: yerel sarsıntı + vuruş işareti. Hasarı karşı
   *  telefon uygular; burada sadece anında görünen tepki verilir. */
  const hitRemote = (dmg: number) => {
    const b = bot.current;
    const p = player.current;
    b.lastHitAt = performance.now();
    applyHitReaction(b, p.x, p.y, dmg);
    // Skor tablosu: isabetim oyuncu tarafına yazılır.
    scoreRef.current.p += 1;
  };

  /** Apply a one-shot combat event sent by the other phone. */
  const applyRemoteEvent = (ev: PvpEvent) => {
    const p = player.current;
    const b = bot.current;
    if (resultRef.current || p.hp <= 0) return;
    switch (ev.type) {
      case "hit":
        damageMe(ev.dmg);
        break;
      case "beam": {
        const x2 = ev.x1 + Math.cos(ev.angle) * ev.len;
        const y2 = ev.y1 + Math.sin(ev.angle) * ev.len;
        // Rakip yetenek kullandı: onun rig'inde de kılıç izi tetiklensin
        // (yerel oyuncuda SkillComponent yazar, burada ağ olayından yazılır).
        b.castFxT = 1;
        addFx({
          kind: "beam",
          x1: ev.x1,
          y1: ev.y1,
          x2,
          y2,
          ttl: 0.32,
          maxTtl: 0.32,
        });
        if (ev.hit) damageMe(ev.dmg);
        break;
      }
      case "dashHit":
        b.castFxT = 1;
        damageMe(ev.dmg);
        break;
      case "explode": {
        // Ateş Topu: soğuk / ruhani alev patlaması (fiziksel ateş değil).
        b.castFxT = 1;
        vfx.coldFlame(ev.x, ev.y, ev.r);
        if (ev.hit) damageMe(ev.dmg);
        break;
      }
      case "samuraiStart":
        // Rakip ultiye başladı: kendi ekranımızda da aynı animasyon oynasın.
        b.samuraiUltT = 0.82;
        b.samuraiUltHit = true; // hasar samuraiCrack olayından gelir
        b.facing = ev.facing;
        b.vy = ev.vy;
        break;
      case "samuraiCrack":
        // Rakibin yarığı: aynı VFX yolu (bloom nabzı da aynı karede tetiklenir).
        vfx.crack(ev.x1, ev.y1, ev.x2, ev.y2);
        if (ev.hit) damageMe(ev.dmg);
        break;
      case "meleeStart":
        // Rakip yakın dövüşe başladı: kendi ekranımızda da aynı salınım
        // (sol/sağ kesiş + atlama) oynar. Süre animasyonla aynı kaynaktan.
        b.meleeLeap = ev.leap;
        b.meleeStrikes = 0;
        b.samuraiUltT = 0;
        b.meleeT = meleeDuration(ev.leap);
        b.facing = ev.facing;
        b.vy = ev.vy;
        break;
      case "meleeHit":
        // Rakibin kesişi: vuruş geri bildirimi + hasar (atıcı tarafı belirledi).
        // Efekt, saldıranın kendi katmanından çıkar (kaba beyaz küre, iri duman
        // bloğu ve tam ekran bloom parlaması yerine yumuşak toz + kıvılcım).
        if (ev.hit) {
          pushHitImpact(b, {
            kind: "strike",
            x: b.x,
            y: b.y,
            hit: true,
            heavy: true,
            t: performance.now(),
          });
          damageMe(ev.dmg);
        }
        break;
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
      samuraiCharge: 0,
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
      vy: typeof d.vy === "number" ? d.vy : 0,
      moving: !!d.moving,
      hp: d.hp,
      superCharge: d.superCharge,
      phase: d.phase,
      stun: typeof d.stun === "number" ? d.stun : 0,
      atkAnimT: typeof d.atkAnimT === "number" ? d.atkAnimT : 0,
      meleeT: typeof d.meleeT === "number" ? d.meleeT : 0,
      meleeLeap: !!d.meleeLeap,
      aimYaw: typeof d.aimYaw === "number" ? d.aimYaw : 0,
      aimYawT: typeof d.aimYawT === "number" ? d.aimYawT : 0,
    };
    // Bush stealth: mirror the opponent's reveal deadline. It travels as a
    // wall-clock timestamp so both phones agree even though
    // performance.now() is device-local. Only refresh while it is still in
    // the future — once it expires the deadline decays naturally again.
    if (typeof d.revealAt === "number" && d.revealAt > Date.now()) {
      bot.current.revealUntil =
        performance.now() + Math.max(0, d.revealAt - Date.now());
    }
    // Rakip mermileri snapshot ile eşitlenir (drift düzeltmesi). Harita ve
    // nesneler yeniden kullanılır: id zaten varsa alanlar yerinde güncellenir
    // (yeni Map/nesne ayrılmaz), snapshot'ta olmayan mermi havuza geri verilir.
    const live = remoteProjs.current;
    const tick = ++remoteTick.current;
    for (const pr of d.projs ?? []) {
      let obj = live.get(pr.id);
      if (!obj) {
        obj = projPool.acquire();
        live.set(pr.id, obj);
      }
      obj.id = pr.id;
      obj.owner = "bot";
      obj.x = pr.x;
      obj.y = pr.y;
      obj.vx = pr.vx;
      obj.vy = pr.vy;
      obj.dmg = pr.dmg;
      obj.r = pr.r;
      obj.travelled = pr.travelled;
      obj.pierce = pr.pierce;
      obj.explodeR = pr.explodeR;
      obj.seenTick = tick;
    }
    for (const [id, obj] of live) {
      if (obj.seenTick !== tick) {
        live.delete(id);
        projPool.release(obj);
      }
    }
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
    opts: {
      r?: number;
      pierce?: boolean;
      speed?: number;
      explodeR?: number;
    } = {},
  ) => {
    const p = player.current;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = opts.speed ?? PROJ_SPEED;
    playSound("shoot", { volume: 0.6 });
    // ♻️ Havuzdan alınır: yeni nesne ayrılmaz, eski mermi nesnesi yeniden dolar.
    const proj = projPool.acquire();
    proj.id = `pr${projSeq.current++}`;
    proj.owner = "player";
    // ELDEN ATIŞ: mermi karakterin merkezinden değil, nişan yönünde öne ve
    // el tarafına kaymış noktadan çıkar. Ofset bilerek küçük tutulur
    // (gövde yarıçapının içinde); duvara yaslanmışken atış yine güvenli.
    const sideX = -dy / d;
    const sideY = dx / d;
    proj.x = p.x + (dx / d) * MUZZLE.fwd * S + sideX * MUZZLE.side * S;
    proj.y = p.y + (dy / d) * MUZZLE.fwd * S + sideY * MUZZLE.side * S;
    proj.vx = (dx / d) * speed;
    proj.vy = (dy / d) * speed;
    proj.dmg = dmg;
    proj.r = opts.r ?? 14;
    proj.travelled = 0;
    proj.pierce = opts.pierce ?? false;
    proj.explodeR = opts.explodeR;
    ownProjs.current.push(proj);
    // Tavanı aşan en eski mermiler yok edilmez, havuza geri verilir.
    if (ownProjs.current.length > 24) {
      const excess = ownProjs.current.length - 24;
      for (let i = 0; i < excess; i++) projPool.release(ownProjs.current[i]);
      ownProjs.current.splice(0, excess);
    }
  };

  /** My fireball detonated — FX here, damage event to the target. */
  const explodeAt = (pr: PvpProj) => {
    const r = pr.explodeR ?? 130;
    playSound("explode", { volume: 0.9, rate: 0.85 + Math.random() * 0.3 });
    // Ateş Topu: fiziksel turuncu ateş yerine antik büyü / soğuk alev.
    // Hasar yarıçapı (r) aynı kalır — sadece görsel küçülür.
    vfx.coldFlame(pr.x, pr.y, r);
    const b = bot.current;
    const hit = Math.hypot(b.x - pr.x, b.y - pr.y) < r;
    pushEvent({ type: "explode", x: pr.x, y: pr.y, r, dmg: pr.dmg, hit });
    if (hit) {
      floatText(b.x, b.y - 8, `-${pr.dmg}`, "#fbbf24");
      hitRemote(pr.dmg);
      gainUltCharge(player.current, ULT_CHARGE_DEAL);
    }
  };

  /* ---------------------------- yetenek katmanı -------------------------- */
  // SkillHost: yetenek KURALLARI (cooldown, MAX_RANGE nişanı, atış tablosu)
  // SkillComponent'te; hasar ve karşı cihaza giden ağ olayları burada bağlanır.
  const skillHost: SkillHost = {
    vfx,
    sound: playSound,
    spawn: (_caster, target, dmg, opts) =>
      spawnProj(target.x, target.y, dmg, opts),
    onBeam: (caster, enemy, aim, len, hit) => {
      // Işın isabet etmese de karşı cihaza gider: rakip ışığı görür.
      pushEvent({
        type: "beam",
        x1: caster.x,
        y1: caster.y,
        angle: Math.atan2(aim.y, aim.x),
        len,
        dmg: 300,
        hit,
      });
      if (hit) {
        floatText(enemy.x, enemy.y - 8, "-300", "#fbbf24");
        hitRemote(300);
      }
    },
    canLock: (enemy, caster) => !isHiddenFrom(enemy, caster),
    // Ulti başlangıcı karşı cihaza da gider: rakip aynı yöne döner.
    onUltStart: (caster) =>
      pushEvent({ type: "samuraiStart", facing: caster.facing, vy: caster.vy }),
  };

  /** Samuray 2. ultisi: kural + gövde yönü SkillComponent'te, olay karşı cihaza. */
  const useSamuraiSuper = () => {
    castUltimate(player.current, bot.current, skillHost);
  };

  /** ⚔️ Yakın dövüş: kural MeleeComponent'te, vuruşlar karşı cihaza olay
   *  olarak gider (atıcı hasarı belirler, hedef uygular). */
  const useMelee = () => {
    const plan = startMelee(player.current, bot.current, skillHost, true, 0, 0);
    if (!plan) return;
    player.current.revealUntil = performance.now() + BUSH_REVEAL_MS;
    pushEvent({
      type: "meleeStart",
      facing: player.current.facing,
      vy: player.current.vy,
      leap: plan.leap,
    });
  };

  const tryAttack = useCallback((aimX?: number, aimY?: number) => {
    const p = player.current;
    // Düz vuruş planı (cooldown + menzil nişanı + animasyon) SkillComponent'te.
    const plan = planBasicAttack(
      p,
      bot.current,
      skillHost,
      startedRef.current && !resultRef.current,
      aimX,
      aimY,
    );
    if (!plan) return;
    spawnProj(plan.end.x, plan.end.y, BASE_DMG);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trySuper = useCallback(() => {
    const p = player.current;
    if (
      !startedRef.current ||
      resultRef.current ||
      p.hp <= 0 ||
      p.dashT > 0 ||
      p.meleeT > 0 ||
      p.superCharge < 1
    )
      return;
    // Skillshot: buton basılı tutulup nişan alındıysa o yön; yoksa yalnızca
    // menzil içindeki rakibe kilit; o da yoksa bakış yönü.
    castSuper(p, bot.current, skillHost, planAim(p, bot.current, skillHost));
    // Using an ability inside a bush reveals the caster for a moment.
    p.revealUntil = performance.now() + BUSH_REVEAL_MS;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clamp = (v: number, a: number, b: number) =>
    Math.min(Math.max(v, a), b);

  // Yürüyüş alanı GÖRÜNMEZ DÜZ TABAN COLLIDER'ıdır (BattleMapModel): fizik,
  // haritanın engebeli üçgenleri yerine düz bir zemin üzerinden kayar; sadece
  // KALIN gerçek engeller (kaya/duvar/kule/üs) hareketi keser. Düz yolda arazi
  // girintilerine ve mikro dikişlere takılma olmaz.
  const hitsObstacle = (cx: number, cy: number, r: number) =>
    hitsRockCollision(cx, cy, r);

  // Hareket matematiği MovementComponent'te: kapsül tabanı, duvar boyunca
  // kayma, step offset ve alt adım (düz yolda takılma olmaz).
  const ground: GroundConfig = {
    radius: FIGHTER_R,
    blocked: hitsObstacle,
    bounds: { w: ARENA_W, h: ARENA_H, pad: 40 },
  };
  const moveFighter = (f: BattleFighter, dx: number, dy: number, dt: number) =>
    moveOnGround(f, dx, dy, dt, ground);

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
    // Sabit zaman adımı: kare hızı düşse bile simülasyon gerçek zamanda
    // ilerler (oyun ağır çekime düşmez).
    const SIM_STEP = 1 / 60;
    let simAcc = 0;
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
      if (
        e.code === "KeyE" ||
        e.code === "ShiftLeft" ||
        e.code === "ShiftRight"
      )
        actionsRef.current.super();
      // F = yakın dövüş (Kraliyet Savaşçısı) — dokunmatik altın yuvanın
      // klavye karşılığı; iki arenada da aynı.
      if (e.code === "KeyF") actionsRef.current.melee();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
      if (e.code === "Space" || e.code === "Enter")
        aimRef.current.active = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    actionsRef.current = {
      attack: tryAttack,
      super: trySuper,
      samuraiSuper: useSamuraiSuper,
      melee: useMelee,
      // Savaş alanında tıklayarak gitme kapalı: tek hareket girdisi joystick.
      click: (_x: number, _y: number) => {},
    };

    let raf = 0;
    let last = performance.now();

    const step = (dt: number) => {
      const p = player.current;
      const b = bot.current;
      if (resultRef.current) return;
      if (isSamuraiFighter(p)) {
        // Ulti zamanla dolmaz: yalnız savaşta dolar (bkz. `damageMe` /
        // `gainUltCharge` çağrıları) ve bar ancak %100'de kullanılabilir.
        if (p.samuraiUltT > 0) {
          p.samuraiUltT -= dt;
          if (!p.samuraiUltHit && p.samuraiUltT < 0.31) {
            p.samuraiUltHit = true;
            // Yarık kılıcın yere indiği noktadan başlar ve en fazla MAX_RANGE
            // ilerler. Yön: menzil çemberi içinde rakip varsa KİLİTLENİR (ulti
            // ona gider, çapraz hedef kaçmaz); yoksa bakış yönü.
            const locked = resolveAim(p, b, 0, 0, {
              canLock: true,
              preferLock: true,
            });
            const dir = locked.locked ? locked : bodyDir(p);
            // 🎯 Kılıç yere indiği anda gövde yarığın TAM yönüne kilitlenir
            // (hedef kaçmış olsa bile kılıç nereye iniyorsa gövde oraya
            // bakar; facing/vy 4 yönlü olduğu için çapraz kaçıyordu).
            faceAimYaw(p, dir.x, dir.y, 0.4);
            // Hasar yalnızca hat menzil içinde ve yönündeyse işler.
            const hit = aimedHit(p, dir, b, { rangePx: MAX_RANGE_PX });
            const crack = emitUltCrack(p, dir.x, dir.y, skillHost, {
              trail: true,
            });
            pushEvent({
              type: "samuraiCrack",
              x1: crack.impactX,
              y1: crack.impactY,
              x2: crack.x2,
              y2: crack.y2,
              dmg: SAMURAI_ULTIMATE_DAMAGE,
              hit,
            });
            if (hit) {
              floatText(b.x, b.y - 8, `-${SAMURAI_ULTIMATE_DAMAGE}`, "#fbbf24");
              hitRemote(SAMURAI_ULTIMATE_DAMAGE);
              gainUltCharge(player.current, ULT_CHARGE_DEAL);
            }
          }
        }
      }

      // --- remote fighter: lerp toward the latest snapshot ---
      const t = remoteTarget.current;
      const k = Math.min(1, dt * 9);
      b.x += (t.x - b.x) * k;
      b.y += (t.y - b.y) * k;
      b.facing = t.facing;
      b.vy = t.vy;
      b.moving = t.moving;
      // 🎯 Rakip ateş ettiğinde/yetenek kullandığında gövdesi hedefe dönsün:
      // karşı telefondan yayınlanan yön kilidi buraya aynalanır (yerelde her
      // kare azalır, snapshot geldikçe tazelenir).
      tickAimYaw(b, dt);
      // Rakip de attığı yönde kalır: son nişan açısı kilidi bittiğinde
      // kaybolmasın diye aimYaw her snapshot'ta aynalanır (gövdenin kalıcı
      // bakışına `restYaw` olarak yazılır).
      if (typeof t.aimYaw === "number") b.aimYaw = t.aimYaw;
      if (t.aimYawT > 0) {
        b.aimYawT = Math.max(b.aimYawT ?? 0, t.aimYawT);
      }
      // Rakibin samuray-kılıç ultisi animasyonu burada akar.
      if (b.samuraiUltT > 0) b.samuraiUltT -= dt;
      if (t.moving) b.phase += dt * 10;
      // Rakibin sarsıntısı: kendi telefonundan yayınlanan stun süresi +
      // yerel vuruş tepkisi. Proxy'de süre kendiliğinden azalır.
      b.hitStunT = Math.max(b.hitStunT - dt, t.stun);
      b.hitStunK = b.hitStunT > 0 ? Math.max(b.hitStunK, 1) : 0;
      // Rakibin düz vuruş animasyonu (kendi telefonundan yayınlanır) —
      // proxy'de süre kendiliğinden azalır, snapshot onu tazeler.
      b.atkAnimT = Math.max(b.atkAnimT - dt, t.atkAnimT);
      // Rakibin yakın dövüş salınımı aynı desenle akar (meleeStart olayı
      // başlatır, snapshot tazeler; atlama bilgisi pozu besler).
      b.meleeT = Math.max(b.meleeT - dt, t.meleeT);
      b.meleeLeap = t.meleeLeap;
      if (t.hp < b.hp - 1) {
        // enemy took a hit on their phone — reflect it here
        const diff = Math.round(b.hp - t.hp);
        hitRemote(diff);
        floatText(b.x, b.y - 8, `-${diff}`, "#fbbf24");
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
        if (pr.travelled >= PROJ_RANGE) {
          remoteProjs.current.delete(pr.id);
          projPool.release(pr);
        }
      }

      // freeze the sim until both fighters are connected + loading finished
      if (phaseRef.current !== "fight" || !startedRef.current) return;

      if (!spawnResolvedRef.current) {
        // false → GLB çarpışma ızgarası henüz hazır değil; gelecek karede
        // yeniden denenir.
        spawnResolvedRef.current = resolveSpawn(p, FIGHTER_R);
      }

      // --- disconnect guard ---
      if (
        remoteConnected.current &&
        performance.now() - lastRemoteAt.current > DISCONNECT_MS
      ) {
        endBattle("forfeit");
        return;
      }

      tickCooldown(p, dt);
      // ⚡ SÜRELİ BUTON: süper bar yalnız zamanla, yavaşça dolar (şarj
      // tablosu — SkillComponent). Kraliyet ultisi savaşta dolar, düz vuruş
      // ise kendi bekleme süresiyle (`ATK_CD`) çalışır.
      tickSuperPassive(p, dt);
      // Yakın dövüş bekleme süresi (melee) MeleeComponent'te yönetilir.
      tickMelee(p, dt);
      // 🎯 Atış/yetenek yönü kilidi zamanla bırakılır (bkz. faceAimYaw).
      tickAimYaw(p, dt);

      // Zemindeki nişan göstergesi düz vuruş nişanını paylaşılan durumdan okur.
      aimState.basic = aimRef.current.active;
      aimState.basicDx = aimRef.current.dx;
      aimState.basicDy = aimRef.current.dy;
      // run-and-gun: hold the attack button (or Space) to keep firing
      // Sarsılırken ateş edilemez: ulti/beam yiyen karakter bir an "kilitli".
      if (aimRef.current.active && p.atkCd <= 0 && p.hitStunT <= 0) {
        tryAttack(aimRef.current.dx, aimRef.current.dy);
      }

      // --- movement (joystick + klavye) ---
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
      } else {
        const jx = joystickRef.current.x;
        const jy = joystickRef.current.y;
        const joystickMagnitude = Math.hypot(
          joystickRef.current.x,
          joystickRef.current.y,
        );
        if (joystickMagnitude > 0.1) {
          // Preserve the complete analog vector. Dominant-axis selection made
          // diagonal drags snap and occasionally look like input was lost.
          vx = joystickRef.current.x;
          vy = joystickRef.current.y;
        }
      }
      // ── Düz vuruş animasyonu + cancel penceresi (kiting / hit-and-run) ──
      // Windup boyunca karakter köklenir; pencere açıldıktan sonra joystick'e
      // dokunmak bitiş animasyonunu keser ve karakter hemen yürümeye başlar.
      if (p.hitStunT > 0 || p.dashT > 0) {
        // Sarsılma / dash animasyonu devralır: vuruş animasyonu iptal edilir.
        p.atkAnimT = 0;
      } else {
        const atkAnim = stepAttackAnim(p, dt, vx !== 0 || vy !== 0);
        if (atkAnim.locked) {
          // Windup: karakter köklenmiş → hareket girdisi yok sayılır.
          vx = 0;
          vy = 0;
        } else if (atkAnim.canceled) {
          // Bitiş animasyonu kesildi — adım tozu ile hissettir.
          smokeFx(p.x, p.y - 4, 2, 26);
        }
      }
      // ── Vuruş sarsıntısı: ulti/ağır vuruş yiyen karakter bir an kontrolü
      // kaybeder; savrulma hareketi burada (çarpışma kontrollü) uygulanır. ──
      const pStunned = stepHitStun(p, dt, moveFighter);
      if (pStunned && p.meleeT > 0) {
        // Sarsılma salınımı böler: yakın dövüş iptal edilir.
        p.meleeT = 0;
        p.meleeStrikes = 0;
      }
      if (pStunned) {
        // Sarsılıyor: girdi yok sayılır, savrulma yukarıda uygulandı.
      } else if (p.meleeT > 0) {
        // ⚔️ Yakın dövüş: sol/sağ kesişler + (rakip yakınsa) üstüne atlama.
        // Vuruşlar karşı cihaza olay olarak gider; hasar orada uygulanır.
        const strikes = stepMelee(p, b, dt, {
          leapMove: (f, dx, dy, dts) => moveFighter(f, dx, dy, dts),
          vfx,
        });
        if (strikes) {
          for (const s of strikes) {
            pushEvent({ type: "meleeHit", dmg: s.dmg, hit: s.hit });
            if (s.hit) {
              floatText(b.x, b.y - 8, `-${s.dmg}`, "#fbbf24");
              hitRemote(s.dmg);
              gainUltCharge(player.current, ULT_CHARGE_DEAL);
              playSound(s.stage >= 2 ? "explode" : "hit", {
                volume: s.stage >= 2 ? 0.5 : 0.8,
                rate: s.stage >= 2 ? 0.9 : 1.35,
              });
            } else {
              playSound("thud", { volume: 0.3, rate: 1.5 });
            }
          }
        }
      } else if (p.dashT > 0) {
        stepDash(p, dt, ground);
        if (!p.dashHit && Math.hypot(b.x - p.x, b.y - p.y) < DASH_HIT_R) {
          p.dashHit = true;
          pushEvent({ type: "dashHit", dmg: 200 });
          floatText(b.x, b.y - 8, "-200", "#fbbf24");
          burstFx(b.x, b.y - 40, 90, "#e0f2fe", 0.4);
          hitRemote(200);
          playSound("hit", { volume: 0.9, rate: 1.1 });
          gainUltCharge(player.current, ULT_CHARGE_DEAL);
        }
        if (p.dashT <= 0) p.dashHit = false;
      } else {
        moveFighter(p, vx * 90 * dt, vy * 90 * dt, dt);
      }

      // --- footsteps while walking ---
      if (p.moving && p.dashT <= 0 && p.hitStunT <= 0) {
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
          vfx.coldFlameImpact(nx, ny, 46);
          swapRemove(ownProjs.current, i);
          projPool.release(pr);
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
            floatText(b.x, b.y - 8, `-${pr.dmg}`, "#fbbf24");
            hitRemote(pr.dmg);
            gainUltCharge(player.current, ULT_CHARGE_DEAL);
            vfx.coldFlameImpact(pr.x, pr.y - 40, 62);
            playSound("hit", {
              volume: 0.85,
              rate: 0.95 + Math.random() * 0.25,
            });
          }
          if (!pr.pierce) {
            swapRemove(ownProjs.current, i);
            projPool.release(pr);
            continue;
          }
        }
        if (pr.explodeR && pr.travelled >= FIREBALL_RANGE_PX) {
          explodeAt(pr);
          swapRemove(ownProjs.current, i);
          projPool.release(pr);
        } else if (pr.travelled >= PROJ_RANGE && !pr.explodeR) {
          swapRemove(ownProjs.current, i);
          projPool.release(pr);
        }
      }

      // --- tek seferlik efektler: tek geçişte ömür azaltma + temizlik ---
      tickFx(fxs.current, dt);

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
        if (rotateRef.current) {
          // Dikey mod: yerel simülasyon durur (karakterler donar).
          last = now;
        } else {
          const dt = Math.min(now - last, 500) / 1000;
          last = now;
          simAcc += dt;
          let steps = 0;
          while (simAcc >= SIM_STEP && steps < 5) {
            step(SIM_STEP);
            simAcc -= SIM_STEP;
            steps++;
          }
          if (steps === 5) simAcc = 0;
          // --- maç saati (üst şerit) ---
          if (!resultRef.current) {
            matchTRef.current += dt;
            const secs = Math.floor(matchTRef.current);
            if (secs !== clockShownRef.current) {
              clockShownRef.current = secs;
              setClock(secs);
            }
          }
        }

        // ♻️ Render listesi: kare başına yeni dizi/nesne ayrılmaz. Aynı dizi
        // yerinde doldurulur ve mermi nesneleri kopyalanmaz — PvpProj zaten
        // BattleProj alanlarını taşır, tek fark `owner` etiketi.
        const merged = projs.current;
        let n = 0;
        for (const pr of ownProjs.current) {
          pr.owner = "player";
          merged[n++] = pr;
        }
        for (const pr of remoteProjs.current.values()) {
          pr.owner = "bot";
          merged[n++] = pr;
        }
        // Eski kareden kalan referanslar kırpılır (yeni dizi ayrılmaz).
        merged.length = n;

        // Süresi geçen olaylar YERİNDE süzülür: `.filter()` her karede yeni bir
        // dizi ayırıyordu (saniyede ~60 dizi + ~60 closure). Burada ne dizi ne
        // closure ayrılır, sadece elemanlar kaydırılır.
        const cutoff = performance.now() - EVENT_TTL_MS;
        const events = pendingEvents.current;
        const bornAt = eventBornAt.current;
        let w = 0;
        for (let i = 0; i < events.length; i++) {
          const ev = events[i];
          const born = bornAt.get(ev.id);
          if (born === undefined || born > cutoff) events[w++] = ev;
          else bornAt.delete(ev.id);
        }
        events.length = w;
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
            vy: p.vy,
            moving: p.moving,
            hp: Math.round(p.hp),
            superCharge: p.superCharge,
            samuraiCharge: p.samuraiCharge,
            dashT: p.dashT,
            dashVX: p.dashVX,
            dashVY: p.dashVY,
            phase: p.phase,
            // Rakip ekranında da sarsıntı görünsün diye kalan stun süresi.
            stun: p.hitStunT,
            // Rakip ekranında da vuruş pozu / cancel penceresi okunsun.
            atkAnimT: p.atkAnimT,
            // ⚔️ Yakın dövüş salınımı: rakip ekranında da aynı animasyon.
            meleeT: Math.max(0, p.meleeT),
            meleeCd: Math.max(0, p.meleeCd),
            meleeLeap: p.meleeLeap,
            // 🎯 Ateş/yetenek yönü: rakip ekranında da gövde attığı yöne döner.
            aimYaw: p.aimYaw ?? 0,
            aimYawT: p.aimYawT ?? 0,
            projs: ownProjs.current.map((pr) => ({ ...pr })),
            events: pendingEvents.current.map((e) => ({ ...e })),
            // Bush stealth: remaining reveal time as a wall-clock deadline.
            revealAt:
              p.revealUntil > 0
                ? p.revealUntil - performance.now() + Date.now()
                : 0,
            ts: now,
          });
        }

        // HUD (React, only when values changed)
        const ph = Math.round(player.current.hp / 5) * 5;
        const ohp = Math.round(bot.current.hp / 5) * 5;
        const pc = Math.round(player.current.superCharge * 20) / 20;
        const oc = Math.round(bot.current.superCharge * 20) / 20;
        const sc = Math.round(player.current.samuraiCharge * 20) / 20;
        const atkReady = player.current.atkCd <= 0;
        // Bush stealth: the player knows they are hidden whenever the remote
        // opponent can no longer see them — clear "you went invisible" feedback.
        const hidden = isHiddenFrom(player.current, bot.current);
        const lh = lastHudRef.current;
        if (
          ph !== lh.ph ||
          ohp !== lh.ohp ||
          pc !== lh.pc ||
          oc !== lh.oc ||
          sc !== lh.sc ||
          atkReady !== lh.atkReady ||
          hidden !== lh.hidden
        ) {
          lastHudRef.current = { ph, ohp, pc, oc, sc, atkReady, hidden };
          setHud({ ph, ohp, pc, oc, sc, atkReady, hidden });
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
    // Telefon yan çevrilene kadar süre sayılmaz: yükleme %0'da bekler.
    let elapsed = 0;
    let last = performance.now();
    const DURATION = 3000;
    const STEPS = 4;
    let raf = 0;
    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      if (!rotateRef.current) elapsed += delta;
      const t = Math.min(elapsed / DURATION, 1);
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
    // Telefon dikeyken düello başlamaz; yan çevrildiğinde otomatik başlar.
    if (remoteConnected.current && !rotateRef.current) {
      playSound("vs");
      setPhase("fight");
    }
  }, [phase, others, gate.required]);

  // battle ambience once the fight unlocks; VS banner auto-hides
  useEffect(() => {
    if (phase !== "fight") return;
    // Yatay mod yönergesi açıkken savaş sesleri de susar.
    if (gate.required) stopBattleAmbience();
    else void startBattleAmbience();
    const t = window.setTimeout(() => setVsShow(false), 1800);
    return () => window.clearTimeout(t);
  }, [phase, gate.required]);

  /** Nişan topuzu: hem tabanın ortasına hizalanır hem sürükleme yönüne
   *  kaydırılır (yatay modda HUD küçüldüğü için yüzdeyle ortalanır). */
  const setAimKnob = (dx: number, dy: number) => {
    if (attackKnobRef.current) {
      attackKnobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  };

  const abilityEmoji = abilityOf(playerAbility).emoji;
  const oppAbilityEmoji = abilityOf(opponentAbility).emoji;

  const RESULT_UI: Record<
    string,
    { emoji: string; title: string; msg: string }
  > = {
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
        {/* HUD top — compact strip: HP bars and names now float above each
            fighter's head inside the arena (world-space UI) */}
        <div className="battle-hud-top flex shrink-0 items-center gap-1.5 bg-gradient-to-r from-[#232b40] to-[#2a3350] px-3 py-2 text-white">
          <HudFighter
            name={playerName}
            pct={hud.ph / HP}
            abilityPct={hud.pc}
            tone="sky"
          />

          <div className="flex shrink-0 items-center gap-1.5">
            <HudClock seconds={clock} />
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

          <HudFighter
            name={opponentName}
            pct={hud.ohp / HP}
            abilityPct={hud.oc}
            tone="rose"
            align="right"
          />
        </div>

        {/* arena */}
        <main
          ref={arenaRef}
          className="relative min-h-0 flex-1 touch-none overflow-hidden"
        >
          {/* The supplied GLB is the only battlefield environment. */}
          <Arena3D
            playerRef={player}
            botRef={bot}
            projsRef={projs}
            fxsRef={fxs}
            aimRef={aimRef}
            onWorldClick={(x, y) => actionsRef.current.click(x, y)}
          />

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

          {/* bush stealth indicator — the player SEES that they went invisible */}
          {phase === "fight" && hud.hidden && (
            <div className="pointer-events-none absolute inset-x-0 top-4 z-[12] flex justify-center">
              <span className="battle-hidden-badge flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-950/75 px-4 py-1.5 text-xs font-extrabold tracking-wide text-emerald-200 shadow-lg backdrop-blur-sm">
                <span className="text-sm">🌿</span>
                GİZLENDİN
                <span className="hidden size-2 animate-pulse rounded-full bg-emerald-300 sm:block" />
              </span>
            </div>
          )}

          {/* controls */}
          <BattleJoystick stickRef={joystickRef} />

          <div className="battle-hud-controls pointer-events-none absolute right-3 bottom-3 z-10 flex flex-col items-end gap-2">
            {isSamuraiFighter(player.current) && (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  actionsRef.current.samuraiSuper();
                }}
                aria-label="Samuray yere vuruş ultisi"
                className={`battle-hud-ult pointer-events-auto flex size-14 items-center justify-center rounded-full border-4 shadow-xl transition-transform active:scale-90 ${
                  player.current.samuraiCharge >= 1
                    ? "border-amber-200 bg-gradient-to-br from-amber-300 to-orange-600 text-amber-950"
                    : "border-white/30 bg-white/10 text-white/70"
                }`}
              >
                <span className="battle-hud-icon text-xl">
                  {player.current.samuraiCharge >= 1
                    ? "⚔️"
                    : Math.round(player.current.samuraiCharge * 100) + "%"}
                </span>
              </button>
            )}
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                actionsRef.current.super();
              }}
              aria-label="Süper yetenek"
              className={`battle-hud-super pointer-events-auto flex size-16 items-center justify-center rounded-full border-4 shadow-xl transition-transform active:scale-90 ${
                hud.pc >= 1
                  ? "super-ready border-yellow-300 bg-gradient-to-br from-yellow-400 to-amber-500 text-amber-950"
                  : "border-white/30 bg-white/10 text-white/70"
              }`}
            >
              <span className="battle-hud-icon text-2xl font-extrabold">
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
                if (attackKnobRef.current) setAimKnob(0, 0);
              }}
              onPointerMove={(e) => {
                if (!aimRef.current.active) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                let dx = e.clientX - cx;
                let dy = e.clientY - cy;
                const d = Math.hypot(dx, dy);
                const R = Math.max(30, rect.width * 0.55);
                if (d > R) {
                  dx = (dx / d) * R;
                  dy = (dy / d) * R;
                }
                aimRef.current.dx = dx / R;
                aimRef.current.dy = dy / R;
                if (Math.abs(aimRef.current.dx) > 0.2) {
                  player.current.facing = aimRef.current.dx >= 0 ? 1 : -1;
                }
                if (attackKnobRef.current) setAimKnob(dx, dy);
              }}
              onPointerUp={() => {
                tryAttack(aimRef.current.dx, aimRef.current.dy);
                aimRef.current = { active: false, dx: 0, dy: 0 };
                setAttackHeld(false);
                if (attackKnobRef.current) setAimKnob(0, 0);
              }}
              onPointerCancel={() => {
                aimRef.current = { active: false, dx: 0, dy: 0 };
                setAttackHeld(false);
                if (attackKnobRef.current) setAimKnob(0, 0);
              }}
              onLostPointerCapture={() => {
                aimRef.current = { active: false, dx: 0, dy: 0 };
                setAttackHeld(false);
                if (attackKnobRef.current) setAimKnob(0, 0);
              }}
              aria-label="Saldır — basılı tut ve sürükle: nişan al"
              className={`battle-hud-attack pointer-events-auto relative flex size-20 touch-none items-center justify-center overflow-visible rounded-full border-4 border-white/70 text-3xl text-white shadow-xl transition-all duration-150 ${
                attackHeld
                  ? "scale-90 border-yellow-200 bg-gradient-to-br from-sky-300 to-blue-500 shadow-[0_0_28px_rgba(56,189,248,0.85)]"
                  : "bg-gradient-to-br from-sky-400 to-blue-600 active:scale-90"
              }`}
            >
              💥
              <span
                ref={attackKnobRef}
                className="battle-hud-attack-knob pointer-events-none absolute inset-0 m-auto flex size-7 items-center justify-center rounded-full border-2 border-white bg-white/85 text-[10px] shadow-lg"
              >
                🎯
              </span>
            </button>
            <span className="battle-hud-hint rounded-full bg-black/45 px-2 py-0.5 text-[9px] font-extrabold tracking-wide text-white/85">
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
