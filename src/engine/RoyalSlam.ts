import * as THREE from "three";
import { handWorldQuat } from "./HandGrip";

/* ── Kraliyet Savaşçısı — ikinci ulti: iki elli kılıç yere vuruş ───── */
/* Prosedürel, ama ANİMASYON İLKELERİYLE kurulmuş bir vuruş:
 *
 *   anticipation (yavaş, 0 → 0.42) : gövde geriye yaslanır, kalça burulur,
 *                                    iki kol kılıcı baş üstüne-arkaya kaldırır
 *   strike       (hızlı, 0.42→0.62): gövde öne hamle yapar, bıçak yere saplanır
 *   hold         (0.62 → 0.70)     : darbe anında donma (ağırlık hissi)
 *   settle       (0.70 → 1.00)     : toparlanma + sönümlü titreme (ring-out)
 *
 * Önemli üç detay:
 *  1. Kollar/dirsekler AÇIYLA sürülür (düz yön lerp'i değil) — böylece kılıç
 *     başın üstünden gerçek bir yay çizerek iner, aradan "kısa yol" almaz.
 *  2. Kemik ekseni TAHMİN EDİLMEZ: dinlenme pozundan (bone → ana çocuk
 *     kemiği yönü, bone-lokal) ölçülür. Mixamo dışı/karışık riglerde de
 *     kemik doğru eksende döner.
 *  3. Gövde ağırlığı (hamle / çömelme / kalça burulması) ayrı döndürülür ve
 *     KEMİKLERDEN ÖNCE uygulanır — aksi halde kol hedefleme eski gövde
 *     duruşuna göre hesaplanır ve poz "yapıştırılmış" görünür.
 *
 * Mixer'ın idle/walk animasyonu bozulmaz: bu katman her karede onun ÜSTÜNE
 * dünya-uzayı hedefleri biner, kalıcı hiçbir state yazmaz.
 */

/** Ulti kilidi (sn): sim (BattleScene/PvpBattleScene) `samuraiUltT = 0.82`
 *  ile aynı süre — animasyon oranı birebir sim'in ilerlemesiyle eşleşir,
 *  yoksa hazırlık fazı kırpılır ve kılıç hasardan önce/sonra iner. */
export const ROYAL_ULT_LOCK = 0.82;
/** Vuruş oranı: sim bu oranda hasarı uygular (0.82 × 0.62 ≈ 0.51 s). */
export const ROYAL_ULT_STRIKE = 0.62;

/** Gövde ağırlığı dünya-uzayı ölçekleri (karakter ≈ 0.86 dünya birimi). */
const SLAM_LUNGE = 0.22; // body.lunge → öne hamle (dünya birimi)
const SLAM_DIP = 0.45; // body.dip → çömelme/yükselme (dünya birimi)

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

/* ──────────────────────────── rig bulma ─────────────────────────── */

export interface RoyalSlamRig {
  leftUpper: THREE.Object3D | null;
  rightUpper: THREE.Object3D | null;
  leftFore: THREE.Object3D | null;
  rightFore: THREE.Object3D | null;
  leftShoulder: THREE.Object3D | null;
  rightShoulder: THREE.Object3D | null;
  rightHand: THREE.Object3D | null;
  spine: THREE.Object3D | null;
  head: THREE.Object3D | null;
  /** bone → bone-lokal "ana zincire doğru" ekseni (dinlenme pozundan). */
  axis: Map<THREE.Object3D, THREE.Vector3>;
}

const cleanName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function subtreeBones(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((c) => {
    if ((c as THREE.Bone).isBone) n++;
  });
  return n;
}

/**
 * Bone'un DİNLENME pozundaki yön eksenini bone-lokal uzayda ölçer:
 * kemikten ana çocuk kemiğine giden vektör (en büyük alt zincir seçilir).
 * Böylece "kemik hangi yerel eksende ileri bakar" sorusu kodda sabitlenmez.
 */
