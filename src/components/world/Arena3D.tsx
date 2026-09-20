// 3D battle arena — Three.js (react-three-fiber) replacement for the old
// flat SVG arena. Fighters are procedural low-poly humanoids built from the
// player's avatar config (skin / hair / shirt / pants / shoes colors), so
// everyone keeps their own look in 3D. The game simulation stays in
// BattleScene.tsx (plain refs, no React re-renders); this component only
// reads those refs every frame and draws them with Three.js.
//
// The arena renders the uploaded 5v5_game_map.glb battlefield (see
// BattleMapModel.tsx for the fit transform). Fighters duel across the open
// map; only the Brawl-style stealth bushes from the old arena remain.
import type { AvatarConfig } from "@/lib/avatar";
import type { AbilityDef } from "@/lib/shop";

import { useAnimations, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  FALLBACK_MODEL_URL,
  GlbModelBoundary,
  GlbModelRetry,
  applyCharacterTint,
  characterModelUrl,
  computeSkeletonHeight,
  resolveIdleWalk,
} from "@/engine/GlbAvatar3D";
import {
  isRoyalWarriorSkin,
  useRoyalWarriorEffects,
} from "@/engine/RoyalWarriorEffects";
import {
  applyBattleStance,
  findBattleStance,
  publishStanceDrop,
  stanceDropRig,
} from "@/engine/BattleStance";
import {
  ROYAL_ULT_LOCK,
  applyRoyalSlamBody,
  applyRoyalSlamPose,
  clearRoyalSlamBody,
  computeRoyalSlamBody,
  findHandSword,
  findRoyalSlamRig,
  measureBladeAxis,
} from "@/engine/RoyalSlam";
// ⚔️ Kraliyet Savaşçısı yakın dövüşü (3. yetenek): sol/sağ çapraz kesiş +
// hamleli bitirici. Kemik katmanı RoyalSlam ile aynı ölçülmüş eksenleri kullanır.
import {
  applyMeleePose,
  computeMeleeBody,
  meleeDuration,
} from "@/engine/RoyalMelee";
import {
  buildGroundCrack,
  sampleGroundCrack,
  updateGroundCrack,
} from "@/engine/GroundCrack";
import { hasCharacterSkin, resolveSkinUrl } from "@/engine/EquipmentRegistry";
import {
  RIG_ROOT_SCALE,
  measureStrideRatio,
  stripRootMotion,
  walkTimeScale,
} from "@/engine/LocomotionSync";
import {
  applyFlash,
  HIT_FLASH_MS,
  snapshotFlash,
  type FlashBase,
} from "@/engine/HitFlash";
import { BattleMapModel } from "@/components/world/BattleMapGuard";
import { useArenaCamera } from "@/components/world/ArenaCamera";
import { SkillshotIndicator } from "@/components/world/SkillshotIndicator";
import { SkeletonUtils } from "three-stdlib";
import type { MutableRefObject } from "react";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ProjectilePool } from "./arena/ProjectilePool";
import { applyBushTransparency } from "./arena/bushFade";
import {
  drawBarSprite,
  drawNameSprite,
  makeBarTex,
  makeBoltTexture,
  makeGlowTexture,
  makeNameTex,
} from "./arena/headUi";
import { ProceduralBody } from "./arena/ProceduralBody";
// 🤖 Otomatik QA katmanı (gezen test botu + sahne teşhisi + FPS bölgeleri).
// Yalnızca oyuncunun rig'inden, SAHNE KÖKÜNDE render edilir (dünya uzayı).
import { QaScene } from "./qa/QaScene";
import { SlashTrail } from "./arena/SlashTrail";
import {
  ARENA_D,
  ARENA_W,
  BEAM_POOL,
  BODY_SCALE_GAIN,
  BURST_POOL,
  CRACK_POOL,
  CX,
  CZ,
  HEAD_UI_SCALE,
  HIT_SPARKS,
  HUD,
  RING_POOL,
  S,
  SMOKE_POOL,
  SPARK_LIFE,
  TEXT_POOL,
  type BattleFx,
  type BattleProj,
} from "./arena/shared";

/* Arena sabitleri, tipleri ve efekt yardımcıları `./arena/shared` içinde.
 * Genel API eskisi gibi Arena3D üzerinden de erişilebilir kalsın diye
 * aşağıdaki isimler yeniden dışa aktarılır. */
export {
  COLD_FLAME,
  FIREBALL_VFX_SCALE,
  isFireballProj,
  pushColdFlameFx,
  pushColdFlameImpact,
} from "./arena/shared";
export type { BattleFx, BattleProj } from "./arena/shared";

/** Game-space (px) obstacle list — shared with the simulation in BattleScene. */
export type ObstacleKind = "crate" | "fence" | "bush" | "barrel";

export interface BattleObstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: ObstacleKind;
}

/** The uploaded GLB is the complete battlefield. No synthetic bushes,
 * grass patches, spawn pads, or legacy arena props are added here. */
export const BATTLE_OBSTACLES: BattleObstacle[] = [];

/** Legacy spawn-pad compatibility shim: the uploaded GLB owns all battlefield visuals. */
function SpawnCircle(_props: {
  position: [number, number, number];
  color: string;
}) {
  return null;
}

/** Base attack cooldown (seconds) — shared with the sim and the aim guides. */
export const ATK_CD = 0.85;

/** Düz vuruş animasyonu — köklenme (windup) + kesilebilir bitiş (recovery).
 *  Hasar çıktıktan sonra cancel penceresi açılır: bu pencerede hareket girdisi
 *  bitiş animasyonunu anında keser ve karakter hemen yürümeye başlar
 *  (kiting / hit-and-run). Toplam animasyon = ATK_WINDUP + ATK_RECOVER. */
export const ATK_WINDUP = 0.1;
export const ATK_RECOVER = 0.24;
export const ATK_ANIM = ATK_WINDUP + ATK_RECOVER;

/* 🎯 ATIŞ YÖNÜNE DÖNÜŞ (rotation lock)
 *
 * Ateş ettiğinde/düz vuruş yaptığında ya da yetenek kullandığında karakter
 * gövdesini HEDEFİN bulunduğu yöne döndürür. Kilit kısa süre açık kalır
 * (düz vuruş animasyonu kadar, yeteneklerde bir tık daha uzun) ve kilit
 * boyunca hareket yönü dönüşü bastırılır: karakter yürürken de attığı yere
 * bakar — kiting / stutter-step'te gövde hedeften kopmaz.
 *
 * Yön arenanın kendi uzayındadır (dx sağ +, dy aşağı +) ve yaw = atan2(dx, dy)
 * ile Three.js dönüşüne çevrilir (yaw 0 → +Z, +PI/2 → +X).
 */
/** Yetenek (süper/ulti) sonrası yön kilidinin süresi (saniye). */
export const AIM_TURN_HOLD = 0.55;
/** Düz vuruşta kilit daha kısa: animasyon (windup+recovery) bitince bırakılır. */
export const AIM_TURN_HOLD_BASIC = 0.34;

/**
 * Gövdeyi verilen yöne kilitler (ateş/yetenek anında çağrılır).
 * Yön sıfıra çok yakınsa (nişan yok) hiçbir şey yapılmaz: karakter mevcut
 * dönüşünü korur.
 */
export function faceAimYaw(
  f: BattleFighter,
  dx: number,
  dy: number,
  hold: number = AIM_TURN_HOLD,
): void {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  if (Math.hypot(dx, dy) < 1e-3) return;
  f.aimYaw = Math.atan2(dx, dy);
  f.aimYawT = Math.max(f.aimYawT ?? 0, hold);
}

/** Yön kilidini zamanlar (0'da durur) — her sim adımında bir kez çağrılır. */
export function tickAimYaw(f: BattleFighter, dt: number): void {
  if ((f.aimYawT ?? 0) > 0) f.aimYawT = Math.max(0, (f.aimYawT ?? 0) - dt);
}

/** Kraliyet Savaşçısı ikinci ultiyi (iki elli kılıç yere vuruş) kullanır:
 *  elinde zaten kraliyet kılıcı olduğu için ulti tam olarak o skine bağlı. */
export function isSamuraiFighter(fighter: BattleFighter): boolean {
  return isRoyalWarriorSkin(resolveSkinUrl(fighter.equipped));
}

export const SAMURAI_ULTIMATE_DAMAGE = 360;

/** Vuruş sarsıntısının (hit-stun) üst sınırı — ulti gibi ağır vuruşlarda. */
export const HIT_STUN_MAX = 0.42;

/**
 * Vuruş tepkisi: vurulan karakter bir an kontrolünü kaybeder (hit-stun) ve
 * vuran taraftan uzağa savrulur. Tepkinin şiddeti hasarın ağırlığına bağlı —
 * normal mermi hafif bir sarsıntı, ulti/beam/dash sert bir savrulma verir.
 *
 * Savrulma sadece hız olarak yazılır; konum güncellemesini sim tarafındaki
 * `stepHitStun` oyunun kendi hareket/çarpışma fonksiyonuyla yapar, böylece
 * karakter savrulurken duvarın içinden geçmez.
 */
export function applyHitReaction(
  target: BattleFighter,
  fromX: number,
  fromY: number,
  dmg: number,
): void {
  const k = Math.max(0, Math.min(1, (dmg - 110) / 250));
  target.hitStunT = Math.max(target.hitStunT, 0.1 + 0.32 * k);
  target.hitStunK = Math.max(target.hitStunK, 0.5 + 0.5 * k);
  const dx = target.x - fromX;
  const dy = target.y - fromY;
  const d = Math.hypot(dx, dy) || 1;
  const force = 70 + 640 * k;
  target.kbVX = (dx / d) * force;
  target.kbVY = (dy / d) * force;
}

/**
 * Sarsılma fazını ilerletir: savrulma hızını oyunun kendi hareket fonksiyonuyla
 * uygular (duvar/obstacle kontrolleri korunur) ve sarsılma bitince durumu
 * temizler. True dönerse karakter bu karede kontrolü kaybetmiştir.
 */
export function stepHitStun(
  f: BattleFighter,
  dt: number,
  move: (f: BattleFighter, dx: number, dy: number, dt: number) => void,
): boolean {
  if (f.hitStunT <= 0) return false;
  f.hitStunT -= dt;
  if (f.hitStunT <= 0) {
    f.hitStunT = 0;
    f.hitStunK = 0;
    f.kbVX = 0;
    f.kbVY = 0;
    return false;
  }
  const damp = Math.exp(-dt * 8);
  move(f, f.kbVX * dt, f.kbVY * dt, dt);
  f.kbVX *= damp;
  f.kbVY *= damp;
  // Savrulurken yalpalama animasyonu oynasın (duvara dayansa bile).
  f.moving = true;
  f.phase += dt * 6;
  return true;
}

/** Vuruş animasyonunu başlatır (ateş anında çağrılır): karakter kısa süre
 *  köklenir, ardından kesilebilir bir bitiş animasyonu oynar. */
export function startAttackAnim(f: BattleFighter): void {
  f.atkAnimT = ATK_ANIM;
}

/** Vuruş animasyonunun anlık "atılma" eğrisi (0..1): windup'ta yükselir,
 *  bitiş animasyonunda geri söner. Animasyon kesilmişse (atkAnimT = 0) 0'dır,
 *  yani gövde anında dinlenme duruşuna döner. */
export function attackPunch(f: BattleFighter): number {
  if (f.atkAnimT <= 0) return 0;
  const elapsed = ATK_ANIM - f.atkAnimT;
  const rise = Math.min(1, elapsed / ATK_WINDUP);
  const recover = Math.max(0, Math.min(1, f.atkAnimT / ATK_RECOVER));
  return rise * recover;
}

/** Vuruş animasyonunu ilerletir ve cancel penceresini yönetir.
 *  - `wantsMove`: bu karede hareket girdisi var mı (joystick / klavye).
 *  `locked` true ise karakter hâlâ windup'ta köklenmiştir → hareket girdisi
 *  yok sayılır. Pencere açıldıktan sonraki ilk hareket girdisi bitiş
 *  animasyonunu keser (`canceled`) ve karakter hemen yürümeye başlar. */
