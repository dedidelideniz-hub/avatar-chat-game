/**
 * SANALIKA 3D GAME ENGINE — Main Scene
 *
 * COORDINATE SYSTEM (fixed):
 *   X = right / left (centered, -16..+16)
 *   Y = up (0 = ground, positive = above)
 *   Z = toward camera (positive = "south")
 *
 * Key fixes:
 *   - Camera at ~60° angle, distance 12, shows ground+player clearly
 *   - Buildings scaled to 2-4 units (player = 1.92 units = reference)
 *   - No clouds/fog — clean visible scene
 *   - Debug axes overlay for verification
 *   - Ground clearly visible with distinct zone colors
 */

import React, { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { EquippedItems } from "@/components/avatar/EquippedItems";
import type { AvatarConfig } from "@/lib/avatar";
import {
  S,
  WORLD_CX,
  WORLD_CZ,
  CAMERA_ELEVATION,
  CAMERA_ZOOM,
  CAMERA_LERP_SPEED,
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
  BUILDING_HEIGHT_SCALE,
  type BuildingDef,
  type TreePos,
  type LampPos,
  type PosXY,
  type StallDef,
} from "./constants";

/* ═══════════════════════════════════════════════════════════ */
/*  Helpers                                                  */
/* ═══════════════════════════════════════════════════════════ */

/** SVG X → 3D X (centered) */
function sX(svgX: number): number {
  return svgX / S - WORLD_CX;
}
/** SVG Y → 3D Z (flip: SVG down → 3D toward camera) */
function sZ(svgY: number): number {
  return -(svgY / S - WORLD_CZ);
}

/* ═══════════════════════════════════════════════════════════ */
/*  Follow Camera — smooth lerp to player                     */
/* ═══════════════════════════════════════════════════════════ */

function FollowCamera({ posRef }: { posRef: React.RefObject<{ x: number; y: number }> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const target = useRef(new THREE.Vector3());
  const cur = useRef(new THREE.Vector3(sX(SPAWN_SVG.x), 0, sZ(SPAWN_SVG.y)));

  useFrame((_, dt) => {
    const p = posRef.current;
    const tx = p.x / S - WORLD_CX;
    const tz = -(p.y / S - WORLD_CZ);
    target.current.set(tx, 0, tz);

    const lerp = Math.min(1, CAMERA_LERP_SPEED * dt);
    cur.current.lerp(target.current, lerp);

    const el = CAMERA_ELEVATION;
    const d = CAMERA_ZOOM;
    camera.position.set(
      cur.current.x,
      cur.current.y + Math.sin(el) * d,
      cur.current.z + Math.cos(el) * d,
    );
    camera.lookAt(cur.current.x, 0, cur.current.z);
  });

  return null;
}

/* ═══════════════════════════════════════════════════════════ */
/*  Debug Axes — X=red, Y=green, Z=blue                      */
/* ═══════════════════════════════════════════════════════════ */

function DebugAxes() {
  const len = 20;
  return (
    <group>
      {/* X axis — red */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[len, 0.04, 0.04]} />
        <meshBasicMaterial color="#ff0000" />
      </mesh>
      {/* Y axis — green (vertical) */}
      <mesh position={[0, len / 2, 0]}>
        <boxGeometry args={[0.04, len, 0.04]} />
        <meshBasicMaterial color="#00ff00" />
      </mesh>
      {/* Z axis — blue */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.04, 0.04, len]} />
        <meshBasicMaterial color="#0000ff" />
      </mesh>
      {/* Grid on ground */}
      {Array.from({ length: 21 }).map((_, i) => {
        const pos = -10 + i;
        return (
          <React.Fragment key={i}>
            <mesh position={[pos, 0.005, 0]}>
              <boxGeometry args={[0.02, 0.001, 20]} />
              <meshBasicMaterial color="#666666" transparent opacity={0.3} />
            </mesh>
            <mesh position={[0, 0.005, pos]}>
              <boxGeometry args={[20, 0.001, 0.02]} />
              <meshBasicMaterial color="#666666" transparent opacity={0.3} />
            </mesh>
          </React.Fragment>
        );
      })}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Ground — clear zone-colored ground plane                   */
/* ═══════════════════════════════════════════════════════════ */

function Ground() {
  const worldW = 32;
  const worldD = 18;
  const cx = WORLD_CX;
  const cz = WORLD_CZ;

  // Zone boundaries in 3D Z
  const bldgEnd = sZ(470);      // buildings end / sidewalk start
  const roadTop = sZ(555);      // promenade start
  const roadBot = sZ(685);      // promenade end / vendor start
  const vendorEnd = sZ(820);    // vendor end / grass start

  return (
    <group>
      {/* Base ground — dark green grass (full extent) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.01, cz]} receiveShadow>
        <planeGeometry args={[worldW, worldD]} />
        <meshStandardMaterial color="#3a8a30" roughness={1} />
      </mesh>

      {/* Top sidewalk (buildings front area) — warm stone */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.005, (bldgEnd + roadTop) / 2]} receiveShadow>
        <planeGeometry args={[worldW, Math.abs(bldgEnd - roadTop)]} />
        <meshStandardMaterial color="#d8d0c0" roughness={0.9} />
      </mesh>

      {/* Central promenade — stone tile */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.01, (roadTop + roadBot) / 2]} receiveShadow>
        <planeGeometry args={[worldW, Math.abs(roadTop - roadBot)]} />
        <meshStandardMaterial color="#c0b8a8" roughness={0.85} />
      </mesh>

      {/* Bottom vendor zone — warm stone */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.005, (roadBot + vendorEnd) / 2]} receiveShadow>
        <planeGeometry args={[worldW, Math.abs(roadBot - vendorEnd)]} />
        <meshStandardMaterial color="#d0c8b8" roughness={0.9} />
      </mesh>

      {/* Road center line (decorative) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.015, (roadTop + roadBot) / 2]}>
        <planeGeometry args={[worldW, 0.08]} />
        <meshStandardMaterial color="#a09888" />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Building — proper height, sits on ground                  */
/* ═══════════════════════════════════════════════════════════ */

function Building({ def }: { def: BuildingDef }) {
  const w3d = def.w / S;   // width in 3D
  const h3d = def.h * BUILDING_HEIGHT_SCALE; // height in 3D (2-4 units)
  const d3d = 1.5;         // depth into scene

  const x = sX(def.x + def.w / 2);
  const z = sZ(470) - d3d / 2 - 0.5; // behind sidewalk

  const storyH = h3d / def.floors;
  const winW = Math.min(0.35, (w3d - 0.4) / def.windows * 0.6);
  const winH = storyH * 0.4;

  return (
    <group position={[x, h3d / 2, z]}>
      {/* Main body */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w3d, h3d, d3d]} />
        <meshStandardMaterial color={def.front} roughness={0.8} />
      </mesh>

      {/* Roof slab */}
      <mesh position={[0, h3d / 2 + 0.05, 0]} castShadow>
        <boxGeometry args={[w3d + 0.1, 0.1, d3d + 0.1]} />
        <meshStandardMaterial color={def.top} roughness={0.6} />
      </mesh>

      {/* Windows */}
      {Array.from({ length: def.floors }).map((_, floor) =>
        Array.from({ length: def.windows }).map((_, win) => {
          const wx = -w3d / 2 + (win + 1) * (w3d / (def.windows + 1));
          const wy = -h3d / 2 + (floor + 0.5) * storyH;
          return (
            <mesh key={`${floor}-${win}`} position={[wx, wy, d3d / 2 + 0.01]}>
              <planeGeometry args={[winW, winH]} />
              <meshStandardMaterial color="#38b8f8" roughness={0.3} metalness={0.2} />
            </mesh>
          );
        })
      )}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Tree — low-poly with wind sway                           */
/* ═══════════════════════════════════════════════════════════ */

function Tree3D({ def }: { def: TreePos }) {
  const x = sX(def.x);
  const z = sZ(def.y);
  const s = def.scale * 0.6; // scale down trees a bit
  const colors = TREE_FOLIAGE_COLORS[def.variant] ?? TREE_FOLIAGE_COLORS[0];
  const timeRef = useRef(Math.random() * 100);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    timeRef.current += dt;
    if (groupRef.current) {
      groupRef.current.rotation.z = Math.sin(timeRef.current * 0.8) * 0.02 * s;
    }
  });

  return (
    <group ref={groupRef} position={[x, 0, z]} scale={[s, s, s]}>
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.1, 0.8, 6]} />
        <meshStandardMaterial color={TREE_TRUNK_COLOR} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.0, 0]} castShadow>
        <sphereGeometry args={[0.35, 8, 6]} />
        <meshStandardMaterial color={colors[0]} roughness={0.95} />
      </mesh>
      <mesh position={[0.05, 1.3, 0.05]} castShadow>
        <sphereGeometry args={[0.28, 8, 6]} />
        <meshStandardMaterial color={colors[1]} roughness={0.95} />
      </mesh>
      <mesh position={[-0.03, 1.55, -0.03]} castShadow>
        <sphereGeometry args={[0.2, 8, 6]} />
        <meshStandardMaterial color={colors[0]} roughness={0.95} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Lamp                                                     */
