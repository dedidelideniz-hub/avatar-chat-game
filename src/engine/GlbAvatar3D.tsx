import { Suspense, useEffect, useMemo, useRef, Component } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SkeletonUtils } from "three-stdlib";
import { useGLTF, useAnimations } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { PLAYER_3D_HEIGHT, WORLD_WIDTH, WORLD_DEPTH, S } from "./constants";
import {
  type EquipSlot,
  type EquipmentDef,
  registerEquipmentBatch,
  getEquipmentDef,
  equipMat,
  findBone as findBoneRegistry,
  findBones as findBonesRegistry,
  MULTI_BONE_SLOTS,
  resolveSkinUrl,
} from "./EquipmentRegistry";

// Re-export for backward compatibility
export type { EquipSlot, EquipmentDef } from "./EquipmentRegistry";
export { findBoneRegistry as findBone, findBonesRegistry as findBones };



/* ═══════════════════════════════════════════════════════════════
 * GLB AVATAR SYSTEM — replaces the SVG/Html avatar in gameplay.
 *
 * Architecture:
 *   useGLTF (cached per URL — ONE download for all characters)
 *   → SkeletonUtils.clone per instance (independent skeletons)
 *   → normalized to exactly PLAYER_3D_HEIGHT
 *   → idle/walk AnimationAction crossfade (no React re-renders)
 *   → facing (±1) → smooth rotation.y
 *   → equipment attached to BONES via findBone() — items inherit
 *     bone position/rotation/animation automatically.
 *
 * Character asset resolution:
 *   1. ?glb=<url> query param (instant testing with any GLB)
 *   2. /models/character.glb (drop a custom character here)
 *   3. RobotExpressive fallback (proven rigged test model)
 *
 * Debug: add ?svg=1 to the URL to restore the old SVG avatars.
 * ═══════════════════════════════════════════════════════════════ */

export const CHARACTER_MODEL_URL = "/models/character.glb";
export const FALLBACK_MODEL_URL =
  "https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb";

/** ?svg=1 restores the legacy SVG avatars for debugging. */
export const SVG_DEBUG_MODE =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("svg");

export function characterModelUrl(): string {
  if (typeof window === "undefined") return FALLBACK_MODEL_URL;
  const param = new URLSearchParams(window.location.search).get("glb");
  return param || CHARACTER_MODEL_URL;
}

/**
 * Per-skin accent. Kraliyet Savaşçısı and Şövalye share the same animated
 * knight rig; tint Kraliyet's materials toward royal gold so the two sold
 * skins stay visually distinct (and read as a brighter, "brawl-style" royal).
 */
const SKIN_ACCENT: Record<string, string> = {
  "/models/moda-savasci.glb": "#d9a441", // legacy royal path
  "/models/skin-savasci.glb": "#d9a441", // royal warrior
};

/**
 * Per-model yaw offset. The movement code orients the avatar root so its
 * local +Z matches the walk heading, but some rigs (Three.js Soldier.glb —
 * Kraliyet Savaşçısı) author their "forward" as -Z. Those models appear to
 * walk backwards. A 180° yaw on the model wrapper flips their forward to
 * +Z without touching any gameplay code.
 */
const MODEL_YAW_OFFSET: Record<string, number> = {
  "/models/skin-savasci.glb": Math.PI,
};

/** Tint a clone toward an accent color, cloning materials so skins stay
 *  independent from each other and from the shared cached GLB. */
function applySkinAccent(root: THREE.Object3D, hex: string | null) {
  if (!hex) return;
  const target = new THREE.Color(hex);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const arr = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = arr.map((src) => {
      const m = src.clone();
      const s = m as THREE.MeshStandardMaterial;
      if (s.color) s.color.lerp(target, 0.42);
      if (typeof s.metalness === "number") s.metalness = Math.min(1, s.metalness + 0.2);
      if (typeof s.roughness === "number") s.roughness = Math.max(0.1, s.roughness - 0.15);
      m.needsUpdate = true;
      return m;
    });
    mesh.material = (Array.isArray(mesh.material) ? next : next[0]) as THREE.Material | THREE.Material[];
  });
}

/* ── Bone lookup / attachment ─────────────────────────────────── */



/* ── Equipment GLB cache (lazy, non-React) ───────────────────── */

const _equipmentGlbCache = new Map<string, THREE.Group>();
const _equipmentGlbLoading = new Map<string, Promise<THREE.Group>>();

/**
 * Loads an equipment GLB and returns a clone ready for bone attachment.
 * The original scene is cached per URL; each call returns an independent
 * clone so multiple characters can wear the same item.
 */
function loadEquipmentGlbCached(url: string): THREE.Object3D {
  const cached = _equipmentGlbCache.get(url);
  if (cached) return SkeletonUtils.clone(cached) as THREE.Object3D;

  let loading = _equipmentGlbLoading.get(url);
  if (!loading) {
    loading = new Promise<THREE.Group>((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          const scene = gltf.scene;
          // ── Normalize: center at origin + height=1.0 ──
          // Works for any orientation — flattens transforms, then normalizes.
          scene.updateMatrixWorld(true);
          // Flatten: bake world transforms into geometry vertices.
          const meshes: THREE.Mesh[] = [];
          scene.traverse((obj) => { if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh); });
          for (const mesh of meshes) {
            mesh.updateMatrixWorld(true);
            mesh.geometry.applyMatrix4(mesh.matrixWorld);
            mesh.position.set(0, 0, 0);
            mesh.rotation.set(0, 0, 0);
            mesh.scale.set(1, 1, 1);
            scene.add(mesh);
          }
          // Remove old hierarchy.
          const toRemove: THREE.Object3D[] = [];
          scene.children.forEach(c => { if (!(c as THREE.Mesh).isMesh) toRemove.push(c); });
          for (const c of toRemove) scene.remove(c);
          // Center at origin.
          scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(scene);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          for (const mesh of meshes) {
            mesh.geometry.translate(-center.x, -center.y, -center.z);
          }
          scene.position.set(0, 0, 0);
          // Normalize geometry to height=1.0 (use largest dim for uniform scale).
          const maxDim = Math.max(size.x, size.y, size.z, 0.001);
          const nf = 1.0 / maxDim;
          for (const mesh of meshes) {
            mesh.geometry.scale(nf, nf, nf);
          }
          scene.userData._equipmentSize = new THREE.Vector3(size.x * nf, size.y * nf, size.z * nf);
          _equipmentGlbCache.set(url, scene);
          console.log('[Equip] GLB cached+normalized:', url, '| origSize:', size.toArray().map((v: number) => v.toFixed(2)), '| normalized:', (scene.userData._equipmentSize as THREE.Vector3).toArray().map((v: number) => v.toFixed(2)));
          resolve(scene);
        },
        undefined,
        (err) => reject(err),
      );
    });
    _equipmentGlbLoading.set(url, loading);
  }
  // Synchronously return a placeholder — the real model loads async.
  // attachEquippedToModel will re-attach once loaded.
  const placeholder = new THREE.Group();
  placeholder.userData._pendingGlb = url;
  return placeholder;
}  // Equipment GLB preloads — triggered at module init.
loadEquipmentGlbCached('/models/savasci-zirh.glb');
loadEquipmentGlbCached('/models/sovalye-zirh.glb');


/** Attaches `item` to the bone for `slot`. Returns false if bone missing. */
export function attachToBone(
  root: THREE.Object3D,
  slot: EquipSlot,
  item: THREE.Object3D,
): boolean {
  const bone = findBoneRegistry(root, slot);
  if (!bone) return false;
  bone.add(item);
  return true;
}

/* ── Equipment builders — lightweight procedural meshes ───────── */
/* All sizes are fractions of the model's native height H so they
 * scale correctly with any character GLB. Items are added to bones,
 * so they inherit the group's normalization scale automatically.
 *
 * Registered into the EquipmentRegistry at module init so
 * attachEquippedToModel() can look them up by product ID. */

function mat(color: string, opts?: Partial<THREE.MeshStandardMaterialParameters>) {
  return equipMat(color, opts);
}

// ── Register all existing procedural items ──

