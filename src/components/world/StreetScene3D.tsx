import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { Tree3D } from "./Trees3D";
import { cameraState } from "./cameraState";

/**
 * 3D tree overlay synced with SVG viewBox.
 * Uses orthographic camera so pixel positions match 1:1.
 * SVG coords: x=0..1600, y=0..900, y increases downward.
 */

// Trees at top sidewalk (y≈508 in SVG coords)
const TREE_POSITIONS = [
  { svgX: 200, svgY: 508, scale: 0.4, variant: 0 },
  { svgX: 820, svgY: 508, scale: 0.45, variant: 1 },
  { svgX: 1420, svgY: 508, scale: 0.38, variant: 2 },
];

/** Sync ortho camera to match SVG viewBox each frame. */
function CameraSync() {
  const { camera } = useThree();

  useFrame(() => {
    const { x, y, vw, vh } = cameraState;
    const cam = camera as THREE.OrthographicCamera;
    // SVG viewBox = "x y vw vh"
    // Ortho camera sees [left..right, bottom..top]
    // SVG y↓ but Three.js y↑ — so flip: top = -(y), bottom = -(y+vh)
    cam.left = x;
    cam.right = x + vw;
    cam.top = -y;
    cam.bottom = -(y + vh);
    cam.position.set(x + vw / 2, -(y + vh / 2), 10);
    cam.updateProjectionMatrix();
  });

  return null;
}

/** Debug: visible test box to verify Canvas renders */
function TestBox() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.5;
    }
  });
  return (
    <mesh ref={ref} position={[800, -508, 0]}>
      <boxGeometry args={[30, 30, 30]} />
      <meshStandardMaterial color="#ff0000" flatShading />
    </mesh>
  );
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
          right: 1600,
          top: 0,
          bottom: -900,
          near: 0.1,
          far: 200,
        }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.5]}
        onCreated={({ gl }) => {
          (gl.domElement as HTMLCanvasElement).style.pointerEvents = "none";
          gl.setClearColor(0x000000, 0);
        }}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <CameraSync />

        {/* Lighting */}
        <ambientLight intensity={0.7} color="#b8d0e8" />
        <directionalLight position={[400, 200, 8]} intensity={1.4} color="#fff8e0" />
        <hemisphereLight args={["#87ceeb", "#3a7a3a", 0.4]} />

        {/* Debug test box — visible red cube at center */}
        <TestBox />

        {/* 3D Trees — SVG coordinates, Y flipped */}
        {TREE_POSITIONS.map((t, i) => (
          <Tree3D
            key={i}
            position={[t.svgX, -t.svgY, 0]}
            scale={t.scale}
            variant={t.variant}
            windOffset={i * 2.1}
          />
        ))}
      </Canvas>
    </div>
  );
}