function restAxis(bone: THREE.Object3D): THREE.Vector3 | null {
  const kids = bone.children.filter((c) => (c as THREE.Bone).isBone);
  if (!kids.length) return null;
  let best = kids[0];
  let bestN = -1;
  for (const k of kids) {
    const n = subtreeBones(k);
    if (n > bestN) {
      bestN = n;
      best = k;
    }
  }
  bone.updateWorldMatrix(true, true);
  const origin = bone.getWorldPosition(new THREE.Vector3());
  const dir = best.getWorldPosition(new THREE.Vector3()).sub(origin);
  if (dir.lengthSq() < 1e-12) return null;
  const wq = bone.getWorldQuaternion(new THREE.Quaternion());
  return dir.normalize().applyQuaternion(wq.invert()).normalize();
}

/**
 * İkinci ulti kemikleri. Mixamo riglerde üst kol "LeftArm / RightArm"
 * (upperarm DEĞİL) olur.
 */
export function findRoyalSlamRig(clone: THREE.Object3D): RoyalSlamRig {
  const rig: RoyalSlamRig = {
    leftUpper: null,
    rightUpper: null,
    leftFore: null,
    rightFore: null,
    leftShoulder: null,
    rightShoulder: null,
    rightHand: null,
    spine: null,
    head: null,
    axis: new Map(),
  };
  clone.traverse((obj) => {
    if (!(obj as THREE.Bone).isBone) return;
    const n = cleanName(obj.name);
    const isFinger = /thumb|index|middle|ring|pinky/.test(n);
    if (!rig.leftFore && n.includes("leftforearm")) rig.leftFore = obj;
    if (!rig.rightFore && n.includes("rightforearm")) rig.rightFore = obj;
    if (!rig.leftUpper && n.includes("leftarm") && !n.includes("forearm") && !n.includes("shoulder"))
      rig.leftUpper = obj;
    if (!rig.rightUpper && n.includes("rightarm") && !n.includes("forearm") && !n.includes("shoulder"))
      rig.rightUpper = obj;
    if (!rig.leftShoulder && n.includes("leftshoulder")) rig.leftShoulder = obj;
    if (!rig.rightShoulder && n.includes("rightshoulder")) rig.rightShoulder = obj;
    if (!rig.rightHand && n.includes("righthand") && !isFinger) rig.rightHand = obj;
    // Geçiş sırası yukarı doğru → son eşleşme en üst omurga (Spine2).
    if (n.includes("spine")) rig.spine = obj;
    if (!rig.head && n.includes("head") && !/headtop|headend/.test(n)) rig.head = obj;
  });
  for (const bone of [
    rig.leftUpper,
    rig.rightUpper,
    rig.leftFore,
    rig.rightFore,
    rig.leftShoulder,
    rig.rightShoulder,
    rig.rightHand,
    rig.spine,
    rig.head,
  ]) {
    if (!bone) continue;
    const axis = restAxis(bone);
    if (axis) rig.axis.set(bone, axis);
  }
  return rig;
}

/* ──────────────────────────── kılıç ölçümü ─────────────────────── */

/** Sağ ele bağlı kılıç kapsayıcısı (RoyalWarriorEffects'in grip grubu). */
export function findHandSword(hand: THREE.Object3D): THREE.Object3D | null {
  for (const child of hand.children) {
    if ((child as THREE.Bone).isBone) continue;
    if (!child.userData.isEquipment) continue;
    if (child.children.length === 0) continue;
    return child;
  }
  return null;
}

/**
 * Bıçağın EL-LOKAL eksenini ölçer: saptan en uzak tepe vertex'i uç yönünü
 * verir (rig'e/ölçeğe bağlı sabit yok). Yön, elin SAF DÖNME çerçevesine
 * çevrilir — böylece bone ölçeği ekseni çarpıtmaz.
 */
