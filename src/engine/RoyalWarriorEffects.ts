import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import {
  equipMat,
  findBone as findBoneRegistry,
  getEquipmentDef,
} from "./EquipmentRegistry";

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

export const isRoyalWarriorSkin = (skinUrl: string | null) =>
  skinUrl != null && ROYAL_SKIN_URLS.has(skinUrl);

interface RoyalGearRefs {
  /** Pooled spawn sparkles (launched once, self-fading). */
  royalSparks: React.MutableRefObject<THREE.Mesh[]>;
  /** Set true by the core once the spawn flash mesh exists. */
  flashReady: React.MutableRefObject<boolean>;
  /** Materials sharing the crown/blade shine shimmer. */
  royalGlowMats: React.MutableRefObject<THREE.MeshStandardMaterial[]>;
  /** The royal sword group (drives the idle flourish). */
  royalSword: React.MutableRefObject<THREE.Group | null>;
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
        // Crown sized to the MEASURED head (skin-savasci.glb, H = 1.832):
        // head half-width 0.099 raw, head top +0.144H above the head bone.
        // Band radius 0.062H ≈ 1.25× head half-width; band centered just
        // above eye level (0.096H above the head-bone origin).
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(0.062 * H, 0.009 * H, 8, 22),
          bandMat,
        );
        band.rotation.x = Math.PI / 2;
        band.position.y = 0.096 * H;
        crown.add(band);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const spike = new THREE.Mesh(
            new THREE.ConeGeometry(0.011 * H, 0.034 * H, 6),
            spikeMat,
          );
          spike.position.set(Math.cos(a) * 0.055 * H, 0.12 * H, Math.sin(a) * 0.055 * H);
          crown.add(spike);
        }
        const jewel = new THREE.Mesh(
          new THREE.SphereGeometry(0.012 * H, 10, 8),
          mat("#e34b3f", { roughness: 0.25, emissive: "#8a1f16", emissiveIntensity: 0.5 }),
        );
        // Front of the band — head-local +Z is the model's face direction
        // (measured bind axes: +Z → world −Z = front).
        jewel.position.set(0, 0.096 * H, 0.062 * H);
        crown.add(jewel);
        refs.royalGlowMats.current.push(jewel.material as THREE.MeshStandardMaterial);
        crown.position.y = 0; // height now carried by the band offset
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
        const sword = new THREE.Group();
        // ── GRIP ALIGNMENT (measured from skin-savasci.glb IDLE pose) ──
        // RightHand local axes in WORLD space while the arm hangs (the pose
        // players actually see — the bind/T-pose is never rendered):
        //   +Y = (0.25,-0.93,-0.27)  FINGERS point DOWN
        //   -Y = (-0.25, 0.93, 0.27)  UP, out of the top of the fist
        //   +X = (0.95, 0.19, 0.25)   forward
        // Map the blade (sword-local +Y) to hand-local (0.25,-1,0): straight
        // UP out of the fist with no inward drift toward the torso, pommel
        // below the hand. Euler (0,0,-2.8966) = Rz(-166°), measured.
        sword.rotation.set(0, 0, -2.8966);
        // Nudge the grip into the palm (hand +Y ≈ finger axis, world ≈ +X).
        sword.position.set(0, 0.03 * H, 0);
        // Inner pivot: the idle flourish animates THIS, so the grip
        // alignment above is never overwritten by the flourish loop.
        const pivot = new THREE.Group();
        sword.add(pivot);
        // Sharp, gleaming blade: a 4-sided pyramid (points +Y) flattened to a
        // thin edge so the tip reads clearly. Shares the crown's pulse.
        const bladeMat = mat("#eef4fb", { metalness: 0.95, roughness: 0.08, emissive: "#9fd0ff", emissiveIntensity: 0.4 });
        refs.royalGlowMats.current.push(bladeMat as THREE.MeshStandardMaterial);
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.014 * H, 0.32 * H, 4), bladeMat);
        blade.scale.z = 0.16;
        blade.position.y = 0.19 * H;
        pivot.add(blade);
        // Bright glowing point at the tip.
        const tipGlow = new THREE.Mesh(
          new THREE.SphereGeometry(0.018 * H, 8, 6),
          mat("#bfe3ff", { emissive: "#7fc7ff", emissiveIntensity: 1.6 }),
        );
        tipGlow.position.y = 0.35 * H;
        pivot.add(tipGlow);
        refs.royalTipMats.current.push(tipGlow.material as THREE.MeshStandardMaterial);
        const guard = new THREE.Mesh(
          new THREE.BoxGeometry(0.075 * H, 0.014 * H, 0.02 * H),
          mat(goldDeep, { metalness: 0.8, roughness: 0.2 }),
        );
        guard.position.y = 0.035 * H;
        pivot.add(guard);
        const grip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.01 * H, 0.01 * H, 0.06 * H, 8),
          mat("#5a3a1e", { roughness: 0.8 }),
        );
        pivot.add(grip);
        const pommel = new THREE.Mesh(
          new THREE.SphereGeometry(0.014 * H, 8, 6),
          mat(gold, { metalness: 0.8, roughness: 0.25 }),
        );
        pommel.position.y = -0.035 * H;
        pivot.add(pommel);
        fitToBone(hand, sword);
        refs.royalSword.current = pivot;
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
        refs.royalGlowMats.current = [];
        refs.royalTipMats.current = [];
        refs.royalSword.current = null;
      };
    }
    return () => {
      attached.forEach((a) => a.removeFromParent());
      refs.royalGlowMats.current = [];
      refs.royalTipMats.current = [];
      refs.royalSword.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clone, royalSkin, equipped, modelHeight]);
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
  const warriorSmoke = useRef<THREE.Mesh[]>([]);
  const warriorSmokeClock = useRef(0);
  // Flourish state: 0 = idle wait, >0 = playing (seconds remaining).
  const flourishT = useRef(0);
  const flourishWait = useRef(2.5 + Math.random() * 3);
  // Base emissive per glow material so the shimmer never drifts.
  const baseEmissive = useRef(new Map<THREE.MeshStandardMaterial, number>());

  useRoyalGear(clone, royalSkin, equipped, modelHeight, innerRef, flashRef, {
    royalSparks,
    flashReady: royalSparksLaunched,
    royalGlowMats,
    royalTipMats,
    royalSword,
  });

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

    // ── Idle flourish — ONLY while the character stands still ──
    const sword = royalSword.current;
    if (!sword) return;
    if (movingRef.current) {
      // Walking: abort any flourish and settle the sword back to rest.
      flourishT.current = 0;
      const k = Math.min(1, 12 * dt);
      sword.rotation.z *= 1 - k;
      sword.rotation.x *= 1 - k;
      sword.rotation.y *= 1 - k;
      // Hold the wait timer so it never fires mid-walk.
      return;
    }
    if (flourishT.current > 0) {
      flourishT.current = Math.max(0, flourishT.current - dt);
      const total = 1.4;
      const p = 1 - flourishT.current / total; // 0 → 1
      // Smooth ease in/out; returns to exactly 0 at both ends.
      const ease = Math.sin(p * Math.PI);
      const ease2 = ease * ease;
      sword.rotation.z = ease2 * 0.5;   // elegant tilt
      sword.rotation.x = ease2 * 0.25;  // slight forward lean
      sword.rotation.y = ease * 0.9;    // the twirl
      const tipBoost = baseEmissive.current.get(royalTipMats.current[0] ?? ({} as THREE.MeshStandardMaterial)) ?? 1.6;
      for (const m of royalTipMats.current) m.emissiveIntensity = tipBoost + ease * 2.2;
    } else if (flourishWait.current > 0) {
      flourishWait.current -= dt;
    } else {
      flourishT.current = 1.4;
      flourishWait.current = 4 + Math.random() * 4;
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
