import { memo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { VENDORS, type Vendor } from "@/lib/shop";

/**
 * 3D Environment — trees, stalls, lamps, benches, decorations.
 *
 * Layout:
 *   Park (top-right): many trees, benches, flowers
 *   Roads: lamp posts at intersections
 *   South sidewalk: vendor stalls
 *   Plaza: fountain/monument centerpiece
 */

// ── Puffy 3D Tree (referenced image style) ──
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
    { trunk: "#b87a3d", leaves: ["#2d9a3a", "#3aad48", "#44b852", "#5ed06a", "#80e878", "#38a845", "#60c858", "#48b44e", "#70d870"] },
    { trunk: "#a06830", leaves: ["#1a8a6a", "#22a07a", "#28a880", "#38c090", "#50d8a0", "#209a75", "#32b888", "#26a57d", "#40c898"] },
    { trunk: "#b07038", leaves: ["#4a9a30", "#55a838", "#5cb840", "#6cc850", "#88e068", "#50a535", "#62b842", "#58a838", "#78d058"] },
  ];
  const p = palettes[variant % palettes.length];

  useFrame((state) => {
    if (!leafRef.current) return;
    const t = state.clock.elapsedTime;
    leafRef.current.rotation.z =
      Math.sin(t * 1.2 + windOffset) * 0.035 +
      Math.sin(t * 2.7 + windOffset * 1.5) * 0.018;
  });

  // Puffy leaf clusters (referenced image style)
  const clusters: [number, number, number][] = [
    [0, 48, 0],    // center top
    [-14, 38, 6],  // left
    [14, 40, -5],  // right
    [0, 56, 0],    // upper center
    [-8, 60, 4],   // upper left
    [8, 58, -3],   // upper right
    [0, 66, 0],    // crown
    [18, 34, 8],   // far left low
    [-18, 44, -7], // far right mid
    [0, 42, 10],   // front
    [-10, 52, -8], // back left
    [10, 50, 6],   // back right
  ];
  const radii = [16, 13, 12, 14, 10, 11, 9, 10, 11, 12, 10, 10];

  return (
    <group position={position} scale={[scale, scale, scale]}>
      {/* Shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
        <circleGeometry args={[20, 12]} />
        <meshBasicMaterial color="#000" transparent opacity={0.1} depthWrite={false} />
      </mesh>

      {/* Trunk */}
      <mesh position={[0, 16, 0]}>
        <cylinderGeometry args={[3, 5, 28, 8]} />
        <meshStandardMaterial color={p.trunk} flatShading />
      </mesh>

      {/* Left branch */}
      <mesh position={[-9, 28, 2]} rotation={[0, 0, 0.6]}>
        <cylinderGeometry args={[0.8, 1.8, 14, 6]} />
        <meshStandardMaterial color={p.trunk} flatShading />
      </mesh>

      {/* Right branch */}
      <mesh position={[9, 32, -2]} rotation={[0, 0, -0.5]}>
        <cylinderGeometry args={[0.8, 1.6, 12, 6]} />
        <meshStandardMaterial color={p.trunk} flatShading />
      </mesh>

      {/* Root base */}
      {[-4, -1, 2, 5].map((rx, i) => (
        <mesh key={`root-${i}`} position={[rx, 2, rx * 1.5]} rotation={[0, 0, rx * 0.15]}>
          <cylinderGeometry args={[0.5, 1.5, 6, 5]} />
          <meshStandardMaterial color={p.trunk} flatShading />
        </mesh>
      ))}

      {/* Leaf clusters (puffy icosahedrons) */}
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
      <mesh position={[0, 22, 0]}>
        <boxGeometry args={[70, 6, 28]} />
        <meshStandardMaterial color="#5b4636" flatShading />
      </mesh>
      {/* Table top */}
      <mesh position={[0, 26, 0]}>
        <boxGeometry args={[64, 3, 24]} />
        <meshStandardMaterial color="#7a5c3f" flatShading />
      </mesh>
      {/* Awning poles */}
      {[-32, 32].map((px) => (
        <mesh key={px} position={[px, 40, 0]}>
          <cylinderGeometry args={[1.2, 1.2, 36, 6]} />
          <meshStandardMaterial color="#6b4a2f" flatShading />
        </mesh>
      ))}
      {/* Awning */}
      <mesh position={[0, 58, 0]}>
        <boxGeometry args={[78, 2.5, 32]} />
        <meshStandardMaterial color={vendor.color} flatShading />
      </mesh>
      {/* Sign */}
      <mesh position={[0, 48, -14]}>
        <boxGeometry args={[36, 16, 1.5]} />
        <meshStandardMaterial color="#fff" flatShading />
      </mesh>
    </group>
  );
}

