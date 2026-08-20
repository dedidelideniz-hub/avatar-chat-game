import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Ground3D } from "./Ground3D";
import { Buildings3D } from "./Buildings3D";
import { Environment3D } from "./Environment3D";
import { Avatar3D } from "./Avatar3D";
import { cameraState } from "../world/cameraState";
import type { AvatarConfig } from "@/lib/avatar";

/**
 * 3D game scene — top-down orthographic city view.
 *
 * SVG (x, y) → Three.js (x, 0, -y)
 * Camera: orthographic looking straight down.
 */

interface PlayerState {
  x: number; y: number; facing: number; moving: boolean;
  config: AvatarConfig; name?: string; bubble?: string | null;
}
interface RemotePlayer {
  sessionId: string; x: number; y: number; facing: number;
  config: AvatarConfig; name: string; bubble?: string | null;
}
interface WorldGame3DProps {
  player: PlayerState;
  remotePlayers: RemotePlayer[];
  onPlayerClick?: () => void;
  onRemoteClick?: (sessionId: string) => void;
}

/** Camera synced with SVG viewBox */
function CameraRig() {
  const { camera } = useThree();
  const initialized = useRef(false);

  useFrame(() => {
    const cam = camera as THREE.OrthographicCamera;

    // First frame: use default full world view
    if (!initialized.current) {
      cam.position.set(800, 500, -450);
      cam.up.set(0, 0, -1);
      cam.left = -800;
      cam.right = 800;
      cam.top = 450;
      cam.bottom = -450;
      cam.near = 0;
      cam.far = 1000;
      cam.updateProjectionMatrix();
      initialized.current = true;
      return;
    }

    const { x, y, vw, vh } = cameraState;
    if (vw <= 0 || vh <= 0) return;

    const cx = x + vw / 2;
    const cz = -(y + vh / 2);
    cam.position.set(cx, 500, cz);
    cam.up.set(0, 0, -1);
    cam.left = -vw / 2;
    cam.right = vw / 2;
    cam.top = vh / 2;
    cam.bottom = -vh / 2;
    cam.near = 0;
    cam.far = 1000;
    cam.updateProjectionMatrix();
  });
  return null;
}

export function WorldGame3D({
  player, remotePlayers, onPlayerClick, onRemoteClick,
}: WorldGame3DProps) {
  useEffect(() => {
    if (cameraState.vw <= 0 || cameraState.vh <= 0) {
      cameraState.x = 0;
      cameraState.y = 0;
      cameraState.vw = 1600;
      cameraState.vh = 900;
    }
  }, []);

  return (
    <Canvas
      orthographic
      camera={{
        position: [800, 500, -450],
        up: [0, 0, -1],
        left: -800, right: 800,
        top: 450, bottom: -450,
        near: 0, far: 1000,
      }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 1.5]}
      onCreated={({ gl }) => {
        gl.setClearColor(0x78b8d8);
      }}
      style={{
        position: "absolute",
        top: 0, left: 0,
        width: "100%", height: "100%",
        pointerEvents: "none",
      }}
    >
      <CameraRig />

      {/* Lighting */}
      <ambientLight intensity={0.8} color="#ffffff" />
      <directionalLight position={[400, 600, -200]} intensity={1.2} color="#ffffff" />
      <hemisphereLight args={["#87ceeb", "#4a8a3a", 0.3]} />

      <Ground3D />
      <Buildings3D />
      <Environment3D />

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
  );
}
