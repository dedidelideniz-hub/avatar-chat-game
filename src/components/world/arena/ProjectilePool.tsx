// ⚔️ Mermi havuzu — normal enerji küreleri + Ateş Topu'nun animasyonlu
// soğuk alev küresi.
//
// Normal mermiler eskisi gibi: parlayan orb + yumuşak hale + uçuş izi.
// Ateş Topu (`explodeR` taşıyan mermi) ise fiziksel ateş yerine antik
// büyüyle harmanlanmış ruhani / soğuk bir alev küresidir:
//   • buzlu-mor parlak çekirdek (nabız gibi atar)
//   • iki katmanlı soğuk ışıma halesi (additive — "ruhani" parlaklık)
//   • etrafında dönen antik büyü halkaları (runik çember)
//   • sürekli titreyip yalpan 5 alev dili
//   • yükselip sönen buz kırıntısı parçacıkları
//   • uçuş yönüne uzanan soğuk alev izi
//
// Havuzlar ayrı tutulur: normal atışların görünümü birebir aynı kalır,
// soğuk alev yalnızca ateş topu için harcanır.
import { useFrame } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useRef } from "react";
import * as THREE from "three";
import { COLD_FLAME, HUD, isFireballProj, PROJ_POOL, S, type BattleProj } from "./shared";

/** Aynı anda ekranda çizilecek en fazla ateş topu (ulti değil, ana ateş). */
const FLAME_POOL = 4;
/** Alev küresi başına alev dili sayısı. */
const TONGUES = 5;
/** Alev küresi başına yükselen buz kırıntısı sayısı. */
const EMBERS = 3;

