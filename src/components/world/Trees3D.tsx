import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Realistic 3D tree using @react-three/fiber.
 * Trunk + branches as cylinders, leaf clusters as soft icosahedrons.
 * Wind animation via useFrame.
 */

interface TreeProps {
  position: [number, number, number];
  scale?: number;
  variant?: number;
  windOffset?: number;
}

/* ─── TRUNK + BRANCHES ─── */

function TreeTrunk({
  height,
  radiusBottom,
  radiusTop,
  color,
  darkColor,
}: {
  height: number;
  radiusBottom: number;
  radiusTop: number;
  color: string;
  darkColor: string;
}) {
  return (
    <group>
      {/* Main trunk */}
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[radiusTop, radiusBottom, height, 8]} />
        {/* grows upward = negative Y in SVG coords */}
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      {/* Shadow stripe on trunk */}
      <mesh position={[0.02, height / 2, 0.03]}>
        <cylinderGeometry
          args={[radiusTop * 0.6, radiusBottom * 0.7, height * 0.9, 6]}
        />
        <meshStandardMaterial color={darkColor} flatShading transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

function TreeBranch({
  start,
  end,
  radius,
  color,
}: {
  start: [number, number, number];
  end: [number, number, number];
  radius: number;
  color: string;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const s = new THREE.Vector3(...start);
    const e = new THREE.Vector3(...end);
    const mid = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5);
    const len = s.distanceTo(e);
    const dir = new THREE.Vector3().subVectors(e, s).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir,
    );
    return { position: [mid.x, mid.y, mid.z] as [number, number, number], quaternion: quat, length: len };
  }, [start, end]);

  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[radius * 0.5, radius, length, 6]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  );
}

/* ─── LEAF CLUSTER ─── */