registerEquipmentBatch([
  // ── HEAD — Şapka: kafanın üstünü örter ──
  // Head bone worldPos Y≈1.55, kafa genişliği≈0.35, yüksekliği≈0.40
  {
    id: "moda-sapka",
    slot: "HEAD",
    build: (H) => {
      const g = new THREE.Group();
      // Geniş siper — kafa genişliğinde
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18 * H, 0.18 * H, 0.012 * H, 24),
        mat("#e8c96a"),
      );
      // Kubbe — kafanın üstünü örter
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.14 * H, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
        mat("#f0d67a"),
      );
      dome.position.y = 0.008 * H;
      // Şerit
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.145 * H, 0.008 * H, 8, 20),
        mat("#d4a030"),
      );
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.01 * H;
      g.add(brim, dome, band);
      g.position.y = 0.05 * H;
      return g;
    },
  },
  // ── FACE — Gözlük: yüzün önüne oturur ──
  {
    id: "moda-gozluk",
    slot: "FACE",
    build: (H) => {
      const g = new THREE.Group();
      const dark = mat("#222222", { roughness: 0.3, metalness: 0.3 });
      // Sol mercek — geniş
      const l = new THREE.Mesh(
        new THREE.BoxGeometry(0.065 * H, 0.04 * H, 0.015 * H), dark,
      );
      l.position.x = -0.04 * H;
      // Sağ mercek
      const r = new THREE.Mesh(
        new THREE.BoxGeometry(0.065 * H, 0.04 * H, 0.015 * H), dark,
      );
      r.position.x = 0.04 * H;
      // Burun köprüsü
      const bridge = new THREE.Mesh(
        new THREE.BoxGeometry(0.02 * H, 0.01 * H, 0.015 * H), dark,
      );
      // Kulak askıları
      const strapL = new THREE.Mesh(
        new THREE.BoxGeometry(0.04 * H, 0.008 * H, 0.01 * H), dark,
      );
      strapL.position.x = -0.08 * H;
      const strapR = strapL.clone(); strapR.position.x = 0.08 * H;
      g.add(l, r, bridge, strapL, strapR);
      g.position.set(0, 0.04 * H, 0.09 * H);
      return g;
    },
  },
  // ── NECK — Atki: boyuna sarılır ──
  {
    id: "moda-atki",
    slot: "NECK",
    build: (H) => {
      const g = new THREE.Group();
      // Boyun etrafını saran halka
      const wrap = new THREE.Mesh(
        new THREE.TorusGeometry(0.06 * H, 0.02 * H, 10, 20),
        mat("#d43a3a"),
      );
      wrap.rotation.x = Math.PI / 2;
      // Sarkan uç
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.04 * H, 0.1 * H, 0.018 * H),
        mat("#d43a3a"),
      );
      tail.position.set(0.025 * H, -0.055 * H, 0.05 * H);
      g.add(wrap, tail);
      g.position.y = 0.015 * H;
      return g;
    },
  },
  // ── CHEST — Moda Zırh: Vücuda oturan yelek tarzı zırh ──
  // Torso bone local space: world_scale ≈ 40, root_scale ≈ 0.40.
  // Conversion: world_value = builder_value × 0.01 × 40 ≈ builder_value × 0.40
  // So builder_value = world_value / 0.40.
  // Character body: ~0.38w × 0.50h × 0.25d in world units.
  // Front surface ≈ 0.12 world units from Torso bone.
  {
    id: "moda-zirh",
    slot: "CHEST",
    build: (H) => {
      const g = new THREE.Group();
      const blue = "#3f6fd0";
      const darkBlue = "#2a4a8a";
      const gold = "#c8a23a";
      const leather = "#5a3a1e";
      const metal = { metalness: 0.5, roughness: 0.3 } as const;

      // ── 1. Ön göğüs plakası ──
      // World target: 0.34w × 0.42h × 0.05d at Z=0.13 (sitting on body surface)
      const frontPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.17 * H, 0.21 * H, 0.025 * H),
        mat(blue, metal),
      );
      frontPlate.position.set(0, 0.01 * H, 0.065 * H);

      // ── 2. Arka plaka ──
      // World target: 0.32w × 0.40h × 0.04d at Z=-0.11
      const backPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.16 * H, 0.20 * H, 0.020 * H),
        mat(darkBlue, metal),
      );
      backPlate.position.set(0, 0.01 * H, -0.055 * H);

      // ── 3. Sol yan plaka — vücudu sarar ──
      // World target: 0.05w × 0.40h × 0.16d at X=-0.16
      const sideL = new THREE.Mesh(
        new THREE.BoxGeometry(0.025 * H, 0.20 * H, 0.08 * H),
        mat(darkBlue, metal),
      );
      sideL.position.set(-0.13 * H, 0.01 * H, -0.005 * H);

      // ── 4. Sağ yan plaka ──
      const sideR = sideL.clone();
      sideR.position.x = 0.13 * H;

      // ── 5. Sol omuz zırhı — kubbe şeklinde ──
      // World target: 0.15w × 0.06h × 0.15d at Y=0.22, X=-0.21
      const shoulderL = new THREE.Mesh(
        new THREE.SphereGeometry(0.04 * H, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
        mat(blue, { ...metal, metalness: 0.55 }),
      );
      shoulderL.position.set(-0.11 * H, 0.12 * H, 0.01 * H);

      // ── 6. Sağ omuz zırhı ──
      const shoulderR = shoulderL.clone();
      shoulderR.position.x = 0.11 * H;

      // ── 7. Sol omuz askısı — deri bant ──
      const strapL = new THREE.Mesh(
        new THREE.BoxGeometry(0.02 * H, 0.12 * H, 0.015 * H),
        mat(leather, { roughness: 0.8 }),
      );
      strapL.position.set(-0.08 * H, 0.10 * H, 0.065 * H);

      // ── 8. Sağ omuz askısı ──
      const strapR = strapL.clone();
      strapR.position.x = 0.08 * H;

      // ── 9. Boyun yaka — altın halka ──
      // World: Y≈0.24 from bone
      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(0.06 * H, 0.01 * H, 8, 18),
        mat(gold, { metalness: 0.65, roughness: 0.2 }),
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, 0.14 * H, 0.01 * H);

      // ── 10. Kemer — bel hizasında ──
      // World: Y≈-0.20, wrapping around body
      const belt = new THREE.Mesh(
        new THREE.BoxGeometry(0.20 * H, 0.015 * H, 0.12 * H),
        mat(leather, { roughness: 0.85 }),
      );
      belt.position.set(0, -0.10 * H, 0.005 * H);

      // ── 11. Kemer tokası — altın ──
      const buckle = new THREE.Mesh(
        new THREE.BoxGeometry(0.025 * H, 0.025 * H, 0.015 * H),
        mat(gold, { metalness: 0.75, roughness: 0.15 }),
      );
      buckle.position.set(0, -0.10 * H, 0.065 * H);

      // ── 12. Göğüs amblemi — altın daire ──
      const emblem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015 * H, 0.015 * H, 0.006 * H, 14),
        mat(gold, { metalness: 0.8, roughness: 0.1 }),
      );
      emblem.rotation.x = Math.PI / 2;
      emblem.position.set(0, 0.04 * H, 0.078 * H);

      g.add(
        frontPlate, backPlate, sideL, sideR,
        shoulderL, shoulderR, strapL, strapR,
        collar, belt, buckle, emblem,
      );
      return g;
    },
  },
  // ── BACK — Çanta: sırtta taşınan çanta ──
  {
    id: "moda-canta",
    slot: "BACK",
    build: (H) => {
      const g = new THREE.Group();
      // Ana çanta gövdesi
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.16 * H, 0.2 * H, 0.09 * H),
        mat("#c2571f"),
      );
      // Kapak
      const flap = new THREE.Mesh(
        new THREE.BoxGeometry(0.16 * H, 0.07 * H, 0.095 * H),
        mat("#8a3c12"),
      );
      flap.position.y = 0.065 * H;
      // Kayışlar (omuzdan)
      const strapL = new THREE.Mesh(
        new THREE.BoxGeometry(0.015 * H, 0.15 * H, 0.015 * H),
        mat("#6b3410"),
      );
      strapL.position.set(-0.05 * H, 0.12 * H, 0.05 * H);
      const strapR = strapL.clone(); strapR.position.x = 0.05 * H;
      g.add(body, flap, strapL, strapR);
      g.position.set(0, 0.1 * H, -0.11 * H);
      return g;
    },
  },
  // ── HANDS — Eldiven: ele oturan eldiven ──
  // Hand bone worldScale benzeri, el boyutu≈0.12×0.14
  {
    id: "moda-eldiven",
    slot: "HANDS",
    build: (H) => {
      const g = new THREE.Group();
      // Avuç içi
      const palm = new THREE.Mesh(
        new THREE.BoxGeometry(0.06 * H, 0.07 * H, 0.04 * H),
        mat("#d0483a"),
      );
      // Parmaklar (3 parmak)
      const finger = new THREE.BoxGeometry(0.015 * H, 0.04 * H, 0.015 * H);
      const f1 = new THREE.Mesh(finger, mat("#b83828")); f1.position.set(-0.015 * H, -0.05 * H, 0);
      const f2 = new THREE.Mesh(finger, mat("#b83828")); f2.position.set(0, -0.055 * H, 0);
      const f3 = new THREE.Mesh(finger, mat("#b83828")); f3.position.set(0.015 * H, -0.05 * H, 0);
      g.add(palm, f1, f2, f3);
      return g;
    },
  },
  // ── FEET — Bot: ayağa oturan bot ──
  // Foot bone worldScale benzeri, ayak boyutu≈0.16×0.10×0.22
  {
    id: "moda-bot",
    slot: "FEET",
    build: (H) => {
      const g = new THREE.Group();
      // Bot gövdesi (bilek)
      const shaft = new THREE.Mesh(
        new THREE.BoxGeometry(0.1 * H, 0.1 * H, 0.12 * H),
        mat("#5a3a1e"),
      );
      shaft.position.y = 0.04 * H;
      // Taban
      const sole = new THREE.Mesh(
        new THREE.BoxGeometry(0.1 * H, 0.025 * H, 0.16 * H),
        mat("#3a2210"),
      );
      sole.position.set(0, -0.01 * H, 0.015 * H);
      // Burun
      const toe = new THREE.Mesh(
        new THREE.BoxGeometry(0.09 * H, 0.04 * H, 0.06 * H),
        mat("#4a2f18"),
      );
      toe.position.set(0, 0.005 * H, 0.07 * H);
      g.add(shaft, sole, toe);
      return g;
    },
  },
  // ── HAND → MAIN_HAND — Kılıç: ele oturan uzun kılıç ──
  {
    id: "moda-kilic",
    slot: "HAND",
    handSlot: "MAIN_HAND",
    build: (H) => {
      const g = new THREE.Group();
      // Namlu — uzun ve keskin
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.022 * H, 0.32 * H, 0.006 * H),
        mat("#cfd6dd", { metalness: 0.75, roughness: 0.2 }),
      );
      blade.position.y = 0.2 * H;
      // Ağızlik (cross-guard)
      const guard = new THREE.Mesh(
        new THREE.BoxGeometry(0.08 * H, 0.015 * H, 0.025 * H),
        mat("#c8a23a", { metalness: 0.65, roughness: 0.25 }),
      );
      guard.position.y = 0.04 * H;
      // Kabze (grip)
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01 * H, 0.01 * H, 0.07 * H, 8),
        mat("#6b4423"),
      );
      grip.position.y = 0.005 * H;
      // Baldrag (pommel)
      const pommel = new THREE.Mesh(
        new THREE.SphereGeometry(0.012 * H, 8, 6),
        mat("#c8a23a", { metalness: 0.6, roughness: 0.3 }),
      );
      pommel.position.y = -0.03 * H;
      g.add(blade, guard, grip, pommel);
      return g;
    },
  },
  // ── HAND → OFF_HAND — Kalkan: ele oturan yuvarlak kalkan ──
  {
    id: "moda-kalkan",
    slot: "HAND",
    handSlot: "OFF_HAND",
    build: (H) => {
      const g = new THREE.Group();
      // Ana kalkan gövdesi — yuvarlak
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085 * H, 0.085 * H, 0.018 * H, 24),
        mat("#3f6fd0", { metalness: 0.35, roughness: 0.4 }),
      );
      disc.rotation.x = Math.PI / 2;
      // Merkez kabartma (boss)
      const boss = new THREE.Mesh(
        new THREE.SphereGeometry(0.022 * H, 12, 8),
        mat("#c8a23a", { metalness: 0.65, roughness: 0.25 }),
      );
      boss.position.z = 0.018 * H;
      // Kenar halkası
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.085 * H, 0.006 * H, 8, 24),
        mat("#c8a23a", { metalness: 0.5, roughness: 0.3 }),
      );
      rim.rotation.x = Math.PI / 2;
      g.add(disc, boss, rim);
      g.position.z = 0.04 * H;
      return g;
    },
  },
  // ═══ SİLAHÇI — Demir silah ve zırh ═══
  // Demir Kılıç — HAND → MAIN_HAND
  {
    id: "demir-kilic",
    slot: "HAND",
    handSlot: "MAIN_HAND",
    build: (H) => {
      const g = new THREE.Group();
      // Namlu — kalın ve güçlü
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.028 * H, 0.36 * H, 0.008 * H),
        mat("#9ca3af", { metalness: 0.85, roughness: 0.15 }),
      );
      blade.position.y = 0.23 * H;
      // Ağızlik
      const guard = new THREE.Mesh(
        new THREE.BoxGeometry(0.09 * H, 0.02 * H, 0.03 * H),
        mat("#d97706", { metalness: 0.7, roughness: 0.25 }),
      );
      guard.position.y = 0.05 * H;
      // Kabze
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012 * H, 0.012 * H, 0.08 * H, 8),
        mat("#78350f"),
      );
      grip.position.y = 0.008 * H;
      // Baldrag
      const pommel = new THREE.Mesh(
        new THREE.SphereGeometry(0.016 * H, 8, 6),
        mat("#d97706", { metalness: 0.65, roughness: 0.25 }),
      );
      pommel.position.y = -0.035 * H;
      g.add(blade, guard, grip, pommel);
      return g;
    },
  },
  // Demir Kalkan — HAND → OFF_HAND
  {
    id: "demir-kalkan",
    slot: "HAND",
    handSlot: "OFF_HAND",
    build: (H) => {
      const g = new THREE.Group();
      // Ana gövde
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.095 * H, 0.095 * H, 0.02 * H, 24),
        mat("#6b7280", { metalness: 0.65, roughness: 0.3 }),
      );
      disc.rotation.x = Math.PI / 2;
      // Merkez kabartma
      const boss = new THREE.Mesh(
        new THREE.SphereGeometry(0.025 * H, 12, 8),
        mat("#d97706", { metalness: 0.7, roughness: 0.2 }),
      );
      boss.position.z = 0.02 * H;
      // Kenar halkası
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.095 * H, 0.007 * H, 8, 24),
        mat("#d97706", { metalness: 0.55, roughness: 0.3 }),
      );
      rim.rotation.x = Math.PI / 2;
      g.add(disc, boss, rim);
      g.position.z = 0.04 * H;
      return g;
    },
  },
  // Demir Miğfer — HEAD: kafayı saran demir başlık ──
  {
    id: "demir-miğfer",
    slot: "HEAD",
    build: (H) => {
      const g = new THREE.Group();
      // Kubbeler — kafanın üstünü ve yanlarını örter
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.13 * H, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6),
        mat("#6b7280", { metalness: 0.65, roughness: 0.3 }),
      );
      // Kenar halkası
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.13 * H, 0.012 * H, 8, 24),
        mat("#4b5563", { metalness: 0.55, roughness: 0.35 }),
      );
      rim.rotation.x = Math.PI / 2;
      // Burun koruması — öne doğru uzanan çentik
      const nose = new THREE.Mesh(
        new THREE.BoxGeometry(0.02 * H, 0.07 * H, 0.03 * H),
        mat("#4b5563", { metalness: 0.55, roughness: 0.35 }),
      );
      nose.position.set(0, -0.02 * H, 0.09 * H);
      // Yan yüz korumaları
      const cheekL = new THREE.Mesh(
        new THREE.BoxGeometry(0.01 * H, 0.05 * H, 0.06 * H),
        mat("#4b5563", { metalness: 0.5, roughness: 0.4 }),
      );
      cheekL.position.set(-0.09 * H, -0.01 * H, 0.04 * H);
      const cheekR = cheekL.clone(); cheekR.position.x = 0.09 * H;
      g.add(dome, rim, nose, cheekL, cheekR);
      g.position.y = 0.05 * H;
      return g;
    },
  },
  // ═══ Demir Zırh — CHEST: Ağır gövde zırhı ═══
  {
    id: "demir-zirh",
    slot: "CHEST",
    build: (H) => {
      const g = new THREE.Group();
      const iron = "#6b7280";
      const dark = "#4b5563";
      const gold = "#d97706";
      // Ön plaka — kalın ve geniş
      const front = new THREE.Mesh(
        new THREE.BoxGeometry(0.36 * H, 0.32 * H, 0.055 * H),
        mat(iron, { metalness: 0.6, roughness: 0.3 }),
      );
      front.position.set(0, 0.04 * H, 0.14 * H);
      // Sol yan plaka
      const sideL = new THREE.Mesh(
        new THREE.BoxGeometry(0.045 * H, 0.28 * H, 0.18 * H),
        mat(dark, { metalness: 0.55, roughness: 0.35 }),
      );
      sideL.position.set(-0.18 * H, 0.03 * H, 0.05 * H);
      const sideR = sideL.clone(); sideR.position.x = 0.18 * H;
      // Sol omuz zırhı
      const shL = new THREE.Mesh(
        new THREE.BoxGeometry(0.11 * H, 0.065 * H, 0.11 * H),
        mat(iron, { metalness: 0.6, roughness: 0.3 }),
      );
      shL.position.set(-0.2 * H, 0.19 * H, 0.07 * H);
      const shR = shL.clone(); shR.position.x = 0.2 * H;
      // Boyun halkası
      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(0.085 * H, 0.014 * H, 8, 18),
        mat(gold, { metalness: 0.7, roughness: 0.2 }),
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, 0.21 * H, 0.07 * H);
      // Kemer
      const belt = new THREE.Mesh(
        new THREE.BoxGeometry(0.38 * H, 0.03 * H, 0.2 * H),
        mat("#78350f", { roughness: 0.85 }),
      );
      belt.position.set(0, -0.1 * H, 0.05 * H);
      // Kemer tokası
      const buckle = new THREE.Mesh(
        new THREE.BoxGeometry(0.035 * H, 0.035 * H, 0.02 * H),
        mat(gold, { metalness: 0.75, roughness: 0.15 }),
      );
      buckle.position.set(0, -0.1 * H, 0.16 * H);
      // Haç amblemi
      const crossH = new THREE.Mesh(
        new THREE.BoxGeometry(0.06 * H, 0.012 * H, 0.012 * H),
        mat(gold, { metalness: 0.7, roughness: 0.2 }),
      );
      crossH.position.set(0, 0.1 * H, 0.17 * H);
      const crossV = new THREE.Mesh(
        new THREE.BoxGeometry(0.012 * H, 0.06 * H, 0.012 * H),
        mat(gold, { metalness: 0.7, roughness: 0.2 }),
      );
      crossV.position.set(0, 0.1 * H, 0.17 * H);
      g.add(front, sideL, sideR, shL, shR, collar, belt, buckle, crossH, crossV);
      return g;
    },
  },
  // ═══ Savaşçı Zırhı — Fantasy Warrior (Sketchfab, full-body GLB) ═══
  {
    id: "savasci-zirh",
    slot: "CHEST",
    glbPath: "/models/savasci-zirh.glb",
    fullBody: true,
    build: (H) => {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.17*H, 0.21*H, 0.025*H), mat("#6b4423", { metalness: 0.5, roughness: 0.4 }));
      p.position.set(0, 0.01*H, 0.065*H); g.add(p); return g;
    },
  },
  // ═══ Şövalye Zırhı — Sable Knight (Sketchfab, full-body GLB) ═══
  {
    id: "sovalye-zirh",
    slot: "CHEST",
    glbPath: "/models/sovalye-zirh.glb",
    fullBody: true,
    build: (H) => {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.17*H, 0.21*H, 0.025*H), mat("#4a5568", { metalness: 0.6, roughness: 0.3 }));
      p.position.set(0, 0.01*H, 0.065*H); g.add(p); return g;
    },
  },
  // NOTE: test-zirh removed — use moda-zirh or demir-zirh instead.

  // ═══ SKIN SYSTEM — Character model swaps ═══
  // When a skin is equipped, the entire character GLB is replaced.
  // The GLB must include skeleton + animations (idle, walk).
  // Slot "CHEST" is used for skins (they replace the whole body).

  // Samuray Savaşçı — Stylized low-poly character with idle/walk/run/jump animations
  {
    id: "skin-samuray",
    slot: "CHEST",
    skinUrl: "/models/skin-samuray.glb",
    build: (H) => {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.17*H, 0.21*H, 0.025*H), mat("#8B4513", { metalness: 0.3, roughness: 0.5 }));
      p.position.set(0, 0.01*H, 0.065*H); g.add(p); return g;
    },
  },

  // Şövalye — Low-poly knight with idle/walk animations
  {
    id: "skin-sevalye",
    slot: "CHEST",
    skinUrl: "/models/skin-sevalye.glb",
    build: (H) => {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.17*H, 0.21*H, 0.025*H), mat("#708090", { metalness: 0.5, roughness: 0.3 }));
      p.position.set(0, 0.01*H, 0.065*H); g.add(p); return g;
    },
  },
  // Royal Warrior — Three.js Soldier (Idle/Walk/Run/TPose), full body with feet.
  {
    id: "skin-savasci-glb",
    slot: "CHEST",
    skinUrl: "/models/skin-savasci.glb",
    build: (H) => {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.17 * H, 0.21 * H, 0.025 * H), mat("#8b4513", { metalness: 0.3, roughness: 0.5 }));
      p.position.set(0, 0.01 * H, 0.065 * H);
      g.add(p);
      return g;
    },
  },
]);

