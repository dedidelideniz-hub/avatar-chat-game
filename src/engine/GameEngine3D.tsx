/**
 * SANALIKA 3D GAME ENGINE — Street Prototype Scene
 *
 * A polished single-street level with:
 *   - Clear road with sidewalks
 *   - 5 buildings along the north side
 *   - Trees with wind sway
 *   - Lamp posts, benches, flower boxes
 *   - Vendor stalls
 *   - Player/bot billboard avatars
 *   - Smooth follow camera
 *   - Debug overlay
 */

import React, { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { EquippedItems } from "@/components/avatar/EquippedItems";
import type { AvatarConfig } from "@/lib/avatar";
import {
  WORLD_WIDTH,
  WORLD_DEPTH,
  CAMERA_ELEVATION,
  CAMERA_ZOOM,
  CAMERA_LERP_SPEED,
  PLAYER_3D_HEIGHT,
  SPAWN_SVG,
  ZONE,
  BUILDINGS,
  TREES,
  LAMPS,
  BENCHES,
  FLOWER_BOXES,
  STALLS,
  TREE_FOLIAGE_COLORS,
  TREE_TRUNK_COLOR,
  S,
  type BuildingDef,
  type TreeDef,
  type LampDef,
  type BenchDef,
  type FlowerBoxDef,
  type StallDef,
} from "./constants";

/* ═══════════════════════════════════════════════════════════ */
/*  Helpers                                                    */
/* ═══════════════════════════════════════════════════════════ */

/** SVG X → 3D X (centered) */
function sX(svgX: number): number {
  return svgX / S - WORLD_WIDTH / 2;
}
/** SVG Y → 3D Z (flip: SVG down → 3D toward camera) */
function sZ(svgY: number): number {
  return -(svgY / S - WORLD_DEPTH / 2);
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
    const tx = p.x / S - WORLD_WIDTH / 2;
    const tz = -(p.y / S - WORLD_DEPTH / 2);
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
/*  Ground — zone-colored ground planes                        */
/* ═══════════════════════════════════════════════════════════ */

function Ground() {
  const halfW = WORLD_WIDTH / 2 + 1;  // extend slightly beyond world edge
  const halfD = WORLD_DEPTH / 2 + 1;

  const zones = [
    // North grass
    { y: (ZONE.northGrassTop + ZONE.northGrassBot) / 2, h: ZONE.northGrassBot - ZONE.northGrassTop, color: "#5cb848" },
    // North sidewalk
    { y: (ZONE.northSidewalkTop + ZONE.northSidewalkBot) / 2, h: ZONE.northSidewalkBot - ZONE.northSidewalkTop, color: "#e0d8c8" },
    // Road — warm pedestrian paving
    { y: (ZONE.roadTop + ZONE.roadBot) / 2, h: ZONE.roadBot - ZONE.roadTop, color: "#c8b898" },
    // South sidewalk
    { y: (ZONE.southSidewalkTop + ZONE.southSidewalkBot) / 2, h: ZONE.southSidewalkBot - ZONE.southSidewalkTop, color: "#e0d8c8" },
    // South grass
    { y: (ZONE.southGrassTop + ZONE.southGrassBot) / 2, h: ZONE.southGrassBot - ZONE.southGrassTop, color: "#5cb848" },
  ];

  return (
    <group>
      {/* Base ground — green grass extending to world edge */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[WORLD_WIDTH + 2, WORLD_DEPTH + 2]} />
        <meshStandardMaterial color="#4ca838" roughness={1} />
      </mesh>

      {/* Zone overlays */}
      {zones.map((z, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005 * (i + 1), z.y]} receiveShadow>
          <planeGeometry args={[WORLD_WIDTH, z.h]} />
          <meshStandardMaterial color={z.color} roughness={0.9} />
        </mesh>
      ))}

      {/* Road center line — subtle divider */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, (ZONE.roadTop + ZONE.roadBot) / 2]}>
        <planeGeometry args={[WORLD_WIDTH, 0.06]} />
        <meshStandardMaterial color="#b0a088" />
      </mesh>

      {/* Road edge lines — north */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, ZONE.roadTop + 0.05]}>
        <planeGeometry args={[WORLD_WIDTH, 0.08]} />
        <meshStandardMaterial color="#a89878" />
      </mesh>
      {/* Road edge lines — south */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, ZONE.roadBot - 0.05]}>
        <planeGeometry args={[WORLD_WIDTH, 0.08]} />
        <meshStandardMaterial color="#a89878" />
      </mesh>

      {/* Plaza circle — center of the street */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, (ZONE.roadTop + ZONE.roadBot) / 2]}>
        <circleGeometry args={[1.2, 24]} />
        <meshStandardMaterial color="#d8c8a8" roughness={0.8} />
      </mesh>

      {/* Sidewalk curb stones — north edge */}
      <mesh position={[0, 0.06, ZONE.northSidewalkBot - 0.06]}>
        <boxGeometry args={[WORLD_WIDTH, 0.12, 0.12]} />
        <meshStandardMaterial color="#c0b8a0" roughness={0.85} />
      </mesh>
      {/* Sidewalk curb stones — south edge */}
      <mesh position={[0, 0.06, ZONE.southSidewalkTop + 0.06]}>
        <boxGeometry args={[WORLD_WIDTH, 0.12, 0.12]} />
        <meshStandardMaterial color="#c0b8a0" roughness={0.85} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Building — detailed low-poly with windows + door          */
