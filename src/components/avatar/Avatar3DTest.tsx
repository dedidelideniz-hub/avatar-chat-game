import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

export default function Avatar3DTest() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Test amacıyla çok hafif nefes alma animasyonu
    const t = performance.now() * 0.002;

    groupRef.current.position.y = Math.sin(t) * 0.01;
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>

      {/* BODY */}
      <mesh position={[0, 0.75, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.65, 6, 12]} />
        <meshStandardMaterial color="#4f7cff" />
      </mesh>

      {/* HEAD */}
      <mesh position={[0, 1.35, 0]} castShadow>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial color="#f2c7a5" />
      </mesh>

      {/* LEFT ARM */}
      <mesh position={[-0.32, 0.78, 0]} rotation={[0, 0, -0.15]} castShadow>
        <capsuleGeometry args={[0.08, 0.45, 4, 8]} />
        <meshStandardMaterial color="#4f7cff" />
      </mesh>

      {/* RIGHT ARM */}
      <mesh position={[0.32, 0.78, 0]} rotation={[0, 0, 0.15]} castShadow>
        <capsuleGeometry args={[0.08, 0.45, 4, 8]} />
        <meshStandardMaterial color="#4f7cff" />
      </mesh>

      {/* LEFT LEG */}
      <mesh position={[-0.12, 0.3, 0]} castShadow>
        <capsuleGeometry args={[0.09, 0.4, 4, 8]} />
        <meshStandardMaterial color="#222222" />
      </mesh>

      {/* RIGHT LEG */}
      <mesh position={[0.12, 0.3, 0]} castShadow>
        <capsuleGeometry args={[0.09, 0.4, 4, 8]} />
        <meshStandardMaterial color="#222222" />
      </mesh>

    </group>
  );
}