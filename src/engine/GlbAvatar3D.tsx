import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  Component,
} from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import { useGLTF, useAnimations } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  PLAYER_3D_HEIGHT,
  WORLD_WIDTH,
  WORLD_Z_MAX,
  S,
  type SeatState,
} from "./constants";
import { BenchSitController, captureStandingPose, findSitBones } from "./SitPose";
import { getSeatState } from "./benchSeat";
import {
  type EquipSlot,
  getEquipmentDef,
  findBone as findBoneRegistry,
  findBones as findBonesRegistry,
  MULTI_BONE_SLOTS,
  resolveSkinUrl,
} from "./EquipmentRegistry";
import { equipDebug } from "./EquipmentDebug";
import { getCachedEquipmentGlb, loadEquipmentGlbCached } from "./EquipmentBuilders";
import { resolveIdleWalk, resolveIdleWalkClips } from "./AnimationHelpers";
import {
  useRoyalWarriorEffects,
  emitWarriorPuff,
  advanceWarriorPuffs,
} from "./RoyalWarriorEffects";
import { useSamuraiBomb } from "./SamuraiBomb";
import { VendorBadge, VendorSparkle } from "./VendorSparkle";
import { ChatBubble } from "./ChatBubble3D";
import { CanvasGuard, useWebglRetry, WebglContextKeeper } from "./WebglCanvas";
import { verifiedPowerPreference } from "./webglSupport";
import { VENDOR_COLOR, isVipCharacterColor } from "@/lib/avatar";

// Re-export for backward compatibility
export type { EquipSlot, EquipmentDef } from "./EquipmentRegistry";
export { findBoneRegistry as findBone, findBonesRegistry as findBones };
export { resolveIdleWalk } from "./AnimationHelpers";

// Side-effect import: registers every procedural item into the
// EquipmentRegistry at module init (order preserved from the original
// single-file layout) and warms the equipment GLB preloads.
import "./EquipmentBuilders";

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

/* ── Karakter rengi (oyun girişinde seçilen renk) ──────────────
 * Oyuncu oyun girişinde yalnızca bir renk seçer; o renk karakterin
 * dokusuna boyanır ve hem caddede hem savaş alanında görünür.
 *
 * Paylaşımlı GLB materyalleri asla değiştirilmez: her mesh için BİR kez
 * klon üretilir ve ton her zaman klonun ASIL renginden yeniden hesaplanır
 * (lerp üstüne lerp binip rengi koyulaştırmaz). WeakMap sayesinde aynı
 * materyale ikinci kez uygulanması yeni klon üretmez.
 */
export const TINT_STRENGTH = 0.7;

/**
 * Bu parlaklığın altındaki materyaller boyanmaz. Karakter modelinde gözler
 * ve kaşlar "Black" materyalini kullanır (base color ≈ 0.046); boyanınca
 * gözler seçilen renge dönüyordu. Siyaha yakın parçalar aynı siyah kalır.
 */
const TINT_SKIP_LUMA = 0.14;

interface TintBase {
  color: THREE.Color;
  emissive: THREE.Color | null;
  /** Premium (VIP) efektten önceki temel görünüm — renk değişince geri döner. */
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
  emissiveIntensity: number | null;
}

const TINT_BASES = new WeakMap<THREE.Material, TintBase>();

/**
 * VIP premium renklerde gövdenin yarı saydamlığı. ``1``'in altında olduğu
 * için karakter ışığı geçiren, hayaletimsi bir görünüm kazanır.
 */
export const VIP_TINT_OPACITY = 0.78;
/** Premium renklerde ışıma (parlama) şiddetinin nabız merkezi/genliği. */
export const VIP_GLOW_CENTER = 0.75;
export const VIP_GLOW_AMPLITUDE = 0.45;

