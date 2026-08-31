import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader, SkeletonUtils } from "three-stdlib";
import { DRACOLoader } from "three-stdlib";
import {
  equipMat,
  findBone as findBoneRegistry,
  getEquipmentDef,
} from "./EquipmentRegistry";
import {
  SWORD_GRIP_POS,
  SWORD_GRIP_ROT,
  SWORD_TARGET_WORLD_LEN,
  SWORD_GRIP_BAND_MODEL_Y,
  applyFingerGrip,
  buildFingerMeshes,
  buildStructuralSword,
  calibrateSwordGrip,
  handBoneScale,
  markHandJoints,
} from "./HandGrip";

/* ── Kraliyet Savaşçısı — visual-only effects ─────────────────── */
/* Keyed to the Kraliyet Savaşçısı skin. Procedural royal pieces are
 * attached to the SKIN'S OWN skeleton via the existing bone aliases —
 * no inventory, shop, multiplayer or Convex changes. Real purchased
 * items in the same slot take priority (no double crown / sword).
 *
 * Everything here is presentation only: gear attach + spawn sparkles
 * + shine pulse + walking smoke trail. The hook returns the refs the
 * core avatar needs to drive the pooled effects from its own frame
 * loop, plus the `isWarriorSkin` flag. */

const ROYAL_SKIN_URLS = new Set([
  "/models/moda-savasci.glb", // legacy royal path
  "/models/skin-savasci.glb", // royal warrior
]);

/** CC0 kraliyet kılıcı (Sword606 — cc0gameassets lowpoly pack, public domain). */
const ROYAL_SWORD_URL = "/models/royal-kilic.glb";

/** Draco decoder lives in public/draco (royal-kilic.glb is Draco-compressed). */
const royalSwordLoader = (() => {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("/draco/");
  loader.setDRACOLoader(draco);
  return loader;
})();

/** Loaded royal-sword scene cache + in-flight loads (non-React). */
const royalSwordCache = new Map<string, THREE.Object3D>();
const royalSwordLoading = new Map<string, Promise<void>>();

export const isRoyalWarriorSkin = (skinUrl: string | null) =>
  skinUrl != null && ROYAL_SKIN_URLS.has(skinUrl);

interface RoyalGearRefs {
  /** Pooled spawn sparkles (launched once, self-fading). */
  royalSparks: React.MutableRefObject<THREE.Mesh[]>;
  /** Set true by the core once the spawn flash mesh exists. */
  flashReady: React.MutableRefObject<boolean>;
  /** Materials sharing the crown/blade shine shimmer. */
  royalGlowMats: React.MutableRefObject<THREE.MeshStandardMaterial[]>;
  /** The royal sword group (the grip carrier; calibrated at rest). */
  royalSword: React.MutableRefObject<THREE.Group | null>;
  /** The MAIN_HAND bone the sword hangs on (for grip calibration). */
  royalHandBone: React.MutableRefObject<THREE.Object3D | null>;
  /** True once the grip has been calibrated from the live idle pose. */
  gripCalibrated: React.MutableRefObject<boolean>;
  /** Tip-glow materials flaring with the flourish accent. */
  royalTipMats: React.MutableRefObject<THREE.MeshStandardMaterial[]>;
}

/**
 * Attaches the royal identity gear and pooled effect meshes to the
 * clone. Returns a cleanup function (standard useEffect contract).
 */