// Position conversion constants (mirror GameEngine3D's sX/sZ helpers).
const WORLD_W = WORLD_WIDTH / 2;
const WORLD_D = WORLD_DEPTH / 2;

/**
 * Attaches all equipped items to the model's bones. Returns a cleanup
 * function that removes every attached item. Shared by the gameplay
 * avatar and the Studio portrait.
 *
 * Reads from the EquipmentRegistry — each item ID is looked up to get
 * its slot, procedural builder (or GLB path), and optional offsets.
 *
 * BONE-SCALE COMPENSATION: procedural items are sized in model-native
 * units, but some rigs use a scaled bone hierarchy (e.g. armature 0.01×
 * with bones 100×). An item added to such a bone inherits the inflated
 * scale and renders as a GIANT mesh covering the map. We measure each
 * bone's world scale vs the clone root's and compensate per item.
 */
export function attachEquippedToModel(
  clone: THREE.Object3D,
  equipped: string[],
  modelHeight: number,
): () => void {
  const attached: THREE.Object3D[] = [];
  const usedSlots = new Set<EquipSlot>();

  console.log('[Equip] attachEquippedToModel — equipped:', equipped.length, 'items, modelHeight:', modelHeight.toFixed(2));

  // Clean up any leftover debug markers from previous tests.
  clone.traverse((obj: THREE.Object3D) => {
    if (obj.name === '_debugMarker' || obj.name === '_debugAxes' || obj.name === '_debugCube') {
      obj.removeFromParent();
    }
  });



  if (equipped.length === 0) {
    console.log('[Equip] No equipped items — skipping');
    return () => {};
  }

  // Fresh world matrices so getWorldScale readings are accurate.
  clone.updateWorldMatrix(true, true);
  const rootWs = clone.getWorldScale(new THREE.Vector3());
  const expected = (rootWs.x + rootWs.y + rootWs.z) / 3 || 1;
  const boneWs = new THREE.Vector3();
  console.log('[Equip] rootWs:', rootWs.toArray().map(v => v.toFixed(2)), 'expected:', expected.toFixed(2));

  // Log all bone names for debugging.
  const allBoneNames: string[] = [];
  clone.traverse((obj: THREE.Object3D) => { if (obj.name) allBoneNames.push(obj.name); });


  for (const id of equipped) {
    const def = getEquipmentDef(id);
    if (!def) { console.warn('[Equip] No registry def for:', id); continue; }
    if (!def.build) { console.warn('[Equip] No builder for (GLB-only?):', id); continue; }

    let slot = def.slot;
    if (slot === "HAND") {
      // Use the item's explicit handSlot, or auto-assign.
      if (def.handSlot) {
        if (usedSlots.has(def.handSlot)) continue;
        slot = def.handSlot;
      } else if (!usedSlots.has("MAIN_HAND")) {
        slot = "MAIN_HAND";
      } else if (!usedSlots.has("OFF_HAND")) {
        slot = "OFF_HAND";
      } else {
        continue;
      }
    }

    console.log('[Equip] ═══', id, '→ slot:', slot, '| hasBuild:', !!def.build, '| glbPath:', def.glbPath ?? 'none');

    // Use GLB model if available, otherwise fall back to procedural builder.
    let item: THREE.Object3D;
    if (def.glbPath) {
      const cached = _equipmentGlbCache.get(def.glbPath);
      if (cached) {
        item = SkeletonUtils.clone(cached);
        console.log('[Equip] Loaded GLB from cache:', def.glbPath);
      } else {
        item = def.build(modelHeight); // fallback while GLB loads
        loadEquipmentGlbCached(def.glbPath); // trigger async load
        console.log('[Equip] GLB loading async, using procedural fallback:', def.glbPath);
      }
    } else {
      item = def.build(modelHeight);
    }

    if (def.positionOffset) {
      item.position.set(
        item.position.x + def.positionOffset[0],
        item.position.y + def.positionOffset[1],
        item.position.z + def.positionOffset[2],
      );
    }
    if (def.rotationOffset) {
      item.rotation.set(
        item.rotation.x + def.rotationOffset[0],
        item.rotation.y + def.rotationOffset[1],
        item.rotation.z + def.rotationOffset[2],
      );
    }
    if (def.scale != null) {
      item.scale.multiplyScalar(def.scale);
    }

    // ── fullBody GLB: attach to root, scale to character height ──
    if (def.fullBody && def.glbPath) {
      const bbox = new THREE.Box3().setFromObject(item);
      const bboxSize = bbox.getSize(new THREE.Vector3());
      const modelH = Math.max(bboxSize.y, 0.001);
      // Scale so the GLB matches character world height.
      const charWorldH = modelHeight * expected;
      item.scale.setScalar(charWorldH / modelH);
      // Offset Y so the model's feet (bottom of bbox) align with Y=0.
      item.position.y = -(bbox.min.y * (charWorldH / modelH));
      item.userData.isEquipment = true;
      item.traverse((obj) => { obj.userData.isEquipment = true; obj.frustumCulled = false; });
      clone.add(item);
      attached.push(item);
      const eqPos = new THREE.Vector3();
      item.getWorldPosition(eqPos);
      console.log('[Equip] ✅ FullBody GLB attached to root:', id, '| scale:', item.scale.x.toFixed(3), '| worldPos:', eqPos.toArray().map((v: number) => v.toFixed(2)).join(','));
      usedSlots.add(slot);
      continue;
    }

    let bones = findBonesRegistry(clone, slot);
    if (bones.length === 0) {
      console.warn('[Equip] ❌ No bone found for slot:', slot, 'item:', id);
      continue;
    }
    // Single-target slots (CHEST, HEAD, etc.) should only use the first
    // matching bone to avoid duplicate equipment on child bones
    // (e.g. Spine → Spine1 → Spine2 would create 3 overlapping copies).
    if (!MULTI_BONE_SLOTS.has(slot) && bones.length > 1) {
      console.log('[Equip] Single-target slot', slot, ':', bones.length, 'bones found, using only first:', bones[0].name);
      bones = [bones[0]];
    }
    console.log('[Equip] ✅ Found bones:', bones.map(b => b.name), 'for slot:', slot);

    bones.forEach((bone, i) => {
      const inst = i === 0 ? item : item.clone();
      bone.getWorldScale(boneWs);
      const boneAvg = (boneWs.x + boneWs.y + boneWs.z) / 3;

      console.log('[Equip] bone:', bone.name, '| parent:', bone.parent?.name, '| worldScale:', boneAvg.toFixed(2));

      if (def.glbPath && boneAvg > 1e-6) {
        // GLB equipment: geometry already normalized to height≈1.0 in cache.
        // Just scale to match character proportions.
        // worldH = localScale × boneAvg → localScale = targetWorldH / boneAvg
        const charWorldH = modelHeight * expected;
        const targetWorldH = charWorldH * 0.55;
        const localScale = targetWorldH / boneAvg;
        inst.scale.setScalar(localScale);
        console.log('[Equip] GLB scale:', localScale.toFixed(4), '| targetH:', targetWorldH.toFixed(2));
      } else {
        // Procedural equipment: compensate for bone scale mismatch.
        const ratio = boneAvg > 1e-6 ? expected / boneAvg : 1;
        if (ratio > 2 || ratio < 0.5) {
          inst.scale.setScalar(ratio);
          console.warn('[Equip] Scale fix applied:', ratio.toFixed(3));
        }
      }
      // Mark all objects in this equipment subtree so applyFade skips them,
      // and disable frustum culling so the equipment is always rendered.
      inst.userData.isEquipment = true;
      inst.traverse((obj) => {
        obj.userData.isEquipment = true;
        obj.frustumCulled = false;
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.renderOrder = 999;
        }
      });
      bone.add(inst);
      attached.push(inst);

      const eqWorldPos = new THREE.Vector3();
      inst.getWorldPosition(eqWorldPos);
      console.log('[Equip] ✅ Attached', id, '→ bone:', bone.name, '| scale:', inst.scale.toArray().map(v => v.toFixed(3)).join(','), '| worldPos:', eqWorldPos.toArray().map(v => v.toFixed(2)).join(','));
    });
    usedSlots.add(slot);
  }    console.log('[Equip] Total attached:', attached.length);
  return () => {
    for (const item of attached) item.removeFromParent();
  };
}

