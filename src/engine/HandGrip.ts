import * as THREE from "three";

/* ── Hand grip module — Kraliyet Savaşçısı right hand ───────────── */
/* Everything about "how the royal sword sits in the right hand" lives
 * here, separate from the effect layer:
 *
 *   • GRIP                  measured constants (palm center, grip rotation)
 *   • applyFingerGrip       closed-fist pose on the right-hand finger chain
 *   • buildStructuralSword  procedural sword (instant fallback while the
 *                           Draco GLB loads — also the offline safety net)
 *   • markHandJoints        ?handDebug=1 debug markers on every joint
 *   • handBoneScale         avg world scale of a bone (for size math)
 *
 * All numbers marked MEASURED come from headless parsing of the skin
 * GLB the game renders (moda-savasci.glb; live Idle clip, t = 1.0s) —
 * not guesses. Runtime calibration (calibrateSwordGrip) re-derives the
 * grip from the live hand pose anyway, so these constants only seed the
 * very first frames before calibration lands.
 */

/* ── Kılıç KAPSAYICI GRUP ayarları (ince ayar) ──────────────────── */

/**
 * Kılıç GLB'nin origin'i saptta OLMADIĞI için kılıç doğrudan el bone'una
 * değil, bone'a bağlı boş bir kapsayıcı grup içine ekleniyor. Bu sabitler
 * kapsayıcı İÇİNDEKİ model offset'leridir — ince ayar için TEK yer.
 */
export const SWORD_CONTAINER_MODEL_POS: [number, number, number] = [0, -0.2, 0]; // sapı ele oturt
export const SWORD_CONTAINER_MODEL_ROT: [number, number, number] = [Math.PI / 2, 0, 0]; // ucu yukarı/ileri
export const SWORD_CONTAINER_MODEL_SCALE = 0.5; // el boyutuna uygun küçültme

/* ── MEASURED grip constants ────────────────────────────────────── */

/** Right-hand bone local axes at IDLE, expressed in world space —
 *  MEASURED on moda-savasci.glb (Idle @ t = 1.0):
 *   +X = (−0.157, 0.315, 0.936), +Y = (−0.181, −0.941, 0.286) fingers
 *   DOWN, +Z = (0.971, −0.125, 0.204). */
export const HAND_AXES = {
  up: [0.315, -0.941, -0.125], // world UP in hand-local (MEASURED: moda-savasci.glb)
} as const;

/** Palm center = average of the finger-base bones, hand-local units.
 *  MEASURED on moda-savasci.glb: (0, 13.24, 0) — that rig carries only
 *  an Index chain, straight along +Y from the wrist. */
export const PALM_CENTER: [number, number, number] = [0, 13.24, 0]; // MEASURED: moda-savasci.glb

/** Sword origin = FIST CENTER (slightly below the knuckle line, 0.95×
 *  palm Y). The sword model's hilt band (modelY = 0.12) is translated
 *  onto this origin, so the grip sits INSIDE the fist. */
// Fine-tuning controls for the royal sword. Keep these isolated so the
// attachment pipeline and animation code never need to change.
export const SWORD_GRIP_POS: [number, number, number] = [0, 11.72, 0]; // measured hand-space palm center

/** Euler mapping the sword's +Y blade axis to WORLD-UP at idle and the
 *  crossguard (+X) horizontal — MEASURED for moda-savasci.glb, verified
 *  (blade → (0,1,0), crossguard → (1,0,0) in world space). The previous
 *  value was measured on a DIFFERENT skin file and put the blade 107.7°
 *  off vertical (the sideways, unreadable "stick" look). */
export const SWORD_GRIP_ROT: [number, number, number] = [-0.9509, 1.2112, -2.032]; // MEASURED: moda-savasci.glb
export const SWORD_GRIP_SCALE = 0.68; // keep the blade readable beside the hand

/** Target sword length in WORLD units (character height ≈ 1.92). */
export const SWORD_TARGET_WORLD_LEN = 0.85;

/** Grip-band center along the sword model's +Y (both GLB and structural
 *  models are built so the hilt middle sits at modelY = 0.12). */
export const SWORD_GRIP_BAND_MODEL_Y = 0.12;

