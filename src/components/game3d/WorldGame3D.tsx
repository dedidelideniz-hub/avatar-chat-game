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
 * Main 3D game scene — professional city layout.
 * Orthographic camera synced with the existing game camera state.
 *
 * Camera follows the player through the city.
 * Buildings, trees, and environment render in proper layers.
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
    // Ortho camera frustum is relative to camera.position
    // Place camera at the center of the desired view
    const cx = x + vw / 2;
    const cy = y + vh / 2;
    cam.position.set(cx, cy, 500);
    cam.left = -vw / 2;
    cam.right = vw / 2;
    cam.top = vh / 2;
    cam.bottom = -vh / 2;
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
          position: [800, 450, 500],
          left: -800,
          right: 800,
          top: 450,
          bottom: -450,
          near: -2000,
          far: 2000,
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

        {/* Warm cartoon-style lighting */}
        <ambientLight intensity={0.7} color="#c0d8f0" />
        <directionalLight
          position={[400, 400, -200]}
          intensity={1.6}
          color="#fff8e0"
          castShadow={false}
        />
        <hemisphereLight args={["#87ceeb", "#4a8a3a", 0.4]} />
        <directionalLight
          position={[-300, 200, 300]}
          intensity={0.4}
          color="#e0e8ff"
        />

        {/* Test cube — confirms Canvas renders */}
        <mesh position={[800, 20, -620]}>
          <boxGeometry args={[30, 40, 30]} />
          <meshStandardMaterial color="#ff0000" />
        </mesh>

        {/* Ground, roads, sidewalks */}
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