/* ═══════════════════════════════════════════════════════════ */

function Building({ def }: { def: BuildingDef }) {
  const storyH = def.h / def.floors;
  const winW = Math.min(0.4, ((def.w - 0.5) / def.windows) * 0.55);
  const winH = storyH * 0.35;

  return (
    <group position={[def.x, def.h / 2, def.frontZ - def.d / 2]}>
      {/* Main body */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[def.w, def.h, def.d]} />
        <meshStandardMaterial color={def.front} roughness={0.8} />
      </mesh>

      {/* Roof slab — slightly overhanging */}
      <mesh position={[0, def.h / 2 + 0.06, 0]} castShadow>
        <boxGeometry args={[def.w + 0.15, 0.12, def.d + 0.15]} />
        <meshStandardMaterial color={def.roof} roughness={0.7} />
      </mesh>

      {/* Door — centered on front face */}
      <mesh position={[0, -def.h / 2 + 0.35, def.d / 2 + 0.01]}>
        <planeGeometry args={[0.45, 0.7]} />
        <meshStandardMaterial color="#6b4830" roughness={0.85} />
      </mesh>

      {/* Windows — arranged in grid on front face */}
      {Array.from({ length: def.floors }).map((_, floor) =>
        Array.from({ length: def.windows }).map((_, win) => {
          const wx = -def.w / 2 + (win + 1) * (def.w / (def.windows + 1));
          const wy = -def.h / 2 + (floor + 1) * storyH - storyH * 0.15;
          return (
            <mesh key={`${floor}-${win}`} position={[wx, wy, def.d / 2 + 0.01]}>
              <planeGeometry args={[winW, winH]} />
              <meshStandardMaterial
                color="#38b8f8"
                roughness={0.3}
                metalness={0.15}
                emissive="#1a4060"
                emissiveIntensity={0.1}
              />
            </mesh>
          );
        })
      )}

      {/* Side shadow — darker side face */}
      <mesh position={[def.w / 2 + 0.005, 0, 0]}>
        <planeGeometry args={[def.d, def.h]} />
        <meshStandardMaterial color={def.side} roughness={0.85} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Tree — low-poly with gentle wind sway                     */
/* ═══════════════════════════════════════════════════════════ */

function Tree3D({ def }: { def: TreeDef }) {
  const colors = TREE_FOLIAGE_COLORS[def.variant] ?? TREE_FOLIAGE_COLORS[0];
  const timeRef = useRef(Math.random() * 100);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    timeRef.current += dt;
    if (groupRef.current) {
      // Gentle sway — subtle and natural
      groupRef.current.rotation.z = Math.sin(timeRef.current * 0.7) * 0.015;
      groupRef.current.rotation.x = Math.sin(timeRef.current * 0.5 + 1.2) * 0.008;
    }
  });

  return (
    <group ref={groupRef} position={[def.x, 0, def.z]} scale={[def.scale, def.scale, def.scale]}>
      {/* Trunk */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.12, 1.2, 6]} />
        <meshStandardMaterial color={TREE_TRUNK_COLOR} roughness={0.9} />
      </mesh>
      {/* Main canopy */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <sphereGeometry args={[0.5, 8, 6]} />
        <meshStandardMaterial color={colors[0]} roughness={0.95} />
      </mesh>
      {/* Top canopy cluster */}
      <mesh position={[0.06, 1.85, 0.04]} castShadow>
        <sphereGeometry args={[0.35, 8, 6]} />
        <meshStandardMaterial color={colors[1]} roughness={0.95} />
      </mesh>
      {/* Side canopy cluster */}
      <mesh position={[-0.08, 1.35, -0.05]} castShadow>
        <sphereGeometry args={[0.3, 8, 6]} />
        <meshStandardMaterial color={colors[0]} roughness={0.95} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Lamp Post — simple stylized street lamp                    */
/* ═══════════════════════════════════════════════════════════ */

function Lamp3D({ def }: { def: LampDef }) {
  return (
    <group position={[def.x, 0, def.z]}>
      {/* Pole */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.04, 1.8, 6]} />
        <meshStandardMaterial color="#555555" roughness={0.5} />
      </mesh>
      {/* Arm */}
      <mesh position={[0.12, 1.75, 0]} rotation={[0, 0, -0.4]}>
        <cylinderGeometry args={[0.02, 0.02, 0.3, 4]} />
        <meshStandardMaterial color="#555555" roughness={0.5} />
      </mesh>
      {/* Light globe */}
      <mesh position={[0.2, 1.7, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial
          color="#fff4d0"
          emissive="#fff4d0"
          emissiveIntensity={0.5}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Bench — wooden park bench                                  */
/* ═══════════════════════════════════════════════════════════ */

function Bench3D({ def }: { def: BenchDef }) {
  return (
    <group position={[def.x, 0, def.z]}>
      {/* Seat */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[0.55, 0.04, 0.2]} />
        <meshStandardMaterial color="#c9a06c" roughness={0.8} />
      </mesh>
      {/* Backrest */}
      <mesh position={[0, 0.35, -0.08]} castShadow>
        <boxGeometry args={[0.55, 0.22, 0.04]} />
        <meshStandardMaterial color="#c9a06c" roughness={0.8} />
      </mesh>
      {/* Legs */}
      {[-0.22, 0.22].map((lx) => (
        <mesh key={lx} position={[lx, 0.11, 0]}>
          <boxGeometry args={[0.04, 0.22, 0.18]} />
          <meshStandardMaterial color="#6b4830" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Flower Box — colorful planter box                          */
/* ═══════════════════════════════════════════════════════════ */

function FlowerBox3D({ def }: { def: FlowerBoxDef }) {
  return (
    <group position={[def.x, 0, def.z]}>
      {/* Box */}
      <mesh position={[0, 0.12, 0]} castShadow>
        <boxGeometry args={[0.45, 0.24, 0.24]} />
        <meshStandardMaterial color="#8b6848" roughness={0.85} />
      </mesh>
      {/* Flowers */}
      {[[-0.12, 0.3, 0], [0, 0.32, 0.04], [0.12, 0.29, -0.03]].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]}>
          <sphereGeometry args={[0.065, 6, 6]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? "#ff6b8a" : i % 3 === 1 ? "#ffb347" : "#a855f7"}
            roughness={0.9}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Stall — vendor market stall with awning                    */
/* ═══════════════════════════════════════════════════════════ */

function Stall3D({ def }: { def: StallDef }) {
  return (
    <group position={[def.x, 0, def.z]}>
      {/* Table surface */}
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.1, 0.6]} />
        <meshStandardMaterial color="#8b6848" roughness={0.85} />
      </mesh>
      {/* Table legs */}
      {[-0.65, 0.65].map((lx) =>
        [-0.2, 0.2].map((lz) => (
          <mesh key={`${lx}-${lz}`} position={[lx, 0.17, lz]}>
            <boxGeometry args={[0.06, 0.34, 0.06]} />
            <meshStandardMaterial color="#6b4830" roughness={0.9} />
          </mesh>
        ))
      )}
      {/* Awning — tilted shade */}
      <mesh position={[0, 0.85, -0.2]} rotation={[0.3, 0, 0]} castShadow>
        <boxGeometry args={[1.8, 0.05, 0.9]} />
        <meshStandardMaterial color={def.color} roughness={0.7} />
      </mesh>
      {/* Back support poles */}
      {[-0.7, 0.7].map((lx) => (
        <mesh key={lx} position={[lx, 0.6, -0.4]}>
          <cylinderGeometry args={[0.025, 0.025, 1.0, 4]} />
          <meshStandardMaterial color="#6b4830" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Move Target Marker — pulsing ring                          */
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
/*  Player Avatar3D — billboard with facing flip + walk anim  */
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
    const wx = p.x / S - WORLD_WIDTH / 2;
    const wz = -(p.y / S - WORLD_DEPTH / 2);
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

    // Facing flip via DOM
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
/*  Bot Avatar3D                                               */
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
    groupRef.current.position.set(x / S - WORLD_WIDTH / 2, 0.02, -(y / S - WORLD_DEPTH / 2));

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
/*  Player Info HUD — debug position display                   */
/* ═══════════════════════════════════════════════════════════ */

function PlayerInfoHUD({ posRef }: { posRef: React.RefObject<{ x: number; y: number }> }) {
  const posText = useRef("...");

  useFrame(() => {
    if (!posRef.current) return;
    const p = posRef.current;
    const x3 = (p.x / S - WORLD_WIDTH / 2).toFixed(1);
    const z3 = (-(p.y / S - WORLD_DEPTH / 2)).toFixed(1);
    posText.current = `3D(${x3}, 0, ${z3})`;
  });

  return (
    <Html center distanceFactor={10} style={{ pointerEvents: "none" }} position={[0, PLAYER_3D_HEIGHT + 0.5, 0]} zIndexRange={[10, 0]}>
      <div style={{
        background: "rgba(0,0,0,0.7)",
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
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Debug Axes — X=red, Y=green, Z=blue                       */
/* ═══════════════════════════════════════════════════════════ */

function DebugAxes() {
  return (
    <group>
      {/* X axis — red */}
      <mesh position={[0, 0.015, 0]}>
        <boxGeometry args={[30, 0.03, 0.03]} />
        <meshBasicMaterial color="#ff3333" transparent opacity={0.25} />
      </mesh>
      {/* Z axis — blue */}
      <mesh position={[0, 0.015, 0]}>
        <boxGeometry args={[0.03, 0.03, 30]} />
        <meshBasicMaterial color="#3333ff" transparent opacity={0.25} />
      </mesh>
      {/* Origin marker */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.2, 12]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Main GameEngine3D                                          */
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
  const initCamY = Math.sin(CAMERA_ELEVATION) * CAMERA_ZOOM;
  const initCamZ = Math.cos(CAMERA_ELEVATION) * CAMERA_ZOOM;

  return (
    <Canvas
      dpr={[1, isMobile ? 1.5 : 2]}
      shadows={!isMobile}
      camera={{
        position: [sX(SPAWN_SVG.x), initCamY, sZ(SPAWN_SVG.y) + initCamZ],
        fov: 70,
        near: 0.1,
        far: 200,
      }}
      className="absolute inset-0"
      style={{ pointerEvents: "none" }}
    >
      <FollowCamera posRef={playerPosRef} />

      {/* Sky — clean gradient blue */}
      <color attach="background" args={["#7ec8e3"]} />

      {/* Lighting — warm, clear, mobile-friendly */}
      <ambientLight intensity={0.75} />
      <hemisphereLight args={["#d4ecff", "#5a9a40", 0.35]} />
      <directionalLight
        position={[6, 10, 5]}
        intensity={1.4}
        castShadow={!isMobile}
        shadow-mapSize-width={isMobile ? 512 : 1024}
        shadow-mapSize-height={isMobile ? 512 : 1024}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />

      {/* Sun — subtle in sky */}
      <mesh position={[12, 9, -8]}>
        <sphereGeometry args={[0.35, 10, 10]} />
        <meshBasicMaterial color="#ffe870" />
      </mesh>

      {/* === DEBUG === */}
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

      {/* === MOVE TARGET === */}
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