/* ═══════════════════════════════════════════════════════════ */

function Lamp3D({ def }: { def: LampPos }) {
  return (
    <group position={[sX(def.x), 0, sZ(def.y)]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.04, 1.8, 6]} />
        <meshStandardMaterial color="#555555" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.85, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color="#fff4d0" emissive="#fff4d0" emissiveIntensity={0.6} roughness={0.2} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Stall                                                    */
/* ═══════════════════════════════════════════════════════════ */

function Stall3D({ def }: { def: StallDef }) {
  return (
    <group position={[sX(def.x), 0, sZ(def.y)]}>
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.12, 0.6]} />
        <meshStandardMaterial color="#8b6848" roughness={0.85} />
      </mesh>
      {[-0.65, 0.65].map((lx) =>
        [-0.2, 0.2].map((lz) => (
          <mesh key={`${lx}-${lz}`} position={[lx, 0.17, lz]}>
            <boxGeometry args={[0.06, 0.34, 0.06]} />
            <meshStandardMaterial color="#6b4830" roughness={0.9} />
          </mesh>
        ))
      )}
      <mesh position={[0, 0.9, -0.15]} rotation={[0.3, 0, 0]} castShadow>
        <boxGeometry args={[1.8, 0.06, 0.9]} />
        <meshStandardMaterial color={def.color} roughness={0.7} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Flower Box                                               */
/* ═══════════════════════════════════════════════════════════ */

function FlowerBox3D({ def }: { def: PosXY }) {
  return (
    <group position={[sX(def.x), 0, sZ(def.y)]}>
      <mesh position={[0, 0.12, 0]} castShadow>
        <boxGeometry args={[0.4, 0.24, 0.24]} />
        <meshStandardMaterial color="#8b6848" roughness={0.85} />
      </mesh>
      {[[-0.1, 0.3, 0], [0, 0.32, 0.05], [0.1, 0.28, -0.03]].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]}>
          <sphereGeometry args={[0.06, 6, 6]} />
          <meshStandardMaterial color={i % 2 === 0 ? "#ff6b8a" : "#ffb347"} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Bench                                                    */
/* ═══════════════════════════════════════════════════════════ */

function Bench3D({ def }: { def: PosXY }) {
  return (
    <group position={[sX(def.x), 0, sZ(def.y)]}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[0.5, 0.04, 0.18]} />
        <meshStandardMaterial color="#c9a06c" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.35, -0.07]} castShadow>
        <boxGeometry args={[0.5, 0.22, 0.04]} />
        <meshStandardMaterial color="#c9a06c" roughness={0.8} />
      </mesh>
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
/*  Gift Box — floating                                      */
/* ═══════════════════════════════════════════════════════════ */

function GiftBox3D() {
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
    <group position={[sX(800), 0, sZ(852)]}>
      <group ref={groupRef}>
        <mesh castShadow>
          <boxGeometry args={[0.45, 0.45, 0.45]} />
          <meshStandardMaterial color="#ef4444" roughness={0.6} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.08, 0.47, 0.47]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.5} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.47, 0.08, 0.47]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.5} />
        </mesh>
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

