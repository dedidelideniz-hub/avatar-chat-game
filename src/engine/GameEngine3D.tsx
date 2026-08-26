/**
 * SANALIKA 3D GAME ENGINE — Visual Polish Pass
 *
 * All positions, coordinates, zones, and dimensions are UNCHANGED.
 * This file only improves: materials, colors, lighting, detail geometry.
 */
import React, { useRef, useMemo, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { EquippedItems } from "@/components/avatar/EquippedItems";
import { GlbAvatarTest } from "./GlbAvatarTest";
import { GlbAvatar3D, SVG_DEBUG_MODE } from "./GlbAvatar3D";
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

function sX(svgX: number): number {
  return svgX / S - WORLD_WIDTH / 2;
}
function sZ(svgY: number): number {
  return -(svgY / S - WORLD_DEPTH / 2);
}
/** Inverse: 3D X → SVG X */
function toSvgX(x3: number): number {
  return (x3 + WORLD_WIDTH / 2) * S;
}
/** Inverse: 3D Z → SVG Y */
function toSvgY(z3: number): number {
  return (-(z3) + WORLD_DEPTH / 2) * S;
}

/* ═══════════════════════════════════════════════════════════ */
/*  Raycast API — exported for World.tsx click handling         */
/* ═══════════════════════════════════════════════════════════ */

let _engineCamera: THREE.PerspectiveCamera | null = null;
const _raycaster = new THREE.Raycaster();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _screenVec = new THREE.Vector2();

/** Convert screen pixel position to SVG world coordinates via 3D raycast.
 *  Call from World.tsx click handler: raycastScreenToSVG(e.clientX, e.clientY, containerEl)
 *  Returns null if the ray doesn't hit the ground. */
export function raycastScreenToSVG(
  clientX: number,
  clientY: number,
  container: HTMLElement,
): { x: number; y: number } | null {
  if (!_engineCamera) return null;
  const rect = container.getBoundingClientRect();
  // Normalized device coordinates (-1..+1)
  _screenVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _screenVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_screenVec, _engineCamera);
  const hit = new THREE.Vector3();
  const intersected = _raycaster.ray.intersectPlane(_groundPlane, hit);
  if (!intersected) return null;
  return { x: toSvgX(hit.x), y: toSvgY(hit.z) };
}

/** Convert SVG coordinates to 3D world coordinates.
 *  SVG X → 3D X, SVG Y → 3D Z, ground Y = 0. */
export function svgToWorld(svgX: number, svgY: number): { x: number; y: number; z: number } {
  return { x: svgX / S - WORLD_WIDTH / 2, y: 0, z: -(svgY / S - WORLD_DEPTH / 2) };
}

/** Project a 3D world position to screen-space pixel coordinates.
 *  Returns null if the point is behind the camera. */
export function worldToScreen(
  worldX: number,
  worldY: number,
  worldZ: number,
  container: HTMLElement,
): { sx: number; sy: number } | null {
  if (!_engineCamera) return null;
  const vec = new THREE.Vector3(worldX, worldY, worldZ);
  vec.project(_engineCamera);
  const rect = container.getBoundingClientRect();
  return {
    sx: ((vec.x + 1) / 2) * rect.width,
    sy: ((-vec.y + 1) / 2) * rect.height,
  };
}



/* ═══════════════════════════════════════════════════════════ */
/*  Follow Camera                                             */
/* ═══════════════════════════════════════════════════════════ */

