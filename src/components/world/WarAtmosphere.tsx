// WarAtmosphere — visual-only battlefield dressing that renders in the same
// Three.js Canvas as the battle map (BattleMapModel). Nothing here
// participates in movement or collision: every sprite/mesh opts out of
// raycasting so taps still reach the Arena3D click plane.
//
// Coordinates mirror Arena3D (S = 50 px per unit; arena 34 x 22 units).
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const S = 50;
const ARENA_W = 34;
const ARENA_D = 22;

/** Soft radial glow shared by embers, sun and base beams. */
function makeGlowTexture(color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.45, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

/** Warm sparks drifting up from the whole battlefield — reads like the
 *  aftermath of a live fight / magic duel without changing any model. */
const EMBER_COUNT = 34;
function WarEmbers() {
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  const seed = useRef(
    Array.from({ length: EMBER_COUNT }, () => ({
      x: Math.random() * ARENA_W,
      z: Math.random() * ARENA_D,
      y: Math.random() * 4,
      speed: 0.12 + Math.random() * 0.3,
      phase: Math.random() * Math.PI * 2,
      size: 0.05 + Math.random() * 0.11,
    })),
  );
  const tex = useMemo(() => makeGlowTexture("rgba(255,182,86,1)"), []);

  useFrame((_, dt) => {
    const now = performance.now() / 1000;
    for (let i = 0; i < EMBER_COUNT; i++) {
      const s = refs.current[i];
      const p = seed.current[i];
      if (!s) continue;
      p.y += p.speed * dt;
      p.x += Math.sin(now * 0.6 + p.phase) * dt * 0.16;
      p.z += Math.cos(now * 0.5 + p.phase * 1.3) * dt * 0.12;
      if (p.y > 4.6) {
        p.y = 0.08;
        p.x = Math.random() * ARENA_W;
        p.z = Math.random() * ARENA_D;
      }
      s.position.set(p.x, p.y, p.z);
      const flicker = 0.5 + 0.5 * Math.sin(now * 3.2 + p.phase * 4);
      (s.material as THREE.SpriteMaterial).opacity = flicker * 0.8;
      s.scale.set(p.size, p.size, 1);
    }
  });

  return (
    <group>
      {Array.from({ length: EMBER_COUNT }).map((_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          raycast={() => null}
        >
          <spriteMaterial
            map={tex}
            color="#ffb050"
            transparent
            opacity={0.7}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      ))}
    </group>
  );
}

/** Team base energy columns + ground rings so each spawn reads as a
 *  faction stronghold. Red = player lane, Blue = enemy lane. */
function BaseColumns() {
  const redRef = useRef<THREE.Group>(null);
  const blueRef = useRef<THREE.Group>(null);
  const redTex = useMemo(() => makeGlowTexture("rgba(255,90,90,1)"), []);
  const blueTex = useMemo(() => makeGlowTexture("rgba(86,170,255,1)"), []);

  useFrame(() => {
    const t = performance.now() / 1000;
    if (redRef.current) redRef.current.scale.setScalar(1 + 0.07 * Math.sin(t * 2));
    if (blueRef.current) blueRef.current.scale.setScalar(1 + 0.07 * Math.sin(t * 2 + 1));
  });

  const column = (x: number, z: number, color: string, tex: THREE.Texture) => (
    <group position={[x, 0.06, z]}>
      {/* ground ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[1.5, 1.72, 48]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* tall soft light beam */}
      <sprite position={[0, 2.3, 0]} scale={[2.6, 5.6, 1]} raycast={() => null}>
        <spriteMaterial
          map={tex}
          color={color}
          transparent
          opacity={0.26}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );

  return (
    <>
      <group ref={redRef}>{column(17, 1.6, "#ff5a5a", redTex)}</group>
      <group ref={blueRef}>{column(17, 20.4, "#56aaff", blueTex)}</group>
    </>
  );
}

/** Warm low sun + rotating god-ray glow floating beyond the map edge, giving
 *  the arena a golden-hour battlefield feel without touching the map itself. */
function BattleSky() {
  const raysRef = useRef<THREE.Group>(null);
  const sunTex = useMemo(() => makeGlowTexture("rgba(255,236,190,1)"), []);
  useFrame((_, dt) => {
    if (raysRef.current) raysRef.current.rotation.z += dt * 0.04;
  });
  return (
    <group position={[-14, 9, -8]}>
      {/* soft rotating god rays (raycast-proof) */}
      <group ref={raysRef}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh
            key={i}
            rotation={[-Math.PI / 2, 0, (i * Math.PI) / 3]}
            raycast={() => null}
          >
            <planeGeometry args={[9, 0.35]} />
            <meshBasicMaterial
              color="#ffe9c4"
              transparent
              opacity={0.05}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
      {/* warm sun disc */}
      <sprite scale={[4.5, 4.5, 1]} raycast={() => null}>
        <spriteMaterial
          map={sunTex}
          color="#ffdf9e"
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}

/**
 * Rendered by the battle map so it lands inside the Arena3D Canvas as a
 * sibling of the map (not affected by the map's fit transform).
 */
export function WarAtmosphere() {
  // Nothing to do per-frame beyond the pools' own animation; this just
  // groups the atmosphere as a sibling of the map in the Arena3D Canvas.
  return (
    <>
      <WarEmbers />
      <BaseColumns />
      <BattleSky />
    </>
  );
}