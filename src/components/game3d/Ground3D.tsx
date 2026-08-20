import { memo, useMemo } from "react";
import * as THREE from "three";

/**
 * 3D Ground — cross-shaped road system with sidewalks and plaza.
 *
 * Coordinate system:
 *   SVG (x, y) → Three.js (x, 0, -y)
 *   All ground planes at y=0 (ground level), extending in XZ plane.
 *
 * Road layout:
 *   Horizontal: y=560..680 (SVG) → z=-680..-560
 *   Vertical:   x=720..880
 *   Plaza:      center (800, 620) → (800, 0, -620)
 */

const MW = 1600;
const MH = 900;

// Road Y range in SVG
const HR_Y1 = 560;
const HR_Y2 = 680;
const HR_CY = 620;

// Road X range
const VR_X1 = 720;
const VR_X2 = 880;
const VR_CX = 800;

// Sidewalk Y ranges
const NS_Y1 = 490;
const NS_Y2 = 560;
const SS_Y1 = 680;
const SS_Y2 = 750;

// Colors
const C = {
  road: "#3a3a3c",
  sidewalk: "#c8c0b0",
  sidewalkTile: "#bbb4a4",
  plaza: "#b0a890",
  plazaAccent: "#a09880",
  plazaRing: "#908870",
  grass: "#5a9a4a",
  grassLight: "#6aaa58",
  grassDark: "#4a8a3a",
  laneWhite: "#e8e4e0",
  laneYellow: "#e8c84a",
  curb: "#7a7570",
  shops: "#c4b8a4",
  houses: "#c0b4a0",
  arena: "#b8b0a0",
};

// Helper: ground plane at y=0, extends in XZ
function GroundPlane({
  cx,
  cz,
  w,
  h,
  color,
  y = -0.01,
}: {
  cx: number;
  cz: number;
  w: number;
  h: number;
  color: string;
  y?: number;
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, y, cz]}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