function useRoyalGear(
  clone: THREE.Object3D,
  royalSkin: boolean,
  equipped: string[],
  modelHeight: number,
  innerRef: React.RefObject<THREE.Group | null>,
  flashRef: React.RefObject<THREE.Mesh | null>,
  refs: RoyalGearRefs,
  swordTick: number,
  onSwordReady: () => void,
) {
  useEffect(() => {
    if (!royalSkin || !clone) return;
    clone.updateWorldMatrix(true, true);
    const rootWs = clone.getWorldScale(new THREE.Vector3());
    const expected = (rootWs.x + rootWs.y + rootWs.z) / 3 || 1;
    const boneWs = new THREE.Vector3();
    const attached: THREE.Object3D[] = [];
    // Skip a slot when a real purchased item already uses it.
    const hasRealSlot = (slot: string) =>
      equipped.some((id) => getEquipmentDef(id)?.slot === slot);

    // Same bone-scale compensation the equipment system uses.
    const fitToBone = (bone: THREE.Object3D, item: THREE.Object3D) => {
      bone.getWorldScale(boneWs);
      const boneAvg = (boneWs.x + boneWs.y + boneWs.z) / 3;
      const ratio = boneAvg > 1e-6 ? expected / boneAvg : 1;
      if (ratio > 2 || ratio < 0.5) item.scale.setScalar(ratio);
      item.userData.isEquipment = true;
      item.traverse((o) => {
        o.userData.isEquipment = true;
        o.frustumCulled = false;
      });
      bone.add(item);
      attached.push(item);
    };

    const H = modelHeight;
    const gold = "#e8b53a";
    const goldDeep = "#c8932a";
    const mat = equipMat;

    // ── Altın taç (HEAD bone) ──
    if (!hasRealSlot("HEAD")) {
      const head = findBoneRegistry(clone, "HEAD");
      if (head) {
        const crown = new THREE.Group();
        // Shared glow materials — pulsed together in the shine loop below.
        const bandMat = mat(gold, { metalness: 0.85, roughness: 0.22, emissive: "#b07d18", emissiveIntensity: 0.35 });
        const spikeMat = mat(gold, { metalness: 0.85, roughness: 0.2, emissive: "#c09332", emissiveIntensity: 0.35 });
        refs.royalGlowMats.current.push(bandMat as THREE.MeshStandardMaterial, spikeMat as THREE.MeshStandardMaterial);
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(0.115 * H, 0.016 * H, 8, 22),
          bandMat,
        );
        band.rotation.x = Math.PI / 2;
        crown.add(band);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const spike = new THREE.Mesh(
            new THREE.ConeGeometry(0.022 * H, 0.06 * H, 6),
            spikeMat,
          );
          spike.position.set(Math.cos(a) * 0.1 * H, 0.045 * H, Math.sin(a) * 0.1 * H);
          crown.add(spike);
        }
        const jewel = new THREE.Mesh(
          new THREE.SphereGeometry(0.02 * H, 10, 8),
          mat("#e34b3f", { roughness: 0.25, emissive: "#8a1f16", emissiveIntensity: 0.5 }),
        );
        jewel.position.set(0, 0.09 * H, 0);
        crown.add(jewel);
        refs.royalGlowMats.current.push(jewel.material as THREE.MeshStandardMaterial);
        crown.position.y = 0.045 * H;
        fitToBone(head, crown);
      }
    }

    // ── Altın omuz zırhları (CHEST bone, ±X) ──
    const chest = findBoneRegistry(clone, "CHEST");
    if (chest) {
      for (const side of [-1, 1]) {
        const pad = new THREE.Mesh(
          new THREE.SphereGeometry(0.052 * H, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
          mat(gold, { metalness: 0.8, roughness: 0.28 }),
        );
        pad.position.set(side * 0.115 * H, 0.115 * H, 0);
        fitToBone(chest, pad);
      }
    }

    // ── Kraliyet kılıcı (MAIN_HAND bone) ──
    if (!hasRealSlot("HAND") && !hasRealSlot("MAIN_HAND")) {
      const hand = findBoneRegistry(clone, "MAIN_HAND");
      if (hand) {
        // Closed-fist pose (idempotent, lives in HandGrip.ts) so the hand
        // reads as "holding" the sword. Animation/mixer untouched.
        applyFingerGrip(clone);
        // Structural finger meshes: the skin's hand has no modeled finger
        // geometry, so bones alone moved nothing visible. These follow the
        // bone chain and render a real gripping fist around the hilt.
        attached.push(...buildFingerMeshes(clone));
        // Optional joint debug: ?handDebug=1 (sticky via localStorage).
        const debugMarkers = markHandJoints(clone);
        if (debugMarkers) attached.push(debugMarkers);
        // ── Sword attach: GLB when ready, structural fallback INSTANTLY ──
        // The structural model shares the GLB's model space (length 1.14,
        // hilt center at modelY 0.12), so the grip code is identical and
        // the swap is seamless. First equip always shows a sword.
        const sword = new THREE.Group();
        sword.rotation.set(...SWORD_GRIP_ROT);
        sword.position.set(...SWORD_GRIP_POS);
        const pivot = new THREE.Group();
        sword.add(pivot);
        const attachSwordModel = (source: THREE.Object3D) => {
          const model = SkeletonUtils.clone(source);
          model.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const length = Math.max(size.y, 1e-4);
          // Chain: model(x1) → pivot(x1) → sword(x1) → hand bone(boneAvg).
          // NO fitToBone here — double compensation made a giant sword.
          const itemScale = SWORD_TARGET_WORLD_LEN / (length * handBoneScale(hand));
          model.scale.setScalar(itemScale);
          // Hilt center (modelY = 0.12) lands exactly on the sword origin.
          model.position.y = -SWORD_GRIP_BAND_MODEL_Y * itemScale;
          model.traverse((o: THREE.Object3D) => {
            o.userData.isEquipment = true;
            o.frustumCulled = false;
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh) mesh.renderOrder = 999;
          });
          pivot.add(model);
          attached.push(model);
        };
        const url = ROYAL_SWORD_URL;
        const cached = royalSwordCache.get(url);
        if (cached) {
          attachSwordModel(cached);
        } else {
          // Instant structural sword — never an empty hand.
          attachSwordModel(buildStructuralSword());
          if (!royalSwordLoading.has(url)) {
            const promise = royalSwordLoader.loadAsync(url)
              .then((gltf) => {
                royalSwordCache.set(url, gltf.scene);
                royalSwordLoading.delete(url);
                onSwordReady(); // re-run the gear effect → swap to the GLB
              })
              .catch((e) => {
                console.warn("[Royal] sword GLB load failed:", url, e);
                royalSwordLoading.delete(url);
              });
            royalSwordLoading.set(url, promise);
          }
        }
        sword.scale.setScalar(1);
        sword.userData.isEquipment = true;
        sword.traverse((o) => { o.userData.isEquipment = true; o.frustumCulled = false; });
        hand.add(sword);
        attached.push(sword);
        refs.royalSword.current = sword;
        refs.royalHandBone.current = hand;
        refs.gripCalibrated.current = false;
      }
    }

    // ── Altın spawn sparkles (kısa ömürlü, havuzlu) + altın halka ──
    if (innerRef.current) {
      const sparkMat = new THREE.MeshBasicMaterial({
        color: "#ffd166",
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      const sparks = Array.from({ length: 6 }, () => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), sparkMat.clone());
        s.visible = false;
        innerRef.current!.add(s);
        return s;
      });
      refs.royalSparks.current = sparks;
      if (flashRef.current) {
        (flashRef.current.material as THREE.MeshBasicMaterial).color.set("#ffd166");
      }
      return () => {
        sparks.forEach((s) => {
          s.geometry.dispose();
          (s.material as THREE.Material).dispose();
          s.removeFromParent();
        });
        sparkMat.dispose();
        attached.forEach((a) => a.removeFromParent());
        refs.royalSparks.current = [];
        refs.flashReady.current = false;
        refs.royalHandBone.current = null;
        refs.gripCalibrated.current = false;
        refs.royalGlowMats.current = [];
        refs.royalTipMats.current = [];
        refs.royalSword.current = null;
      };
    }
    return () => {
      attached.forEach((a) => a.removeFromParent());
      refs.royalHandBone.current = null;
      refs.gripCalibrated.current = false;
      refs.royalGlowMats.current = [];
      refs.royalTipMats.current = [];
      refs.royalSword.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clone, royalSkin, equipped, modelHeight, swordTick]);
}