function MoveTarget3D({ target }: { target: { x: number; y: number } | null }) {
  if (!target) return null;
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  useFrame((_, dt) => {
    timeRef.current += dt;
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.3 + Math.sin(timeRef.current * 3) * 0.15;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[sX(target.x), 0.01, sZ(target.y)]}>
      <ringGeometry args={[0.15, 0.25, 20]} />
      <meshBasicMaterial color="#ff6b4a" transparent opacity={0.4} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Player Avatar3D — billboard with facing flip             */
/* ═══════════════════════════════════════════════════════════ */

function PlayerAvatar3D({
  posRef,
  config,
  equipped,
  facingRef,
}: {
  posRef: React.RefObject<{ x: number; y: number }>;
  config: AvatarConfig;
  equipped: string[];
  facingRef: React.RefObject<number>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const divRef = useRef<HTMLDivElement>(null);
  const prevPos = useRef({ x: 0, y: 0 });
  const isWalking = useRef(false);

  useFrame(() => {
    if (!groupRef.current || !posRef.current) return;
    const p = posRef.current;
    const wx = p.x / S - WORLD_CX;
    const wz = -(p.y / S - WORLD_CZ);
    groupRef.current.position.set(wx, 0.02, wz);

    // Detect movement from position delta
    const dx = Math.abs(p.x - prevPos.current.x);
    const dy = Math.abs(p.y - prevPos.current.y);
    const moving = dx > 0.1 || dy > 0.1;
    if (moving !== isWalking.current && divRef.current) {
      isWalking.current = moving;
      divRef.current.classList.toggle("walking", moving);
    }
    prevPos.current = { x: p.x, y: p.y };

    // Update facing flip via DOM
    if (divRef.current) {
      const flip = (facingRef.current ?? 1) < 0 ? -1 : 1;
      divRef.current.style.transform = `scaleX(${flip})`;
    }
  });

  return (
    <group ref={groupRef}>
      <Html center distanceFactor={10} style={{ pointerEvents: "none", transform: "translateY(-50%)" }} zIndexRange={[10, 0]}>
        <div
          ref={divRef}
          style={{
            width: 70,
            height: 96,
            transform: `scaleX(${(facingRef.current ?? 1) < 0 ? -1 : 1})`,
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
/*  Bot Avatar3D                                             */
/* ═══════════════════════════════════════════════════════════ */

function BotAvatar3D({
  x, y, config, equipped, isMoving, facing,
}: {
  x: number; y: number; config: AvatarConfig; equipped: string[];
  isMoving: boolean; facing: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const divRef = useRef<HTMLDivElement>(null);
  const prevPos = useRef({ x: 0, y: 0 });
  const isWalkingRef = useRef(false);

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(x / S - WORLD_CX, 0.02, -(y / S - WORLD_CZ));

    // Detect movement from position delta
    const dx = Math.abs(x - prevPos.current.x);
    const dy = Math.abs(y - prevPos.current.y);
    const moving = dx > 0.1 || dy > 0.1;
    if (moving !== isWalkingRef.current && divRef.current) {
      isWalkingRef.current = moving;
      divRef.current.classList.toggle("walking", moving);
    }
    prevPos.current = { x, y };

    if (divRef.current) {
      divRef.current.style.transform = `scaleX(${facing < 0 ? -1 : 1})`;
    }
  });

  return (
    <group ref={groupRef}>
      <Html center distanceFactor={10} style={{ pointerEvents: "none", transform: "translateY(-50%)" }} zIndexRange={[10, 0]}>
        <div
          ref={divRef}
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
/*  Player Info HUD — debug position display                 */
/* ═══════════════════════════════════════════════════════════ */

function PlayerInfoHUD({ posRef }: { posRef: React.RefObject<{ x: number; y: number }> }) {
  const groupRef = useRef<THREE.Group>(null);
  const posText = useRef("...");

  useFrame(() => {
    if (!posRef.current) return;
    const p = posRef.current;
    const x3 = (p.x / S - WORLD_CX).toFixed(1);
    const z3 = (-(p.y / S - WORLD_CZ)).toFixed(1);
    posText.current = `SVG(${p.x.toFixed(0)},${p.y.toFixed(0)}) 3D(${x3},0,${z3})`;
  });

  return (
    <group ref={groupRef}>
      <Html center distanceFactor={10} style={{ pointerEvents: "none" }} position={[0, PLAYER_3D_HEIGHT + 0.6, 0]} zIndexRange={[10, 0]}>
        <div style={{
          background: "rgba(0,0,0,0.75)",
          color: "#0f0",
          fontSize: "9px",
          fontFamily: "monospace",
          padding: "2px 4px",
          borderRadius: "3px",
          whiteSpace: "nowrap",
          textAlign: "center",
        }}>
          {posText.current}
        </div>
      </Html>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Main GameEngine3D                                        */
/* ═══════════════════════════════════════════════════════════ */

export interface GameEngine3DProps {
  playerPosRef: React.RefObject<{ x: number; y: number }>;
  playerConfig: AvatarConfig;
  playerEquipped: string[];
  facingRef: React.RefObject<number>;
  bots: Array<{
    id: string;
    x: number;
    y: number;
    config: AvatarConfig;
    equipped: string[];
    isMoving: boolean;
    facing: number;
  }>;
  moveTarget: { x: number; y: number } | null;
  isMobile: boolean;
}

export function GameEngine3D({
  playerPosRef,
  playerConfig,
  playerEquipped,
  facingRef,
  bots,
  moveTarget,
  isMobile,
}: GameEngine3DProps) {
  // Initial camera position — matches the follow camera start
  const initCamY = Math.sin(CAMERA_ELEVATION) * CAMERA_ZOOM;
  const initCamZ = Math.cos(CAMERA_ELEVATION) * CAMERA_ZOOM;

  return (
    <Canvas
      dpr={[1, isMobile ? 1.5 : 2]}
      shadows={!isMobile}
      camera={{
        position: [sX(SPAWN_SVG.x), initCamY, sZ(SPAWN_SVG.y) + initCamZ],
        fov: 60,
        near: 0.1,
        far: 200,
      }}
      className="absolute inset-0"
      style={{ pointerEvents: "none" }}
    >
      <FollowCamera posRef={playerPosRef} />

      {/* Sky — light blue background */}
      <color attach="background" args={["#87ceeb"]} />

      {/* Lighting — simple, clear */}
      <ambientLight intensity={0.7} />
      <hemisphereLight args={["#cfe9ff", "#4c9a3a", 0.4]} />
      <directionalLight
        position={[8, 10, 4]}
        intensity={1.5}
        castShadow={!isMobile}
        shadow-mapSize-width={isMobile ? 512 : 1024}
        shadow-mapSize-height={isMobile ? 512 : 1024}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />

      {/* Sun — small sphere in the sky */}
      <mesh position={[10, 8, -8]}>
        <sphereGeometry args={[0.4, 12, 12]} />
        <meshBasicMaterial color="#ffe066" />
      </mesh>

      {/* === DEBUG AXES === */}
      <DebugAxes />

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
        facingRef={facingRef}
      />
      <PlayerInfoHUD posRef={playerPosRef} />

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