export function ProjectilePool({
  projsRef,
}: {
  projsRef: MutableRefObject<BattleProj[]>;
}) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const halos = useRef<(THREE.Mesh | null)[]>([]);
  const trails = useRef<(THREE.Mesh | null)[]>([]);

  // Ateş Topu (soğuk alev) havuzu.
  const flameRoots = useRef<(THREE.Group | null)[]>([]); // konum + görünürlük
  const flameSpins = useRef<(THREE.Group | null)[]>([]); // dönen alev kümesi
  const flameCores = useRef<(THREE.Mesh | null)[]>([]);
  const flameShellA = useRef<(THREE.Mesh | null)[]>([]);
  const flameShellB = useRef<(THREE.Mesh | null)[]>([]);
  const flameRingA = useRef<(THREE.Mesh | null)[]>([]);
  const flameRingB = useRef<(THREE.Mesh | null)[]>([]);
  const flameTongues = useRef<(THREE.Mesh | null)[][]>([]);
  const flameEmbers = useRef<(THREE.Mesh | null)[][]>([]);
  const flameTrails = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((state) => {
    const list = projsRef.current;
    const time = state.clock.elapsedTime;
    let flameSlot = 0;

    for (let i = 0; i < PROJ_POOL; i++) {
      const m = meshes.current[i];
      const h = halos.current[i];
      const tr = trails.current[i];
      const p = list[i];
      const flame = isFireballProj(p);
      const show = !!p && !flame;

      // ── normal mermiler (ateş topu hariç) ──
      if (m) {
        m.visible = show;
        if (show && p) {
          m.position.set(p.x / S, 0.85, p.y / S);
          (m.material as THREE.MeshStandardMaterial).color.set(
            p.owner === "player" ? "#38bdf8" : "#fb7185",
          );
          (m.material as THREE.MeshStandardMaterial).emissive.set(
            p.owner === "player" ? "#0ea5e9" : "#f43f5e",
          );
        }
      }
      if (h) {
        h.visible = show;
        if (show && p) h.position.set(p.x / S, 0.85, p.y / S);
      }
      // glowing energy trail stretched along the flight direction
      if (tr) {
        if (show && p) {
          tr.visible = true;
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const len = Math.min(0.9 * HUD, sp * 0.055 * HUD);
          tr.position.set(
            (p.x - (p.vx / sp) * len * 0.55) / S,
            0.85,
            (p.y - (p.vy / sp) * len * 0.55) / S,
          );
          tr.scale.set(len, 0.06 * HUD, 0.06 * HUD);
          tr.rotation.y = Math.atan2(p.vy, p.vx);
          (tr.material as THREE.MeshBasicMaterial).color.set(
            p.owner === "player" ? "#7dd3fc" : "#fda4af",
          );
        } else {
          tr.visible = false;
        }
      }

      // ── Ateş Topu: animasyonlu soğuk alev küresi ──
      if (flame && p) {
        const si = flameSlot++;
        if (si >= FLAME_POOL) continue;
        const root = flameRoots.current[si];
        const spin = flameSpins.current[si];
        const core = flameCores.current[si];
        const shellA = flameShellA.current[si];
        const shellB = flameShellB.current[si];
        const ringA = flameRingA.current[si];
        const ringB = flameRingB.current[si];
        const trailEl = flameTrails.current[si];
        // Rakip ateşi pembe/eflatun, oyuncununki buz mavisi — PvP okunurluğu.
        const isEnemy = p.owner === "bot";
        const tongueColors = isEnemy
          ? [COLD_FLAME.enemyA, COLD_FLAME.enemyB]
          : [COLD_FLAME.wispA, COLD_FLAME.wispB];
        const ringColor = isEnemy ? COLD_FLAME.enemyB : COLD_FLAME.ring;

        if (root) {
          root.visible = true;
          root.position.set(p.x / S, 0.85, p.y / S);
        }
        if (spin) spin.rotation.y = time * 1.5 + i * 1.3;

        // buzlu çekirdek — nabız gibi büyüyüp küçülür, parlaklığı titrer
        if (core) {
          core.scale.setScalar(1 + 0.16 * Math.sin(time * 12 + i * 1.7));
          (core.material as THREE.MeshStandardMaterial).emissiveIntensity =
            2.6 + 0.9 * Math.sin(time * 10 + i);
        }
        // iki katmanlı soğuk ışıma
        if (shellA) {
          shellA.scale.setScalar(1 + 0.2 * Math.sin(time * 8 + i));
          const mat = shellA.material as THREE.MeshBasicMaterial;
          mat.color.set(isEnemy ? COLD_FLAME.enemyA : COLD_FLAME.wispA);
          mat.opacity = 0.26 + 0.12 * Math.sin(time * 9 + i * 2);
        }
        if (shellB) {
          shellB.scale.setScalar(1 + 0.12 * Math.sin(time * 5.5 + i * 0.7));
          const mat = shellB.material as THREE.MeshBasicMaterial;
          mat.color.set(COLD_FLAME.wispB);
          mat.opacity = 0.14 + 0.07 * Math.sin(time * 6 + i);
        }
        // antik büyü halkaları — farklı eksenlerde döner
        if (ringA) {
          ringA.rotation.x = Math.PI / 2 + 0.45 * Math.sin(time * 1.4 + i);
          ringA.rotation.z = time * 2.3;
          (ringA.material as THREE.MeshBasicMaterial).color.set(ringColor);
        }
        if (ringB) {
          ringB.rotation.x = time * -1.9;
          ringB.rotation.y = Math.PI / 3 + 0.5 * Math.cos(time * 1.1 + i);
          (ringB.material as THREE.MeshBasicMaterial).color.set(COLD_FLAME.wispB);
        }
        // titreyen alev dilleri
        const tongues = flameTongues.current[si];
        if (tongues) {
          for (let k = 0; k < TONGUES; k++) {
            const t = tongues[k];
            if (!t) continue;
            const ph = time * 9 + k * 1.9 + i;
            t.scale.set(
              0.9 + 0.2 * Math.sin(ph * 1.3),
              0.78 + 0.55 * Math.sin(ph),
              0.9 + 0.2 * Math.cos(ph),
            );
            t.position.y = 0.05 * HUD + 0.03 * HUD * Math.sin(ph * 0.9);
            t.rotation.z = 0.3 * Math.sin(ph * 0.6 + k);
            t.rotation.x = 0.2 * Math.cos(ph * 0.5 + k);
            (t.material as THREE.MeshBasicMaterial).color.set(tongueColors[k % 2]);
          }
        }
        // yükselip sönen buz kırıntıları
        const embers = flameEmbers.current[si];
        if (embers) {
          for (let k = 0; k < EMBERS; k++) {
            const em = embers[k];
            if (!em) continue;
            const kk = (time * 0.5 + k * 0.33 + i * 0.2) % 1;
            const ang = k * 2.1 + time * 1.6;
            const rad = 0.08 * HUD + kk * 0.24 * HUD;
            em.position.set(
              Math.cos(ang) * rad,
              kk * 0.68 * HUD,
              Math.sin(ang) * rad,
            );
            em.scale.setScalar(0.035 * HUD * (1 - kk * 0.45));
            const mat = em.material as THREE.MeshBasicMaterial;
            mat.color.set(k % 2 === 0 ? COLD_FLAME.core : COLD_FLAME.wispA);
            mat.opacity = (1 - kk) * 0.9;
          }
        }
        // uçuş izi (dönmeyen kökte, gerçek yönle hizalı)
        if (trailEl) {
          trailEl.visible = true;
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const len = Math.min(1.05 * HUD, sp * 0.06 * HUD);
          const dx = p.vx / sp;
          const dz = p.vy / sp;
          trailEl.position.set(-dx * len * 0.55, 0, -dz * len * 0.55);
          trailEl.scale.set(len, 0.07 * HUD, 0.07 * HUD);
          // Ry(θ) +X → (cosθ, 0, −sinθ); yön (dx,0,dz) için θ = atan2(−dz,dx).
          trailEl.rotation.y = Math.atan2(-dz, dx);
          (trailEl.material as THREE.MeshBasicMaterial).color.set(
            isEnemy ? COLD_FLAME.enemyB : COLD_FLAME.wispB,
          );
        }
      }
    }

    for (let i = flameSlot; i < FLAME_POOL; i++) {
      const root = flameRoots.current[i];
      if (root) root.visible = false;
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
            <sphereGeometry args={[0.15 * HUD, 12, 12]} />
            <meshStandardMaterial emissive="#0ea5e9" emissiveIntensity={2.2} />
          </mesh>
          <mesh
            ref={(el) => {
              halos.current[i] = el;
            }}
            visible={false}
          >
            <sphereGeometry args={[0.28 * HUD, 10, 10]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.25} />
          </mesh>
          <mesh
            ref={(el) => {
              trails.current[i] = el;
            }}
            visible={false}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial transparent opacity={0.75} />
          </mesh>
        </group>
      ))}

      {/* Ateş Topu — antik büyüyle harmanlanmış soğuk alev küresi */}
      {Array.from({ length: FLAME_POOL }).map((_, i) => (
        <group
          key={`flame-${i}`}
          visible={false}
          ref={(el) => {
            flameRoots.current[i] = el;
          }}
        >
          {/* uçuş izi — dönmeyen kökte kalır */}
          <mesh
            ref={(el) => {
              flameTrails.current[i] = el;
            }}
            visible={false}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial
              color={COLD_FLAME.wispB}
              transparent
              opacity={0.6}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {/* dönen alev kümesi */}
          <group
            ref={(el) => {
              flameSpins.current[i] = el;
            }}
          >
            {/* buzlu çekirdek */}
            <mesh
              ref={(el) => {
                flameCores.current[i] = el;
              }}
            >
              <sphereGeometry args={[0.13 * HUD, 16, 16]} />
              <meshStandardMaterial
                color={COLD_FLAME.core}
                emissive="#a78bfa"
                emissiveIntensity={2.6}
                roughness={0.25}
              />
            </mesh>
            {/* iç ışıma */}
            <mesh
              ref={(el) => {
                flameShellA.current[i] = el;
              }}
            >
              <sphereGeometry args={[0.22 * HUD, 14, 14]} />
              <meshBasicMaterial
                color={COLD_FLAME.wispA}
                transparent
                opacity={0.28}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            {/* dış ruhani ışıma */}
            <mesh
              ref={(el) => {
                flameShellB.current[i] = el;
              }}
            >
              <sphereGeometry args={[0.34 * HUD, 12, 12]} />
              <meshBasicMaterial
                color={COLD_FLAME.wispB}
                transparent
                opacity={0.16}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            {/* antik büyü halkaları */}
            <mesh
              ref={(el) => {
                flameRingA.current[i] = el;
              }}
            >
              <torusGeometry args={[0.27 * HUD, 0.012 * HUD, 6, 32]} />
              <meshBasicMaterial
                color={COLD_FLAME.ring}
                transparent
                opacity={0.75}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            <mesh
              ref={(el) => {
                flameRingB.current[i] = el;
              }}
            >
              <torusGeometry args={[0.21 * HUD, 0.01 * HUD, 6, 28]} />
              <meshBasicMaterial
                color={COLD_FLAME.wispB}
                transparent
                opacity={0.6}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            {/* titreyen alev dilleri */}
            {Array.from({ length: TONGUES }).map((_, k) => {
              const a = (k / TONGUES) * Math.PI * 2;
              return (
                <mesh
                  key={`t-${k}`}
                  position={[
                    Math.cos(a) * 0.09 * HUD,
                    0.05 * HUD,
                    Math.sin(a) * 0.09 * HUD,
                  ]}
                  rotation={[0, 0, Math.cos(a) * 0.3]}
                  ref={(el) => {
                    if (!flameTongues.current[i]) flameTongues.current[i] = [];
                    flameTongues.current[i][k] = el;
                  }}
                >
                  <coneGeometry args={[0.075 * HUD, 0.34 * HUD, 8]} />
                  <meshBasicMaterial
                    color={k % 2 === 0 ? COLD_FLAME.wispA : COLD_FLAME.wispB}
                    transparent
                    opacity={0.72}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                  />
                </mesh>
              );
            })}
            {/* yükselen buz kırıntıları */}
            {Array.from({ length: EMBERS }).map((_, k) => (
              <mesh
                key={`e-${k}`}
                ref={(el) => {
                  if (!flameEmbers.current[i]) flameEmbers.current[i] = [];
                  flameEmbers.current[i][k] = el;
                }}
              >
                <octahedronGeometry args={[0.035 * HUD, 0]} />
                <meshBasicMaterial
                  color={COLD_FLAME.core}
                  transparent
                  opacity={0.9}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            ))}
          </group>
        </group>
      ))}
    </group>
  );
}
