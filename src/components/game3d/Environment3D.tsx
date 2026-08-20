import { memo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { VENDORS, type Vendor } from "@/lib/shop";

/**
 * 3D Environment — trees, stalls, lamps, benches, flower boxes, hedges.
 * All positioned at SVG world coordinates mapped to 3D space.
 */

// ── Trees (3D puffy style) ──
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
    { trunk: "#b87a3d", leaves: ["#2d9a3a", "#3aad48", "#44b852", "#5ed06a", "#80e878", "#38a845", "#60c858", "#48b44e"] },
    { trunk: "#a06830", leaves: ["#1a8a6a", "#22a07a", "#28a880", "#38c090", "#50d8a0", "#209a75", "#32b888", "#26a57d"] },
    { trunk: "#b07038", leaves: ["#4a9a30", "#55a838", "#5cb840", "#6cc850", "#88e068", "#50a535", "#62b842", "#58a838"] },
  ];
  const p = palettes[variant % palettes.length];

  useFrame((state) => {
    if (!leafRef.current) return;
    const t = state.clock.elapsedTime;
    leafRef.current.rotation.z =
      Math.sin(t * 1.2 + windOffset) * 0.04 +
      Math.sin(t * 2.7 + windOffset * 1.5) * 0.02;
  });

  const clusters: [number, number, number][] = [
    [0, 50, 0], [-12, 40, 5], [12, 44, -5],
    [0, 58, 0], [-8, 62, 3], [8, 60, -3],
    [0, 70, 0], [16, 38, 8], [-16, 48, -6],
  ];
  const radii = [18, 14, 13, 16, 12, 11, 10, 11, 12];

  return (
    <group position={position} scale={[scale, scale, scale]}>
      {/* Shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
        <circleGeometry args={[22, 12]} />
        <meshBasicMaterial color="#000" transparent opacity={0.12} depthWrite={false} />
      </mesh>

      {/* Trunk */}
      <mesh position={[0, 18, 0]}>
        <cylinderGeometry args={[3, 6, 32, 8]} />
        <meshStandardMaterial color={p.trunk} flatShading />
      </mesh>

      {/* Left branch */}
      <mesh position={[-10, 30, 2]} rotation={[0, 0, 0.6]}>
        <cylinderGeometry args={[1, 2, 16, 6]} />
        <meshStandardMaterial color={p.trunk} flatShading />
      </mesh>

      {/* Right branch */}
      <mesh position={[10, 34, -2]} rotation={[0, 0, -0.5]}>
        <cylinderGeometry args={[1, 1.8, 14, 6]} />
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

// ── Vendor Stall ──
function Stall3D({ vendor }: { vendor: Vendor }) {
  return (
    <group position={[vendor.x, 0, -vendor.y]}>
      {/* Table */}
      <mesh position={[0, 25, 0]}>
        <boxGeometry args={[80, 8, 30]} />
        <meshStandardMaterial color="#5b4636" flatShading />
      </mesh>
      {/* Table top */}
      <mesh position={[0, 30, 0]}>
        <boxGeometry args={[72, 4, 26]} />
        <meshStandardMaterial color="#7a5c3f" flatShading />
      </mesh>
      {/* Awning poles */}
      {[-38, 38].map((px) => (
        <mesh key={px} position={[px, 45, 0]}>
          <cylinderGeometry args={[1.5, 1.5, 40, 6]} />
          <meshStandardMaterial color="#6b4a2f" flatShading />
        </mesh>
      ))}
      {/* Awning */}
      <mesh position={[0, 65, 0]}>
        <boxGeometry args={[88, 3, 35]} />
        <meshStandardMaterial color={vendor.color} flatShading />
      </mesh>
      {/* Vendor emoji sign */}
      <mesh position={[0, 55, -16]}>
        <boxGeometry args={[40, 20, 2]} />
        <meshStandardMaterial color="#fff" flatShading />
      </mesh>
    </group>
  );
}

// ── Lamp Post ──
function Lamp3D({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Base */}
      <mesh position={[0, 2, 0]}>
        <boxGeometry args={[8, 4, 8]} />
        <meshStandardMaterial color="#4a4540" flatShading />
      </mesh>
      {/* Pole */}
      <mesh position={[0, 30, 0]}>
        <cylinderGeometry args={[1.5, 2, 56, 6]} />
        <meshStandardMaterial color="#5a5550" flatShading />
      </mesh>
      {/* Lamp head */}
      <mesh position={[0, 60, 0]}>
        <boxGeometry args={[10, 6, 10]} />
        <meshStandardMaterial color="#6a6560" flatShading />
      </mesh>
      {/* Light bulb glow */}
      <mesh position={[0, 56, 0]}>
        <sphereGeometry args={[4, 8, 8]} />
        <meshStandardMaterial color="#ffd166" emissive="#ffd166" emissiveIntensity={0.5} />
      </mesh>
      <pointLight position={[0, 54, 0]} color="#ffd166" intensity={0.5} distance={40} />
    </group>
  );
}