export function measureBladeAxis(
  hand: THREE.Object3D,
  sword: THREE.Object3D,
): THREE.Vector3 | null {
  hand.updateWorldMatrix(true, true);
  const hilt = sword.getWorldPosition(new THREE.Vector3());
  const vertex = new THREE.Vector3();
  let best = 0;
  const dir = new THREE.Vector3();
  sword.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const pos = mesh.isMesh ? mesh.geometry?.getAttribute("position") : null;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 400));
    for (let i = 0; i < pos.count; i += step) {
      vertex.fromBufferAttribute(pos as THREE.BufferAttribute, i);
      mesh.localToWorld(vertex);
      const d = vertex.distanceTo(hilt);
      if (d > best) {
        best = d;
        dir.copy(vertex).sub(hilt);
      }
    }
  });
  if (best < 1e-6) return null;
  dir.normalize();
  return dir.applyQuaternion(handWorldQuat(hand).invert()).normalize();
}

/* ─────────────────────────── poz yardımcıları ─────────────────── */

const _identity = new THREE.Quaternion();

/**
 * Bone'u, `targetWorld` yönünü gösterecek şekilde döndürür. Kullanılan eksen
 * bone-lokal (dinlenme pozundan ölçülmüş, ya da verilen override — ör. kılıç
 * bıçağı ekseni), hedef ise DÜNYA uzayında. `weight` 0..1 yumuşak geçiş.
 */
function aimBone(
  bone: THREE.Object3D | null,
  rig: RoyalSlamRig,
  targetWorld: THREE.Vector3,
  weight = 1,
  axisOverride?: THREE.Vector3,
): void {
  if (!bone || !bone.parent || weight <= 0.002) return;
  if (targetWorld.lengthSq() < 1e-8) return;
  const axis = axisOverride ?? rig.axis.get(bone) ?? UP;
  bone.updateWorldMatrix(true, false);
  const worldQuat = bone.getWorldQuaternion(new THREE.Quaternion());
  const currentDir = axis.clone().applyQuaternion(worldQuat).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(
    currentDir,
    targetWorld.clone().normalize(),
  );
  if (weight < 1) delta.slerp(_identity, 1 - weight);
  const parentQuat = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.premultiply(
    parentQuat.clone().invert().multiply(delta).multiply(parentQuat),
  );
  bone.updateWorldMatrix(true, false);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / Math.max(1e-6, b - a));
  return t * t * (3 - 2 * t);
};
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

/**
 * Karakterin GERÇEK baktığı yön (dünya uzayı) — omuz çizgisinden türetilir,
 * yani rig yaw/mirror farklarından bağımsızdır. Sol omuz − sağ omuz × up.
 */
export function royalSlamForward(rig: RoyalSlamRig, facing: number): THREE.Vector3 {
  const ls = rig.leftShoulder;
  const rs = rig.rightShoulder;
  if (ls && rs) {
    ls.updateWorldMatrix(true, false);
    rs.updateWorldMatrix(true, false);
    const side = ls
      .getWorldPosition(new THREE.Vector3())
      .sub(rs.getWorldPosition(new THREE.Vector3()));
    side.y = 0;
    if (side.lengthSq() > 1e-8) {
      const fwd = side.normalize().cross(UP);
      if (fwd.lengthSq() > 1e-8) return fwd.normalize();
    }
  }
  return new THREE.Vector3(facing >= 0 ? 1 : -1, 0, 0);
}

/**
 * `base` ekseninden `plane` yönüne, `deg` derece dönmüş birim yön.
 * Kolları/bıçağı AÇIYLA sürmenin çekirdeği: ara açılar gerçek yayı izler.
 */
function dirFromAngle(base: THREE.Vector3, plane: THREE.Vector3, deg: number): THREE.Vector3 {
  const r = (deg * Math.PI) / 180;
  return base
    .clone()
    .multiplyScalar(Math.cos(r))
    .addScaledVector(plane, Math.sin(r))
    .normalize();
}

/* ─────────────────────── anahtar kare & zaman çizelgesi ─────────── */

/** Gövde ağırlığı (yerel grup offset'i olarak uygulanır). */
export interface RoyalSlamBody {
  /** Öne hamle (dünya birimi oranı). */
  lunge: number;
  /** Yukarı/aşağı (dünya birimi oranı). */
  dip: number;
  /** Kalça/gövde burulması (radyan). */
  twist: number;
}