function FollowCamera({ posRef }: { posRef: React.RefObject<{ x: number; y: number }> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  // Expose camera for raycastScreenToSVG
  React.useEffect(() => { _engineCamera = camera; return () => { _engineCamera = null; }; }, [camera]);
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
/*  Ground — polished zones with road detail                   */
/* ═══════════════════════════════════════════════════════════ */

function Ground() {
  const roadMid = (ZONE.roadTop + ZONE.roadBot) / 2;
  const roadW = ZONE.roadBot - ZONE.roadTop;

  // Subtle road dashes for pedestrian walkway feel
  const dashes = useMemo(() => {
    const arr: number[] = [];
    for (let x = -14; x <= 14; x += 1.6) arr.push(x);
    return arr;
  }, []);

  return (
    <group>
      {/* Base grass — full extent */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[WORLD_WIDTH + 4, WORLD_DEPTH + 4]} />
        <meshStandardMaterial color="#3da830" roughness={1} />
      </mesh>

      {/* North grass overlay — slightly brighter */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, (ZONE.northGrassTop + ZONE.northGrassBot) / 2]} receiveShadow>
        <planeGeometry args={[WORLD_WIDTH, ZONE.northGrassBot - ZONE.northGrassTop]} />
        <meshStandardMaterial color="#55c040" roughness={1} />
      </mesh>

      {/* North sidewalk — warm stone */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, (ZONE.northSidewalkTop + ZONE.northSidewalkBot) / 2]} receiveShadow>
        <planeGeometry args={[WORLD_WIDTH, ZONE.northSidewalkBot - ZONE.northSidewalkTop]} />
        <meshStandardMaterial color="#ddd4c0" roughness={0.92} />
      </mesh>

      {/* Road surface — warm pedestrian paving */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, roadMid]} receiveShadow>
        <planeGeometry args={[WORLD_WIDTH, roadW]} />
        <meshStandardMaterial color="#9e9486" roughness={0.95} />
      </mesh>

      {/* Road dashes — pedestrian lane markers */}
      {dashes.map((dx) => (
        <mesh key={dx} rotation={[-Math.PI / 2, 0, 0]} position={[dx, 0.012, roadMid]}>
          <planeGeometry args={[0.6, 0.06]} />
          <meshStandardMaterial color="#bfb5a3" roughness={0.9} />
        </mesh>
      ))}

      {/* South sidewalk — warm stone */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, (ZONE.southSidewalkTop + ZONE.southSidewalkBot) / 2]} receiveShadow>
        <planeGeometry args={[WORLD_WIDTH, ZONE.southSidewalkBot - ZONE.southSidewalkTop]} />
        <meshStandardMaterial color="#ddd4c0" roughness={0.92} />
      </mesh>

      {/* South grass overlay */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, (ZONE.southGrassTop + ZONE.southGrassBot) / 2]} receiveShadow>
        <planeGeometry args={[WORLD_WIDTH, ZONE.southGrassBot - ZONE.southGrassTop]} />
        <meshStandardMaterial color="#55c040" roughness={1} />
      </mesh>

      {/* ═══ Curbs ═══ */}
      {/* North sidewalk → road curb */}
      <mesh position={[0, 0.05, ZONE.northSidewalkBot]}>
        <boxGeometry args={[WORLD_WIDTH, 0.1, 0.12]} />
        <meshStandardMaterial color="#b5ad98" roughness={0.88} />
      </mesh>
      {/* Road → south sidewalk curb */}
      <mesh position={[0, 0.05, ZONE.southSidewalkTop]}>
        <boxGeometry args={[WORLD_WIDTH, 0.1, 0.12]} />
        <meshStandardMaterial color="#b5ad98" roughness={0.88} />
      </mesh>

      {/* ═══ Central plaza circle ═══ */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, roadMid]}>
        <circleGeometry args={[1.3, 32]} />
        <meshStandardMaterial color="#c8bca4" roughness={0.85} />
      </mesh>
      {/* Plaza inner ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, roadMid]}>
        <ringGeometry args={[0.8, 0.85, 32]} />
        <meshStandardMaterial color="#a89880" roughness={0.88} />
      </mesh>
      {/* Plaza center dot */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, roadMid]}>
        <circleGeometry args={[0.25, 16]} />
        <meshStandardMaterial color="#b8a890" roughness={0.82} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Building — polished with ledges, awnings, window frames   */
/* ═══════════════════════════════════════════════════════════ */

