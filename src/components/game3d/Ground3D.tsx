import { memo, useMemo } from "react";
import * as THREE from "three";

/**
 * 3D Ground — Professional city map layout.
 *
 * Layout (1600×900):
 *   ┌──────────┬──────────┐
 *   │  SHOPS   │  PARK    │
 *   │  zone    │  zone    │
 *   ├─── NS ───┤─── NS ───┤  ← North Sidewalk (y=490..560)
 *   │░░░░░░░░░░░░░░░░░░░░│  ← Horizontal Road (y=560..680)
 *   ├─── SS ───┤─── SS ───┤  ← South Sidewalk (y=680..750)
 *   │  HOUSES  │  ARENA   │
 *   │  zone    │  zone    │
 *   └──────────┴──────────┘
 *         ↑              ↑
 *      VW-LS          VW-RS
 *      (x=640)      (x=960)
 *         ↑   PLAZA   ↑
 *         └─ VS ─ VS ─┘  ← Vertical Sidewalk (x=640..960)
 *
 * Vertical Road (EW): x=720..880
 * Central Plaza: circle at (800,620) r=140
 */

// ── Map dimensions ──
const MW = 1600;
const MH = 900;

// ── Road geometry ──
const HR_Y1 = 560;
const HR_Y2 = 680;
const HR_CY = 620;
const HR_H = 120; // height

const VR_X1 = 720;
const VR_X2 = 880;
const VR_CX = 800;
const VR_W = 160; // width

// ── Sidewalk geometry ──
const NS_Y1 = 490; // north sidewalk
const NS_Y2 = 560;
const NS_H = 70;

const SS_Y1 = 680; // south sidewalk
const SS_Y2 = 750;
const SS_H = 70;

const VW_LS_X1 = 640; // vertical walkway left strip
const VW_LS_X2 = 720;
const VW_RS_X1 = 880; // vertical walkway right strip
const VW_RS_X2 = 960;
const VW_H = 60;

// ── Colors ──
export const GROUND_COLORS = {
  // Roads
  road: "#3a3a3c",
  roadEdge: "#2c2c2e",

  // Sidewalks
  sidewalk: "#c8c0b0",
  sidewalkTile: "#bbb4a4",

  // Plaza
  plaza: "#b0a890",
  plazaAccent: "#a09880",
  plazaRing: "#908870",

  // Park
  grass: "#5a9a4a",
  grassLight: "#6aaa58",
  grassDark: "#4a8a3a",

  // Lane markings
  laneWhite: "#e8e4e0",
  laneYellow: "#e8c84a",
  curb: "#7a7570",
};

// ── Building zone foundations ──
const ZONE_COLORS = {
  shops: "#c4b8a4",     // warm stone
  houses: "#c0b4a0",    // neutral stone
  park: "#5a9a4a",      // green grass
  arena: "#b8b0a0",     // light stone
};

// ── Road helper ──
function RoadPlane({
  cx, cz, w, h, color, y = 0.005,
}: {
  cx: number; cz: number; w: number; h: number; color: string; y?: number;
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, y, cz]}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

function SidewalkPlane({
  cx, cz, w, h, color, y = -0.01,
}: {
  cx: number; cz: number; w: number; h: number; color: string; y?: number;
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, y, cz]}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