/** Bir karakter kökünü verilen renge boyar (renk yoksa asıl renge döner). */
export function applyCharacterTint(
  root: THREE.Object3D,
  tint?: string | null,
  strength: number = TINT_STRENGTH,
): void {
  // Renk seçilmemişse hiçbir şeye dokunma: materyaller paylaşımlı kalsın
  // (renksiz karakterler ekstra klon üretmez).
  if (!tint) return;
  const target = new THREE.Color(tint);
  // VIP üyeliğe özel premium renk: düz boyama yetmez — gövde yarı saydam
  // olur ve rengi ışır (ışıma şiddeti her karede nabız gibi salınır,
  // bkz. GlbAvatarCore → useFrame).
  const vip = isVipCharacterColor(tint);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    // Kuşanılmış eşyalar kendi renklerini korur.
    if (obj.userData?.isEquipment) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = list.map((src) => {
      let entry = TINT_BASES.get(src);
      let material = src as THREE.MeshStandardMaterial;
      if (!entry) {
        const baseColor = material.color
          ? material.color.clone()
          : new THREE.Color("#ffffff");
        // Gözler/kaşlar gibi siyaha yakın parçalar boyanmadan bırakılır.
        if (Math.max(baseColor.r, baseColor.g, baseColor.b) < TINT_SKIP_LUMA) {
          return src;
        }
        material = src.clone() as THREE.MeshStandardMaterial;
        entry = {
          color: baseColor,
          emissive: material.emissive ? material.emissive.clone() : null,
          transparent: material.transparent,
          opacity: material.opacity,
          depthWrite: material.depthWrite,
          emissiveIntensity:
            typeof material.emissiveIntensity === "number"
              ? material.emissiveIntensity
              : null,
        };
        // KRİTİK: yalnızca KLON kaydedilir. Paylaşılan kaynak materyal
        // işaretlenirse ikinci karakter klon üretmez ve paylaşılan dokuyu
        // boyar — o zaman herkes aynı renge döner (kim ne seçerse herkes
        // o renk görünür). Her karakter kendi klonunu üretmeli.
        TINT_BASES.set(material, entry);
      }
      // Önce temel görünüme dön: premium efekt bir sonraki renge sızmasın.
      material.color.copy(entry.color);
      if (entry.emissive) material.emissive.copy(entry.emissive);
      material.transparent = entry.transparent;
      material.opacity = entry.opacity;
      material.depthWrite = entry.depthWrite;
      if (entry.emissiveIntensity !== null) {
        material.emissiveIntensity = entry.emissiveIntensity;
      }
      if (target) {
        material.color.lerp(target, strength);
        material.emissive?.lerp(target, strength * 0.5);
      }
      if (vip) {
        // Yarı saydamlık: zemin/arkadaki nesneler karakterin içinden
        // hafifçe görünür — "premium" hissi veren ışıklı gövde.
        material.transparent = true;
        material.opacity = VIP_TINT_OPACITY;
        material.depthWrite = false;
        if (material.emissive) {
          material.emissive.copy(target);
          material.emissiveIntensity = VIP_GLOW_CENTER;
        }
      }
      material.needsUpdate = true;
      return material;
    });
    mesh.material = (Array.isArray(mesh.material) ? next : next[0]) as
      | THREE.Material
      | THREE.Material[];
  });
}

