import * as THREE from "three";
import { DRACOLoader, GLTFLoader, SkeletonUtils } from "three-stdlib";
import {
  SWORD_CONTAINER_MODEL_POS,
  SWORD_CONTAINER_MODEL_ROT,
  SWORD_GRIP_POS,
  SWORD_GRIP_ROT,
  SWORD_GRIP_SCALE,
  SWORD_TARGET_WORLD_LEN,
  applyFingerGrip,
  buildStructuralSword,
  calibrateSwordGrip,
  handBoneScale,
} from "./HandGrip";

/* ── Samuray Savaşçısı — savaş alanı katanası ─────────────────────── */
/* skin-samuray.glb kılıç İÇERMEZ (tek mesh: Character). Bu modül katanayı
 * (mevcut royal-kilic.glb, tıpkı kraliyet kılıcı gibi) samurayın SAĞ EL
 * bone'una bağlar ve 2. ulti için iki elli "yere vurma" pozunu uygular.
 *
 * Tüm hareket, kemiklerin DÜNYA yönlerine göre hedeflenir (aimBone): rig
 * eksenleri ne olursa olsun doğru çalışır, mixer animasyonuna dokunmaz.
 */

const KATANA_URL = "/models/royal-kilic.glb";

const katanaLoader = (() => {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("/draco/");
  loader.setDRACOLoader(draco);
  return loader;
})();

let katanaScene: THREE.Object3D | null = null;
let katanaLoading: Promise<void> | null = null;

/** Tek seferlik katana GLB yüklemesi (tüm samuraylar paylaşır). */
function loadKatana(onReady: (scene: THREE.Object3D) => void): void {
  if (katanaScene) {
    onReady(katanaScene);
    return;
  }
  if (!katanaLoading) {
    katanaLoading = katanaLoader
      .loadAsync(KATANA_URL)
      .then((gltf) => {
        katanaScene = gltf.scene;
      })
      .catch((e) => {
        console.warn("[Samurai] katana GLB yüklenemedi:", KATANA_URL, e);
      })
      .finally(() => {
        katanaLoading = null;
      });
  }
  void katanaLoading.then(() => {
    if (katanaScene) onReady(katanaScene);
  });
}

/* ───────────────────────────── kemikler ───────────────────────────── */

