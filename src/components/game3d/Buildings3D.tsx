import { memo, useMemo } from "react";
import * as THREE from "three";

/**
 * 3D Buildings — organized city layout.
 *
 * Layout:
 *   ┌────────────┬──────────┐
 *   │   SHOPS    │   PARK   │
 *   │  x=30..680 │  trees   │
 *   ├────────────┼──────────┤
 *   │  HOUSES    │  ARENA   │
 *   │  x=30..680 │x=920..  │
 *   └────────────┴──────────┘
 *
 * Buildings face the roads. Consistent scale.
 * Player height ≈ 48 units. Buildings = 2-6× player.
 */

// ── Building Definition ──
interface BDef {
  x: number;   // left edge in SVG x
  y: number;   // bottom edge in SVG y (y=0 is top of world)
  w: number;   // width
  h: number;   // height (depth into world = negative z direction)
  ht: number;  // building height (upward, in units)
  front: string;
  side: string;
  roof: string;
  win?: string;
  floors?: number;
  shop?: boolean; // has a shop front
  label?: string; // sign text
}

// ── SHOP BUILDINGS (top-left quadrant, y=20..460, x=30..690) ──
const SHOPS: BDef[] = [
  // Row 1: along north sidewalk (y=90..460, entrance faces south toward road)
  { x: 30,  y: 100, w: 160, h: 350, ht: 120, front: "#e8a87c", side: "#c87848", roof: "#505058", win: "#6ab0d6", floors: 3, shop: true, label: "🍦" },    // Café
  { x: 210, y: 100, w: 120, h: 350, ht: 200, front: "#e8ecf0", side: "#c0c4cc", roof: "#484850", win: "#5898c8", floors: 5 },                                    // Tall office
  { x: 350, y: 100, w: 150, h: 350, ht: 150, front: "#f0d8b8", side: "#d4b088", roof: "#505058", win: "#6ab0d6", floors: 3, shop: true, label: "🍞" },    // Bakery
  { x: 520, y: 100, w: 160, h: 350, ht: 130, front: "#e8b088", side: "#c88858", roof: "#505058", win: "#6ab0d6", floors: 3, shop: true, label: "🧸" },    // Toy store

  // Row 2: along vertical road left side (x=30..640, y=20..70)
  { x: 30,  y: 20, w: 140, h: 70, ht: 140, front: "#d49060", side: "#b06838", roof: "#505058", win: "#6ab0d6", floors: 4 },                                     // Apartment
  { x: 190, y: 20, w: 130, h: 65, ht: 110, front: "#e0e4ec", side: "#b8bcc8", roof: "#484850", win: "#5898c8", floors: 3 },                                     // Small office
  { x: 340, y: 20, w: 150, h: 70, ht: 160, front: "#e4a0b0", side: "#c87898", roof: "#505058", win: "#6ab0d6", floors: 4 },                                     // Salon
  { x: 510, y: 20, w: 120, h: 65, ht: 100, front: "#f0e8d0", side: "#d8d0b8", roof: "#505058", win: "#6ab0d6", floors: 2, shop: true, label: "☕" },     // Coffee shop
];

// ── HOUSE BUILDINGS (bottom-left, y=770..880, x=30..690) ──
const HOUSES: BDef[] = [
  // Row along south sidewalk
  { x: 30,  y: 770, w: 120, h: 100, ht: 80,  front: "#f0d0a8", side: "#d4b080", roof: "#8a6030", win: "#6ab0d6", floors: 2 },
  { x: 170, y: 770, w: 100, h: 100, ht: 70,  front: "#e8c8a0", side: "#c8a878", roof: "#8a6030", win: "#6ab0d6", floors: 2 },
  { x: 290, y: 770, w: 130, h: 100, ht: 90,  front: "#f8e0c0", side: "#dcc098", roof: "#7a5525", win: "#6ab0d6", floors: 2 },
  { x: 440, y: 770, w: 110, h: 100, ht: 75,  front: "#e0c090", side: "#c4a068", roof: "#8a6030", win: "#6ab0d6", floors: 2 },
  { x: 570, y: 770, w: 120, h: 100, ht: 85,  front: "#f0d8b8", side: "#d4b888", roof: "#7a5525", win: "#6ab0d6", floors: 2 },
];

// ── ARENA (bottom-right, x=920..1560, y=770..880) ──
const ARENA_BUILDINGS: BDef[] = [
  // Arena entrance
  { x: 920, y: 770, w: 200, h: 100, ht: 110, front: "#b04040", side: "#903030", roof: "#3a3a3a", win: "#ffd166", floors: 3, label: "⚔️" },
  // Side buildings
  { x: 1140, y: 770, w: 130, h: 100, ht: 90,  front: "#906040", side: "#704828", roof: "#484850", win: "#6ab0d6", floors: 2 },
  { x: 1290, y: 770, w: 140, h: 100, ht: 80,  front: "#a08060", side: "#806040", roof: "#484850", win: "#6ab0d6", floors: 2 },
  { x: 1450, y: 770, w: 120, h: 100, ht: 95,  front: "#8890a0", side: "#687080", roof: "#484850", win: "#5898c8", floors: 2 },
];