export function stepAttackAnim(
  f: BattleFighter,
  dt: number,
  wantsMove: boolean,
): { locked: boolean; canceled: boolean } {
  if (f.atkAnimT <= 0) return { locked: false, canceled: false };
  f.atkAnimT = Math.max(0, f.atkAnimT - dt);
  if (f.atkAnimT > ATK_RECOVER) return { locked: true, canceled: false };
  // ── Cancel penceresi açık: hareket girdisi bitiş animasyonunu keser. ──
  if (wantsMove) {
    f.atkAnimT = 0;
    return { locked: false, canceled: true };
  }
  return { locked: false, canceled: false };
}

/** Sadece animasyonu ilerletir (köklenme/cancel yok). Botlar run-and-gun
 *  yapar ama vuruş pozları yine de görünsün diye kullanılır. */
export function tickAttackAnim(f: BattleFighter, dt: number): void {
  if (f.atkAnimT > 0) f.atkAnimT = Math.max(0, f.atkAnimT - dt);
}

/** True when the browser can render WebGL (used to pick 3D vs 2D arena). */
export function supportsWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

/* Arena ölçek/Dünya sabitleri (S, HUD, ARENA_W…) `./arena/shared` modülüne
 *  taşındı — dosya boyutu limiti için modüllere bölündü. */

export interface BattleFighter {
  name: string;
  config: AvatarConfig;
  equipped: string[];
  ability: AbilityDef;
  /** Уровень бойца (1..10) — масштабирует HP/урон/скорость стрельбы бота. */
  level: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  facing: number;
  phase: number;
  moving: boolean;
  atkCd: number;
  /** Düz vuruş animasyonunun kalan süresi (windup + bitiş). 0 = animasyon
   *  bitmiş. Cancel penceresinde hareket girdisi bunu anında 0'lar. */
  atkAnimT: number;
  /** Yetenek atışının görsel iz sayacı (1 → 0). SkillComponent yazar,
   *  SlashTrail azaltır; oyun mantığına etkisi yoktur (saf görsel). */
  castFxT?: number;
  superCharge: number;
  /** Samuray'a özel ikinci ulti şarjı. Diğer skinlerde 0 kalır. */
  samuraiCharge: number;
  /** Yere iki elle kılıç vurma animasyonunun kalan süresi. */
  samuraiUltT: number;
  samuraiUltHit: boolean;
  /** ⚔️ Yakın dövüş (melee) salınımının kalan süresi (sn). 0 = hazır.
   *  Yalnızca Kraliyet Savaşçısı kullanır; süre boyunca karakter köklenir. */
  meleeT: number;
  /** Melee yeniden kullanma bekleme süresi (sn). */
  meleeCd: number;
  /** Bu salınımda üstüne atlama (bitirici) var mı? */
  meleeLeap: boolean;
  /** Salınım başında verilmiş olan vuruş sayısı (0 → 2/3). */
  meleeStrikes: number;
  /** ⚔️ Vuruş efektlerinin çıpası: kılıç UCUNUN arena px konumu. Kemik
   *  katmanı (`RoyalMelee`) her karede yazar; sim katmanı efektleri buraya
   *  koyar, böylece efekt kılıcın indiği noktadan çıkar. */
  meleeFxX?: number;
  meleeFxY?: number;
  /** Ucun DÜNYA yüksekliği (birim) — iz şeridi kılıcın dikey kavisine oturur. */
  meleeFxH?: number;
  /** Çıpanın yazıldığı an (`performance.now()`) — bayat değer kullanılmaz. */
  meleeFxT?: number;
  dashT: number;
  dashVX: number;
  dashVY: number;
  dashHit: boolean;
  lastHitAt: number;
  /** Sarsılma (hit-stun): kalan süre — bu sürede hareket girdisi yok sayılır. */
  hitStunT: number;
  /** Sarsılmanın şiddeti 0..1 — görsel titreme/savrulma bununla ölçeklenir. */
  hitStunK: number;
  /** Vuruştan gelen savrulma hızı (px/s) — sürtünmeyle söner. */
  kbVX: number;
  kbVY: number;
  vy: number; // vertical movement direction: -1 up, 0 idle, +1 down
  /**
   * 🎯 Ateş/yetenek anında gövdenin döndüğü yön (radyan, arena uzayı:
   * `yaw = atan2(dx, dy)`). `SkillComponent` yazar (faceAimYaw) ve
   * `aimYawT > 0` olduğu sürece gövde, hareket yönü yerine bu yöne bakar.
   */
  aimYaw?: number;
  /** Yön kilidinin kalan süresi (saniye). 0 → kilit yok. */
  aimYawT?: number;
  /**
   * 🧭 KALICI bakış yönü (radyan, arena uzayı — modelTurn hariç). Kilit
   * bittiğinde gövde eski pozisyonuna dönmez: ateş ettiği/yürüdüğü son yönde
   * kalır. `aimYaw` (kilit) ve hareket yönü buraya da yazılır.
   */
  restYaw?: number;
  /** Bot strafe direction after firing (1 or -1). Only used by the AI. */
  strafeDir?: number;
  /** Bot only: how long (seconds) the bot has been barely moving while trying to move. */
  stuckT?: number;
  /** Bot only: direction of the last successful unblock move (1 or -1). */
  unblockDir?: number;
  /** Bush stealth: timestamp (performance.now) until which the fighter is
   *  revealed again after attacking / taking damage inside a bush. */
  revealUntil: number;
  /** QA teşhisi (yalnızca okunur): gövde ölçümü.
   *  `boxH` sınır kutusu, `span` iskelet kemik açıklığı, `bodyH` seçilen gövde
   *  yüksekliği ve `scale` uygulanan ölçek. Oyun mantığını etkilemez;
   *  `qa/QaScene` bunu panele `[BODY]` satırı olarak yazar. */
  bodyMetrics?: {
    boxH: number;
    scale: number;
    /** Kazançla birlikte dünya cinsinden gövde yüksekliği (birim). */
    worldH: number;
    /** Modelin kutu tabanını zemine oturtan kayma (rig birimi). */
    groundOffset: number;
    skin: boolean;
  };
}

/** Brawl-style bush (stealth) zones — fighters can walk through bushes and
 *  are hidden from their enemy while standing inside one. */
export const BUSH_REVEAL_MS = 1200;
const BUSHES = BATTLE_OBSTACLES.filter((o) => o.kind === "bush");

