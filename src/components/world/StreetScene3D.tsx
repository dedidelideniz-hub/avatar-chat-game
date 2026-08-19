// 🏙️ Real 3D Street Scene — Three.js + Kenney City Kit aesthetic
// Flat-shaded low-poly buildings, proper roads, 3D trees, stalls, and animated cars.
// Replaces the old SVG StreetScene with actual 3D geometry.

import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import type { AvatarConfig } from "@/lib/avatar";
import { GIFT_BOX, VENDORS, type Vendor } from "@/lib/shop";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox, Text } from "@react-three/drei";
import { useMemo, useRef, useCallback } from "react";
import * as THREE from "three";

// ═══════════════════════════════════════════════════════════════
//                    COORDINATE MAPPING
// ═══════════════════════════════════════════════════════════════

// 2D world: 0-1600 (x), 0-900 (y) → 3D: x, z, y(height)
const WORLD_SCALE = 0.015; // Scale factor: 1600px → ~24 units
const WORLD_OFFSET_X = -12; // Center the world
const WORLD_OFFSET_Z = -6.75;

function mapX(x2d: number) {
  return x2d * WORLD_SCALE + WORLD_OFFSET_X;
}
function mapZ(y2d: number) {
  return y2d * WORLD_SCALE + WORLD_OFFSET_Z;
}

// ═══════════════════════════════════════════════════════════════
//                    KENNEY CITY KIT COLORS
// ═══════════════════════════════════════════════════════════════

const COLORS = {
  // Building walls
  warmOrange: "#e8734a",
  warmOrangeDark: "#c85a35",
  cream: "#f0d8b8",
  creamDark: "#d4b088",
  white: "#e8ecf0",
  whiteDark: "#c0c4cc",
  lightGray: "#d0d4dc",
  lightGrayDark: "#a8b0bc",

  // Windows
  windowBlue: "#5b9bd5",
  windowFrame: "#3a5868",

  // Roofs
  roofDark: "#2d2d3a",
  roofMedium: "#484850",

  // Roads
  road: "#3a3835",
  roadLine: "#8a8580",
  roadDash: "#e8c84a",
  curb: "#8a8580",
  sidewalk: "#d0ccc0",
  sidewalkLine: "#c0bbb0",

  // Nature
  grass: "#6aaa5a",
  grassDark: "#5a9a4a",
  treeTrunk: "#6a5035",
  treeLeaves: ["#4a9a3a", "#5aad4a", "#6abb5a"],

  // Sky
  skyTop: "#4a80b8",
  skyMid: "#7ab0d8",
  skyBottom: "#a8d0e8",

  // Sun
  sun: "#ffd166",
  sunGlow: "#fff3c4",

  // Buildings (additional)
  buildingAccent: "#c88858",
  buildingAccentDark: "#a06838",

  // Stalls
  stallWood: "#5b4636",
  stallWoodLight: "#7a5c3f",
  stallPole: "#6b4a2f",

  // Cars
  carRed: "#c0392b",
  carBlue: "#2980b9",
  carYellow: "#f39c12",
  carPurple: "#8e44ad",
  carGreen: "#27ae60",
};

// ═══════════════════════════════════════════════════════════════
//                    3D BUILDING COMPONENT
// ═══════════════════════════════════════════════════════════════

interface Building3DProps {
  x: number; // 2D world x
  z: number; // 2D world y (mapped to z)
  w: number; // width in 2D units
  d: number; // depth in 2D units
  h: number; // height in 3D units
  frontColor: string;
  sideColor: string;
  roofColor: string;
  windowColor?: string;
  floors?: number;
  windowsPerFloor?: number;
  hasShop?: boolean;
  shopColor?: string;
  signText?: string;
  signColor?: string;
  roofDetail?: "antenna" | "ac" | "tank" | "chimney" | "satellite" | null;
}