// Position conversion constants (mirror GameEngine3D's sX/sZ helpers).
const WORLD_W = WORLD_WIDTH / 2;
/** px katmanının y = 0 kenarı = haritanın en güney Z'si (`svgY` tersi). */
const WORLD_Z0 = WORLD_Z_MAX;

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

  equipDebug.attachStart(equipped.length, modelHeight);

  // Clean up any leftover debug markers from previous tests.
  clone.traverse((obj: THREE.Object3D) => {
    if (obj.name === '_debugMarker' || obj.name === '_debugAxes' || obj.name === '_debugCube') {
      obj.removeFromParent();
    }
  });

  if (equipped.length === 0) {
    equipDebug.skipEmpty();
    return () => {};
  }

  // Fresh world matrices so getWorldScale readings are accurate.
  clone.updateWorldMatrix(true, true);
  const rootWs = clone.getWorldScale(new THREE.Vector3());
  const expected = (rootWs.x + rootWs.y + rootWs.z) / 3 || 1;
  const boneWs = new THREE.Vector3();
  equipDebug.rootWs(rootWs, expected);

  for (const id of equipped) {
    const def = getEquipmentDef(id);
    if (!def) { equipDebug.noDef(id); continue; }
    if (!def.build) { equipDebug.noBuilder(id); continue; }

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

    equipDebug.itemHeader(id, slot, !!def.build, def.glbPath ?? "none");

    // Use GLB model if available, otherwise fall back to procedural builder.
    let item: THREE.Object3D;
    if (def.glbPath) {
      const cached = getCachedEquipmentGlb(def.glbPath);
      if (cached) {
        item = SkeletonUtils.clone(cached);
        equipDebug.glbFromCache(def.glbPath);
      } else {
        item = def.build(modelHeight); // fallback while GLB loads
        loadEquipmentGlbCached(def.glbPath); // trigger async load
        equipDebug.glbAsyncFallback(def.glbPath);
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

    // ── Weapon grip wrapper: bone → gripOffset group → weapon ──
    // Applied AFTER the bone-scale compensation below, so the grip stays
    // exact even on rigs with inflated bone hierarchies.
    let gripHost: THREE.Object3D = item;
    if (def.gripOffset) {
      const grip = new THREE.Group();
      const g = def.gripOffset;
      if (g.position) grip.position.set(...g.position);
      if (g.rotation) grip.rotation.set(...g.rotation);
      if (g.scale != null) grip.scale.setScalar(g.scale);
      grip.userData.isEquipment = true;
      grip.add(item);
      gripHost = grip;
    }

    // ── fullBody GLB: attach to root, scale to character height ──
    // The normalization step in EquipmentBuilders re-parents the meshes to
    // a clean root — its positionOffset/rotationOffset (which only
    // restored old placeholder transforms) must be reset here, otherwise
    // the whole armor lands 13 units to the side of the character.
    if (def.fullBody && def.glbPath) {
      item.position.set(0, 0, 0);
      item.rotation.set(0, 0, 0);
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
      equipDebug.fullBodyAttached(id, item.scale.x, eqPos);
      usedSlots.add(slot);
      continue;
    }

    let bones = findBonesRegistry(clone, slot);
    if (bones.length === 0) {
      equipDebug.noBone(slot, id);
      continue;
    }
    // Single-target slots (CHEST, HEAD, etc.) should only use the first
    // matching bone to avoid duplicate equipment on child bones
    // (e.g. Spine → Spine1 → Spine2 would create 3 overlapping copies).
    if (!MULTI_BONE_SLOTS.has(slot) && bones.length > 1) {
      equipDebug.singleTarget(slot, bones.length, bones[0].name);
      bones = [bones[0]];
    }
    equipDebug.foundBones(bones.map((b) => b.name), slot);

    bones.forEach((bone, i) => {
      // Only the first bone instance carries the grip wrapper (multi-bone
      // slots clone the item itself, without a duplicate grip transform).
      const inst = i === 0 ? gripHost : item.clone();
      bone.getWorldScale(boneWs);
      const boneAvg = (boneWs.x + boneWs.y + boneWs.z) / 3;

      equipDebug.bone(bone.name, bone.parent?.name, boneAvg);

      if (def.glbPath && boneAvg > 1e-6) {
        // GLB equipment: geometry already normalized to height=1.0 in cache.
        // Scale so the item matches a fixed fraction of character height.
        // worldH = localScale × boneAvg → localScale = targetWorldH / boneAvg
        const charWorldH = modelHeight * expected;
        const targetWorldH = charWorldH * 0.55;
        const localScale = targetWorldH / boneAvg;
        inst.scale.setScalar(localScale);
        equipDebug.glbScale(localScale, targetWorldH);
      } else {
        // Procedural equipment: compensate for bone scale mismatch.
        const ratio = boneAvg > 1e-6 ? expected / boneAvg : 1;
        // ALWAYS apply the compensation. The old threshold (only apply when
        // ratio>2 || ratio<0.5) let rigs whose bone scale was mildly off keep
        // builder units × a wrong multiplier — that is how armor rendered as
        // a 4-millimetre speck. Builders are authored in world units, so the
        // item must always land at the same world size.
        inst.scale.setScalar(ratio);
        equipDebug.scaleFix(ratio);
      }
      inst.updateMatrixWorld(true);
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
      equipDebug.attached(id, bone.name, inst.scale, eqWorldPos);
    });
    usedSlots.add(slot);
  }
  equipDebug.total(attached.length);
  return () => {
    for (const item of attached) item.removeFromParent();
  };
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
  /**
   * Oyuncunun oyun girişinde seçtiği karakter rengi. Verilirse model bu
   * renge boyanır — hem caddede hem savaş alanında herkes kendi rengiyle
   * görünür. Verilmezse model asıl renklerinde kalır.
   */
  tint?: string;
  /**
   * Satıcı işareti: etrafta yıldız tozu parıltısı döner ve karakterin
   * kendi ışıması nabız gibi salınır (simli görünüm).
   */
  sparkle?: boolean;
  /**
   * Doluysa karakter bir bankta oturur: bacaklar prosedürel oturma pozuna
   * yumuşakça geçer, kalça bank yüksekliğine iner ve yön bankın baktığı
   * yöne kilitlenir. `null`/`undefined` → normal ayakta/yürüyen hâl.
   */
  seat?: SeatState | null;
  /**
   * Oturma durumunu `benchSeat` deposundan oku. YALNIZCA yerel oyuncu için
   * açılır: botlar, satıcılar ve uzak oyuncular aynı bileşeni paylaştığı
   * için varsayılan `false` (yoksa hepsi birlikte otururdu).
   */
  readSeatStore?: boolean;
  /**
   * Baş üstündeki sohbet baloncuğunun metni (Sanalika/Habbo stili).
   * `null` → baloncuk yok. Süre yönetimi çağırana aittir; bkz.
   * `ChatBubble3D.CHAT_BUBBLE_MS`.
   */
  speech?: string | null;
  /** Baloncukta yazan gönderen adı (Sanalika düzeni: "İsim: mesaj"). */
  speechName?: string;
  /** Baloncuk rengi (`BUBBLE_COLORS` id'si) — VIP balon renkleri buradan gelir. */
  speechColorId?: string;
}

/** Işıması salınacak materyaller — boyanmış (klon) materyaller toplanır. */
function collectShimmerMaterials(root: THREE.Object3D) {
  const found: THREE.MeshStandardMaterial[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    if (obj.userData?.isEquipment) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      const standard = material as THREE.MeshStandardMaterial;
      if (standard.emissive) found.push(standard);
    }
  });
  return found;
}

