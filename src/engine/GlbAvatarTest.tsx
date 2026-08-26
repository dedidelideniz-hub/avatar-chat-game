import { Suspense, useEffect, useMemo, useRef, Component } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { useGLTF, useAnimations } from "@react-three/drei";
import { PLAYER_3D_HEIGHT, WORLD_DEPTH, WORLD_WIDTH, S } from "./constants";

/* ═══════════════════════════════════════════════════════════════
 * PHASE 1 — GLB AVATAR TEST PIPELINE  (developer-only)
 *
 * Verifies: "Can this project render a real GLB character
 * correctly inside the existing Three.js world?"
 *
 * Demonstrates:
 *   GLB model → Three.js scene → correct scale → ground position
 *   → rotation → existing scene lighting → castShadow → skeleton
 *   animation playback (idle clip).
 *
 * The existing SVG avatar (PlayerAvatar3D + AvatarPreview) remains
 * the active player rendering. This component is mounted NEXT TO
 * spawn only when `glbTest` is enabled from the debug panel.
 *
 * ═══════════════════════════════════════════════════════════════
 * PHASE 2 — CHARACTER REQUIREMENTS (future)
 *
 * RobotExpressive.glb ships with a full skeleton/armature and
 * clips: Idle, Walking, Running, Dance, Death, Jump, Punch,
 * ThumbsUp, WalkingBackwards, Wave, No, Yes, Sitting, Standing.
 * This proves the pipeline supports a rigged character whose
 * bones can drive walk/idle/arm/head animation later.
 *
 * ═══════════════════════════════════════════════════════════════
 * PHASE 3 — EQUIPMENT ARCHITECTURE (prepared, not implemented)
 *
 * See BONE_ALIASES + attachToBone below. Equipment will attach
 * as children of named bones so it follows the skeleton:
 *
 *   HEAD   → hat          HAND_L → left-hand item
 *   FACE   → face item    HAND_R → right-hand item
 *   NECK   → necklace     BODY   → clothing
 * ═══════════════════════════════════════════════════════════════ */

/** Rigged, stylized test model with skeleton + animation clips.
 *  CORS-enabled. Swap this URL for our custom character GLB later. */
const TEST_MODEL_URL =
  "https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb";

// Warm the loader cache as soon as this module is imported (dev-only
// import — tree-shaken out of the critical path until mounted).
useGLTF.preload(TEST_MODEL_URL);

/** Fixed test spot: east of spawn, on the road. SVG coords → world. */
const TEST_SPAWN_SVG = { x: 950, y: 610 };
const toWorldX = (svgX: number) => svgX / S - WORLD_WIDTH / 2;
const toWorldZ = (svgY: number) => -(svgY / S - WORLD_DEPTH / 2);

/** Yaw so the model faces the gameplay camera (+Z side). Tweak per model. */
const MODEL_YAW = 0;

/* ── PHASE 3 — bone attachment architecture ──────────────────── */

/** Maps our equipment slots to likely bone names in a character GLB.
 *  Matching is case-insensitive substring based, since naming varies
 *  between Mixamo / Blender / custom rigs. */
export const BONE_ALIASES: Record<string, string[]> = {
  HEAD: ["head", "mixamorig:head"],
  FACE: ["head", "mixamorig:head"], // face items ride the head bone
  NECK: ["neck", "mixamorig:neck"],
  BODY: ["spine", "chest", "mixamorig:spine"],
  HAND_L: ["hand_l", "handleft", "mixamorig:leftHand"],
  HAND_R: ["hand_r", "handright", "mixamorig:rightHand"],
};

/** Finds a bone by alias list. Returns null when the rig lacks it. */
export function findBone(
  root: THREE.Object3D,
  slot: keyof typeof BONE_ALIASES,
): THREE.Object3D | null {
  const aliases = BONE_ALIASES[slot];
  let found: THREE.Object3D | null = null;
  root.traverse((obj) => {
    if (found) return;
    const name = obj.name.toLowerCase();
    if (aliases.some((a) => name.includes(a))) found = obj;
  });
  return found;
}

/** Future equipment flow (not wired yet):
 *
 *  const handBone = findBone(gltfScene, "HAND_R");
 *  if (handBone) {
 *    const item = await loadItemMesh(productId); // small GLB or primitive
 *    handBone.add(item);                         // follows bone transforms
 *  }
 */
export function attachToBone(
  root: THREE.Object3D,
  slot: keyof typeof BONE_ALIASES,
  item: THREE.Object3D,
): boolean {
  const bone = findBone(root, slot);
  if (!bone) return false;
  bone.add(item);
  return true;
}

/* ── Error boundary so a failed GLB fetch can never crash the game ── */

class GlbErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <mesh position={[toWorldX(TEST_SPAWN_SVG.x), 0.5, toWorldZ(TEST_SPAWN_SVG.y)]}>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshBasicMaterial color="#ff4444" />
        </mesh>
      );
    }
    return this.props.children;
  }
}

/* ── The actual GLB test model ────────────────────────────────── */

function GlbModel() {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(TEST_MODEL_URL);
  const { actions } = useAnimations(animations, groupRef);

  // Normalize scale so the model is exactly PLAYER_3D_HEIGHT tall —
  // never trust the GLB's authored scale (Phase 2 requirement).
  const normScale = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    return PLAYER_3D_HEIGHT / Math.max(size.y, 0.0001);
  }, [scene]);

  // Enable shadow casting on every mesh.
  useEffect(() => {
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = true;
    });
  }, [scene]);

  // Play the idle clip — proves the skeleton/armature works.
  useEffect(() => {
    const idleKey =
      Object.keys(actions).find((k) => k.toLowerCase().includes("idle")) ??
      Object.keys(actions)[0];
    const action = idleKey ? actions[idleKey] : undefined;
    if (!action) return;
    action.reset().fadeIn(0.3).play();
    return () => {
      action.fadeOut(0.3);
    };
  }, [actions]);

  return (
    <group
      ref={groupRef}
      position={[toWorldX(TEST_SPAWN_SVG.x), 0, toWorldZ(TEST_SPAWN_SVG.y)]}
      rotation={[0, MODEL_YAW, 0]}
      scale={normScale}
    >
      <primitive object={scene} />
    </group>
  );
}

/** Mount this inside the existing Canvas to run the GLB test. */
export function GlbAvatarTest() {
  return (
    <GlbErrorBoundary>
      <Suspense fallback={null}>
        <GlbModel />
      </Suspense>
    </GlbErrorBoundary>
  );
}