interface RoyalTrailRefs {
  warriorSmoke: React.MutableRefObject<THREE.Mesh[]>;
  warriorSmokeClock: React.MutableRefObject<number>;
}

/** Pooled smoke-trail meshes for the warrior's walk. */
function useWarriorTrail(
  isWarriorSkin: boolean,
  innerRef: React.RefObject<THREE.Group | null>,
  refs: RoyalTrailRefs,
) {
  useEffect(() => {
    if (!isWarriorSkin || !innerRef.current) return;
    const smokeMat = new THREE.MeshBasicMaterial({
      color: "#111827",
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const puffs = Array.from({ length: 5 }, () => {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 5), smokeMat.clone());
      puff.visible = false;
      innerRef.current!.add(puff);
      refs.warriorSmoke.current.push(puff);
      return puff;
    });
    return () => {
      puffs.forEach((puff) => puff.removeFromParent());
      refs.warriorSmoke.current = [];
      smokeMat.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWarriorSkin]);
}

/**
 * All Kraliyet Savaşçısı visual effects. Call from the avatar core with
 * the clone, skin URL, equipped list, model height and the inner group /
 * spawn-flash refs. Drives its own useFrame loops (sparkle launch+fade,
 * shine shimmer, idle sword flourish) and returns the smoke-trail refs so
 * the core's movement frame loop can emit puffs while walking.
 */
export function useRoyalWarriorEffects(
  clone: THREE.Object3D,
  skinUrl: string | null,
  equipped: string[],
  modelHeight: number,
  innerRef: React.RefObject<THREE.Group | null>,
  flashRef: React.RefObject<THREE.Mesh | null>,
  movingRef: React.MutableRefObject<boolean>,
) {
  const royalSkin = isRoyalWarriorSkin(skinUrl);
  const royalSparks = useRef<THREE.Mesh[]>([]);
  const royalSparksLaunched = useRef(false);
  const royalGlowMats = useRef<THREE.MeshStandardMaterial[]>([]);
  const royalTipMats = useRef<THREE.MeshStandardMaterial[]>([]);
  const royalSword = useRef<THREE.Group | null>(null);
  const handBone = useRef<THREE.Object3D | null>(null);
  const warriorSmoke = useRef<THREE.Mesh[]>([]);
  const warriorSmokeClock = useRef(0);
  // Base emissive per glow material so the shimmer never drifts.
  const baseEmissive = useRef(new Map<THREE.MeshStandardMaterial, number>());
  // Bumped when the sword GLB finishes loading → gear effect re-runs and
  // swaps the instant structural sword for the detailed GLB. This fixes
  // "sword only appears after unequip/re-equip": the first attach no
  // longer depends on a load that resolves AFTER the effect cleanup.
  const [swordTick, setSwordTick] = useState(0);
  const onSwordReady = useCallback(() => setSwordTick((t) => t + 1), []);
  // Grip calibration state: the sword orientation is locked to the hand's
  // LIVE idle pose once (blade vertical, crossguard horizontal), then stays
  // fixed in hand-local space so the arm swings naturally while walking.
  const gripCalibrated = useRef(false);
  const calibWait = useRef(0);

  useRoyalGear(clone, royalSkin, equipped, modelHeight, innerRef, flashRef, {
    royalSparks,
    flashReady: royalSparksLaunched,
    royalGlowMats,
    royalTipMats,
    royalSword,
    royalHandBone: handBone,
    gripCalibrated,
  }, swordTick, onSwordReady);

  useWarriorTrail(royalSkin, innerRef, { warriorSmoke, warriorSmokeClock });

  // Gold sparkles: launch once on mount, fade out within ~0.7s. Idle after.
  useFrame((_, dt) => {
    if (!royalSparksLaunched.current && flashRef.current && royalSparks.current.length) {
      royalSparksLaunched.current = true;
      for (const s of royalSparks.current) {
        s.visible = true;
        s.position.set((Math.random() - 0.5) * 0.2, 0.12 + Math.random() * 0.14, (Math.random() - 0.5) * 0.2);
        s.userData.vx = (Math.random() - 0.5) * 0.25;
        s.userData.vy = 0.35 + Math.random() * 0.25;
        s.userData.vz = (Math.random() - 0.5) * 0.25;
        s.userData.age = 0;
      }
    }
    for (const s of royalSparks.current) {
      if (!s.visible) continue;
      s.userData.age += dt;
      s.position.x += s.userData.vx * dt;
      s.position.y += s.userData.vy * dt;
      s.position.z += s.userData.vz * dt;
      (s.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - s.userData.age / 0.7));
      if (s.userData.age >= 0.7) s.visible = false;
    }
  });

  // ── Crown/blade SHIMMER (always on) + idle sword FLOURISH (idle only) ──
  // Shimmer: a bright sweep travels around the crown band / up the blade so
  // the glow is clearly visible (the old flat pulse was too subtle).
  // Flourish: ONLY while the character stands still, the sword performs a
  // slow elegant twirl + tilt, then settles back exactly to its rest pose.
  useFrame(({ clock }, dt) => {
    if (!royalSkin) return;
    const t = clock.getElapsedTime();

    // Seed each material's authored base intensity (new materials after a
    // re-equip get picked up here too, so the shimmer never drifts).
    for (const m of royalGlowMats.current) {
      if (!baseEmissive.current.has(m)) baseEmissive.current.set(m, m.emissiveIntensity);
    }
    for (const m of royalTipMats.current) {
      if (!baseEmissive.current.has(m)) baseEmissive.current.set(m, m.emissiveIntensity);
    }

    // Shimmer sweep, staggered per material so the light appears to travel.
    const sweep = (phase: number) => {
      const w = 0.5 + 0.5 * Math.sin(t * 2.2 - phase);
      return w * w * w; // sharpen the peak so the glint reads clearly
    };
    const baseOf = (m: THREE.MeshStandardMaterial) => baseEmissive.current.get(m) ?? 0.35;
    for (const m of royalGlowMats.current) {
      const base = baseOf(m);
      m.emissiveIntensity = base + 2.6 * sweep(0) + 1.6 * sweep(1.3);
    }
    for (const m of royalTipMats.current) {
      const base = baseOf(m);
      m.emissiveIntensity = base + 2.4 * sweep(0.6);
    }

    // ── Sword grip calibration ──
    // Once, on the first STATIONARY frame after the idle animation has
    // settled (0.6s covers the idle fadeIn): lock the sword so the blade
    // is vertical and the crossguard horizontal. After that the grip is
    // fixed in hand-local space — the sword swings naturally with the arm
    // while walking and returns to vertical at rest. This replaces the
    // old baked-only constants and works for ANY skin rig.
    const swordG = royalSword.current;
    const handB = handBone.current;
    if (swordG && handB && !gripCalibrated.current) {
      calibWait.current += dt;
      if (calibWait.current > 0.6 && !movingRef.current) {
        calibrateSwordGrip(handB, swordG);
        gripCalibrated.current = true;
      }
    }
  });

  return { royalSkin, warriorSmoke, warriorSmokeClock };
}