interface SlamKey {
  /** Üst kol açısı: 0 aşağı, 212 baş üstü-arkaya, 42 öne-aşağı. */
  arm: number;
  /** Bıçak açısı (yukarıdan ölçülür): 0 dik, −72 arkaya, 140 yere. */
  blade: number;
  lean: number;
  body: RoyalSlamBody;
}

const KEY_REST: SlamKey = { arm: 10, blade: 0, lean: 0, body: { lunge: 0, dip: 0, twist: 0 } };
const KEY_WIND: SlamKey = {
  arm: 212,
  blade: -72,
  lean: -0.22,
  body: { lunge: -0.16, dip: 0.05, twist: 0.34 },
};
const KEY_SLAM: SlamKey = {
  arm: 42,
  blade: 140,
  lean: 0.42,
  body: { lunge: 0.46, dip: -0.1, twist: -0.26 },
};

const PH_WIND = 0.42;
const PH_STRIKE = 0.62;
const PH_HOLD = 0.7;

interface SlamPhase {
  from: SlamKey;
  to: SlamKey;
  t: number;
  weight: number;
}

/** Ulti oranını (0..1) hangi iki anahtar arasında olduğuna çevirir. */
function slamPhase(u: number): SlamPhase {
  const weight = smoothstep(0, 0.06, u) * (1 - smoothstep(0.9, 1, u));
  if (u < PH_WIND) {
    // Anticipation: sakin başlar, sonunda hızlanır (yay kurma hissi).
    const k = clamp01(u / PH_WIND);
    return { from: KEY_REST, to: KEY_WIND, t: k * k * (3 - 2 * k) * 0.55 + k * 0.45, weight };
  }
  if (u < PH_STRIKE) {
    // Strike: çok hızlı, darbeye doğru yavaşlar (impact ease-out).
    return {
      from: KEY_WIND,
      to: KEY_SLAM,
      t: easeOut((u - PH_WIND) / (PH_STRIKE - PH_WIND)),
      weight,
    };
  }
  if (u < PH_HOLD) {
    // Darbe donması: kılıç yerde ~80 ms kalır → ağırlık.
    return { from: KEY_SLAM, to: KEY_SLAM, t: 0, weight };
  }
  // Settle: yumuşak toparlanma.
  return {
    from: KEY_SLAM,
    to: KEY_REST,
    t: smoothstep(0, 1, (u - PH_HOLD) / (1 - PH_HOLD)),
    weight,
  };
}

/** Gövde ağırlığını (önce uygulanacak offset) döndürür; aktif değilse null. */
export function computeRoyalSlamBody(progress: number): RoyalSlamBody | null {
  const u = clamp01(progress);
  const ph = slamPhase(u);
  if (ph.weight <= 0.002) return null;
  const blend = (a: number, b: number) => a + (b - a) * ph.t;
  return {
    lunge: blend(ph.from.body.lunge, ph.to.body.lunge),
    dip: blend(ph.from.body.dip, ph.to.body.dip),
    twist: blend(ph.from.body.twist, ph.to.body.twist),
  };
}

/**
 * Gövde ağırlığını `group` (karakter kök grubu) üzerine yazar. KEMİKLERDEN
 * ÖNCE çağrılmalıdır: kol hedefleri dünya uzayında hesaplandığı için gövde
 * dönüşü poza dahil olur.
 */
export function applyRoyalSlamBody(
  group: THREE.Object3D,
  rig: RoyalSlamRig,
  body: RoyalSlamBody,
  facing: number,
): void {
  const off = royalSlamForward(rig, facing)
    .multiplyScalar(body.lunge * SLAM_LUNGE)
    .setY(body.dip * SLAM_DIP);
  const parent = group.parent;
  if (parent) {
    // world → parent-local (dönme + ölçek)
    const pq = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    off.applyQuaternion(pq);
    const ws = parent.getWorldScale(new THREE.Vector3());
    const s = (ws.x + ws.y + ws.z) / 3 || 1;
    off.multiplyScalar(1 / s);
  }
  group.position.copy(off);
  group.rotation.y = body.twist;
}

/** Ulti bitince gövdeyi tam dinlenmeye döndürür. */
export function clearRoyalSlamBody(group: THREE.Object3D): void {
  group.position.set(0, 0, 0);
  group.rotation.set(0, 0, 0);
}

