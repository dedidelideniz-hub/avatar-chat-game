import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

/**
 * 3D tree layer — sits behind <main> as a full-viewport background.
 * Simple perspective camera, no SVG sync for now — just prove rendering works.
 */

function Tree3D({
  position,
  scale = 1,
  variant = 0,
  windOffset = 0,
}: {
  position: [number, number, number];
  scale?: number;
  variant?: number;
  windOffset?: number;
}) {
  const leafRef = useRef<THREE.Group>(null);

  const palettes = [
    { trunk: "#b87a3d", trunkDark: "#8a5a28", leaves: ["#2d9a3a", "#3aad48", "#44b852", "#5ed06a", "#80e878", "#38a845", "#60c858", "#48b44e"] },
    { trunk: "#a06830", trunkDark: "#784e20", leaves: ["#1a8a6a", "#22a07a", "#28a880", "#38c090", "#50d8a0", "#209a75", "#32b888", "#26a57d"] },
    { trunk: "#b07038", trunkDark: "#885528", leaves: ["#4a9a30", "#55a838", "#5cb840", "#6cc850", "#88e068", "#50a535", "#62b842", "#58a838"] },
  ];
  const p = palettes[variant % palettes.length];

  useFrame((state) => {
    if (!leafRef.current) return;
    const t = state.clock.elapsedTime;
    const sway =
      Math.sin(t * 1.2 + windOffset) * 0.04 +
      Math.sin(t * 2.7 + windOffset * 1.5) * 0.02;
    leafRef.current.rotation.z = sway;
  });

  // Leaf cluster positions (grow upward from trunk)
  const clusters: [number, number, number][] = [
    [0, 1.6, 0], [-0.5, 1.4, 0.2], [0.5, 1.5, -0.2],
    [0, 2.0, 0], [-0.3, 2.2, 0.1], [0.3, 2.1, -0.1],
    [0, 2.5, 0], [0.6, 1.3, 0.3], [-0.6, 1.7, -0.2],
  ];
  const radii = [0.7, 0.55, 0.5, 0.6, 0.45, 0.42, 0.38, 0.4, 0.45];

  return (
    <group position={position} scale={[scale, scale, scale]}>
      {/* Shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.8, 12]} />
        <meshBasicMaterial color="#000" transparent opacity={0.15} depthWrite={false} />
      </mesh>

      {/* Trunk */}
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.06, 0.12, 1.8, 8]} />
        <meshStandardMaterial color={p.trunk} flatShading />
      </mesh>

      {/* Left branch */}
      <mesh position={[-0.3, 1.2, 0.1]} rotation={[0, 0, 0.5]}>
        <cylinderGeometry args={[0.02, 0.04, 0.6, 6]} />
        <meshStandardMaterial color={p.trunk} flatShading />
      </mesh>

      {/* Right branch */}
      <mesh position={[0.35, 1.3, -0.1]} rotation={[0, 0, -0.4]}>
        <cylinderGeometry args={[0.02, 0.035, 0.5, 6]} />
        <meshStandardMaterial color={p.trunk} flatShading />
      </mesh>

      {/* Leaf clusters */}
      <group ref={leafRef}>
        {clusters.map((pos, i) => (
          <mesh key={i} position={pos}>
            <icosahedronGeometry args={[radii[i], 1]} />
            <meshStandardMaterial color={p.leaves[i]} flatShading />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function StreetScene3D() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    >
      <Canvas
        camera={{ position: [0, 1.5, 5], fov: 50 }}
        gl={{ antialias: true }}
        dpr={[1, 1.5]}
        onCreated={({ gl }) => {
          (gl.domElement as HTMLCanvasElement).style.pointerEvents = "none";
          gl.setClearColor(0x2a1a3a, 1); // purple bg — MUST be visible
        }}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <ambientLight intensity={0.6} color="#b8d0e8" />
        <directionalLight position={[3, 5, 4]} intensity={1.5} color="#fff8e0" />
        <hemisphereLight args={["#87ceeb", "#3a7a3a", 0.4]} />

        {/* 3 trees */}
        <Tree3D position={[-2, 0, 0]} scale={0.8} variant={0} windOffset={0} />
        <Tree3D position={[0, 0, -0.5]} scale={1.0} variant={1} windOffset={2.1} />
        <Tree3D position={[2, 0, 0.3]} scale={0.7} variant={2} windOffset={4.2} />

        {/* Ground plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial color="#5a9a4a" />
        </mesh>
      </Canvas>
    </div>
  );
}