function Building({ def }: { def: BuildingDef }) {
  const storyH = def.h / def.floors;
  const winW = Math.min(0.38, ((def.w - 0.6) / def.windows) * 0.52);
  const winH = storyH * 0.32;

  // Alternate facade material colors for visual variety
  const facadeMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({ color: def.front, roughness: 0.82 });
  }, [def.front]);
  const sideMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({ color: def.side, roughness: 0.88 });
  }, [def.side]);
  const roofMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({ color: def.roof, roughness: 0.75 });
  }, [def.roof]);

  return (
    <group position={[def.x, def.h / 2, def.frontZ - def.d / 2]}>
      {/* Main body */}
      <mesh material={facadeMat} castShadow receiveShadow>
        <boxGeometry args={[def.w, def.h, def.d]} />
      </mesh>

      {/* Side face — darker */}
      <mesh position={[def.w / 2 + 0.005, 0, 0]} material={sideMat}>
        <planeGeometry args={[def.d, def.h]} />
      </mesh>

      {/* ═══ Roof — textured slab with slight overhang ═══ */}
      <mesh position={[0, def.h / 2 + 0.06, 0]} material={roofMat} castShadow>
        <boxGeometry args={[def.w + 0.18, 0.14, def.d + 0.18]} />
      </mesh>
      {/* Roof edge trim */}
      <mesh position={[0, def.h / 2 + 0.14, 0]}>
        <boxGeometry args={[def.w + 0.22, 0.04, def.d + 0.22]} />
        <meshStandardMaterial color="#e0dcd4" roughness={0.7} />
      </mesh>

      {/* ═══ Front ledge — architectural detail ═══ */}
      <mesh position={[0, -def.h / 2 + 0.08, def.d / 2 + 0.02]}>
        <boxGeometry args={[def.w + 0.08, 0.16, 0.06]} />
        <meshStandardMaterial color="#d8d0c0" roughness={0.8} />
      </mesh>

      {/* ═══ Door ═══ */}
      {/* Door frame */}
      <mesh position={[0, -def.h / 2 + 0.4, def.d / 2 + 0.015]}>
        <boxGeometry args={[0.52, 0.82, 0.03]} />
        <meshStandardMaterial color="#7a5838" roughness={0.85} />
      </mesh>
      {/* Door panel */}
      <mesh position={[0, -def.h / 2 + 0.38, def.d / 2 + 0.035]}>
        <planeGeometry args={[0.4, 0.7]} />
        <meshStandardMaterial color="#5c3820" roughness={0.88} />
      </mesh>
      {/* Door handle */}
      <mesh position={[0.12, -def.h / 2 + 0.38, def.d / 2 + 0.05]}>
        <sphereGeometry args={[0.025, 6, 6]} />
        <meshStandardMaterial color="#d4a840" roughness={0.4} metalness={0.5} />
      </mesh>

      {/* ═══ Windows — with frames ═══ */}
      {Array.from({ length: def.floors }).map((_, floor) =>
        Array.from({ length: def.windows }).map((_, win) => {
          const wx = -def.w / 2 + (win + 1) * (def.w / (def.windows + 1));
          const wy = -def.h / 2 + (floor + 1) * storyH - storyH * 0.15;
          return (
            <group key={`${floor}-${win}`} position={[wx, wy, def.d / 2 + 0.01]}>
              {/* Window frame */}
              <mesh position={[0, 0, -0.005]}>
                <boxGeometry args={[winW + 0.06, winH + 0.06, 0.02]} />
                <meshStandardMaterial color="#e8e4dc" roughness={0.7} />
              </mesh>
              {/* Glass pane */}
              <mesh position={[0, 0, 0.005]}>
                <planeGeometry args={[winW, winH]} />
                <meshStandardMaterial
                  color="#5cc8f0"
                  roughness={0.2}
                  metalness={0.15}
                  emissive="#183848"
                  emissiveIntensity={0.15}
                />
              </mesh>
              {/* Window sill */}
              <mesh position={[0, -winH / 2 - 0.02, 0.02]}>
                <boxGeometry args={[winW + 0.1, 0.04, 0.06]} />
                <meshStandardMaterial color="#d8d0c0" roughness={0.8} />
              </mesh>
            </group>
          );
        })
      )}

      {/* ═══ Sign board — above door ═══ */}
      <mesh position={[0, -def.h / 2 + 0.95, def.d / 2 + 0.025]}>
        <boxGeometry args={[def.w * 0.5, 0.22, 0.03]} />
        <meshStandardMaterial color="#4a3828" roughness={0.85} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Tree — polished layered foliage with crown                 */
/* ═══════════════════════════════════════════════════════════ */

function Tree3D({ def }: { def: TreeDef }) {
  const colors = TREE_FOLIAGE_COLORS[def.variant] ?? TREE_FOLIAGE_COLORS[0];
  const timeRef = useRef(Math.random() * 100);
  const groupRef = useRef<THREE.Group>(null);

  // Subtle per-tree rotation offset
  const rotOffset = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame((_, dt) => {
    timeRef.current += dt;
    if (groupRef.current) {
      groupRef.current.rotation.z = Math.sin(timeRef.current * 0.7) * 0.018;
      groupRef.current.rotation.x = Math.sin(timeRef.current * 0.5 + rotOffset) * 0.01;
    }
  });



  return (
    <group ref={groupRef} position={[def.x, 0, def.z]} scale={[def.scale, def.scale, def.scale]}>
      {/* Trunk — tapered cylinder */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.1, 1.1, 6]} />
        <meshStandardMaterial color="#6a4828" roughness={0.92} />
      </mesh>
      {/* Lower branches — darker */}
      <mesh position={[0, 1.15, 0]} castShadow>
        <sphereGeometry args={[0.48, 8, 6]} />
        <meshStandardMaterial color={colors[1]} roughness={0.95} />
      </mesh>
      {/* Main canopy — bright */}
      <mesh position={[0.04, 1.5, 0.03]} castShadow>
        <sphereGeometry args={[0.52, 8, 6]} />
        <meshStandardMaterial color={colors[0]} roughness={0.95} />
      </mesh>
      {/* Top crown */}
      <mesh position={[-0.03, 1.82, -0.02]} castShadow>
        <sphereGeometry args={[0.32, 8, 6]} />
        <meshStandardMaterial color={colors[0]} roughness={0.95} />
      </mesh>
      {/* Side accent */}
      <mesh position={[0.12, 1.3, 0.08]} castShadow>
        <sphereGeometry args={[0.25, 8, 6]} />
        <meshStandardMaterial color={colors[1]} roughness={0.95} />
      </mesh>
      {/* Shadow blob at base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <circleGeometry args={[0.35, 12]} />
        <meshStandardMaterial color="#2a6818" roughness={1} transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Lamp Post                                                  */
/* ═══════════════════════════════════════════════════════════ */

function Lamp3D({ def }: { def: LampDef }) {
  return (
    <group position={[def.x, 0, def.z]}>
      {/* Base plate */}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.06, 8]} />
        <meshStandardMaterial color="#3a3a40" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Pole */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.035, 1.75, 6]} />
        <meshStandardMaterial color="#4a4a52" roughness={0.55} metalness={0.3} />
      </mesh>
      {/* Arm bracket */}
      <mesh position={[0.1, 1.72, 0]} rotation={[0, 0, -0.35]}>
        <cylinderGeometry args={[0.018, 0.018, 0.28, 4]} />
        <meshStandardMaterial color="#4a4a52" roughness={0.55} metalness={0.3} />
      </mesh>
      {/* Lamp housing */}
      <mesh position={[0.18, 1.68, 0]}>
        <boxGeometry args={[0.12, 0.1, 0.1]} />
        <meshStandardMaterial color="#3a3a40" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Light globe — warm glow */}
      <mesh position={[0.18, 1.62, 0]}>
        <sphereGeometry args={[0.065, 8, 8]} />
        <meshStandardMaterial color="#fff8d4" emissive="#ffe870" emissiveIntensity={0.8} roughness={0.15} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Bench                                                      */