/** Resolves the idle/walk clip keys from an actions map (case-insensitive). */
export function resolveIdleWalk(
  actions: Record<string, THREE.AnimationAction | null>,
) {
  let idle: string | undefined;
  let walk: string | undefined;
  for (const k of Object.keys(actions)) {
    const lk = k.toLowerCase();
    if (!idle && lk.includes("idle")) idle = k;
    if (!walk && (lk.includes("walk") || lk.includes("run"))) walk = k;
  }
  return { idle, walk };
}

/* ── Error boundary with fallback-model retry ─────────────────── */

export class GlbModelBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Computes character height from skeleton bones instead of bounding box.
 * More robust for Sketchfab models with armor/accessory meshes that
 * inflate the bounding box (e.g. knight models with floating armor pieces
 * at Y=800-1179cm that make the bounding box 5x larger than the body).
 *
 * Walks up from leaf bones to find the lowest (feet) and highest (head)
 * bone positions in world space, then returns the height difference.
 * Falls back to bounding box if no bones are found.
 */
export function computeSkeletonHeight(root: THREE.Object3D): {
  height: number;
  feetY: number;
  headY: number;
} {
  let minY = Infinity;
  let maxY = -Infinity;
  const pos = new THREE.Vector3();

  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      obj.getWorldPosition(pos);
      if (pos.y < minY) minY = pos.y;
      if (pos.y > maxY) maxY = pos.y;
    }
  });

  // If we found bones, use skeleton height.
  if (isFinite(minY) && isFinite(maxY) && maxY - minY > 0.01) {
    return { height: maxY - minY, feetY: minY, headY: maxY };
  }

  // Fallback: use bounding box (for models without a skeleton).
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  return { height: Math.max(size.y, 0.0001), feetY: box.min.y, headY: box.max.y };
}