export interface RoyalSlamOptions {
  rig: RoyalSlamRig;
  /** Ölçülmüş bıçak ekseni (el-lokal). Yoksa bilek hedeflenmez. */
  bladeAxis: THREE.Vector3 | null;
  /** 0..1 — 2. ulti süresinin oranı. */
  progress: number;
  facing: number;
  active: boolean;
}

/**
 * İki elli kılıç yere vuruş pozunu uygular. Dönüş: uygulanan body offset'i
 * (FighterRig sporunun konum/rotasyonuna yazılır), uygulanmadıysa null.
 */
export function applyRoyalSlamPose(opts: RoyalSlamOptions): RoyalSlamBody | null {
  const { rig, bladeAxis, progress, facing, active } = opts;
  if (!active) return null;
  const u = clamp01(progress);
  const ph = slamPhase(u);
  if (ph.weight <= 0.002) return null;
  const { weight } = ph;
  const blend = (a: number, b: number) => a + (b - a) * ph.t;

  let armA = blend(ph.from.arm, ph.to.arm);
  let bladeA = blend(ph.from.blade, ph.to.blade);
  const lean = blend(ph.from.lean, ph.to.lean);
  const body: RoyalSlamBody = {
    lunge: blend(ph.from.body.lunge, ph.to.body.lunge),
    dip: blend(ph.from.body.dip, ph.to.body.dip),
    twist: blend(ph.from.body.twist, ph.to.body.twist),
  };
  // Darbe sonrası sönümlü titreme — kılıcın ağırlığını hissettirir.
  if (u >= PH_HOLD) {
    const w = (u - PH_HOLD) / Math.max(1e-6, 1 - PH_HOLD);
    const wob = Math.sin(w * Math.PI * 3) * Math.exp(-w * 4) * 3.5;
    armA += wob;
    bladeA += wob * 0.6;
  }

  const fwd = royalSlamForward(rig, facing);
  const armDir = dirFromAngle(DOWN, fwd, armA);
  const bladeDir = dirFromAngle(UP, fwd, bladeA);

  // 1) Gövde önce: omurga + baş. Omurga dönünce kolların dünya yönü de
  //    değiştiği için kollar EN SON hedeflenir.
  aimBone(rig.spine, rig, UP.clone().addScaledVector(fwd, lean).normalize(), weight * 0.85);
  aimBone(
    rig.head,
    rig,
    UP.clone().addScaledVector(fwd, lean * 0.25 + 0.06).normalize(),
    weight * 0.5,
  );

  // 2) Sağ kol kılıcı kaldırıp indirir; köprücük kemiği (clavicle) de
  //    kısmen takip eder — omuz gerçekten "kalkar", kol kopuk durmaz.
  aimBone(rig.rightShoulder, rig, armDir, weight * 0.35);
  aimBone(rig.rightUpper, rig, armDir, weight);
  aimBone(rig.rightFore, rig, armDir, weight * 0.88);
  if (bladeAxis) aimBone(rig.rightHand, rig, bladeDir, weight, bladeAxis);

  // 3) Sol el sağ ele (sapa) doğru → gerçekten iki elle tutuş.
  if (rig.rightHand) rig.rightHand.updateWorldMatrix(true, false);
  const hilt = rig.rightHand
    ? rig.rightHand.getWorldPosition(new THREE.Vector3())
    : null;
  if (rig.leftUpper) {
    const shoulder = rig.leftUpper.getWorldPosition(new THREE.Vector3());
    const target = hilt
      ? hilt.clone().sub(shoulder).normalize().lerp(armDir, 0.15).normalize()
      : armDir;
    aimBone(rig.leftShoulder, rig, target, weight * 0.3);
    aimBone(rig.leftUpper, rig, target, weight * 0.95);
  }
  if (rig.leftFore) {
    const elbow = rig.leftFore.getWorldPosition(new THREE.Vector3());
    const target = hilt ? hilt.clone().sub(elbow).normalize() : armDir;
    aimBone(rig.leftFore, rig, target, weight);
  }

  return body;
}