/* ═══════════════════════════════════════════════════════════ */

function Bench3D({ def }: { def: BenchDef }) {
  return (
    <group position={[def.x, 0, def.z]}>
      {/* Seat planks */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[0.55, 0.035, 0.2]} />
        <meshStandardMaterial color="#c49a60" roughness={0.82} />
      </mesh>
      {/* Seat plank detail */}
      <mesh position={[0, 0.24, 0]} castShadow>
        <boxGeometry args={[0.52, 0.02, 0.18]} />
        <meshStandardMaterial color="#b88c50" roughness={0.85} />
      </mesh>
      {/* Backrest */}
      <mesh position={[0, 0.36, -0.085]} castShadow>
        <boxGeometry args={[0.55, 0.2, 0.035]} />
        <meshStandardMaterial color="#c49a60" roughness={0.82} />
      </mesh>
      {/* Metal legs */}
      {[-0.22, 0.22].map((lx) => (
        <mesh key={lx} position={[lx, 0.11, 0]}>
          <boxGeometry args={[0.035, 0.22, 0.18]} />
          <meshStandardMaterial color="#4a4a52" roughness={0.6} metalness={0.25} />
        </mesh>
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Flower Box                                                 */
/* ═══════════════════════════════════════════════════════════ */

function FlowerBox3D({ def }: { def: FlowerBoxDef }) {
  return (
    <group position={[def.x, 0, def.z]}>
      {/* Planter box */}
      <mesh position={[0, 0.12, 0]} castShadow>
        <boxGeometry args={[0.45, 0.22, 0.22]} />
        <meshStandardMaterial color="#8b6848" roughness={0.88} />
      </mesh>
      {/* Box rim */}
      <mesh position={[0, 0.24, 0]}>
        <boxGeometry args={[0.48, 0.03, 0.25]} />
        <meshStandardMaterial color="#a07858" roughness={0.82} />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[0.42, 0.02, 0.2]} />
        <meshStandardMaterial color="#4a3020" roughness={1} />
      </mesh>
      {/* Flowers — colorful spheres */}
      {[
        { pos: [-0.12, 0.3, 0] as [number, number, number], color: "#ff6b8a" },
        { pos: [0, 0.33, 0.04] as [number, number, number], color: "#ffb347" },
        { pos: [0.12, 0.29, -0.03] as [number, number, number], color: "#a855f7" },
        { pos: [0.06, 0.31, 0.06] as [number, number, number], color: "#ff4080" },
        { pos: [-0.08, 0.28, -0.05] as [number, number, number], color: "#ffc040" },
      ].map((f, i) => (
        <group key={i} position={f.pos}>
          {/* Stem */}
          <mesh position={[0, -0.04, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.06, 3]} />
            <meshStandardMaterial color="#3a8020" roughness={0.9} />
          </mesh>
          {/* Bloom */}
          <mesh>
            <sphereGeometry args={[0.05, 6, 6]} />
            <meshStandardMaterial color={f.color} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Stall — vendor market stall                                */
/* ═══════════════════════════════════════════════════════════ */

function Stall3D({ def, index }: { def: StallDef; index: number }) {
  const isWeaponStall = def.color === "#b91c1c"; // Silahçı unique look
  return (
    <group position={[def.x, 0, def.z]}>
      {/* Table surface — dark wood */}
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 0.08, 0.5]} />
        <meshStandardMaterial color={isWeaponStall ? "#5c3018" : "#7a5838"} roughness={0.85} />
      </mesh>
      {/* Table edge trim */}
      <mesh position={[0, 0.395, 0.25]}>
        <boxGeometry args={[1.4, 0.02, 0.02]} />
        <meshStandardMaterial color="#a08060" roughness={0.8} />
      </mesh>
      {/* Table legs — dark wood */}
      {[-0.55, 0.55].map((lx) =>
        [-0.15, 0.15].map((lz) => (
          <mesh key={`${lx}-${lz}`} position={[lx, 0.17, lz]}>
            <boxGeometry args={[0.06, 0.34, 0.06]} />
            <meshStandardMaterial color="#5c3820" roughness={0.9} />
          </mesh>
        ))
      )}
      {/* Awning — striped fabric (compact, low tilt) */}
      <mesh position={[0, 0.78, -0.15]} rotation={[0.15, 0, 0]} castShadow>
        <boxGeometry args={[1.5, 0.04, 0.6]} />
        <meshStandardMaterial color={def.color} roughness={0.7} />
      </mesh>
      {/* Awning underside — darker */}
      <mesh position={[0, 0.76, -0.14]} rotation={[0.15, 0, 0]}>
        <boxGeometry args={[1.46, 0.02, 0.56]} />
        <meshStandardMaterial color={def.accent} roughness={0.75} />
      </mesh>
      {/* Support poles — dark wood */}
      {[-0.6, 0.6].map((lx) => (
        <mesh key={lx} position={[lx, 0.55, -0.3]}>
          <cylinderGeometry args={[0.022, 0.022, 0.85, 4]} />
          <meshStandardMaterial color="#5c3820" roughness={0.9} />
        </mesh>
      ))}
      {/* Items on table — per-stall themed goods */}
      {isWeaponStall ? (
        // Weapon stall: sword, shield, helmet display
        <>
          {/* Sword on table */}
          <mesh position={[-0.35, 0.42, 0]} rotation={[0, 0, Math.PI / 2]}
            castShadow>
            <boxGeometry args={[0.02, 0.3, 0.008]} />
            <meshStandardMaterial color="#cfd6dd" metalness={0.7} roughness={0.25} />
          </mesh>
          {/* Shield on table */}
          <mesh position={[0, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.015, 16]} />
            <meshStandardMaterial color="#3f6fd0" metalness={0.3} roughness={0.45} />
          </mesh>
          {/* Helmet on table */}
          <mesh position={[0.35, 0.42, 0]}>
            <sphereGeometry args={[0.055, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#8a8a8a" metalness={0.5} roughness={0.4} />
          </mesh>
        </>
      ) : (
        // Default: colorful goods
        [-0.35, 0, 0.35].map((ix, i) => (
          <mesh key={i} position={[ix, 0.42, 0]}>
            <sphereGeometry args={[0.06, 6, 6]} />
            <meshStandardMaterial color={i === 0 ? "#ff6b6b" : i === 1 ? "#4ecdc4" : "#ffe66d"} roughness={0.7} />
          </mesh>
        ))
      )}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Move Target Marker                                         */
/* ═══════════════════════════════════════════════════════════ */

function MoveTarget3D({ target }: { target: { x: number; y: number } | null }) {
  if (!target) return null;
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  useFrame((_, dt) => {
    timeRef.current += dt;
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.35 + Math.sin(timeRef.current * 3) * 0.15;
    }
    if (ringRef.current) {
      const s = 1 + Math.sin(timeRef.current * 2.5) * 0.15;
      ringRef.current.scale.set(s, s, s);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.25 + Math.sin(timeRef.current * 2.5) * 0.1;
    }
  });

  return (
    <group position={[sX(target.x), 0.01, sZ(target.y)]}>
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.22, 20]} />
        <meshBasicMaterial color="#ff6b4a" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[0.28, 0.32, 20]} />
        <meshBasicMaterial color="#ff9060" transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Player Avatar3D                                            */
/* ═══════════════════════════════════════════════════════════ */

/** Normal gameplay: real 3D GLB avatar (skeleton + animations). ?svg=1 restores legacy SVG. */
function PlayerAvatar3D({
  posRef, config, equipped, facingRef,
}: {
  posRef: React.RefObject<{ x: number; y: number }>;
  config: AvatarConfig;
  equipped: string[];
  facingRef: React.RefObject<number>;
}) {
  if (SVG_DEBUG_MODE) {
    return <SvgPlayerAvatar3D posRef={posRef} config={config} equipped={equipped} facingRef={facingRef} />;
  }
  return <GlbAvatar3D posRef={posRef} facingRef={facingRef} equipped={equipped} />;
}

/** Legacy SVG avatar (debug only — ?svg=1). */
function SvgPlayerAvatar3D({
  posRef, config, equipped, facingRef,
}: {
  posRef: React.RefObject<{ x: number; y: number }>;
  config: AvatarConfig;
  equipped: string[];
  facingRef: React.RefObject<number>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const divRef = useRef<HTMLDivElement>(null);
  const smoothPos = useRef({ x: 0, y: 0 });
  const isWalking = useRef(false);

  useFrame((_, dt) => {
    if (!groupRef.current || !posRef.current) return;
    const p = posRef.current;
    // Smooth interpolation toward target position
    const lerpFactor = Math.min(1, 14 * dt);
    smoothPos.current.x += (p.x - smoothPos.current.x) * lerpFactor;
    smoothPos.current.y += (p.y - smoothPos.current.y) * lerpFactor;
    groupRef.current.position.set(
      smoothPos.current.x / S - WORLD_WIDTH / 2,
      0.02,
      -(smoothPos.current.y / S - WORLD_DEPTH / 2),
    );
    const dx = Math.abs(p.x - smoothPos.current.x);
    const dy = Math.abs(p.y - smoothPos.current.y);
    const moving = dx > 0.3 || dy > 0.3;
    if (moving !== isWalking.current && divRef.current) {
      isWalking.current = moving;
      divRef.current.classList.toggle("walking", moving);
    }
    if (divRef.current) {
      divRef.current.style.transform = `scaleX(${(facingRef.current ?? 1) < 0 ? -1 : 1})`;
    }
  });

  return (
    <group ref={groupRef}>
      <Html center distanceFactor={10} style={{ pointerEvents: "none", transform: "translateY(-50%)" }} zIndexRange={[10, 0]}>
        <div
          ref={divRef}
          style={{
            position: "relative",
            width: 70,
            height: 96,
            transform: `scaleX(${(facingRef.current ?? 1) < 0 ? -1 : 1})`,
            transformOrigin: "center bottom",
          }}
        >
          <AvatarPreview width={70} height={96} config={config} equipped={equipped} />
          <EquippedItems equipped={equipped} width={70} height={96} className="absolute inset-0 pointer-events-none" />
        </div>
      </Html>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Bot Avatar3D                                               */
/* ═══════════════════════════════════════════════════════════ */

/** Bot/Vendor avatar that reads its position from a shared ref every frame.
 *  This avoids stale props — the ref is mutated by the game loop and read
 *  directly in useFrame, so positions update without React re-renders. */
function BotAvatar3D({
  index,
  botsDataRef,
}: {
  index: number;
  botsDataRef: React.RefObject<Array<{
    def: { id: string; config: AvatarConfig; equipped: string[] };
    pos: { x: number; y: number };
    facing: number;
    moving: boolean;
  }>>;
}) {
  if (SVG_DEBUG_MODE) {
    return <SvgBotAvatar3D index={index} botsDataRef={botsDataRef} />;
  }
  return <GlbBotAvatar3D index={index} botsDataRef={botsDataRef} />;
}

/** GLB bot/vendor avatar — feeds the shared ref into GlbAvatar3D. */
function GlbBotAvatar3D({
  index,
  botsDataRef,
}: {
  index: number;
  botsDataRef: React.RefObject<Array<{
    def: { id: string; config: AvatarConfig; equipped: string[] };
    pos: { x: number; y: number };
    facing: number;
    moving: boolean;
  }>>;
}) {
  const posRef = useRef({ x: 0, y: 0 });
  const facingRef = useRef(1);
  const initRef = useRef(false);

  useFrame(() => {
    const bot = botsDataRef.current?.[index];
    if (!bot) return;
    if (!initRef.current) {
      initRef.current = true;
      posRef.current = { x: bot.pos.x, y: bot.pos.y };
      facingRef.current = bot.facing || 1;
    }
    posRef.current = bot.pos;
    if (bot.moving) facingRef.current = bot.facing;
  });

  // Read config from ref (only used at mount — bots don't change equipment).
  const bot = botsDataRef.current?.[index];
  const equipped = bot?.def.equipped ?? [];

  return <GlbAvatar3D posRef={posRef} facingRef={facingRef} equipped={equipped} lerpSpeed={12} />;
}

/** Legacy SVG bot avatar (debug only — ?svg=1). */
function SvgBotAvatar3D({
  index,
  botsDataRef,
}: {
  index: number;
  botsDataRef: React.RefObject<Array<{
    def: { id: string; config: AvatarConfig; equipped: string[] };
    pos: { x: number; y: number };
    facing: number;
    moving: boolean;
  }>>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const divRef = useRef<HTMLDivElement>(null);
  // Smooth interpolation state
  const smoothPos = useRef({ x: 0, y: 0 });
  const isWalkingRef = useRef(false);
  const facingRef = useRef(1);

  useFrame((_, dt) => {
    if (!groupRef.current || !botsDataRef.current) return;
    const bot = botsDataRef.current[index];
    if (!bot) return;

    // Read fresh position from ref (updated by game loop)
    const targetX = bot.pos.x;
    const targetY = bot.pos.y;

    // Smooth interpolation — lerp toward target
    const lerpFactor = Math.min(1, 12 * dt);
    smoothPos.current.x += (targetX - smoothPos.current.x) * lerpFactor;
    smoothPos.current.y += (targetY - smoothPos.current.y) * lerpFactor;

    // Set 3D position
    const wx = smoothPos.current.x / S - WORLD_WIDTH / 2;
    const wz = -(smoothPos.current.y / S - WORLD_DEPTH / 2);
    groupRef.current.position.set(wx, 0.02, wz);

    // Walking animation
    const dx = Math.abs(targetX - smoothPos.current.x);
    const dy = Math.abs(targetY - smoothPos.current.y);
    const moving = dx > 0.3 || dy > 0.3;
    if (moving !== isWalkingRef.current && divRef.current) {
      isWalkingRef.current = moving;
      divRef.current.classList.toggle("walking", moving);
    }

    // Facing direction
    if (bot.moving) facingRef.current = bot.facing;
    if (divRef.current) {
      divRef.current.style.transform = `scaleX(${facingRef.current < 0 ? -1 : 1})`;
    }
  });

  // Read initial config from ref (only changes if component remounts)
  const bot = botsDataRef.current?.[index];
  const config = bot?.def.config ?? { skin: "#ffd1a3", hair: "short", hairColor: "#3d2f2a", shirt: "#888", pants: "#444", shoes: "#333" };
  const equipped = bot?.def.equipped ?? [];

  return (
    <group ref={groupRef}>
      <Html center distanceFactor={10} style={{ pointerEvents: "none", transform: "translateY(-50%)" }} zIndexRange={[10, 0]}>
        <div
          ref={divRef}
          style={{
            position: "relative",
            width: 70,
            height: 96,
            transform: "scaleX(1)",
            transformOrigin: "center bottom",
          }}
        >
          <AvatarPreview width={70} height={96} config={config} equipped={equipped} />
          <EquippedItems equipped={equipped} width={70} height={96} className="absolute inset-0 pointer-events-none" />
        </div>
      </Html>
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
  botsRef: React.RefObject<Array<{
    def: { id: string; config: AvatarConfig; equipped: string[] };
    pos: { x: number; y: number };
    facing: number;
    moving: boolean;
  }>>;
  moveTarget: { x: number; y: number } | null;
  isMobile: boolean;
  /** Dev-only: render the Phase 1 GLB avatar test next to spawn. */
  glbTest?: boolean;
}

export function GameEngine3D({
  playerPosRef,
  playerConfig,
  playerEquipped,
  facingRef,
  botsRef,
  moveTarget,
  isMobile,
  glbTest,
}: GameEngine3DProps) {
  const initCamY = Math.sin(CAMERA_ELEVATION) * CAMERA_ZOOM;
  const initCamZ = Math.cos(CAMERA_ELEVATION) * CAMERA_ZOOM;

  // Track bot count to force re-render when vendors are added after mount
  const [botsLen, setBotsLen] = useState(botsRef.current.length);
  React.useEffect(() => {
    // Poll for new bots/vendors being added to the ref
    const iv = setInterval(() => {
      const len = botsRef.current.length;
      if (len !== botsLen) setBotsLen(len);
    }, 200);
    return () => clearInterval(iv);
  }, [botsRef, botsLen]);

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
      onCreated={({ gl }) => {
        // Mobile browsers evict the OLDEST WebGL context when a new one is
        // created (e.g. the profile-card canvas). Without preventDefault the
        // main canvas never restores and shows a large corrupted/blank
        // region covering part of the map. With it, THREE re-initializes
        // automatically on "webglcontextrestored".
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
        });
      }}
    >
      <FollowCamera posRef={playerPosRef} />

      {/* Sky — soft warm blue */}
      <color attach="background" args={["#78c8e8"]} />

      {/* ═══ LIGHTING — warm stylized mobile-game lighting ═══ */}
      <ambientLight intensity={0.6} color="#f0e8d8" />
      <hemisphereLight args={["#c8e0ff", "#509030", 0.4]} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={1.6}
        color="#fff4e0"
        castShadow={!isMobile}
        shadow-mapSize-width={isMobile ? 512 : 1024}
        shadow-mapSize-height={isMobile ? 512 : 1024}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.001}
      />
      {/* Fill light — soft cool from opposite side */}
      <directionalLight position={[-5, 6, -4]} intensity={0.25} color="#b8d8ff" />

      {/* Sun disc */}
      <mesh position={[14, 10, -10]}>
        <sphereGeometry args={[0.4, 12, 12]} />
        <meshBasicMaterial color="#ffe870" />
      </mesh>

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
        <Stall3D key={i} def={def} index={i} />
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

      {/* === BOTS + VENDORS (read from ref every frame) === */}
      {Array.from({ length: botsLen }, (_, i) => (
        <BotAvatar3D key={botsRef.current[i]?.def.id ?? `bot-${i}`} index={i} botsDataRef={botsRef} />
      ))}

      {/* === PHASE 1 GLB AVATAR TEST (dev-only, ?glbtest=1) === */}
      {glbTest && <GlbAvatarTest />}

      {/* === DEBUG OVERLAY (temporary — shows coordinate pipeline state) === */}
    </Canvas>
  );
}

export default GameEngine3D;
