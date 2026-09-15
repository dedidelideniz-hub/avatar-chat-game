// ⚔️ Mermi havuzu.
//
// İki görünüm:
//   1) "Güçlü Vuruş" ana mermisi (varsayılan yetenek, her iki taraf da bunu
//      kullanır) → fiziksel ateş yerine antik büyüyle harmanlanmış soğuk /
//      ruhani bir alev oku: küçük buzlu çekirdek, additive soğuk ışıma ve
//      arkaya savrulan titreyen alev kuyruğu. Oyuncu buz mavisi, düşman
//      eflatun tonundadır (kim kime atıyor belli kalsın).
//   2) Ateş Topu (süper, `explodeR`) → antik büyü halkaları ve alev dilleriyle
//      dönen, buzlu, animasyonlu soğuk alev küresi.
//
// Havuzlar ayrıdır: bir görünümü değiştirmek diğerini etkilemez.
import { useFrame } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useRef } from "react";
import * as THREE from "three";
import { COLD_FLAME, HUD, isFireballProj, PROJ_POOL, S, type BattleProj } from "./shared";

/** Aynı anda ekranda çizilecek en fazla ateş topu (süper). */
const FLAME_POOL = 4;
/** Ateş küresi başına alev dili sayısı. */
const TONGUES = 5;
/** Ateş küresi başına yükselen buz kırıntısı sayısı. */
const EMBERS = 3;

/* Uçuş yönü hesaplarında kullanılan geçici nesneler (kare başına ayırma yok). */
const UP = new THREE.Vector3(0, 1, 0);
const dirVec = new THREE.Vector3();
const dirQuat = new THREE.Quaternion();