/* ── Helpers ────────────────────────────────────────────────────── */

/** Average world scale of a bone — the chain multiplier for size math. */
export function handBoneScale(bone: THREE.Object3D): number {
  bone.updateWorldMatrix(true, false);
  const ws = bone.getWorldScale(new THREE.Vector3());
  return (ws.x + ws.y + ws.z) / 3 || 1e-6;
}

/* ── Live grip calibration (rig-independent) ─────────────────────── */

/** Pure-rotation world quaternion of a bone. Rig nodes bake scale into
 *  matrixWorld, so the quaternion must be extracted from NORMALIZED
 *  basis columns (a raw setFromRotationMatrix is wrong otherwise). */
export function handWorldQuat(hand: THREE.Object3D): THREE.Quaternion {
  hand.updateWorldMatrix(true, false);
  const m = hand.matrixWorld;
  const rm = new THREE.Matrix4().makeBasis(
    new THREE.Vector3().setFromMatrixColumn(m, 0).normalize(),
    new THREE.Vector3().setFromMatrixColumn(m, 1).normalize(),
    new THREE.Vector3().setFromMatrixColumn(m, 2).normalize(),
  );
  return new THREE.Quaternion().setFromRotationMatrix(rm);
}

/** The right-hand BONE of a clone, suffix-tolerant: plain Mixamo names
 *  ("mixamorigRightHand") and suffixed exports
 *  ("mixamorigRightHand_021") both resolve. */
export function rightHandBone(clone: THREE.Object3D): THREE.Object3D | null {
  let hand: THREE.Object3D | null = null;
  clone.traverse((o) => {
    if (hand || !(o as THREE.Bone).isBone) return;
    const n = o.name.toLowerCase();
    if (
      n === "mixamorigrighthand" ||
      (n.startsWith("mixamorigrighthand") && !/thumb|index|middle|ring|pinky/.test(n))
    ) {
      hand = o;
    }
  });
  return hand;
}

/** Suffix-tolerant finger-joint bones under one hand bone. End joints
 *  ("…_end") are excluded — they carry no geometry. */
export function fingerBonesOf(hand: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  hand.traverse((o) => {
    if (o === hand || !(o as THREE.Bone).isBone) return;
    if (/thumb|index|middle|ring|pinky/i.test(o.name) && !/_?end$/i.test(o.name)) out.push(o);
  });
  return out;
}

/** Phalanx index of a (possibly suffixed) finger bone name: 1–4, else 1. */
function phalanxOf(name: string): number {
  const m = name.match(/(\d)(?:_|$)/);
  return m ? Number(m[1]) : 1;
}

/** Live palm center from THIS rig's finger-base bones (falls back to
 *  the baked MEASURED constant when the rig exposes none). */
export function palmCenterLocal(hand: THREE.Object3D): THREE.Vector3 {
  const bases = hand.children.filter(
    (c) =>
      (c as THREE.Bone).isBone &&
      /thumb|index|middle|ring|pinky/i.test(c.name) &&
      !/_?end$/i.test(c.name),
  );
  if (!bases.length) return new THREE.Vector3(...PALM_CENTER);
  const avg = bases
    .reduce((v, b) => v.add(b.position), new THREE.Vector3())
    .divideScalar(bases.length);
  avg.y *= 0.95; // fist center sits just below the knuckle line
  return avg;
}

/**
 * Calibrate the sword grip from the hand's LIVE pose: blade vertical,
 * crossguard horizontal, hilt inside the fist. Called ONCE on the first
 * stationary frame (after the idle animation has settled); the grip then
 * stays FIXED in hand-local space, so the sword swings naturally with
 * the arm while walking and returns to vertical at rest. Works for any
 * rig — no baked per-file constants involved.
 */
export function calibrateSwordGrip(hand: THREE.Object3D, sword: THREE.Object3D): void {
  sword.quaternion.copy(handWorldQuat(hand).invert());
  sword.position.copy(palmCenterLocal(hand));
  sword.position.y -= 0.38;
  sword.scale.setScalar(SWORD_GRIP_SCALE);
}

/* ── Finger grip (closed fist) ──────────────────────────────────── */

