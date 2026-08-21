/**
 * GameScene3D — 2.5D isometric WebGL scene.
 *
 * Replaces the SVG StreetScene with a stylized low-poly3D world.
 * Uses @react-three/fiber with orthographic camera for
 * the Brawl Stars / Sanalika top-down feel.
 *
 * Characters remain as SVG overlays (z-index 3 in World.tsx).
 * This component only renders the environment.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useRef, useEffect, useMemo, memo } from "react";

// ════════════════════════════════════════════════════════════════
// WORLD CONSTANTS — match SVG viewBox (1600×900)
// ════════════════════════════════════════════════════════════════
const WORLD_W = 1600;
const WORLD_H = 900;
const CAM_HEIGHT = 600; // How high the camera sits — controls zoom

// ════════════════════════════════════════════════════════════════
// COLOR PALETTE — warm, cozy Sanalika style
// ════════════════════════════════════════════════════════════════
const C = {
  sky: "#b8d4e8",
  grassLight: "#7ec876",
  grassDark: "#6ab862",
  road: "#8a8a8a",
  roadLine: "#d4d4d4",
  sidewalk: "#c8b89a",
  sidewalkEdge: "#b0a088",
  plaza: "#d4c4a0",
  plazaRing: "#c8b890",
  // Buildings
  b1: "#f4a68c", // café
  b2: "#e8e4dc", // skyscraper
  b3: "#e89458", // apartment
  b4: "#f0dcc0", // bakery
  b5: "#d8d4cc", // tower
  b6: "#e89858", // toy store
  b7: "#e0dcd4", // white building
  b8: "#f0b898", // fashion
  roofDark: "#8a6040",
  roofLight: "#c8a878",
  window: "#88c8e8",
  windowDark: "#6898b8",
  door: "#8a5a30",
  // Trees
  trunk: "#8a6840",
  foliage1: "#5aa850",
  foliage2: "#48a040",
  foliage3: "#68b858",
  // Stalls
  stallWood: "#c8a878",
  stallAwning1: "#e86040",
  stallAwning2: "#4888d0",
  stallAwning3: "#e8c840",
  stallAwning4: "#50b868",
  stallAwning5: "#d068a0",
  // Props
  lampPost: "#5a5a5a",
  lampLight: "#fff8e0",
  bench: "#a08050",
  fence: "#e0d8c8",
  flower1: "#f06888",
  flower2: "#f0c848",
  flower3: "#8868d0",
  // Cars
  carRed: "#c83030",
  carBlue: "#3070c0",
  carYellow: "#e8b830",
  carPurple: "#8848b0",
  // Background buildings
  bg1: "#d0ccc4",
  bg2: "#c8c4bc",
  bg3: "#d8d4cc",
  bg4: "#c0bcb4",
  bg5: "#d4d0c8",
  // Gift box
  giftRed: "#e84040",
  giftGold: "#f0c830",
};

// ════════════════════════════════════════════════════════════════
// CAMERA RIG — follows the player with smooth lerp
// ════════════════════════════════════════════════════════════════

interface CameraRigProps {
  /** Callback that returns current camera state { x, y, vw, vh } */
  getCameraState: () => { x: number; y: number; vw: number; vh: number };
}

function CameraRig({ getCameraState }: CameraRigProps) {
  const { camera } = useThree();
  const ortho = camera as THREE.OrthographicCamera;

  useFrame(() => {
    const cs = getCameraState();
    const cx = cs.x + cs.vw / 2;
    const cy = cs.y + cs.vh / 2;

    // Position camera above the center of the viewport
    ortho.position.set(cx, CAM_HEIGHT, cy);
    ortho.lookAt(cx, 0, cy);

    // Match SVG viewBox dimensions
    ortho.left = 0;
    ortho.right = cs.vw;
    ortho.top = 0;
    ortho.bottom = cs.vh;
    ortho.near = 1;
    ortho.far = 2000;

    // Offset so camera sees from (x, y) to (x+vw, y+vh)
    ortho.left = cs.x;
    ortho.right = cs.x + cs.vw;
    ortho.top = cs.y;
    ortho.bottom = cs.y + cs.vh;

    ortho.updateProjectionMatrix();
  });

  return null;
}

