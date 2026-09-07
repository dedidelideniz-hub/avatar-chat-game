import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";

const MAP_URL = "/models/5v5_game_map.glb";
const ROT_Y = (-135 * Math.PI) / 180;
// Arena footprint in 3D units — must match Arena3D (S=50). The terrain is
// spread over this larger footprint so the map reads big and fighters small.
const ARENA_W = 34;
const ARENA_D = 22;
const ARENA_CX = ARENA_W / 2;
const ARENA_CZ = ARENA_D / 2;
/** px per 3D unit (Arena3D S) — colliders are emitted in sim px. */
const PX = 50;
const FALLBACK_SCALE = ARENA_W / 32962.3;
const FALLBACK_POS = [
  ARENA_CX - -590.9 * FALLBACK_SCALE,
  8.9 * FALLBACK_SCALE,
  ARENA_CZ - -15242.1 * FALLBACK_SCALE,
] as [number, number, number];

export interface BattleMapCollider {
  x: number;
  y: number;
  w: number;
  h: number;
}

type ColliderRef = MutableRefObject<BattleMapCollider[]>;

function meshBounds(root: THREE.Object3D, pattern: RegExp): THREE.Box3 | null {
  const bounds = new THREE.Box3();
  let found = false;
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !pattern.test(mesh.name)) return;
    bounds.union(new THREE.Box3().setFromObject(mesh));
    found = true;
  });
  return found ? bounds : null;
}

function meshCenterAvg(root: THREE.Object3D, pattern: RegExp): THREE.Vector3 | null {
  const center = new THREE.Vector3();
  let count = 0;
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !pattern.test(mesh.name)) return;
    center.add(new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()));
    count += 1;
  });
  return count ? center.multiplyScalar(1 / count) : null;
}

function MapModelInner({ colliderRef }: { colliderRef?: ColliderRef }) {
  const { scene } = useGLTF(MAP_URL);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const groupRef = useRef<THREE.Group>(null);
  const fittedRef = useRef(false);

  // Render the map with its ORIGINAL materials/textures/lighting intact.
  // Only keep large chunks from being wrongly frustum-culled by the follow
  // camera; we do NOT override transparency, opacity, color space, or
  // depth flags on the exported materials.
  useEffect(() => {
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
    });
  }, [clone]);

  useLayoutEffect(() => {
    const root = groupRef.current;
    if (!root || fittedRef.current) return;
    fittedRef.current = true;
    root.rotation.y = ROT_Y;
    root.scale.setScalar(1);
    root.position.set(0, 0, 0);
    root.updateMatrixWorld(true);

    // Fit the terrain EXACTLY onto the simulation rectangle (17 × 11) with
    // a uniform scale, so every lane/tower the player sees stands at the
    // same world coordinate the sim, colliders and the click plane use —
    // visuals can never drift apart from the walkable area.
    const terrainBox = meshBounds(root, /terrain/i);
    let scale = FALLBACK_SCALE;
    let posX = FALLBACK_POS[0];
    let posY = FALLBACK_POS[1];
    let posZ = FALLBACK_POS[2];
    if (terrainBox) {
      const size = terrainBox.getSize(new THREE.Vector3());
      if (size.x > 1 && size.z > 1) {
        scale = Math.max(
          (ARENA_W - 0.3) / size.x,
          (ARENA_D - 0.3) / size.z,
        );
        const center = terrainBox.getCenter(new THREE.Vector3());
        posX = ARENA_CX - center.x * scale;
        posY = -terrainBox.max.y * scale;
        posZ = ARENA_CZ - center.z * scale;
      }
    }
    root.scale.setScalar(scale);
    root.position.set(posX, posY, posZ);
    root.updateMatrixWorld(true);

    // Hide the terrain's huge underside/cliff art — perimeter side walls and
    // G-walls hang ~20 units below the terrain slab and read as giant white
    // raw meshes once the map is scaled down and viewed from the battle
    // camera. Anything sitting entirely below the ground plane (y < 0 after
    // the fit) is invisible from gameplay anyway, so drop it. Terrain/ground/
    // decal meshes are always kept so no walkable surface disappears.
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (/terrain|ground|decal/i.test(mesh.name || "")) return;
      if (new THREE.Box3().setFromObject(mesh).max.y < 0) {
        mesh.visible = false;
      }
    });

    const red = meshCenterAvg(root, /stationred/i);
    const blue = meshCenterAvg(root, /stationblue/i);
    console.log(
      `[BattleMapModel] fitted terrain=${terrainBox ? "found" : "fallback"} ` +
        `scale=${scale.toFixed(6)} pos=(${posX.toFixed(3)}, ${posY.toFixed(5)}, ${posZ.toFixed(3)}) ` +
        `stations=${red && blue ? "found" : "missing"}`,
    );

    if (colliderRef) {
      const colliders: BattleMapCollider[] = [];
      const collisionMesh = /(rockgroup|wildblock|blockbuff|blockboss|tower|rock|wallg|sidewall|propswall)/i;
      // Keep only local gameplay obstacles. The exported GLB also contains
      // huge perimeter walls, base scenery and duplicated wall shells; those
      // are visual art, not walk blockers.
      const excludedMesh = /(background|decal|ground|terrain|river|base(red|blue)|station)/i;
      const spawnSafeZones = [
        { x: ARENA_W / 2, z: 0.8, radius: 2.1 },
        { x: ARENA_W / 2, z: ARENA_D - 0.8, radius: 2.1 },
      ];
      const padding = 0.07;
      root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        const name = mesh.name || "";
        if (
          !mesh.isMesh ||
          !collisionMesh.test(name) ||
          excludedMesh.test(name)
        ) {
          return;
        }
        const box = new THREE.Box3().setFromObject(mesh);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        // The bases are walkable spawn platforms. Their decorative tower
        // meshes overlap the spawn coordinates, so leave a clear radius for
        // the fighter to start and move out of safely.
        if (spawnSafeZones.some((zone) =>
          Math.hypot(center.x - zone.x, center.z - zone.z) < zone.radius
        )) return;
        // Ignore any accidental backdrop-sized node even if its exported
        // name contains a gameplay keyword.
        if (size.x > 9 || size.z > 9) return;
          const minX = Math.max(0, box.min.x - padding);
          const maxX = Math.min(ARENA_W, box.max.x + padding);
          const minZ = Math.max(0, box.min.z - padding);
          const maxZ = Math.min(ARENA_D, box.max.z + padding);
          if (maxX - minX > 0.12 && maxZ - minZ > 0.12) {
            colliders.push({
              x: minX * PX,
              y: minZ * PX,
              w: (maxX - minX) * PX,
              h: (maxZ - minZ) * PX,
            });
          }
      });
      colliderRef.current.splice(0, colliderRef.current.length, ...colliders);
      console.log(`[BattleMapModel] active structure colliders=${colliders.length}`);
    }
  }, [clone, colliderRef]);

  return (
    <group ref={groupRef}>
      <primitive object={clone} />
    </group>
  );
}

export function BattleMapModel({ colliderRef }: { colliderRef?: ColliderRef }) {
  return (
    <Suspense fallback={null}>
      <MapModelInner colliderRef={colliderRef} />
    </Suspense>
  );
}

useGLTF.preload(MAP_URL);