/** Rest rotations per finger bone, captured the first time we pose it.
 *  Resetting to rest before applying keeps the pose idempotent even when
 *  the gear effect re-runs (equip changes, GLB swap, …). */
const fingerRest = new WeakMap<THREE.Object3D, THREE.Euler>();

/**
 * Adds a subtle closed-grip pose on top of the authored animation so the
 * hand reads as "holding" the sword. Idempotent: safe to call on every
 * gear attach. Never touches the mixer/clips. Bone lookup is
 * suffix-tolerant so rigs like moda-savasci.glb (Index1_00…) pose too.
 */
export function applyFingerGrip(clone: THREE.Object3D): void {
  const hand = rightHandBone(clone);
  if (!hand) return;
  for (const bone of fingerBonesOf(hand)) {
    let rest = fingerRest.get(bone);
    if (!rest) {
      rest = bone.rotation.clone();
      fingerRest.set(bone, rest);
    }
    // Reset to rest, then apply the closed pose from a clean base.
    bone.rotation.copy(rest);
    const isThumb = /thumb/i.test(bone.name);
    const phalanx = phalanxOf(bone.name);
    const amount = isThumb ? 0.18 : phalanx === 1 ? 0.16 : 0.22;
    bone.rotation.x += amount;
    bone.rotation.z += amount * 0.18;
  }
}

/* ── Structural sword (instant fallback / offline net) ──────────── */

/**
 * Procedural arming sword built in the SAME model space as royal-kilic.glb
 * (total length ≈ 1.14 along +Y, hilt center at modelY = 0.12) so the
 * scale math and grip code are identical for both models. The effect layer
 * attaches this synchronously on the very first equip, then swaps in the
 * GLB the moment it finishes loading.
 */
export function buildStructuralSword(): THREE.Group {
  const sword = new THREE.Group();

  const steel = new THREE.MeshStandardMaterial({
    color: "#dfe7ef", metalness: 0.92, roughness: 0.16,
    emissive: "#9fd0ff", emissiveIntensity: 0.18,
  });
  const fullerMat = new THREE.MeshStandardMaterial({
    color: "#aab6c2", metalness: 0.85, roughness: 0.3,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: "#d9a53c", metalness: 0.85, roughness: 0.25,
    emissive: "#7a5510", emissiveIntensity: 0.25,
  });
  const leatherMat = new THREE.MeshStandardMaterial({
    color: "#4a2c14", roughness: 0.85, metalness: 0.05,
  });

  // Blade: flattened diamond (4-seg cone) from the guard up to the tip.
  const bladeLen = 0.94;
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.055, bladeLen, 4), steel);
  blade.scale.z = 0.22;
  blade.rotation.y = Math.PI / 4;
  blade.position.y = 0.05 + bladeLen / 2; // starts just above the guard
  sword.add(blade);

  // Fuller: two thin darker strips on the blade faces.
  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.62, 0.004), fullerMat);
  fuller.position.y = 0.38;
  sword.add(fuller);
  const fullerBack = fuller.clone();
  fullerBack.position.z = -0.009;
  fuller.position.z = 0.009;
  sword.add(fullerBack);

  // Crossguard: wide bar + rounded quillon tips.
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.045, 0.06), goldMat);
  guard.position.y = 0.045;
  sword.add(guard);
  const quillonGeo = new THREE.SphereGeometry(0.026, 8, 6);
  const qL = new THREE.Mesh(quillonGeo, goldMat);
  qL.position.set(-0.19, 0.045, 0);
  const qR = new THREE.Mesh(quillonGeo, goldMat);
  qR.position.set(0.19, 0.045, 0);
  sword.add(qL, qR);

  // Grip: leather-wrapped handle just below the guard.
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.13, 10), leatherMat);
  grip.position.y = -0.03;
  sword.add(grip);
  // Wrap rings.
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.029, 0.006, 6, 12),
      goldMat,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.07 + i * 0.035;
    sword.add(ring);
  }

  // Pommel: disc + finial cap at the very bottom.
  const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 14), goldMat);
  pommel.position.y = -0.105;
  sword.add(pommel);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), goldMat);
  cap.position.y = -0.125;
  sword.add(cap);

  return sword;
}

/* ── Debug: hand joint markers (?handDebug=1) ───────────────────── */