/** Index of the bush rect containing (x, y), or -1 when outside any bush. */
export function bushIndexOf(x: number, y: number): number {
  for (let i = 0; i < BUSHES.length; i++) {
    const b = BUSHES[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i;
  }
  return -1;
}

/** True when the point stands inside a bush rect. */
export function isInBush(x: number, y: number): boolean {
  return bushIndexOf(x, y) >= 0;
}

/** True when a fighter is currently revealed (attacked / took damage). */
export function isRevealed(f: BattleFighter, now = performance.now()): boolean {
  return now < f.revealUntil;
}

/** Brawl-style hiding: fighter `f` cannot be seen by observer `o` when it is
 *  inside a bush, not currently revealed, and they are not standing in the
 *  SAME bush (mutual vision). Fighters outside bushes are always visible. */
export function isHiddenFrom(f: BattleFighter, o: BattleFighter): boolean {
  const fi = bushIndexOf(f.x, f.y);
  if (fi < 0) return false;
  if (performance.now() < f.revealUntil) return false;
  return fi !== bushIndexOf(o.x, o.y);
}

/* BattleProj / BattleFx tipleri `./arena/shared` modülüne taşındı ve yukarıda
 *  yeniden dışa aktarılıyor. */

/* COLD_FLAME, pushColdFlameFx ve efekt havuzu boyutları `./arena/shared`
 *  modülüne taşındı; yukarıda içe aktarılıyor. */

/* ------------------------------------------------------------------ */
/* Fighters — the same rigged GLB character used in the street world.  */
/* While the GLB streams in (or if it can't be fetched) the fighter is  */
/* drawn as a procedural low-poly humanoid built from avatar colors.   */
/* ------------------------------------------------------------------ */

/** GLB'nin normalize edildiği gövde yüksekliği (rig içi birim) — prosedürel
 *  gövdenin ~1.5 birimlik siluetiyle aynı, böylece ölçek zıplamıyor. Dünya
 *  cinsinden yükseklik bunun RIG_ROOT_SCALE ile çarpımıdır. */
const FIGHTER_MODEL_H = 1.5;

/** Arena gövde ölçeği kazancı.
 *
 *  Normalizasyon her gövdeyi (varsayılan görünüm, Samuray, Kraliyet Savaşçısı,
 *  Şövalye, bot ve PvP rakibi) aynı `FIGHTER_MODEL_H` yüksekliğine getirir —
 *  yani boylar zaten EŞİTTİR. Bu sabit o ortak boyun üstüne uygulanan kazançtır:
 *  karakter arenada yerdeki taşlara/çalıluğa kıyasla belirgin ve okunur durur
 *  (ölçüldü: gövde 0.72 dünya birimiydi, harita 34×22 — karakter fazla ufak
 *  kalıyordu). Baş-üstü can barı aynı adımı `HEAD_UI_LIFT` ile izler, böylece
 *  bar büyüyen gövdenin kafasına gömülmez.
 *
 *  ÖLÇÜ (neden 2.05): projenin kendi ölçek kuralı 1 birim ≈ 1 metre ve cadde
 *  tarafındaki karakterler `PLAYER_3D_HEIGHT = 1.92` birime normalize edilir.
 *  Arena haritası da aynı ölçekte (34×22 birim) ve dövüşçü çarpışma yarıçapı
 *  `FIGHTER_R = 22px = 0.44 birim` — yani 1.8-2.0 birimlik bir gövdenin omuz
 *  genişliği. Eskiden gövde 0.72 birime normalize ediliyordu: karakter hem
 *  cadde karakterinin yarısı hem de haritadaki heykellerin yanında "karınca"
 *  gibi kalıyordu. 1.5 × 2.05 × 0.48 = 1.48 birim → heykellerle aynı dil,
 *  menzil çemberi (4 birim) hâlâ ~2.7 gövde boyu. */
/* Gövde ölçeği kazancı `./arena/shared` modülündedir (arena geneli tek kaynak:
 * aynı sabiti ArenaCamera, yedek prosedürel gövde ve efekt katmanları okur). */

/** Gövde büyürken baş-üstü HUD'ın yukarı kayması (dünya birimi).
 *  İsim etiketi 1.05, can barı 0.86 yükseklikte durur; kazanç kadar yukarı
 *  çekilirler — barın BOYU değişmez (bar 1.3× büyümesin). */
const HEAD_UI_LIFT = (BODY_SCALE_GAIN - 1) * 1.05;

/** Göğüs hizası (rig birimi). Vuruş kıvılcımları ve şimşek sprite'ları bu
 *  yükseklikten çıkar; gövde kazancıyla birlikte ölçeklenir ki efektler
 *  büyüyen gövdenin göğsünde kalsın (0.85 × kazanç). */
const CHEST_Y = 0.85 * BODY_SCALE_GAIN;

/** Şampiyon aurası (hâle) gövde merkezine göre ölçek ve taban opaklık.
 *
 *  Karakterin kendi renginde nefes alan yumuşak bir ışık hâlesi: uzaktan da
 *  "şampiyon" gibi okunur ve bloom'u besler. Oyuncununki daha belirgindir
 *  (kendi karakterini anında ayırt et). Tamamen görseldir — hasar/menzil/ağ
 *  mantığına dokunmaz, `depthWrite` kapalı olduğu için hiçbir şeyi örtmez. */
const AURA_SIZE = 1.8 * BODY_SCALE_GAIN;
const AURA_OPACITY_PLAYER = 0.17;
const AURA_OPACITY_ENEMY = 0.11;

/* ------------------------------------------------------------------ */
/* SAVAŞ DURUŞU (battle stance) ve VARSAYILAN BAKIŞ                    */
/*                                                                    */
/* 1) DURUŞ: MOBA karakterleri dururken dimdik durmaz — hafif öne eğik, */
/*    dizleri bükülmüş ve ağırlığı bir ayaktan diğerine akan "hazır"     */
/*    bir duruş sergiler. Kemik bazlı poz ÖLÇÜLEREK elendi: kemik       */
/*    adları model başına değişiyor (character.glb'de `FootL/FootR`      */
/*    gövde köküne bağlı, `skin-samuray`da beklenen adlar hiç yok),     */
/*    yani `LowerLeg` döndürmek ayağı gövdeden koparırdı. Bu yüzden      */
/*    duruş GÖVDE SARGISINA (bodyWrap) uygulanır: (a) ayak hattından     */
/*    dönen hafif öne eğilme, (b) dikey alçalma (dizler bükülmüş gibi), */
/*    (c) yavaş ağırlık salınımı — hareket başlarken yumuşakça kapanır. */
const STANCE_LEAN = 0.085; // rad (~4.9°) — öne eğilme
const STANCE_CROUCH = 0.035; // dikey sıkıştırma (~%3.5) — çömelmiş diz
const STANCE_SWAY = 0.03; // rad (~1.7°) — gövde eğimi (yan)
const STANCE_YAW = 0.022; // rad (~1.3°) — nefesle birlikte hafif gövde dönüşü
const STANCE_SHIFT = 0.016; // birim — bir ayaktan diğerine ağırlık kayması

/* 2) VARSAYILAN BAKIŞ: yaw 0 = +z = KAMERAYA DÖNÜK olduğu için karakter */
/*    dururken ön yüzünü gösteriyordu. Varsayılan yön artık ekranda        */
/*    yukarı = -z = koridor/kuzey yönü: oyuncu, MOBA'larda olduğu gibi    */
/*    karakterin arkasını/omzunu görür. Hareket veya yetenek anında gövde */
/*    anında gerçek yönüne döner (restYaw zaten her atış/yürüyüşte         */
/*    güncellenir). Ayar düğmesi: MOBA'da beklenen koridor yönü `PI`,     */
/*    klasik MOBA kamera düzenindeki çapraz koridor ise `PI / 4`.          */
const DEFAULT_REST_YAW = Math.PI;

/* 3) KEMİK KATMANI: yukarıdaki gövde sargısı katmanı her modele uygulanır,
 *    ama asıl "savaşa hazır" izlenimi iskeletten gelir — dizler bükülür,
 *    gövde öne alınır, eller öne hazırlanır. Eksenler ve işaretler her
 *    iskelet için ÖLÇÜLEREK bulunur (bkz. engine/BattleStance), bu yüzden
 *    dört farklı rig'de (karakter/Samuray/Şövalye/Kraliyet) de doğru çalışır.
 *    Model kökü uzayında "ileri" yön: varsayılan +z, Kraliyet Savaşçısı -z. */
const FORWARD_POS_Z = new THREE.Vector3(0, 0, 1);
const FORWARD_NEG_Z = new THREE.Vector3(0, 0, -1);

/** Şampiyon ışığı: karakterin göğsünden yayılan kendi renginde küçük bir
 *  nokta ışığı. Arenanın lav/gece atmosferinde gövdeyi ve altındaki zemini
 *  canlı tutar — "gösterişli şampiyon" hissinin asıl kaynağı budur.
 *  Mesafe/şiddet ölçülü tutulur: zemin yanmaz, yalnızca karakter çevresi
 *  aydınlanır. (Tek kare maliyeti: 2 nokta ışık.) */
const HERO_LIGHT_INTENSITY = 1.1;
const HERO_LIGHT_DISTANCE = 3.2;

/** QA tarayıcısı için işaret: dövüşçü rig'i harita geometrisi DEĞİLDİR.
 *  Kemikli (skinned) gövde/zırh parçalarının bounding box'ı bind-pose'dur ve
 *  dünya konumları karakteri takip eder; taranınca onlarca yanlış "harita
 *  sınırının dışında" / "dokusuz siyah yüzey" bulgusu üretiyorlardı
 *  (siyah göz/kaş dokusu zaten kasıtlı). Tarayıcı bu bayrağı taşıyan alt
 *  ağacı atlar — bkz. `qa/QaScene.startScan`. */
const FIGHTER_RIG_MARK = { qaIgnore: true };

/** Adım senkronu: ışınlanma sıçramalarını kırpan üst sınır ve "duruyor"
 *  eşiği (px/sn). */
const MAX_TRACKED_SPEED = 1400;
const MIN_MOVING_SPEED = 5;

/** One rigged GLB character instance driven by a battle-fighter ref. */
function GlbFighterBodyCore({
  fighter,
  url,
  equipped,
}: {
  fighter: MutableRefObject<BattleFighter>;
  url: string;
  equipped?: string[];
}) {
  const groupRef = useRef<THREE.Group>(null);
  // Skin system: resolve skin URL from equipped items if available
  const skinUrl = useMemo(
    () => (equipped ? resolveSkinUrl(equipped) : null),
    [equipped],
  );
  const { scene, animations } = useGLTF(skinUrl || url);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  // Root motion temizliği: zırh/skin klipleri kalça konum eğrilerini de
  // taşıyor; oyun konumu ayrıca kendisi sürdüğü için bu kayma çakışıp
  // karakteri her adımda kendi kendine kaydırıyordu.
  const cleanAnimations = useMemo(
    () => stripRootMotion(animations),
    [animations],
  );
  const { actions } = useAnimations(cleanAnimations, groupRef);
  const movingRef = useRef(fighter.current.moving);
  const previousPosition = useRef({
    x: fighter.current.x,
    y: fighter.current.y,
  });

  // Kraliyet Savaşçısı: elindeki kılıçla iki elli yere vurma pozu.
  const royalSlammer = isSamuraiFighter(fighter.current);
  const slamRig = useMemo(() => findRoyalSlamRig(clone), [clone]);
  // Savaş duruşu (kemik katmanı): dururken dizleri büker, gövdeyi öne alır ve
  // elleri hazır tutar. Kraliyet Savaşçısı'nın modeli ters baktığı için ölçüm
  // "ileri" ekseni ona göre verilir (bkz. `modelTurn`).
  const royalForward = fighter.current.equipped.some(
    (item) => item === "skin-savasci-glb",
  );
  const stanceRig = useMemo(
    () =>
      findBattleStance(
        clone,
        slamRig,
        royalForward ? FORWARD_NEG_Z : FORWARD_POS_Z,
      ),
    [clone, slamRig, royalForward],
  );
  /** Duruş katsayısı: 1 = hareketsiz savaş duruşu, 0 = hareket/ulti. */
  const stanceK = useRef(1);
  const slamBladeAxis = useRef<THREE.Vector3 | null>(null);
  const wasUlt = useRef(false);
  // Kraliyet zırhı/kılıcı + kılıç kalibrasyonu bu hook içinde bağlanır.
  useRoyalWarriorEffects(
    clone,
    skinUrl,
    fighter.current.equipped,
    FIGHTER_MODEL_H,
    groupRef,
    useRef<THREE.Mesh | null>(null),
    movingRef,
  );

  // Normalize to FIGHTER_MODEL_H — her görünüm (varsayılan / Samuray /
  // Kraliyet Savaşçısı / Şövalye) aynı gövde boyuna gelir ve üstüne ortak
  // `BODY_SCALE_GAIN` uygulanır. Skinlerin kendi aksesuarları (kılıç, kalkan)
  // de bu kutuya dahildir; ölçüm yalnızca YÜKSEKLİĞİ kullandığı için silahın
  // yana/yukarı taşması gövdeyi küçültmez (kuantize modellerde `Box3`
  // iskeletli tepe noktaları dahil ölçülür — gerçek üç.js davranışı).
  const bodyFit = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const boxH = Math.max(box.max.y - box.min.y, 0.0001);
    const scale = (FIGHTER_MODEL_H * BODY_SCALE_GAIN) / boxH;
    // Ölçek grup KÖKENİNE (ayak hizası) uygulanır, ama bazı skinlerin iskeleti
    // kökende ORTALANMIŞ (ör. Samuray: kutu y −0.91..0.92). Öyle bir model
    // ölçeklenince bacakları zeminin altında kalıyor ve karakter ekranda YARIM
    // boy görünüyordu — "skinler ufak" şikâyetinin yarısı buydu. Kutu tabanı
    // y = 0'a çekilir, yani karakter her zaman ayakları yerde durur.
    const groundOffset = -box.min.y * scale;
    // QA teşhisi: gövde ölçümü panelde `[BODY]` satırı olarak görünür.
    fighter.current.bodyMetrics = {
      boxH,
      scale,
      groundOffset,
      worldH: FIGHTER_MODEL_H * BODY_SCALE_GAIN * RIG_ROOT_SCALE,
      skin: skinUrl !== null,
    };
    return { scale, groundOffset };
  }, [scene, skinUrl, fighter]);

  useEffect(() => {
    clone.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      // Karakter artık üzerine düşen gölgeyi de alır (kemer, duvar, diğer
      // dövüşçü) — dövüşçü sahnenin parçası gibi okunur.
      mesh.receiveShadow = true;
      // Clone materials so every fighter owns its own material instances —
      // the GLB loader caches + SkeletonUtils.clone share materials between
      // fighters, which would make bush stealth opacity leak across rigs.
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => m.clone());
      } else if (mesh.material) {
        mesh.material = (mesh.material as THREE.Material).clone();
      }
      // Materyal detayı: zırh/deri hafifçe ışığı yansıtır (çevre haritası +
      // metalik dokunuş). Dövüşçü böylece düz "baloncuk" yerine detaylı,
      // ışığı yakalayan bir model olarak görünür.
      const list = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const entry of list) {
        const material = entry as THREE.MeshStandardMaterial;
        if (!material?.isMeshStandardMaterial) continue;
        material.envMapIntensity = Math.max(material.envMapIntensity || 1, 0.9);
        if (typeof material.metalness === "number") {
          material.metalness = Math.min(0.85, material.metalness + 0.12);
        }
        if (typeof material.roughness === "number") {
          material.roughness = Math.max(0.25, material.roughness * 0.85);
        }
      }
    });
    // Oyuncunun oyun girişinde seçtiği renk VARSAYILAN görünümü boyar.
    // TAM karakter skini kuşanılmışsa (Kraliyet Savaşçısı / Samuray / Şövalye)
    // boyama HİÇ uygulanmaz: o modeller orijinal renklerini (yazarın
    // dokularını) korur — "skinli karaktere renk seçilmez". Renk, az önce
    // üretilen bireysel materyal klonlarından başlayarak uygulanır.
    applyCharacterTint(
      clone,
      hasCharacterSkin(fighter.current.equipped)
        ? null
        : fighter.current.config?.shirt,
    );
  }, [clone]);

  // Hareket klibi seçimi + adım oranı (modelden BİR KEZ ölçülür).
  //
  // Yürüme/koşu adaylarının her biri için, klibin 1x hızda kendi kendine
  // kat ettiği yol ölçülür ve en hızlısı seçilir: karakter 2.4x hızlandırılmış
  // bir yürüme döngüsü yerine ~1.6x'lik koşu döngüsüyle gösterilir. İkisi de
  // ayakları zemine oturtur; koşu adımı daha uzun olduğu için daha doğal
  // durur. Klip süresi modele göre değiştiği için kalibrasyon her zırh/skin
  // için kendi kendine yapılır.
  const clips = useMemo(() => {
    const keys = Object.keys(actions);
    const idle = keys.find((key) => key.toLowerCase().includes("idle"));
    const worldHeight = FIGHTER_MODEL_H * RIG_ROOT_SCALE;
    let walk: string | undefined;
    let strideRatio = 0;
    let bestSpeed = -1;
    for (const key of keys) {
      if (!/walk|run/i.test(key)) continue;
      const clip = cleanAnimations.find((c) => c.name === key);
      if (!clip) continue;
      const ratio = measureStrideRatio(clone, clip);
      const impliedSpeed =
        (2 * ratio * worldHeight) / Math.max(clip.duration, 0.05);
      if (impliedSpeed > bestSpeed) {
        bestSpeed = impliedSpeed;
        walk = key;
        strideRatio = ratio;
      }
    }
    if (!walk) walk = keys.find((key) => key !== idle);
    return { idle, walk, strideRatio };
  }, [actions, cleanAnimations, clone]);

  // Start with the idle clip (or the first clip if none is named idle).
  useEffect(() => {
    const key = clips.idle ?? Object.keys(actions)[0];
    const action = key ? actions[key] : undefined;
    if (!action) return;
    action.reset().fadeIn(0.2).play();
    return () => {
      action.fadeOut(0.2);
    };
  }, [actions, clips]);

  // Crossfade idle ↔ walk from the simulation's moving flag (no re-renders).
  const currentClip = useRef<"idle" | "walk">("idle");
  useFrame((_, dt) => {
    const f = fighter.current;
    const dts = Math.max(dt, 1e-4);
    const movedX = f.x - previousPosition.current.x;
    const movedY = f.y - previousPosition.current.y;
    // Gerçek yer değiştirmeden ölçülen hız (px/sn). Simülasyonda atalet yok:
    // joystick bırakıldığı karede girdi sıfırlanır ve bu ölçüm de sıfır olur.
    // (Sabit hızda oynayan klip yüzünden "arkadan kayma" görünüyordu.)
    const speed = Math.min(Math.hypot(movedX, movedY) / dts, MAX_TRACKED_SPEED);
    const actuallyMoving = f.moving && speed > MIN_MOVING_SPEED;
    movingRef.current = actuallyMoving;
    previousPosition.current.x = f.x;
    previousPosition.current.y = f.y;
    const next: "idle" | "walk" = actuallyMoving ? "walk" : "idle";
    // ── Adım senkronu (foot sliding / ice skating'i bitirir) ──
    // Klip hızı gerçek hıza eşitlenir: yavaşlarken adımlar yavaşlar,
    // bırakınca döngü neredeyse anında sabitlenir (donmuş poz bırakmadan).
    const walkAction = clips.walk ? actions[clips.walk] : undefined;
    if (walkAction) {
      const target = walkTimeScale(
        speed / S,
        clips.strideRatio,
        walkAction.getClip().duration,
        FIGHTER_MODEL_H,
        RIG_ROOT_SCALE,
      );
      // Hızlanma yumuşak, durma çok daha keskin (ani fren hissi).
      const rate = speed > MIN_MOVING_SPEED ? 10 : 26;
      walkAction.timeScale +=
        (target - walkAction.timeScale) * Math.min(1, rate * dt);
    }
    const slamActive = royalSlammer && f.samuraiUltT > 0;
    const slamProgress = slamActive
      ? 1 - Math.max(0, f.samuraiUltT) / ROYAL_ULT_LOCK
      : 0;
    // ⚔️ Yakın dövüş (melee): sol/sağ kesiş + hamleli bitirici. Ulti ile
    // çakışmaz (sim ikisini birlikte başlatmaz); süre `meleeT` ile akar.
    const meleeActive = royalSlammer && f.meleeT > 0;
    const meleeProgress = meleeActive
      ? 1 - Math.max(0, f.meleeT) / meleeDuration(f.meleeLeap)
      : 0;
    // Ulti/melee kemikleri kendisi sürerken duruş katmanı kapanır (duruş
    // kemiklerini melee koluyla çakıştırmasın diye). Duruş useFrame'i bu
    // kareden SONRA çalıştığı için bayrak burada yazılır.
    stanceRig.suppressed = slamActive || meleeActive;
    const g = groupRef.current;
    if ((slamActive || meleeActive) && g) {
      // Kılıç bıçağının el-lokal ekseni bir kez ölçülür (rig'e sabit yok).
      if (!slamBladeAxis.current && slamRig.rightHand) {
        const sword = findHandSword(slamRig.rightHand);
        if (sword) {
          slamBladeAxis.current = measureBladeAxis(slamRig.rightHand, sword);
        }
      }
      // Gövde ağırlığı (hamle / çömelme / kalça burulması) EN ÖNCE
      // uygulanır: kol ve omurga hedefleri dünya uzayında hesaplandığı
      // için poz bu duruşun üstüne biner (yapıştırılmış gibi durmaz).
      const body = slamActive
        ? computeRoyalSlamBody(slamProgress)
        : computeMeleeBody(meleeProgress, f.meleeLeap);
      if (body) applyRoyalSlamBody(g, slamRig, body, f.facing);
      if (slamActive) {
        applyRoyalSlamPose({
          rig: slamRig,
          bladeAxis: slamBladeAxis.current,
          progress: slamProgress,
          facing: f.facing,
          active: true,
        });
      } else {
        applyMeleePose({
          rig: slamRig,
          bladeAxis: slamBladeAxis.current,
          progress: meleeProgress,
          leap: f.meleeLeap,
          facing: f.facing,
          active: true,
          // Vuruş çıpası dövüşçünün kendisine yazılır: sim katmanı efektleri
          // kılıç ucunun gerçekten bulunduğu noktaya koyar.
          anchor: f,
        });
      }
    } else if (wasUlt.current && g) {
      // Ulti/melee bitti → gövdeyi dinlenme duruşuna döndür.
      clearRoyalSlamBody(g);
    }
    wasUlt.current = slamActive || meleeActive;
    if (next === currentClip.current) return;
    const from =
      actions[
        currentClip.current === "idle" ? (clips.idle ?? "") : (clips.walk ?? "")
      ];
    const to =
      actions[next === "idle" ? (clips.idle ?? "") : (clips.walk ?? "")];
    // Dururken hızlı, başlarken biraz daha yumuşak geçiş: karakter bıraktığın
    // anda adım atmayı bırakır (ayak zeminde sürüklenmez).
    const fade = next === "idle" ? 0.07 : 0.12;
    if (from) from.fadeOut(fade);
    if (to) to.reset().fadeIn(fade).play();
    currentClip.current = next;
  });

  // ── SAVAŞ DURUŞU (kemik katmanı) ────────────────────────────────────
  // Animasyon klipi (idle/walk) kemikleri yazdıktan SONRA çalışır; aynı
  // premultiply yöntemi (bkz. RoyalSlam.aimBone) sayesinde klibin ÜSTÜNE
  // biner, klibi kesmez. Ulti kemikleri kendisi sürdüğü için duruş o sırada
  // kapanır, maç başında ise katsayı 1'den başlar (duruş hep açık).
  useFrame((_, dt) => {
    const f = fighter.current;
    const target = f.moving || f.samuraiUltT > 0 || f.meleeT > 0 ? 0 : 1;
    stanceK.current += (target - stanceK.current) * Math.min(1, dt * 6);
    applyBattleStance(stanceRig, stanceK.current);
  });

  // Ölçülen alçalma miktarı gövde katmanına aktarılır (kimlik: dövüşçü ref'i).
  // Ölçüm model-kökü biriminde; gövde katmanı `bodyWrap` (ölçek 1) olduğu için
  // aradaki tek ölçek modelin kendi ölçeğidir (bodyFit.scale).
  useEffect(() => {
    publishStanceDrop(fighter, stanceRig.drop * bodyFit.scale);
  }, [fighter, stanceRig, bodyFit.scale]);

  return (
    <>
      {/* Şampiyon ışığı: karakterin kendi renginde küçük bir nokta ışığı.
          Lav/gece atmosferinde gövdeyi ve ayak çevresindeki zemini canlı
          tutar — "gösterişli şampiyon" hissinin asıl kaynağı budur. Mesafe
          ve şiddet ölçülüdür: zemin yanmaz, yalnızca karakter çevresi ışır;
          `decay = 2` sayesinde kenar yumuşak söner. Işık rig uzayındadır
          (gövde ölçeğinden bağımsız), yani her görünümde aynı durur. */}
      <pointLight
        position={[0, CHEST_Y * 0.9, 0]}
        color={fighter.current.config?.shirt ?? "#ffffff"}
        intensity={HERO_LIGHT_INTENSITY}
        distance={HERO_LIGHT_DISTANCE}
        decay={2}
      />
      <group
        ref={groupRef}
        scale={bodyFit.scale}
        position={[0, bodyFit.groundOffset, 0]}
      >
        <primitive object={clone} />
      </group>
    </>
  );
}