// ── Background buildings (behind main buildings, semi-transparent) ──
const BG_BUILDINGS = [
  // Behind shops (top-left)
  { x: -20,  y: -80,  w: 70, h: 60, ht: 180, c: "#b0b8c4" },
  { x: 80,   y: -90,  w: 55, h: 50, ht: 220, c: "#a8b0bc" },
  { x: 200,  y: -70,  w: 60, h: 55, ht: 160, c: "#bcc4d0" },
  { x: 320,  y: -85,  w: 50, h: 50, ht: 200, c: "#a0a8b4" },
  { x: 440,  y: -75,  w: 65, h: 60, ht: 190, c: "#b4bcc8" },
  { x: 560,  y: -90,  w: 55, h: 50, ht: 170, c: "#b0b8c4" },
  { x: 640,  y: -80,  w: 50, h: 55, ht: 210, c: "#a8b0bc" },
];

interface SingleBuildingProps {
  def: BDef;
}

function Building3D({ def }: SingleBuildingProps) {
  const { x, y, w, h, ht, front, side, roof, win, floors = 2, shop, label } = def;

  // SVG coords → Three.js
  const cx = x + w / 2;
  const baseZ = -y; // bottom of building
  const depthZ = -h; // extends "up" in SVG = negative Z in Three.js

  const windows = useMemo(() => {
    if (!win) return null;
    const result: { x: number; y: number }[] = [];
    const storyH = ht / floors;
    const winsPerFloor = Math.max(1, Math.floor(w / 55));
    const winSpacing = w / (winsPerFloor + 1);
    const startFloor = shop ? 1 : 0;
    for (let f = startFloor; f < floors; f++) {
      for (let wi = 0; wi < winsPerFloor; wi++) {
        result.push({
          x: x + winSpacing * (wi + 1),
          y: storyH * 0.45 + f * storyH,
        });
      }
    }
    return result;
  }, [x, w, ht, floors, win, shop]);

  return (
    <group>
      {/* Front face (faces road) */}
      <mesh position={[cx, ht / 2, baseZ]}>
        <boxGeometry args={[w, ht, 2]} />
        <meshStandardMaterial color={front} flatShading />
      </mesh>

      {/* Side face */}
      <mesh position={[x + w + 10, ht / 2, baseZ + depthZ / 2]}>
        <boxGeometry args={[20, ht, Math.abs(depthZ)]} />
        <meshStandardMaterial color={side} flatShading />
      </mesh>

      {/* Back face */}
      <mesh position={[cx, ht / 2, baseZ + depthZ]}>
        <boxGeometry args={[w, ht, 2]} />
        <meshStandardMaterial color={side} flatShading transparent opacity={0.6} />
      </mesh>

      {/* Roof */}
      <mesh position={[cx, ht + 1.5, baseZ + depthZ / 2]}>
        <boxGeometry args={[w + 4, 3, Math.abs(depthZ) + 4]} />
        <meshStandardMaterial color={roof} flatShading />
      </mesh>

      {/* Windows */}
      {windows?.map((win2, i) => (
        <mesh key={i} position={[win2.x, win2.y + ht * 0.05, baseZ - 1.5]}>
          <boxGeometry args={[Math.min(24, w / 6), Math.min(26, ht / floors - 16), 1]} />
          <meshStandardMaterial color={win!} />
        </mesh>
      ))}

      {/* Shop front (glass door) */}
      {shop && (
        <mesh position={[cx, ht * 0.15, baseZ - 1.5]}>
          <boxGeometry args={[Math.min(50, w * 0.4), ht * 0.25, 1]} />
          <meshStandardMaterial color="#2a3a4a" />
        </mesh>
      )}

      {/* Label sign */}
      {label && (
        <mesh position={[cx, ht * 0.4, baseZ - 2]}>
          <boxGeometry args={[30, 18, 1]} />
          <meshStandardMaterial color="#fff" />
        </mesh>
      )}
    </group>
  );
}

function BackgroundBuilding3D({
  b, index,
}: {
  b: (typeof BG_BUILDINGS)[0];
  index: number;
}) {
  const cx = b.x + b.w / 2;
  const cz = -(b.y + b.h / 2);

  return (
    <mesh position={[cx, b.ht / 2, cz]}>
      <boxGeometry args={[b.w, b.ht, 25]} />
      <meshStandardMaterial
        color={b.c}
        flatShading
        transparent
        opacity={0.45}
      />
    </mesh>
  );
}

export const Buildings3D = memo(function Buildings3D() {
  return (
    <group>
      {/* Background layer */}
      {BG_BUILDINGS.map((b, i) => (
        <BackgroundBuilding3D key={i} b={b} index={i} />
      ))}

      {/* Shop buildings */}
      {SHOPS.map((b, i) => (
        <Building3D key={`shop-${i}`} def={b} />
      ))}

      {/* House buildings */}
      {HOUSES.map((b, i) => (
        <Building3D key={`house-${i}`} def={b} />
      ))}

      {/* Arena buildings */}
      {ARENA_BUILDINGS.map((b, i) => (
        <Building3D key={`arena-${i}`} def={b} />
      ))}
    </group>
  );
});
