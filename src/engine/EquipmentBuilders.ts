import * as THREE from "three";
import { equipMat, registerEquipmentBatch } from "./EquipmentRegistry";
import { equipDebug } from "./EquipmentDebug";

/* ── Procedural equipment builders ────────────────────────────── */
/* Lightweight procedural meshes for every shop item. All sizes are
 * fractions of the model's native height H so they scale correctly
 * with any character GLB. Items are added to bones, so they inherit
 * the group's normalization scale automatically.
 *
 * Registered into the EquipmentRegistry at module init so
 * attachEquippedToModel() can look them up by product ID. */

const mat = (color: string, opts?: Partial<THREE.MeshStandardMaterialParameters>) =>
  equipMat(color, opts);

/* ── Equipment GLB cache (lazy, non-React) ───────────────────── */

const _equipmentGlbCache = new Map<string, THREE.Group>();
const _equipmentGlbLoading = new Map<string, Promise<THREE.Group>>();

/**
 * Loads an equipment GLB and returns a clone ready for bone attachment.
 * The original scene is cached per URL; each call returns an independent
 * clone so multiple characters can wear the same item.
 */
export function loadEquipmentGlbCached(url: string): THREE.Object3D {
  const cached = _equipmentGlbCache.get(url);
  if (cached) return SkeletonUtilsClone(cached) as THREE.Object3D;

  let loading = _equipmentGlbLoading.get(url);
  if (!loading) {
    loading = new Promise<THREE.Group>((resolve, reject) => {
      new GLTFLoaderShim().load(
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
          scene.children.forEach((c) => { if (!(c as THREE.Mesh).isMesh) toRemove.push(c); });
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
          equipDebug.glbCached(url, size, scene.userData._equipmentSize as THREE.Vector3);
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
}

// Imported lazily to keep this module free of heavy top-level deps.
import { SkeletonUtils } from "three-stdlib";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
function SkeletonUtilsClone(scene: THREE.Group) {
  return SkeletonUtils.clone(scene);
}
class GLTFLoaderShim extends GLTFLoader {}

/** Read the cached (normalized) GLB for an equipment URL, if loaded. */
export function getCachedEquipmentGlb(url: string): THREE.Group | undefined {
  return _equipmentGlbCache.get(url);
}

// Equipment GLB preloads — triggered at module init.
loadEquipmentGlbCached("/models/savasci-zirh.glb");
loadEquipmentGlbCached("/models/sovalye-zirh.glb");

/* ── Builders ─────────────────────────────────────────────────── */

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
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.17 * H, 0.21 * H, 0.025 * H), mat("#6b4423", { metalness: 0.5, roughness: 0.4 }));
      p.position.set(0, 0.01 * H, 0.065 * H); g.add(p); return g;
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
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.17 * H, 0.21 * H, 0.025 * H), mat("#4a5568", { metalness: 0.6, roughness: 0.3 }));
      p.position.set(0, 0.01 * H, 0.065 * H); g.add(p); return g;
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
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.17 * H, 0.21 * H, 0.025 * H), mat("#8B4513", { metalness: 0.3, roughness: 0.5 }));
      p.position.set(0, 0.01 * H, 0.065 * H); g.add(p); return g;
    },
  },

  // Şövalye — Low-poly knight with idle/walk animations
  {
    id: "skin-sevalye",
    slot: "CHEST",
    skinUrl: "/models/skin-sevalye.glb",
    build: (H) => {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.17 * H, 0.21 * H, 0.025 * H), mat("#708090", { metalness: 0.5, roughness: 0.3 }));
      p.position.set(0, 0.01 * H, 0.065 * H); g.add(p); return g;
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
