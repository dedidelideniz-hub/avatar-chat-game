import * as THREE from "three";
import { SWORD_TARGET_WORLD_LEN } from "./HandGrip";
import {
  aimBone,
  findHandSword,
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

/** Toplam süre (sn) — iki çapraz kesiş (sol/sağ). Kesişin okunması için
 *  yeterince uzun: hazırlık → hızlı darbe → toparlanma. */
export const MELEE_DUR = 0.72;
/** Rakip yakınsa süre uzar: üstüne atlama + bitirici iniş (3. vuruş). */
export const MELEE_LUNGE_DUR = 0.95;
/**
 * Yeniden kullanma bekleme süresi (sn) — yakın dövüş de diğer yetenekler gibi
 * "süre ile dolar, %100'de kullanılır" kuralına uyar (bkz. SkillComponent →
 * şarj tablosu).
 *
 * Süre OKUNUR olmak zorunda: eski 0.42 sn ve 1.05 sn değerleri düz vuruşun
 * kendi bekleme süresine (0.85 sn) yakındı, yani halka neredeyse her an dolu
 * görünüyor ve buton "süresiz" okunuyordu. Şimdiki değer, halkanın boştan
 * doluya görünür biçimde ilerlediği gerçek bir bekleme süresidir (4 sn).
 * Salınım (en fazla `MELEE_LUNGE_DUR` = 0.95 sn) bu sürenin içinde akar,
 * yani halka kullanımdan itibaren kesintisiz olarak %0 → %100 ilerler.
 */
export const MELEE_CD = 4;
/**
 * Kesme menzili (px). Kılıcın GERÇEK erişimine göre sınırlıdır: bıçak ucu
 * gövde merkezinden ~68 px (sap+kol), rakip yarıçapı ~22 px → kılıç ancak
 * ~90 px'lik merkez-mesafede rakibin GÖVDESİNE değer. Eski 155 px değeri
 * kılıcın ulaşamadığı mesafeden vuruyordu ("uzaktan kılıç" hatası); 96 px ile
 * efekt (kılıç ucu) ile kural artık aynı mesafeyi anlatır.
 */
export const MELEE_RANGE_PX = 96;
/**
 * Rakip bu mesafe içindeyse nişan ona kilitlenir ve üstüne atlanır (px).
 * Kesme menzilinin biraz üstünde: yalnızca SON adımı kapatmak için hop atılır
 * (eski 230 px "uzaktan atlama" hissini veriyordu — artık rakip gerçekten
 * dibindeyken kilitlenir, uzaktakinin peşinden gitmez).
 */
export const MELEE_LUNGE_RANGE_PX = 112;
/** Zaten dibindeyse atlama yapılmaz (px). Temas mesafesi (2×22 px) üstünde. */
export const MELEE_LEAP_MIN_PX = 52;
/** Atlama hızı (px/sn) — dövüşçü fiziğiyle (çarpışma kontrollü) sürülür.
 *  Atlama penceresi (~0.21 sn) bu hızda ~188 px yol alabilir; `stepMelee`
 *  adımı kalan boşlukla sınırlar, yani karakter rakibin YANINDA durur (üstünden
 *  geçip savrulmaz). Menzil kısaldığı için hop artık yalnızca son boşluğu kapatır. */
export const MELEE_LEAP_SPEED = 900;
/** Her kesme fazındaki küçük ÖNE ADIM hızı (px/sn). Karakter yerinde
 *  savurmaz: her darbe biraz yakınlaşır (yakın dövüşçü hissi). */
export const MELEE_STEP_SPEED = 420;
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

/** Gövde hamlesi/alçalması (dünya birimi oranı — RoyalSlam ile aynı dil).
 *  DIP, bitiricinin “hop”unu (çömel → havalan → sapla) okunur kılar. */
const MELEE_LUNGE = 0.24;
const MELEE_DIP = 0.4;

interface MeleeKey {
  /** Kolun yatay açısı (derece): 0 = öne, + → karakterin SOLUNA. */
  h: number;
  /** Dikey bileşen (yukarı +, aşağı −). Kesişin “çapraz” okunmasını sağlar. */
  lift: number;
  /** Omurga öne eğilmesi. */
  lean: number;
  /** Gövde/omurganın EKSENEL burulması (radyan, dünya Y ekseni).
   *  Bir kılıç savurmasını “el sallama”dan ayıran asıl katman budur:
   *  hazırlıkta gövde geriye/yanadır, darbede hedefe doğru döner. */
  yaw: number;
  /** Gövde hamlesi (adım atma). */
  lunge: number;
  /** Gövde alçalması (çömelme). */
  dip: number;
}

const K = (
  h: number,
  lift: number,
  lean = 0,
  yaw = 0,
  lunge = 0,
  dip = 0,
): MeleeKey => ({ h, lift, lean, yaw, lunge, dip });

/**
 * Aşama anahtar kareleri: [rest, anticipation, strike, follow-through].
 *
 * Kesişler DÜZ YATAY değil ÇAPRAZDIR (yukarıdan aşağı) — MOBA kamerasında
 * yatay savurma neredeyse görünmez, çapraz iniş ise net bir “kesme” okunur.
 * Ardışık aşamaların "follow" u bir sonrakinin "rest"ine eşit seçildi:
 * combo boyunca kol geri sıfırlanmadan diğer yana akar.
 */
const STAGE_KEYS: readonly (readonly MeleeKey[])[] = [
  // 0 — SAĞDAN SOLA çapraz kesme (kılıç baş üstü-sağdan sol alta iner).
  //     Gövde ÖNCE SAĞA kurulur (−yaw), sonra sola dönerek kılıcı sürer.
  [
    K(-95, 0.35, -0.08, -0.15, -0.12, 0.02),
    K(-128, 1.05, -0.2, -0.72, -0.26, 0.07),
    K(66, -0.62, 0.44, 0.52, 0.44, -0.1),
    K(120, -0.9, 0.26, 0.66, 0.16, -0.02),
  ],
  // 1 — SOLDAN SAĞA çapraz kesme (ayna)
  [
    K(120, -0.9, 0.26, 0.66, 0.16, -0.02),
    K(132, 1.0, -0.18, 0.74, -0.22, 0.07),
    K(-66, -0.62, 0.44, -0.52, 0.44, -0.1),
    K(-128, -0.95, 0.26, -0.68, 0.16, -0.02),
  ],
  // 2 — BİTİRİCİ: İMPALE. Rakip yakınsa karakter KAYARAK üstüne girer, kılıç
  //     geriye- kalçaya çekilir, iki elle öne bastırılıp rakibin gövdesine
  //     SOKULUR (kan fışkırır). Bıçak bu aşamada yataydır (bladeDown ≈ 0).
  [
    K(-128, -0.95, 0.26, -0.68, 0.16, -0.02),
    // Hazırlık: kılıç geriye/ kalçaya çekilir, gövde sağa kurulup yüklenir.
    K(-34, 0.28, -0.34, -0.5, -0.4, 0.16),
    // İMPALE: gövde öne kapanır, iki kol kılıcı rakibin içine sürer.
    K(6, -0.08, 0.52, 0.18, 0.95, -0.18),
    K(8, -0.12, 0.34, 0.1, 0.5, -0.06),
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
    // Kök (kalça) burulması = omurga burulmasının %60'ı: gövde hedefe
    // gerçekten döner. Kemikler bu tabanın ÜSTÜNE hedeflenir.
    twist: blend(b.from.yaw, b.to.yaw) * 0.6,
  };
}

/* ─────────────────────── eksenel (yaw) kemik dönüşü ─────────────── */

const _parentQ = new THREE.Quaternion();
const _yawQ = new THREE.Quaternion();

/**
 * Bone'u DÜNYA Y ekseni etrafında `angle` kadar burkar. `aimBone` bir kemiğin
 * eksenini hedefe çevirir; gövde BURULMASI ise eksen yönünü değiştirmeyen bir
 * dönüştür. Kalça/omurga burulmasını bu sağlar — kılıç savurmasının “gövdeyle
 * girme” hissi buna bağlıdır.
 */
function twistBoneYaw(
  bone: THREE.Object3D | null,
  angle: number,
  weight = 1,
): void {
  if (!bone || !bone.parent || weight <= 0.002) return;
  if (Math.abs(angle * weight) < 1e-4) return;
  bone.updateWorldMatrix(true, false);
  const parent = bone.parent;
  parent.getWorldQuaternion(_parentQ);
  const parentInv = _parentQ.clone().invert();
  _yawQ.setFromAxisAngle(UP, angle * weight);
  bone.quaternion.premultiply(parentInv.multiply(_yawQ).multiply(_parentQ));
  bone.updateWorldMatrix(true, false);
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

/* ───────────────── vuruş çıpası (efekt ↔ kılıç ucu) ─────────────── */

/** Dünya birimi → arena px (Arena3D `S = 50` ile aynı ölçek). */
const PX_PER_UNIT = 50;

/**
 * Kemik katmanının her karede yazdığı VURUŞ ÇIPASI.
 *
 * NEDEN: vuruş efektleri (kesme şeridi, kıvılcım, kan) sim katmanında üretilir
 * ama kılıcın nerede olduğunu yalnız KEMİK katmanı bilir. Eskiden efekt
 * noktası elle verilen sabit ofsetlerle (`y − 46` gibi) hesaplanıyordu; bu da
 * efekti kılıçtan koparıyordu (izlenim: “kılıç buraya vurdu, efekt başka yerde
 * çıktı”). Artık uç nokta ÖLÇÜLÜP burada yayınlanır.
 *
 * `meleeFxT` tazelik damgasıdır: bayat değer (ör. salınım bitti) çıpa olarak
 * kullanılmaz, sim tarafı kendi yedek noktasına düşer.
 */
export interface MeleeStrikeAnchor {
  /** Kılıç UCUNUN arena px karşılığı (x = dünya X × 50). */
  meleeFxX?: number;
  meleeFxY?: number;
  /** Çıpanın yazıldığı an (`performance.now()`). */
  meleeFxT?: number;
}

/** Ölçüm tamponu (kare başına ayırma yok). */
const _grip = new THREE.Vector3();

/**
 * Kılıç ucunun dünya konumunu arena px olarak `host`a yazar.
 *
 * Uç = sapın dünya konumu + ölçülmüş dünya bıçak uzunluğu (`SWORD_TARGET_
 * WORLD_LEN`, 0.85 birim) × bıçağın GERÇEK dünya yönü. Yön `applyMeleePose`
 * içinde hesaplanan `bladeDir`'dir — yani kemiklerin o karede gerçekten
 * baktığı yön. Böylece efekt, kılıcın indiği karede tam ucunda belirir.
 */
function writeStrikeAnchor(
  host: MeleeStrikeAnchor,
  rig: RoyalSlamRig,
  bladeDir: THREE.Vector3,
): void {
  const hand = rig.rightHand;
  if (!hand) return;
  hand.updateWorldMatrix(true, false);
  // Sap (kılıç konteyneri) elde ölçülmüş noktada durur; bulunamazsa el
  // eklemi kullanılır — aradaki fark ~0.1 birim (≈ 5 px), görünmez.
  (findHandSword(hand) ?? hand).getWorldPosition(_grip);
  host.meleeFxX = (_grip.x + bladeDir.x * SWORD_TARGET_WORLD_LEN) * PX_PER_UNIT;
  host.meleeFxY = (_grip.z + bladeDir.z * SWORD_TARGET_WORLD_LEN) * PX_PER_UNIT;
  host.meleeFxT = performance.now();
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
  /** Vuruş çıpasının yazılacağı dövüşçü (bkz. `MeleeStrikeAnchor`). */
  anchor?: MeleeStrikeAnchor | null;
}

/**
 * Salınım ilerlemesinin KOL AÇISI — iz katmanı kılıcın çizdiği kavisi buradan
 * türetir.
 *
 * Değerler `applyMeleePose` ile AYNI anahtar tablosundan (`STAGE_KEYS`) ve aynı
 * ara değerleme eğrilerinden gelir; yani iz ile kılıç asla ayrışmaz: kol nereye
 * gidiyorsa izin örnekleri de oradan geçer.
 *
 *  · `h`      kolun yatay açısı (derece, 0 = öne, + karakterin SOLUNA)
 *  · `lift`   dikey bileşen (yukarı +, aşağı −)
 *  · `lean`   omurga öne eğilmesi (izin yüksekliğini etkiler)
 *  · `weight` katman ağırlığı (salınımın giriş/çıkışında 0'a iner)
 */
export function meleeArmAngle(
  progress: number,
  leap: boolean,
): { h: number; lift: number; lean: number; weight: number } {
  const b = meleeBlend(progress, leap);
  const at = (a: number, c: number) => a + (c - a) * b.t;
  return {
    h: at(b.from.h, b.to.h),
    lift: at(b.from.lift, b.to.lift),
    lean: at(b.from.lean, b.to.lean),
    weight: b.weight,
  };
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
  const yaw = blend(b.from.yaw, b.to.yaw);
  // Hazırlık fazında mı, darbeden sonra mı? (dirsek kırılması ve sol kol
  // karşı savurması bu fazla şekillenir.)
  const winding = b.local < PH_STRIKE;

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

  // Bıçak, koldan dışa uzanır. Çapraz kesişlerde aşağı doğru çalar; BİTİRİCİ
  // İMPALEDE ise neredeyse yatay kalır (bıçak rakibin gövdesine GİRER,
  // tepeden inmez) — bu yüzden bladeDown orada çok küçüktür.
  const thrust = b.stage >= 2;
  const bladeDown = thrust ? 0.08 : 0.45;
  const bladeDir = armDir.clone().addScaledVector(DOWN, bladeDown).normalize();

  // 1) GÖVDE ÖNCE: omurga eksenel burulması (kalça zaten kök burulmasıyla
  //    döndü) + öne eğilme + baş. Burulma, kolların dünya yönünü değiştirdiği
  //    için kollar EN SON hedeflenir.
  twistBoneYaw(rig.spine, yaw * 0.55, weight * 0.9);
  aimBone(
    rig.spine,
    rig,
    UP.clone().addScaledVector(fwd, lean).normalize(),
    weight * 0.6,
  );
  // Baş gövdeyle birlikte döner ama hedefe nişan almış kalır.
  twistBoneYaw(rig.head, yaw * 0.2, weight);
  aimBone(
    rig.head,
    rig,
    UP.clone()
      .addScaledVector(fwd, lean * 0.25 + 0.05)
      .normalize(),
    weight * 0.5,
  );

  // 2) SAĞ KOL: kılıcı taşır. Köprücük kemiği (clavicle) omuzla birlikte
  //    açılır → kol gövdeden kopuk durmaz. Hazırlıkta dirsek kırılır, darbede
  //    kol tam uzanır (kesme anı).
  aimBone(rig.rightShoulder, rig, armDir, weight * 0.45);
  aimBone(rig.rightUpper, rig, armDir, weight);
  const foreDir = armDir
    .clone()
    .addScaledVector(DOWN, winding ? 0.28 : 0.06)
    .normalize();
  aimBone(rig.rightFore, rig, foreDir, weight * 0.95);
  if (bladeAxis) aimBone(rig.rightHand, rig, bladeDir, weight, bladeAxis);

  // 3) SOL KOL: kılıcı İKİ ELİYLE kavrar (sol el sapın üstüne gelir). Sol
  //    kol, sağ elin dünya konumuna (sap) doğru yönlendirilir; böylece
  //    gövdeyle bastırıp sürme (iki elli pres) okunur.
  if (rig.rightHand) rig.rightHand.updateWorldMatrix(true, false);
  const hilt = rig.rightHand
    ? rig.rightHand.getWorldPosition(new THREE.Vector3())
    : null;
  if (rig.leftUpper) {
    const shoulder = rig.leftUpper.getWorldPosition(new THREE.Vector3());
    const handDir = hilt
      ? hilt.clone().sub(shoulder).normalize().lerp(armDir, 0.18).normalize()
      : armDir.clone();
    aimBone(rig.leftShoulder, rig, handDir, weight * 0.35);
    aimBone(rig.leftUpper, rig, handDir, weight * 0.95);
    if (rig.leftFore) {
      const elbow = rig.leftFore.getWorldPosition(new THREE.Vector3());
      const foreDir2 = hilt ? hilt.clone().sub(elbow).normalize() : handDir;
      aimBone(rig.leftFore, rig, foreDir2, weight);
    }
  }

  // 4) VURUŞ ÇIPASI: kemikler yerleştikten SONRA kılıç ucu ölçülür ve arena
  //    px olarak yayınlanır. Sim katmanı vuruş efektlerini buraya koyar —
  //    yani efekt, kılıcın gerçekten indiği noktadan çıkar.
  if (opts.anchor) writeStrikeAnchor(opts.anchor, rig, bladeDir);
}