// ── Lamp Post ──
function Lamp3D({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 2, 0]}>
        <boxGeometry args={[6, 4, 6]} />
        <meshStandardMaterial color="#4a4540" flatShading />
      </mesh>
      <mesh position={[0, 26, 0]}>
        <cylinderGeometry args={[1.2, 1.8, 48, 6]} />
        <meshStandardMaterial color="#5a5550" flatShading />
      </mesh>
      <mesh position={[0, 52, 0]}>
        <boxGeometry args={[8, 5, 8]} />
        <meshStandardMaterial color="#6a6560" flatShading />
      </mesh>
      <mesh position={[0, 48, 0]}>
        <sphereGeometry args={[3.5, 8, 8]} />
        <meshStandardMaterial color="#ffd166" emissive="#ffd166" emissiveIntensity={0.5} />
      </mesh>
      <pointLight position={[0, 46, 0]} color="#ffd166" intensity={0.4} distance={35} />
    </group>
  );
}

// ── Bench ──
function Bench3D({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 8, 0]}>
        <boxGeometry args={[24, 3, 8]} />
        <meshStandardMaterial color="#7a5a30" flatShading />
      </mesh>
      <mesh position={[0, 14, -3.5]}>
        <boxGeometry args={[24, 8, 2.5]} />
        <meshStandardMaterial color="#7a5a30" flatShading />
      </mesh>
      {[-8, 8].map((lx) => (
        <mesh key={lx} position={[lx, 4, 0]}>
          <boxGeometry args={[2.5, 8, 6]} />
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
      <mesh position={[0, 8, 0]}>
        <boxGeometry args={[50, 12, 12]} />
        <meshStandardMaterial color="#2d7a38" flatShading />
      </mesh>
      <mesh position={[0, 15, 0]}>
        <boxGeometry args={[44, 6, 10]} />
        <meshStandardMaterial color="#3d9a48" flatShading transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

// ── Fountain (plaza centerpiece) ──
function Fountain3D({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Base pool */}
      <mesh position={[0, 4, 0]}>
        <cylinderGeometry args={[18, 20, 8, 16]} />
        <meshStandardMaterial color="#8090a0" flatShading />
      </mesh>
      {/* Water */}
      <mesh position={[0, 7, 0]}>
        <cylinderGeometry args={[16, 16, 2, 16]} />
        <meshStandardMaterial color="#4a90d0" transparent opacity={0.6} />
      </mesh>
      {/* Center pillar */}
      <mesh position={[0, 18, 0]}>
        <cylinderGeometry args={[3, 5, 20, 8]} />
        <meshStandardMaterial color="#a0a0a0" flatShading />
      </mesh>
      {/* Top bowl */}
      <mesh position={[0, 30, 0]}>
        <cylinderGeometry args={[6, 4, 4, 8]} />
        <meshStandardMaterial color="#a0a0a0" flatShading />
      </mesh>
      {/* Water spout glow */}
      <mesh position={[0, 26, 0]}>
        <sphereGeometry args={[3, 8, 8]} />
        <meshStandardMaterial color="#60b0e0" emissive="#4090c0" emissiveIntensity={0.3} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

// ── Assembled Environment ──
export const Environment3D = memo(function Environment3D() {
  return (
    <group>
      {/* ═══ PARK TREES (top-right quadrant: x=920..1560, y=40..450) ═══ */}
      <Tree3D position={[980, 0, -120]} scale={0.4} variant={0} windOffset={0} />
      <Tree3D position={[1100, 0, -80]} scale={0.35} variant={1} windOffset={1.5} />
      <Tree3D position={[1240, 0, -160]} scale={0.42} variant={2} windOffset={3.0} />
      <Tree3D position={[1380, 0, -100]} scale={0.38} variant={0} windOffset={4.5} />
      <Tree3D position={[1500, 0, -140]} scale={0.33} variant={1} windOffset={2.2} />
      <Tree3D position={[1040, 0, -260]} scale={0.36} variant={2} windOffset={5.0} />
      <Tree3D position={[1180, 0, -300]} scale={0.4} variant={0} windOffset={1.0} />
      <Tree3D position={[1320, 0, -340]} scale={0.34} variant={1} windOffset={3.5} />
      <Tree3D position={[1460, 0, -280]} scale={0.37} variant={2} windOffset={6.0} />
      <Tree3D position={[1120, 0, -420]} scale={0.32} variant={0} windOffset={2.8} />
      <Tree3D position={[1300, 0, -430]} scale={0.36} variant={1} windOffset={4.0} />
      <Tree3D position={[1450, 0, -400]} scale={0.3} variant={2} windOffset={1.8} />

      {/* Park benches */}
      <Bench3D position={[1000, 0, -200]} rotation={0} />
      <Bench3D position={[1400, 0, -250]} rotation={Math.PI} />
      <Bench3D position={[1200, 0, -380]} rotation={Math.PI / 2} />

      {/* Park flower beds */}
      {[
        { x: 1060, z: -180, c: "#ff6b6b" },
        { x: 1340, z: -200, c: "#ffd166" },
        { x: 1200, z: -360, c: "#ff6bcb" },
        { x: 1420, z: -380, c: "#a855f7" },
      ].map((f, i) => (
        <group key={`pf-${i}`} position={[f.x, 0, f.z]}>
          <mesh position={[0, 2, 0]}>
            <boxGeometry args={[14, 4, 14]} />
            <meshStandardMaterial color="#7a5a30" flatShading />
          </mesh>
          {[-4, 0, 4].map((fx, j) => (
            <mesh key={j} position={[fx, 7, 0]}>
              <sphereGeometry args={[3, 6, 6]} />
              <meshStandardMaterial color={f.c} />
            </mesh>
          ))}
        </group>
      ))}

      {/* ═══ ROAD DECORATIONS ═══ */}

      {/* Lamp posts at intersections */}
      <Lamp3D position={[-700, 0, -500]} />   // left of horizontal road
      <Lamp3D position={[-900, 0, -500]} />   // right of horizontal road
      <Lamp3D position={[-700, 0, -740]} />   // south of intersection
      <Lamp3D position={[-900, 0, -740]} />
      <Lamp3D position={[-500, 0, -500]} />   // far left
      <Lamp3D position={[-1100, 0, -500]} />  // far right

      {/* Hedges along north sidewalk */}
      {[100, 250, 400, 550].map((hx) => (
        <Hedge3D key={`hn-${hx}`} position={[-hx, 0, -520]} />
      ))}

      {/* ═══ PLAZA CENTERPIECE ═══ */}
      <Fountain3D position={[-800, 0, -620]} />

      {/* Plaza decorative pillars */}
      {[
        { x: -700, z: -540 },
        { x: -900, z: -540 },
        { x: -700, z: -700 },
        { x: -900, z: -700 },
      ].map((p, i) => (
        <group key={`pillar-${i}`} position={[p.x, 0, p.z]}>
          <mesh position={[0, 6, 0]}>
            <cylinderGeometry args={[2, 3, 12, 8]} />
            <meshStandardMaterial color="#a0a0a0" flatShading />
          </mesh>
          <mesh position={[0, 13, 0]}>
            <sphereGeometry args={[4, 8, 8]} />
            <meshStandardMaterial color="#c0c0c0" flatShading />
          </mesh>
        </group>
      ))}

      {/* ═══ VENDOR STALLS (south sidewalk, y≈745) ═══ */}
      {VENDORS.map((v) => (
        <Stall3D key={v.id} vendor={v} />
      ))}

      {/* Flower boxes along south sidewalk */}
      {[180, 420, 660, 1080, 1380].map((fx) => (
        <group key={`fb-${fx}`} position={[fx, 0, -800]}>
          <mesh position={[0, 3, 0]}>
            <boxGeometry args={[14, 6, 8]} />
            <meshStandardMaterial color="#7a5a30" flatShading />
          </mesh>
          {[-4, 0, 4].map((fx2, j) => (
            <mesh key={j} position={[fx2, 10, 0]}>
              <sphereGeometry args={[2.5, 6, 6]} />
              <meshStandardMaterial color={["#ff6b6b", "#ffd166", "#ff6bcb"][j]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Benches on south sidewalk */}
      <Bench3D position={[350, 0, -810]} rotation={0} />
      <Bench3D position={[1150, 0, -810]} rotation={0} />

      {/* ═══ MAP BORDER DECORATIONS ═══ */}

      {/* Border hedges (left edge) */}
      {[100, 250, 400, 550, 700].map((by) => (
        <Hedge3D key={`bl-${by}`} position={[-15, 0, -by]} />
      ))}

      {/* Border hedges (right edge) */}
      {[100, 250, 400, 550, 700].map((by) => (
        <Hedge3D key={`br-${by}`} position={[-1585, 0, -by]} />
      ))}

      {/* Corner trees (map border) */}
      <Tree3D position={[30, 0, -30]} scale={0.3} variant={0} windOffset={7} />
      <Tree3D position={[1570, 0, -30]} scale={0.3} variant={1} windOffset={8} />
      <Tree3D position={[30, 0, -870]} scale={0.3} variant={2} windOffset={9} />
      <Tree3D position={[1570, 0, -870]} scale={0.3} variant={0} windOffset={10} />
    </group>
  );
});
