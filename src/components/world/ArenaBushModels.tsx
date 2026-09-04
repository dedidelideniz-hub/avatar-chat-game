import { Suspense } from "react";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";

const MODEL_URL = "/models/stylized_bush.glb";
const S = 100;

type Bush = { x: number; y: number; w: number; h: number; kind: string };

function BushModel({
  x,
  y,
  width,
  depth,
}: {
  x: number;
  y: number;
  width: number;
  depth: number;
}) {
  const { scene } = useGLTF(MODEL_URL);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { scale, offset } = useMemo(() => {
    clone.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    return {
      scale: Math.min(
        width * 0.92 / Math.max(size.x, 0.0001),
        depth * 0.92 / Math.max(size.z, 0.0001),
        1.65 / Math.max(size.y, 0.0001),
      ),
      offset: [-box.min.x - size.x / 2, -box.min.y, -box.min.z - size.z / 2] as [number, number, number],
    };
  }, [clone, depth, width]);

  useEffect(() => {
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
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
    <group position={[x / S + width / 2, 0, y / S + depth / 2]}>
      <group position={offset} scale={scale}>
        <primitive object={clone} />
      </group>
    </group>
  );
}

function BushModelWithFallback(props: { x: number; y: number; width: number; depth: number }) {
  const fallback = (
    <mesh position={[props.x / S + props.width / 2, 0.28, props.y / S + props.depth / 2]}>
      <sphereGeometry args={[Math.min(props.width, props.depth) * 0.42, 14, 10]} />
      <meshStandardMaterial color="#3e8e41" roughness={0.95} />
    </mesh>
  );
  return <Suspense fallback={fallback}><BushModel {...props} /></Suspense>;
}

export function ArenaBushModels({ obstacles }: { obstacles: readonly Bush[] }) {
  return (
    <group>
      {obstacles.filter((obstacle) => obstacle.kind === "bush").map((obstacle, index) => (
        <BushModelWithFallback
          key={`${obstacle.x}-${obstacle.y}-${index}`}
          x={obstacle.x}
          y={obstacle.y}
          width={obstacle.w / S}
          depth={obstacle.h / S}
        />
      ))}
    </group>
  );
}

useGLTF.preload(MODEL_URL);
