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
  /** Materials sharing the gentle crown/blade shine pulse. */
  royalGlowMats: React.MutableRefObject<THREE.MeshStandardMaterial[]>;
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
        const bandMat = mat(gold, { metalness: 0.85, roughness: 0.22, emissive: "#6b4a10", emissiveIntensity: 0.35 });
        const spikeMat = mat(gold, { metalness: 0.85, roughness: 0.2, emissive: "#8a6414", emissiveIntensity: 0.35 });
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
        const sword = new THREE.Group();
        // Sharp, gleaming blade: a 4-sided pyramid (points +Y) flattened to a
        // thin edge so the tip reads clearly. Shares the crown's pulse.
        const bladeMat = mat("#eef4fb", { metalness: 0.95, roughness: 0.08, emissive: "#9fd0ff", emissiveIntensity: 0.4 });
        refs.royalGlowMats.current.push(bladeMat as THREE.MeshStandardMaterial);
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.014 * H, 0.32 * H, 4), bladeMat);
        blade.scale.z = 0.16;
        blade.position.y = 0.19 * H;
        sword.add(blade);
        // Bright glowing point at the tip.
        const tipGlow = new THREE.Mesh(
          new THREE.SphereGeometry(0.018 * H, 8, 6),
          mat("#bfe3ff", { emissive: "#7fc7ff", emissiveIntensity: 1.6 }),
        );
        tipGlow.position.y = 0.35 * H;
        sword.add(tipGlow);
        const guard = new THREE.Mesh(
          new THREE.BoxGeometry(0.075 * H, 0.014 * H, 0.02 * H),
          mat(goldDeep, { metalness: 0.8, roughness: 0.2 }),
        );
        guard.position.y = 0.035 * H;
        sword.add(guard);
        const grip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.01 * H, 0.01 * H, 0.06 * H, 8),
          mat("#5a3a1e", { roughness: 0.8 }),
        );
        sword.add(grip);
        const pommel = new THREE.Mesh(
          new THREE.SphereGeometry(0.014 * H, 8, 6),
          mat(gold, { metalness: 0.8, roughness: 0.25 }),
        );
        pommel.position.y = -0.035 * H;
        sword.add(pommel);
        fitToBone(hand, sword);
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
        refs.royalGlowMats.current = [];
      };
    }
    return () => {
      attached.forEach((a) => a.removeFromParent());
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
 * shine pulse) and returns the smoke-trail refs so the core's movement
 * frame loop can emit puffs while walking.
 */
export function useRoyalWarriorEffects(
  clone: THREE.Object3D,
  skinUrl: string | null,
  equipped: string[],
  modelHeight: number,
  innerRef: React.RefObject<THREE.Group | null>,
  flashRef: React.RefObject<THREE.Mesh | null>,
) {
  const royalSkin = isRoyalWarriorSkin(skinUrl);
  const royalSparks = useRef<THREE.Mesh[]>([]);
  const royalSparksLaunched = useRef(false);
  const royalGlowMats = useRef<THREE.MeshStandardMaterial[]>([]);
  const warriorSmoke = useRef<THREE.Mesh[]>([]);
  const warriorSmokeClock = useRef(0);

  useRoyalGear(clone, royalSkin, equipped, modelHeight, innerRef, flashRef, {
    royalSparks,
    flashReady: royalSparksLaunched,
    royalGlowMats,
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

  // Gentle "royal shine" pulse on crown + blade materials.
  useFrame(({ clock }) => {
    if (!royalSkin) return;
    const t = clock.getElapsedTime();
    const pulse = 0.28 + 0.36 * (0.5 + 0.5 * Math.sin(t * 2.2));
    for (const m of royalGlowMats.current) m.emissiveIntensity = pulse;
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