function Building3D({
  x,
  z,
  w,
  d,
  h,
  frontColor,
  sideColor,
  roofColor,
  windowColor = COLORS.windowBlue,
  floors = 3,
  windowsPerFloor = 3,
  hasShop = false,
  shopColor,
  signText,
  signColor,
  roofDetail = null,
}: Building3DProps) {
  const meshRef = useRef<THREE.Group>(null);
  const worldX = mapX(x);
  const worldZ = mapZ(z);
  const scaledW = w * WORLD_SCALE;
  const scaledD = d * WORLD_SCALE;

  // Window dimensions
  const windowW = scaledW * 0.15;
  const windowH = (h / floors) * 0.5;
  const windowSpacingX = scaledW / (windowsPerFloor + 1);
  const windowSpacingY = h / (floors + 1);

  return (
    <group position={[worldX, 0, worldZ]}>
      {/* Main building body */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[scaledW, h, scaledD]} />
        <meshStandardMaterial
          color={frontColor}
          flatShading
          roughness={0.8}
          metalness={0.1}
        />
      </mesh>

      {/* Roof */}
      <mesh position={[0, h + 0.05, 0]} receiveShadow>
        <boxGeometry args={[scaledW + 0.1, 0.15, scaledD + 0.1]} />
        <meshStandardMaterial
          color={roofColor}
          flatShading
          roughness={0.6}
          metalness={0.2}
        />
      </mesh>

      {/* Side face (darker) */}
      <mesh position={[scaledW / 2 + 0.01, h / 2, 0]} castShadow>
        <boxGeometry args={[0.05, h, scaledD]} />
        <meshStandardMaterial
          color={sideColor}
          flatShading
          roughness={0.8}
        />
      </mesh>

      {/* Windows on front face */}
      {Array.from({ length: floors }).map((_, floor) =>
        Array.from({ length: windowsPerFloor }).map((_, win) => {
          const winX =
            -scaledW / 2 +
            windowSpacingX * (win + 1);
          const winY =
            windowSpacingY * (floor + 1);
          return (
            <group key={`win-${floor}-${win}`}>
              {/* Window frame */}
              <mesh
                position={[winX, winY, scaledD / 2 + 0.02]}
              >
                <boxGeometry
                  args={[windowW + 0.04, windowH + 0.04, 0.03]}
                />
                <meshStandardMaterial
                  color={COLORS.windowFrame}
                  flatShading
                />
              </mesh>
              {/* Window glass */}
              <mesh
                position={[winX, winY, scaledD / 2 + 0.04]}
              >
                <boxGeometry args={[windowW, windowH, 0.02]} />
                <meshStandardMaterial
                  color={windowColor}
                  flatShading
                  emissive={windowColor}
                  emissiveIntensity={0.15}
                  roughness={0.3}
                  metalness={0.4}
                />
              </mesh>
            </group>
          );
        })
      )}

      {/* Shop front (ground floor) */}
      {hasShop && (
        <group position={[0, 0.4, scaledD / 2 + 0.02]}>
          {/* Shop glass */}
          <mesh>
            <boxGeometry args={[scaledW * 0.8, 0.6, 0.05]} />
            <meshStandardMaterial
              color={shopColor || "#2a3a4a"}
              flatShading
              transparent
              opacity={0.7}
              roughness={0.2}
              metalness={0.5}
            />
          </mesh>
          {/* Shop interior glow */}
          <mesh position={[0, 0, 0.03]}>
            <boxGeometry args={[scaledW * 0.7, 0.5, 0.01]} />
            <meshStandardMaterial
              color="#e8f0f4"
              emissive="#e8f0f4"
              emissiveIntensity={0.3}
              flatShading
            />
          </mesh>
        </group>
      )}

      {/* Sign */}
      {signText && (
        <group position={[0, h * 0.7, scaledD / 2 + 0.1]}>
          <mesh>
            <boxGeometry args={[1.2, 0.3, 0.05]} />
            <meshStandardMaterial
              color={signColor || "#ffffff"}
              flatShading
            />
          </mesh>
        </group>
      )}

      {/* Roof details */}
      {roofDetail === "antenna" && (
        <group position={[0, h + 0.1, 0]}>
          <mesh position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.8, 6]} />
            <meshStandardMaterial color="#707880" flatShading />
          </mesh>
          <mesh position={[0, 0.85, 0]}>
            <sphereGeometry args={[0.04, 6, 6]} />
            <meshStandardMaterial color="#e74c3c" flatShading emissive="#e74c3c" emissiveIntensity={0.5} />
          </mesh>
        </group>
      )}
      {roofDetail === "ac" && (
        <mesh position={[0, h + 0.15, 0]}>
          <boxGeometry args={[0.5, 0.2, 0.3]} />
          <meshStandardMaterial color="#808890" flatShading />
        </mesh>
      )}
      {roofDetail === "tank" && (
        <group position={[0, h + 0.1, 0]}>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.4, 8]} />
            <meshStandardMaterial color="#6a7a8a" flatShading />
          </mesh>
        </group>
      )}
      {roofDetail === "chimney" && (
        <mesh position={[0.3, h + 0.2, 0]}>
          <boxGeometry args={[0.15, 0.4, 0.15]} />
          <meshStandardMaterial color="#6a5a4a" flatShading />
        </mesh>
      )}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
