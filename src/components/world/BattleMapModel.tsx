// 🗺️ New battle map — the user-uploaded 5v5_game_map.glb environment.
//
// Layout transform (verified against the real GLB geometry):
//   * rotate -135° around Y → the Red base ends up at the top of the screen
//     and the Blue base at the bottom, aligned on the arena's vertical axis;
//   * uniform scale so the Red↔Blue base distance fills most of the arena
//     depth (bases sit near the top/bottom spawn lines);
//   * lift the model so the walkable ground top (model y ≈ -8.9) lands on
//     y = 0 — exactly where the fighters' feet stand.
//
// The transform is applied once the GLB is actually mounted (inside the
// Suspense boundary), so it can never run against an empty scene — the bug
// that previously left the map invisible. If the two base station meshes
// are found we derive the scale/position from them at runtime (robust to
// re-exports); otherwise a fixed fallback keeps the same layout.
//
// Gameplay (movement bounds, bush stealth, projectiles) is untouched — the
// GLB is purely the environment layer underneath the existing sim.
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";

const MAP_URL = "/models/5v5_game_map.glb";

const ROT_Y = (-135 * Math.PI) / 180;

// Arena footprint (world units). BattleScene maps 1700×1100 px onto this.
const ARENA_W = 17;
const ARENA_D = 11;
const ARENA_CX = ARENA_W / 2;
const ARENA_CZ = ARENA_D / 2;

// Fixed layout targets (world units).
//   * The Red/Blue spawn stations sit on the arena vertical axis. We want
//     red around z ≈ 1.0 and blue around z ≈ 10.0.
//   * Measured in the model: after -135°, Red station center is at
//     (x ≈ -591, z ≈ -15242), Blue at (x ≈ -526, z ≈ 17720), separation
//     32962 model units. Ground surface top ≈ model y = -8.9.
const RED_Z_MODEL = -15242.1;
const RED_X_MODEL = -590.9;
const BASE_SEP_MODEL = 32962.3;
const RED_WORLD_Z = 1.0;
const BLUE_WORLD_Z = 10.0;
const GROUND_TOP_MODEL = 8.9; // lift so model y = -8.9 lands on y = 0

const FALLBACK_SCALE = (BLUE_WORLD_Z - RED_WORLD_Z) / BASE_SEP_MODEL;
const FALLBACK_POS = [
  ARENA_CX - RED_X_MODEL * FALLBACK_SCALE,
  GROUND_TOP_MODEL * FALLBACK_SCALE,
  RED_WORLD_Z - RED_Z_MODEL * FALLBACK_SCALE,
] as [number, number, number];

type ColliderRef = React.RefObject<THREE.Box3[] | null>;

/** Union the world-space bounds of meshes matching a pattern. */
function meshBounds(
  root: THREE.Object3D,
  pattern: RegExp,
): THREE.Box3 | null {
  const bounds = new THREE.Box3();
  let found = false;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !pattern.test(mesh.name)) return;
    bounds.union(new THREE.Box3().setFromObject(mesh));
    found = true;
  });
  return found ? bounds : null;
}

/** Average world position of all meshes whose name matches a pattern. */
function meshCenterAvg(
  root: THREE.Object3D,
  pattern: RegExp,
): THREE.Vector3 | null {
  const acc = new THREE.Vector3();
  let n = 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!pattern.test(mesh.name)) return;
    const box = new THREE.Box3().setFromObject(mesh);
    acc.add(box.getCenter(new THREE.Vector3()));
    n++;
  });
  if (n === 0) return null;
  acc.divideScalar(n);
  return acc;
}

