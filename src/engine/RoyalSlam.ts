import * as THREE from "three";

/* ── Kraliyet Savaşçısı — ikinci ulti (iki elli kılıç yere vuruş) ─── */
/* Kraliyet savaşçısının elinde ZATEN kılıç var (RoyalWarriorEffects
 * royal-kilic.glb'yi sağ ele bağlar). Bu modül o kılıcı sallayan pozu
 * üretir: kolları DÜNYA yönlerine göre hedefler (rig ekseni/mirror
 * tahmini yok), mixer animasyonuna dokunmaz, sadece üstüne biner.
 */

/* ───────────────────────────── kemikler ───────────────────────────── */

export interface RoyalSlamRig {
  leftUpper: THREE.Object3D | null;
  rightUpper: THREE.Object3D | null;
  leftFore: THREE.Object3D | null;
  rightFore: THREE.Object3D | null;
  leftShoulder: THREE.Object3D | null;
  rightShoulder: THREE.Object3D | null;
  rightHand: THREE.Object3D | null;
  spine: THREE.Object3D | null;
}

const cleanName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * İkinci ulti için kollar/omuzlar/el/omurga kemikleri. Mixamo riglerde üst
 * kol "LeftArm / RightArm" (upperarm DEĞİL) olur.
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
    // Geçiş sırası yukarı doğru olduğu için son eşleşme en üst omurga (Spine2).
    if (n.includes("spine")) rig.spine = obj;
  });
  return rig;
}

/* ──────────────────────────── kılıç ölçümü ─────────────────────────── */

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
 * Bıçağın EL-LOKAL eksenini ölçer: sap noktasından en uzak tepe vertex'i
 * uç yönünü verir (rig'e/ölçeklerine bağlı sabit yok).
 */
export function measureBladeAxis(
  hand: THREE.Object3D,
  sword: THREE.Object3D,
): THREE.Vector3 | null {
  hand.updateWorldMatrix(true, true);
  const hilt = hand.worldToLocal(sword.getWorldPosition(new THREE.Vector3()));
  const vertex = new THREE.Vector3();
  let bestDist = 0;
  const tipDir = new THREE.Vector3();
  sword.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const pos = mesh.isMesh ? mesh.geometry?.getAttribute("position") : null;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 400));
    for (let i = 0; i < pos.count; i += step) {
      vertex.fromBufferAttribute(pos as THREE.BufferAttribute, i);
      mesh.localToWorld(vertex);
      const local = hand.worldToLocal(vertex.clone());
      const dist = local.distanceTo(hilt);
      if (dist > bestDist) {
        bestDist = dist;
        tipDir.copy(local).sub(hilt).normalize();
      }
    }
  });
  return bestDist > 1e-6 ? tipDir : null;
}

/* ─────────────────────────── poz yardımcıları ─────────────────────── */

const _identity = new THREE.Quaternion();

/**
 * Bone'un `axis` (bone-lokal) eksenini `targetWorld` yönüne çevirir; mirror
 * eksen tahminine gerek kalmaz. `weight` 0..1 arası yumuşak geçiş sağlar.
 * Mixer her karede kemikleri animasyondan yazdığı için bu ofset üstüne
 * biner, idle/walk animasyonu bozulmaz.
 */