// ════════════════════════════════════════════════════════════════
// GROUND — grass, roads, sidewalks, plaza
// ════════════════════════════════════════════════════════════════

const Ground = memo(function Ground() {
  return (
    <group>
      {/* Full grass background */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[WORLD_W / 2, -0.5, WORLD_H / 2]}>
        <planeGeometry args={[WORLD_W + 200, WORLD_H + 200]} />
        <meshStandardMaterial color={C.grassLight} />
      </mesh>

      {/* Darker grass bottom strip */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[WORLD_W / 2, -0.4, 860]}>
        <planeGeometry args={[WORLD_W + 200, 100]} />
        <meshStandardMaterial color={C.grassDark} />
      </mesh>

      {/* Main road (horizontal, y=560..680) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[WORLD_W / 2, 0.01, 620]}>
        <planeGeometry args={[WORLD_W, 120]} />
        <meshStandardMaterial color={C.road} />
      </mesh>

      {/* Road center line */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[WORLD_W / 2, 0.02, 620]}>
        <planeGeometry args={[WORLD_W, 4]} />
        <meshStandardMaterial color={C.roadLine} />
      </mesh>

      {/* Road dashes (left lane) */}
      {Array.from({ length: 20 }).map((_, i) => (
        <mesh key={`dash-l-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[i * 85 + 30, 0.03, 600]}>
          <planeGeometry args={[40, 3]} />
          <meshStandardMaterial color={C.roadLine} transparent opacity={0.6} />
        </mesh>
      ))}

      {/* Road dashes (right lane) */}
      {Array.from({ length: 20 }).map((_, i) => (
        <mesh key={`dash-r-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[i * 85 + 30, 0.03, 640]}>
          <planeGeometry args={[40, 3]} />
          <meshStandardMaterial color={C.roadLine} transparent opacity={0.6} />
        </mesh>
      ))}

      {/* Top sidewalk (y=470..560) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[WORLD_W / 2, 0.01, 515]}>
        <planeGeometry args={[WORLD_W, 90]} />
        <meshStandardMaterial color={C.sidewalk} />
      </mesh>

      {/* Sidewalk curb top */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[WORLD_W / 2, 0.01, 470]}>
        <planeGeometry args={[WORLD_W, 6]} />
        <meshStandardMaterial color={C.sidewalkEdge} />
      </mesh>

      {/* Bottom sidewalk (y=680..820) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[WORLD_W / 2, 0.01, 750]}>
        <planeGeometry args={[WORLD_W, 140]} />
        <meshStandardMaterial color={C.sidewalk} />
      </mesh>

      {/* Sidewalk curb bottom */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[WORLD_W / 2, 0.01, 680]}>
        <planeGeometry args={[WORLD_W, 6]} />
        <meshStandardMaterial color={C.sidewalkEdge} />
      </mesh>

      {/* Hedge strip along top sidewalk */}
      {Array.from({ length: 28 }).map((_, i) => (
        <mesh key={`hedge-${i}`} position={[i * 60 + 20, 8, 470]}>
          <boxGeometry args={[50, 16, 20]} />
          <meshStandardMaterial color="#3a8838" />
        </mesh>
      ))}
    </group>
  );
});

// ════════════════════════════════════════════════════════════════
// ISOMETRIC BUILDING
// ════════════════════════════════════════════════════════════════

interface BuildingProps {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  color: string;
  roofColor?: string;
  windows?: boolean;
  doorX?: boolean;
}

