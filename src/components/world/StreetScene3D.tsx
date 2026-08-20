import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Tree3D } from "./Trees3D";
import { cameraState } from "./cameraState";

/**
 * Maps SVG world coordinates to Three.js 3D positions.
 * SVG viewBox = 1600×900, camera is orthographic-like.
 */
const WORLD_W = 1600;
const WORLD_H = 900;

// Trees are at the top sidewalk (y≈508 in SVG)
const TREE_POSITIONS = [
  { svgX: 200, svgY: 508, scale: 0.35, variant: 0 },
  { svgX: 820, svgY: 508, scale: 0.4, variant: 1 },
  { svgX: 1420, svgY: 508, scale: 0.33, variant: 2 },
];

/**
 * Syncs the Three.js camera to match the SVG viewBox exactly.
 * Uses orthographic camera so 2D ↔ 3D mapping is 1:1.
 */
function CameraSync() {
  const { camera } = useThree();

  useFrame(() => {
    const { x, y, vw, vh } = cameraState;
    // Orthographic camera: left/right/top/bottom match SVG viewBox
    const cam = camera as THREE.OrthographicCamera;
    cam.left = x;
    cam.right = x + vw;
    cam.top = y;
    cam.bottom = y + vh;
    cam.position.set(x + vw / 2, y + vh / 2, 10);
    cam.lookAt(x + vw / 2, y + vh / 2, 0);
    cam.updateProjectionMatrix();
  });

  return null;
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
        orthographic
        camera={{
          left: 0,
          right: WORLD_W,
          top: 0,
          bottom: WORLD_H,
          near: 0.1,
          far: 100,
          position: [WORLD_W / 2, WORLD_H / 2, 10],
        }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        dpr={[1, 1.5]}
        events={undefined}
        onCreated={({ gl }) => {
          (gl.domElement as HTMLCanvasElement).style.pointerEvents = "none";
          gl.setClearColor(0x000000, 0);
        }}
      >
        <CameraSync />

        {/* Lighting */}
        <ambientLight intensity={0.6} color="#b8d0e8" />
        <directionalLight position={[400, -200, 8]} intensity={1.3} color="#fff8e0" />
        <hemisphereLight args={["#87ceeb", "#3a7a3a", 0.3]} />

        {/* 3D Trees — positioned at SVG world coordinates */}
        {TREE_POSITIONS.map((t, i) => (
          <Tree3D
            key={i}
            position={[t.svgX, t.svgY, 0]}
            scale={t.scale}
            variant={t.variant}
            windOffset={i * 2.1}
          />
        ))}
      </Canvas>
    </div>
  );
}