/** Battle fighter body with the SAME fallback chain as the street world:
 *  primary model URL → RobotExpressive fallback (so the battle always
 *  shows the same character as the street). Only if even that fails does
 *  the procedural low-poly body take over (rig's boundary). */
function GlbFighterBody({
  fighter,
}: {
  fighter: MutableRefObject<BattleFighter>;
}) {
  const equipped = fighter.current.equipped;
  return (
    <GlbModelRetry
      fallback={
        <GlbFighterBodyCore
          fighter={fighter}
          url={FALLBACK_MODEL_URL}
          equipped={equipped}
        />
      }
    >
      <GlbFighterBodyCore
        fighter={fighter}
        url={characterModelUrl()}
        equipped={equipped}
      />
    </GlbModelRetry>
  );
}

/* Baş-üstü HUD çizimi (can barı + isim etiketi + bolt dokusu) `./arena/headUi`
 * modülüne taşındı; BAR_W/BAR_H ve çizim fonksiyonları oradan içe aktarılır. */

/* Çalı görünürlüğü (bush stealth) `./arena/bushFade` modülüne taşındı;
 * dışa aktarılan isim uyumluluğu için buradan yeniden dışa aktarılır. */
export { applyBushTransparency };

function FighterRig({
  fighter,
  other,
  isPlayer = false,
}: {
  fighter: MutableRefObject<BattleFighter>;
  other: MutableRefObject<BattleFighter>;
  isPlayer?: boolean;
}) {
  const bodyWrap = useRef<THREE.Group>(null);
  // Tracks the last bush state so the transition gets an immediate update.
  const bushState = useRef(false);
  const root = useRef<THREE.Group>(null);
  const bob = useRef<THREE.Group>(null);
  // Duruş katsayısı (1 = hareketsiz savaş duruşu, 0 = hareket). Geçiş
  // yumuşatılır ki durup kalkarken gövde sıçramasın.
  const stanceK = useRef(1);
  // Kemikler gövde bileşeninde (GlbFighterBodyCore) döndürülür; buradaki rig
  // yalnızca o bileşenin ÖLÇTÜĞÜ alçalma miktarını taşır: dizler bükülünce
  // ayaklar havada kalmasın diye gövde tam o kadar indirilir.
  const stanceRig = useMemo(() => stanceDropRig(fighter), [fighter]);

  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  // Vuruş geri bildirimi: beyaz parlama + kıvılcım havuzu.
  const flashBase = useRef(new Map<THREE.Material, FlashBase>());
  const flashSeen = useRef(-9999);
  const flashStart = useRef(0);
  const flashOn = useRef(false);
  const sparkRefs = useRef<(THREE.Mesh | null)[]>([]);
  const sparkSeen = useRef(-9999);
  const sparkStart = useRef(0);
  // Vuruş anında vurulan karakterin göğsünde patlayan kısa beyaz çekirdek
  // (Hit Particle System'in "parlama" katmanı; bloom'u da besler).
  const sparkFlash = useRef<THREE.Sprite>(null);
  const sparkFlashTex = useMemo(makeGlowTexture, []);
  // Şampiyon aurası: gövdenin çevresinde kendi renginde nefes alan hâle (tek
  // sprite; kare maliyeti bir opaklık güncellemesi).
  const aura = useRef<THREE.Sprite>(null);
  // Kıvılcım başına bir kez tohumlanan yön/hız/ölçü (yukarıdaki blokta yazılır).
  const sparkData = useRef(
    Array.from({ length: HIT_SPARKS }, () => ({
      a: 0,
      s: 1,
      u: 1,
      sz: 0.05,
      c: "#ffe066",
    })),
  );
  const hpFill = useRef<THREE.Sprite>(null);
  const barGroup = useRef<THREE.Group>(null);
  const hpFillTex = useMemo(makeBarTex, []);
  const nameTex = useMemo(makeNameTex, []);
  const nameTagDrawn = useRef(false);
  // animated display values — lerp toward the real hp every frame
  const dispHp = useRef(-1);
  const ghostHp = useRef(-1);
  const lastBarKey = useRef("");
  // spinning "this is you" ring under the player's feet
  const ringSpin = useRef<THREE.Group>(null);
  const ringDisc = useRef<THREE.Mesh>(null);
  // electric strikes — lightning bolt sprites + expanding shockwave
  const boltTex = useMemo(makeBoltTexture, []);
  const boltPool = useRef<(THREE.Sprite | null)[]>([null, null, null]);
  const shockRing = useRef<THREE.Mesh>(null);
  const shockMat = useRef<THREE.MeshBasicMaterial>(null);
  const strike = useRef({
    active: false,
    start: 0,
    dur: 180,
    next: performance.now() + 900,
    n: 2,
    angles: [0, 0, 0],
    scales: [1, 1, 1],
    radii: [0.55, 0.7, 0.85],
  });
  const c = fighter.current.config;

  // Arena camera: the PLAYER rig owns the aspect-aware follow framing. This
  // rig is mounted after <FollowCamera>, so this useFrame runs later in the
  // same frame and its framing is the one that renders (ArenaCamera.tsx).
  useArenaCamera(isPlayer ? fighter : null);

  useFrame((_, dt) => {
    const f = fighter.current;
    if (!root.current) return;
    // ── bush stealth: hide from the enemy / render the body faded ──
    // The owner sees their own fighter ghosted (45%) while in a bush; the
    // enemy fighter is invisible while it hides and returns to full opacity
    // when revealed (attacked / took damage) or while sharing the same bush.
    const inBushF = isInBush(f.x, f.y);
    // Bush stealth visuals (Brawl-style):
    //   0 = fully opaque body,
    //   1 = ghost/faded (in a bush and not revealed),
    //   2 = completely invisible to the observer (hidden enemy).
    // A fighter is "revealed" for BUSH_REVEAL_MS after attacking, using an
    // ability or taking damage, so it temporarily returns to full opacity.
    let vis: 0 | 1 | 2;
    if (!inBushF) {
      vis = 0;
    } else if (isPlayer) {
      // Your own body: ghost while hidden, full for 1.2s while revealed so
      // you feel the bush "give you away" when you act.
      vis = isRevealed(f) ? 0 : 1;
    } else {
      // Enemy body: invisible while hidden from you, ghost in a shared bush,
      // full while revealed (attacked / took damage).
      vis = isHiddenFrom(f, other.current) ? 2 : isRevealed(f) ? 0 : 1;
    }
    const wantHidden = vis === 2;
    if (root.current.visible === wantHidden) root.current.visible = !wantHidden;
    if (barGroup.current && barGroup.current.visible === wantHidden)
      barGroup.current.visible = !wantHidden;
    const shouldApplyBushState = inBushF !== bushState.current;
    // This is the same state that drives the "GİZLENDİN" control below:
    // update the character and every attached equipment child immediately on
    // entry/exit, then keep enforcing it while inside for late GLB children.
    if (shouldApplyBushState || inBushF) {
      bushState.current = inBushF;
      if (bodyWrap.current) {
        applyBushTransparency(bodyWrap.current, inBushF);
      }
    }
    // The root visibility rule still hides an enemy from the observer; the
    // material rule above deliberately remains authoritative for both rigs.
    // paint the name tag once per fight — name/level/emoji never change
    if (!nameTagDrawn.current) {
      nameTagDrawn.current = true;
      drawNameSprite(nameTex, {
        name: f.name,
        emoji: f.ability.emoji,
        isPlayer,
      });
    }
    root.current.position.set(f.x / S, 0, f.y / S);
    // ── 4-direction facing ──
    // The royal warrior GLB's authored forward axis is opposite to the
    // procedural body's axis. Keep the shared movement coordinates intact,
    // but apply the model-specific half-turn so it walks toward its travel
    // direction instead of showing its back.
    const isRoyalWarrior = fighter.current.equipped.some(
      (item) => item === "skin-savasci-glb",
    );
    const modelTurn = isRoyalWarrior ? Math.PI : 0;
    // Ulti sırasında gövde hedefe döner: sim, facing/vy'yi rakibe göre
    // ayarlar. (Hareketsizken yaw modelTurn'a kilitli olduğu için kılıç
    // hedeften bağımsız bir yöne savruluyordu.)
    const ulting = f.samuraiUltT > 0;
    // 🎯 ATIŞ/YETENEK YÖNÜ: kilit aktifken gövde hedefe döner — hem hareket
    // ederken hem dururken, hem de ulti sırasında (kilit tam açıyı taşır;
    // facing/vy 4 yöne yuvarlandığı için çapraz hedef ıskalanıyordu).
    const aimYaw = f.aimYaw;
    const aimLocked = (f.aimYawT ?? 0) > 0 && typeof aimYaw === "number";
    // Kilitli değilken gövdenin döndüğü yön (modelTurn hariç, arena açısı):
    // yürürken hareket yönü, dururken KALICI bakış yönü (restYaw). Böylece
    // yetenek/ulti sonrası karakter eski pozisyonuna dönmez, ateş ettiği (ve
    // yürüdüğü) son yönde kalır.
    const moveYaw =
      (f.vy ?? 0) !== 0
        ? f.vy < 0
          ? Math.PI
          : 0
        : f.facing >= 0
          ? Math.PI / 2
          : -Math.PI / 2;
    let dirYaw: number;
    if (aimLocked) dirYaw = aimYaw as number;
    else if (f.moving) dirYaw = moveYaw;
    else dirYaw = f.restYaw ?? DEFAULT_REST_YAW;
    // Kalıcı bakış: atış/yetenek anında nişan açısı, yürürken hareket yönü.
    if (aimLocked) f.restYaw = aimYaw as number;
    else if (f.moving) f.restYaw = moveYaw;
    const targetYaw = dirYaw + modelTurn;
    // Maçın İLK karesi: gövde varsayılan bakış yönünde doğar (kameraya dönük
    // doğup sonra 180° dönme görüntüsü oluşmasın).
    if (f.restYaw === undefined) {
      f.restYaw = dirYaw;
      root.current.rotation.y = targetYaw;
    }
    let yawDiff = targetYaw - root.current.rotation.y;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    // Keskin dönüş (rotateTowards): üstel yumuşatma yerine sabit açısal hız.
    // Üstel yaklaşımda karakter yön değiştirirken geniş bir kavis çizip
    // sürükleniyordu; şimdi sınırlı adımla tek karede hedefe oturuyor
    // (16 rad/sn ≈ 917°/sn → 180° dönüş ~0.2 sn). Atış kilidinde dönüş daha
    // da hızlıdır: mermi çıkarken gövde çoktan hedefe bakıyor olmalı.
    const maxTurn = (ulting || aimLocked ? 26 : 16) * dt;
    root.current.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, yawDiff));
    // Baş-üstü HUD (isim + can barı) gövde kazancı kadar yukarı kayar:
    // gövde büyürken bar kafaya gömülmez, hep hemen üstünde kalır.
    if (barGroup.current)
      barGroup.current.position.set(f.x / S, HEAD_UI_LIFT, f.y / S);
    // ── Şampiyon aurası: yavaş bir nabız (nefes) — tamamen görsel. ──
    if (aura.current) {
      const pulse = 0.72 + 0.28 * Math.sin(performance.now() / 620);
      const base = isPlayer ? AURA_OPACITY_PLAYER : AURA_OPACITY_ENEMY;
      (aura.current.material as THREE.SpriteMaterial).opacity = base * pulse;
    }
    // spinning identity ring under the player's feet — dashed ring + orbit
    // dot turning around them, with a soft pulsing glow disc
    if (isPlayer && ringSpin.current) {
      ringSpin.current.position.set(f.x / S, 0.035, f.y / S);
      ringSpin.current.rotation.y += dt * 1.7;
      ringSpin.current.scale.setScalar(
        1 + 0.05 * Math.sin(performance.now() / 240),
      );
      if (ringDisc.current) {
        (ringDisc.current.material as THREE.MeshBasicMaterial).opacity =
          0.15 + 0.07 * Math.sin(performance.now() / 320);
      }
      // --- random electric strikes: jagged lightning + expanding shockwave ---
      const st = strike.current;
      const nowMs = performance.now();
      if (!st.active && nowMs >= st.next) {
        st.active = true;
        st.start = nowMs;
        st.dur = 150 + Math.random() * 130;
        st.n = 2 + (Math.random() < 0.45 ? 1 : 0);
        for (let i = 0; i < 3; i++) {
          st.angles[i] = Math.random() * Math.PI * 2;
          st.scales[i] = 0.8 + Math.random() * 0.7;
          st.radii[i] = 0.35 + Math.random() * 0.7;
        }
        st.next = nowMs + 450 + Math.random() * 900;
        if (shockRing.current) {
          shockRing.current.visible = true;
          shockRing.current.scale.setScalar(0.4);
        }
      }
      if (st.active) {
        const p = Math.min(1, (nowMs - st.start) / st.dur);
        const fade = Math.pow(1 - p, 1.3);
        const flick = 0.6 + 0.4 * Math.sin(nowMs / 26);
        for (let i = 0; i < 3; i++) {
          const sp = boltPool.current[i];
          if (!sp) continue;
          if (i < st.n) {
            sp.visible = true;
            sp.position.set(
              (f.x + Math.cos(st.angles[i]) * st.radii[i]) / S,
              0.85 * st.scales[i],
              (f.y + Math.sin(st.angles[i]) * st.radii[i]) / S,
            );
            sp.rotation.z = st.angles[i] * 2.3 + nowMs * 0.0004;
            sp.scale.set(
              0.62 * st.scales[i],
              (1.6 + 0.25 * Math.sin(nowMs / 29)) * st.scales[i],
              1,
            );
            (sp.material as THREE.SpriteMaterial).opacity = Math.min(
              1,
              fade * flick * 1.1,
            );
          } else {
            sp.visible = false;
          }
        }
        if (shockRing.current && shockMat.current) {
          shockRing.current.position.set(f.x / S, 0.04, f.y / S);
          shockRing.current.scale.setScalar(0.4 + p * 1.1);
          shockMat.current.opacity = (1 - p) * 0.45;
        }
        if (ringDisc.current) {
          (ringDisc.current.material as THREE.MeshBasicMaterial).opacity =
            0.15 + 0.07 * Math.sin(nowMs / 320) + 0.45 * (1 - p);
        }
        if (p >= 1) {
          st.active = false;
          for (let i = 0; i < 3; i++) {
            const sp = boltPool.current[i];
            if (sp) sp.visible = false;
          }
          if (shockRing.current) shockRing.current.visible = false;
        }
      }
    }
    const amp = f.moving ? 1 : 0;
    const t = f.phase;
    if (armL.current) armL.current.rotation.x = Math.sin(t) * 0.75 * amp;
    if (armR.current)
      armR.current.rotation.x = Math.sin(t + Math.PI) * 0.75 * amp;
    if (legL.current)
      legL.current.rotation.x = Math.sin(t + Math.PI) * 0.6 * amp;
    if (legR.current) legR.current.rotation.x = Math.sin(t) * 0.6 * amp;
    if (bob.current) {
      // walk bob while moving, gentle breathing while idle
      bob.current.position.y =
        amp > 0
          ? Math.abs(Math.sin(t)) * 0.09
          : Math.sin(performance.now() / 420) * 0.018;
    }
    // ── SAVAŞ DURUŞU (battle stance) ──────────────────────────────────
    // Duran karakter dimdik değil, savaşa hazır durur: hafif öne eğik,
    // dizleri bükülmüş gibi alçalmış ve ağırlığı bir ayaktan diğerine
    // akan. Hareket/yetenek anında katsayı 0'a çekilir (yürüyüş animasyonu
    // devralır), durunca yumuşakça geri gelir.
    // Ulti (Kraliyet yere vuruş pozu) kemikleri kendisi sürdüğü için duruş
    // katmanı o sırada kapanır.
    const stanceTarget = f.moving || f.samuraiUltT > 0 ? 0 : 1;
    stanceK.current += (stanceTarget - stanceK.current) * Math.min(1, dt * 6);
    if (bodyWrap.current) {
      const k = stanceK.current;
      const stanceT = performance.now();
      const slow = Math.sin(stanceT / 1400);
      bodyWrap.current.rotation.x = STANCE_LEAN * k;
      bodyWrap.current.rotation.z = STANCE_SWAY * k * slow;
      bodyWrap.current.rotation.y = STANCE_YAW * k * Math.sin(stanceT / 900);
      bodyWrap.current.scale.set(1, 1 - STANCE_CROUCH * k, 1);
      bodyWrap.current.position.x = STANCE_SHIFT * k * slow;
      // Kemik katmanı: diz bükme + gövde öne + kollar hazır. Ölçülen `drop`
      // kadar gövde indirilir → çömelme görünür ama ayaklar yerden kesilmez.
      bodyWrap.current.position.y = -applyBattleStance(stanceRig, k);
    }
    // ── White flash: düşman hasar aldığı an model kaplaması 0.1s beyaza
    // döner, sonra orijinal kaplamasına geri döner (emissive overlay). ──
    const now = performance.now();
    if (f.lastHitAt !== flashSeen.current) {
      flashSeen.current = f.lastHitAt;
      flashStart.current = now;
      if (!flashOn.current && bodyWrap.current) {
        snapshotFlash(bodyWrap.current, flashBase.current);
        flashOn.current = true;
      }
    }
    if (flashOn.current && bodyWrap.current) {
      const k = 1 - (now - flashStart.current) / HIT_FLASH_MS;
      if (k > 0) {
        applyFlash(bodyWrap.current, flashBase.current, k);
      } else {
        applyFlash(bodyWrap.current, flashBase.current, 0);
        flashOn.current = false;
      }
    }
    // ── HIT PARTICLE SYSTEM ───────────────────────────────────────────────
    // Vuruş anında vurulan karakterin gövdesinde üç katman patlar:
    //   1) yönlü kıvılcım yelpazesi (kıymıklar vuruşun geldiği yöne daha hızlı),
    //   2) kısa beyaz çekirdek flaşı (bloom beslemesi),
    //   3) yerçekimli dağılma + sönüm.
    // Yön, vuran karakterin konumundan okunur; kıvılcımlar gövde-lokal uzayda
    // üretildiği için karakter dönerken de doğru taraftan fışkırır.
    if (f.lastHitAt !== sparkSeen.current) {
      sparkSeen.current = f.lastHitAt;
      sparkStart.current = now;
      // Vuruşun geldiği yön (vurandan bana) → gövde-lokal açıya çevrilir.
      const o = other.current;
      const hitLocal =
        Math.atan2(f.y - o.y, f.x - o.x) + root.current.rotation.y;
      for (let i = 0; i < HIT_SPARKS; i++) {
        const d = sparkData.current[i];
        d.a = (i / HIT_SPARKS) * Math.PI * 2 + Math.random() * 1.1;
        // Yönlü yelpaze: vuruş eksenine bakan kıvılcımlar daha hızlı/uzağa gider.
        const bias = 0.6 + 0.65 * Math.max(0, Math.cos(d.a - hitLocal));
        d.s = (1.0 + Math.random() * 1.7) * bias;
        d.u = 1.1 + Math.random() * 1.7;
        d.sz = 0.03 + Math.random() * 0.035;
        // Soğuk alev teması: vuruş kıvılcımları da buzlu beyaz / eflatun.
        d.c = i % 2 === 0 ? "#e0f2fe" : "#a78bfa";
      }
    }
    const se = (now - sparkStart.current) / 1000;
    const sparksAlive = se < SPARK_LIFE;
    for (let i = 0; i < HIT_SPARKS; i++) {
      const m = sparkRefs.current[i];
      if (!m) continue;
      if (!sparksAlive) {
        if (m.visible) m.visible = false;
        continue;
      }
      const d = sparkData.current[i];
      const k = 1 - se / SPARK_LIFE;
      m.visible = true;
      m.position.set(
        Math.cos(d.a) * d.s * se,
        Math.max(-0.2, d.u * se - 4.5 * se * se),
        Math.sin(d.a) * d.s * se,
      );
      // Kıymık: uçuş yönünde uzayan ince kor (küre yerine parçacık silueti).
      const g0 = d.sz * (0.45 + k);
      m.rotation.y = Math.PI / 2 - d.a;
      m.scale.set(g0 * 0.5, g0 * 0.5, g0 * 2.3);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = k;
      mat.color.set(d.c);
    }
    // Çekirdek flaşı: vuruş anında göğüste doğar, ~0.05 sn'de beyaza doyar ve
    // kıvılcımlarla birlikte söner.
    const fl = sparkFlash.current;
    if (fl) {
      if (!sparksAlive) {
        fl.visible = false;
      } else {
        // pop: neredeyse anında doyar, sonra kıvılcımlarla birlikte söner.
        const pop = Math.min(1, se / 0.05);
        const fade = 1 - se / SPARK_LIFE;
        fl.visible = true;
        fl.scale.setScalar(0.55 + 0.75 * (1 - fade));
        (fl.material as THREE.SpriteMaterial).opacity = pop * fade * 0.85;
      }
    }
    // ── Sarsılma (hit-stun): vuruş anında gövde geriye yatar, titrer ve
    // bir an küçülüp doğrulur. Ulti/mermi, kim vurursa vursun burada
    // okunur — böylece vurulan karakter "hiç etkilenmemiş" gibi durmaz. ──
    const stunK =
      f.hitStunT > 0 ? Math.min(1, f.hitStunT / HIT_STUN_MAX) * f.hitStunK : 0;
    // Vuruş animasyonu eğrisi (cancel edilmişse 0 → gövde anında dinlenir).
    const punch = attackPunch(f);
    const bw = bodyWrap.current;
    if (bw) {
      if (stunK > 0.002) {
        const tw = now * 0.001;
        const shake = 0.17 * stunK;
        bw.position.set(
          Math.sin(tw * 47) * shake,
          0,
          Math.cos(tw * 39) * shake * 0.7,
        );
        // Geriye savrulma: gövde vuruş yönünün tersine yatar.
        bw.rotation.x = -0.34 * stunK * (0.7 + 0.3 * Math.sin(tw * 33));
        bw.rotation.z = Math.sin(tw * 43) * 0.18 * stunK;
        bw.scale.setScalar(1 + 0.07 * stunK * Math.sin(tw * 31));
      } else if (punch > 0.002) {
        // ── Düz vuruş animasyonu: windup'ta öne atılma, bitişte toparlanma.
        // Cancel penceresinde hareket girdisi gelirse atkAnimT anında 0'lanır
        // ve gövde bir sonraki karede dinlenme duruşuna döner. ──
        bw.rotation.x = 0.24 * punch;
        bw.position.z = 0.12 * punch;
        bw.scale.setScalar(1 + 0.05 * punch);
      } else if (
        bw.position.x !== 0 ||
        bw.position.z !== 0 ||
        bw.rotation.x !== 0 ||
        bw.rotation.z !== 0 ||
        bw.scale.x !== 1
      ) {
        // Sarsılma bitti: modeli tam dinlenme duruşuna döndür.
        bw.position.set(0, 0, 0);
        bw.rotation.set(0, 0, 0);
        bw.scale.setScalar(1);
      }
    }
    // HP bar pops briefly white when the fighter is hit. Grup ölçeği ayrıca
    // HEAD_UI_SCALE taşır: can barı + isim etiketi karakterle birlikte
    // %15 küçülür (hem ölçek hem yükseklik aynı gruptan geldiği için bar hep
    // başın üstünde kalır).
    const justHit = performance.now() - f.lastHitAt < 260;
    if (barGroup.current) {
      barGroup.current.scale.setScalar((justHit ? 1.14 : 1) * HEAD_UI_SCALE);
    }
    // smooth animated health bar + white ghost that trails behind
    const max = f.maxHp;
    if (dispHp.current < 0) {
      dispHp.current = max;
      ghostHp.current = max;
    }
    dispHp.current += (f.hp - dispHp.current) * Math.min(1, dt * 6);
    if (ghostHp.current > dispHp.current + 0.5) {
      ghostHp.current +=
        (dispHp.current - ghostHp.current) * Math.min(1, dt * 1.8);
    } else {
      ghostHp.current = dispHp.current;
    }
    const key = `${Math.round(dispHp.current)}:${Math.round(ghostHp.current)}:${justHit}`;
    if (key !== lastBarKey.current) {
      lastBarKey.current = key;
      const pct = dispHp.current / max;
      const col = pct > 0.5 ? "#22c55e" : pct > 0.25 ? "#eab308" : "#ef4444";
      // Tek dokuda: koyu çerçeve + solda seviye rozeti + beyaz ghost iz +
      // renkli can dolgusu. Ghost, hasar yeni alındığında dolgunun gerisinden
      // gelir; iki ayrı sprite olmadığı için hizası asla kaymaz.
      drawBarSprite(
        hpFillTex,
        pct,
        ghostHp.current / max,
        justHit ? "#ffffff" : col,
        f.level,
        isPlayer,
      );
    }
  });

  // Procedural low-poly body — `./arena/ProceduralBody` modülüne taşındı;
  // GLB akışı hazır olana kadar gösterilir ve indirilemezse kalıcı yedektir.
  const proceduralBody = (
    <ProceduralBody
      c={c}
      bob={bob}
      legL={legL}
      legR={legR}
      armL={armL}
      armR={armR}
    />
  );

  return (
    <>
      <group ref={root} scale={RIG_ROOT_SCALE} userData={FIGHTER_RIG_MARK}>
        {/* rigged GLB character (same model as the street world); the
          procedural body renders while it loads and stays as fallback */}
        <group ref={bodyWrap}>
          <GlbModelBoundary fallback={proceduralBody}>
            <Suspense fallback={proceduralBody}>
              <GlbFighterBody fighter={fighter} />
            </Suspense>
          </GlbModelBoundary>
        </group>
        {/* Şampiyon aurası: gövdenin çevresinde kendi renginde nefes alan
          yumuşak hâle. Karakter uzaktan da "şampiyon" gibi okunur ve bloom'u
          besler; opaklığı aşağıdaki kare döngüsünde nabız gibi inip çıkar. */}
        <sprite
          ref={aura}
          position={[0, CHEST_Y * 0.82, 0]}
          scale={[AURA_SIZE, AURA_SIZE, 1]}
          renderOrder={2}
        >
          <spriteMaterial
            map={sparkFlashTex}
            color={c.shirt}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
        {/* Takım rengi halkası: dövüşçünün (oyuncunun seçtiği) karakter rengi
          ayakların altında okunur — hem yakından hem uzaktan kim hangi
          renkte olduğu belli olur. Yarıçap gövde kazancıyla ölçeklenir, yoksa
          büyüyen karakter halkanın dışına taşar. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry
            args={[0.42 * BODY_SCALE_GAIN, 0.56 * BODY_SCALE_GAIN, 32]}
          />
          <meshBasicMaterial
            color={c.shirt}
            transparent
            opacity={0.6}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
        {/* Hit Particle System — vuruş anında göğüsten dışa saçılan kor
          kıymıkları + kısa beyaz çekirdek flaşı. Yönlü yelpaze ve yerçekimi
          yukarıdaki tek kare döngüsünde hesaplanır. Yükseklik gövde kazancıyla
          ölçeklenir: kıvılcımlar büyüyen gövdenin karın boşluğundan değil
          göğsünden çıkar. */}
        <group position={[0, CHEST_Y, 0]}>
          {Array.from({ length: HIT_SPARKS }).map((_, i) => (
            <mesh
              key={`sp${i}`}
              ref={(el) => {
                sparkRefs.current[i] = el;
              }}
              visible={false}
              raycast={() => null}
            >
              {/* elmas kıymık: uçuş yönünde uzatılınca ince bir kor çizgisi */}
              <octahedronGeometry args={[1, 0]} />
              <meshBasicMaterial
                color="#e0f2fe"
                transparent
                opacity={0}
                depthWrite={false}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          ))}
          {/* çekirdek flaşı: darbe anında bir an patlayan yumuşak parlama */}
          <sprite
            ref={sparkFlash}
            visible={false}
            scale={[0.55, 0.55, 1]}
            renderOrder={4}
          >
            <spriteMaterial
              map={sparkFlashTex}
              color="#ffffff"
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </sprite>
        </group>
        {/* Kılıç izi (ribbon trail): düz vuruş, yetenek atışı ve ulti
            salınımında bıçağın arkasında parlayan akıcı yay. */}
        <SlashTrail fighter={fighter} swingTime={ATK_ANIM} />
      </group>
      {/* Skillshot nişan göstergesi: zeminde menzil çemberi + yön oku.
          Yalnızca oyuncunun rig'inde çizilir (düşmanın menzili görünmez). */}
      {isPlayer && <SkillshotIndicator fighter={fighter} other={other} />}
      {/* QA: test botu ve teşhis taraması — oyun mantığına hiç dokunmaz. */}
      {isPlayer && <QaScene player={fighter} />}
      {/* spinning "this is you" ring under the player's feet */}
      {isPlayer && (
        <>
          <group ref={ringSpin} position={[0, 0.035, 0]}>
            {/* soft sky glow disc on the grass */}
            <mesh
              ref={ringDisc}
              rotation={[-Math.PI / 2, 0, 0]}
              raycast={() => null}
            >
              <circleGeometry args={[0.52 * HUD, 40]} />
              <meshBasicMaterial
                color="#38bdf8"
                transparent
                opacity={0.18}
                blending={THREE.AdditiveBlending}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            {/* four dashed arcs spinning around the character */}
            {[0, 1, 2, 3].map((i) => (
              <mesh
                key={i}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0.012, 0]}
                raycast={() => null}
              >
                <ringGeometry
                  args={[0.44 * HUD, 0.52 * HUD, 8, 1, (i * Math.PI) / 2, 1.35]}
                />
                <meshBasicMaterial
                  color="#7dd3fc"
                  transparent
                  opacity={0.95}
                  blending={THREE.AdditiveBlending}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
            ))}
            {/* bright orbiting dot — makes the spin direction obvious */}
            <mesh position={[0.52 * HUD, 0.02 * HUD, 0]} raycast={() => null}>
              <sphereGeometry args={[0.055 * HUD, 12, 12]} />
              <meshBasicMaterial
                color="#e0f2fe"
                transparent
                opacity={1}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          </group>
          {/* electric strikes — lightning bolt sprites around the ring */}
          {[0, 1, 2].map((i) => (
            <sprite
              key={i}
              ref={(el) => {
                boltPool.current[i] = el;
              }}
              position={[0, 0.85, 0]}
              scale={[0.6 * HUD, 1.8 * HUD, 1]}
              renderOrder={3}
            >
              <spriteMaterial
                map={boltTex}
                transparent
                opacity={0}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          ))}
          {/* expanding shockwave ring on each strike */}
          <mesh
            ref={shockRing}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.04, 0]}
            visible={false}
            raycast={() => null}
          >
            <ringGeometry args={[0.5 * HUD, 0.57 * HUD, 40]} />
            <meshBasicMaterial
              ref={shockMat}
              color="#a5f3fc"
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </>
      )}{" "}
      {/* world-space head UI — SABİT BOYUTLU can barı (solda seviye rozeti)
          ve isim etiketi; ikisi de başın üzerinde süzülür ve dövüşçüyü
          takip eder, mesafeyle küçülmez (sprite). */}
      <group ref={barGroup}>
        {/* isim etiketi (emoji + isim) — can barının üstünde */}
        <sprite
          position={[0, 1.05, 0]}
          scale={[0.6 * HUD, 0.1125 * HUD, 1]}
          renderOrder={0}
        >
          <spriteMaterial map={nameTex} transparent depthTest={false} />
        </sprite>
        {/* SABİT BOYUTLU can barı: koyu çerçeve + SOLDA seviye rozeti +
            beyaz ghost iz + renkli dolgu — hepsi tek dokuda (320×64, 5:1). */}
        <sprite
          ref={hpFill}
          position={[0, 0.86, 0]}
          scale={[0.5 * HUD, 0.1 * HUD, 1]}
          renderOrder={1}
        >
          <spriteMaterial map={hpFillTex} depthTest={false} />
        </sprite>
      </group>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Projectiles — `./arena/ProjectilePool` modülüne taşındı: normal mermi   */