/* ── Core avatar (one instance per character) ─────────────────── */

interface GlbAvatarCoreProps {
  url: string;
  posRef: React.RefObject<{ x: number; y: number }>;
  facingRef: React.RefObject<number>;
  equipped: string[];
  lerpSpeed?: number;
}

function GlbAvatarCore({ url, posRef, facingRef, equipped, lerpSpeed = 14 }: GlbAvatarCoreProps) {
  const groupRef = useRef<THREE.Group>(null);
  // Scaled inner group: model transform (scale + feet offset) lives here so
  // the per-frame world position on the outer group can never clobber it.
  const innerRef = useRef<THREE.Group>(null);

  // Skin system: if any equipped item has a skinUrl, use that character model instead.
  const skinUrl = useMemo(() => resolveSkinUrl(equipped), [equipped]);
  const effectiveUrl = skinUrl || url;
  // Per-model yaw (see MODEL_YAW_OFFSET): -Z-forward rigs must be flipped
  // so they face their movement direction.
  const yawOffset = MODEL_YAW_OFFSET[effectiveUrl] ?? 0;

  const { scene, animations } = useGLTF(effectiveUrl);

  // Ensure all world matrices are computed before cloning or measuring.
  useMemo(() => { scene.updateMatrixWorld(true); }, [scene]);

  // Per-instance clone with independent skeleton (shares GPU resources).
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene, effectiveUrl]);
  // Force a fresh React subtree when a remote player changes skin. This
  // prevents an old mixer/action set from continuing to drive the new rig.
  useEffect(() => {
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.frustumCulled = false;
        mesh.castShadow = true;
      }
    });
  }, [clone]);

  const { actions, mixer } = useAnimations(animations, groupRef);

  // Normalize to exactly PLAYER_3D_HEIGHT — never trust authored scale.
  // Normalize to exactly PLAYER_3D_HEIGHT.
  // For character skins (Sketchfab models with armor/accessory meshes that
  // inflate the bounding box), use skeleton bone heights instead.
  // For the default character.glb / RobotExpressive, keep bounding box.
  const { normScale, modelHeight, feetOffset } = useMemo(() => {
    clone.updateMatrixWorld(true);
    if (skinUrl) {
      const box = new THREE.Box3().setFromObject(clone);
      const h = Math.max(box.max.y - box.min.y, 0.0001);
      // Keep the Soldier skin's soles on the same plane as the default avatar.
      const feetOffset = -box.min.y;
      return { normScale: PLAYER_3D_HEIGHT / h, modelHeight: h, feetOffset };
    }
    // Default model: bounding box is accurate.
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const h = Math.max(size.y, 0.0001);
    const feetY = -box.min.y;
    return { normScale: PLAYER_3D_HEIGHT / h, modelHeight: h, feetOffset: feetY };
  }, [clone, skinUrl]);

  // Shadow casting on every mesh.
  useEffect(() => {
    clone.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
      }
    });
  }, [clone]);

  // Per-skin accent (e.g. gold Kraliyet) to keep shared-rig skins distinct.
  const skinAccent = skinUrl ? SKIN_ACCENT[skinUrl] ?? null : null;
  useEffect(() => {
    applySkinAccent(clone, skinAccent);
  }, [clone, skinAccent]);

  // Resolve idle/walk clips once. Prefer a real walk cycle over run so the
  // feet visibly alternate while the avatar moves through the world.
  const clips = useMemo(() => {
    const keys = Object.keys(actions);
    const walk = keys.find((key) => key.toLowerCase().includes("walk"));
    const run = keys.find((key) => key.toLowerCase().includes("run"));
    const idle = keys.find((key) => key.toLowerCase().includes("idle"));
    return { idle, walk: walk ?? run };
  }, [actions]);

  // Play idle initially.
  useEffect(() => {
    const key = clips.idle ?? Object.keys(actions)[0];
    const action = key ? actions[key] : undefined;
    if (!action) return;
    action.reset().fadeIn(0.3).play();
    return () => {
      action.fadeOut(0.3);
    };
  }, [actions, clips]);

  // Movement/animation state (refs — zero React re-renders per frame).
  const movingRef = useRef(false);
  const currentClip = useRef<"idle" | "walk">("idle");
  useEffect(() => {
    mixer.stopAllAction();
    mixer.setTime(0);
    Object.values(actions).forEach((action) => action?.reset());
    movingRef.current = false;
    currentClip.current = "idle";
  }, [effectiveUrl, mixer, actions]);

  const smoothPos = useRef<{ x: number; y: number } | null>(null);
  // Initial yaw from the ±1 facing flag; afterwards yaw follows movement.
  const targetYaw = useRef(
    (facingRef.current ?? 1) < 0 ? -Math.PI / 2 : Math.PI / 2,
  );
  const initDone = useRef(false);

  // Per-model yaw: flip -Z-forward rigs (Soldier.glb) so they face their
  // movement direction instead of walking backwards.
  useEffect(() => {
    if (innerRef.current) innerRef.current.rotation.y = yawOffset;
  }, [yawOffset, clone]);

  // ── Visual polish (lightweight, mobile-friendly) ──────────────
  // Adds life on top of the existing rig/animation system without
  // touching movement, multiplayer, skins or equipment logic:
  //  • Idle "breathing" bob: tiny upward sway ONLY while idle — never
  //    during walking, so real walk cycles stay untouched. Offset is
  //    positive-only so soles never clip below the road.
  //  • Equip pop: short eased scale pulse (≈1.0 → 1.05 → 1.0) when the
  //    equipped set changes (skin selected / item equipped) and on spawn.
  //  • Spawn flash: ONE soft expanding ring at the feet, self-cleaning.
  const idleBobPhase = useRef(Math.random() * Math.PI * 2);
  const bounceRef = useRef(0.35); // pop on mount = spawn/skin-select feedback
  const equipKeyRef = useRef(equipped.join(","));
  const flashRef = useRef<THREE.Mesh | null>(null);
  const flashAgeRef = useRef(0);

  useEffect(() => {
    if (!innerRef.current) return;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.6, 28),
      new THREE.MeshBasicMaterial({
        color: "#9be7ff",
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    ring.visible = false;
    innerRef.current.add(ring);
    flashRef.current = ring;
    flashAgeRef.current = 0;
    return () => {
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      ring.removeFromParent();
      flashRef.current = null;
    };
  }, [clone]);

  useFrame((_, dt) => {
    const inner = innerRef.current;
    if (!inner) return;

    // Equip pop trigger (also fires on the first frame = spawn).
    const key = equipped.join(",");
    if (key !== equipKeyRef.current) {
      equipKeyRef.current = key;
      bounceRef.current = 0.3;
    }

    // Idle breathing bob (paused while moving so walk cycles stay clean).
    idleBobPhase.current += dt;
    const bob = movingRef.current ? 0 : 0.012 + Math.sin(idleBobPhase.current * 2.2) * 0.012;
    inner.position.y = feetOffset * normScale + bob;

    // Short eased scale pulse.
    if (bounceRef.current > 0) {
      bounceRef.current = Math.max(0, bounceRef.current - dt);
      const t = bounceRef.current / 0.3; // 1 → 0
      inner.scale.setScalar(normScale * (1 + Math.sin(t * Math.PI) * 0.05));
    } else if (inner.scale.x !== normScale) {
      inner.scale.setScalar(normScale);
    }

    // Expanding + fading spawn ring.
    const flash = flashRef.current;
    if (flash && flashAgeRef.current >= 0) {
      flashAgeRef.current += dt;
      const t = Math.min(1, flashAgeRef.current / 0.6);
      flash.visible = t < 1;
      flash.scale.setScalar(0.35 + t * 1.9);
      (flash.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - t);
      if (t >= 1) flashAgeRef.current = -1;
    }
  });

  // ── Royal identity gear (visual-only, Brawl-style presentation) ──
  // Keyed to the Kraliyet Savaşçısı skin. Procedural royal pieces are
  // attached to the SKIN'S OWN skeleton via the existing bone aliases —
  // no inventory, shop, multiplayer or Convex changes. Real purchased
  // items in the same slot take priority (no double crown / sword).
  const royalSkin = skinUrl === "/models/moda-savasci.glb" || skinUrl === "/models/skin-savasci.glb";
  const royalSparks = useRef<THREE.Mesh[]>([]);
  const royalSparksLaunched = useRef(false);
  // Materials that share the gentle crown/blade shine pulse.
  const royalGlowMats = useRef<THREE.MeshStandardMaterial[]>([]);

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

    // ── Altın taç (HEAD bone) ──
    if (!hasRealSlot("HEAD")) {
      const head = findBoneRegistry(clone, "HEAD");
      if (head) {
        const crown = new THREE.Group();
        // Shared glow materials — pulsed together in the shine loop below.
        const bandMat = mat(gold, { metalness: 0.85, roughness: 0.22, emissive: "#6b4a10", emissiveIntensity: 0.35 });
        const spikeMat = mat(gold, { metalness: 0.85, roughness: 0.2, emissive: "#8a6414", emissiveIntensity: 0.35 });
        royalGlowMats.current.push(bandMat as THREE.MeshStandardMaterial, spikeMat as THREE.MeshStandardMaterial);
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
        const bladeMat = mat("#eef4fb", { metalness: 0.95, roughness: 0.08, emissive: "#9fd0ff", emissiveIntensity: 0.4 });
        royalGlowMats.current.push(bladeMat as THREE.MeshStandardMaterial);
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.014 * H, 0.32 * H, 4), bladeMat);
        blade.scale.z = 0.16;
        blade.position.y = 0.19 * H;
        sword.add(blade);
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
      royalSparks.current = sparks;
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
        royalSparks.current = [];
        royalSparksLaunched.current = false;
      };
    }
    return () => {
      attached.forEach((a) => a.removeFromParent());
    };
  }, [clone, royalSkin, equipped, modelHeight]);

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

  // Warrior-only trail: small pooled smoke puffs, kept lightweight for mobile.
  const warriorSmoke = useRef<THREE.Mesh[]>([]);
  const warriorSmokeClock = useRef(0);
  const isWarriorSkin = skinUrl === "/models/moda-savasci.glb" || skinUrl === "/models/skin-savasci.glb";
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
      warriorSmoke.current.push(puff);
      return puff;
    });
    return () => {
      puffs.forEach((puff) => puff.removeFromParent());
      warriorSmoke.current = [];
      smokeMat.dispose();
    };
  }, [isWarriorSkin]);

  // ── Near-camera fade ─────────────────────────────────────────
  // A character that slips between the camera and the action (bot walking
  // past, or the player while the follow-camera lags) would otherwise fill
  // the whole screen. Fade it out smoothly instead. Materials are cloned
  // per instance (cached by original) so other characters are unaffected.
  const FADE_START = 4.5; // begin fading inside this distance
  const FADE_END = 2.5;   // fully invisible at this distance
  const fadeRef = useRef(1);
  const matCache = useRef(new Map<THREE.Material, THREE.Material>());

  const applyFade = (root: THREE.Object3D, opacity: number) => {
    root.traverse((obj) => {
      // Skip equipment meshes — they have their own materials and should
      // never be faded (they would become invisible).
      if (obj.userData?.isEquipment) return;
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const orig = mesh.material as THREE.Material | undefined;
      if (!orig) return;
      let m = matCache.current.get(orig);
      if (!m) {
        m = orig.clone();
        matCache.current.set(orig, m);
      }
      mesh.material = m;
      m.transparent = opacity < 0.999;
      m.opacity = opacity;
      m.depthWrite = opacity > 0.6;
    });
  };

  useFrame((state, dt) => {
    const group = groupRef.current;
    const p = posRef.current;
    if (!group || !p) return;

    // Snap on first frame (avoid lerp across the map from origin).
    if (!initDone.current) {
      initDone.current = true;
      smoothPos.current = { x: p.x, y: p.y };
    }
    const sp = smoothPos.current!;

    // Smooth interpolation toward target (same pipeline as SVG avatar).
    const lerpFactor = Math.min(1, lerpSpeed * dt);
    sp.x += (p.x - sp.x) * lerpFactor;
    sp.y += (p.y - sp.y) * lerpFactor;
    group.position.set(sp.x / S - WORLD_W, 0.02, -(sp.y / S - WORLD_D));

    // Walking detection from position delta (same threshold as SVG avatar).
    const dx = Math.abs(p.x - sp.x);
    const dy = Math.abs(p.y - sp.y);
    const moving = dx > 0.3 || dy > 0.3;

    // Crossfade idle ↔ walk.
    if (moving !== movingRef.current) {
      movingRef.current = moving;
      const nextClip: "idle" | "walk" = moving ? "walk" : "idle";
      if (nextClip !== currentClip.current) {
        const from = actions[currentClip.current === "idle" ? clips.idle ?? "" : clips.walk ?? ""];
        const to = actions[nextClip === "idle" ? clips.idle ?? "" : clips.walk ?? ""];
        if (from) from.fadeOut(0.2);
        if (to) to.reset().fadeIn(0.2).play();
        currentClip.current = nextClip;
      }
    }

    // Facing: derive yaw from the ACTUAL movement direction on the X/Z
    // plane (not just the ±1 left/right facing flag). World conversion:
    //   worldX = svgX / S - W/2,  worldZ = -(svgY / S - D/2)
    // The model's natural forward axis is +Z, so the target yaw for a
    // movement direction (dx, dz) is atan2(dx, dz):
    //   right  (dx=+1, dz=0)  → yaw=+π/2  (faces +X)
    //   left   (dx=-1, dz=0)  → yaw=-π/2  (faces -X)
    //   up     (dx=0,  dz=-1) → yaw=π     (faces -Z, back to camera)
    //   down   (dx=0,  dz=+1) → yaw=0     (faces +Z, toward camera)
    // Diagonals interpolate naturally. When idle we KEEP the last yaw so
    // the character doesn't snap back to a default facing.
    if (moving) {
      const dxw = (p.x - sp.x) / S;
      const dzw = -(p.y - sp.y) / S;
      targetYaw.current = Math.atan2(dxw, dzw);
    }
    let diff = targetYaw.current - group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    group.rotation.y += diff * Math.min(1, 10 * dt);

    if (isWarriorSkin && moving) {
      warriorSmokeClock.current += dt;
      if (warriorSmokeClock.current > 0.09) {
        warriorSmokeClock.current = 0;
        const puff = warriorSmoke.current.find((item) => !item.visible) ?? warriorSmoke.current[0];
        if (puff) {
          puff.visible = true;
          puff.position.set(0, -0.72, 0.12);
          puff.scale.setScalar(0.55);
          (puff.material as THREE.MeshBasicMaterial).opacity = 0.3;
          puff.userData.smokeAge = 0;
        }
      }
    }
    for (const puff of warriorSmoke.current) {
      if (!puff.visible) continue;
      const age = (puff.userData.smokeAge ?? 0) + dt;
      puff.userData.smokeAge = age;
      puff.position.y += dt * 0.18;
      puff.scale.addScalar(dt * 0.35);
      (puff.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.3 * (1 - age / 0.55));
      if (age >= 0.55) puff.visible = false;
    }

    // Fade near-camera characters (see applyFade above). Only touch
    // materials when the opacity actually changes — not every frame.
    const dist = state.camera.position.distanceTo(group.position);
    let targetOpacity = 1;
    if (dist < FADE_START) {
      targetOpacity = THREE.MathUtils.clamp(
        (dist - FADE_END) / (FADE_START - FADE_END),
        0,
        1,
      );
    }
    if (Math.abs(targetOpacity - fadeRef.current) > 0.03) {
      fadeRef.current = targetOpacity;
      applyFade(group, targetOpacity);
      group.visible = targetOpacity > 0.02;
    }
  });

  // Bone-based equipment attachment.
  // CRITICAL: We defer the first attachment to useFrame so the clone is
  // guaranteed to be in the Three.js scene graph and world matrices are
  // computable. A useEffect fires before <primitive> commits, so bones
  // report zero scale and nothing gets attached.
  const equippedRef = useRef(equipped.join(","));
  const cleanupEquipRef = useRef<(() => void) | null>(null);
  const equipAttachedFrame = useRef(false);

  useFrame(() => {
    const key = equipped.join(",");
    if (key !== equippedRef.current || !equipAttachedFrame.current) {
      console.log('[Equip] useFrame re-attaching. prev:', equippedRef.current, 'new:', key, 'firstFrame:', !equipAttachedFrame.current);
      cleanupEquipRef.current?.();
      cleanupEquipRef.current = attachEquippedToModel(clone, equipped, modelHeight);
      equippedRef.current = key;
      equipAttachedFrame.current = true;
      if (fadeRef.current < 1 && groupRef.current) {
        applyFade(groupRef.current, fadeRef.current);
      }
    }
  });

  // Cleanup equipment on unmount.
  useEffect(() => {
    return () => { cleanupEquipRef.current?.(); };
  }, []);

  // Inner group carries the model scale + ground offset. The outer
  // group position is rewritten every frame by useFrame (y=0.02),
  // which would otherwise wipe the feet offset after the first frame
  // and sink skinned soles below the road. rotation-y (set via
  // useEffect above) flips -Z-forward rigs to face the walk heading.
  return (
    <group ref={groupRef}>
      <group ref={innerRef} scale={normScale} position={[0, feetOffset * normScale, 0]}>
        <primitive object={clone} />
      </group>
    </group>
  );
}