export function ProjectilePool({
  projsRef,
}: {
  projsRef: MutableRefObject<BattleProj[]>;
}) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const halos = useRef<(THREE.Mesh | null)[]>([]);
  const boltTails = useRef<(THREE.Mesh | null)[]>([]);
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
      const tail = boltTails.current[i];
      const tr = trails.current[i];
      const p = list[i];
      const flame = isFireballProj(p); // süper: Ateş Topu
      const normal = !!p && !flame;
      const pal = p ? COLD_FLAME.bolt[p.owner === "player" ? "player" : "enemy"] : null;

      // ── çekirdek: küçük, buzlu, titreyen ruhani alev ──
      if (m) {
        if (normal && p && pal) {
          m.visible = true;
          m.position.set(p.x / S, 0.85, p.y / S);
          m.scale.setScalar(0.88 + 0.08 * Math.sin(time * 13 + i * 2.1));
          const mat = m.material as THREE.MeshStandardMaterial;
          mat.color.set(pal.core);
          mat.emissive.set(pal.emissive);
          mat.emissiveIntensity = 2.4 + 0.8 * Math.sin(time * 11 + i);
        } else {
          m.visible = false;
        }
      }

      // ── soğuk ışıma (additive — "ruhani" parlaklık) ──
      if (h) {
        if (normal && p && pal) {
          h.visible = true;
          h.position.set(p.x / S, 0.85, p.y / S);
          h.scale.setScalar(1 + 0.16 * Math.sin(time * 8 + i * 1.4));
          const hm = h.material as THREE.MeshBasicMaterial;
          hm.color.set(pal.glow);
          hm.opacity = 0.3 + 0.14 * Math.sin(time * 9 + i);
        } else {
          h.visible = false;
        }
      }

      // ── alev kuyruğu: hız yönünün tersine savrulur ──
      if (tail) {
        if (normal && p && pal) {
          tail.visible = true;
          const sp = Math.hypot(p.vx, p.vy) || 1;
          dirVec.set(p.vx / sp, 0, p.vy / sp);
          dirQuat.setFromUnitVectors(UP, dirVec);
          tail.quaternion.copy(dirQuat);
          const stretch = Math.min(1.35, 0.7 + sp / 1100);
          const sy = stretch * (0.9 + 0.25 * Math.sin(time * 13 + i));
          tail.scale.set(0.85 + 0.12 * Math.sin(time * 16 + i * 3), sy, 0.85);
          // koni ortadan büyüdüğü için yarı boyu kadar geriye it
          const off = (0.38 * HUD * sy) / 2 + 0.05 * HUD;
          tail.position.set(
            p.x / S - dirVec.x * off,
            0.85,
            p.y / S - dirVec.z * off,
          );
          const tm = tail.material as THREE.MeshBasicMaterial;
          tm.color.set(pal.tail);
          tm.opacity = 0.55 + 0.25 * Math.sin(time * 15 + i * 2);
        } else {
          tail.visible = false;
        }
      }

      // ── uçuş izi ──
      if (tr) {
        if (normal && p && pal) {
          tr.visible = true;
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const len = Math.min(0.9 * HUD, sp * 0.055 * HUD) * 0.72;
          tr.position.set(
            (p.x - (p.vx / sp) * len * 0.55) / S,
            0.85,
            (p.y - (p.vy / sp) * len * 0.55) / S,
          );
          tr.scale.set(len, 0.05 * HUD, 0.05 * HUD);
          tr.rotation.y = Math.atan2(p.vy, p.vx);
          (tr.material as THREE.MeshBasicMaterial).color.set(pal.trail);
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
        const isEnemy = p.owner === "bot";
        const tongueColors = isEnemy
          ? [COLD_FLAME.enemyA, COLD_FLAME.enemyB]
          : [COLD_FLAME.wispA, COLD_FLAME.wispB];

        if (root) {
          root.visible = true;
          root.position.set(p.x / S, 0.85, p.y / S);
        }
        if (spin) spin.rotation.y = time * 1.5 + i * 1.3;

        if (core) {
          core.scale.setScalar(1 + 0.16 * Math.sin(time * 12 + i * 1.7));
          (core.material as THREE.MeshStandardMaterial).emissiveIntensity =
            2.6 + 0.9 * Math.sin(time * 10 + i);
        }
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
        if (ringA) {
          ringA.rotation.x = Math.PI / 2 + 0.45 * Math.sin(time * 1.4 + i);
          ringA.rotation.z = time * 2.3;
          (ringA.material as THREE.MeshBasicMaterial).color.set(
            isEnemy ? COLD_FLAME.enemyB : COLD_FLAME.ring,
          );
        }
        if (ringB) {
          ringB.rotation.x = time * -1.9;
          ringB.rotation.y = Math.PI / 3 + 0.5 * Math.cos(time * 1.1 + i);
          (ringB.material as THREE.MeshBasicMaterial).color.set(COLD_FLAME.wispB);
        }
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
          {/* buzlu ruhani çekirdek */}
          <mesh
            ref={(el) => {
              meshes.current[i] = el;
            }}
          >
            <sphereGeometry args={[0.15 * HUD, 12, 12]} />
            <meshStandardMaterial emissive="#0891b2" emissiveIntensity={2.2} />
          </mesh>
          {/* soğuk ışıma */}
          <mesh
            ref={(el) => {
              halos.current[i] = el;
            }}
            visible={false}
          >
            <sphereGeometry args={[0.22 * HUD, 12, 12]} />
            <meshBasicMaterial
              color="#a5f3fc"
              transparent
              opacity={0.3}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          {/* alev kuyruğu (yön her karede hız vektörüne hizalanır) */}
          <mesh
            ref={(el) => {
              boltTails.current[i] = el;
            }}
            visible={false}
          >
            <coneGeometry args={[0.09 * HUD, 0.38 * HUD, 10]} />
            <meshBasicMaterial
              color="#67e8f9"
              transparent
              opacity={0.7}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          {/* uçuş izi */}
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

          <group
            ref={(el) => {
              flameSpins.current[i] = el;
            }}
          >
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