function LeafCluster({
  position,
  radius,
  color,
}: {
  position: [number, number, number];
  radius: number;
  color: string;
}) {
  return (
    <mesh position={position}>
      <icosahedronGeometry args={[radius, 1]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  );
}

/* ─── FULL 3D TREE ─── */

const PALETTES = [
  {
    trunk: "#b87a3d",
    trunkDark: "#8a5a28",
    leaves: ["#2d9a3a", "#3aad48", "#44b852", "#5ed06a", "#80e878"],
    clusters: [
      { pos: [0, 1.6, 0] as [number, number, number], r: 0.7 },
      { pos: [-0.5, 1.4, 0.2] as [number, number, number], r: 0.55 },
      { pos: [0.5, 1.5, -0.2] as [number, number, number], r: 0.5 },
      { pos: [0, 2.0, 0] as [number, number, number], r: 0.6 },
      { pos: [-0.3, 2.2, 0.1] as [number, number, number], r: 0.45 },
      { pos: [0.3, 2.1, -0.1] as [number, number, number], r: 0.42 },
      { pos: [0, 2.5, 0] as [number, number, number], r: 0.38 },
      { pos: [0.6, 1.3, 0.3] as [number, number, number], r: 0.4 },
      { pos: [-0.6, 1.7, -0.2] as [number, number, number], r: 0.45 },
    ],
  },
  {
    trunk: "#a06830",
    trunkDark: "#784e20",
    leaves: ["#1a8a6a", "#22a07a", "#28a880", "#38c090", "#50d8a0"],
    clusters: [
      { pos: [0, 1.5, 0] as [number, number, number], r: 0.65 },
      { pos: [-0.4, 1.3, 0.15] as [number, number, number], r: 0.52 },
      { pos: [0.5, 1.4, -0.15] as [number, number, number], r: 0.48 },
      { pos: [0, 1.9, 0] as [number, number, number], r: 0.55 },
      { pos: [-0.2, 2.1, 0.1] as [number, number, number], r: 0.43 },
      { pos: [0.4, 2.0, -0.1] as [number, number, number], r: 0.4 },
      { pos: [0, 2.4, 0] as [number, number, number], r: 0.35 },
      { pos: [0.55, 1.2, 0.25] as [number, number, number], r: 0.38 },
      { pos: [-0.55, 1.6, -0.15] as [number, number, number], r: 0.42 },
    ],
  },
  {
    trunk: "#b07038",
    trunkDark: "#885528",
    leaves: ["#4a9a30", "#55a838", "#5cb840", "#6cc850", "#88e068"],
    clusters: [
      { pos: [0, 1.55, 0] as [number, number, number], r: 0.68 },
      { pos: [-0.45, 1.35, 0.18] as [number, number, number], r: 0.54 },
      { pos: [0.48, 1.45, -0.18] as [number, number, number], r: 0.51 },
      { pos: [0, 1.95, 0] as [number, number, number], r: 0.58 },
      { pos: [-0.25, 2.15, 0.12] as [number, number, number], r: 0.44 },
      { pos: [0.35, 2.05, -0.12] as [number, number, number], r: 0.41 },
      { pos: [0, 2.45, 0] as [number, number, number], r: 0.37 },
      { pos: [0.58, 1.25, 0.28] as [number, number, number], r: 0.39 },
      { pos: [-0.58, 1.65, -0.18] as [number, number, number], r: 0.43 },
    ],
  },
];

export function Tree3D({
  position,
  scale = 1,
  variant = 0,
  windOffset = 0,
}: TreeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leafGroupRef = useRef<THREE.Group>(null);
  const p = PALETTES[variant % PALETTES.length];

  // Wind sway animation
  useFrame((state) => {
    if (!leafGroupRef.current) return;
    const t = state.clock.elapsedTime;
    // Multi-frequency wind for organic feel
    const sway =
      Math.sin(t * 1.2 + windOffset) * 0.03 +
      Math.sin(t * 2.7 + windOffset * 1.5) * 0.015 +
      Math.sin(t * 0.5 + windOffset * 0.7) * 0.02;
    leafGroupRef.current.rotation.z = sway;
    leafGroupRef.current.rotation.x = Math.sin(t * 0.8 + windOffset) * 0.012;
  });

  const trunkH = 1.8;
  const rootSpread = 0.35;

  return (
    <group ref={groupRef} position={position} scale={[scale, scale, scale]}>
      {/* ── Ground shadow ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.8, 12]} />
        <meshStandardMaterial
          color="#000000"
          transparent
          opacity={0.15}
          depthWrite={false}
        />
      </mesh>

      {/* ── Roots ── */}
      <TreeBranch
        start={[0, 0.05, 0]}
        end={[-rootSpread, 0.02, rootSpread * 0.8]}
        radius={0.06}
        color={p.trunk}
      />
      <TreeBranch
        start={[0, 0.05, 0]}
        end={[rootSpread, 0.02, -rootSpread * 0.7]}
        radius={0.06}
        color={p.trunk}
      />
      <TreeBranch
        start={[0, 0.05, 0]}
        end={[-rootSpread * 0.8, 0.02, -rootSpread]}
        radius={0.05}
        color={p.trunk}
      />
      <TreeBranch
        start={[0, 0.05, 0]}
        end={[rootSpread * 0.7, 0.02, rootSpread]}
        radius={0.05}
        color={p.trunk}
      />

      {/* ── Main trunk ── */}
      <TreeTrunk
        height={trunkH}
        radiusBottom={0.12}
        radiusTop={0.06}
        color={p.trunk}
        darkColor={p.trunkDark}
      />

      {/* ── Left branch ── */}
      <TreeBranch
        start={[0, trunkH * 0.6, 0]}
        end={[-0.55, trunkH * 0.8, 0.15]}
        radius={0.04}
        color={p.trunk}
      />

      {/* ── Right branch ── */}
      <TreeBranch
        start={[0, trunkH * 0.65, 0]}
        end={[0.6, trunkH * 0.85, -0.1]}
        radius={0.035}
        color={p.trunk}
      />

      {/* ── Leaf clusters (with wind sway) ── */}
      <group ref={leafGroupRef}>
        {p.clusters.map((cl, i) => (
          <LeafCluster
            key={i}
            position={cl.pos}
            radius={cl.r}
            color={p.leaves[i % p.leaves.length]}
          />
        ))}
      </group>
    </group>
  );
}
