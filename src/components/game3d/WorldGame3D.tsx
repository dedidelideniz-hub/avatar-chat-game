import { useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Ground3D } from "./Ground3D";
import { Buildings3D } from "./Buildings3D";
import { Environment3D } from "./Environment3D";
import { Avatar3D } from "./Avatar3D";
import { cameraState } from "../world/cameraState";
import type { AvatarConfig } from "@/lib/avatar";

/**
 * 3D game scene — professional city layout.
 *
 * Coordinate mapping:
 *   SVG  (x, y) → Three.js (x, 0, -y)
 *   Ground plane at y=0 (Three.js up axis)
 *   Objects extend upward (+y) from ground
 *
 * Camera: top-down view looking at the scene from above-front.
 *   Position: (800, 600, 600) — centered, above, in front
 *   Target:   (800, 0, -450)  — center of the 1600×900 world
 */

interface PlayerState {
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  config: AvatarConfig;
  name?: string;
  bubble?: string | null;
}

interface RemotePlayer {
  sessionId: string;
  x: number;
  y: number;
  facing: number;
  config: AvatarConfig;
  name: string;
  bubble?: string | null;
}

interface WorldGame3DProps {
  player: PlayerState;
  remotePlayers: RemotePlayer[];
  onPlayerClick?: () => void;
  onRemoteClick?: (sessionId: string) => void;
}

/** Syncs camera with the game camera state */
function CameraRig() {
  const { camera } = useThree();

  useFrame(() => {
    const { x, y, vw, vh } = cameraState;
    if (vw <= 0 || vh <= 0) return;

    const cam = camera as THREE.OrthographicCamera;

    // SVG viewBox = [x, y, vw, vh]
    // We need the camera to show the same area
    //
    // Strategy: place camera above the scene looking down
    // The frustum shows the SVG area with Y-flip
    //
    // Camera position: centered on the SVG area, elevated
    const svgCenterX = x + vw / 2;
    const svgCenterZ = -(y + vh / 2); // SVG Y → -Z

    // Position camera above and slightly in front
    cam.position.set(svgCenterX, 800, svgCenterZ + 400);

    // Look at the center of the visible area
    cam.lookAt(svgCenterX, 0, svgCenterZ);

    // Orthographic frustum — match SVG viewBox dimensions
    cam.left = -vw / 2;
    cam.right = vw / 2;
    cam.top = vh / 2;
    cam.bottom = -vh / 2;
    cam.near = 0;
    cam.far = 2000;
    cam.updateProjectionMatrix();
  });

  return null;
}

export function WorldGame3D({
  player,
  remotePlayers,
  onPlayerClick,
  onRemoteClick,
}: WorldGame3DProps) {
  // Ensure cameraState has valid values from the start
  useEffect(() => {
    if (cameraState.vw <= 0 || cameraState.vh <= 0) {
      cameraState.x = 0;
      cameraState.y = 0;
      cameraState.vw = 1600;
      cameraState.vh = 900;
    }
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <Canvas
        orthographic
        camera={{
          position: [800, 800, 100],
          left: -800,
          right: 800,
          top: 450,
          bottom: -450,
          near: 0,
          far: 2000,
        }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.5]}
        onCreated={({ gl }) => {
          (gl.domElement as HTMLCanvasElement).style.pointerEvents = "none";
          gl.setClearColor(0x000000, 0);
        }}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        <CameraRig />

        {/* Lighting — warm top-down + fill */}
        <ambientLight intensity={0.65} color="#c8d8f0" />
        <directionalLight
          position={[400, 600, -200]}
          intensity={1.5}
          color="#fff8e0"
        />
        <hemisphereLight args={["#87ceeb", "#4a8a3a", 0.35]} />
        <directionalLight
          position={[-300, 400, 300]}
          intensity={0.3}
          color="#e0e8ff"
        />

        {/* Ground */}
        <Ground3D />

        {/* Buildings */}
        <Buildings3D />

        {/* Trees, stalls, lamps, decorations */}
        <Environment3D />

        {/* Player avatar */}
        <Avatar3D
          position={[player.x, 0, -player.y]}
          facing={player.facing}
          moving={player.moving}
          config={player.config}
          name={player.name}
          isPlayer
          bubbleText={player.bubble}
          onClick={onPlayerClick}
        />

        {/* Remote players */}
        {remotePlayers.map((rp) => (
          <Avatar3D
            key={rp.sessionId}
            position={[rp.x, 0, -rp.y]}
            facing={rp.facing}
            moving={false}
            config={rp.config}
            name={rp.name}
            bubbleText={rp.bubble}
            onClick={() => onRemoteClick?.(rp.sessionId)}
          />
        ))}
      </Canvas>
    </div>
  );
}
