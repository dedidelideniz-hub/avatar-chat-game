import * as THREE from "three";
import {
  aimBone,
  royalSlamForward,
  type RoyalSlamBody,
  type RoyalSlamRig,
} from "./RoyalSlam";

/* ── Kraliyet Savaşçısı — YAKIN DÖVÜŞ (melee) kılıç salınımı ────────── */
/* Skine bağlı ÜÇÜNCÜ yetenek: elindeki kraliyet kılıcıyla sol/sağ çapraz
 * kesişler ve rakip yakınsa üstüne atlayıp inen bitirici darbe.
 *
 * Kural (RoyalSlam ile aynı dil):
 *  · Kemik eksenleri TAHMİN EDİLMEZ; RoyalSlam'ın dinlenme pozundan ölçtüğü
 *    eksenler (`rig.axis`) ve `aimBone` dünya-uzayı hedeflemesi kullanılır.
 *  · Gövde ağırlığı (hamle / alçalma / kalça burulması) KEMİKLERDEN ÖNCE
 *    uygulanır — `computeMeleeBody` bu yüzden ayrı çağrılır.
 *  · Mixer'ın idle/walk klibi bozulmaz: katman her karede onun ÜSTÜNE biner,
 *    kalıcı state yazmaz.
 *
 * Zaman çizelgesi `progress` (0..1) üzerinden yürür; her aşama kendi içinde
 *  anticipation → strike → follow-through  ilkelerine göre kilitlenir.
 */

/* ───────────────────────── ölçek ve zamanlama ───────────────────── */

/** Toplam süre (sn) — iki çapraz kesiş (sol/sağ). */
export const MELEE_DUR = 0.6;
/** Rakip yakınsa süre uzar: üstüne atlama + bitirici iniş (3. vuruş). */
export const MELEE_LUNGE_DUR = 0.84;
/** Yeniden kullanma bekleme süresi (sn). */
export const MELEE_CD = 0.42;
/** Kesme menzili (px) — MAX_RANGE'in (200) içinde kısa yakın dövüş. */
export const MELEE_RANGE_PX = 155;
/** Rakip bu mesafe içindeyse üstüne atlanır (px). */
export const MELEE_LUNGE_RANGE_PX = 230;
/** Zaten dibindeyse atlama yapılmaz (px). */
export const MELEE_LEAP_MIN_PX = 58;
/** Atlama hızı (px/sn) — dövüşçü fiziğiyle (çarpışma kontrollü) sürülür.
 *  ~0.18 sn'lik pencerede ~160 px yol: menzil içindeki rakibin üstüne varır. */
export const MELEE_LEAP_SPEED = 900;
/** Atlama penceresi (genel ilerleme 0..1). Bitirici aşama 0.67'de başlar ve
 *  vuruşu 0.84'te iner; atlama tam o aralıkta yürür ki karakter darbeden hemen
 *  önce rakibin üstüne varmış olsun. */
export const MELEE_LEAP_FROM = 0.6;
export const MELEE_LEAP_TO = 0.82;
/** Vuruş hasarları. */
export const MELEE_DMG = 140;
export const MELEE_FINISH_DMG = 230;
/** Vuruşun aşama içindeki yeri (ilerleme oranı) — strike fazına denk gelir. */
export const MELEE_STRIKE_PHASE = 0.52;

/* ───────────────────── aşama / ilerleme yardımcıları ─────────────── */

/** Atlama varsa 3 (sol·sağ·bitirici), yoksa 2 vuruş (sol·sağ). */
export function meleeStageCount(leap: boolean): number {
  return leap ? 3 : 2;
}

/** Aşamanın genel ilerleme aralığı. */
export function meleeStageWindow(
  leap: boolean,
  stage: number,
): { start: number; end: number } {
  const n = meleeStageCount(leap);
  return { start: stage / n, end: (stage + 1) / n };
}

/** Genel ilerlemenin düştüğü aşama. */
export function meleeStageOf(leap: boolean, progress: number): number {
  const n = meleeStageCount(leap);
  const stage = Math.floor(progress * n);
  return Math.min(n - 1, Math.max(0, stage));
}

/** Bir vuruşun gerçekleştiği genel ilerleme (0..1). */
export function meleeStrikeProgress(leap: boolean, stage: number): number {
  const w = meleeStageWindow(leap, stage);
  return w.start + (w.end - w.start) * MELEE_STRIKE_PHASE;
}

/** Vuruşun yarım açısı (radyan): bitirici daha dar, çapraz kesişler geniş. */
export function meleeStrikeArc(stage: number): number {
  return stage >= 2 ? 0.9 : 1.15;
}

/** Vuruş hasarı. */
export function meleeStrikeDamage(stage: number): number {
  return stage >= 2 ? MELEE_FINISH_DMG : MELEE_DMG;
}

export function meleeDuration(leap: boolean): number {
  return leap ? MELEE_LUNGE_DUR : MELEE_DUR;
}