function GlbAvatarCore({
  url,
  posRef,
  facingRef,
  equipped,
  lerpSpeed = 14,
  tint,
  sparkle = false,
  seat = null,
  readSeatStore = false,
  speech = null,
  speechName,
  speechColorId,
}: GlbAvatarCoreProps) {
  const groupRef = useRef<THREE.Group>(null);
  // Scaled inner group: model transform (scale + feet offset) lives here so
  // the per-frame world position on the outer group can never clobber it.
  const innerRef = useRef<THREE.Group>(null);

  // Oturma durumu: prop açıkça DOLU verilmişse o; yoksa YALNIZCA yerel
  // oyuncuda (`readSeatStore`) px katmanının deposu (`benchSeat`) okunur —
  // böylece oyun döngüsüne prop eklemek gerekmez. Her karede okunduğu için
  // ref'te tutulur (kare başına re-render yok).
  //
  // ⚠️ `??` ZORUNLU: `seat` prop'unun varsayılanı `null` (GlbAvatarCore,
  // GameEngine3D ve PlayerAvatar3D hepsi `null` geçirir). Eski kod
  // `seat !== undefined ? seat : …` yazıyordu; `null !== undefined` her zaman
  // TRUE olduğu için depo DALDA KOD hâline geliyordu ve `getSeatState()` HİÇ
  // çağrılmıyordu. Sonuç: "Otur" düğmesi banka durumunu yazıyor (toast çıkıyor)
  // ama avatar `null` okuduğu için ASLA oturmuyordu. `??` yalnızca dolu prop'ta
  // prop'u, null/undefined'da depoyu seçer.
  const seatRef = useRef<SeatState | null>(null);
  useFrame(() => {
    seatRef.current = seat ?? (readSeatStore ? getSeatState() : null);
  }, -1);

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
  const sitting = useMemo(() => new BenchSitController(
    clone, findSitBones(clone), captureStandingPose(clone),
  ), [clone]);
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

  // Gölge + materyal detayı.
  //
  // Gölge DÜŞÜRME (castShadow) ve gölge ALMA (receiveShadow) birlikte açılır:
  // savaş alanındaki gölge düşüren ışık (WarAtmosphere › ArenaShadowLight)
  // sayesinde karakter hem zemine gölge bırakır hem de üzerine düşen gölgeyi
  // (kemer, duvar, diğer dövüşçü) alır — düz duran bir model yerine sahnenin
  // parçası gibi okunur.
  //
  // Materyal detayı: zırh/deri ışığı hafifçe yansıtır (envMapIntensity +
  // metalness, daha pürüzsüz roughness). Model böylece "basit baloncuk"
  // görünümünden çıkıp çevre ışığını yakalar.
  useEffect(() => {
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const list = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const entry of list) {
        const material = entry as THREE.MeshStandardMaterial;
        if (!material?.isMeshStandardMaterial) continue;
        if (material.userData?.detailApplied) continue;
        material.userData = { ...material.userData, detailApplied: true };
        material.envMapIntensity = Math.max(material.envMapIntensity || 1, 0.9);
        if (typeof material.metalness === "number") {
          material.metalness = Math.min(0.85, material.metalness + 0.12);
        }
        if (typeof material.roughness === "number") {
          material.roughness = Math.max(0.25, material.roughness * 0.85);
        }
      }
    });
  }, [clone]);

  // Per-skin accent (e.g. gold Kraliyet) to keep shared-rig skins distinct.
  const skinAccent = skinUrl ? SKIN_ACCENT[skinUrl] ?? null : null;
  useEffect(() => {
    applySkinAccent(clone, skinAccent);
  }, [clone, skinAccent]);

  // Seçilen karakter rengi. Aksan renginden SONRA uygulanır, böylece zırh
  // tonu korunur ve oyuncunun rengi üstüne biner.
  useEffect(() => {
    applyCharacterTint(clone, tint);
  }, [clone, tint]);

  // Resolve idle/walk clips once. Prefer a real walk cycle over run so the
  // feet visibly alternate while the avatar moves through the world.
  const clips = useMemo(() => resolveIdleWalkClips(actions), [actions]);

  // Movement/animation state (refs — zero React re-renders per frame).
  const movingRef = useRef(false);
  const currentClip = useRef<"idle" | "walk">("idle");
  useEffect(() => {
    mixer.stopAllAction();
    mixer.setTime(0);
    Object.values(actions).forEach((action) => action?.reset());
    movingRef.current = false;
    currentClip.current = "idle";
    const key = clips.idle ?? Object.keys(actions)[0];
    if (key) actions[key]?.reset().play();
  }, [effectiveUrl, mixer, actions, clips]);

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

  // ── Satıcı kafa hareketi (SADECE kafa) ────────────────────────
  // Tezgâh başındaki satıcı yerinde durduğu için gövde, omuzlar ve
  // ayaklar tamamen sabit kalır; yalnızca HEAD kemiğinin yerel Y ekseni
  // sağa-sola döner ("etrafı kolaçan etme"). Bone rotasyonu gövdeye
  // değil sadece kafaya ve ona bağlı eşyalara (şapka vb.) uygulanır.
  const headBone = useMemo(
    () => (sparkle ? findBoneRegistry(clone, "HEAD") : null),
    [clone, sparkle],
  );
  /** Kafanın dinlenme açısı — ilk karede yakalanır, her karede üstüne eklenir. */
  const headRestY = useRef<number | null>(null);
  /** Karakter başına rastgele faz: satıcılar senkron hareket etmesin. */
  const headScanPhase = useRef(Math.random() * Math.PI * 2);

  // ── VIP premium renk: yarı saydam gövde + ışıma nabzı ─────────
  // Renk seçilmemişse (undefined) hiçbir maliyet yok; yalnızca VIP
  // renklerinde materyaller toplanıp ışıma şiddeti salınır.
  const premiumTint = useMemo(() => isVipCharacterColor(tint), [tint]);
  const glowMats = useRef<THREE.MeshStandardMaterial[]>([]);
  const glowKeyRef = useRef<string | null>(null);

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
    const bob = seatRef.current || movingRef.current ? 0 : 0.012 + Math.sin(idleBobPhase.current * 2.2) * 0.012;
    inner.position.y = feetOffset * normScale + bob;

    // Short eased scale pulse.
    if (seatRef.current) {
      bounceRef.current = 0;
      inner.scale.setScalar(normScale);
    } else if (bounceRef.current > 0) {
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

  // ── Kraliyet Savaşçısı visual effects (gear + sparkles + pulse) ──
  const { royalSkin, warriorSmoke, warriorSmokeClock } = useRoyalWarriorEffects(
    clone,
    skinUrl,
    equipped,
    modelHeight,
    innerRef,
    flashRef,
    movingRef,
  );

  // ── 🧨 Samuray: elinde bomba (sokak ve arena aynı katmanı kullanır) ──
  useSamuraiBomb(clone, skinUrl);

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
    group.position.set(sp.x / S - WORLD_W, 0.02, WORLD_Z0 - sp.y / S);

    const activeSeat = seatRef.current;
    if (activeSeat && !sitting.seated) {
      const idleKey = clips.idle ?? Object.keys(actions)[0];
      sitting.sitOnBench(mixer, idleKey ? actions[idleKey] : null);
      movingRef.current = false;
      currentClip.current = "idle";
    } else if (!activeSeat && sitting.seated) {
      sitting.unsit(mixer);
      if (innerRef.current) {
        innerRef.current.rotation.x = 0;
        innerRef.current.position.set(0, feetOffset * normScale, 0);
      }
      const key = clips.idle ?? Object.keys(actions)[0];
      if (key) actions[key]?.reset().play();
      // Kalkışta bankın üzerinden lerp etme; oyun döngüsü ön noktayı seçer.
      sp.x = p.x;
      sp.y = p.y;
      group.position.set(p.x / S - WORLD_W, 0.02, WORLD_Z0 - p.y / S);
    }

    // Walking detection from position delta (same threshold as SVG avatar).
    const dx = Math.abs(p.x - sp.x);
    const dy = Math.abs(p.y - sp.y);
    const moving = !activeSeat && (dx > 0.3 || dy > 0.3);

    // Crossfade idle ↔ walk.
    if (!activeSeat && moving !== movingRef.current) {
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
    if (activeSeat) {
      targetYaw.current = activeSeat.yaw;
      group.rotation.y = activeSeat.yaw;
    } else if (moving) {
      const dxw = (p.x - sp.x) / S;
      const dzw = -(p.y - sp.y) / S;
      targetYaw.current = Math.atan2(dxw, dzw);
    }
    let diff = targetYaw.current - group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    group.rotation.y += diff * Math.min(1, 10 * dt);

    if (royalSkin && moving) {
      emitWarriorPuff(warriorSmoke, warriorSmokeClock, dt);
    }
    advanceWarriorPuffs(warriorSmoke, dt);

    // Satıcı simi: boyanmış materyallerin ışıması nabız gibi salınır.
    // Liste ilk karede toplanır, yani renk tonu uygulandıktan SONRAKİ
    // (klon) materyaller kullanılır ve paylaşımlı GLB materyalleri
    // etkilenmez.
    if (sparkle) {
      if (shimmerMats.current.length === 0) {
        shimmerMats.current = collectShimmerMaterials(group);
      }
      const mats = shimmerMats.current;
      for (let i = 0; i < mats.length; i++) {
        mats[i].emissiveIntensity = 0.85 + 0.65 * Math.sin(
          state.clock.elapsedTime * 2.6 + i * 0.7,
        );
      }

      // Kafa sağa-sola taraması. İki farklı frekansın toplamı, tekdüze bir
      // sarkaç yerine doğal bir "bakınma" hissi verir; hedefe yumuşak
      // yaklaşılır ki hareket ani sıçramasın. Gövde hiç dokunulmaz.
      if (headBone) {
        if (headRestY.current === null) headRestY.current = headBone.rotation.y;
        const ht = state.clock.elapsedTime + headScanPhase.current;
        const scan =
          Math.sin(ht * 0.55) * 0.55 + // ana sağ-sol tarama (~±31°)
          Math.sin(ht * 1.75 + 0.9) * 0.07; // küçük doğal titreşim
        const next = headRestY.current + scan;
        headBone.rotation.y += (next - headBone.rotation.y) * Math.min(1, 7 * dt);
      }
    }

    // VIP premium renk: gövdenin ışıması nabız gibi salınır (parlar).
    // Liste yalnızca gerektiğinde — yani karakter VIP rengindeyse ve renk
    // değiştiyse — yeniden toplanır, böylece eski (öksüz) materyaller
    // üzerinde çalışılmaz.
    if (premiumTint) {
      if (glowKeyRef.current !== tint) {
        glowKeyRef.current = tint ?? null;
        glowMats.current = collectShimmerMaterials(group);
      }
      const glow = glowMats.current;
      for (let i = 0; i < glow.length; i++) {
        glow[i].emissiveIntensity =
          VIP_GLOW_CENTER +
          VIP_GLOW_AMPLITUDE * Math.sin(state.clock.elapsedTime * 2.1 + i * 0.6);
      }
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
  const shimmerMats = useRef<THREE.MeshStandardMaterial[]>([]);

  useFrame(() => {
    const key = equipped.join(",");
    if (key !== equippedRef.current || !equipAttachedFrame.current) {
      equipDebug.reattach(equippedRef.current, key, !equipAttachedFrame.current);
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

  // Mixer, konum ve ekipman güncellemelerinden sonra deterministik poz.
  useFrame((_, dt) => {
    const inner = innerRef.current;
    const group = groupRef.current;
    const activeSeat = seatRef.current;
    if (!inner || !group || !activeSeat) return;
    sitting.update(inner, group, activeSeat.facing, dt);
  });

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
      {/* Karakter rengi halkası (MOBA takım rengi mantığı): ayakların
          altındaki ince halka, rengi modelden bağımsız olarak her mesafeden
          okunur — uzaktan da "kim hangi renkte" belli olur. */}
      {tint && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
            <ringGeometry args={[0.33, 0.46, 32]} />
            <meshBasicMaterial
              color={tint}
              transparent
              opacity={0.6}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <circleGeometry args={[0.33, 28]} />
            <meshBasicMaterial
              color={tint}
              transparent
              opacity={0.16}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        </>
      )}
      {/* Satıcı parıltısı: dış grupta (ölçeksiz) durur, görsel efektin
          boyutu karakter ölçeğinden bağımsız kalır. */}
      {sparkle && <VendorSparkle color={tint ?? VENDOR_COLOR} />}
      {/* Satıcı rozeti: başının üstünde süzülen, dönen altın sikke. */}
      {sparkle && (
        <VendorBadge height={PLAYER_3D_HEIGHT} color={VENDOR_COLOR} />
      )}
      {/* 💬 SOHBET BALONCUĞU — başın üstünde, Sanalika/Habbo stili.
          Dış grupta durur (ölçekli iç grupta DEĞİL): baloncuk karakter
          ölçeğinden bağımsız, sabit ve okunur kalır. Dış grup yön
          (rotation.y) ile döner ama `distanceFactor` verildiğinde drei
          `<Html>` dönüşü DOM'a taşımaz → yazı hiçbir yönde ters görünmez. */}
      <ChatBubble
        text={speech}
        name={speechName}
        colorId={speechColorId}
      />
    </group>
  );
}

/* ── Public component with fallback-model retry ───────────────── */

export interface GlbAvatar3DProps {
  posRef: React.RefObject<{ x: number; y: number }>;
  facingRef: React.RefObject<number>;
  equipped: string[];
  lerpSpeed?: number;
  /** Karakter rengi (oyun girişindeki renk seçimi). */
  tint?: string;
  /** Satıcı parıltısı (simli görünüm + yıldız tozu). */
  sparkle?: boolean;
  /** Doluysa karakter bankta oturur (bkz. `SeatState`). */
  seat?: SeatState | null;
  /** Oturma durumunu `benchSeat` deposundan oku (yalnızca yerel oyuncu). */
  readSeatStore?: boolean;
  /** Baş üstündeki sohbet baloncuğu metni (Sanalika/Habbo stili). */
  speech?: string | null;
  /** Baloncukta görünen gönderen adı. */
  speechName?: string;
  /** Baloncuk rengi (`BUBBLE_COLORS` id'si). */
  speechColorId?: string;
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
  /**
   * Oyun girişinde seçilen "karakter rengi". Verilirse modelin dokusu bu
   * renge doğru yumuşakça boyanır (siluet + zırh tonu), böylece oyuncu
   * seçimini anında görür. Gameplay avatarları bundan etkilenmez.
   */
  tint?: string;
  /**
   * Hareket durumu (oda): `true` iken YÜRÜME klibi oynatılır. Verilmezse
   * (seçim ekranı) yalnızca idle çalar. Kare başına yeniden render olmasın
   * diye ref ile verilir (`RoomCharacter` her karede yazar).
   */
  movingRef?: React.RefObject<boolean>;
}

/** Static character shown facing the camera with its idle animation. */
function GlbPortraitCore({
  url,
  equipped,
  height,
  spin,
  tint,
  movingRef,
}: PortraitCoreProps) {
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

  // Karakter rengi: oyun girişindeki renk seçimi (bkz. applyCharacterTint).
  useEffect(() => {
    applyCharacterTint(clone, tint);
  }, [clone, tint]);

  // IDLE ↔ WALK. `movingRef` verilirse (oda) hareket hâlinde yürüme klibi
  // çapraz geçişle çalınır — karakter kayarak değil, YÜRÜYEREK gider.
  // Verilmezse (seçim ekranı) yalnızca idle oynar.
  const portraitClips = useRef<{ idle?: string; walk?: string }>({});
  const portraitClip = useRef<"idle" | "walk">("idle");
  useEffect(() => {
    const clips = resolveIdleWalk(actions);
    portraitClips.current = clips;
    const key = clips.idle ?? Object.keys(actions)[0];
    const action = key ? actions[key] : undefined;
    if (!action) return;
    action.reset().fadeIn(0.3).play();
    portraitClip.current = "idle";
    return () => {
      action.fadeOut(0.3);
    };
  }, [actions]);

  useFrame(() => {
    if (!movingRef) return;
    const want: "idle" | "walk" = movingRef.current ? "walk" : "idle";
    if (want === portraitClip.current) return;
    const clips = portraitClips.current;
    const fromKey = portraitClip.current === "idle" ? clips.idle : clips.walk;
    const toKey = want === "idle" ? clips.idle : clips.walk;
    const to = toKey ? actions[toKey] : undefined;
    if (!to) return; // yürüme klibi yoksa idle'da kal (donma yok)
    const from = fromKey ? actions[fromKey] : undefined;
    from?.fadeOut(0.2);
    to.reset().fadeIn(0.2).play();
    portraitClip.current = want;
  });

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
  /** Karakter rengi (oyun girişindeki renk seçimi) — modele boyanır. */
  tint?: string;
  /**
   * HAREKET ref'i (oda): doluysa `true` iken yürüme klibi çalınır ve karakter
   * kaymak yerine yürür. Verilmezse davranış eskisi gibi (idle).
   */
  movingRef?: React.RefObject<boolean>;
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
  tint,
  movingRef,
}: GlbCharacterPortraitProps) {
  const primary = characterModelUrl();
  const core = (url: string) => (
    <GlbPortraitCore
      url={url}
      equipped={equipped}
      height={height}
      spin={spin}
      tint={tint}
      movingRef={movingRef}
    />
  );

  if (primary === FALLBACK_MODEL_URL) {
    return <Suspense fallback={null}>{core(primary)}</Suspense>;
  }
  return (
    <GlbModelBoundary
      fallback={
        <Suspense fallback={null}>{core(FALLBACK_MODEL_URL)}</Suspense>
      }
    >
      <Suspense fallback={null}>{core(primary)}</Suspense>
    </GlbModelBoundary>
  );
}

/* ── Profile card avatar (self-contained mini Canvas) ──────────── */

interface ProfileModelProps {
  url: string;
  equipped: string[];
  height: number;
  /** Oyuncunun seçtiği karakter rengi (profil kartı da aynı renkte görünsün). */
  tint?: string;
}

/**
 * Character shown in the profile card: plays the idle animation and
 * periodically looks left/right (head/eye motion) instead of staring
 * straight ahead. Faces the camera at all times.
 */
function GlbProfileModel({ url, equipped, height, tint }: ProfileModelProps) {
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

  // Karakter rengi (profil kartı oyundaki karakterle aynı renkte olsun).
  useEffect(() => {
    applyCharacterTint(clone, tint);
  }, [clone, tint]);

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
  /** Karakter rengi — oyundaki karakterle aynı renkte görünmesi için. */
  tint?: string;
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
  tint,
}: GlbProfileAvatarProps) {
  const primary = characterModelUrl();
  // 🧯 Önizleme avatarı da bağlam yuvası doluysa yeni canvas ile yeniden
  // denenir ve denemeler tükendiğinde ÇÖKMEK yerine sessizce kaybolur.
  // Bu canvas tam olarak oda yedeği/bağlam baskısı anında açılabildiği için
  // korumasız kalması `Error creating WebGL context` ile oyunu düşürebiliyordu.
  const { attempt, exhausted, handleCreated } = useWebglRetry(2);
  // Bağlam yuvası yoksa (`CanvasGuard` → `onUnavailable`) avatar da ÇİZİLMEZ:
  // denemeye kalkışmak yeni bir hata üretir, oysa kart avatarsız da okunur.
  const [noGpuSlot, setNoGpuSlot] = useState(false);
  if (exhausted || noGpuSlot) return null;

  const sceneFor = (url: string) => (
    <Canvas
      key={attempt}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, height * 1.7], fov: 35 }}
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: verifiedPowerPreference(),
      }}
      style={{ background: "transparent" }}
      onCreated={({ gl }) => {
        // This second canvas can cause the browser to evict the main game
        // context — allow clean restore for both directions.
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
        });
      }}
    >
      {/* Küçük önizleme sahneleri feda edilebilir: yer gerekirse bağlamları
          İLK bunlar bırakılır ve kart kapanınca bağlam serbest kalır. */}
      <WebglContextKeeper priority={10} onCreated={handleCreated} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[2, 3, 4]} intensity={1.4} />
      <Suspense fallback={null}>
        <GlbProfileModel
          url={url}
          equipped={equipped}
          height={height}
          tint={tint}
        />
      </Suspense>
    </Canvas>
  );

  return (
    <div className={className}>
      <CanvasGuard
        resetKey={attempt}
        onUnavailable={() => setNoGpuSlot(true)}
      >
        {primary === FALLBACK_MODEL_URL ? (
          sceneFor(primary)
        ) : (
          <GlbModelBoundary fallback={sceneFor(FALLBACK_MODEL_URL)}>
            {sceneFor(primary)}
          </GlbModelBoundary>
        )}
      </CanvasGuard>
    </div>
  );
}