// Inner loader — the actual GLB scene, cloned so double-mounts / fast
// refresh never share a disposed scene.
function MapModelInner({ colliderRef }: { colliderRef?: ColliderRef }) {
  const { scene } = useGLTF(MAP_URL);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const groupRef = useRef<THREE.Group>(null);
  const fittedRef = useRef(false);

  // Static environment: no real-time shadow passes over a huge terrain.
  useEffect(() => {
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      // The uploaded asset contains large terrain chunks and many foliage
      // meshes. Keep them visible after the parent fit transform; otherwise
      // Three's local-space frustum bounds can cull chunks at the edge of the
      // follow camera even though their world-space bounds are on screen.
      mesh.frustumCulled = false;
      mesh.renderOrder = 0;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        if (!material) continue;
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
        material.needsUpdate = true;
        const textured = material as THREE.MeshStandardMaterial;
        if (textured.map) {
          textured.map.colorSpace = THREE.SRGBColorSpace;
          textured.map.needsUpdate = true;
        }
      }
    });
  }, [clone]);

  // Fit the map once the clone is mounted (guaranteed to have geometry).
  useLayoutEffect(() => {
    const root = groupRef.current;
    if (!root || fittedRef.current) return;
    fittedRef.current = true;

    root.rotation.y = ROT_Y;
    root.scale.setScalar(1);
    root.position.set(0, 0, 0);
    root.updateMatrixWorld(true);

    // The playable terrain is a much better fit reference than the decorative
    // bases: the base meshes include large backdrop pieces, so station-to-
    // station fitting leaves most of the actual walkable field floating in a
    // small island with empty margins around it. Fit the terrain itself to the
    // 17×11 gameplay rectangle and center it on the same coordinates used by
    // fighters, projectiles and bushes.
    const terrainBox = meshBounds(root, /terrain/i);

    let scale = FALLBACK_SCALE;
    let posX = FALLBACK_POS[0];
    let posZ = FALLBACK_POS[2];
    let posY = FALLBACK_POS[1];

    if (terrainBox) {
      const terrainSize = terrainBox.getSize(new THREE.Vector3());
      if (terrainSize.x > 1 && terrainSize.z > 1) {
        scale = Math.min(
          (ARENA_W - 0.8) / terrainSize.x,
          (ARENA_D - 0.8) / terrainSize.z,
        );
        const terrainCenter = terrainBox.getCenter(new THREE.Vector3());
        posX = ARENA_CX - terrainCenter.x * scale;
        posZ = ARENA_CZ - terrainCenter.z * scale;
        // Put the upper walkable terrain surface at y=0. Lower river/edge
        // geometry remains below the fighters instead of clipping through
        // their feet or being hidden by the safety floor.
        posY = -terrainBox.max.y * scale;
      }
    }

    // Keep the station lookup as a diagnostic: it confirms the expected
    // Sketchfab nodes exist without letting their oversized backdrops decide
    // the playable map scale.
    const redC = meshCenterAvg(root, /stationred/i);
    const blueC = meshCenterAvg(root, /stationblue/i);

    root.scale.setScalar(scale);
    root.position.set(posX, posY, posZ);
    root.updateMatrixWorld(true);

    console.log(
      `[BattleMapModel] fitted: scale=${scale.toFixed(6)} pos=(${posX.toFixed(
        3,
      )}, ${posY.toFixed(5)}, ${posZ.toFixed(3)}) terrain=${
        terrainBox ? "found" : "fallback"
      } stations=${
        redC && blueC ? "found" : "missing"
      }`,
    );

    // Report the arena-covering boundary box (the sim's own movement clamp
    // keeps fighters on the field; this is a THREE-side equivalent).
    if (colliderRef?.current) {
      colliderRef.current.length = 0;
      colliderRef.current.push(
        new THREE.Box3(
          new THREE.Vector3(0, -10, 0),
          new THREE.Vector3(ARENA_W, 10, ARENA_D),
        ),
      );
    }
  }, []);

  return (
    <group ref={groupRef}>
      <primitive object={clone} />
    </group>
  );
}

export function BattleMapModel({
  colliderRef,
}: {
  colliderRef?: ColliderRef;
}) {
  return (
    <group>
      <Suspense fallback={null}>
        <MapModelInner colliderRef={colliderRef} />
      </Suspense>
    </group>
  );
}

useGLTF.preload(MAP_URL);