export const Ground3D = memo(function Ground3D() {
  // Lane dashes for horizontal road
  const hDashes = useMemo(() => {
    const d: { x: number; z: number }[] = [];
    for (let i = 0; i < 22; i++) {
      const x = i * 80 - MW / 2 + 40;
      if (x > -120 && x < 120) continue;
      d.push({ x, z: -HR_CY - 12 });
      d.push({ x, z: -HR_CY + 12 });
    }
    return d;
  }, []);

  // Lane dashes for vertical road
  const vDashes = useMemo(() => {
    const d: { z: number; x: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const z = -(200 + i * 70);
      if (z > -(HR_Y2 + 20) && z < -(HR_Y1 - 20)) continue;
      d.push({ z, x: -VR_CX + 12 });
      d.push({ z, x: -VR_CX + VR_CX + 12 });
    }
    return d;
  }, []);

  return (
    <group>
      {/* ═══ ZONE FOUNDATIONS ═══ */}

      {/* Top-left: SHOPS zone */}
      <GroundPlane cx={360} cz={-245} w={720} h={490} color={C.shops} y={-0.1} />

      {/* Top-right: PARK zone */}
      <GroundPlane cx={1240} cz={-245} w={720} h={490} color={C.grass} y={-0.1} />

      {/* Bottom-left: HOUSES zone */}
      <GroundPlane cx={360} cz={-825} w={720} h={150} color={C.houses} y={-0.1} />

      {/* Bottom-right: ARENA zone */}
      <GroundPlane cx={1240} cz={-825} w={720} h={150} color={C.arena} y={-0.1} />

      {/* Left strip (shops side) */}
      <GroundPlane cx={320} cz={-620} w={640} h={260} color={C.shops} y={-0.08} />

      {/* Right strip (park side) */}
      <GroundPlane cx={1280} cz={-620} w={640} h={260} color={C.grass} y={-0.08} />

      {/* Bottom vertical strip */}
      <GroundPlane cx={800} cz={-825} w={320} h={150} color={C.houses} y={-0.09} />

      {/* Top vertical strip */}
      <GroundPlane cx={800} cz={-245} w={320} h={490} color={C.shops} y={-0.09} />

      {/* ═══ SIDEWALKS ═══ */}

      {/* North sidewalk */}
      <GroundPlane cx={MW / 2} cz={-(NS_Y1 + 35)} w={MW} h={70} color={C.sidewalk} />

      {/* South sidewalk */}
      <GroundPlane cx={MW / 2} cz={-(SS_Y1 + 35)} w={MW} h={70} color={C.sidewalk} />

      {/* Left vertical sidewalk */}
      <GroundPlane cx={-680} cz={-HR_CY} w={80} h={HR_Y2 - HR_Y1} color={C.sidewalk} />

      {/* Right vertical sidewalk */}
      <GroundPlane cx={-920} cz={-HR_CY} w={80} h={HR_Y2 - HR_Y1} color={C.sidewalk} />

      {/* Sidewalk tile lines */}
      {[510, 530, 550].map((svgY) => (
        <mesh key={`ns-${svgY}`} rotation={[-Math.PI / 2, 0, 0]} position={[MW / 2, 0.001, -svgY]}>
          <planeGeometry args={[MW, 0.8]} />
          <meshStandardMaterial color={C.sidewalkTile} transparent opacity={0.35} />
        </mesh>
      ))}
      {[700, 720, 740].map((svgY) => (
        <mesh key={`ss-${svgY}`} rotation={[-Math.PI / 2, 0, 0]} position={[MW / 2, 0.001, -svgY]}>
          <planeGeometry args={[MW, 0.8]} />
          <meshStandardMaterial color={C.sidewalkTile} transparent opacity={0.35} />
        </mesh>
      ))}

      {/* ═══ HORIZONTAL ROAD ═══ */}

      {/* Left section */}
      <GroundPlane cx={320} cz={-HR_CY} w={640} h={HR_Y2 - HR_Y1} color={C.road} y={0.005} />

      {/* Right section */}
      <GroundPlane cx={1280} cz={-HR_CY} w={640} h={HR_Y2 - HR_Y1} color={C.road} y={0.005} />

      {/* Curbs */}
      <mesh position={[MW / 2, 0.02, -HR_Y1 + 2]}>
        <boxGeometry args={[MW, 0.06, 4]} />
        <meshStandardMaterial color={C.curb} />
      </mesh>
      <mesh position={[MW / 2, 0.02, -HR_Y2 - 2]}>
        <boxGeometry args={[MW, 0.06, 4]} />
        <meshStandardMaterial color={C.curb} />
      </mesh>

      {/* Edge lines */}
      <GroundPlane cx={MW / 2} cz={-(HR_Y1 + 5)} w={MW} h={3} color={C.laneWhite} y={0.02} />
      <GroundPlane cx={MW / 2} cz={-(HR_Y2 - 5)} w={MW} h={3} color={C.laneWhite} y={0.02} />

      {/* Center yellow lines */}
      <GroundPlane cx={MW / 2} cz={-(HR_CY - 1.5)} w={MW} h={2} color={C.laneYellow} y={0.02} />
      <GroundPlane cx={MW / 2} cz={-(HR_CY + 1.5)} w={MW} h={2} color={C.laneYellow} y={0.02} />

      {/* Dashed lines */}
      {hDashes.map((d, i) => (
        <mesh key={`hd-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[d.x, 0.02, d.z]}>
          <planeGeometry args={[45, 2.5]} />
          <meshStandardMaterial color={C.laneWhite} transparent opacity={0.8} />
        </mesh>
      ))}

      {/* ═══ VERTICAL ROAD ═══ */}

      {/* Top section */}
      <GroundPlane cx={-VR_CX} cz={-245} w={VR_X2 - VR_X1} h={490} color={C.road} y={0.005} />

      {/* Bottom section */}
      <GroundPlane cx={-VR_CX} cz={-825} w={VR_X2 - VR_X1} h={150} color={C.road} y={0.005} />

      {/* Curbs */}
      <mesh position={[-VR_X1 + 2, 0.02, -MH / 2]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[MH, 0.06, 4]} />
        <meshStandardMaterial color={C.curb} />
      </mesh>
      <mesh position={[-VR_X2 - 2, 0.02, -MH / 2]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[MH, 0.06, 4]} />
        <meshStandardMaterial color={C.curb} />
      </mesh>

      {/* Edge lines (vertical) */}
      <GroundPlane cx={-(VR_X1 + 5)} cz={-MH / 2} w={3} h={MH} color={C.laneWhite} y={0.02} />
      <GroundPlane cx={-(VR_X2 - 5)} cz={-MH / 2} w={3} h={MH} color={C.laneWhite} y={0.02} />

      {/* Center yellow lines (vertical) */}
      <GroundPlane cx={-(VR_CX - 1.5)} cz={-MH / 2} w={2} h={MH} color={C.laneYellow} y={0.02} />
      <GroundPlane cx={-(VR_CX + 1.5)} cz={-MH / 2} w={2} h={MH} color={C.laneYellow} y={0.02} />

      {/* Dashed lines (vertical) */}
      {vDashes.map((d, i) => (
        <mesh key={`vd-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[d.x, 0.02, d.z]}>
          <planeGeometry args={[2.5, 45]} />
          <meshStandardMaterial color={C.laneWhite} transparent opacity={0.8} />
        </mesh>
      ))}

      {/* ═══ CENTRAL PLAZA ═══ */}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-VR_CX, 0.015, -HR_CY]}>
        <circleGeometry args={[140, 32]} />
        <meshStandardMaterial color={C.plaza} roughness={0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-VR_CX, 0.018, -HR_CY]}>
        <ringGeometry args={[90, 100, 32]} />
        <meshStandardMaterial color={C.plazaAccent} roughness={0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-VR_CX, 0.016, -HR_CY]}>
        <ringGeometry args={[130, 140, 32]} />
        <meshStandardMaterial color={C.plazaRing} roughness={0.85} />
      </mesh>

      {/* Plaza paver pattern */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <mesh key={`paver-${i}`} rotation={[-Math.PI / 2, 0, angle]} position={[-VR_CX, 0.02, -HR_CY]}>
            <planeGeometry args={[2, 130]} />
            <meshStandardMaterial color={C.plazaRing} transparent opacity={0.3} />
          </mesh>
        );
      })}

      {/* ═══ PARK GRASS ═══ */}

      <GroundPlane cx={1240} cz={-245} w={640} h={450} color={C.grassLight} y={-0.05} />

      {/* Grass patches */}
      {[
        { x: 1100, z: -200, r: 60 },
        { x: 1350, z: -300, r: 50 },
        { x: 1200, z: -400, r: 45 },
      ].map((p, i) => (
        <mesh key={`gp-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[p.x, -0.04, p.z]}>
          <circleGeometry args={[p.r, 12]} />
          <meshStandardMaterial color={C.grass} transparent opacity={0.4} />
        </mesh>
      ))}

      {/* ═══ MAP BORDER ═══ */}

      <GroundPlane cx={MW / 2} cz={-880} w={MW} h={40} color={C.grassDark} y={-0.03} />

      {/* Wildflowers */}
      {Array.from({ length: 16 }).map((_, i) => {
        const fx = 50 + i * 100;
        const cols = ["#e74c3c", "#f1c40f", "#9b59b6", "#e91e63", "#00bcd4", "#ff9800"];
        return (
          <mesh key={`flower-${i}`} position={[fx, 0.02, -885 + (i % 3) * 5]}>
            <sphereGeometry args={[2.5, 6, 6]} />
            <meshStandardMaterial color={cols[i % cols.length]} />
          </mesh>
        );
      })}
    </group>
  );
});