/* havuzu + Ateş Topu'nun animasyonlu soğuk alev küresi.               */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Effects — damage numbers (canvas sprites), expanding rings, bursts  */
/* and the light-beam attack.                                          */
/* ------------------------------------------------------------------ */

/** Hasar sayısının doğduğu yükseklik ve yukarı süzülme mesafesi (dünya birimi).
 *  Karakter %15 küçültüldüğü için taban ve süzülme de aynı oranda indi, yani
 *  sayı hâlâ can barının hemen üstünde doğuyor. */
const TEXT_BASE_Y = 0.95;
const TEXT_RISE_Y = 1.05;

/**
 * Uçan hasar/iade sayısını çizer — stüdyo tipografisi:
 * ekstra kalın (900) gövde, siyah kalın dış kontur ve ince parlak iç çeper.
 * Kontur iki geçişte basılır: geniş yumuşak çeper + keskin siyah kenar; böylece
 * sayı çim, lav ya da taş ne olursa olsun her zeminde okunur.
 */
function drawTextSprite(sprite: THREE.Sprite, text: string, color: string) {
  const mat = sprite.material as THREE.SpriteMaterial;
  const tex = mat.map as THREE.CanvasTexture;
  const canvas = tex.image as HTMLCanvasElement;
  canvas.width = 256;
  canvas.height = 96;
  const g = canvas.getContext("2d");
  if (!g) return;
  g.clearRect(0, 0, 256, 96);
  g.font =
    "900 58px 'Baloo 2', 'Segoe UI', system-ui, -apple-system, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round"; // köşeler tırtıklı olmasın (menzil diskiyle aynı dil)
  g.lineCap = "round";
  g.lineWidth = 17;
  g.strokeStyle = "rgba(6,9,20,0.75)";
  g.strokeText(text, 128, 48);
  g.lineWidth = 10;
  g.strokeStyle = "#05070f";
  g.strokeText(text, 128, 48);
  g.fillStyle = color;
  g.fillText(text, 128, 48);
  // İnce beyaz iç çeper: gövdeye hacim ve parlama katar (bloom'u da besler).
  g.lineWidth = 2.6;
  g.strokeStyle = "rgba(255,255,255,0.5)";
  g.strokeText(text, 128, 48);
  tex.needsUpdate = true;
}

