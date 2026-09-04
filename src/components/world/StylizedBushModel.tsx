import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";

const STYLIZED_BUSH_URL = "/models/stylized_bush.glb";

interface StylizedBushModelProps {
  position: [number, number, number];
  width: number;
  depth: number;
}

export function StylizedBushModel({
  position,
  width,
  depth,
}: StylizedBushModelProps) {
  const { scene } = useGLTF(STYLIZED_BUSH_URL);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { scale, offset } = useMemo(() => {
    clone.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const safeX = Math.max(size.x, 0.0001);
    const safeY = Math.max(size.y, 0.0001);
    const safeZ = Math.max(size.z, 0.0001);
    return {
      // Fit the asset to each existing stealth rectangle and cap its height
      // so the bush remains a low piece of cover beside the fighters.
      scale: Math.min(
        (width * 0.92) / safeX,
        (depth * 0.92) / safeZ,
        1.65 / safeY,
      ),
      offset: [
        -box.min.x - size.x / 2,
        -box.min.y,
        -box.min.z - size.z / 2,
      ] as [number, number, number],
    };
  }, [clone, depth, width]);

  useEffect(() => {
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => material.clone())
        : mesh.material.clone();
    });
  }, [clone]);

  return (
    <group position={position}>
      <group position={offset} scale={scale}>
        <primitive object={clone} />
      </group>
    </group>
  );
}

useGLTF.preload(STYLIZED_BUSH_URL);