/* ── Public component with fallback-model retry ───────────────── */

export interface GlbAvatar3DProps {
  posRef: React.RefObject<{ x: number; y: number }>;
  facingRef: React.RefObject<number>;
  equipped: string[];
  lerpSpeed?: number;
}

/** Primary URL can be overridden per-instance (used by the fallback). */
export function GlbAvatar3D({ url, ...props }: GlbAvatar3DProps & { url?: string }) {
  const primary = url ?? characterModelUrl();

  // Remount the whole avatar core whenever the effective character model
  // changes (skin equip / unequip). A fresh mount rebuilds the animation
  // mixer + actions bound to the NEW skeleton. Without this, switching back
  // to a previously-loaded skin reuses stale actions that still point at
  // the old clone, leaving the character frozen in T-pose with no walk.
  const skinKey = useMemo(
    () => resolveSkinUrl(props.equipped) ?? "default",
    [props.equipped],
  );

  // If already on the fallback model, render directly (no retry loop).
  if (primary === FALLBACK_MODEL_URL) {
    return (
      <Suspense fallback={null}>
        <GlbAvatarCore key={skinKey} url={primary} {...props} />
      </Suspense>
    );
  }

  return (
    <GlbModelBoundary
      fallback={
        <Suspense fallback={null}>
          <GlbAvatarCore key={skinKey} url={FALLBACK_MODEL_URL} {...props} />
        </Suspense>
      }
    >
      <Suspense fallback={null}>
        <GlbAvatarCore key={skinKey} url={primary} {...props} />
      </Suspense>
    </GlbModelBoundary>
  );
}