function FxPool({ fxsRef }: { fxsRef: MutableRefObject<BattleFx[]> }) {
  // FX havuzu (metin, halka, patlama, ışın, duman, yarık).
  const textRefs = useRef<(THREE.Sprite | null)[]>([]);
  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);
  const burstRefs = useRef<(THREE.Mesh | null)[]>([]);
  const beamRefs = useRef<(THREE.Mesh | null)[]>([]);
  const smokeRefs = useRef<(THREE.Sprite | null)[]>([]);
  // Yerdeki 3D yarıklar (kendi nesneleri; sahne köküne eklenir).
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const groundRef = useRef<THREE.Object3D[] | null>(null);
  const cracks = useMemo(
    () => Array.from({ length: CRACK_POOL }, () => buildGroundCrack()),
    [],
  );
  useEffect(() => {
    for (const crack of cracks) {
      scene.add(crack.group);
      // Işık sahne kökünde tutulur: grup gizlense bile ışık sayısı sabit
      // kalır, böylece ultide materyal yeniden derlemesi (takılma) olmaz.
      scene.add(crack.light);
    }
    return () => {
      for (const crack of cracks) {
        crack.group.removeFromParent();
        crack.light.removeFromParent();
      }
    };
  }, [cracks, scene]);
  // Canvas textures for the floating damage numbers — created once.
  const textTextures = useMemo(
    () =>
      Array.from({ length: TEXT_POOL }).map(
        () => new THREE.CanvasTexture(document.createElement("canvas")),
      ),
    [],
  );
  // Soft procedural smoke puff texture (radial gradient) — no external files.
  const smokeTexture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(32, 32, 3, 32, 32, 30);
      grad.addColorStop(0, "rgba(255,255,255,0.9)");
      grad.addColorStop(0.55, "rgba(240,240,240,0.5)");
      grad.addColorStop(1, "rgba(210,210,210,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame(() => {
    const fxs = fxsRef.current;
    let ti = 0;
    let ri = 0;
    let bi = 0;
    let mi = 0;
    let si = 0;
    let xi = 0;

    for (const fx of fxs) {
      if (fx.ttl <= 0) continue;
      const t = fx.ttl / fx.maxTtl;

      if (fx.kind === "text") {
        const s = textRefs.current[ti];
        if (s) {
          const key = `${fx.text}|${fx.color}`;
          if (s.userData.key !== key) {
            drawTextSprite(s, fx.text, fx.color);
            s.userData.key = key;
          }
          s.visible = true;
          // Scale Pop + Fade-out: "yaş" 0→1 ilerler.
          //   1) 0-14%: hızlı büyüme (pop) — vuruşun şiddeti sayıdan okunur
          //   2) 14-38%: büyüklük oturur (overshoot geri çekilir)
          //   3) 38-100%: hafifçe büyüyerek yukarı süzülürken söner
          const age = 1 - t;
          let sc: number;
          if (age < 0.14)
            sc = 0.6 + (age / 0.14) * 0.62; // 0.60 → 1.22
          else if (age < 0.38)
            sc = 1.22 - ((age - 0.14) / 0.24) * 0.2; // → 1.02
          else sc = 1.02 + (age - 0.38) * 0.1;
          // Süzülme ease-out: sayı ani zıplamaz, yükselirken yavaşlar.
          const rise = 1 - (1 - age) * (1 - age);
          s.position.set(fx.x / S, TEXT_BASE_Y + rise * TEXT_RISE_Y, fx.y / S);
          s.scale.set(1.3 * HUD * sc, 0.49 * HUD * sc, 1);
          // Önce çok hızlı belirir, son ömürde yumuşakça söner.
          (s.material as THREE.SpriteMaterial).opacity =
            Math.min(1, age * 12) * Math.min(1, t * 1.8);
        }
        ti++;
      } else if (fx.kind === "ring") {
        const m = ringRefs.current[ri];
        if (m) {
          m.visible = true;
          m.position.set(fx.x / S, 0.08, fx.y / S);
          const scale = Math.max(0.12 * HUD, ((fx.grow / S) * (1 - t)) / 1);
          m.scale.setScalar(scale);
          (m.material as THREE.MeshBasicMaterial).opacity = t * 0.9;
        }
        ri++;
      } else if (fx.kind === "burst") {
        const m = burstRefs.current[bi];
        if (m) {
          m.visible = true;
          m.position.set(fx.x / S, 0.55, fx.y / S);
          const scale = Math.max(0.2 * HUD, ((fx.grow / S) * (1 - t)) / 1);
          m.scale.setScalar(scale);
          (m.material as THREE.MeshBasicMaterial).opacity = t * 0.85;
        }
        bi++;
      } else if (fx.kind === "beam") {
        // beam — stretched glowing box between the two points
        const m = beamRefs.current[mi];
        if (m) {
          m.visible = true;
          const dx = (fx.x2 - fx.x1) / S;
          const dz = (fx.y2 - fx.y1) / S;
          const len = Math.hypot(dx, dz) || 1;
          m.position.set(
            (fx.x1 + (fx.x2 - fx.x1) / 2) / S,
            0.9,
            (fx.y1 + (fx.y2 - fx.y1) / 2) / S,
          );
          m.scale.set(len, 1, 1);
          // Ry(θ) +X'i (cosθ, 0, −sinθ) yapar → yön eşlemesi atan2(−dz, dx).
          m.rotation.y = Math.atan2(-dz, dx);
          (m.material as THREE.MeshBasicMaterial).opacity = t * 0.95;
        }
        mi++;
      } else if (fx.kind === "samuraiCrack") {
        // Yerin gerçekten yarılması (3D): additive magma şeridi + yükselen
        // kor dilimleri + yerçekimli 3D taş parçaları + toz bulutu.
        const crack = cracks[xi];
        if (crack) {
          // Yeni yarık başlarken zemini BİR KEZ örnekle (yükseklik + normal):
          // çatlak zemine tam oturur, eğimlerde doğru açıyla uzanır.
          if (crack.lastFx !== fx) {
            if (!groundRef.current || groundRef.current.length === 0) {
              const list: THREE.Object3D[] = [];
              scene.traverse((o) => {
                const m = o as THREE.Mesh;
                if (m.isMesh && /terrain|ground|decal/i.test(m.name || "")) {
                  list.push(m);
                }
              });
              groundRef.current = list;
            }
            sampleGroundCrack(
              crack,
              fx,
              raycaster,
              groundRef.current,
              (fx.x1 + fx.x2) / 2 / S,
              (fx.y1 + fx.y2) / 2 / S,
            );
          }
          updateGroundCrack(crack, {
            x1: fx.x1 / S,
            y1: fx.y1 / S,
            x2: fx.x2 / S,
            y2: fx.y2 / S,
            t,
            pixelScale: (gl.domElement.height || 960) * 0.5,
          });
        }
        xi++;
      } else {
        // smoke — soft puffs that rise, spread and fade
        const s = smokeRefs.current[si];
        if (s) {
          s.visible = true;
          s.position.set(fx.x / S, 0.6 + (1 - t) * 2.4, fx.y / S);
          const sc = Math.max(0.5 * HUD, ((fx.grow / S) * (1 - t)) / 1 + 0.35);
          s.scale.setScalar(sc);
          (s.material as THREE.SpriteMaterial).opacity = t * 0.65;
          (s.material as THREE.SpriteMaterial).color.set(fx.color);
        }
        si++;
      }
    }

    for (let i = ti; i < TEXT_POOL; i++) {
      const s = textRefs.current[i];
      if (s) s.visible = false;
    }
    for (let i = ri; i < RING_POOL; i++) {
      const m = ringRefs.current[i];
      if (m) m.visible = false;
    }
    for (let i = bi; i < BURST_POOL; i++) {
      const m = burstRefs.current[i];
      if (m) m.visible = false;
    }
    for (let i = mi; i < BEAM_POOL; i++) {
      const m = beamRefs.current[i];
      if (m) m.visible = false;
    }
    for (let i = si; i < SMOKE_POOL; i++) {
      const s = smokeRefs.current[i];
      if (s) s.visible = false;
    }
    for (let i = xi; i < CRACK_POOL; i++) {
      cracks[i].group.visible = false;
      cracks[i].light.intensity = 0;
    }
  });

  return (
    <group>
      {Array.from({ length: TEXT_POOL }).map((_, i) => (
        <sprite
          key={`t${i}`}
          ref={(el) => {
            textRefs.current[i] = el;
          }}
          visible={false}
          scale={[1.7 * HUD, 0.64 * HUD, 1]}
        >
          <spriteMaterial
            map={textTextures[i]}
            transparent
            depthWrite={false}
          />
        </sprite>
      ))}
      {Array.from({ length: RING_POOL }).map((_, i) => (
        <mesh
          key={`r${i}`}
          ref={(el) => {
            ringRefs.current[i] = el;
          }}
          visible={false}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[1, 0.035, 8, 40]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
      {Array.from({ length: BURST_POOL }).map((_, i) => (
        <mesh
          key={`b${i}`}
          ref={(el) => {
            burstRefs.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[1, 14, 14]} />
          <meshBasicMaterial
            color="#fdba74"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
      {Array.from({ length: BEAM_POOL }).map((_, i) => (
        <mesh
          key={`m${i}`}
          ref={(el) => {
            beamRefs.current[i] = el;
          }}
          visible={false}
        >
          <boxGeometry args={[1, 0.16, 0.16]} />
          <meshBasicMaterial
            color="#ffe066"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
      {Array.from({ length: SMOKE_POOL }).map((_, i) => (
        <sprite
          key={`s${i}`}
          ref={(el) => {
            smokeRefs.current[i] = el;
          }}
          visible={false}
        >
          <spriteMaterial
            map={smokeTexture}
            color="#c9c9c9"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Camera tuned for the portrait battle viewport.                      */
/* ------------------------------------------------------------------ */

function FollowCamera({
  playerRef,
}: {
  playerRef: MutableRefObject<BattleFighter>;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const target = useRef(new THREE.Vector3(CX, 0.6, CZ));
  const smoothed = useRef(new THREE.Vector3(CX, 0.6, CZ));
  // Close follow camera: centers on the player so you can clearly see the
  // fight around them (a readable MOBA lane view), instead of pulling way
  // back to frame the entire map (which shrank the battlefield into an
  // "island" floating over its white underside).
  const el = 1.0; // ~57° elevation — MOBA-style overhead-lane angle
  const DIST = 12; // close follow distance (units from the player)
  // Keep the camera pointing inside the arena so we never look past the
  // map edge into the void around the island.
  const clamp = 3;

  useFrame((_, dt) => {
    const f = playerRef.current;
    // Follow the player, nudged a touch toward the enemy lane so you see
    // where you're heading, then clamp so the camera stays over the map.
    target.current.set(
      THREE.MathUtils.clamp(f.x / S, clamp, ARENA_W - clamp),
      0.6,
      THREE.MathUtils.clamp(
        f.y / S + (CZ - f.y / S) * 0.22,
        clamp,
        ARENA_D - clamp,
      ),
    );
    smoothed.current.lerp(target.current, Math.min(1, dt * 4));
    camera.position.set(
      smoothed.current.x,
      smoothed.current.y + Math.sin(el) * DIST,
      smoothed.current.z + Math.cos(el) * DIST,
    );
    camera.lookAt(smoothed.current);
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* MOBA-style battle atmosphere — visual-only, simulation independent. */
/* ------------------------------------------------------------------ */

function BattleAtmosphere({
  playerRef,
  botRef,
}: {
  playerRef: MutableRefObject<BattleFighter>;
  botRef: MutableRefObject<BattleFighter>;
}) {
  const aura = useRef<THREE.Group>(null);
  const auraDisc = useRef<THREE.Mesh>(null);
  const playerLight = useRef<THREE.PointLight>(null);
  const botLight = useRef<THREE.PointLight>(null);

  useFrame((_, dt) => {
    const player = playerRef.current;
    const bot = botRef.current;
    const now = performance.now();
    const pulse = 1 + Math.sin(now / 260) * 0.035;

    if (aura.current) {
      aura.current.position.set(player.x / S, 0.045, player.y / S);
      aura.current.rotation.y += dt * 0.32;
      aura.current.scale.setScalar(pulse);
    }
    if (auraDisc.current) {
      const material = auraDisc.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.035 + (Math.sin(now / 360) + 1) * 0.012;
    }
    if (playerLight.current) {
      playerLight.current.position.set(player.x / S, 2.4, player.y / S);
      playerLight.current.intensity = 1.2 + Math.sin(now / 300) * 0.18;
    }
    if (botLight.current) {
      botLight.current.position.set(bot.x / S, 2.2, bot.y / S);
      botLight.current.intensity = 0.9 + Math.sin(now / 340 + 1) * 0.14;
    }
  });

  return (
    <>
      {/* Large green tactical radius, like a MOBA skill/engagement zone. It
          is purely visual and never participates in movement or collision. */}
      <group ref={aura}>
        <mesh
          ref={auraDisc}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <circleGeometry args={[4.25, 96]} />
          <meshBasicMaterial
            color="#39f27d"
            transparent
            opacity={0.045}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        {[0, 1, 2, 3].map((index) => (
          <mesh
            key={index}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => null}
          >
            <ringGeometry
              args={[4.18, 4.24, 96, 1, (index * Math.PI) / 2, Math.PI / 2.35]}
            />
            <meshBasicMaterial
              color="#69ff9a"
              transparent
              opacity={0.82}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
        <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <ringGeometry args={[3.45, 3.48, 96]} />
          <meshBasicMaterial
            color="#a7f3d0"
            transparent
            opacity={0.2}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* Faction-colored local lights make the player/enemy sides read like a
          live team fight without changing any model or gameplay state. */}
      <pointLight
        ref={playerLight}
        color="#38d9ff"
        distance={7}
        decay={2}
        intensity={1.2}
      />
      <pointLight
        ref={botLight}
        color="#ff426f"
        distance={6}
        decay={2}
        intensity={0.9}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The whole 3D scene.                                                 */
/* ------------------------------------------------------------------ */

export function Arena3D({
  playerRef,
  botRef,
  projsRef,
  fxsRef,
  aimRef,
  onWorldClick,
}: {
  playerRef: MutableRefObject<BattleFighter>;
  botRef: MutableRefObject<BattleFighter>;
  projsRef: MutableRefObject<BattleProj[]>;
  fxsRef: MutableRefObject<BattleFx[]>;
  aimRef: MutableRefObject<{ active: boolean; dx: number; dy: number }>;
  onWorldClick: (x: number, y: number) => void;
}) {
  // Touch phones (coarse pointer) get lighter rendering: capped pixel
  // ratio + no real-time shadows, so the arena stays smooth on mobile.
  const coarse = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches,
    [],
  );
  return (
    <Canvas
      dpr={[1, coarse ? 1.5 : 2]}
      shadows={!coarse}
      camera={{ position: [CX, 7, CZ + 7], fov: 60, near: 0.5, far: 200 }}
      className="absolute inset-0"
    >
      <FollowCamera playerRef={playerRef} />
      {/* Atmosphere (background + fog) is managed by useArenaCamera in
          ArenaCamera.tsx - aspect-aware: portrait keeps the original sky,
          landscape gets a dark FogExp2 horizon that hides the void around
          the island. */}
      <ambientLight intensity={0.7} />
      <hemisphereLight args={["#ffffff", "#8a9aa8", 0.8]} />
      <directionalLight position={[12, 16, 8]} intensity={1.2} />

      {/* uploaded 5v5 battle-map environment (uniform scale, fitted) */}
      <BattleMapModel />

      {/* spawn pads: player starts on the Red base (top), bot on Blue */}
      {/* Spawn pads follow the new -90° map rotation: red base bottom-left
          (400,100) px, blue base top-right (1300,1000) px (/100). */}
      <SpawnCircle position={[4, 0.03, 1]} color="#e63946" />
      <SpawnCircle position={[13, 0.03, 10]} color="#3a86ff" />

      {/* fighters */}
      <FighterRig fighter={playerRef} other={botRef} isPlayer />
      <FighterRig fighter={botRef} other={playerRef} />

      <ProjectilePool projsRef={projsRef} />
      <FxPool fxsRef={fxsRef} />

      {/* invisible click plane — converts taps to game coordinates */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CX, 0.02, CZ]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onWorldClick(e.point.x * S, e.point.z * S);
        }}
      >
        <planeGeometry args={[ARENA_W + 1, ARENA_D + 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </Canvas>
  );
}