/** Emit one pooled smoke puff (called from the core's movement loop). */
export function emitWarriorPuff(
  smoke: React.MutableRefObject<THREE.Mesh[]>,
  clock: React.MutableRefObject<number>,
  dt: number,
) {
  clock.current += dt;
  if (clock.current > 0.09) {
    clock.current = 0;
    const puff = smoke.current.find((item) => !item.visible) ?? smoke.current[0];
    if (puff) {
      puff.visible = true;
      puff.position.set(0, -0.72, 0.12);
      puff.scale.setScalar(0.55);
      (puff.material as THREE.MeshBasicMaterial).opacity = 0.3;
      puff.userData.smokeAge = 0;
    }
  }
}

/** Advance all live smoke puffs (called from the core's movement loop). */
export function advanceWarriorPuffs(
  smoke: React.MutableRefObject<THREE.Mesh[]>,
  dt: number,
) {
  for (const puff of smoke.current) {
    if (!puff.visible) continue;
    const age = (puff.userData.smokeAge ?? 0) + dt;
    puff.userData.smokeAge = age;
    puff.position.y += dt * 0.18;
    puff.scale.addScalar(dt * 0.35);
    (puff.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.3 * (1 - age / 0.55));
    if (age >= 0.55) puff.visible = false;
  }
}