/* ───────────────────────────── gövde ağırlığı ───────────────────── */

/** Gövde hamlesi/alçalması (dünya birimi oranı — RoyalSlam ile aynı dil). */
const MELEE_LUNGE = 0.2;
const MELEE_DIP = 0.22;

interface MeleeKey {
  /** Kolun yatay açısı (derece): 0 = öne, + → karakterin SOLUNA. */
  h: number;
  /** Dikey bileşen (yukarı +). */
  lift: number;
  /** Omurga öne eğilmesi. */
  lean: number;
  /** Kalça/gövde burulması (yan, işaretli). */
  twist: number;
  /** Gövde hamlesi. */
  lunge: number;
  /** Gövde alçalması. */
  dip: number;
}

const K = (
  h: number,
  lift: number,
  lean = 0,
  twist = 0,
  lunge = 0,
  dip = 0,
): MeleeKey => ({ h, lift, lean, twist, lunge, dip });

/**
 * Aşama anahtar kareleri: [rest, anticipation, strike, follow-through].
 * Ardışık aşamaların "follow" u bir sonrakinin "rest"ine eşit seçildi —
 * combo boyunca kol geri sıfırlanmadan akıcı biçimde diğer yana geçer.
 */
const STAGE_KEYS: readonly (readonly MeleeKey[])[] = [
  // 0 — sağdan sola çapraz kesiş
  [
    K(-112, 0.4, -0.06, 0.34, -0.12, 0.02),
    K(-140, 0.62, -0.16, 0.52, -0.22, 0.05),
    K(74, -0.12, 0.34, -0.34, 0.32, -0.05),
    K(126, -0.3, 0.18, -0.44, 0.12, 0),
  ],
  // 1 — soldan sağa çapraz kesiş (ayna)
  [
    K(126, -0.3, 0.18, -0.44, 0.12, 0),
    K(148, 0.58, -0.12, -0.52, -0.18, 0.05),
    K(-74, -0.12, 0.34, 0.34, 0.32, -0.05),
    K(-130, -0.3, 0.18, 0.46, 0.12, 0),
  ],
  // 2 — bitirici: tepeden çapraz iniş (üstüne atlayıp kesme)
  [
    K(-130, -0.3, 0.18, 0.46, 0.12, 0),
    K(-48, 1.05, -0.32, 0.54, -0.32, 0.18),
    K(28, -0.88, 0.5, -0.32, 0.64, -0.22),
    K(42, -0.96, 0.32, -0.36, 0.24, -0.08),
  ],
];

/** Aşama içi faz sınırları (0..1). */
const PH_ANT = 0.3;
const PH_STRIKE = 0.52;
const PH_FOLLOW = 0.7;

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / Math.max(1e-6, b - a));
  return t * t * (3 - 2 * t);
};
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

interface MeleeBlend {
  stage: number;
  local: number;
  from: MeleeKey;
  to: MeleeKey;
  t: number;
  weight: number;
}

/** Genel ilerlemeyi (0..1) aktif aşama + ara değere çevirir. */
function meleeBlend(progress: number, leap: boolean): MeleeBlend {
  const u = clamp01(progress);
  const stage = meleeStageOf(leap, u);
  const w = meleeStageWindow(leap, stage);
  const local = clamp01((u - w.start) / Math.max(1e-6, w.end - w.start));
  const keys = STAGE_KEYS[stage] ?? STAGE_KEYS[0];
  // Katmanın giriş/çıkışında yumuşak açılıp kapanması (ani poz sıçraması yok).
  const weight = smoothstep(0, 0.06, u) * (1 - smoothstep(0.88, 1, u));
  if (local < PH_ANT) {
    return {
      stage,
      local,
      from: keys[0],
      to: keys[1],
      t: smoothstep(0, 1, local / PH_ANT),
      weight,
    };
  }
  if (local < PH_STRIKE) {
    // Strike: hızlı savurma, darbeye doğru yavaşlar (impact ease-out).
    return {
      stage,
      local,
      from: keys[1],
      to: keys[2],
      t: easeOut((local - PH_ANT) / (PH_STRIKE - PH_ANT)),
      weight,
    };
  }
  if (local < PH_FOLLOW) {
    return {
      stage,
      local,
      from: keys[2],
      to: keys[3],
      t: smoothstep(0, 1, (local - PH_STRIKE) / (PH_FOLLOW - PH_STRIKE)),
      weight,
    };
  }
  return { stage, local, from: keys[3], to: keys[3], t: 0, weight };
}

/**
 * Gövde ağırlığı (hamle / alçalma / kalça burulması). KEMİKLERDEN ÖNCE
 * uygulanmalıdır (bkz. dosya başı notu). Aktif değilse null.
 */
