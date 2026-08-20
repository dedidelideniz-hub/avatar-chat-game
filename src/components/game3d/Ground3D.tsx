import { memo, useMemo } from "react";
import * as THREE from "three";

/**
 * 3D Ground plane — roads, sidewalks, grass, lane markings.
 * World coordinates: 1600×900, matching SVG layout.
 * Y-axis in Three.js is UP, so ground is at y=0.
 * SVG X → Three.js X, SVG Y → Three.js Z (with flip).
 */

// World dimensions
const W = 1600;
const H = 900;

// Road: y=560..680 in SVG → z positions
const ROAD_Z = -(560 + 60); // center of road = -620
const ROAD_WIDTH = 120; // 680-560
const ROAD_LENGTH = W;

// Sidewalk top: y=470..560
const SIDEWALK_TOP_Z = -(470 + 45); // -515
const SIDEWALK_TOP_WIDTH = 90;

// Sidewalk bottom: y=680..820
const SIDEWALK_BOTTOM_Z = -(680 + 70); // -750
const SIDEWALK_BOTTOM_WIDTH = 140;

// Grass: y=832..900
const GRASS_Z = -(832 + 34); // -866
const GRASS_WIDTH = 68;

// Building area: y=0..470 (behind top sidewalk)
const BUILDING_Z = -(235); // center

export const GROUND_COLORS = {
  road: "#3a3835",
  sidewalk: "#d0ccc0",
  grass: "#6aaa5a",
  grassDark: "#5a9a4a",
  laneWhite: "#e8e4e0",
  laneYellow: "#e8c84a",
  curb: "#8a8580",
  buildingArea: "#c8b8a8",
};

/** Single ground plane with all sections */
export const Ground3D = memo(function Ground3D() {
  const laneDashes = useMemo(() => {
    const dashes: { x: number; z: number; w: number }[] = [];
    for (let i = 0; i < 20; i++) {
      dashes.push({ x: i * 85 - W / 2, z: ROAD_Z - 14, w: 50 }); // upper lane
      dashes.push({ x: i * 85 - W / 2, z: ROAD_Z + 14, w: 50 }); // lower lane
    }
    return dashes;
  }, []);

  const centerDashes = useMemo(() => {
    const dashes: { x: number }[] = [];
    for (let i = 0; i < 16; i++) {
      dashes.push({ x: -W / 2 + i * 122 - 60 });
    }
    return dashes;
  }, []);

  return (
    <group>
      {/* ── Building area (behind sidewalk) ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, BUILDING_Z]}>
        <planeGeometry args={[W, 470]} />
        <meshStandardMaterial color={GROUND_COLORS.buildingArea} />
      </mesh>

      {/* ── Top sidewalk ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, SIDEWALK_TOP_Z]}>
        <planeGeometry args={[W, SIDEWALK_TOP_WIDTH]} />
        <meshStandardMaterial color={GROUND_COLORS.sidewalk} />
      </mesh>

      {/* Sidewalk tile lines */}
      {[482, 496, 510, 524, 538, 552].map((svgY) => (
        <mesh
          key={svgY}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.001, -svgY]}
        >
          <planeGeometry args={[W, 1.2]} />
          <meshStandardMaterial color="#c0bbb0" transparent opacity={0.4} />
        </mesh>
      ))}

      {/* ── Road ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, ROAD_Z]}>
        <planeGeometry args={[ROAD_LENGTH, ROAD_WIDTH]} />
        <meshStandardMaterial color={GROUND_COLORS.road} roughness={0.9} />
      </mesh>

      {/* Curbs */}
      <mesh position={[0, 0.02, -(560) + 2.5]}>
        <boxGeometry args={[W, 0.06, 5]} />
        <meshStandardMaterial color={GROUND_COLORS.curb} />
      </mesh>
      <mesh position={[0, 0.02, -(680) - 2.5]}>
        <boxGeometry args={[W, 0.06, 5]} />
        <meshStandardMaterial color={GROUND_COLORS.curb} />
      </mesh>

      {/* ── Lane markings ── */}
      {/* Top edge line */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -(567)]}>
        <planeGeometry args={[W, 3]} />
        <meshStandardMaterial color={GROUND_COLORS.laneWhite} />
      </mesh>

      {/* Dashed white lines */}
      {laneDashes.map((d, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[d.x, 0.02, d.z]}
        >
          <planeGeometry args={[d.w, 3]} />
          <meshStandardMaterial color={GROUND_COLORS.laneWhite} transparent opacity={0.85} />
        </mesh>
      ))}

      {/* Center yellow double line */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, ROAD_Z - 1]}>
        <planeGeometry args={[W, 2.5]} />
        <meshStandardMaterial color={GROUND_COLORS.laneYellow} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, ROAD_Z + 1]}>
        <planeGeometry args={[W, 2.5]} />
        <meshStandardMaterial color={GROUND_COLORS.laneYellow} />
      </mesh>

      {/* Bottom edge line */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -(670)]}>
        <planeGeometry args={[W, 3]} />
        <meshStandardMaterial color={GROUND_COLORS.laneWhite} />
      </mesh>

      {/* ── Bottom sidewalk ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, SIDEWALK_BOTTOM_Z]}>
        <planeGeometry args={[W, SIDEWALK_BOTTOM_WIDTH]} />
        <meshStandardMaterial color={GROUND_COLORS.sidewalk} />
      </mesh>

      {/* Bottom sidewalk tile lines */}
      {[700, 740, 780].map((svgY) => (
        <mesh
          key={svgY}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.001, -svgY]}
        >
          <planeGeometry args={[W, 1.2]} />
          <meshStandardMaterial color="#c0bbb0" transparent opacity={0.4} />
        </mesh>
      ))}

      {/* ── Grass ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, GRASS_Z]}>
        <planeGeometry args={[W, GRASS_WIDTH]} />
        <meshStandardMaterial color={GROUND_COLORS.grass} roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, GRASS_Z - 10]}>
        <planeGeometry args={[W, 12]} />
        <meshStandardMaterial color={GROUND_COLORS.grassDark} transparent opacity={0.5} />
      </mesh>

      {/* ── Wildflowers ── */}
      {Array.from({ length: 24 }).map((_, i) => {
        const fx = 30 + i * 66 - W / 2;
        const fz = -(850 + (i % 3) * 8);
        const cols = ["#e74c3c", "#f1c40f", "#9b59b6", "#e91e63", "#00bcd4", "#ff9800"];
        return (
          <mesh key={i} position={[fx, 0.02, fz]}>
            <sphereGeometry args={[3, 6, 6]} />
            <meshStandardMaterial color={cols[i % cols.length]} />
          </mesh>
        );
      })}
    </group>
  );
});