export const Ground3D = memo(function Ground3D() {
  // ── Lane dashes (horizontal road) ──
  const hDashes = useMemo(() => {
    const d: { x: number; z: number }[] = [];
    for (let i = 0; i < 22; i++) {
      const x = i * 80 - MW / 2 + 40;
      // skip dashes in the vertical road zone
      if (x > -120 && x < 120) continue;
      d.push({ x, z: -HR_CY - 12 }); // upper lane
      d.push({ x, z: -HR_CY + 12 }); // lower lane
    }
    return d;
  }, []);

  // ── Lane dashes (vertical road) ──
  const vDashes = useMemo(() => {
    const d: { z: number; x: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const z = -(200 + i * 70);
      // skip dashes in the horizontal road zone
      if (z > -(HR_Y2 + 20) && z < -(HR_Y1 - 20)) continue;
      d.push({ z, x: -VR_CX + 12 }); // left lane
      d.push({ z, x: -VR_CX + VR_W / 2 + 12 }); // right lane
    }
    return d;
  }, []);

  return (
    <group>
      {/* ════════════════════════════════════════════════════
          ZONE FOUNDATIONS (colored ground under building areas)
          ════════════════════════════════════════════════════ */}

      {/* Top-left: SHOP ZONE (x=0..720, y=0..490) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[360, -0.10, -245]}>
        <planeGeometry args={[720, 490]} />
        <meshStandardMaterial color={ZONE_COLORS.shops} roughness={0.9} />
      </mesh>

      {/* Top-right: PARK ZONE (x=880..1600, y=0..490) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1240, -0.10, -245]}>
        <planeGeometry args={[720, 490]} />
        <meshStandardMaterial color={ZONE_COLORS.park} roughness={0.95} />
      </mesh>

      {/* Bottom-left: HOUSES ZONE (x=0..720, y=750..900) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[360, -0.10, -825]}>
        <planeGeometry args={[720, 150]} />
        <meshStandardMaterial color={ZONE_COLORS.houses} roughness={0.9} />
      </mesh>

      {/* Bottom-right: ARENA ZONE (x=880..1600, y=750..900) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1240, -0.10, -825]}>
        <planeGeometry args={[720, 150]} />
        <meshStandardMaterial color={ZONE_COLORS.arena} roughness={0.9} />
      </mesh>

      {/* Left vertical strip fill (x=0..640, y=490..750) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[320, -0.08, -620]}>
        <planeGeometry args={[640, 260]} />
        <meshStandardMaterial color={ZONE_COLORS.shops} roughness={0.9} />
      </mesh>

      {/* Right vertical strip fill (x=960..1600, y=490..750) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1280, -0.08, -620]}>
        <planeGeometry args={[640, 260]} />
        <meshStandardMaterial color={ZONE_COLORS.park} roughness={0.95} />
      </mesh>

      {/* Bottom vertical strip (x=640..960, y=750..900) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[800, -0.09, -825]}>
        <planeGeometry args={[320, 150]} />
        <meshStandardMaterial color={ZONE_COLORS.houses} roughness={0.9} />
      </mesh>

      {/* Top vertical strip (x=640..960, y=0..490) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[800, -0.09, -245]}>
        <planeGeometry args={[320, 490]} />
        <meshStandardMaterial color={ZONE_COLORS.shops} roughness={0.9} />
      </mesh>

      {/* ════════════════════════════════════════════════════
          SIDEWALKS (stone paver texture)
          ════════════════════════════════════════════════════ */}

      {/* North sidewalk — full width */}
      <SidewalkPlane cx={MW / 2} cz={-(NS_Y1 + NS_H / 2)} w={MW} h={NS_H} color={GROUND_COLORS.sidewalk} />

      {/* South sidewalk — full width */}
      <SidewalkPlane cx={MW / 2} cz={-(SS_Y1 + SS_H / 2)} w={MW} h={SS_H} color={GROUND_COLORS.sidewalk} />

      {/* Left vertical sidewalk strip */}
      <SidewalkPlane cx={-(VW_LS_X1 + VW_H / 2)} cz={-HR_CY} w={VW_H} h={HR_H} color={GROUND_COLORS.sidewalk} />

      {/* Right vertical sidewalk strip */}
      <SidewalkPlane cx={-(VW_RS_X1 + VW_H / 2)} cz={-HR_CY} w={VW_H} h={HR_H} color={GROUND_COLORS.sidewalk} />

      {/* North sidewalk vertical extensions (flanking vertical road) */}
      <SidewalkPlane cx={-(VW_LS_X1 + VW_H / 2)} cz={-(NS_Y1 + NS_H / 2)} w={VW_H} h={NS_H} color={GROUND_COLORS.sidewalk} />
      <SidewalkPlane cx={-(VW_RS_X1 + VW_H / 2)} cz={-(NS_Y1 + NS_H / 2)} w={VW_H} h={NS_H} color={GROUND_COLORS.sidewalk} />

      {/* South sidewalk vertical extensions */}
      <SidewalkPlane cx={-(VW_LS_X1 + VW_H / 2)} cz={-(SS_Y1 + SS_H / 2)} w={VW_H} h={SS_H} color={GROUND_COLORS.sidewalk} />
      <SidewalkPlane cx={-(VW_RS_X1 + VW_H / 2)} cz={-(SS_Y1 + SS_H / 2)} w={VW_H} h={SS_H} color={GROUND_COLORS.sidewalk} />

      {/* Sidewalk tile lines — horizontal */}
      {[-1, 0, 1].map((offset) => (
        <mesh key={`ns-tile-${offset}`} rotation={[-Math.PI / 2, 0, 0]} position={[MW / 2, 0.001, -(NS_Y1 + 23 + offset * 23)]}>
          <planeGeometry args={[MW, 0.8]} />
          <meshStandardMaterial color={GROUND_COLORS.sidewalkTile} transparent opacity={0.35} />
        </mesh>
      ))}
      {[-1, 0, 1].map((offset) => (
        <mesh key={`ss-tile-${offset}`} rotation={[-Math.PI / 2, 0, 0]} position={[MW / 2, 0.001, -(SS_Y1 + 23 + offset * 23)]}>
          <planeGeometry args={[MW, 0.8]} />
          <meshStandardMaterial color={GROUND_COLORS.sidewalkTile} transparent opacity={0.35} />
        </mesh>
      ))}

      {/* ════════════════════════════════════════════════════
          HORIZONTAL ROAD (y=560..680)
          ════════════════════════════════════════════════════ */}

      {/* Left section: x=0..640 */}
      <RoadPlane cx={320} cz={-HR_CY} w={640} h={HR_H} color={GROUND_COLORS.road} />
      {/* Center: x=640..960 (covered by vertical road, skip) */}
      {/* Right section: x=960..1600 */}
      <RoadPlane cx={1280} cz={-HR_CY} w={640} h={HR_H} color={GROUND_COLORS.road} />

      {/* Curbs */}
      <mesh position={[MW / 2, 0.02, -HR_Y1 + 2]}>
        <boxGeometry args={[MW, 0.06, 4]} />
        <meshStandardMaterial color={GROUND_COLORS.curb} />
      </mesh>
      <mesh position={[MW / 2, 0.02, -HR_Y2 - 2]}>
        <boxGeometry args={[MW, 0.06, 4]} />
        <meshStandardMaterial color={GROUND_COLORS.curb} />
      </mesh>

      {/* Edge white lines */}
      <RoadPlane cx={MW / 2} cz={-(HR_Y1 + 5)} w={MW} h={3} color={GROUND_COLORS.laneWhite} y={0.02} />
      <RoadPlane cx={MW / 2} cz={-(HR_Y2 - 5)} w={MW} h={3} color={GROUND_COLORS.laneWhite} y={0.02} />

      {/* Center yellow double line */}
      <RoadPlane cx={MW / 2} cz={-(HR_CY - 1.5)} w={MW} h={2} color={GROUND_COLORS.laneYellow} y={0.02} />
      <RoadPlane cx={MW / 2} cz={-(HR_CY + 1.5)} w={MW} h={2} color={GROUND_COLORS.laneYellow} y={0.02} />

      {/* Dashed white lines */}
      {hDashes.map((d, i) => (
        <mesh key={`hd-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[d.x, 0.02, d.z]}>
          <planeGeometry args={[45, 2.5]} />
          <meshStandardMaterial color={GROUND_COLORS.laneWhite} transparent opacity={0.8} />
        </mesh>
      ))}

      {/* ════════════════════════════════════════════════════
          VERTICAL ROAD (x=720..880)
          ════════════════════════════════════════════════════ */}

      {/* Top section: y=0..490 */}
      <RoadPlane cx={-VR_CX} cz={-(490 / 2)} w={VR_W} h={490} color={GROUND_COLORS.road} />
      {/* Bottom section: y=750..900 */}
      <RoadPlane cx={-VR_CX} cz={-(750 + 75)} w={VR_W} h={150} color={GROUND_COLORS.road} />

      {/* Curbs */}
      <mesh position={[-VR_X1 + 2, 0.02, -MH / 2]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[MH, 0.06, 4]} />
        <meshStandardMaterial color={GROUND_COLORS.curb} />
      </mesh>
      <mesh position={[-VR_X2 - 2, 0.02, -MH / 2]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[MH, 0.06, 4]} />
        <meshStandardMaterial color={GROUND_COLORS.curb} />
      </mesh>

      {/* Edge white lines (vertical) */}
      <RoadPlane cx={-(VR_X1 + 5)} cz={-MH / 2} w={3} h={MH} color={GROUND_COLORS.laneWhite} y={0.02} />
      <RoadPlane cx={-(VR_X2 - 5)} cz={-MH / 2} w={3} h={MH} color={GROUND_COLORS.laneWhite} y={0.02} />

      {/* Center yellow double line (vertical) */}
      <RoadPlane cx={-(VR_CX - 1.5)} cz={-MH / 2} w={2} h={MH} color={GROUND_COLORS.laneYellow} y={0.02} />
      <RoadPlane cx={-(VR_CX + 1.5)} cz={-MH / 2} w={2} h={MH} color={GROUND_COLORS.laneYellow} y={0.02} />

      {/* Dashed white lines (vertical) */}
      {vDashes.map((d, i) => (
        <mesh key={`vd-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[d.x, 0.02, d.z]}>
          <planeGeometry args={[2.5, 45]} />
          <meshStandardMaterial color={GROUND_COLORS.laneWhite} transparent opacity={0.8} />
        </mesh>
      ))}

      {/* ════════════════════════════════════════════════════
          CENTRAL PLAZA (circle at intersection)
          ════════════════════════════════════════════════════ */}

      {/* Plaza base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-VR_CX, 0.015, -HR_CY]}>
        <circleGeometry args={[140, 32]} />
        <meshStandardMaterial color={GROUND_COLORS.plaza} roughness={0.8} />
      </mesh>

      {/* Inner accent ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-VR_CX, 0.018, -HR_CY]}>
        <ringGeometry args={[90, 100, 32]} />
        <meshStandardMaterial color={GROUND_COLORS.plazaAccent} roughness={0.8} />
      </mesh>

      {/* Outer decorative ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-VR_CX, 0.016, -HR_CY]}>
        <ringGeometry args={[130, 140, 32]} />
        <meshStandardMaterial color={GROUND_COLORS.plazaRing} roughness={0.85} />
      </mesh>

      {/* Plaza paver pattern — radiating lines */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <mesh
            key={`paver-${i}`}
            rotation={[-Math.PI / 2, 0, angle]}
            position={[-VR_CX, 0.02, -HR_CY]}
          >
            <planeGeometry args={[2, 130]} />
            <meshStandardMaterial color={GROUND_COLORS.plazaRing} transparent opacity={0.3} />
          </mesh>
        );
      })}

      {/* ════════════════════════════════════════════════════
          PARK AREA (top-right: x=880..1600, y=0..490)
          ════════════════════════════════════════════════════ */}

      {/* Park grass ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1240, -0.05, -245]}>
        <planeGeometry args={[640, 450]} />
        <meshStandardMaterial color={GROUND_COLORS.grass} roughness={0.95} />
      </mesh>

      {/* Grass light patches */}
      {[
        { x: 1100, z: -200, r: 60 },
        { x: 1350, z: -300, r: 50 },
        { x: 1200, z: -400, r: 45 },
      ].map((p, i) => (
        <mesh key={`gp-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[p.x, -0.04, p.z]}>
          <circleGeometry args={[p.r, 12]} />
          <meshStandardMaterial color={GROUND_COLORS.grassLight} transparent opacity={0.4} />
        </mesh>
      ))}

      {/* ════════════════════════════════════════════════════
          MAP BORDER (natural edges)
          ════════════════════════════════════════════════════ */}

      {/* Bottom grass strip */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[MW / 2, -0.03, -880]}>
        <planeGeometry args={[MW, 40]} />
        <meshStandardMaterial color={GROUND_COLORS.grassDark} roughness={0.95} />
      </mesh>

      {/* Wild flowers along bottom */}
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
