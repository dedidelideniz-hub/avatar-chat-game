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
 * All numbers marked MEASURED come from headless parsing of
 * public/models/skin-savasci.glb (live Idle clip, t = 1.0s) — not guesses.
 */

/* ── MEASURED grip constants ────────────────────────────────────── */

/** Right-hand bone local axes at idle, expressed in world space:
 *   +X = (0.96, 0.11, 0.25) forward/outward, +Y = (0.18, −0.94, −0.30)
 *   DOWN the fingers, +Z = (0.20, 0.33, −0.92) up-back. */
export const HAND_AXES = {
  up: [-0.9405, -0.0359, 0.338], // world UP expressed in hand-local space
} as const;

/** Palm center = average of the five finger-base bones, hand-local units. */
export const PALM_CENTER: [number, number, number] = [-0.54, 11.58, -0.81];

/** Sword-local position that puts the grip INSIDE the fist. */
export const SWORD_GRIP_POS: [number, number, number] = [0.32, 11.6, -1.12];

/** Euler mapping the sword's +Y blade axis onto the hand-local world-UP
 *  axis — the blade reads vertical while the character stands. */
export const SWORD_GRIP_ROT: [number, number, number] = [0.3662, 0.336, 1.4832];

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

/* ── Finger grip (closed fist) ──────────────────────────────────── */

/** Rest rotations per finger bone, captured the first time we pose it.
 *  Resetting to rest before applying keeps the pose idempotent even when
 *  the gear effect re-runs (equip changes, GLB swap, …). */
const fingerRest = new WeakMap<THREE.Object3D, THREE.Euler>();

const FINGER_BONES = [
  "mixamorigRightHandThumb1", "mixamorigRightHandThumb2", "mixamorigRightHandThumb3",
  "mixamorigRightHandIndex1", "mixamorigRightHandIndex2", "mixamorigRightHandIndex3",
  "mixamorigRightHandMiddle1", "mixamorigRightHandMiddle2", "mixamorigRightHandMiddle3",
  "mixamorigRightHandRing1", "mixamorigRightHandRing2", "mixamorigRightHandRing3",
  "mixamorigRightHandPinky1", "mixamorigRightHandPinky2",
];

/**
 * Adds a subtle closed-grip pose on top of the authored animation so the
 * hand reads as "holding" the sword. Idempotent: safe to call on every
 * gear attach. Never touches the mixer/clips.
 */
export function applyFingerGrip(clone: THREE.Object3D): void {
  for (const name of FINGER_BONES) {
    const bone = clone.getObjectByName(name);
    if (!bone) continue;
    let rest = fingerRest.get(bone);
    if (!rest) {
      rest = bone.rotation.clone();
      fingerRest.set(bone, rest);
    }
    // Reset to rest, then apply the closed pose from a clean base.
    bone.rotation.copy(rest);
    const isThumb = name.toLowerCase().includes("thumb");
    const phalanx = name.endsWith("1") ? 0.16 : 0.22;
    const amount = isThumb ? 0.18 : phalanx;
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
 * Marks every right-hand joint with a small colored sphere so the grip
 * math can be verified in-game. Enabled only with ?handDebug=1 in the URL.
 * Colors: red = RightHand origin, yellow = thumb chain, cyan = fingers,
 * magenta = palm center (where the sword grip should sit).
 * Returns null when the debug flag is off.
 */
export function markHandJoints(clone: THREE.Object3D): THREE.Group | null {
  if (typeof window === "undefined") return null;
  if (!new URLSearchParams(window.location.search).has("handDebug")) return null;

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

  const hand = clone.getObjectByName("mixamorigRightHand");
  if (hand) mark(hand, "#ff3355", 0.02);
  for (const name of FINGER_BONES) {
    const bone = clone.getObjectByName(name);
    if (!bone) continue;
    mark(bone, name.includes("Thumb") ? "#ffd23c" : "#39c6ff", 0.011);
  }
  if (hand) {
    // Palm center marker (magenta) — where the grip band should land.
    const palm = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshBasicMaterial({ color: "#ff3ce0", depthWrite: false }),
    );
    palm.scale.setScalar(0.025 / handBoneScale(hand));
    palm.position.set(...PALM_CENTER);
    palm.userData.isEquipment = true;
    palm.frustumCulled = false;
    hand.add(palm);
  }
  return group;
}