export interface SamuraiRig {
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
 * İsme göre ikinci ulti kemikleri. Mixamo riglerde üst kol "LeftArm /
 * RightArm" (upperarm DEĞİL) olur — eski kod "upperarm" aradığı için
 * samurayda kollar hiç bulunamıyordu, animasyon da oynuyordu.
 */
export function findSamuraiRig(clone: THREE.Object3D): SamuraiRig {
  const rig: SamuraiRig = {
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

/* ────────────────────────────── katana ───────────────────────────── */

export interface SamuraiKatana {
  hand: THREE.Object3D;
  grip: THREE.Group;
  /** Bıçağın EL-LOKAL ekseni (kalibrasyonda ölçülür). */
  bladeAxis: THREE.Vector3;
  /** Eldeki hazır Idle pozuna göre sap/kılıç hizasını bir kez ölçer. */
  calibrate: () => void;
  dispose: () => void;
}

/** Katanayı sağ ele bağlar (yoksa null — rig okunamadı). */
export function attachSamuraiKatana(
  clone: THREE.Object3D,
  rig: SamuraiRig,
): SamuraiKatana | null {
  const hand = rig.rightHand;
  if (!hand) return null;
  clone.updateWorldMatrix(true, true);
  // Samuray meshinde parmak geometrisi var; bone döndürmesi yetiyor
  // (kraliyet zırhındaki gibi ekstra parmak meshleri burada blob yapar).
  applyFingerGrip(clone);

  // Savaş alanında karakter 0.575 kök ölçeğiyle küçültülüyor; kılıcı
  // karakterin GERÇEK dünya boyuna göre ölçekleyip oranı koruyoruz.
  const fighterHeight = Math.max(
    new THREE.Box3().setFromObject(clone).getSize(new THREE.Vector3()).y,
    1e-4,
  );
  const targetWorldLen = SWORD_TARGET_WORLD_LEN * (fighterHeight / 1.92);

  const boneScale = Math.max(handBoneScale(hand), 1e-9);
  const grip = new THREE.Group();
  grip.rotation.set(...SWORD_GRIP_ROT);
  grip.position.set(...SWORD_GRIP_POS);
  grip.scale.setScalar(SWORD_GRIP_SCALE / boneScale);

  const pivot = new THREE.Group();
  pivot.position.set(...SWORD_CONTAINER_MODEL_POS);
  pivot.rotation.set(...SWORD_CONTAINER_MODEL_ROT);
  grip.add(pivot);

  const mount = (source: THREE.Object3D) => {
    pivot.clear();
    const model = SkeletonUtils.clone(source);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const length = Math.max(size.y, size.x, size.z, 1e-4);
    const chain = grip.scale.x * boneScale * pivot.scale.x || 1;
    model.scale.setScalar(targetWorldLen / (length * chain));
    model.position.set(0, 0, 0);
    model.rotation.y += Math.PI / 4;
    model.traverse((o) => {
      o.userData.isEquipment = true;
      o.frustumCulled = false;
    });
    pivot.add(model);
  };

  mount(buildStructuralSword()); // anında elde kılıç, GLB gelince değişir
  loadKatana((scene) => mount(scene));

  grip.userData.isEquipment = true;
  grip.traverse((o) => {
    o.userData.isEquipment = true;
    o.frustumCulled = false;
  });
  hand.add(grip);

  const bladeAxis = new THREE.Vector3(0, 1, 0);
  const calibrate = () => {
    clone.updateWorldMatrix(true, true);
    // Hazır Idle pozu: sap avuçta, bıçak dik (HandGrip ile aynı ölçüm).
    calibrateSwordGrip(hand, grip);
    hand.updateWorldMatrix(true, true);
    // Bbox alt nesneleri de gezdiği için tüm alt ağaç güncel olmalı.
    pivot.updateWorldMatrix(true, true);
    // Bıçak eksenini ÖLÇ: saptan EN UZAK tepe vertex'i = uç yönü.
    const hilt = hand.worldToLocal(grip.getWorldPosition(new THREE.Vector3()));
    const vertex = new THREE.Vector3();
    let bestDist = 0;
    const tipDir = new THREE.Vector3();
    pivot.traverse((o) => {
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
    if (bestDist > 1e-6) bladeAxis.copy(tipDir);
  };

  return {
    hand,
    grip,
    bladeAxis,
    calibrate,
    dispose: () => {
      grip.removeFromParent();
      pivot.clear();
    },
  };
}

/* ─────────────────────────── poz yardımcıları ─────────────────────── */

const _identity = new THREE.Quaternion();

/**
 * Bone'un `axis` (bone-lokal) eksenini `targetWorld` yönüne çevirir; mirror
 * eksen tahminine gerek kalmaz. `weight` 0..1 arası yumuşak geçiş sağlar.
 * Mixer animasyonu her karede kemikleri sıfırladığı için bu ofset üstüne
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

/** Karakterin baktığı yön (dünya uzayı). Omuz çizgisinin dik izdüşümü
 *  rig yaw'ından bağımsızdır: sol omuz − sağ omuz = karakterin solu. */
function worldForward(rig: SamuraiRig, facing: number): THREE.Vector3 {
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

export interface SamuraiSlamOptions {
  rig: SamuraiRig;
  katana: SamuraiKatana | null;
  /** 0..1 — 2. ulti süresinin oranı (vuruş anı ≈ 0.62). */
  progress: number;
  /** +1 sağa (+X), -1 sola bakan karakter. */
  facing: number;
  active: boolean;
}

/**
 * İki elli kılıç yere vurma pozu:
 *   0 → 0.40 hazırlık: kollar baş üstüne, bıçak geriye
 *   0.40 → 0.62 vuruş: kollar öne-aşağı, bıçak yere saplanır
 *   0.62 → 1.00 toparlanma
 * Sol kol katananın sapına doğrultulur → gerçekten iki elle tutuyor görünür.
 */
export function applySamuraiSlamPose(opts: SamuraiSlamOptions): void {
  const { rig, katana, progress, facing, active } = opts;
  if (!active) return;
  const u = Math.min(1, Math.max(0, progress));
  const weight =
    smoothstep(0, 0.06, u) * (1 - smoothstep(0.88, 1, u)) * 1.0;
  if (weight <= 0.001) return;

  const up = new THREE.Vector3(0, 1, 0);
  // Karakterin GERÇEK yönü: omuz ekseninden türetilir (rig yaw'ı 0 iken
  // bile doğru). Omuzlar yoksa facing'e düşülür.
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

  // Sağ kol kılıcı kaldırıp indirir.
  aimBone(rig.rightUpper, up, armDir, weight);
  aimBone(rig.rightFore, up, armDir, weight * 0.9);
  if (katana) aimBone(rig.rightHand, katana.bladeAxis, bladeDir, weight);

  // Gövde: hazırlıkta geriye, vuruşta öne.
  aimBone(rig.spine, up, up.clone().addScaledVector(fwd, lean).normalize(), weight * 0.75);

  // Sol el: sapın dünya konumuna doğrult (iki elle tutuş).
  katana?.grip.updateWorldMatrix(true, false);
  const hilt = katana ? katana.grip.getWorldPosition(new THREE.Vector3()) : null;
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
