// 🗺️ New battle map — the user uploaded 5v5_game_map.glb environment.
//
// We rotate the model -90° around Y so its Y-up ground sits on Z-ground,
// then derive a single uniform scale from the real scene bounding box so
// the map covers the arena in both X and Z with a small margin. We lift
// the model so its top surface lands on y = 0 (fighter feet level).
//
// The static constants below are used as the initial placeholder state
// until the GLB scene loads. Once loaded, we patch the DOM group in place
// so the useGLTF cache is not re-triggered.
//
// Gameplay (movement bounds, bush stealth, projectiles) is untouched — the
// GLB is purely the environment layer underneath the existing sim.
import { Suspense, useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";

const MAP_URL = "/models/5v5_game_map.glb";

const ARENA_W = 17;
const ARENA_D = 11;
const ARENA_CX = ARENA_W / 2;
const ARENA_CZ = ARENA_D / 2;

const INITIAL_ROT_Y = -Math.PI / 2;
const INITIAL_SCALE = 1;
const INITIAL_POS = [0, 0, 0] as [number, number, number];

type ColliderRef = React.RefObject<THREE.Box3[] | null>;

function MapModelInner() {
  const { scene } = useGLTF(MAP_URL);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);

  useEffect(() => {
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
    });
  }, [clone]);

  return <primitive object={clone} />;
}

export function BattleMapModel({
  colliderRef,
}: {
  colliderRef?: ColliderRef;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!groupRef.current) return;

    const root = groupRef.current;
    root.rotation.y = INITIAL_ROT_Y;
    root.scale.setScalar(INITIAL_SCALE);
    root.position.set(INITIAL_POS[0], INITIAL_POS[1], INITIAL_POS[2]);
    root.updateMatrixWorld(true);

    const worldBox = new THREE.Box3().setFromObject(root);
    const worldMin = worldBox.min;
    const worldMax = worldBox.max;

    const mapW = worldMax.x - worldMin.x;
    const mapD = worldMax.z - worldMin.z;

    if (mapW < 0.001 || mapD < 0.001) {
      console.warn(
        "[BattleMapModel] Map bounding box too small — keeping placeholder",
      );
      return;
    }

    const margin = 1.02;
    const scaleX = (ARENA_W * margin) / Math.max(mapW, 0.001);
    const scaleZ = (ARENA_D * margin) / Math.max(mapD, 0.001);
    const scale = Math.max(scaleX, scaleZ);

    const centerX = (worldMin.x + worldMax.x) / 2;
    const centerZ = (worldMin.z + worldMax.z) / 2;
    const posX = ARENA_CX - centerX * scale;
    const posZ = ARENA_CZ - centerZ * scale;
    const posY = -worldMax.y * scale;

    root.position.set(posX, posY, posZ);
    root.scale.setScalar(scale);
    root.rotation.y = INITIAL_ROT_Y;
    root.updateMatrixWorld(true);

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
      <Suspense fallback={null}>
        <MapModelInner />
      </Suspense>
    </group>
  );
}

useGLTF.preload(MAP_URL);
