// 🏟️ 3D battle arena — Three.js (react-three-fiber) replacement for the old
// flat SVG arena. Fighters are procedural low-poly humanoids built from the
// player's avatar config (skin / hair / shirt / pants / shoes colors), so
// everyone keeps their own look in 3D. The game simulation stays in
// BattleScene.tsx (plain refs, no React re-renders); this component only
// reads those refs every frame and draws them with Three.js.
import type { AvatarConfig } from "@/lib/avatar";
import type { AbilityDef } from "@/lib/shop";
import { RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/** Game-space (px) obstacle list — shared with the simulation in BattleScene. */
export const BATTLE_CRATES = [
  { x: 300, y: 270, w: 120, h: 120 },
  { x: 980, y: 270, w: 120, h: 120 },
  { x: 300, y: 560, w: 120, h: 120 },
  { x: 980, y: 560, w: 120, h: 120 },
  { x: 640, y: 400, w: 120, h: 120 },
];

/** True when the browser can render WebGL (used to pick 3D vs 2D arena). */
export function supportsWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

/** World px → 3D units. */
const S = 100;
const ARENA_W = 14; // 1400 px
const ARENA_D = 8; // 800 px

export interface BattleFighter {
  name: string;
  config: AvatarConfig;
  equipped: string[];
  ability: AbilityDef;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  facing: number;
  phase: number;
  moving: boolean;
  atkCd: number;
  superCharge: number;
  dashT: number;
  dashVX: number;
  dashVY: number;
  dashHit: boolean;
  lastHitAt: number;
}

export interface BattleProj {
  owner: "player" | "bot";
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  r: number;
  travelled: number;
  pierce: boolean;
  explodeR?: number;
}

export type BattleFx =
  | {
      kind: "text";
      x: number;
      y: number;
      ttl: number;
      maxTtl: number;
      text: string;
      color: string;
    }
  | {
      kind: "ring";
      x: number;
      y: number;
      ttl: number;
      maxTtl: number;
      grow: number;
      color: string;
    }
  | {
      kind: "burst";
      x: number;
      y: number;
      ttl: number;
      maxTtl: number;
      grow: number;
      color: string;
    }
  | {
      kind: "beam";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      ttl: number;
      maxTtl: number;
    }
  | {
      kind: "smoke";
      x: number;
      y: number;
      ttl: number;
      maxTtl: number;
      grow: number;
      color: string;
    };

const PROJ_POOL = 26;
const TEXT_POOL = 8;
const RING_POOL = 12;
const BURST_POOL = 8;
const BEAM_POOL = 2;
const SMOKE_POOL = 22;

/* ------------------------------------------------------------------ */
/* Fighters — procedural low-poly humanoid built from avatar colors.   */
/* ------------------------------------------------------------------ */

function FighterRig({
  fighter,
}: {
  fighter: MutableRefObject<BattleFighter>;
}) {
  const root = useRef<THREE.Group>(null);
  const bob = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const flashMat = useRef<THREE.MeshStandardMaterial>(null);
  const c = fighter.current.config;

  useFrame(() => {
    const f = fighter.current;
    if (!root.current) return;
    root.current.position.set(f.x / S, 0, -f.y / S);
    root.current.rotation.y = f.facing >= 0 ? 0 : Math.PI;
    const amp = f.moving ? 1 : 0;
    const t = f.phase;
    if (armL.current) armL.current.rotation.x = Math.sin(t) * 0.75 * amp;
    if (armR.current) armR.current.rotation.x = Math.sin(t + Math.PI) * 0.75 * amp;
    if (legL.current) legL.current.rotation.x = Math.sin(t + Math.PI) * 0.6 * amp;
    if (legR.current) legR.current.rotation.x = Math.sin(t) * 0.6 * amp;
    if (bob.current) bob.current.position.y = Math.abs(Math.sin(t)) * 0.09 * amp;
    if (flashMat.current) {
      const elapsed = performance.now() - f.lastHitAt;
      flashMat.current.opacity = Math.max(0, 0.85 * (1 - elapsed / 350));
    }
  });

  return (
    <group ref={root}>
      <group ref={bob}>
        {/* legs + shoes */}
        <group ref={legL} position={[0, 0.5, 0.1]}>
          <RoundedBox args={[0.18, 0.52, 0.2]} radius={0.06} position={[0, -0.26, 0]}>
            <meshStandardMaterial color={c.pants} roughness={0.9} />
          </RoundedBox>
          <RoundedBox args={[0.2, 0.12, 0.32]} radius={0.045} position={[0, -0.54, 0.03]}>
            <meshStandardMaterial color={c.shoes} roughness={0.55} />
          </RoundedBox>
        </group>
        <group ref={legR} position={[0, 0.5, -0.1]}>
          <RoundedBox args={[0.18, 0.52, 0.2]} radius={0.06} position={[0, -0.26, 0]}>
            <meshStandardMaterial color={c.pants} roughness={0.9} />
          </RoundedBox>
          <RoundedBox args={[0.2, 0.12, 0.32]} radius={0.045} position={[0, -0.54, 0.03]}>
            <meshStandardMaterial color={c.shoes} roughness={0.55} />
          </RoundedBox>
        </group>
        {/* torso */}
        <RoundedBox args={[0.54, 0.6, 0.3]} radius={0.13} position={[0, 0.8, 0]} castShadow>
          <meshStandardMaterial color={c.shirt} roughness={0.85} />
        </RoundedBox>
        {/* arms + hands */}
        <group ref={armL} position={[0.33, 0.88, 0]}>
          <RoundedBox args={[0.16, 0.54, 0.18]} radius={0.07} position={[0, -0.27, 0]}>
            <meshStandardMaterial color={c.shirt} roughness={0.85} />
          </RoundedBox>
          <mesh position={[0, -0.52, 0]}>
            <sphereGeometry args={[0.09, 10, 10]} />
            <meshStandardMaterial color={c.skin} roughness={0.8} />
          </mesh>
        </group>
        <group ref={armR} position={[-0.33, 0.88, 0]}>
          <RoundedBox args={[0.16, 0.54, 0.18]} radius={0.07} position={[0, -0.27, 0]}>
            <meshStandardMaterial color={c.shirt} roughness={0.85} />
          </RoundedBox>
          <mesh position={[0, -0.52, 0]}>
            <sphereGeometry args={[0.09, 10, 10]} />
            <meshStandardMaterial color={c.skin} roughness={0.8} />
          </mesh>
        </group>
        {/* head */}
        <group position={[0, 1.3, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.2, 20, 20]} />
            <meshStandardMaterial color={c.skin} roughness={0.75} />
          </mesh>
          {/* eyes + pupils */}
          {[0.075, -0.075].map((sx) => (
            <group key={sx} position={[sx, 0.03, 0.15]}>
              <mesh>
                <sphereGeometry args={[0.05, 10, 10]} />
                <meshStandardMaterial color="#ffffff" roughness={0.3} />
              </mesh>
              <mesh position={[0, 0, 0.035]}>
                <sphereGeometry args={[0.024, 8, 8]} />
                <meshStandardMaterial color="#1f2937" roughness={0.2} />
              </mesh>
            </group>
          ))}
          {/* eyebrows */}
          {[0.075, -0.075].map((sx) => (
            <mesh key={sx} position={[sx, 0.095, 0.165]}>
              <boxGeometry args={[0.075, 0.02, 0.02]} />
              <meshStandardMaterial color={c.hairColor} roughness={0.8} />
            </mesh>
          ))}
          {/* mouth */}
          <mesh position={[0, -0.06, 0.19]}>
            <boxGeometry args={[0.1, 0.022, 0.02]} />
            <meshStandardMaterial color="#8a4a3a" roughness={0.7} />
          </mesh>
          {/* hair styles */}
          {c.hair !== "none" && (
            <group>
              <mesh position={[0, 0.17, 0]} scale={[1.02, 0.72, 1.02]}>
                <sphereGeometry args={[0.2, 18, 18]} />
                <meshStandardMaterial color={c.hairColor} roughness={0.9} />
              </mesh>
              {c.hair === "spiky" &&
                Array.from({ length: 6 }).map((_, i) => {
                  const a = (i / 6) * Math.PI * 2;
                  return (
                    <mesh
                      key={i}
                      position={[Math.cos(a) * 0.13, 0.3, Math.sin(a) * 0.13]}
                      rotation={[Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4]}
                    >
                      <coneGeometry args={[0.055, 0.26, 8]} />
                      <meshStandardMaterial color={c.hairColor} roughness={0.9} />
                    </mesh>
                  );
                })}
              {c.hair === "long" && (
                <mesh position={[0, -0.12, -0.17]}>
                  <boxGeometry args={[0.34, 0.62, 0.13]} />
                  <meshStandardMaterial color={c.hairColor} roughness={0.9} />
                </mesh>
              )}
              {c.hair === "curly" &&
                Array.from({ length: 8 }).map((_, i) => {
                  const a = (i / 8) * Math.PI * 2;
                  return (
                    <mesh key={i} position={[Math.cos(a) * 0.12, 0.26, Math.sin(a) * 0.12]}>
                      <sphereGeometry args={[0.085, 10, 10]} />
                      <meshStandardMaterial color={c.hairColor} roughness={0.95} />
                    </mesh>
                  );
                })}
              {c.hair === "bob" &&
                [0.17, -0.17].map((sx) => (
                  <mesh key={sx} position={[sx, -0.08, 0]}>
                    <boxGeometry args={[0.13, 0.38, 0.34]} />
                    <meshStandardMaterial color={c.hairColor} roughness={0.9} />
                  </mesh>
                ))}
            </group>
          )}
        </group>
        {/* white hit-flash overlay */}
        <RoundedBox args={[0.78, 1.7, 0.55]} radius={0.22} position={[0, 0.85, 0]}>
          <meshStandardMaterial
            ref={flashMat}
            color="#ffffff"
            transparent
            opacity={0}
            roughness={1}
            depthWrite={false}
          />
        </RoundedBox>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Projectiles — pooled glowing orbs with a soft halo.                 */
/* ------------------------------------------------------------------ */

function ProjectilePool({
  projsRef,
}: {
  projsRef: MutableRefObject<BattleProj[]>;
}) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const halos = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const list = projsRef.current;
    for (let i = 0; i < PROJ_POOL; i++) {
      const m = meshes.current[i];
      const h = halos.current[i];
      const p = list[i];
      if (m) {
        if (p) {
          m.visible = true;
          m.position.set(p.x / S, 0.85, -p.y / S);
          (m.material as THREE.MeshStandardMaterial).color.set(
            p.owner === "player" ? "#38bdf8" : "#fb7185",
          );
          (m.material as THREE.MeshStandardMaterial).emissive.set(
            p.owner === "player" ? "#0ea5e9" : "#f43f5e",
          );
        } else {
          m.visible = false;
        }
      }
      if (h) {
        h.visible = !!p;
        if (p) h.position.set(p.x / S, 0.85, -p.y / S);
      }
    }
  });

  return (
    <group>
      {Array.from({ length: PROJ_POOL }).map((_, i) => (
        <group key={i}>
          <mesh
            ref={(el) => {
              meshes.current[i] = el;
            }}
          >
            <sphereGeometry args={[0.15, 12, 12]} />
            <meshStandardMaterial emissive="#0ea5e9" emissiveIntensity={2.2} />
          </mesh>
          <mesh
            ref={(el) => {
              halos.current[i] = el;
            }}
            visible={false}
          >
            <sphereGeometry args={[0.28, 10, 10]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.25} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Effects — damage numbers (canvas sprites), expanding rings, bursts  */
/* and the light-beam attack.                                          */
/* ------------------------------------------------------------------ */

function drawTextSprite(sprite: THREE.Sprite, text: string, color: string) {
  const mat = sprite.material as THREE.SpriteMaterial;
  const tex = mat.map as THREE.CanvasTexture;
  const canvas = tex.image as HTMLCanvasElement;
  canvas.width = 256;
  canvas.height = 96;
  const g = canvas.getContext("2d");
  if (!g) return;
  g.clearRect(0, 0, 256, 96);
  g.font = "900 56px 'Baloo 2', 'Segoe UI', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 12;
  g.lineJoin = "round";
  g.strokeStyle = "#ffffff";
  g.strokeText(text, 128, 48);
  g.fillStyle = color;
  g.fillText(text, 128, 48);
  tex.needsUpdate = true;
}

function FxPool({ fxsRef }: { fxsRef: MutableRefObject<BattleFx[]> }) {
  const textRefs = useRef<(THREE.Sprite | null)[]>([]);
  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);
  const burstRefs = useRef<(THREE.Mesh | null)[]>([]);
  const beamRefs = useRef<(THREE.Mesh | null)[]>([]);
  const smokeRefs = useRef<(THREE.Sprite | null)[]>([]);
  // Canvas textures for the floating damage numbers — created once.
  const textTextures = useMemo(
    () =>
      Array.from({ length: TEXT_POOL }).map(
        () => new THREE.CanvasTexture(document.createElement("canvas")),
      ),
    [],
  );
  // Soft procedural smoke puff texture (radial gradient) — no external files.
  const smokeTexture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(32, 32, 3, 32, 32, 30);
      grad.addColorStop(0, "rgba(255,255,255,0.9)");
      grad.addColorStop(0.55, "rgba(240,240,240,0.5)");
      grad.addColorStop(1, "rgba(210,210,210,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame(() => {
    const fxs = fxsRef.current;
    let ti = 0;
    let ri = 0;
    let bi = 0;
    let mi = 0;
    let si = 0;

    for (const fx of fxs) {
      if (fx.ttl <= 0) continue;
      const t = fx.ttl / fx.maxTtl;

      if (fx.kind === "text") {
        const s = textRefs.current[ti];
        if (s) {
          const key = `${fx.text}|${fx.color}`;
          if (s.userData.key !== key) {
            drawTextSprite(s, fx.text, fx.color);
            s.userData.key = key;
          }
          s.visible = true;
          s.position.set(fx.x / S, 1.7 + (1 - t) * 1.5, -fx.y / S);
          (s.material as THREE.SpriteMaterial).opacity = t;
        }
        ti++;
      } else if (fx.kind === "ring") {
        const m = ringRefs.current[ri];
        if (m) {
          m.visible = true;
          m.position.set(fx.x / S, 0.08, -fx.y / S);
          const scale = Math.max(0.12, ((fx.grow / S) * (1 - t)) / 1);
          m.scale.setScalar(scale);
          (m.material as THREE.MeshBasicMaterial).opacity = t * 0.9;
        }
        ri++;
      } else if (fx.kind === "burst") {
        const m = burstRefs.current[bi];
        if (m) {
          m.visible = true;
          m.position.set(fx.x / S, 0.55, -fx.y / S);
          const scale = Math.max(0.2, ((fx.grow / S) * (1 - t)) / 1);
          m.scale.setScalar(scale);
          (m.material as THREE.MeshBasicMaterial).opacity = t * 0.85;
        }
        bi++;
      } else if (fx.kind === "beam") {
        // beam — stretched glowing box between the two points
        const m = beamRefs.current[mi];
        if (m) {
          m.visible = true;
          const dx = (fx.x2 - fx.x1) / S;
          const dz = -(fx.y2 - fx.y1) / S;
          const len = Math.hypot(dx, dz) || 1;
          m.position.set(
            (fx.x1 + (fx.x2 - fx.x1) / 2) / S,
            0.9,
            -(fx.y1 + (fx.y2 - fx.y1) / 2) / S,
          );
          m.scale.set(len, 1, 1);
          m.rotation.y = Math.atan2(-dz, dx);
          (m.material as THREE.MeshBasicMaterial).opacity = t * 0.95;
        }
        mi++;
      } else {
        // smoke — soft puffs that rise, spread and fade
        const s = smokeRefs.current[si];
        if (s) {
          s.visible = true;
          s.position.set(fx.x / S, 0.6 + (1 - t) * 2.4, -fx.y / S);
          const sc = Math.max(0.5, ((fx.grow / S) * (1 - t)) / 1 + 0.35);
          s.scale.setScalar(sc);
          (s.material as THREE.SpriteMaterial).opacity = t * 0.65;
          (s.material as THREE.SpriteMaterial).color.set(fx.color);
        }
        si++;
      }
    }

    for (let i = ti; i < TEXT_POOL; i++) {
      const s = textRefs.current[i];
      if (s) s.visible = false;
    }
    for (let i = ri; i < RING_POOL; i++) {
      const m = ringRefs.current[i];
      if (m) m.visible = false;
    }
    for (let i = bi; i < BURST_POOL; i++) {
      const m = burstRefs.current[i];
      if (m) m.visible = false;
    }
    for (let i = mi; i < BEAM_POOL; i++) {
      const m = beamRefs.current[i];
      if (m) m.visible = false;
    }
    for (let i = si; i < SMOKE_POOL; i++) {
      const s = smokeRefs.current[i];
      if (s) s.visible = false;
    }
  });

  return (
    <group>
      {Array.from({ length: TEXT_POOL }).map((_, i) => (
        <sprite
          key={`t${i}`}
          ref={(el) => {
            textRefs.current[i] = el;
          }}
          visible={false}
          scale={[1.7, 0.64, 1]}
        >
          <spriteMaterial
            map={textTextures[i]}
            transparent
            depthWrite={false}
          />
        </sprite>
      ))}
      {Array.from({ length: RING_POOL }).map((_, i) => (
        <mesh
          key={`r${i}`}
          ref={(el) => {
            ringRefs.current[i] = el;
          }}
          visible={false}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[1, 0.035, 8, 40]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {Array.from({ length: BURST_POOL }).map((_, i) => (
        <mesh
          key={`b${i}`}
          ref={(el) => {
            burstRefs.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[1, 14, 14]} />
          <meshBasicMaterial
            color="#fdba74"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
      {Array.from({ length: BEAM_POOL }).map((_, i) => (
        <mesh
          key={`m${i}`}
          ref={(el) => {
            beamRefs.current[i] = el;
          }}
          visible={false}
        >
          <boxGeometry args={[1, 0.16, 0.16]} />
          <meshBasicMaterial color="#ffe066" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {Array.from({ length: SMOKE_POOL }).map((_, i) => (
        <sprite
          key={`s${i}`}
          ref={(el) => {
            smokeRefs.current[i] = el;
          }}
          visible={false}
        >
          <spriteMaterial
            map={smokeTexture}
            color="#c9c9c9"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Brawl-Stars-style follow camera — zoomed in on the player and        */
/* smoothly tracking them, clamped to the arena edges. The arena is     */
/* bigger than the screen, so characters stay big while you fight.      */
/* ------------------------------------------------------------------ */

function FollowCamera({
  playerRef,
  zoomRef,
}: {
  playerRef: MutableRefObject<BattleFighter>;
  zoomRef: MutableRefObject<number>;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const cur = useRef(new THREE.Vector3(ARENA_W / 2, 0.6, -ARENA_D / 2));
  const el = 0.5; // elevation (radians)

  useFrame((_, dt) => {
    const p = playerRef.current;
    const zoom = THREE.MathUtils.clamp(zoomRef.current, 3.4, 12);
    const vFov = (camera.fov * Math.PI) / 180;
    const aspect = Math.max(0.2, camera.aspect);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    // Half extents of the visible window at the current zoom.
    const halfW = Math.tan(hFov / 2) * zoom;
    const halfD = Math.tan(vFov / 2) * zoom * Math.cos(el);
    // Clamp the target so the view never leaves the arena walls.
    const tx = THREE.MathUtils.clamp(
      p.x / S,
      halfW + 0.3,
      ARENA_W - halfW - 0.3,
    );
    const tz = THREE.MathUtils.clamp(
      -p.y / S,
      -ARENA_D + halfD + 0.3,
      -halfD - 0.3,
    );
    const target = new THREE.Vector3(tx, 0.6, tz);
    cur.current.lerp(target, Math.min(1, dt * 5));
    camera.position.set(
      cur.current.x,
      cur.current.y + Math.sin(el) * zoom,
      cur.current.z + Math.cos(el) * zoom,
    );
    camera.lookAt(cur.current);
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* The whole 3D scene.                                                 */
/* ------------------------------------------------------------------ */

export function Arena3D({
  playerRef,
  botRef,
  projsRef,
  fxsRef,
  zoomRef,
  onWorldClick,
}: {
  playerRef: MutableRefObject<BattleFighter>;
  botRef: MutableRefObject<BattleFighter>;
  projsRef: MutableRefObject<BattleProj[]>;
  fxsRef: MutableRefObject<BattleFx[]>;
  zoomRef: MutableRefObject<number>;
  onWorldClick: (x: number, y: number) => void;
}) {
  return (
    <Canvas
      dpr={[1, 2]}
      shadows
      camera={{ position: [7, 6, 9], fov: 60, near: 0.1, far: 300 }}
      className="absolute inset-0"
    >
      <FollowCamera playerRef={playerRef} zoomRef={zoomRef} />
      <color attach="background" args={["#8ecae6"]} />
      <fog attach="fog" args={["#8ecae6", 24, 55]} />
      <ambientLight intensity={0.7} />
      <hemisphereLight args={["#cfe9ff", "#4c9a3a", 0.55]} />
      <directionalLight
        position={[10, 14, 6]}
        intensity={1.7}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />

      {/* sun */}
      <mesh position={[10.5, 11, 2]}>
        <sphereGeometry args={[0.9, 16, 16]} />
        <meshBasicMaterial color="#ffe066" />
      </mesh>

      {/* drifting clouds — plain spheres, no extra dependencies */}
      {[
        { pos: [2.5, 6.8, -0.5], s: 1 },
        { pos: [10.5, 6.2, -6], s: 0.8 },
      ].map((cl, i) => (
        <group key={i} position={cl.pos as [number, number, number]}>
          {[
            [0, 0, 0],
            [0.85, 0.12, 0.15],
            [-0.85, 0.12, -0.1],
            [0.3, 0.28, 0.05],
            [-0.35, 0.26, -0.12],
          ].map((o, j) => (
            <mesh
              key={j}
              position={o as [number, number, number]}
              scale={[1, 0.62, 0.8]}
            >
              <sphereGeometry args={[0.55 * cl.s, 10, 10]} />
              <meshStandardMaterial
                color="#ffffff"
                transparent
                opacity={0.85}
                roughness={1}
              />
            </mesh>
          ))}
        </group>
      ))}

      {/* grass floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[9.4, 48]} />
        <meshStandardMaterial color="#6bbf4e" roughness={1} />
      </mesh>
      {/* striped boundary ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[6.95, 7.3, 48]} />
        <meshStandardMaterial
          color="#ffffff"
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* center line */}
      <mesh position={[7, 0.02, -4]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.06, 0.02, ARENA_D]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.25} />
      </mesh>

      {/* boundary walls */}
      {[
        { pos: [7, 0.3, 0], size: [ARENA_W + 0.4, 0.6, 0.28] },
        { pos: [7, 0.3, -ARENA_D], size: [ARENA_W + 0.4, 0.6, 0.28] },
        { pos: [0, 0.3, -4], size: [0.28, 0.6, ARENA_D] },
        { pos: [ARENA_W, 0.3, -4], size: [0.28, 0.6, ARENA_D] },
      ].map((w, i) => (
        <mesh key={i} position={w.pos as [number, number, number]}>
          <boxGeometry args={w.size as [number, number, number]} />
          <meshStandardMaterial
            color="#ffffff"
            transparent
            opacity={0.55}
            roughness={0.5}
          />
        </mesh>
      ))}

      {/* crates */}
      {BATTLE_CRATES.map((cr, i) => (
        <RoundedBox
          key={i}
          args={[cr.w / S, cr.h / S, cr.w / S]}
          radius={0.08}
          position={[cr.x / S + cr.w / S / 2, 0.62, -cr.y / S - cr.h / S / 2]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#8a5a2b" roughness={0.85} />
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[cr.w / S - 0.24, 0.02, cr.w / S - 0.24]} />
            <meshStandardMaterial
              color="#ffffff"
              transparent
              opacity={0.22}
            />
          </mesh>
        </RoundedBox>
      ))}

      {/* fighters */}
      <FighterRig fighter={playerRef} />
      <FighterRig fighter={botRef} />

      <ProjectilePool projsRef={projsRef} />
      <FxPool fxsRef={fxsRef} />

      {/* invisible click plane — converts taps to game coordinates */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[7, 0.02, -4]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onWorldClick(e.point.x * S, -e.point.z * S);
        }}
      >
        <planeGeometry args={[ARENA_W + 1, ARENA_D + 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </Canvas>
  );
}