// Warm the cache for the fallback so the retry is instant.
useGLTF.preload(FALLBACK_MODEL_URL);

/* ── Character portrait (Studio / selection screens) ──────────── */

interface PortraitCoreProps {
  url: string;
  equipped: string[];
  height: number;
  spin: boolean;
}

/** Static character shown facing the camera with its idle animation. */
function GlbPortraitCore({ url, equipped, height, spin }: PortraitCoreProps) {
  const groupRef = useRef<THREE.Group>(null);
  const skinUrl = useMemo(() => resolveSkinUrl(equipped), [equipped]);
  const { scene, animations } = useGLTF(skinUrl || url);
  useMemo(() => { scene.updateMatrixWorld(true); }, [scene]);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  // Face -Z-forward rigs (e.g. Soldier.glb) toward the camera like +Z rigs.
  const yawOffset = MODEL_YAW_OFFSET[skinUrl || url] ?? 0;
  useEffect(() => {
    if (groupRef.current) groupRef.current.rotation.y = yawOffset;
  }, [yawOffset]);
  const { actions } = useAnimations(animations, groupRef);

  const { normScale, modelHeight } = useMemo(() => {
    clone.updateMatrixWorld(true);
    if (skinUrl) {
      const skel = computeSkeletonHeight(clone);
      const h = skel.height;
      return { normScale: height / h, modelHeight: h };
    }
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const h = Math.max(size.y, 0.0001);
    return { normScale: height / h, modelHeight: h };
  }, [clone, height, skinUrl]);

  // Play the idle clip (or the first clip as a fallback).
  useEffect(() => {
    const { idle } = resolveIdleWalk(actions);
    const key = idle ?? Object.keys(actions)[0];
    const action = key ? actions[key] : undefined;
    if (!action) return;
    action.reset().fadeIn(0.3).play();
    return () => {
      action.fadeOut(0.3);
    };
  }, [actions]);

  // Bone-based equipment — deferred to useFrame so model is in the scene.
  const equippedRef = useRef(equipped.join(","));
  const cleanupEquipRef = useRef<(() => void) | null>(null);
  const equipAttachedFrame = useRef(false);

  // Sanity guard: broken normalization must never render a giant mesh.
  if (!Number.isFinite(normScale) || normScale <= 0 || normScale > 10) {
    return null;
  }

  // Gentle turntable so the whole character can be inspected.
  useFrame((_, dt) => {
    // Attach equipment on first frame (model is in scene by then).
    const key = equipped.join(",");
    if (key !== equippedRef.current || !equipAttachedFrame.current) {
      cleanupEquipRef.current?.();
      cleanupEquipRef.current = attachEquippedToModel(clone, equipped, modelHeight);
      equippedRef.current = key;
      equipAttachedFrame.current = true;
    }
    if (spin && groupRef.current) {
      groupRef.current.rotation.y += dt * 0.6;
    }
  });

  return (
    <group ref={groupRef} position={[0, -height / 2, 0]} scale={normScale}>
      <primitive object={clone} />
    </group>
  );
}