//                    3D TREE COMPONENT
// ═══════════════════════════════════════════════════════════════

interface Tree3DProps {
  x: number;
  z: number;
  scale?: number;
  variant?: number;
}

function Tree3D({ x, z, scale = 1, variant = 0 }: Tree3DProps) {
  const colors = [
    { trunk: "#6a5035", leaves: ["#4a9a3a", "#5aad4a", "#6abb5a"] },
    { trunk: "#5a4030", leaves: ["#3d8b37", "#4a9a42", "#58aa50"] },
    { trunk: "#7a5c40", leaves: ["#55ad4c", "#60b858", "#70c468"] },
  ];
  const c = colors[variant % colors.length];
  const worldX = mapX(x);
  const worldZ = mapZ(z);

  return (
    <group position={[worldX, 0, worldZ]} scale={[scale, scale, scale]}>
      {/* Trunk */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 0.6, 6]} />
        <meshStandardMaterial color={c.trunk} flatShading />
      </mesh>
      {/* Canopy layers */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <coneGeometry args={[0.35, 0.5, 6]} />
        <meshStandardMaterial color={c.leaves[0]} flatShading />
      </mesh>
      <mesh position={[0, 1.1, 0]} castShadow>
        <coneGeometry args={[0.28, 0.45, 6]} />
        <meshStandardMaterial color={c.leaves[1]} flatShading />
      </mesh>
      <mesh position={[0, 1.35, 0]} castShadow>
        <coneGeometry args={[0.2, 0.4, 6]} />
        <meshStandardMaterial color={c.leaves[2]} flatShading />
      </mesh>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
//                    3D LAMP COMPONENT
// ═══════════════════════════════════════════════════════════════

function Lamp3D({ x, z }: { x: number; z: number }) {
  const worldX = mapX(x);
  const worldZ = mapZ(z);

  return (
    <group position={[worldX, 0, worldZ]}>
      {/* Base */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.15, 0.04, 0.15]} />
        <meshStandardMaterial color="#4a4540" flatShading />
      </mesh>
      {/* Pole */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 1, 6]} />
        <meshStandardMaterial color="#5a5550" flatShading />
      </mesh>
      {/* Lamp head */}
      <mesh position={[0.1, 0.95, 0]}>
        <boxGeometry args={[0.15, 0.1, 0.1]} />
        <meshStandardMaterial color="#6a6560" flatShading />
      </mesh>
      {/* Light glow */}
      <mesh position={[0.1, 0.85, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial
          color="#ffd166"
          emissive="#ffd166"
          emissiveIntensity={0.8}
          flatShading
          transparent
          opacity={0.6}
        />
      </mesh>
      {/* Point light */}
      <pointLight
        position={[0.1, 0.85, 0]}
        color="#ffd166"
        intensity={0.5}
        distance={2}
        decay={2}
      />
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
//                    3D CAR COMPONENT
// ═══════════════════════════════════════════════════════════════

interface Car3DProps {
  x: number;
  z: number;
  color: string;
  direction: 1 | -1; // 1 = right, -1 = left
  speed: number; // units per second
  lane: number; // which lane (for z offset)
}

function Car3D({ x, z, color, direction, speed, lane }: Car3DProps) {
  const meshRef = useRef<THREE.Group>(null);
  const posRef = useRef(x);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    posRef.current += direction * speed * delta;
    // Wrap around
    if (direction > 0 && posRef.current > 1700) posRef.current = -100;
    if (direction < 0 && posRef.current < -100) posRef.current = 1700;
    meshRef.current.position.x = mapX(posRef.current);
  });

  return (
    <group ref={meshRef} position={[mapX(x), 0.15, mapZ(z + lane * 20)]}>
      {/* Car body */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.7, 0.18, 0.3]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      {/* Cabin */}
      <mesh position={[direction * -0.05, 0.22, 0]} castShadow>
        <boxGeometry args={[0.35, 0.14, 0.28]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      {/* Windows */}
      <mesh position={[direction * -0.05, 0.24, 0.151]}>
        <boxGeometry args={[0.3, 0.1, 0.01]} />
        <meshStandardMaterial color="#8ab4d0" flatShading transparent opacity={0.7} />
      </mesh>
      {/* Wheels */}
      <mesh position={[-0.2, 0.04, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.04, 8]} />
        <meshStandardMaterial color="#2a2a2a" flatShading />
      </mesh>
      <mesh position={[0.2, 0.04, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.04, 8]} />
        <meshStandardMaterial color="#2a2a2a" flatShading />
      </mesh>
      <mesh position={[-0.2, 0.04, -0.16]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.04, 8]} />
        <meshStandardMaterial color="#2a2a2a" flatShading />
      </mesh>
      <mesh position={[0.2, 0.04, -0.16]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.04, 8]} />
        <meshStandardMaterial color="#2a2a2a" flatShading />
      </mesh>
      {/* Headlights */}
      <mesh position={[direction * 0.36, 0.1, 0.08]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color="#ffe9a8" emissive="#ffe9a8" emissiveIntensity={0.5} flatShading />
      </mesh>
      <mesh position={[direction * 0.36, 0.1, -0.08]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color="#ffe9a8" emissive="#ffe9a8" emissiveIntensity={0.5} flatShading />
      </mesh>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
//                    3D STALL COMPONENT
// ═══════════════════════════════════════════════════════════════

function Stall3D({ vendor }: { vendor: Vendor }) {
  const worldX = mapX(vendor.x);
  const worldZ = mapZ(vendor.y);
  const stallW = 1.8;
  const stallD = 1.0;
  const stallH = 0.8;

  return (
    <group position={[worldX, 0, worldZ]}>
      {/* Stall counter */}
      <mesh position={[0, stallH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[stallW, stallH, stallD]} />
        <meshStandardMaterial color={COLORS.stallWood} flatShading />
      </mesh>
      {/* Counter top */}
      <mesh position={[0, stallH + 0.02, 0]} receiveShadow>
        <boxGeometry args={[stallW + 0.1, 0.04, stallD + 0.1]} />
        <meshStandardMaterial color={COLORS.stallWoodLight} flatShading />
      </mesh>
      {/* Poles */}
      {[-0.85, 0.85].map((px, i) => (
        <mesh key={i} position={[px, stallH + 0.4, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 0.8, 6]} />
          <meshStandardMaterial color={COLORS.stallPole} flatShading />
        </mesh>
      ))}
      {/* Awning */}
      <mesh position={[0, stallH + 0.78, 0]}>
        <boxGeometry args={[stallW + 0.2, 0.05, stallD + 0.4]} />
        <meshStandardMaterial
          color={vendor.color}
          flatShading
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Awning stripes */}
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh key={`stripe-${i}`} position={[-stallW / 2 + i * (stallW / 4), stallH + 0.81, 0]}>
          <boxGeometry args={[stallW / 5, 0.02, stallD + 0.38]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? vendor.color : vendor.accent}
            flatShading
          />
        </mesh>
      ))}
      {/* Vendor avatar placeholder */}
      <mesh position={[0, stallH + 1.0, 0]}>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshStandardMaterial color="#f5c19a" flatShading />
      </mesh>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
//                    3D GIFT BOX
// ═══════════════════════════════════════════════════════════════

function GiftBox3D({ claimed }: { claimed: boolean }) {
  const worldX = mapX(GIFT_BOX.x);
  const worldZ = mapZ(GIFT_BOX.y);
  const meshRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (meshRef.current && !claimed) {
      meshRef.current.position.y = 0.2 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.5;
    }
  });

  return (
    <group position={[worldX, 0, worldZ]}>
      <group ref={meshRef} position={[0, 0.2, 0]}>
        {/* Box body */}
        <mesh castShadow>
          <boxGeometry args={[0.4, 0.3, 0.4]} />
          <meshStandardMaterial
            color={claimed ? "#9c958c" : "#f7c948"}
            flatShading
          />
        </mesh>
        {/* Box lid */}
        <mesh position={[0, 0.18, 0]} castShadow>
          <boxGeometry args={[0.44, 0.06, 0.44]} />
          <meshStandardMaterial
            color={claimed ? "#b7b0a6" : "#eab308"}
            flatShading
          />
        </mesh>
        {/* Ribbon */}
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[0.06, 0.34, 0.44]} />
          <meshStandardMaterial color="#ff6b4a" flatShading />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[0.44, 0.34, 0.06]} />
          <meshStandardMaterial color="#ff6b4a" flatShading />
        </mesh>
        {/* Bow */}
        <mesh position={[0, 0.22, 0]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial color="#ff8fb3" flatShading />
        </mesh>
        {/* Glow effect */}
        {!claimed && (
          <pointLight
            position={[0, 0.3, 0]}
            color="#ffd166"
            intensity={1}
            distance={2}
            decay={2}
          />
        )}
      </group>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
//                    3D FLOWER BOX
// ═══════════════════════════════════════════════════════════════

function FlowerBox3D({ x, z }: { x: number; z: number }) {
  const worldX = mapX(x);
  const worldZ = mapZ(z);
  const flowerColors = ["#ff6b6b", "#ffd166", "#ff6bcb", "#a855f7"];

  return (
    <group position={[worldX, 0, worldZ]}>
      {/* Box */}
      <mesh position={[0, 0.08, 0]} castShadow>
        <boxGeometry args={[0.4, 0.12, 0.2]} />
        <meshStandardMaterial color="#7a5a30" flatShading />
      </mesh>
      {/* Flowers */}
      {flowerColors.map((color, i) => (
        <group key={i} position={[-0.12 + i * 0.08, 0.18, 0]}>
          <mesh>
            <cylinderGeometry args={[0.01, 0.01, 0.1, 4]} />
            <meshStandardMaterial color="#4a8c3f" flatShading />
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <sphereGeometry args={[0.03, 6, 6]} />
            <meshStandardMaterial color={color} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
//                    3D BENCH
// ═══════════════════════════════════════════════════════════════

function Bench3D({ x, z }: { x: number; z: number }) {
  const worldX = mapX(x);
  const worldZ = mapZ(z);

  return (
    <group position={[worldX, 0, worldZ]}>
      {/* Seat */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.6, 0.05, 0.2]} />
        <meshStandardMaterial color="#7a5a30" flatShading />
      </mesh>
      {/* Backrest */}
      <mesh position={[0, 0.35, -0.08]} castShadow>
        <boxGeometry args={[0.6, 0.2, 0.04]} />
        <meshStandardMaterial color="#7a5a30" flatShading />
      </mesh>
      {/* Legs */}
      {[-0.25, 0.25].map((lx, i) => (
        <mesh key={i} position={[lx, 0.1, 0]}>
          <boxGeometry args={[0.04, 0.2, 0.15]} />
          <meshStandardMaterial color="#5a4020" flatShading />
        </mesh>
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
//                    3D ROAD
// ═══════════════════════════════════════════════════════════════

function Road3D() {
  const roadY = 0.01;
  const roadWidth = 120 * WORLD_SCALE;
  const roadLength = 1600 * WORLD_SCALE;
  const roadZ = mapZ(620); // Center of road in 2D

  return (
    <group>
      {/* Road surface */}
      <mesh position={[0, roadY, roadZ]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roadLength, roadWidth]} />
        <meshStandardMaterial color={COLORS.road} flatShading roughness={0.9} />
      </mesh>

      {/* Curbs */}
      <mesh position={[0, roadY + 0.02, roadZ - roadWidth / 2]} receiveShadow>
        <boxGeometry args={[roadLength, 0.04, 0.08]} />
        <meshStandardMaterial color={COLORS.curb} flatShading />
      </mesh>
      <mesh position={[0, roadY + 0.02, roadZ + roadWidth / 2]} receiveShadow>
        <boxGeometry args={[roadLength, 0.04, 0.08]} />
        <meshStandardMaterial color={COLORS.curb} flatShading />
      </mesh>

      {/* Center dashes */}
      {Array.from({ length: 16 }).map((_, i) => (
        <mesh
          key={i}
          position={[-roadLength / 2 + i * (roadLength / 15), roadY + 0.03, roadZ]}
          receiveShadow
        >
          <boxGeometry args={[roadLength / 30, 0.02, 0.06]} />
          <meshStandardMaterial color={COLORS.roadDash} flatShading />
        </mesh>
      ))}

      {/* Top sidewalk */}
      <mesh position={[0, roadY - 0.01, mapZ(510)]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roadLength, 90 * WORLD_SCALE]} />
        <meshStandardMaterial color={COLORS.sidewalk} flatShading roughness={0.85} />
      </mesh>

      {/* Bottom sidewalk */}
      <mesh position={[0, roadY - 0.01, mapZ(760)]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roadLength, 140 * WORLD_SCALE]} />
        <meshStandardMaterial color={COLORS.sidewalk} flatShading roughness={0.85} />
      </mesh>

      {/* Grass at bottom */}
      <mesh position={[0, roadY - 0.02, mapZ(865)]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roadLength, 70 * WORLD_SCALE]} />
        <meshStandardMaterial color={COLORS.grass} flatShading roughness={0.95} />
      </mesh>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
//                    3D CLOUDS
// ═══════════════════════════════════════════════════════════════

function Cloud3D({ x, y, z, scale = 1 }: { x: number; y: number; z: number; scale?: number }) {
  const meshRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.x = x + Math.sin(state.clock.elapsedTime * 0.1 + x) * 0.5;
    }
  });

  return (
    <group ref={meshRef} position={[x, y, z]} scale={[scale, scale, scale]}>
      <mesh>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshStandardMaterial color="#ffffff" flatShading transparent opacity={0.9} />
      </mesh>
      <mesh position={[-0.4, -0.1, 0]}>
        <sphereGeometry args={[0.35, 8, 8]} />
        <meshStandardMaterial color="#ffffff" flatShading transparent opacity={0.85} />
      </mesh>
      <mesh position={[0.4, -0.05, 0]}>
        <sphereGeometry args={[0.4, 8, 8]} />
        <meshStandardMaterial color="#ffffff" flatShading transparent opacity={0.88} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[0.3, 8, 8]} />
        <meshStandardMaterial color="#ffffff" flatShading transparent opacity={0.82} />
      </mesh>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
//                    3D HEDGE
// ═══════════════════════════════════════════════════════════════

function Hedge3D() {
  const hedgeZ = mapZ(520);
  const hedgeCount = 14;

  return (
    <group>
      {Array.from({ length: hedgeCount }).map((_, i) => {
        const hx = mapX(i * 118 + 50);
        return (
          <group key={i} position={[hx, 0, hedgeZ]}>
            <mesh position={[0, 0.15, 0]} castShadow>
              <boxGeometry args={[1.2, 0.3, 0.3]} />
              <meshStandardMaterial color="#2d7a38" flatShading />
            </mesh>
            <mesh position={[0, 0.25, 0]} castShadow>
              <boxGeometry args={[1.0, 0.15, 0.25]} />
              <meshStandardMaterial color="#3d9a48" flatShading />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
//                    MAIN 3D SCENE
// ═══════════════════════════════════════════════════════════════

interface StreetScene3DProps {
  giftClaimed: boolean;
  // The following props are needed for integration but not used in 3D rendering
  // They're passed through to maintain API compatibility
  onVendorClick?: (vendor: Vendor) => void;
  onGiftClick?: () => void;
}

function Scene3DContent({ giftClaimed }: { giftClaimed: boolean }) {
  const { camera } = useThree();

  // Set up isometric-like camera
  useMemo(() => {
    camera.position.set(0, 12, 10);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} color="#b8d0e8" />
      <directionalLight
        position={[8, 12, 5]}
        intensity={1.2}
        color="#fff8e0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0001}
      />
      <hemisphereLight args={[COLORS.skyTop, COLORS.grass, 0.3]}
      />

      {/* Sky background */}
      <color attach="background" args={[COLORS.skyMid]} />
      <fog attach="fog" args={[COLORS.skyBottom, 15, 35]} />

      {/* Road */}
      <Road3D />

      {/* Hedge */}
      <Hedge3D />

      {/* ═══ BUILDINGS ═══ */}

      {/* Building 1 — Café (warm orange, short) */}
      <Building3D
        x={0}
        z={280}
        w={300}
        d={120}
        h={2.5}
        frontColor={COLORS.warmOrange}
        sideColor={COLORS.warmOrangeDark}
        roofColor={COLORS.roofDark}
        floors={2}
        windowsPerFloor={4}
        hasShop
        shopColor="#2a3a4a"
        signText="☕ KAFE"
      />

      {/* Building 2 — Tall white skyscraper */}
      <Building3D
        x={305}
        z={250}
        w={120}
        d={80}
        h={5}
        frontColor={COLORS.white}
        sideColor={COLORS.whiteDark}
        roofColor={COLORS.roofMedium}
        floors={8}
        windowsPerFloor={2}
        roofDetail="antenna"
      />

      {/* Building 3 — Medium orange apartment */}
      <Building3D
        x={430}
        z={260}
        w={130}
        d={90}
        h={3.5}
        frontColor="#d49060"
        sideColor="#b06838"
        roofColor={COLORS.roofDark}
        floors={5}
        windowsPerFloor={2}
        roofDetail="ac"
      />

      {/* Building 4 — Bakery (cream, short) */}
      <Building3D
        x={565}
        z={290}
        w={260}
        d={100}
        h={2.2}
        frontColor={COLORS.cream}
        sideColor={COLORS.creamDark}
        roofColor={COLORS.roofDark}
        floors={2}
        windowsPerFloor={3}
        hasShop
        shopColor="#2a3a4a"
        signText="🥐 FIRIN"
      />

      {/* Building 5 — Narrow tall white tower */}
      <Building3D
        x={830}
        z={270}
        w={100}
        d={70}
        h={4.5}
        frontColor="#e0e4ec"
        sideColor="#b8bcc8"
        roofColor={COLORS.roofMedium}
        floors={7}
        windowsPerFloor={2}
        roofDetail="satellite"
      />

      {/* Building 6 — Toy store (warm orange, short) */}
      <Building3D
        x={935}
        z={285}
        w={260}
        d={110}
        h={2.3}
        frontColor="#e0a070"
        sideColor="#c07848"
        roofColor={COLORS.roofDark}
        floors={2}
        windowsPerFloor={3}
        hasShop
        shopColor="#2a3a4a"
        signText="🧸 OYUNCAKÇI"
      />

      {/* Building 7 — Medium white building */}
      <Building3D
        x={1200}
        z={265}
        w={120}
        d={85}
        h={3.8}
        frontColor="#e4e8f0"
        sideColor="#bcc0cc"
        roofColor={COLORS.roofMedium}
        floors={6}
        windowsPerFloor={2}
        roofDetail="tank"
      />

      {/* Building 8 — Fashion store (peach, short-mid) */}
      <Building3D
        x={1325}
        z={275}
        w={275}
        d={100}
        h={2.6}
        frontColor="#e8b088"
        sideColor="#c88858"
        roofColor={COLORS.roofDark}
        floors={2}
        windowsPerFloor={4}
        hasShop
        shopColor="#2a3a4a"
        signText="🕶️ MODA"
      />

      {/* ═══ BACKGROUND BUILDINGS (depth layer) ═══ */}
      {[
        { x: -10, w: 80, h: 2.5, c1: "#b0b8c4", c2: "#98a0ac" },
        { x: 90, w: 60, h: 3.2, c1: "#a8b0bc", c2: "#909aa6" },
        { x: 230, w: 50, h: 2, c1: "#bcc4d0", c2: "#a4acba" },
        { x: 340, w: 70, h: 2.8, c1: "#a0a8b4", c2: "#8892a0" },
        { x: 470, w: 55, h: 3.8, c1: "#b4bcc8", c2: "#9ca6b4" },
        { x: 570, w: 65, h: 2.3, c1: "#a8b0bc", c2: "#9098a6" },
        { x: 690, w: 50, h: 3, c1: "#b8c0cc", c2: "#a0a8b8" },
        { x: 790, w: 60, h: 2.6, c1: "#a4acb8", c2: "#8c96a4" },
        { x: 900, w: 55, h: 3.4, c1: "#b0b8c4", c2: "#98a2b0" },
        { x: 1010, w: 65, h: 2.1, c1: "#bcc4d0", c2: "#a4acba" },
        { x: 1120, w: 50, h: 3.9, c1: "#a8b0bc", c2: "#9098a8" },
        { x: 1230, w: 60, h: 2.8, c1: "#b4bcc8", c2: "#9ca6b4" },
        { x: 1350, w: 55, h: 3.1, c1: "#a0a8b4", c2: "#8892a0" },
        { x: 1460, w: 70, h: 2.4, c1: "#b8c0cc", c2: "#a0a8b8" },
        { x: 1540, w: 80, h: 2.9, c1: "#a4acb8", c2: "#8c96a4" },
      ].map((b, i) => (
        <Building3D
          key={`bg-${i}`}
          x={b.x}
          z={200}
          w={b.w}
          d={60}
          h={b.h}
          frontColor={b.c1}
          sideColor={b.c2}
          roofColor="#505058"
          floors={Math.floor(b.h / 0.5)}
          windowsPerFloor={2}
        />
      ))}

      {/* ═══ TREES ═══ */}
      <Tree3D x={200} z={508} scale={1.0} variant={0} />
      <Tree3D x={820} z={508} scale={1.1} variant={1} />
      <Tree3D x={1420} z={508} scale={0.95} variant={2} />

      {/* ═══ LAMPS ═══ */}
      <Lamp3D x={480} z={510} />
      <Lamp3D x={1120} z={510} />

      {/* ═══ FLOWER BOXES ═══ */}
      <FlowerBox3D x={160} z={820} />
      <FlowerBox3D x={460} z={820} />
      <FlowerBox3D x={760} z={820} />
      <FlowerBox3D x={1060} z={820} />
      <FlowerBox3D x={1360} z={820} />

      {/* ═══ BENCHES ═══ */}
      <Bench3D x={350} z={816} />
      <Bench3D x={1150} z={816} />

      {/* ═══ CLOUDS ═══ */}
      <Cloud3D x={-8} y={6} z={-5} scale={1.0} />
      <Cloud3D x={-3} y={5.5} z={-4} scale={0.85} />
      <Cloud3D x={4} y={6.5} z={-6} scale={0.95} />
      <Cloud3D x={9} y={5.8} z={-4.5} scale={0.7} />

      {/* ═══ VENDOR STALLS ═══ */}
      {VENDORS.map((vendor) => (
        <Stall3D key={vendor.id} vendor={vendor} />
      ))}

      {/* ═══ GIFT BOX ═══ */}
      <GiftBox3D claimed={giftClaimed} />

      {/* ═══ ANIMATED CARS ═══ */}
      <Car3D x={-100} z={574} color={COLORS.carRed} direction={1} speed={1.5} lane={0} />
      <Car3D x={1700} z={631} color={COLORS.carYellow} direction={-1} speed={1.2} lane={0} />
      <Car3D x={-200} z={602} color={COLORS.carBlue} direction={1} speed={1.0} lane={1} />
      <Car3D x={1800} z={648} color={COLORS.carPurple} direction={-1} speed={1.3} lane={1} />

      {/* ═══ STRING LIGHTS (simplified 3D) ═══ */}
      {[60, 280, 500, 720, 940, 1160, 1380].map((lx, i) => {
        const lz = mapZ(540);
        return (
          <group key={`light-${i}`} position={[mapX(lx), 1.2, lz]}>
            <mesh>
              <sphereGeometry args={[0.04, 6, 6]} />
              <meshStandardMaterial
                color={["#ff6b6b", "#ffd166", "#6bcb77", "#4d96ff", "#ff6bcb", "#ffd700", "#ff6b6b"][i]}
                emissive={["#ff6b6b", "#ffd166", "#6bcb77", "#4d96ff", "#ff6bcb", "#ffd700", "#ff6b6b"][i]}
                emissiveIntensity={0.5}
                flatShading
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
//                    EXPORTED WRAPPER
// ═══════════════════════════════════════════════════════════════

export function StreetScene3D({ giftClaimed }: StreetScene3DProps) {
  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
      <Canvas
        shadows
        camera={{
          position: [0, 12, 10],
          fov: 50,
          near: 0.1,
          far: 100,
        }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        dpr={[1, 2]}
      >
        <Scene3DContent giftClaimed={giftClaimed} />
      </Canvas>
    </div>
  );
}