// ── Bench ──
function Bench3D({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Seat */}
      <mesh position={[0, 10, 0]}>
        <boxGeometry args={[28, 4, 10]} />
        <meshStandardMaterial color="#7a5a30" flatShading />
      </mesh>
      {/* Backrest */}
      <mesh position={[0, 18, -4]}>
        <boxGeometry args={[28, 10, 3]} />
        <meshStandardMaterial color="#7a5a30" flatShading />
      </mesh>
      {/* Legs */}
      {[-10, 10].map((lx) => (
        <mesh key={lx} position={[lx, 5, 0]}>
          <boxGeometry args={[3, 10, 8]} />
          <meshStandardMaterial color="#5a4020" flatShading />
        </mesh>
      ))}
    </group>
  );
}

// ── Hedge ──
function Hedge3D({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 10, 0]}>
        <boxGeometry args={[60, 16, 14]} />
        <meshStandardMaterial color="#2d7a38" flatShading />
      </mesh>
      <mesh position={[0, 18, 0]}>
        <boxGeometry args={[54, 8, 12]} />
        <meshStandardMaterial color="#3d9a48" flatShading transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

// ── Flower Box ──
function FlowerBox3D({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 4, 0]}>
        <boxGeometry args={[16, 8, 10]} />
        <meshStandardMaterial color="#7a5a30" flatShading />
      </mesh>
      {[-6, -2, 2, 6].map((fx, i) => (
        <mesh key={i} position={[fx, 14, 0]}>
          <sphereGeometry args={[3, 6, 6]} />
          <meshStandardMaterial color={["#ff6b6b", "#ffd166", "#ff6bcb", "#a855f7"][i]} />
        </mesh>
      ))}
    </group>
  );
}

// ── Assembled Environment ──
export const Environment3D = memo(function Environment3D() {
  return (
    <group>
      {/* Trees */}
      <Tree3D position={[200, 0, -508]} scale={0.35} variant={0} windOffset={0} />
      <Tree3D position={[820, 0, -508]} scale={0.4} variant={1} windOffset={2.1} />
      <Tree3D position={[1420, 0, -508]} scale={0.33} variant={2} windOffset={4.2} />

      {/* Hedges */}
      {Array.from({ length: 14 }).map((_, i) => (
        <Hedge3D key={i} position={[i * 118 + 49, 0, -530]} />
      ))}

      {/* Lamp posts */}
      <Lamp3D position={[480, 0, -510]} />
      <Lamp3D position={[1120, 0, -510]} />

      {/* Vendor stalls */}
      {VENDORS.map((v) => (
        <Stall3D key={v.id} vendor={v} />
      ))}

      {/* Flower boxes */}
      {[160, 460, 760, 1060, 1360].map((fx) => (
        <FlowerBox3D key={fx} position={[fx, 0, -820]} />
      ))}

      {/* Benches */}
      <Bench3D position={[350, 0, -816]} />
      <Bench3D position={[1150, 0, -816]} />
    </group>
  );
});
