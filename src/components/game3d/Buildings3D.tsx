import { memo, useMemo } from "react";
import * as THREE from "three";

/**
 * 3D Buildings — low-poly isometric style.
 * Each building has a front face, side face, and roof.
 * Positioned at SVG coordinates mapped to 3D space.
 */

interface BuildingDef {
  svgX: number;
  svgY: number; // bottom of building in SVG
  w: number; // width in SVG units
  h: number; // height in SVG units
  depth: number; // 3D depth
  frontColor: string;
  sideColor: string;
  roofColor: string;
  winColor?: string;
  floors?: number;
  hasShop?: boolean;
}

const BUILDINGS: BuildingDef[] = [
  // Café
  { svgX: 0, svgY: 470, w: 300, h: 180, depth: 60, frontColor: "#e8a87c", sideColor: "#c87848", roofColor: "#505058", winColor: "#6ab0d6", floors: 2, hasShop: true },
  // Tall white skyscraper
  { svgX: 305, svgY: 470, w: 120, h: 340, depth: 50, frontColor: "#e8ecf0", sideColor: "#c0c4cc", roofColor: "#484850", winColor: "#5898c8", floors: 8 },
  // Medium orange apartment
  { svgX: 430, svgY: 470, w: 130, h: 230, depth: 55, frontColor: "#d49060", sideColor: "#b06838", roofColor: "#505058", winColor: "#6ab0d6", floors: 5 },
  // Bakery
  { svgX: 565, svgY: 470, w: 260, h: 160, depth: 55, frontColor: "#f0d8b8", sideColor: "#d4b088", roofColor: "#505058", winColor: "#6ab0d6", floors: 2, hasShop: true },
  // Narrow tower
  { svgX: 830, svgY: 470, w: 100, h: 290, depth: 45, frontColor: "#e0e4ec", sideColor: "#b8bcc8", roofColor: "#484850", winColor: "#5898c8", floors: 7 },
  // Toy store
  { svgX: 935, svgY: 470, w: 260, h: 170, depth: 55, frontColor: "#e0a070", sideColor: "#c07848", roofColor: "#505058", winColor: "#6ab0d6", floors: 2, hasShop: true },
  // Medium white
  { svgX: 1200, svgY: 470, w: 120, h: 240, depth: 48, frontColor: "#e4e8f0", sideColor: "#bcc0cc", roofColor: "#484850", winColor: "#5898c8", floors: 6 },
  // Fashion store
  { svgX: 1325, svgY: 470, w: 275, h: 190, depth: 55, frontColor: "#e8b088", sideColor: "#c88858", roofColor: "#505058", winColor: "#6ab0d6", floors: 2, hasShop: true },
];

// Background buildings (depth layer)
const BG_BUILDINGS = [
  { x: -10, w: 80, h: 160 }, { x: 90, w: 60, h: 210 }, { x: 230, w: 50, h: 130 },
  { x: 340, w: 70, h: 180 }, { x: 470, w: 55, h: 240 }, { x: 570, w: 65, h: 150 },
  { x: 690, w: 50, h: 200 }, { x: 790, w: 60, h: 170 }, { x: 900, w: 55, h: 220 },
  { x: 1010, w: 65, h: 140 }, { x: 1120, w: 50, h: 250 }, { x: 1230, w: 60, h: 180 },
  { x: 1350, w: 55, h: 200 }, { x: 1460, w: 70, h: 160 }, { x: 1540, w: 80, h: 190 },
];

const SCALE = 1; // SVG units = Three.js units

function Building3D({ def }: { def: BuildingDef }) {
  const { svgX, svgY, w, h, depth, frontColor, sideColor, roofColor, winColor, floors = 2, hasShop } = def;

  // Map: SVG x → Three.js x (centered), SVG y → Three.js z (flipped)
  const cx = svgX + w / 2;
  const baseZ = -svgY; // bottom of building

  const windows = useMemo(() => {
    if (!winColor) return null;
    const result: { x: number; y: number; z: number }[] = [];
    const storyH = h / floors;
    const winsPerFloor = Math.floor(w / 50);
    const winSpacing = w / (winsPerFloor + 1);
    for (let f = 0; f < (hasShop ? floors - 1 : floors); f++) {
      for (let wi = 0; wi < winsPerFloor; wi++) {
        result.push({
          x: svgX + winSpacing * (wi + 1),
          y: storyH * 0.4 + f * storyH,
          z: baseZ,
        });
      }
    }
    return result;
  }, [svgX, w, h, floors, winColor, hasShop, baseZ]);

  return (
    <group>
      {/* Front face */}
      <mesh position={[cx, h / 2, baseZ]}>
        <boxGeometry args={[w, h, 2]} />
        <meshStandardMaterial color={frontColor} flatShading />
      </mesh>

      {/* Side face */}
      <mesh position={[svgX + w + depth / 2, h / 2, baseZ - depth / 2]}>
        <boxGeometry args={[depth, h, 2]} />
        <meshStandardMaterial color={sideColor} flatShading />
      </mesh>

      {/* Roof */}
      <mesh position={[cx + depth / 4, h + 1, baseZ - depth / 4]}>
        <boxGeometry args={[w + 4, 3, depth + 4]} />
        <meshStandardMaterial color={roofColor} flatShading />
      </mesh>

      {/* Windows */}
      {windows?.map((win, i) => (
        <mesh key={i} position={[win.x, win.y + h * 0.05, win.z - 1.5]}>
          <boxGeometry args={[Math.min(28, w / 5), Math.min(30, h / floors - 20), 1]} />
          <meshStandardMaterial color={winColor!} />
        </mesh>
      ))}

      {/* Shop front */}
      {hasShop && (
        <mesh position={[cx, 35, baseZ - 1.5]}>
          <boxGeometry args={[w - 20, 60, 1]} />
          <meshStandardMaterial color="#2a3a4a" />
        </mesh>
      )}
    </group>
  );
}

function BackgroundBuilding3D({ b, index }: { b: typeof BG_BUILDINGS[0]; index: number }) {
  const cx = b.x + b.w / 2;
  const baseZ = -470 - 40 - index * 8; // behind foreground buildings

  return (
    <mesh position={[cx, b.h / 2, baseZ]}>
      <boxGeometry args={[b.w, b.h, 30]} />
      <meshStandardMaterial
        color={["#b0b8c4", "#a8b0bc", "#bcc4d0", "#a0a8b4", "#b4bcc8"][index % 5]}
        flatShading
        transparent
        opacity={0.5}
      />
    </mesh>
  );
}

export const Buildings3D = memo(function Buildings3D() {
  return (
    <group>
      {/* Background depth layer */}
      {BG_BUILDINGS.map((b, i) => (
        <BackgroundBuilding3D key={i} b={b} index={i} />
      ))}

      {/* Foreground buildings */}
      {BUILDINGS.map((b, i) => (
        <Building3D key={i} def={b} />
      ))}
    </group>
  );
});