function aimBone(
  bone: THREE.Object3D | null,
  axis: THREE.Vector3,
  targetWorld: THREE.Vector3,
  weight = 1,
): void {
  if (!bone || !bone.parent || weight <= 0.001) return;
  if (targetWorld.lengthSq() < 1e-8) return;
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

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Karakterin baktığı yön (dünya uzayı). Omuz çizgisi rig yaw'ından
 *  bağımsızdır: sol omuz − sağ omuz = karakterin solu. */
function worldForward(rig: RoyalSlamRig, facing: number): THREE.Vector3 {
  const ls = rig.leftShoulder;
  const rs = rig.rightShoulder;
  if (ls && rs) {
    const side = ls
      .getWorldPosition(new THREE.Vector3())
      .sub(rs.getWorldPosition(new THREE.Vector3()));
    side.y = 0;
    if (side.lengthSq() > 1e-8) {
      const fwd = side.normalize().cross(new THREE.Vector3(0, 1, 0));
      if (fwd.lengthSq() > 1e-8) return fwd.normalize();
    }
  }
  return new THREE.Vector3(facing >= 0 ? 1 : -1, 0, 0);
}

export interface RoyalSlamOptions {
  rig: RoyalSlamRig;
  /** Ölçülmüş bıçak ekseni (el-lokal). Yoksa sadece kol sallanır. */
  bladeAxis: THREE.Vector3 | null;
  /** 0..1 — 2. ulti süresinin oranı (vuruş anı ≈ 0.62). */
  progress: number;
  /** +1 sağa (+X), -1 sola bakan karakter. */
  facing: number;
  active: boolean;
}

/**
 * İki elli kılıç yere vurma pozu:
 *   0 → 0.40 hazırlık: kollar baş üstüne, kılıç geriye
 *   0.40 → 0.62 vuruş: kollar öne-aşağı, bıçak yere saplanır
 *   0.62 → 1.00 toparlanma
 * Sol kol sağ elin (yani sapın) konumuna doğrultulur → iki elle tutuyor
 * görünür.
 */
export function applyRoyalSlamPose(opts: RoyalSlamOptions): void {
  const { rig, bladeAxis, progress, facing, active } = opts;
  if (!active) return;
  const u = Math.min(1, Math.max(0, progress));
  const weight = smoothstep(0, 0.06, u) * (1 - smoothstep(0.88, 1, u));
  if (weight <= 0.001) return;

  const up = new THREE.Vector3(0, 1, 0);
  const fwd = worldForward(rig, facing);
  const ease = (t: number) => {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  };

  // Anahtar yönler (dünya uzayı — arena x→x, y→z eşlemesi).
  const armDown = up.clone().multiplyScalar(-1).addScaledVector(fwd, 0.28).normalize();
  const armUp = up.clone().addScaledVector(fwd, 0.22).normalize();
  const armSlam = up.clone().multiplyScalar(-0.62).addScaledVector(fwd, 0.78).normalize();
  const bladeUp = up.clone().addScaledVector(fwd, -0.12).normalize();
  const bladeBack = up.clone().multiplyScalar(0.82).addScaledVector(fwd, -0.57).normalize();
  const bladeDown = up.clone().multiplyScalar(-0.80).addScaledVector(fwd, 0.60).normalize();

  let armDir: THREE.Vector3;
  let bladeDir: THREE.Vector3;
  let lean: number;
  if (u < 0.4) {
    const t = ease(u / 0.4);
    armDir = armDown.clone().lerp(armUp, t);
    bladeDir = bladeUp.clone().lerp(bladeBack, t);
    lean = -0.20 * t;
  } else if (u < 0.62) {
    const t = ease((u - 0.4) / 0.22);
    armDir = armUp.clone().lerp(armSlam, t);
    bladeDir = bladeBack.clone().lerp(bladeDown, t);
    lean = -0.20 + 0.52 * t;
  } else {
    const t = ease((u - 0.62) / 0.38);
    armDir = armSlam.clone().lerp(armDown, t);
    bladeDir = bladeDown.clone().lerp(bladeUp, t);
    lean = 0.32 * (1 - t);
  }
  armDir.normalize();
  bladeDir.normalize();

  // Sağ kol kılıcı kaldırıp indirir; bilek bıçağı vuruş yönüne çevirir.
  aimBone(rig.rightUpper, up, armDir, weight);
  aimBone(rig.rightFore, up, armDir, weight * 0.9);
  if (bladeAxis) aimBone(rig.rightHand, bladeAxis, bladeDir, weight);

  // Gövde: hazırlıkta geriye, vuruşta öne.
  aimBone(rig.spine, up, up.clone().addScaledVector(fwd, lean).normalize(), weight * 0.75);

  // Sol el: sağ elin (sapın) dünya konumuna doğrult → iki elle tutuş.
  const hilt = rig.rightHand
    ? rig.rightHand.getWorldPosition(new THREE.Vector3())
    : null;
  if (rig.leftUpper) {
    let target = armDir;
    if (hilt) {
      const shoulder = rig.leftUpper.getWorldPosition(new THREE.Vector3());
      target = hilt.clone().sub(shoulder).normalize().lerp(armDir, 0.2).normalize();
    }
    aimBone(rig.leftUpper, up, target, weight * 0.95);
  }
  if (rig.leftFore) {
    let target = armDir;
    if (hilt) {
      const elbow = rig.leftFore.getWorldPosition(new THREE.Vector3());
      target = hilt.clone().sub(elbow).normalize();
    }
    aimBone(rig.leftFore, up, target, weight);
  }
}
