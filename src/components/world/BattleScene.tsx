// ⚔️ Brawl-styled duel arena — two fighters, HP bars, projectiles and supers.
// The whole simulation runs on a rAF loop mutating plain refs (no React
// re-renders); the Arena3D component reads those refs every frame and draws
// the scene in 3D (Three.js). React only renders the HUD, controls and the
// result screen.
import { Button } from "@/components/ui/button";
// 3D arena memo'lu sarmalayıcıdan gelir: HUD/sayaç state güncellemeleri
// tüm three.js öğe ağacını yeniden kurmasın (bkz. Arena3DView.tsx).
import { Arena3DView as Arena3D } from "@/components/world/Arena3DView";
import {
  AIM_TURN_HOLD_BASIC,
  ATK_CD,
  BUSH_REVEAL_MS,
  applyHitReaction,
  faceAimYaw,
  hasBombKit,
  hasUltimateKit,
  isHiddenFrom,
  isSamuraiFighter,
  SAMURAI_ULTIMATE_DAMAGE,
  startAttackAnim,
  stepAttackAnim,
  stepHitStun,
  supportsWebGL,
  tickAimYaw,
  tickAttackAnim,
  type BattleFighter,
  type BattleFx,
  type BattleProj,
} from "@/components/world/Arena3D";
// 🎯 Skillshot (menzilli nişan): sabit maksimum menzil + menzil içi otomatik
// kilit. Yetenekler artık düşmanı haritanın öbür ucundan kilitleyemez.
import {
  FIREBALL_RANGE_PX,
  MAX_RANGE_PX,
  aimState,
  aimedHit,
  bodyDir,
  resolveAim,
} from "@/components/world/arena/skillshot";
import { useAbilityAim } from "@/components/world/useAbilityAim";
// 💰 Cüzdan: kule alımı gerçek bakiyeden düşsün diye harcama sunucuya yazılır
// ve bakiye canlı profil sorgusundan okunur.
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { hitsRockCollision } from "@/components/world/BattleMapModel";
// 🛡️ Savunma kulesi ekonomisi + simülasyonu: satın alma, otomatik hedefleme,
// ateş (sahnenin mermi havuzundan) ve kule koruması tek modülde yaşar.
import {
  configureTowers,
  setTowerWallet,
  towerGuardAbsorb,
} from "@/engine/BattleTowers";
// 🏃 MovementComponent — zemin kontrolü, kapsül çarpışması ve pürüzsüz kayma
// (wall sliding). Hareket matematiği artık bu sahnede değil modülde yaşar.
import {
  ARENA_H,
  ARENA_W,
  DASH_HIT_R,
  moveOnGround,
  resolveSpawn,
  stepDash,
  type GroundConfig,
} from "@/components/world/arena/MovementComponent";
// ⚔️ SkillComponent — bekleme süreleri, MAX_RANGE nişan çözümü ve yetenek
// atış tablosu (cooldown + menzil + atış tek modülde).
import {
  ULT_CHARGE_DEAL,
  ULT_CHARGE_TAKE,
  castSuper,
  castUltimate,
  emitUltCrack,
  fireBombThrow,
  gainUltCharge,
  placeBombTrap,
  planAim,
  planBasicAttack,
  tickCooldown,
  tickSuperPassive,
  type SkillHost,
} from "@/components/world/arena/SkillComponent";
// 🧨 Bomba kiti (samuray): yere bırakılan tuzağın fitili/tetigi burada akar,
// ölçüler ve kural `arena/bombKit`te tek kaynaktır. Yere bırakma animasyonunun
// süresi/eşiği de buradan okunur (tuzak, top yere DEĞDİĞİ karede doğar).
import {
  BOMB_PLACE_DROP_AT,
  BOMB_PLACE_S,
  BOMB_RELEASE_AT,
  BOMB_TRAP_BLAST_PX,
  BOMB_TRAP_DAMAGE,
  BOMB_ULT_S,
  bindBombTraps,
  makeBombTrap,
  stepBombTraps,
  type BombTrap,
} from "@/components/world/arena/bombKit";
// ⚔️ MeleeComponent — Kraliyet Savaşçısı yakın dövüşü (3. yetenek):
// kısa menzil, sol/sağ çapraz kesişler ve rakibin üstüne atlayan bitirici.
import {
  startMelee,
  stepMelee,
  tickMelee,
} from "@/components/world/arena/MeleeComponent";
// ✨ VFXComponent — efekt veri yolu + bloom senkronlu ışık patlamaları.
import { createVfxBus, tickFx } from "@/components/world/arena/VFXComponent";
// 🖐️ MUZZLE/S — atış noktası karakterin ELİNE kaydırılır (elden ateş efekti).
import { COLD_FLAME, MUZZLE, S } from "@/components/world/arena/shared";
// Darbe geri bildirimi: patlama/bloom yerine yumuşak toz + kıvılcım kuyruğu.
import { pushHitImpact } from "@/components/world/arena/hitImpacts";
import {
  createFootDustTrack,
  emitFootstepDust,
  holdFootTrack,
} from "@/components/world/arena/footDust";
import {
  DUEL_LEAVE_EVENT,
  useAndroidBattleOrientation,
  useLandscapeGate,
} from "@/components/world/LandscapeGate";
// MOBA savaş arayüzü: üst şerit, minimap, sağ ray, yetenek barı ve rakip
// kartı. HUD, kare döngüsünü yormamak için ref'lerden beslenir; bu yüzden
// sahne yalnızca bir store kaydeder, bileşen joystick katmanında render edilir.
import {
  registerMobaHud,
  type MobaHudLive,
} from "@/components/world/moba/MobaHud";
// 🕹️ Kol ve yükleme ekranı sahnelerden ayrıldı (modüler bileşen mimarisi);
// PvP sahnesi bu isimleri eskisi gibi BattleScene üzerinden içe aktarır.
import { BattleJoystick } from "@/components/world/battle/BattleJoystick";
import { LOAD_FX, LOAD_STEPS } from "@/components/world/battle/loadingSteps";
export { BattleJoystick };
// Eski üst şerit (HudFighter/HudClock) hâlâ render edilir: MOBA arayüzü
// yüklenemezse savaş HUD'sız kalmaz. CSS, MOBA arayüzü varken bu şeridi
// gizler (bkz. index.css → .battle-hud-top + .moba-chrome kuralı).
import { HudClock, HudFighter } from "@/components/world/BattleTopHud";
import { withOwnColor, type AvatarConfig } from "@/lib/avatar";
import { abilityOf, type AbilityDef } from "@/lib/shop";
import {
  playSound,
  startBattleAmbience,
  stopBattleAmbience,
} from "@/lib/sounds";
import { AnimatePresence, motion } from "framer-motion";
import { Crosshair, Crown, Sword, Trophy, X } from "lucide-react";
// Yetenek ikonları: süper düğmesinin "resmi" artık skine göre doğru vektör
// ikonu çizer. Eşleme burada kopyalanmaz — HUD ile TEK kaynaktan gelir
// (`AbilityIcon`, bkz. moba/MobaHud.tsx).
import { AbilityIcon } from "@/components/world/moba/MobaHud";
import {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// HUD: MOBA kabuğu (üst şerit, minimap, yetenek barı) `moba/MobaHud.tsx`.
const HP = 1000;
const BASE_DMG = 120;
const PROJ_SPEED = 445; // mermi uçuş hızı (%28 yavaşlatıldı: 620 → 445)
/** Skillshot menzili (MAX_RANGE = 12 birim). Eskiden 1500 px'di yani atış
 *  haritanın öbür ucuna kadar gidiyordu; artık menzil sonunda sönüp yok olur
 *  (sönme efekti ProjectilePool'da çizilir). */
const PROJ_RANGE = MAX_RANGE_PX;
const FIGHTER_R = 22;

/** Bot difficulty curves, all driven by the opponent's profile level (1-10).
 *  Level 1 plays sloppy and slow; level 10 aims true and keeps pressure on.
 *  Everything is a gentle ramp so a couple of levels is a nudge, not a wall. */
const BOT_LEVEL_MIN = 1;
const BOT_LEVEL_MAX = 10;
const botLevelT = (level: number) =>
  (clampLevel(level) - BOT_LEVEL_MIN) / (BOT_LEVEL_MAX - BOT_LEVEL_MIN);
const clampLevel = (level: number) =>
  Math.min(
    BOT_LEVEL_MAX,
    Math.max(BOT_LEVEL_MIN, Math.round(level || BOT_LEVEL_MIN)),
  );
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
    /* Düz vuruş animasyonunun kalan süresi (0 = hazır). */
    atkAnimT: 0,
    superCharge: 0,
    samuraiCharge: 0,
    samuraiUltT: 0,
    samuraiUltHit: false,
    // 🧨 Bomba kiti (samuray): başta hazır, elde bomba var. `bombPlaceT` yere
    // bırakma ANİMASYONU, `bombHiddenT` ise bombanın elde olmadığı süredir.
    bombThrowT: 0,
    bombThrowHit: false,
    bombPlaceT: 0,
    bombPlaceHit: false,
    bombHiddenT: 0,
    // Yakın dövüş (Kraliyet Savaşçısı 3. yetenek): başta hazır.
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
        <span
          className="battle-load-spin"
          style={{ animationDirection: "reverse" }}
        >
          ⚔️
        </span>
      </h2>
      <p className="relative z-10 mt-1 text-xs font-bold tracking-[0.35em] text-sky-300/80">
        VAELOS DUEL ARENASI
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
          <span>⚙️ VAELOS GAMES</span>
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
  gold,
  sandbox,
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
  /** Oyuncunun Vaelos Parası — üst şeritteki altın sayacı (yoksa gizlenir). */
  gold?: number;
  /**
   * Test laboratuvarı kipi: kule harcaması GERÇEK cüzdandan düşülmez, yalnız
   * sahnede simüle edilir (misafir oyuncu ve test sahası için).
   */
  sandbox?: boolean;
  onExit: (victory: boolean) => void;
}) {
  const arenaRef = useRef<HTMLElement>(null);
  // 🛡️ Kule alımı: tutarı sunucu doğrular (bakiye yetmezse reddeder), başarılı
  // yazımda profil sorgusu düşer ve üstteki altın sayacı kendiliğinden iner.
  const spendCoins = useMutation(api.profiles.spendCoins);
  // 💰 Cüzdan kaynağı: `gold` prop'u verilmediyse (üretim akışı) canlı profil
  // bakiyesi okunur — Convex sorgusu reaktiftir, yani sunucu harcamayı
  // işlerken üstteki altın sayacı ve kule düğmesi kendiliğinden güncellenir.
  const myProfile = useQuery(api.profiles.getMyProfile);
  const wallet = gold ?? myProfile?.coins ?? 0;
  // The joystick's live direction vector.
  const joystickRef = useRef({ x: 0, y: 0 });
  // Brawl-Stars-style attack joystick: while held, drag to pick the aim
  // direction (dx/dy normalized to [-1, 1]). The aim guide follows it;
  // zero means auto-aim at the enemy. Holding keeps firing on cooldown
  // so you can shoot while walking (run-and-gun).
  const aimRef = useRef({ active: false, dx: 0, dy: 0 });
  const attackKnobRef = useRef<HTMLSpanElement>(null);
  // Yetenek butonları: basılı tut → nişan al, bırak → ateş et (skillshot).
  // Butonların kendi "basınca ateş et" davranışı paketlenir; nişan durumu
  // `aimState` üzerinden hem ateşlemeye hem zemindeki göstergeye gider.
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
          hasUltimateKit(f) &&
          f.samuraiCharge >= 1 &&
          f.samuraiUltT <= 0 &&
          (f.bombThrowT ?? 0) <= 0 &&
          (f.bombPlaceT ?? 0) <= 0
        );
      return f.superCharge >= 1;
    },
  );

  const keysRef = useRef(new Set<string>());
  const projs = useRef<BattleProj[]>([]);
  const fxs = useRef<BattleFx[]>([]);
  // 🧨 Samurayın yere bıraktığı bombalar (fitil + tetik + patlama). Simülasyon
  // ve hasar burada; çizim `ProjectilePool` içindeki `BombTrapPool`da.
  const traps = useRef<BombTrap[]>([]);
  // Çizim katmanı listeyi prop almaz: paylaşılan mutable duruma bağlanır
  // (`aimState` ile aynı desen). Sahne sökülünce bağ çözülür.
  useEffect(() => bindBombTraps(traps.current), []);
  const resultRef = useRef<"win" | "lose" | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const player = useRef<BattleFighter>(
    newFighter(
      playerName,
      playerConfig,
      playerEquipped,
      playerAbility,
      400,
      100,
      1,
      1,
    ),
  );
  const bot = useRef<BattleFighter>(
    newFighter(
      opponentName,
      // RAKİBİN KENDİ RENGİ: girişte seçilen renk yalnızca ANA KARAKTERİ
      // boyar; bot asla oyuncunun rengini giymez. Rengi rastlantıyla birebir
      // aynı olursa adına/seviyesine göre KARARLI bir palet rengine geçer
      // (her maçta aynı renk), yani "başka karakterin rengi değişmez".
      withOwnColor(
        opponentConfig,
        `${opponentName}:${opponentLevel}`,
        playerConfig.shirt,
      ),
      opponentEquipped,
      opponentAbility,
      1300,
      1000,
      -1,
      opponentLevel,
    ),
  );
  bot.current.atkCd = 0.4;
  // The GLB collision mask is asynchronous. Resolve both initial refs once
  // it exists so a spawn that overlaps a real prop cannot lock movement.
  const spawnResolvedRef = useRef(false);

  const webglOk = useMemo(() => supportsWebGL(), []);

  const [result, setResult] = useState<"win" | "lose" | null>(null);
  const [attackHeld, setAttackHeld] = useState(false);
  const [vsShow, setVsShow] = useState(true);
  // Üst şeritteki skor: iki tarafın toplam isabet sayısı (MOBA skor tablosu).
  const scoreRef = useRef({ p: 0, o: 0 });
  // Gaming-style loading sequence runs before the fight unlocks.
  const [phase, setPhase] = useState<"loading" | "fight">("loading");
  const startedRef = useRef(false);
  // Android APK: savaş alanı bağlıyken ekran yataya kilitlenir, çıkışta
  // (ya da web'de köprü yokken) hiçbir şey değişmez.
  useAndroidBattleOrientation();
  // Yatay mod: telefon dikeyken yükleme ilerlemez ve savaş duraklar.
  const gate = useLandscapeGate();
  const rotateRef = useRef(gate.required);
  useEffect(() => {
    rotateRef.current = gate.required;
  }, [gate.required]);
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
  // Üst şeritteki maç saati. Simülasyon sabit adımlarla (gerçek zamanla)
  // ilerlediği için saat fps düşse de doğru kalır.
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
  // Arayüz React state'iyle beslenmez: simülasyon ref'leri stabil kalır,
  // her çizimde tazelenen `mobaLiveRef` ise HUD'un okuyacağı anlık değerleri
  // taşır. HUD tek bir rAF döngüsünde bu değerleri DOM'a yazar, yani savaş
  // alanı ekstra React çizimi yapmaz (bkz. moba/MobaHud.tsx).
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
    bomb: false,
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
    // 🧨 Bomba kiti ayrı bir bayrak: samurayın ULTİ yuvası vardır ama YAKIN
    // DÖVÜŞ yuvası yoktur (o yuva kılıç taşıyan Kraliyet Savaşçısınındır).
    bomb: hasBombKit(player.current),
    hidden: hud.hidden,
  };
  useEffect(
    () =>
      registerMobaHud(joystickRef, {
        player,
        bot,
        live: mobaLiveRef,
        score: scoreRef,
        // MOBA yetenek barı artık TIKLANABİLİR: yuvalar sahnenin action
        // ref'ini çağırır (özellikle yakın dövüş yuvası).
        actions: actionsRef,
        meta: {
          playerName,
          opponentName,
          playerEmoji: abilityOf(playerAbility).emoji,
          opponentEmoji: abilityOf(opponentAbility).emoji,
          playerLevel: player.current.level,
          opponentLevel,
          maxHp: HP,
          atkCd: ATK_CD,
          gold,
          exit: () => onExitRef.current(false),
        },
      }),
    [],
  );

  // 🛡️ SAVUNMA KULELERİ: ekonomi/simülasyon köprüsü. Haritanın KENDİ orijinal
  // kuleleri (3B katman isimden bulur) aktive edilir; YENİ kule modeli
  // üretilmez. Kule ateş etmez — sahnenin KENDİ mermi havuzuna
  // `owner: "player"` mermisi bırakır, yani hasar/isabet/ölüm/skor akışı
  // normal savaş hattından geçer. Kule sistemi KAPALIysa (PvP) hiçbir şey
  // değişmez.
  useEffect(() => {
    configureTowers({
      player,
      // Menzil taraması rakip LİSTESİ üzerinden yapılır: şu an tek rakip
      // dövüşçü var; minyon dalgası eklendiğinde aynı listeye katılır ve kule
      // en yakın hedefi kendisi seçer (kule kodu değişmez).
      hostiles: () => [
        { x: bot.current.x, y: bot.current.y, hp: bot.current.hp },
      ],
      projs,
      // Altın cüzdandan düşer (sunucu doğrular). Reddedilirse kule bu maç
      // için aktif kalır, harcama maç sonunda sıfırlanır. Test sahasında
      // harcama hiç yazılmaz: gerçek bakiye tükenmesin.
      spend: sandbox
        ? undefined
        : (amount, reason) => {
            void spendCoins({ amount, reason }).catch((err: unknown) => {
              console.warn("[towers] harcama sunucuya yazılamadı:", err);
            });
          },
    });
    return () => configureTowers(null);
  }, [spendCoins, sandbox]);
  // Cüzdan: profil bakiyesi (veya test bütçesi). HUD her karede canlı
  // değerle tazeler; harcama sunucuya yazılınca bakiye düşer ve buraya yansır.
  useEffect(() => {
    setTowerWallet(wallet);
  }, [wallet]);

  // Animated VS banner plays once the loading sequence finishes.
  useEffect(() => {
    if (phase !== "fight") return;
    // Rakip kartı maç başında bir süre ekranda kalır (elle de açılabilir).
    const t = window.setTimeout(() => setVsShow(false), 3200);
    return () => window.clearTimeout(t);
  }, [phase]);

  // Gaming-style loading on arena entry: animated progress bar with cycling
  // status lines, then an orchestral "VS" sting as the fight unlocks.
  useEffect(() => {
    if (phase !== "loading") return;
    // Telefon yan çevrilene kadar süre sayılmaz: yükleme %0'da bekler, yani
    // savaş gerçekten yatay modda başlar.
    let elapsed = 0;
    let last = performance.now();
    const DURATION = 4200;
    const STEPS = LOAD_STEPS.length;
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
        playSound("vs");
        setPhase("fight");
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Yönerge ekranı açıkken savaş sesleri susar; telefon yan çevrilince geri
  // gelir. Geçiş takip edilir çünkü `startBattleAmbience` çağrısı dosya
  // yüklemesi nedeniyle asenkron — aynı anda iki kez çağrılırsa üst üste
  // binerdi.
  const rotatedAwayRef = useRef(gate.required);
  useEffect(() => {
    if (gate.required) stopBattleAmbience();
    else if (rotatedAwayRef.current && !resultRef.current)
      startBattleAmbience();
    rotatedAwayRef.current = gate.required;
  }, [gate.required]);

  // Yatay mod yönergesindeki "Savaştan çık": sahne dışından gelen istek.
  useEffect(() => {
    const leave = () => onExitRef.current(false);
    window.addEventListener(DUEL_LEAVE_EVENT, leave);
    return () => window.removeEventListener(DUEL_LEAVE_EVENT, leave);
  }, []);

  const clamp = (v: number, a: number, b: number) =>
    Math.min(Math.max(v, a), b);

  // Yürüyüş alanı GÖRÜNMEZ DÜZ TABAN COLLIDER'ıdır (BattleMapModel): fizik,
  // haritanın engebeli üçgenleri yerine düz bir zemin üzerinden kayar, sadece
  // KALIN gerçek engeller (kaya/duvar/kule/üs) hareketi keser. Böylece düz
  // yolda arazi girintilerine ve mikro dikişlere takılma olmaz.
  const hitsObstacle = (cx: number, cy: number, r: number) =>
    hitsRockCollision(cx, cy, r);

  // ✨ VFX katmanı: bütün tek seferlik efektler bu veri yolundan geçer.
  // (Effekt ölçüleri/renkleri ve bloom senkronu arena/VFXComponent'te.)
  const addFx = (fx: BattleFx) => {
    fxs.current.push(fx);
  };
  const vfx = useMemo(() => createVfxBus(addFx), []);
  const floatText = vfx.text;
  const circleFx = vfx.ring;
  const burstFx = vfx.burst;
  /** Spawn a cloud of soft smoke puffs that rise and spread. */
  const smokeFx = vfx.smoke;

  const spawnProj = (
    owner: BattleFighter,
    ownerKey: "player" | "bot",
    tx: number,
    ty: number,
    dmg: number,
    opts: {
      r?: number;
      pierce?: boolean;
      speed?: number;
      explodeR?: number;
      /** 🧨 Fırlatılan bomba: sıcak demir gövde + barut patlaması. */
      bomb?: boolean;
    } = {},
  ) => {
    const dx = tx - owner.x;
    const dy = ty - owner.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = opts.speed ?? PROJ_SPEED;
    playSound("shoot", { volume: 0.6 });
    // ELDEN ATIŞ (muzzle offset): mermi gövdenin merkezinden değil, nişan
    // yönünde öne ve kullanılan el tarafına kaymış bir noktadan çıkar; namlu
    // şimşeği de merminin doğduğu noktada parlar (ProjectilePool).
    // Öne kayma gövde yarıçapının DIŞINA taşır: kasa/duvara yaslanmışken
    // atılan mermi 1. karede ölmesin diye eski güvenlik payı korunur.
    // Yanal kayma gövde içinde kalır (0.16 birim < FIGHTER_R), yani yeni bir
    // engele doğurma riski yoktur.
    const sideX = -dy / d;
    const sideY = dx / d;
    const muzzleX =
      owner.x +
      (dx / d) * (FIGHTER_R + 6 + MUZZLE.fwd * S) +
      sideX * MUZZLE.side * S;
    const muzzleY =
      owner.y +
      (dy / d) * (FIGHTER_R + 6 + MUZZLE.fwd * S) +
      sideY * MUZZLE.side * S;
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
      bomb: opts.bomb,
    });
  };

  const damageEnemy = (
    attacker: BattleFighter,
    target: BattleFighter,
    dmg: number,
  ) => {
    if (target.hp <= 0 || resultRef.current) return;
    // 🛡️ KULE KORUMASI: oyuncunun dibinde bir savunma kulesi varsa gelen
    // hasar ÖNCE kulenin (zırhlı) canından düşer. Kule bu yüzden "tek atışta
    // yıkılmayacak" kadar yüksek canlıdır ama zamanla düşer. Kule yoksa
    // davranış bire bir eskisi gibidir.
    let amount = dmg;
    if (target === player.current) {
      amount = towerGuardAbsorb(dmg);
      if (amount <= 0) return;
    }
    target.hp = Math.max(0, target.hp - amount);
    target.lastHitAt = performance.now();
    // Üst şeritteki skor tablosu: isabetler taraflara yazılır.
    if (attacker === player.current) scoreRef.current.p += 1;
    else if (attacker === bot.current) scoreRef.current.o += 1;
    // Vuruş tepkisi: vurulan karakter sarsılır ve vuran taraftan uzağa
    // savrulur (ulti/beam/dash sert, normal mermi hafif).
    applyHitReaction(target, attacker.x, attacker.y, amount);
    // Taking damage in a bush reveals the victim (Brawl-style).
    target.revealUntil = performance.now() + BUSH_REVEAL_MS;
    // Hasar sayısı dövüşçünün hemen üzerinde doğar (eski 130 px'lik kayma
    // sayıyı 2.6 birim öteye taşıyordu; artık baş-üstü HUD'ın dibinde) ve
    // hedefe göre renklenir: SANA gelen hasar kırmızı, SENİN verdiğin amber.
    floatText(
      target.x,
      target.y - 8,
      `-${amount}`,
      target === player.current ? "#ff6b6b" : "#fbbf24",
    );
    // ⚡ Kraliyet ultisi YALNIZ savaşta dolar: düşmana vurdukça (ULT_CHARGE_DEAL)
    // ve hasar aldıkça (ULT_CHARGE_TAKE). Süper yetenek ve yakın dövüş
    // "süreli" butonlardır — vuruş onlara şarj eklemez (bkz. SkillComponent
    // → şarj tablosu). Ana skil (düz vuruş) hiç şarj kullanmaz.
    gainUltCharge(attacker, ULT_CHARGE_DEAL);
    gainUltCharge(target, ULT_CHARGE_TAKE);
    // Distinct audio for getting hurt vs. dealing damage.
    if (target === player.current) {
      playSound("hurt", { volume: 0.9, rate: 0.82 + Math.random() * 0.2 });
      playSound("hit", { volume: 0.35, rate: 1.5 });
    } else {
      playSound("hit", { volume: 0.85, rate: 0.95 + Math.random() * 0.25 });
    }
    // Vuruş başına tam ekran bloom nabzı KALDIRILDI: her darbede ekranı
    // ışıtan sert beyaz parlama görüşü kapatıyordu. Darbe geri bildirimi
    // artık yerel: `arena/HitImpactVfx` (toz + kıvılcım) + sarsıntı.
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
    // 🧨 Fırlatılan bomba: barut patlaması (sıcak, tozlu) — soğuk alev
    // büyüsünden KASITLI olarak farklı, iki tehdit tek bakışta ayrılsın.
    // `power = 2`: bu SAMURAY ULTİSİDİR — geniş kadraj, ek şok halkası,
    // beyaz-sıcak merkez parlaması ve haritayı oynatan kamera sarsıntısı
    // (bkz. `pushBombBlastFx`). Yerdeki tuzak kademe 1'de kalır.
    if (pr.bomb) vfx.bombBlast(pr.x, pr.y, r, 2);
    // Ateş Topu: fiziksel turuncu ateş yerine antik büyüyle harmanlanmış
    // ruhani / soğuk alev patlaması. Hasar yarıçapı (r) aynı kalır; bloom
    // VFX katmanında aynı karede tetiklenir.
    else vfx.coldFlame(pr.x, pr.y, r);
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

  /**
   * 🧨 TUZAK PATLAMASI (bot arenası). Patlama anını simülasyon (`stepBombTraps`)
   * karara bağlar; hasar ve görsel burada uygulanır:
   *   · VFX/ses HER durumda (tuzak boşa patlasa da barut patlar),
   *   · hasar yalnızca karşı taraf patlama yarıçapı içindeyse.
   */
  const blastTrap = (trap: BombTrap) => {
    vfx.bombBlast(trap.x, trap.y, BOMB_TRAP_BLAST_PX);
    playSound("explode", { volume: 0.95, rate: 0.9 + Math.random() * 0.25 });
    const attacker = trap.owner === "player" ? player.current : bot.current;
    const target = trap.owner === "player" ? bot.current : player.current;
    if (Math.hypot(target.x - trap.x, target.y - trap.y) < BOMB_TRAP_BLAST_PX) {
      damageEnemy(attacker, target, BOMB_TRAP_DAMAGE);
    }
  };

  /* --------------------------- hareket katmanı --------------------------- */
  // Yürünebilirlik GÖRÜNMEZ DÜZ TABAN COLLIDER'ıdır (BattleMapModel); hareket
  // matematiği MovementComponent'te: kapsül tabanı, duvar boyunca kayma, step
  // offset ve alt adım.
  const ground: GroundConfig = {
    radius: FIGHTER_R,
    blocked: hitsObstacle,
    bounds: { w: ARENA_W, h: ARENA_H, pad: 40 },
  };
  const moveFighter = (f: BattleFighter, dx: number, dy: number, dt: number) =>
    moveOnGround(f, dx, dy, dt, ground);

  /* ---------------------------- yetenek katmanı -------------------------- */
  // SkillHost: yetenek KURALLARI SkillComponent'te kalır; hasar/olay uygulaması
  // (bot arenası doğrudan, PvP ağ üzerinden) burada bağlanır.
  const skillHost: SkillHost = {
    vfx,
    sound: playSound,
    spawn: (caster, target, dmg, opts) =>
      spawnProj(
        caster,
        caster === player.current ? "player" : "bot",
        target.x,
        target.y,
        dmg,
        opts,
      ),
    // 🧨 Bombayı yere bırak: fitil ve tetik `stepBombTraps`te akar. Bırakma
    // sesi atıştan ayırt edilebilsin diye alçak perdeli bir hışırtı.
    placeTrap: (caster, x, y) => {
      traps.current.push(
        makeBombTrap(caster === player.current ? "player" : "bot", x, y),
      );
      playSound("whoosh", { volume: 0.5, rate: 0.7 });
    },
    // Işın her durumda çizilir; bot arenasında hasar yalnızca isabette işler.
    onBeam: (caster, enemy, _aim, _len, hit) => {
      if (hit) damageEnemy(caster, enemy, 300);
    },
    canLock: (enemy, caster) => !isHiddenFrom(enemy, caster),
  };

  const tryAttack = useCallback((aimX?: number, aimY?: number) => {
    const p = player.current;
    const plan = planBasicAttack(
      p,
      bot.current,
      skillHost,
      startedRef.current && !resultRef.current,
      aimX,
      aimY,
    );
    if (!plan) return;
    spawnProj(p, "player", plan.end.x, plan.end.y, BASE_DMG);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trySamuraiSuper = useCallback(() => {
    // Samuray 2. ultisi: menzil kuralı + gövde yönü SkillComponent'te.
    castUltimate(
      player.current,
      bot.current,
      skillHost,
      startedRef.current && !resultRef.current,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⚔️ Yakın dövüş: rakip MELEE_LUNGE_RANGE içindeyse otomatik kilitlenip
  // üstüne atlanır; değilse bakılan yöne sol/sağ çapraz kesiş savrulur.
  const tryMelee = useCallback(() => {
    if (!startedRef.current || resultRef.current) return;
    const plan = startMelee(player.current, bot.current, skillHost, true, 0, 0);
    if (!plan) return;
    // Yakın dövüş de karakteri bir an görünür kılar (çalıdan bile).
    player.current.revealUntil = performance.now() + BUSH_REVEAL_MS;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trySuper = useCallback(() => {
    const p = player.current;
    const b = bot.current;
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
    // menzil içindeki düşmana kilit; o da yoksa bakış yönü. Çalıdaki düşmana
    // otomatik kilit yok (şifa zaten kendine kullanılır).
    castSuper(p, b, skillHost, planAim(p, b, skillHost));
    // Using an ability inside a bush reveals the caster for a moment.
    p.revealUntil = performance.now() + BUSH_REVEAL_MS;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endBattle = (win: "win" | "lose") => {
    if (resultRef.current) return;
    resultRef.current = win;
    setResult(win);
    stopBattleAmbience();
    playSound(win === "win" ? "win" : "lose");
  };

  // ---- main loop ----
  useEffect(() => {
    // Yatay mod yönergesi açıksa ambiyans hiç başlamaz (yukarıdaki geçiş
    // efekti telefon yan çevrildiğinde devreye alır).
    if (!rotateRef.current) startBattleAmbience();
    let superReadyPlayed = false;
    // Sabit zaman adımı: kare hızı düşse bile simülasyon gerçek zamanda
    // ilerler (oyun ağır çekime düşmez).
    const SIM_STEP = 1 / 60;
    let simAcc = 0;
    let stepAcc = 0;
    let botStepAcc = 0;
    // 👣 Adım tozu izleri: toz, adımı atan AYAĞIN arkasından çıksın diye son
    // konum + dönüşümlü ayak (sol/sağ) burada tutulur. Bkz. arena/footDust.
    const footTrack = createFootDustTrack(
      player.current.x,
      player.current.y,
    );
    const botFootTrack = createFootDustTrack(bot.current.x, bot.current.y);
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
      if (
        e.code === "KeyE" ||
        e.code === "ShiftLeft" ||
        e.code === "ShiftRight"
      )
        actionsRef.current.super();
      // F = yakın dövüş (Kraliyet Savaşçısı) — masaüstünde test/dövüş için
      // dokunmatik kümedeki altın yuvanın klavye karşılığı.
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
      samuraiSuper: trySamuraiSuper,
      melee: tryMelee,
      // Savaş alanında tıklayarak gitme kapalı: tek hareket girdisi joystick
      // (masaüstünde de joystick fare ile sürüklenir). Arenaya yapılan
      // dokunuş artık yürüme hedefi oluşturmuyor.
      click: (_x: number, _y: number) => {},
    };

    let raf = 0;
    let last = performance.now();

    const step = (dt: number) => {
      const p = player.current;
      const b = bot.current;
      // freeze the simulation until the loading sequence finishes
      if (!startedRef.current || resultRef.current) return;

      if (!spawnResolvedRef.current) {
        // false → GLB çarpışma ızgarası henüz hazır değil; gelecek karede
        // yeniden denenir (geçersiz bir doğuş noktası kabul edilmez).
        const playerOk = resolveSpawn(p, FIGHTER_R);
        const botOk = resolveSpawn(b, FIGHTER_R);
        if (playerOk && botOk) spawnResolvedRef.current = true;
      }

      // Bekleme süreleri (cooldown) SkillComponent'te yönetilir.
      tickCooldown(p, dt);
      tickCooldown(b, dt);
      // Yakın dövüş bekleme süresi (melee) MeleeComponent'te yönetilir.
      tickMelee(p, dt);
      tickMelee(b, dt);
      // 🎯 Atış/yetenek yönü kilidi: süre burada iner; süre bitince gövde
      // tekrar hareket yönüne göre döner.
      tickAimYaw(p, dt);
      tickAimYaw(b, dt);
      // Botun vuruş pozu zamanla söner (botlar köklenmez).
      tickAttackAnim(b, dt);

      // Run-and-gun: keep firing while the attack button is held (or Space
      // is down) so you can shoot while walking with the joystick. The shot
      // follows the dragged aim direction; zero means auto-aim.
      // Sarsılırken ateş edilemez: ulti/beam yiyen karakter bir an "kilitli".
      // Zemindeki nişan göstergesi (menzil çemberi + yön oku) düz vuruş
      // nişanını paylaşılan durumdan okur.
      aimState.basic = aimRef.current.active;
      aimState.basicDx = aimRef.current.dx;
      aimState.basicDy = aimRef.current.dy;
      if (aimRef.current.active && p.atkCd <= 0 && p.hitStunT <= 0) {
        tryAttack(aimRef.current.dx, aimRef.current.dy);
      }

      // --- player movement (joystick + klavye) ---
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
      } else {
        // virtual joystick (mobile) — live direction while dragging
        const jx = joystickRef.current.x;
        const jy = joystickRef.current.y;
        const joystickMagnitude = Math.hypot(
          joystickRef.current.x,
          joystickRef.current.y,
        );
        if (joystickMagnitude > 0.1) {
          // Keep the complete analog vector. Selecting only the dominant axis
          // made diagonal drags switch direction abruptly and feel like the
          // joystick had stopped responding. +X is right and +Y is down.
          vx = joystickRef.current.x;
          vy = joystickRef.current.y;
        }
      }
      // ⚡ SÜRELİ BUTON (oyuncu): süper bar yalnız zamanla, yavaşça dolar ve
      // ancak %100'de kullanılabilir. Kraliyet ultisi zamanla dolmaz (savaşta
      // dolar), düz vuruş ise kendi bekleme süresiyle (`ATK_CD`) çalışır.
      tickSuperPassive(p, dt);
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
          // Bitiş animasyonu kesildi — adım tozu ile hissettir (aynı katman:
          // ayak arkasından çıkan zemin tozu).
          emitFootstepDust(p, footTrack, p.x, p.y);
        }
      }
      // 🧨 Yere bomba bırakma boyunca karakter KÖKLENİR: el bombayı indirip
      // bırakırken karakter yürürse top ile tuzak farklı yerlere düşerdi
      // (tuzak, topun yere değdiği karedeki konuma konur). Kısa bir köklenme
      // (bkz. `BOMB_PLACE_S`) bu yüzden hem animasyonun hem kuralın şartıdır.
      if ((p.bombPlaceT ?? 0) > 0) {
        vx = 0;
        vy = 0;
      }
      // ── Vuruş sarsıntısı: ulti/ağır vuruş yiyen karakter bir an kontrolü
      // kaybeder; savrulma hareketi burada (çarpışma kontrollü) uygulanır. ──
      const pStunned = stepHitStun(p, dt, moveFighter);
      if (pStunned && p.meleeT > 0) {
        // Sarsılma salınımı böler: yakın dövüş iptal edilir.
        p.meleeT = 0;
        p.meleeStrikes = 0;
      }
      // 🧨 BOMBA FIRLATMA (samuray ultisi): hazırlık akarken karakter hareket
      // edebilir (savurma pozu kilitlenmez) — Kraliyet ultisinin aksine burada
      // salınım yok, yalnızca bomba elden bırakılır.
      if ((p.bombThrowT ?? 0) > 0) {
        p.bombThrowT = Math.max(0, (p.bombThrowT ?? 0) - dt);
        const release = 1 - p.bombThrowT / BOMB_ULT_S;
        if (!p.bombThrowHit && release >= BOMB_RELEASE_AT) {
          p.bombThrowHit = true;
          // Nişan kuralı Kraliyet ultisiyle aynı: menzil içinde düşman varsa
          // ona kilit, yoksa gövdenin baktığı tam açı.
          const locked = resolveAim(p, b, 0, 0, {
            canLock: !isHiddenFrom(b, p),
            preferLock: true,
          });
          fireBombThrow(p, b, skillHost, locked.locked ? locked : bodyDir(p));
        }
      }
      // 🧨 YERE BOMBA BIRAKMA (samurayın normal yeteneği): animasyon akarken
      // karakter KÖKLENİR (aşağıda hareket girdisi sıfırlanır), böylece top tam
      // ayağının dibine düşer. Tuzak, bombanın YERE DEĞDİĞİ karede doğar
      // (`placeBombTrap`) — daha erken doğsaydı ekranda iki bomba olurdu.
      if ((p.bombPlaceT ?? 0) > 0) {
        p.bombPlaceT = Math.max(0, p.bombPlaceT - dt);
        const drop = 1 - p.bombPlaceT / BOMB_PLACE_S;
        if (!p.bombPlaceHit && drop >= BOMB_PLACE_DROP_AT) {
          p.bombPlaceHit = true;
          placeBombTrap(p, skillHost);
        }
      }
      // 🧨 Bomba elden çıktıktan sonra elin boş kaldığı süre (görsel geri
      // bildirim) — süre bitince yeni bomba elde hazır olur.
      if ((p.bombHiddenT ?? 0) > 0) {
        p.bombHiddenT = Math.max(0, p.bombHiddenT - dt);
      }

      // 🧨 BOMBA TUZAKLARI: fitil, tetikleme ve patlama. Kural `bombKit`te tek
      // kaynakta; hasar ve görsel burada uygulanır. Tuzak sahibi "player" ise
      // hedefi bot, "bot" ise hedefi oyuncudur.
      stepBombTraps(
        traps.current,
        dt,
        (owner) => (owner === "player" ? b : p),
        blastTrap,
      );

      // 🧨 BOMBA KİTİ — BOT: samuray skini giyen bot da bombasını kullanır.
      // Tetik koşulları Kraliyet ultisi bloğuyla aynı ruhta: şarj dolu, hedef
      // görünüyor, sarsılmıyor ve savaş sürüyor (`botCanSee` yerine aynı kural
      // `isHiddenFrom` ile burada okunur — bot bloğu bunun altında kalıyor).
      if ((b.bombHiddenT ?? 0) > 0) {
        b.bombHiddenT = Math.max(0, b.bombHiddenT - dt);
      }
      // 🧨 Botun yere bırakma animasyonu: aynı kural, tuzak yere değince doğar.
      if ((b.bombPlaceT ?? 0) > 0) {
        b.bombPlaceT = Math.max(0, b.bombPlaceT - dt);
        const drop = 1 - b.bombPlaceT / BOMB_PLACE_S;
        if (!b.bombPlaceHit && drop >= BOMB_PLACE_DROP_AT) {
          b.bombPlaceHit = true;
          placeBombTrap(b, skillHost);
        }
      }
      if ((b.bombThrowT ?? 0) > 0) {
        b.bombThrowT = Math.max(0, b.bombThrowT - dt);
        const release = 1 - b.bombThrowT / BOMB_ULT_S;
        if (!b.bombThrowHit && release >= BOMB_RELEASE_AT) {
          b.bombThrowHit = true;
          const ang = Math.atan2(p.y - b.y, p.x - b.x);
          fireBombThrow(b, p, skillHost, {
            x: Math.cos(ang),
            y: Math.sin(ang),
            locked: false,
          });
        }
      } else if (
        hasBombKit(b) &&
        b.samuraiCharge >= 1 &&
        b.samuraiUltT <= 0 &&
        b.meleeT <= 0 &&
        b.hitStunT <= 0 &&
        b.hp > 0 &&
        !isHiddenFrom(p, b) &&
        startedRef.current &&
        !resultRef.current
      ) {
        castUltimate(b, p, skillHost, true);
      }

      if (p.samuraiUltT > 0) {
        p.samuraiUltT -= dt;
        const progress = 1 - Math.max(0, p.samuraiUltT) / 0.82;
        if (!p.samuraiUltHit && progress > 0.62) {
          p.samuraiUltHit = true;
          // Yarık, kılıcın YERE İNDİĞİ noktadan (karakterin önünden) başlar
          // ve en fazla MAX_RANGE ilerler. Yön kuralı: MENZİL ÇEMBERİ İÇİNDE
          // düşman varsa ulti ONA GİDER (kilitli tam yön — çapraz hedef kaçmaz).
          // Çember içinde düşman yoksa karakterin baktığı yöne gider.
          // (bodyDir gövdenin baktığı TAM açıyı verir — karakter atış
          // sonrası kendi yönünde kaldığı için kılıç da o hatta iner.)
          const locked = resolveAim(p, b, 0, 0, {
            canLock: !isHiddenFrom(b, p),
            preferLock: true,
          });
          const dir = locked.locked ? locked : bodyDir(p);
          const crack = emitUltCrack(p, dir.x, dir.y, skillHost, {
            smokeCount: 4,
            smokeGrow: 80,
            trail: true,
          });
          // Hasar yalnızca hat menzil içinde ve yönündeyse verilir.
          if (aimedHit(p, dir, b, { rangePx: crack.reach })) {
            damageEnemy(p, b, SAMURAI_ULTIMATE_DAMAGE);
          }
          playSound("hit", { volume: 1, rate: 0.7 });
        }
        p.moving = false;
        p.phase += dt * 5;
      } else if (pStunned) {
        // Sarsılıyor: girdi yok sayılır, savrulma yukarıda uygulandı.
      } else if (p.meleeT > 0) {
        // ⚔️ Yakın dövüş: sol/sağ çapraz kesişler + (rakip yakınsa) üstüne
        // atlama. Salınım karakteri kökler; atlama çarpışma kontrollü yürür
        // (duvardan geçmez). Vuruş eşikleri MeleeComponent'te tek kaynakta.
        const strikes = stepMelee(p, b, dt, {
          leapMove: (f, dx, dy, dts) => moveFighter(f, dx, dy, dts),
          vfx,
        });
        if (strikes) {
          for (const s of strikes) {
            if (s.hit) damageEnemy(p, b, s.dmg);
            playSound(s.stage >= 2 ? "explode" : "hit", {
              volume: s.stage >= 2 ? 0.5 : 0.7,
              rate: s.stage >= 2 ? 0.9 : 1.35,
            });
          }
        }
      } else if (p.dashT > 0) {
        stepDash(p, dt, ground);
        if (!p.dashHit && Math.hypot(b.x - p.x, b.y - p.y) < DASH_HIT_R) {
          p.dashHit = true;
          damageEnemy(p, b, 200);
        }
        if (p.dashT <= 0) p.dashHit = false;
      } else {
        moveFighter(p, vx * 90 * dt, vy * 90 * dt, dt);
      }

      // --- footstep ticks while walking (continuous battle audio) ---
      if (p.moving && p.dashT <= 0 && p.hitStunT <= 0) {
        stepAcc += dt;
        if (stepAcc > 0.3) {
          stepAcc = 0;
          playSound("step", {
            volume: 0.16,
            rate: 0.8 + Math.random() * 0.5,
          });
          // 👣 Toz AYAK ARKASINDAN çıkar: konum hareket yönünün tersine
          // kaydırılır, sağ/sol ayak dönüşümlü seçilir (eskiden gövde
          // merkezinden yükselen küçük bir dumanla isteniyordu: hem yerde
          // değildi hem neredeyse görünmüyordu).
          emitFootstepDust(p, footTrack, p.x, p.y);
        }
      } else {
        stepAcc = 0;
        // Dururken iz tazelenir: sonraki adımda eski konumdan sahte yön çıkmasın.
        holdFootTrack(footTrack, p.x, p.y);
      }
      if (b.moving && b.dashT <= 0 && b.hitStunT <= 0) {
        botStepAcc += dt;
        if (botStepAcc > 0.34) {
          botStepAcc = 0;
          playSound("step", { volume: 0.08, rate: 0.7 + Math.random() * 0.4 });
          emitFootstepDust(b, botFootTrack, b.x, b.y); // ayak arkası tozu
        }
      } else {
        botStepAcc = 0;
        holdFootTrack(botFootTrack, b.x, b.y);
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
      // Bot da vuruş sarsıntısı yaşar: sarsılırken ne hareket eder ne de
      // ateş eder (savrulma yukarıda, çarpışma kontrollü uygulanır).
      const bStunned = stepHitStun(b, dt, moveFighter);
      if (bStunned) {
        // sarsılıyor — AI bu karede çalışmaz
      } else if (b.dashT > 0) {
        stepDash(b, dt, ground);
        if (!b.dashHit && Math.hypot(p.x - b.x, p.y - b.y) < DASH_HIT_R) {
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
        } else if (dist > 150) {
          // Kısa menzil (MAX_RANGE = 200 px): bot menzil dışına boşa
          // ateş etmesin diye yaklaşma eşiği de menzile göre küçültüldü.
          mx = dx / dist;
          my = dy / dist;
        } else if (dist < 80) {
          mx = -dx / dist;
          my = -dy / dist;
        } else {
          mx = dy / dist;
          my = -dx / dist;
        }
        // Higher-level bots weave: add a slow perpendicular sway so they are
        // harder to hit while still closing or holding range.
        if (levelT > 0 && botCanSee) {
          const sway =
            Math.sin(performance.now() / 900 + b.phase) * levelT * 0.55;
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
            const sx = clamp(
              b.x + Math.cos(ang) * expected * 2,
              40,
              ARENA_W - 40,
            );
            const sy = clamp(
              b.y + Math.sin(ang) * expected * 2,
              40,
              ARENA_H - 40,
            );
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
      // Skillshot menzili: bot da menzil dışına boşa ateş etmez, önce yaklaşır.
      if (b.atkCd <= 0 && botCanSee && dist <= MAX_RANGE_PX) {
        b.atkCd = botFireInterval(b.level);
        // Botun da vuruş pozu görünsün — botlar köklenmez (run-and-gun).
        startAttackAnim(b);
        // 🎯 Bot da ateş ettiği yöne döner (oyuncuyla aynı kural; bot tüm
        // dövüş boyunca hareket ettiği için kilit olmadan hep yürüyüş yönüne
        // bakıyordu).
        faceAimYaw(b, dx, dy, AIM_TURN_HOLD_BASIC);
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

      // Bot da oyuncuyla AYNI tabloyu okur (SkillComponent → şarj tablosu):
      // süper yalnız zamanla dolar; seviye farkı dolumu biraz hızlandırır
      // (yoksa bot yeteneği birkaç saniyede doldurup sürekli atıyordu).
      tickSuperPassive(b, dt, 1 + botLevelT(b.level));
      if (isSamuraiFighter(b)) {
        // Ulti zamanla dolmaz: botun ultisi de düşmana vurdukça dolar
        // (`damageEnemy` → gainUltCharge).
        if (
          b.samuraiCharge >= 1 &&
          b.samuraiUltT <= 0 &&
          botCanSee &&
          !bStunned
        ) {
          b.samuraiCharge = 0;
          b.samuraiUltT = 0.82;
          b.samuraiUltHit = false;
          const ang = Math.atan2(p.y - b.y, p.x - b.x);
          b.facing = Math.cos(ang) >= 0 ? 1 : -1;
          b.vy =
            Math.abs(Math.sin(ang)) > 0.5 ? (Math.sin(ang) > 0 ? 1 : -1) : 0;
          // 🎯 Tam açı kilidi: 4 yönlü facing/vy çaprazdaki oyuncuyu
          // kaçırıyordu, ulti artık hedefe tam döner.
          faceAimYaw(b, Math.cos(ang), Math.sin(ang), 0.82);
        }
      }
      if (b.samuraiUltT > 0) {
        b.samuraiUltT -= dt;
        const progress = 1 - Math.max(0, b.samuraiUltT) / 0.82;
        if (!b.samuraiUltHit && progress > 0.62) {
          b.samuraiUltHit = true;
          const katanaAng = Math.atan2(p.y - b.y, p.x - b.x);
          const dirX = Math.cos(katanaAng);
          const dirY = Math.sin(katanaAng);
          // Botun yarığı da oyuncunun ulti'siyle aynı MAX_RANGE ile sınırlı:
          // rakip nerede olursa olsun yarık ona kadar uzamaz (eskiden dist+50).
          const crack = emitUltCrack(b, dirX, dirY, skillHost, {
            smokeCount: 3,
            smokeGrow: 70,
          });
          // Hasar yalnızca yarığın menzili ve yönü içindeyse işler
          // (oyuncu ulti'siyle aynı MAX_RANGE kuralı — eskiden menzilsizdi).
          if (aimedHit(b, { x: dirX, y: dirY }, p, { rangePx: crack.reach })) {
            damageEnemy(b, p, SAMURAI_ULTIMATE_DAMAGE);
          }
          // Kılıç yere çarpar: vursun vurmasın darbe sesi (oyuncu ile aynı).
          playSound("hit", { volume: 1, rate: 0.7 });
        }
      }
      // The ult fires the moment the bar is full — unless the target hides
      // in a bush (self-heal is fine anywhere). Using it reveals the bot.
      if (
        b.superCharge >= 1 &&
        (b.ability.id === "sifa" || botCanSee) &&
        !bStunned
      ) {
        // Bot yeteneği: nişan girdisi yok → menzil kuralı SkillComponent'te.
        castSuper(b, p, skillHost);
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
          // Engele çarpma: yalnızca küçük bir toz pufu (iri duman bloğu ve
          // parlak küre kaldırıldı; efekt atıcının kendi katmanından çıkar).
          pushHitImpact(pr.owner === "player" ? player.current : bot.current, {
            kind: "dust",
            x: nx,
            y: ny,
            hit: false,
            heavy: false,
            t: performance.now(),
          });
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
            // Soğuk alev oku düşmana değdi: temas noktasında buzlu patlama.
            vfx.coldFlameImpact(pr.x, pr.y, 62);
          }
          if (!pr.pierce) {
            projs.current.splice(i, 1);
            continue;
          }
        }
        if (pr.explodeR && pr.travelled >= FIREBALL_RANGE_PX) {
          explodeAt(pr);
          projs.current.splice(i, 1);
        } else if (pr.travelled >= PROJ_RANGE && !pr.explodeR) {
          projs.current.splice(i, 1);
        }
      }

      // --- tek seferlik efektler: tek geçişte ömür azaltma + temizlik ---
      tickFx(fxs.current, dt);

      // --- super ready jingle (fires once when the bar fills) ---
      if (p.superCharge >= 1 && !superReadyPlayed) {
        superReadyPlayed = true;
        playSound("whoosh", { volume: 0.65 });
      } else if (p.superCharge < 1) {
        superReadyPlayed = false;
      }

      // --- maç saati — savaş bitince durur ---
      if (!resultRef.current) {
        matchTRef.current += dt;
        const secs = Math.floor(matchTRef.current);
        if (secs !== clockShownRef.current) {
          clockShownRef.current = secs;
          setClock(secs);
        }
      }

      // --- HUD (React, only when values changed) ---
      const ph = Math.round(p.hp / 5) * 5;
      const ohp = Math.round(b.hp / 5) * 5;
      const pc = Math.round(p.superCharge * 20) / 20;
      const oc = Math.round(b.superCharge * 20) / 20;
      const sc = Math.round(p.samuraiCharge * 20) / 20;
      const atkReady = p.atkCd <= 0;
      // Bush stealth: the player knows they are hidden whenever the bot can no
      // longer see them — clear, in-your-face feedback that you went invisible.
      const hidden = !botCanSee;
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
    };

    const loop = (now: number) => {
      try {
        if (rotateRef.current) {
          // Dikey mod: simülasyon durur (karakterler donar), süre işlemez.
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
          // Uzun bir takılma (sekme değişimi/GC) birikmişse kuyruğu at:
          // bir karede 5 adımdan fazlasını oynatmak izlenebilir değil.
          if (steps === 5) simAcc = 0;
        }
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

  /** Nişan topuzu: hem tabanın ortasına hizalanır hem sürükleme yönüne
   *  kaydırılır. Yatay modda HUD küçüldüğü için topuz mutlak piksel
   *  yerine yüzdeyle ortalanır. */
  const setAimKnob = (dx: number, dy: number) => {
    if (attackKnobRef.current) {
      attackKnobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  };

  const abilityEmoji = abilityOf(playerAbility).emoji;
  const oppAbilityEmoji = abilityOf(opponentAbility).emoji;

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
              onClick={() => onExitRef.current(false)}
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

        {/* arena — 3D scene */}
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
          {/* virtual joystick — drag to move (works with mouse + touch) */}
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
                // Fire instantly (even while holding the joystick) instead of
                // waiting for a click, and never let the tap fall through to
                // the arena's tap-to-move plane.
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
                // Press the attack button, then drag to aim (Brawl Stars
                // style): the aim guide follows your finger and releasing
                // fires in that direction. Holding still keeps firing on
                // cooldown so you can shoot while walking with the joystick.
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
                // turn the fighter toward the aim direction so the
                // direction is obvious while aiming
                if (Math.abs(aimRef.current.dx) > 0.2) {
                  player.current.facing = aimRef.current.dx >= 0 ? 1 : -1;
                }
                if (attackKnobRef.current) setAimKnob(dx, dy);
              }}
              onPointerUp={() => {
                // release — fire the aimed (or auto-aimed) shot
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
              {/* aim knob — slides in the dragged direction */}
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