const Building = memo(function Building({
  x, y, w, d, h, color, roofColor = C.roofDark, windows = true, doorX = false,
}: BuildingProps) {
  const hw = w / 2;
  const hd = d / 2;
  return (
    <group position={[x + hw, 0, y + hd]}>
      {/* Main body */}
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Roof edge */}
      <mesh position={[0, h + 1.5, 0]}>
        <boxGeometry args={[w + 4, 3, d + 4]} />
        <meshStandardMaterial color={roofColor} />
      </mesh>

      {/* Windows */}
      {windows && (
        <>
          {/* Front face windows */}
          {Array.from({ length: Math.floor(w / 28) }).map((_, i) => (
            <mesh key={`wf-${i}`} position={[-hw + 16 + i * 28, h * 0.55, -hd - 0.1]}>
              <boxGeometry args={[10, 12, 1]} />
              <meshStandardMaterial color={C.window} />
            </mesh>
          ))}
          {/* Side face windows */}
          {Array.from({ length: Math.floor(d / 28) }).map((_, i) => (
            <mesh key={`ws-${i}`} position={[hw + 0.1, h * 0.55, -hd + 16 + i * 28]}>
              <boxGeometry args={[1, 12, 10]} />
              <meshStandardMaterial color={C.windowDark} />
            </mesh>
          ))}
        </>
      )}

      {/* Door */}
      {doorX && (
        <mesh position={[0, 5, -hd - 0.1]}>
          <boxGeometry args={[12, 10, 1]} />
          <meshStandardMaterial color={C.door} />
        </mesh>
      )}
    </group>
  );
});

// ════════════════════════════════════════════════════════════════
// LOW-POLY TREE
// ════════════════════════════════════════════════════════════════

interface TreeProps {
  x: number;
  y: number;
  scale?: number;
  foliageColor?: string;
  swayPhase?: number;
}

const Tree = memo(function Tree({ x, y, scale = 1, foliageColor = C.foliage1, swayPhase = 0 }: TreeProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      const t = clock.getElapsedTime();
      const sway = Math.sin(t * 0.8 + swayPhase) * 1.5;
      groupRef.current.rotation.z = THREE.MathUtils.degToRad(sway);
    }
  });

  return (
    <group ref={groupRef} position={[x, 0, y]}>
      {/* Trunk */}
      <mesh position={[0, 14, 0]}>
        <cylinderGeometry args={[2.5, 3.5, 28, 6]} />
        <meshStandardMaterial color={C.trunk} />
      </mesh>
      {/* Foliage — 3 layered spheres for puffy look */}
      <mesh position={[0, 32, 0]}>
        <icosahedronGeometry args={[14, 1]} />
        <meshStandardMaterial color={foliageColor} flatShading />
      </mesh>
      <mesh position={[-5, 38, 3]}>
        <icosahedronGeometry args={[10, 1]} />
        <meshStandardMaterial color={C.foliage2} flatShading />
      </mesh>
      <mesh position={[4, 36, -2]}>
        <icosahedronGeometry args={[11, 1]} />
        <meshStandardMaterial color={C.foliage3} flatShading />
      </mesh>
    </group>
  );
});

// ════════════════════════════════════════════════════════════════
// VENDOR STALL
// ════════════════════════════════════════════════════════════════

interface StallProps {
  x: number;
  y: number;
  awningColor: string;
}

