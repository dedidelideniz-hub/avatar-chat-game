import { useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Ground3D } from "./Ground3D";
import { Buildings3D } from "./Buildings3D";
import { Environment3D } from "./Environment3D";
import { Avatar3D } from "./Avatar3D";
import { cameraState } from "../world/cameraState";
import type { AvatarConfig } from "@/lib/avatar";

/**
 * Main 3D game scene — replaces the SVG street rendering.
 * Orthographic camera synced with the existing game camera state.
 *
 * The game loop in World.tsx writes to cameraState (x, y, vw, vh)
 * and this component reads it to keep the 3D camera in sync.
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

/** Syncs orthographic camera to game camera state */
function CameraRig() {
  const { camera } = useThree();

  useFrame(() => {
    const { x, y, vw, vh } = cameraState;
    if (vw <= 0 || vh <= 0) return;

    const cam = camera as THREE.OrthographicCamera;
    cam.left = x;
    cam.right = x + vw;
    cam.top = y;
    cam.bottom = y + vh;
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
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      <Canvas
        orthographic
        camera={{
          left: 0,
          right: 1600,
          top: 0,
          bottom: 900,
          near: 0.1,
          far: 500,
        }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.5]}
        onCreated={({ gl }) => {
          (gl.domElement as HTMLCanvasElement).style.pointerEvents = "none";
          gl.setClearColor(0x000000, 0);
        }}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <CameraRig />

        {/* Lighting — warm cartoon style */}
        <ambientLight intensity={0.6} color="#b8d0e8" />
        <directionalLight
          position={[400, 300, -200]}
          intensity={1.3}
          color="#fff8e0"
        />
        <hemisphereLight args={["#87ceeb", "#3a7a3a", 0.4]} />

        {/* Sky background */}
        <color attach="background" args={["#7ab0d8"]} />

        {/* Ground, roads, sidewalks */}
        <Ground3D />

        {/* Buildings */}
        <Buildings3D />

        {/* Environment: trees, stalls, lamps, benches */}
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