export interface GlbCharacterPortraitProps {
  equipped?: string[];
  /** Rendered height in world units. */
  height?: number;
  /** Slow turntable rotation (default true). */
  spin?: boolean;
}

/**
 * Retry wrapper shared by every GLB consumer: renders `children` with the
 * primary model URL, and if that model can't be fetched, re-renders
 * `fallback` (which should load FALLBACK_MODEL_URL) instead. If the primary
 * URL already IS the fallback, children render without a boundary.
 */
export function GlbModelRetry({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const primary = characterModelUrl();
  if (primary === FALLBACK_MODEL_URL) return <>{children}</>;
  return <GlbModelBoundary fallback={fallback}>{children}</GlbModelBoundary>;
}

/**
 * 3D character portrait for the character-selection screen. Renders the
 * same GLB character used in gameplay, with idle animation and equipped
 * items attached to bones. Must be placed inside a <Canvas>.
 */
export function GlbCharacterPortrait({
  equipped = [],
  height = 2.2,
  spin = true,
}: GlbCharacterPortraitProps) {
  const primary = characterModelUrl();

  if (primary === FALLBACK_MODEL_URL) {
    return (
      <Suspense fallback={null}>
        <GlbPortraitCore url={primary} equipped={equipped} height={height} spin={spin} />
      </Suspense>
    );
  }  return (
    <GlbModelBoundary
      fallback={
        <Suspense fallback={null}>
          <GlbPortraitCore url={FALLBACK_MODEL_URL} equipped={equipped} height={height} spin={spin} />
        </Suspense>
      }
    >
      <Suspense fallback={null}>
        <GlbPortraitCore url={primary} equipped={equipped} height={height} spin={spin} />
      </Suspense>
    </GlbModelBoundary>
  );
}

/* ── Profile card avatar (self-contained mini Canvas) ──────────── */

interface ProfileModelProps {
  url: string;
  equipped: string[];
  height: number;
}

/**
 * Character shown in the profile card: plays the idle animation and
 * periodically looks left/right (head/eye motion) instead of staring
 * straight ahead. Faces the camera at all times.
 */
function GlbProfileModel({ url, equipped, height }: ProfileModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const skinUrl = useMemo(() => resolveSkinUrl(equipped), [equipped]);
  const { scene, animations } = useGLTF(skinUrl || url);
  useMemo(() => { scene.updateMatrixWorld(true); }, [scene]);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  // Face -Z-forward rigs (e.g. Soldier.glb) toward the camera like +Z rigs.
  const yawOffset = MODEL_YAW_OFFSET[skinUrl || url] ?? 0;
  useEffect(() => {
    if (groupRef.current) groupRef.current.rotation.y = yawOffset;
  }, [yawOffset]);
  const { actions } = useAnimations(animations, groupRef);

  const { normScale, modelHeight } = useMemo(() => {
    clone.updateMatrixWorld(true);
    if (skinUrl) {
      const skel = computeSkeletonHeight(clone);
      const h = skel.height;
      return { normScale: height / h, modelHeight: h };
    }
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const h = Math.max(size.y, 0.0001);
    return { normScale: height / h, modelHeight: h };
  }, [clone, height, skinUrl]);

  // Idle animation.
  useEffect(() => {
    const { idle } = resolveIdleWalk(actions);
    const key = idle ?? Object.keys(actions)[0];
    const action = key ? actions[key] : undefined;
    if (!action) return;
    action.reset().fadeIn(0.3).play();
    return () => {
      action.fadeOut(0.3);
    };
  }, [actions]);

  // Bone-based equipment — deferred to useFrame so model is in the scene.
  const equippedRef = useRef(equipped.join(","));
  const cleanupEquipRef = useRef<(() => void) | null>(null);
  const equipAttachedFrame = useRef(false);

  // Sanity guard: broken normalization must never render a giant mesh.
  if (!Number.isFinite(normScale) || normScale <= 0 || normScale > 10) {
    return null;
  }

  // Look around: smooth layered sine produces natural left/right glances
  // (±~28°) with occasional off-beat drift, like the character is curious.
  const head = useMemo(() => findBoneRegistry(clone, "HEAD"), [clone]);
  useFrame((state, dt) => {
    // Attach equipment on first frame (model is in scene by then).
    const key = equipped.join(",");
    if (key !== equippedRef.current || !equipAttachedFrame.current) {
      cleanupEquipRef.current?.();
      cleanupEquipRef.current = attachEquippedToModel(clone, equipped, modelHeight);
      equippedRef.current = key;
      equipAttachedFrame.current = true;
    }
    if (!head) return;
    const t = state.clock.elapsedTime;
    const target = Math.sin(t * 0.8) * 0.3 + Math.sin(t * 0.27) * 0.18;
    head.rotation.y += (target - head.rotation.y) * Math.min(1, 5 * dt);
  });

  // Cleanup equipment on unmount.
  useEffect(() => {
    return () => { cleanupEquipRef.current?.(); };
  }, []);

  return (
    <group ref={groupRef} position={[0, -height / 2, 0]} scale={normScale}>
      <primitive object={clone} />
    </group>
  );
}

export interface GlbProfileAvatarProps {
  equipped?: string[];
  /** Character height in world units inside the mini scene. */
  height?: number;
  /** Wrapper className — size it here (e.g. "h-24 w-24"). */
  className?: string;
}

/**
 * Animated 3D character for the profile card. Fully self-contained
 * (own transparent Canvas) — drop it anywhere in JSX. Uses the SAME
 * cached GLB as the game, idle animation + left/right eye/head motion,
 * equipment attached to bones.
 */
export function GlbProfileAvatar({
  equipped = [],
  height = 2,
  className,
}: GlbProfileAvatarProps) {
  const primary = characterModelUrl();

  const sceneFor = (url: string) => (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, height * 1.7], fov: 35 }}
      gl={{ alpha: true, antialias: true }}
      style={{ background: "transparent" }}
      onCreated={({ gl }) => {
        // This second canvas can cause the browser to evict the main game
        // context — allow clean restore for both directions.
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
        });
      }}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[2, 3, 4]} intensity={1.4} />
      <Suspense fallback={null}>
        <GlbProfileModel url={url} equipped={equipped} height={height} />
      </Suspense>
    </Canvas>
  );

  return (
    <div className={className}>
      {primary === FALLBACK_MODEL_URL ? (
        sceneFor(primary)
      ) : (
        <GlbModelBoundary fallback={sceneFor(FALLBACK_MODEL_URL)}>
          {sceneFor(primary)}
        </GlbModelBoundary>
      )}
    </div>
  );
}