const Stall = memo(function Stall({ x, y, awningColor }: StallProps) {
  return (
    <group position={[x, 0, y]}>
      {/* Counter / table */}
      <mesh position={[0, 14, 0]}>
        <boxGeometry args={[60, 6, 28]} />
        <meshStandardMaterial color={C.stallWood} />
      </mesh>
      {/* Counter legs */}
      <mesh position={[-25, 5, 0]}>
        <boxGeometry args={[3, 10, 3]} />
        <meshStandardMaterial color={C.stallWood} />
      </mesh>
      <mesh position={[25, 5, 0]}>
        <boxGeometry args={[3, 10, 3]} />
        <meshStandardMaterial color={C.stallWood} />
      </mesh>
      {/* Awning */}
      <mesh position={[0, 32, -8]}>
        <boxGeometry args={[70, 3, 40]} />
        <meshStandardMaterial color={awningColor} />
      </mesh>
      {/* Awning supports */}
      <mesh position={[-30, 20, -25]}>
        <cylinderGeometry args={[1.5, 1.5, 28, 6]} />
        <meshStandardMaterial color={C.stallWood} />
      </mesh>
      <mesh position={[30, 20, -25]}>
        <cylinderGeometry args={[1.5, 1.5, 28, 6]} />
        <meshStandardMaterial color={C.stallWood} />
      </mesh>
      {/* Awning scallops */}
      {Array.from({ length: 7 }).map((_, i) => (
        <mesh key={i} position={[-30 + i * 10, 29, -27]}>
          <sphereGeometry args={[5.5, 6, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={awningColor} />
        </mesh>
      ))}
    </group>
  );
});

// ════════════════════════════════════════════════════════════════
// LAMP POST
// ════════════════════════════════════════════════════════════════

const Lamp = memo(function Lamp({ x, y }: { x: number; y: number }) {
  return (
    <group position={[x, 0, y]}>
      {/* Post */}
      <mesh position={[0, 20, 0]}>
        <cylinderGeometry args={[1.2, 1.5, 40, 6]} />
        <meshStandardMaterial color={C.lampPost} />
      </mesh>
      {/* Lamp head */}
      <mesh position={[0, 42, 0]}>
        <boxGeometry args={[8, 6, 8]} />
        <meshStandardMaterial color={C.lampLight} emissive={C.lampLight} emissiveIntensity={0.4} />
      </mesh>
      {/* Point light */}
      <pointLight position={[x, 45, y]} intensity={0.3} distance={60} color={C.lampLight} />
    </group>
  );
});

// ════════════════════════════════════════════════════════════════
// BENCH
// ════════════════════════════════════════════════════════════════

const Bench = memo(function Bench({ x, y }: { x: number; y: number }) {
  return (
    <group position={[x, 0, y]}>
      {/* Seat */}
      <mesh position={[0, 8, 0]}>
        <boxGeometry args={[30, 3, 10]} />
        <meshStandardMaterial color={C.bench} />
      </mesh>
      {/* Back */}
      <mesh position={[0, 14, 4]}>
        <boxGeometry args={[30, 10, 2]} />
        <meshStandardMaterial color={C.bench} />
      </mesh>
      {/* Legs */}
      <mesh position={[-12, 3, 0]}>
        <boxGeometry args={[2, 6, 8]} />
        <meshStandardMaterial color={C.bench} />
      </mesh>
      <mesh position={[12, 3, 0]}>
        <boxGeometry args={[2, 6, 8]} />
        <meshStandardMaterial color={C.bench} />
      </mesh>
    </group>
  );
});

// ════════════════════════════════════════════════════════════════
// FLOWER BOX
// ════════════════════════════════════════════════════════════════

const FlowerBox = memo(function FlowerBox({ x, y }: { x: number; y: number }) {
  return (
    <group position={[x, 0, y]}>
      <mesh position={[0, 5, 0]}>
        <boxGeometry args={[20, 10, 12]} />
        <meshStandardMaterial color="#a06830" />
      </mesh>
      {[C.flower1, C.flower2, C.flower3].map((c, i) => (
        <mesh key={i} position={[-6 + i * 6, 13, 0]}>
          <sphereGeometry args={[4, 6, 6]} />
          <meshStandardMaterial color={c} />
        </mesh>
      ))}
    </group>
  );
});

// ════════════════════════════════════════════════════════════════
// ANIMATED CAR
// ════════════════════════════════════════════════════════════════

interface CarProps {
  y: number;
  color: string;
  speed: number; // units per second
  direction: 1 | -1; // 1 = right, -1 = left
  startOffset?: number;
}

const Car = memo(function Car({ y, color, speed, direction, startOffset = 0 }: CarProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      const t = clock.getElapsedTime();
      const totalDist = WORLD_W + 400;
      const raw = ((t * speed + startOffset) % totalDist);
      const xPos = direction === 1
        ? -200 + raw
        : WORLD_W + 200 - raw;
      groupRef.current.position.x = xPos;
      groupRef.current.rotation.y = direction === 1 ? 0 : Math.PI;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, y]}>
      {/* Body */}
      <mesh position={[0, 6, 0]}>
        <boxGeometry args={[28, 8, 14]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Roof */}
      <mesh position={[direction === 1 ? -2 : 2, 13, 0]}>
        <boxGeometry args={[14, 6, 13]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Wheels */}
      <mesh position={[-8, 2, 8]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2.5, 2.5, 2, 8]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      <mesh position={[8, 2, 8]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2.5, 2.5, 2, 8]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      <mesh position={[-8, 2, -8]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2.5, 2.5, 2, 8]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      <mesh position={[8, 2, -8]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2.5, 2.5, 2, 8]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
    </group>
  );
});

