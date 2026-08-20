import { Canvas } from "@react-three/fiber";
import { Tree3D } from "./Trees3D";

/**
 * 3D tree layer — renders on top of SVG (pointer-events: none) game world.
 * The Canvas captures no pointer events so clicks pass through to the SVG/main.
 *
 * Tree positions match SVG coordinates mapped to 3D space:
 *   SVG (x, y) → 3D (x * SCALE - 800, 0, (y - 620) * SCALE)
 *   where SCALE converts 1600×900 world units → Three.js units.
 */

const SCALE = 0.005; // 1600 SVG units → ~19.2 Three.js units

// Map SVG coordinates to 3D world positions
const TREE_POSITIONS: { svgX: number; svgY: number; scale: number; variant: number }[] = [
  { svgX: 200, svgY: 508, scale: 1.0, variant: 0 },
  { svgX: 820, svgY: 508, scale: 1.1, variant: 1 },
  { svgX: 1420, svgY: 508, scale: 0.95, variant: 2 },
];

function to3D(svgX: number, svgY: number): [number, number, number] {
  return [
    (svgX - 800) * SCALE,  // center X around 0
    0,                      // ground level
    -(svgY - 620) * SCALE,  // depth (negative = toward camera)
  ];
}

export function StreetScene3D() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <Canvas
        camera={{ position: [0, 3.5, 6], fov: 60, near: 0.1, far: 50 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        dpr={[1, 1.5]}
        events={undefined}
        onCreated={({ gl }) => {
          (gl.domElement as HTMLCanvasElement).style.pointerEvents = "none";
          gl.setClearColor(0x000000, 0); // transparent background
        }}
      >
        {/* Lighting — warm sun from upper right */}
        <ambientLight intensity={0.5} color="#b8d0e8" />
        <directionalLight
          position={[5, 8, 4]}
          intensity={1.4}
          color="#fff8e0"
        />
        <hemisphereLight args={["#87ceeb", "#3a7a3a", 0.3]} />

        {/* 3D Trees */}
        {TREE_POSITIONS.map((t, i) => (
          <Tree3D
            key={i}
            position={to3D(t.svgX, t.svgY)}
            scale={t.scale}
            variant={t.variant}
            windOffset={i * 2.1}
          />
        ))}
      </Canvas>
    </div>
  );
}
