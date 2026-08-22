/**
 * ═══════════════════════════════════════════════════════════════
 * SANALIKA 3D GAME ENGINE — Main Scene
 * ═══════════════════════════════════════════════════════════════
 *
 * Renders the 3D world using React Three Fiber.
 * World coordinate system:
 *   X = horizontal (centered, -8..8)
 *   Y = vertical height (0 = ground)
 *   Z = depth (positive = toward camera / "south")
 *
 * All game logic stays in SVG coordinates internally.
 * This component reads SVG positions from refs and renders in 3D.
 * ═══════════════════════════════════════════════════════════════
 */

import React, { useRef, useMemo, useCallback, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { EquippedItems } from "@/components/avatar/EquippedItems";
import { VENDORS } from "@/lib/shop";
import type { AvatarConfig } from "@/lib/avatar";
import {
  SVG_WORLD_W,
  SVG_WORLD_H,
  S,
  WORLD_CX,
  WORLD_CZ,
  CAMERA_ELEVATION,
  CAMERA_ZOOM,
  CAMERA_LERP_SPEED,
  PLAYER_3D_WIDTH,
  PLAYER_3D_HEIGHT,
  SPAWN_SVG,
  BUILDINGS,
  TREES,
  LAMPS,
  FLOWER_BOXES,
  BENCHES,
  STALLS,
  TREE_FOLIAGE_COLORS,
  TREE_TRUNK_COLOR,
  type BuildingDef,
  type TreePos,
  type LampPos,
  type FlowerBoxPos,
  type StallDef,
} from "./constants";
import { svgXTo3D, svgYTo3DZ, svgWTo3D, svgHTo3D, facingToRotation } from "./coordUtils";

/* ═══════════════════════════════════════════════════════════ */
/*  Follow Camera — tracks the player with smooth lerp        */
/* ═══════════════════════════════════════════════════════════ */

function FollowCamera({
  posRef,
}: {
  posRef: React.RefObject<{ x: number; y: number }>;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const target = useRef(new THREE.Vector3(SPAWN_SVG.x / S - WORLD_CX, 0, -(SPAWN_SVG.y / S - WORLD_CZ)));
  const cur = useRef(new THREE.Vector3(target.current.x, target.current.y, target.current.z));

  useFrame((_, dt) => {
    const p = posRef.current;
    if (!p) return;

    // Convert SVG player position to 3D
    const tx = p.x / S - WORLD_CX;
    const tz = -(p.y / S - WORLD_CZ);

    target.current.set(tx, 0, tz);

    // Smooth follow
    const lerpFactor = Math.min(1, CAMERA_LERP_SPEED * dt);
    cur.current.lerp(target.current, lerpFactor);

    // Position camera behind and above player
    const el = CAMERA_ELEVATION;
    const zoom = CAMERA_ZOOM;
    camera.position.set(
      cur.current.x,
      cur.current.y + Math.sin(el) * zoom,
      cur.current.z + Math.cos(el) * zoom,
    );
    camera.lookAt(cur.current.x, cur.current.y + 0.5, cur.current.z);
  });

  return null;
}

/* ═══════════════════════════════════════════════════════════ */
/*  Ground — procedural textured ground with zone colors     */
/* ═══════════════════════════════════════════════════════════ */

function Ground() {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const g = c.getContext("2d")!;
    // Base grass
    g.fillStyle = "#4cc040";
    g.fillRect(0, 0, 256, 256);
    // Grass texture dots
    for (let i = 0; i < 80; i++) {
      g.fillStyle = Math.random() > 0.5 ? "#3aa030" : "#55cc48";
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 2);
    return t;
  }, []);

  const worldW = SVG_WORLD_W / S;
  const worldD = SVG_WORLD_H / S;
  const cx = WORLD_CX;
  const cz = WORLD_CZ;

  // Zone positions in 3D (from SVG zone boundaries)
  const sidewalkZ = svgYTo3DZ(470);
  const roadTopZ = svgYTo3DZ(555);
  const roadBottomZ = svgYTo3DZ(685);
  const vendorBottomZ = svgYTo3DZ(820);
  const grassBottomZ = svgYTo3DZ(900);

  return (
    <group>
      {/* Base grass — full map extent */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.01, cz]} receiveShadow>
        <planeGeometry args={[worldW, worldD]} />
        <meshStandardMaterial map={texture} roughness={1} />
      </mesh>

      {/* Top sidewalk strip (lighter, warm stone) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.001, (sidewalkZ + roadTopZ) / 2]} receiveShadow>
        <planeGeometry args={[worldW, Math.abs(sidewalkZ - roadTopZ)]} />
        <meshStandardMaterial color="#e8e2d8" roughness={0.9} />
      </mesh>

      {/* Central promenade (stone tile) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.002, (roadTopZ + roadBottomZ) / 2]} receiveShadow>
        <planeGeometry args={[worldW, Math.abs(roadTopZ - roadBottomZ)]} />
        <meshStandardMaterial color="#d0c8b8" roughness={0.85} />
      </mesh>

      {/* Promenade center line (decorative) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.003, (roadTopZ + roadBottomZ) / 2]}>
        <planeGeometry args={[worldW, 0.05]} />
        <meshStandardMaterial color="#b8b0a0" roughness={0.8} />
      </mesh>

      {/* Bottom sidewalk (vendor zone) — warm stone */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.001, (roadBottomZ + vendorBottomZ) / 2]} receiveShadow>
        <planeGeometry args={[worldW, Math.abs(roadBottomZ - vendorBottomZ)]} />
        <meshStandardMaterial color="#e0d8c8" roughness={0.9} />
      </mesh>

      {/* Bottom grass zone (bright green) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.005, (vendorBottomZ + grassBottomZ) / 2]} receiveShadow>
        <planeGeometry args={[worldW, Math.abs(vendorBottomZ - grassBottomZ)]} />
        <meshStandardMaterial color="#4cc040" roughness={1} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Building — low-poly box with colored faces               */
/* ═══════════════════════════════════════════════════════════ */

function Building({ def }: { def: BuildingDef }) {
  const w = svgWTo3D(def.w);
  const h = def.h / S * 1.2; // height above ground
  const d = 2.5; // depth into scene
  const x = svgXTo3D(def.x + def.w / 2);
  const z = svgYTo3DZ(470) - d / 2 - 0.5; // behind sidewalk

  // Window pattern as a simple grid of recessed faces
  const storyH = h / def.floors;
  const windowW = w / (def.windows * 2 + 1);
  const windowH = storyH * 0.5;

  return (
    <group position={[x, h / 2, z]}>
      {/* Main body */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={def.front} roughness={0.8} />
      </mesh>

      {/* Roof slab (slightly wider) */}
      <mesh position={[0, h / 2 + 0.05, 0]} castShadow>
        <boxGeometry args={[w + 0.15, 0.1, d + 0.15]} />
        <meshStandardMaterial color={def.top} roughness={0.6} />
      </mesh>

      {/* Windows (simple colored rectangles on front face) */}
      {Array.from({ length: def.floors }).map((_, floor) =>
        Array.from({ length: def.windows }).map((_, win) => {
          const wx = -w / 2 + (win + 1) * (w / (def.windows + 1));
          const wy = -h / 2 + (floor + 0.5) * storyH;
          return (
            <mesh
              key={`${floor}-${win}`}
              position={[wx, wy, d / 2 + 0.01]}
            >
              <planeGeometry args={[windowW, windowH]} />
              <meshStandardMaterial color="#38b8f8" roughness={0.3} metalness={0.2} />
            </mesh>
          );
        })
      )}

      {/* Side shadow (darker face on right side) */}
      <mesh position={[w / 2 + 0.001, 0, 0]} rotation={[0, 0, 0]}>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={def.side} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Low-Poly 3D Tree                                         */
/* ═══════════════════════════════════════════════════════════ */

function Tree3D({ def }: { def: TreePos }) {
  const x = svgXTo3D(def.x);
  const z = svgYTo3DZ(def.y);
  const s = def.scale;
  const colors = TREE_FOLIAGE_COLORS[def.variant] ?? TREE_FOLIAGE_COLORS[0];
  const timeRef = useRef(Math.random() * 100); // random start phase

  // Subtle wind sway
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    timeRef.current += dt;
    if (groupRef.current) {
      groupRef.current.rotation.z = Math.sin(timeRef.current * 0.8) * 0.02 * s;
    }
  });

  return (
    <group ref={groupRef} position={[x, 0, z]} scale={[s, s, s]}>
      {/* Trunk */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.1, 0.8, 6]} />
        <meshStandardMaterial color={TREE_TRUNK_COLOR} roughness={0.9} />
      </mesh>

      {/* Foliage layer 1 (bottom, wider) */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <sphereGeometry args={[0.35, 8, 6]} />
        <meshStandardMaterial color={colors[0]} roughness={0.95} />
      </mesh>

      {/* Foliage layer 2 (middle) */}
      <mesh position={[0.05, 1.3, 0.05]} castShadow>
        <sphereGeometry args={[0.28, 8, 6]} />
        <meshStandardMaterial color={colors[1]} roughness={0.95} />
      </mesh>

      {/* Foliage layer 3 (top, smallest) */}
      <mesh position={[-0.03, 1.55, -0.03]} castShadow>
        <sphereGeometry args={[0.2, 8, 6]} />
        <meshStandardMaterial color={colors[0]} roughness={0.95} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Street Lamp                                              */
/* ═══════════════════════════════════════════════════════════ */

function Lamp3D({ def }: { def: LampPos }) {
  const x = svgXTo3D(def.x);
  const z = svgYTo3DZ(def.y);

  return (
    <group position={[x, 0, z]}>
      {/* Pole */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.04, 1.8, 6]} />
        <meshStandardMaterial color="#555555" roughness={0.5} />
      </mesh>

      {/* Lamp head */}
      <mesh position={[0, 1.85, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial
          color="#fff4d0"
          emissive="#fff4d0"
          emissiveIntensity={0.6}
          roughness={0.2}
        />
      </mesh>

      {/* Arm */}
      <mesh position={[0.08, 1.78, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.015, 0.015, 0.18, 4]} />
        <meshStandardMaterial color="#555555" roughness={0.5} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Vendor Stall                                             */
/* ═══════════════════════════════════════════════════════════ */

function Stall3D({ def }: { def: StallDef }) {
  const x = svgXTo3D(def.x);
  const z = svgYTo3DZ(def.y);

  return (
    <group position={[x, 0, z]}>
      {/* Table/counter */}
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.12, 0.6]} />
        <meshStandardMaterial color="#8b6848" roughness={0.85} />
      </mesh>

      {/* Table legs */}
      {[[-0.65, 0, -0.2], [0.65, 0, -0.2], [-0.65, 0, 0.2], [0.65, 0, 0.2]].map((pos, i) => (
        <mesh key={i} position={[pos[0], 0.17, pos[2]]}>
          <boxGeometry args={[0.06, 0.34, 0.06]} />
          <meshStandardMaterial color="#6b4830" roughness={0.9} />
        </mesh>
      ))}

      {/* Awning (angled roof) */}
      <mesh position={[0, 0.9, -0.15]} rotation={[0.3, 0, 0]} castShadow>
        <boxGeometry args={[1.8, 0.06, 0.9]} />
        <meshStandardMaterial color={def.color} roughness={0.7} />
      </mesh>

      {/* Awning stripe */}
      <mesh position={[0, 0.93, -0.15]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[1.8, 0.02, 0.3]} />
        <meshStandardMaterial color={def.accent} roughness={0.7} />
      </mesh>

      {/* Awning supports (poles) */}
      {[-0.8, 0.8].map((px) => (
        <mesh key={px} position={[px, 0.6, 0.25]}>
          <cylinderGeometry args={[0.025, 0.025, 0.6, 4]} />
          <meshStandardMaterial color="#6b4830" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Flower Box                                               */
/* ═══════════════════════════════════════════════════════════ */

function FlowerBox3D({ def }: { def: FlowerBoxPos }) {
  const x = svgXTo3D(def.x);
  const z = svgYTo3DZ(def.y);

  return (
    <group position={[x, 0, z]}>
      {/* Box */}
      <mesh position={[0, 0.12, 0]} castShadow>
        <boxGeometry args={[0.4, 0.24, 0.24]} />
        <meshStandardMaterial color="#8b6848" roughness={0.85} />
      </mesh>

      {/* Flowers (colorful spheres) */}
      {[
        { pos: [-0.1, 0.3, 0], color: "#ff6b8a" },
        { pos: [0, 0.32, 0.05], color: "#ffb347" },
        { pos: [0.1, 0.28, -0.03], color: "#ff6b8a" },
      ].map((f, i) => (
        <mesh key={i} position={f.pos as [number, number, number]}>
          <sphereGeometry args={[0.06, 6, 6]} />
          <meshStandardMaterial color={f.color} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Bench                                                    */
/* ═══════════════════════════════════════════════════════════ */

function Bench3D({ def }: { def: FlowerBoxPos }) {
  const x = svgXTo3D(def.x);
  const z = svgYTo3DZ(def.y);

  return (
    <group position={[x, 0, z]}>
      {/* Seat */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[0.5, 0.04, 0.18]} />
        <meshStandardMaterial color="#c9a06c" roughness={0.8} />
      </mesh>

      {/* Backrest */}
      <mesh position={[0, 0.35, -0.07]} castShadow>
        <boxGeometry args={[0.5, 0.22, 0.04]} />
        <meshStandardMaterial color="#c9a06c" roughness={0.8} />
      </mesh>

      {/* Legs */}
      {[-0.2, 0.2].map((lx) => (
        <mesh key={lx} position={[lx, 0.11, 0]}>
          <boxGeometry args={[0.04, 0.22, 0.16]} />
          <meshStandardMaterial color="#6b4830" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Player Avatar3D — HTML billboard of the existing SVG     */
/*  avatar rendered at the player's 3D world position.        */
/* ═══════════════════════════════════════════════════════════ */

function PlayerAvatar3D({
  posRef,
  config,
  equipped,
  width,
  height,
  isMoving,
  facingRef,
}: {
  posRef: React.RefObject<{ x: number; y: number }>;
  config: AvatarConfig;
  equipped: string[];
  width?: number;
  height?: number;
  isMoving: boolean;
  facingRef: React.RefObject<number>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const scale = PLAYER_3D_WIDTH * 1.4; // avatar billboard scale

  useFrame(() => {
    if (!groupRef.current || !posRef.current) return;
    const p = posRef.current;
    const x = p.x / S - WORLD_CX;
    const z = -(p.y / S - WORLD_CZ);
    groupRef.current.position.set(x, 0.02, z);
  });

  return (
    <group ref={groupRef}>
      <Html
        center
        distanceFactor={8}
        style={{
          pointerEvents: "none",
          transform: "translateY(-50%)",
        }}
        zIndexRange={[10, 0]}
      >
        <div
          className={isMoving ? "walking" : ""}
          style={{
            width: width ?? 70,
            height: height ?? 96,
            transform: `scaleX(${facingRef.current < 0 ? -1 : 1})`,
            transformOrigin: "center bottom",
          }}
        >
          <AvatarPreview
            width={width ?? 70}
            height={height ?? 96}
            config={config}
          />
          <EquippedItems
            equipped={equipped}
            width={width ?? 70}
            height={height ?? 96}
          />
        </div>
      </Html>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Bot Avatar3D — same as player but for bots               */
/* ═══════════════════════════════════════════════════════════ */

function BotAvatar3D({
  x,
  y,
  config,
  equipped,
  isMoving,
  facing,
}: {
  x: number;
  y: number;
  config: AvatarConfig;
  equipped: string[];
  isMoving: boolean;
  facing: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    const px = x / S - WORLD_CX;
    const pz = -(y / S - WORLD_CZ);
    groupRef.current.position.set(px, 0.02, pz);
  });

  return (
    <group ref={groupRef}>
      <Html
        center
        distanceFactor={8}
        style={{
          pointerEvents: "none",
          transform: "translateY(-50%)",
        }}
        zIndexRange={[10, 0]}
      >
        <div
          className={isMoving ? "walking" : ""}
          style={{
            width: 70,
            height: 96,
            transform: `scaleX(${facing < 0 ? -1 : 1})`,
            transformOrigin: "center bottom",
          }}
        >
          <AvatarPreview width={70} height={96} config={config} />
          <EquippedItems equipped={equipped} width={70} height={96} />
        </div>
      </Html>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Gift Box                                                 */
/* ═══════════════════════════════════════════════════════════ */

function GiftBox3D() {
  const x = svgXTo3D(800);
  const z = svgYTo3DZ(852);
  const timeRef = useRef(0);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    timeRef.current += dt;
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(timeRef.current * 2) * 0.05 + 0.25;
      groupRef.current.rotation.y = timeRef.current * 0.5;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* Gift box body */}
      <group ref={groupRef}>
        <mesh castShadow>
          <boxGeometry args={[0.45, 0.45, 0.45]} />
          <meshStandardMaterial color="#ef4444" roughness={0.6} />
        </mesh>
        {/* Ribbon */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.08, 0.47, 0.47]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.47, 0.08, 0.47]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.5} />
        </mesh>
        {/* Bow */}
        <mesh position={[0, 0.28, 0]}>
          <sphereGeometry args={[0.08, 6, 6]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Move Target Marker                                       */
/* ═══════════════════════════════════════════════════════════ */

function MoveTarget3D({
  target,
}: {
  target: { x: number; y: number } | null;
}) {
  if (!target) return null;
  const x = svgXTo3D(target.x);
  const z = svgYTo3DZ(target.y);
  const timeRef = useRef(0);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, dt) => {
    timeRef.current += dt;
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.3 + Math.sin(timeRef.current * 3) * 0.15;
    }
  });

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[x, 0.01, z]}
    >
      <ringGeometry args={[0.15, 0.25, 20]} />
      <meshBasicMaterial color="#ff6b4a" transparent opacity={0.4} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Main GameEngine3D Scene                                  */
/* ═══════════════════════════════════════════════════════════ */

export interface GameEngine3DProps {
  /** Player position ref (SVG coordinates, updated by game loop) */
  playerPosRef: React.RefObject<{ x: number; y: number }>;
  /** Player avatar config */
  playerConfig: AvatarConfig;
  /** Player equipped items */
  playerEquipped: string[];
  /** Is the player currently moving */
  isPlayerMoving: boolean;
  /** Player facing direction ref (1=right, -1=left) */
  facingRef: React.RefObject<number>;
  /** Bot states for rendering */
  bots: Array<{
    id: string;
    x: number;
    y: number;
    config: AvatarConfig;
    equipped: string[];
    isMoving: boolean;
    facing: number;
  }>;
  /** Move target for the tap-to-walk marker */
  moveTarget: { x: number; y: number } | null;
  /** Whether mobile */
  isMobile: boolean;
}

export function GameEngine3D({
  playerPosRef,
  playerConfig,
  playerEquipped,
  isPlayerMoving,
  facingRef,
  bots,
  moveTarget,
  isMobile,
}: GameEngine3DProps) {
  return (
    <Canvas
      dpr={[1, isMobile ? 1.5 : 2]}
      shadows={!isMobile}
      camera={{
        position: [
          SPAWN_SVG.x / S - WORLD_CX,
          Math.sin(CAMERA_ELEVATION) * CAMERA_ZOOM,
          -(SPAWN_SVG.y / S - WORLD_CZ) + Math.cos(CAMERA_ELEVATION) * CAMERA_ZOOM,
        ],
        fov: 50,
        near: 0.1,
        far: 100,
      }}
      className="absolute inset-0"
      style={{ pointerEvents: "none" }}
    >
      <FollowCamera posRef={playerPosRef} />

      {/* Sky color */}
      <color attach="background" args={["#87ceeb"]} />
      <fog attach="fog" args={["#87ceeb", 20, 45]} />

      {/* Lighting */}
      <ambientLight intensity={0.65} />
      <hemisphereLight args={["#cfe9ff", "#4c9a3a", 0.5]} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={1.6}
        castShadow={!isMobile}
        shadow-mapSize-width={isMobile ? 512 : 1024}
        shadow-mapSize-height={isMobile ? 512 : 1024}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />

      {/* Sun */}
      <mesh position={[10, 10, -6]}>
        <sphereGeometry args={[0.6, 12, 12]} />
        <meshBasicMaterial color="#ffe066" />
      </mesh>

      {/* Clouds */}
      {[
        { pos: [-5, 6, -3] as [number, number, number], s: 1 },
        { pos: [4, 7, -5] as [number, number, number], s: 0.8 },
        { pos: [-2, 6.5, 1] as [number, number, number], s: 0.9 },
      ].map((cl, i) => (
        <group key={i} position={cl.pos}>
          {[
            [0, 0, 0],
            [0.7, 0.1, 0.1],
            [-0.7, 0.1, -0.1],
            [0.25, 0.2, 0.05],
          ].map((o, j) => (
            <mesh
              key={j}
              position={o as [number, number, number]}
              scale={[1, 0.6, 0.8]}
            >
              <sphereGeometry args={[0.45 * cl.s, 8, 8]} />
              <meshStandardMaterial
                color="#ffffff"
                transparent
                opacity={0.85}
                roughness={1}
              />
            </mesh>
          ))}
        </group>
      ))}

      {/* === GROUND === */}
      <Ground />

      {/* === BUILDINGS === */}
      {BUILDINGS.map((def, i) => (
        <Building key={i} def={def} />
      ))}

      {/* === TREES === */}
      {TREES.map((def, i) => (
        <Tree3D key={i} def={def} />
      ))}

      {/* === LAMPS === */}
      {LAMPS.map((def, i) => (
        <Lamp3D key={i} def={def} />
      ))}

      {/* === STALLS === */}
      {STALLS.map((def, i) => (
        <Stall3D key={i} def={def} />
      ))}

      {/* === FLOWER BOXES === */}
      {FLOWER_BOXES.map((def, i) => (
        <FlowerBox3D key={i} def={def} />
      ))}

      {/* === BENCHES === */}
      {BENCHES.map((def, i) => (
        <Bench3D key={i} def={def} />
      ))}

      {/* === GIFT BOX === */}
      <GiftBox3D />

      {/* === MOVE TARGET MARKER === */}
      <MoveTarget3D target={moveTarget} />

      {/* === LOCAL PLAYER === */}
      <PlayerAvatar3D
        posRef={playerPosRef}
        config={playerConfig}
        equipped={playerEquipped}
        isMoving={isPlayerMoving}
        facingRef={facingRef}
      />

      {/* === BOTS === */}
      {bots.map((bot) => (
        <BotAvatar3D
          key={bot.id}
          x={bot.x}
          y={bot.y}
          config={bot.config}
          equipped={bot.equipped}
          isMoving={bot.isMoving}
          facing={bot.facing}
        />
      ))}
    </Canvas>
  );
}

export default GameEngine3D;