// ════════════════════════════════════════════════════════════════
// CLOUD (animated drift)
// ════════════════════════════════════════════════════════════════

interface CloudProps {
  x: number;
  y: number;
  z: number;
  scale?: number;
  speed?: number;
}

const Cloud = memo(function Cloud({ x, y, z, scale = 1, speed = 3 }: CloudProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      const t = clock.getElapsedTime();
      groupRef.current.position.x = x + Math.sin(t * 0.02 * speed) * 35;
    }
  });

  return (
    <group ref={groupRef} position={[x, y, z]} scale={scale}>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[10, 8, 8]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.85} />
      </mesh>
      <mesh position={[12, -2, 0]}>
        <sphereGeometry args={[8, 8, 8]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.8} />
      </mesh>
      <mesh position={[-10, -1, 3]}>
        <sphereGeometry args={[7, 8, 8]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.8} />
      </mesh>
      <mesh position={[6, 3, -2]}>
        <sphereGeometry args={[6, 8, 8]} />
        <meshStandardMaterial color="#f8f8ff" transparent opacity={0.75} />
      </mesh>
    </group>
  );
});

// ════════════════════════════════════════════════════════════════
// FENCE
// ════════════════════════════════════════════════════════════════

const Fence = memo(function Fence({ x, y, count }: { x: number; y: number; count: number }) {
  return (
    <group position={[x, 0, y]}>
      {Array.from({ length: count }).map((_, i) => (
        <group key={i} position={[i * 16, 0, 0]}>
          {/* Post */}
          <mesh position={[0, 8, 0]}>
            <boxGeometry args={[3, 16, 3]} />
            <meshStandardMaterial color={C.fence} />
          </mesh>
          {/* Rail */}
          {i < count - 1 && (
            <mesh position={[8, 10, 0]}>
              <boxGeometry args={[16, 2, 2]} />
              <meshStandardMaterial color={C.fence} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
});

// ════════════════════════════════════════════════════════════════
// GIFT BOX
// ════════════════════════════════════════════════════════════════

const GiftBox = memo(function GiftBox({ claimed }: { claimed: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current && !claimed) {
      ref.current.position.y = 10 + Math.sin(clock.getElapsedTime() * 2) * 3;
      ref.current.rotation.y = clock.getElapsedTime() * 0.8;
    }
  });

  return (
    <group position={[800, 0, 852]}>
      {!claimed ? (
        <mesh ref={ref} position={[0, 10, 0]}>
          <boxGeometry args={[20, 20, 20]} />
          <meshStandardMaterial color={C.giftRed} />
        </mesh>
      ) : (
        <mesh position={[0, 3, 0]}>
          <boxGeometry args={[18, 6, 18]} />
          <meshStandardMaterial color={C.giftRed} transparent opacity={0.3} />
        </mesh>
      )}
      {/* Ribbon */}
      {!claimed && (
        <>
          <mesh position={[0, 10, 0]}>
            <boxGeometry args={[22, 3, 3]} />
            <meshStandardMaterial color={C.giftGold} />
          </mesh>
          <mesh position={[0, 10, 0]}>
            <boxGeometry args={[3, 3, 22]} />
            <meshStandardMaterial color={C.giftGold} />
          </mesh>
        </>
      )}
    </group>
  );
});

// ════════════════════════════════════════════════════════════════
// BACKGROUND BUILDINGS (far-back silhouettes)
// ════════════════════════════════════════════════════════════════

const BgBuildings = memo(function BgBuildings() {
  const buildings = useMemo(() => [
    { x: 30, w: 60, d: 40, h: 80, c: C.bg1 },
    { x: 120, w: 45, d: 35, h: 120, c: C.bg2 },
    { x: 200, w: 70, d: 45, h: 90, c: C.bg3 },
    { x: 310, w: 50, d: 30, h: 140, c: C.bg4 },
    { x: 400, w: 55, d: 40, h: 100, c: C.bg5 },
    { x: 500, w: 65, d: 35, h: 110, c: C.bg1 },
    { x: 600, w: 48, d: 38, h: 130, c: C.bg2 },
    { x: 700, w: 72, d: 42, h: 85, c: C.bg3 },
    { x: 810, w: 55, d: 36, h: 145, c: C.bg4 },
    { x: 900, w: 60, d: 40, h: 95, c: C.bg5 },
    { x: 1000, w: 50, d: 34, h: 125, c: C.bg1 },
    { x: 1100, w: 68, d: 42, h: 105, c: C.bg2 },
    { x: 1200, w: 55, d: 38, h: 135, c: C.bg3 },
    { x: 1300, w: 60, d: 40, h: 90, c: C.bg4 },
    { x: 1400, w: 50, d: 35, h: 115, c: C.bg5 },
    { x: 1500, w: 70, d: 44, h: 100, c: C.bg1 },
  ], []);

  return (
    <group>
      {buildings.map((b, i) => (
        <mesh key={i} position={[b.x + b.w / 2, b.h / 2, -30]}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color={b.c} />
        </mesh>
      ))}
    </group>
  );
});

// ════════════════════════════════════════════════════════════════
// MAIN SCENE COMPOSITION
// ════════════════════════════════════════════════════════════════

interface SceneContentProps {
  giftClaimed: boolean;
  getCameraState: () => { x: number; y: number; vw: number; vh: number };
}

const SceneContent = memo(function SceneContent({ giftClaimed, getCameraState }: SceneContentProps) {
  return (
    <>
      {/* Camera */}
      <CameraRig getCameraState={getCameraState} />

      {/* Lighting — soft ambient + directional for depth */}
      <ambientLight intensity={0.7} color="#f8f0e8" />
      <directionalLight
        position={[400, 500, 200]}
        intensity={0.5}
        color="#fff8f0"
      />
      <directionalLight
        position={[-200, 300, 400]}
        intensity={0.2}
        color="#e0e8ff"
      />

      {/* Sky color */}
      <color attach="background" args={[C.sky]} />

      {/* Background buildings (far behind) */}
      <BgBuildings />

      {/* Ground (grass, road, sidewalk) */}
      <Ground />

      {/* Clouds */}
      <Cloud x={150} y={250} z={-50} speed={1.5} />
      <Cloud x={500} y={280} z={-30} scale={0.85} speed={1.2} />
      <Cloud x={850} y={230} z={-60} scale={0.95} speed={1.8} />
      <Cloud x={1180} y={260} z={-40} scale={0.7} speed={1.0} />

      {/* ═══ BUILDINGS — top row (y=0..470 area) ═══ */}

      {/* Building 1 — Café (warm peach) */}
      <Building x={20} y={100} w={120} d={100} h={80} color={C.b1} doorX />

      {/* Building 2 — Tall white skyscraper */}
      <Building x={180} y={80} w={90} d={80} h={160} color={C.b2} roofColor={C.roofLight} />

      {/* Building 3 — Orange apartment */}
      <Building x={310} y={110} w={110} d={90} h={120} color={C.b3} doorX />

      {/* Building 4 — Bakery */}
      <Building x={460} y={100} w={100} d={85} h={75} color={C.b4} doorX />

      {/* Building 5 — Narrow tower */}
      <Building x={600} y={90} w={70} d={70} h={170} color={C.b5} roofColor={C.roofLight} />

      {/* Building 6 — Toy store */}
      <Building x={710} y={110} w={100} d={80} h={85} color={C.b6} doorX />

      {/* Building 7 — White building */}
      <Building x={850} y={95} w={110} d={90} h={100} color={C.b7} doorX />

      {/* Building 8 — Fashion store */}
      <Building x={1000} y={105} w={95} d={80} h={90} color={C.b8} doorX />

      {/* Extra buildings on right side */}
      <Building x={1150} y={90} w={100} d={85} h={110} color={C.b1} doorX />
      <Building x={1300} y={100} w={90} d={80} h={130} color={C.b3} />
      <Building x={1440} y={95} w={110} d={90} h={95} color={C.b4} doorX />

      {/* ═══ TREES — park area + sidewalk ═══ */}
      <Tree x={1200} y={30} foliageColor={C.foliage1} swayPhase={0} />
      <Tree x={1300} y={60} foliageColor={C.foliage2} swayPhase={1.2} scale={0.9} />
      <Tree x={1400} y={20} foliageColor={C.foliage3} swayPhase={2.4} />
      <Tree x={1480} y={70} foliageColor={C.foliage1} swayPhase={0.6} scale={1.1} />
      <Tree x={1350} y={140} foliageColor={C.foliage2} swayPhase={1.8} scale={0.85} />
      <Tree x={1150} y={100} foliageColor={C.foliage3} swayPhase={3.0} />

      {/* Sidewalk trees */}
      <Tree x={104} y={835} foliageColor={C.foliage1} swayPhase={0.5} scale={0.8} />
      <Tree x={1484} y={835} foliageColor={C.foliage2} swayPhase={2.1} scale={0.8} />

      {/* ═══ VENDOR STALLS — bottom sidewalk ═══ */}
      <Stall x={200} y={730} awningColor={C.stallAwning1} />
      <Stall x={540} y={730} awningColor={C.stallAwning2} />
      <Stall x={740} y={730} awningColor={C.stallAwning3} />
      <Stall x={900} y={730} awningColor={C.stallAwning4} />
      <Stall x={1260} y={730} awningColor={C.stallAwning5} />

      {/* ═══ PROPS ═══ */}
      <Lamp x={100} y={515} />
      <Lamp x={400} y={515} />
      <Lamp x={700} y={515} />
      <Lamp x={1000} y={515} />
      <Lamp x={1300} y={515} />
      <Lamp x={1550} y={515} />

      <Bench x={350} y={790} />
      <Bench x={1100} y={790} />

      <FlowerBox x={160} y={820} />
      <FlowerBox x={460} y={820} />

      {/* ═══ CARS ═══ */}
      <Car y={574} color={C.carRed} speed={65} direction={1} startOffset={0} />
      <Car y={602} color={C.carBlue} speed={50} direction={1} startOffset={300} />
      <Car y={631} color={C.carYellow} speed={45} direction={-1} startOffset={150} />
      <Car y={648} color={C.carPurple} speed={55} direction={-1} startOffset={500} />

      {/* ═══ FENCES ═══ */}
      <Fence x={28} y={870} count={5} />
      <Fence x={1450} y={870} count={8} />

      {/* ═══ GIFT BOX ═══ */}
      <GiftBox claimed={giftClaimed} />
    </>
  );
});

// ════════════════════════════════════════════════════════════════
// EXPORTED CANVAS WRAPPER
// ════════════════════════════════════════════════════════════════

interface GameScene3DProps {
  giftClaimed: boolean;
  getCameraState: () => { x: number; y: number; vw: number; vh: number };
}

export function GameScene3D({ giftClaimed, getCameraState }: GameScene3DProps) {
  return (
    <Canvas
      orthographic
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      dpr={[1, 1.5]}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
      }}
      camera={{
        position: [WORLD_W / 2, CAM_HEIGHT, WORLD_H / 2],
        zoom: 1,
        near: 1,
        far: 2000,
      }}
    >
      <SceneContent giftClaimed={giftClaimed} getCameraState={getCameraState} />
    </Canvas>
  );
}