/**
 * Marks every right-hand joint with a colored sphere so the grip math can
 * be verified in-game. Enabled ONLY with ?handDebug=1 in the URL — the
 * old sticky localStorage flag kept painting colored spheres on the hand
 * forever, which polluted the character look long after debugging ended.
 * Colors: red = hand origin, yellow = thumb chain, cyan = fingers,
 * magenta = palm center (where the sword grip sits).
 * Returns null when the debug flag is off.
 */
export function markHandJoints(clone: THREE.Object3D): THREE.Group | null {
  if (typeof window === "undefined") return null;
  const sp = new URLSearchParams(window.location.search);
  if (sp.get("handDebug") !== "1") return null;

  const group = new THREE.Group();
  group.name = "_handDebugMarkers";
  const mark = (bone: THREE.Object3D, color: string, radius: number) => {
    // Author size in WORLD units: scale each sphere by 1/boneWorldScale.
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshBasicMaterial({ color, depthWrite: false }),
    );
    const ws = handBoneScale(bone);
    s.scale.setScalar(radius / ws);
    s.userData.isEquipment = true;
    s.frustumCulled = false;
    bone.add(s);
  };

  const hand = rightHandBone(clone);
  if (!hand) return group;
  mark(hand, "#ff3355", 0.05);
  for (const bone of fingerBonesOf(hand)) {
    mark(bone, /thumb/i.test(bone.name) ? "#ffd23c" : "#39c6ff", 0.028);
  }
  // Palm center marker (magenta) — where the grip band should land.
  const palm = new THREE.Mesh(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshBasicMaterial({ color: "#ff3ce0", depthWrite: false }),
  );
  palm.scale.setScalar(0.06 / handBoneScale(hand));
  palm.position.copy(palmCenterLocal(hand));
  palm.userData.isEquipment = true;
  palm.frustumCulled = false;
  hand.add(palm);
  return group;
}

/* ── Structural fingers ─────────────────────────────────────────── */

/**
 * Many skin rigs ship little to no modeled finger geometry — rotating
 * the finger BONES (applyFingerGrip) then moves nothing visible, so the
 * fist never reads as "gripping". This builds simple segmented fingers
 * as meshes PARENTED TO THE BONE CHAIN: they follow every animation and
 * the closed-grip pose renders a real fist around the sword hilt.
 *
 * Segment lengths come from the rig itself (each joint's bone child
 * position), so proportions match any skeleton — suffix-tolerant lookup
 * covers rigs like moda-savasci.glb (Index1_00…) that only expose one
 * finger chain.
 *
 * Returns the created meshes (caller adds them to the cleanup list).
 */
export function buildFingerMeshes(clone: THREE.Object3D): THREE.Mesh[] {
  const hand = rightHandBone(clone);
  if (!hand) return [];
  const glove = new THREE.MeshStandardMaterial({
    color: "#6b4527", roughness: 0.75, metalness: 0.08,
  });
  const knuckle = new THREE.MeshStandardMaterial({
    color: "#7a5230", roughness: 0.7, metalness: 0.08,
  });
  const created: THREE.Mesh[] = [];

  for (const bone of fingerBonesOf(hand)) {
    // Segment length = distance to the next joint (child bone position).
    const next = bone.children.find(
      (c) => (c as THREE.Bone).isBone && !/_?end$/i.test(c.name),
    );
    const segLen = next
      ? next.position.length()
      : Math.max(bone.position.length() * 0.8, 2.0); // tip segment
    const isThumb = /thumb/i.test(bone.name);
    const phalanx = phalanxOf(bone.name);
    const radius = (isThumb ? 0.95 : 0.82) * (next ? (phalanx === 1 ? 1 : 0.9) : 0.8);

    const seg = new THREE.Mesh(
      new THREE.CapsuleGeometry(radius, Math.max(segLen - radius * 1.6, 0.4), 4, 8),
      next ? glove : knuckle,
    );
    // Bones run along local +Y (Mixamo): span from this joint toward the child.
    seg.position.y = segLen / 2;
    seg.userData.isEquipment = true;
    seg.frustumCulled = false;
    seg.renderOrder = 999;
    bone.add(seg);
    created.push(seg);
  }
  return created;
}
