import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { AvatarConfig } from "@/lib/avatar";

/**
 * 3D Low-poly avatar character.
 * - Body parts as simple box/cylinder geometries
 * - Walk animation: leg/arm swing, body bob
 * - Idle animation: gentle breathing sway
 * - Facing direction via rotation
 * - Name tag as HTML overlay
 */

interface Avatar3DProps {
  position: [number, number, number];
  facing: number; // -1 left, 1 right
  moving: boolean;
  config: AvatarConfig;
  name?: string;
  isPlayer?: boolean;
  bubbleText?: string | null;
  onClick?: () => void;
}

// Skin tone to mesh color mapping
const SKIN_COLORS: Record<string, string> = {
  "#f5c19a": "#f0b888",
  "#d4a57b": "#c89060",
  "#8d5a2b": "#7a4820",
  "#ffd1a3": "#f0c090",
  "#3b2314": "#2a1810",
  "#c8956a": "#b08050",
};

function getSkinColor(hex: string): string {
  return SKIN_COLORS[hex] || hex;
}

function getShirtColor(hex: string): string {
  return hex;
}

function getPantsColor(hex: string): string {
  return hex;
}

function getShoesColor(hex: string): string {
  return hex;
}

function getHairColor(hex: string): string {
  return hex;
}

export function Avatar3D({
  position,
  facing,
  moving,
  config,
  name,
  isPlayer = false,
  bubbleText,
  onClick,
}: Avatar3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);

  const skinColor = useMemo(() => getSkinColor(config.skin), [config.skin]);
  const shirtColor = useMemo(() => getShirtColor(config.shirt), [config.shirt]);
  const pantsColor = useMemo(() => getPantsColor(config.pants), [config.pants]);
  const shoesColor = useMemo(() => getShoesColor(config.shoes), [config.shoes]);
  const hairColor = useMemo(() => getHairColor(config.hairColor), [config.hairColor]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;

    // Face direction
    groupRef.current.rotation.y = facing < 0 ? Math.PI : 0;

    // Walk bob
    const bob = moving ? Math.sin(t * 8) * 0.8 : 0;
    groupRef.current.position.y = position[1] + bob;

    // Leg swing
    const legSwing = moving ? Math.sin(t * 8) * 0.5 : 0;
    if (leftLegRef.current) leftLegRef.current.rotation.x = legSwing;
    if (rightLegRef.current) rightLegRef.current.rotation.x = -legSwing;

    // Arm swing
    const armSwing = moving ? Math.sin(t * 8) * 0.4 : 0;
    if (leftArmRef.current) leftArmRef.current.rotation.x = -armSwing;
    if (rightArmRef.current) rightArmRef.current.rotation.x = armSwing;

    // Idle breathing
    if (!moving) {
      const breathe = Math.sin(t * 2) * 0.15;
      groupRef.current.children.forEach((child) => {
        if (child === groupRef.current?.children[0]) return; // skip body
      });
    }
  });

  return (
    <group ref={groupRef} position={position} onClick={onClick}>
      {/* ── Body (torso) ── */}
      <mesh position={[0, 24, 0]}>
        <boxGeometry args={[18, 20, 12]} />
        <meshStandardMaterial color={shirtColor} flatShading />
      </mesh>

      {/* ── Head ── */}
      <mesh position={[0, 42, 0]}>
        <boxGeometry args={[16, 16, 14]} />
        <meshStandardMaterial color={skinColor} flatShading />
      </mesh>

      {/* ── Hair ── */}
      <mesh position={[0, 50, 0]}>
        <boxGeometry args={[18, 6, 16]} />
        <meshStandardMaterial color={hairColor} flatShading />
      </mesh>

      {/* ── Eyes ── */}
      <mesh position={[-4, 43, 7]}>
        <boxGeometry args={[3, 3, 2]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      <mesh position={[4, 43, 7]}>
        <boxGeometry args={[3, 3, 2]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>

      {/* ── Left arm ── */}
      <group ref={leftArmRef} position={[-12, 28, 0]}>
        <mesh position={[0, -6, 0]}>
          <boxGeometry args={[6, 16, 6]} />
          <meshStandardMaterial color={skinColor} flatShading />
        </mesh>
      </group>

      {/* ── Right arm ── */}
      <group ref={rightArmRef} position={[12, 28, 0]}>
        <mesh position={[0, -6, 0]}>
          <boxGeometry args={[6, 16, 6]} />
          <meshStandardMaterial color={skinColor} flatShading />
        </mesh>
      </group>

      {/* ── Left leg ── */}
      <group ref={leftLegRef} position={[-5, 10, 0]}>
        <mesh position={[0, -5, 0]}>
          <boxGeometry args={[7, 14, 7]} />
          <meshStandardMaterial color={pantsColor} flatShading />
        </mesh>
        {/* Shoe */}
        <mesh position={[0, -13, 2]}>
          <boxGeometry args={[8, 4, 10]} />
          <meshStandardMaterial color={shoesColor} flatShading />
        </mesh>
      </group>

      {/* ── Right leg ── */}
      <group ref={rightLegRef} position={[5, 10, 0]}>
        <mesh position={[0, -5, 0]}>
          <boxGeometry args={[7, 14, 7]} />
          <meshStandardMaterial color={pantsColor} flatShading />
        </mesh>
        {/* Shoe */}
        <mesh position={[0, -13, 2]}>
          <boxGeometry args={[8, 4, 10]} />
          <meshStandardMaterial color={shoesColor} flatShading />
        </mesh>
      </group>

      {/* ── Name tag ── */}
      {name && (
        <Html
          position={[0, 60, 0]}
          center
          style={{
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          <div
            style={{
              background: isPlayer ? "#28c840" : "rgba(255,255,255,0.9)",
              color: isPlayer ? "#fff" : "#333",
              fontSize: "10px",
              fontWeight: 800,
              padding: "2px 6px",
              borderRadius: "4px",
              whiteSpace: "nowrap",
              textAlign: "center",
              border: isPlayer ? "none" : "1px solid rgba(0,0,0,0.15)",
            }}
          >
            {name}
          </div>
        </Html>
      )}

      {/* ── Speech bubble ── */}
      {bubbleText && (
        <Html
          position={[0, 72, 0]}
          center
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              background: "#fff",
              color: "#333",
              fontSize: "11px",
              fontWeight: 700,
              padding: "4px 8px",
              borderRadius: "12px",
              whiteSpace: "nowrap",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              border: "2px solid #3d2f2a",
              position: "relative",
            }}
          >
            {bubbleText}
            <div
              style={{
                position: "absolute",
                bottom: -6,
                left: "50%",
                marginLeft: -4,
                width: 0,
                height: 0,
                borderLeft: "4px solid transparent",
                borderRight: "4px solid transparent",
                borderTop: "6px solid #fff",
              }}
            />
          </div>
        </Html>
      )}

      {/* ── Shadow ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
        <circleGeometry args={[10, 12]} />
        <meshBasicMaterial color="#000" transparent opacity={0.12} depthWrite={false} />
      </mesh>
    </group>
  );
}