export function computeMeleeBody(
  progress: number,
  leap: boolean,
): RoyalSlamBody | null {
  const b = meleeBlend(progress, leap);
  if (b.weight <= 0.002) return null;
  const blend = (a: number, c: number) => a + (c - a) * b.t;
  return {
    lunge: blend(b.from.lunge, b.to.lunge) * MELEE_LUNGE,
    dip: blend(b.from.dip, b.to.dip) * MELEE_DIP,
    twist: blend(b.from.twist, b.to.twist),
  };
}

/* ──────────────────────────── kemik pozu ─────────────────────────── */

/** Karakterin SOL yönü (omuz çizgisinden — rig yaw/mirror'dan bağımsız). */
function meleeSide(rig: RoyalSlamRig, fwd: THREE.Vector3): THREE.Vector3 {
  const ls = rig.leftShoulder;
  const rs = rig.rightShoulder;
  if (ls && rs) {
    ls.updateWorldMatrix(true, false);
    rs.updateWorldMatrix(true, false);
    const s = ls
      .getWorldPosition(new THREE.Vector3())
      .sub(rs.getWorldPosition(new THREE.Vector3()));
    s.y = 0;
    if (s.lengthSq() > 1e-8) return s.normalize();
  }
  return new THREE.Vector3().crossVectors(UP, fwd).normalize();
}

export interface MeleePoseOptions {
  rig: RoyalSlamRig;
  /** Ölçülmüş bıçak ekseni (el-lokal). Yoksa bilek hedeflenmez. */
  bladeAxis: THREE.Vector3 | null;
  /** Genel ilerleme 0..1. */
  progress: number;
  /** Atlama (bitirici) var mı? */
  leap: boolean;
  facing: number;
  active: boolean;
}

/**
 * Sol/sağ çapraz kesiş + bitirici iniş pozunu uygular. Kemik hedefleri dünya
 * uzayındadır; gövde ağırlığı çağıran tarafından BUNDAN ÖNCE uygulanmalıdır.
 */
export function applyMeleePose(opts: MeleePoseOptions): void {
  const { rig, bladeAxis, progress, leap, facing, active } = opts;
  if (!active || !rig.rightUpper) return;
  const b = meleeBlend(progress, leap);
  if (b.weight <= 0.002) return;
  const weight = b.weight;
  const blend = (a: number, c: number) => a + (c - a) * b.t;

  const h = blend(b.from.h, b.to.h);
  const lift = blend(b.from.lift, b.to.lift);
  const lean = blend(b.from.lean, b.to.lean);
  const twist = blend(b.from.twist, b.to.twist);

  const fwd = royalSlamForward(rig, facing);
  const side = meleeSide(rig, fwd);
  const hRad = (h * Math.PI) / 180;

  // Kolun uzandığı yön: öne/sağa-sola yatay açı + dikey kaldırma.
  const armDir = fwd
    .clone()
    .multiplyScalar(Math.cos(hRad))
    .addScaledVector(side, Math.sin(hRad))
    .addScaledVector(UP, lift)
    .normalize();

  // Bıçak, koldan dışa uzanır ve kesişte aşağı doğru çalar. Bitirici inişte
  // çok daha dik (tepeden yere) — "yeri yaran" bitişi besler.
  const bladeDown = b.stage >= 2 ? 0.92 : 0.34;
  const bladeDir = armDir.clone().addScaledVector(DOWN, bladeDown).normalize();

  // 1) Gövde önce: omurga (öne eğilme + burulma) ve baş. Omurga dönünce
  //    kolların dünya yönü de değiştiği için kollar EN SON hedeflenir.
  aimBone(
    rig.spine,
    rig,
    UP.clone()
      .addScaledVector(fwd, lean)
      .addScaledVector(side, twist * 0.5)
      .normalize(),
    weight * 0.85,
  );
  aimBone(
    rig.head,
    rig,
    UP.clone()
      .addScaledVector(fwd, lean * 0.3 + 0.05)
      .normalize(),
    weight * 0.5,
  );

  // 2) Sağ kol kılıcı savurur; köprücük kemiği kısmen takip eder.
  aimBone(rig.rightShoulder, rig, armDir, weight * 0.3);
  aimBone(rig.rightUpper, rig, armDir, weight);
  aimBone(rig.rightFore, rig, armDir, weight * 0.9);
  if (bladeAxis) aimBone(rig.rightHand, rig, bladeDir, weight, bladeAxis);

  // 3) Sol kol denge için ters yöne açılır (tek elle savurma okunsun).
  const offDir = fwd
    .clone()
    .multiplyScalar(0.3)
    .addScaledVector(side, -Math.sin(hRad) * 0.85)
    .addScaledVector(DOWN, 0.5)
    .normalize();
  aimBone(rig.leftShoulder, rig, offDir, weight * 0.25);
  aimBone(rig.leftUpper, rig, offDir, weight * 0.7);
  aimBone(rig.leftFore, rig, offDir, weight * 0.55);
}
