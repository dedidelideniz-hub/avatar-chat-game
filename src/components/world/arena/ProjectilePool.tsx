// ⚔️ Mermi havuzu — normal enerji küreleri + Ateş Topu'nun animasyonlu
// soğuk alev küresi.
//
// Normal mermiler eskisi gibi: parlayan orb + yumuşak hale + uçuş izi.
// Ateş Topu (`explodeR` taşıyan mermi) ise fiziksel ateş yerine antik
// büyüyle harmanlanmış, kendi ekseninde dönen, alev dilleri titreyen
// ruhani / soğuk bir alev küresi olarak çizilir.
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
/** Alev küresi başına titreyen alev dili sayısı. */
const TONGUES = 3;

export function ProjectilePool({
  projsRef,
}: {
  projsRef: MutableRefObject<BattleProj[]>;
}) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const halos = useRef<(THREE.Mesh | null)[]>([]);
  const trails = useRef<(THREE.Mesh | null)[]>([]);

  // Ateş Topu (soğuk alev) havuzu.
  const flameGroups = useRef<(THREE.Group | null)[]>([]);
  const flameCores = useRef<(THREE.Mesh | null)[]>([]);
  const flameAuras = useRef<(THREE.Mesh | null)[]>([]);
  const flameTongues = useRef<(THREE.Mesh | null)[][]>([]);
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
        const group = flameGroups.current[si];
        const core = flameCores.current[si];
        const aura = flameAuras.current[si];
        const trailEl = flameTrails.current[si];
        // Rakip ateşi pembe/eflatun, oyuncununki buz mavisi — PvP okunurluğu.
        const isEnemy = p.owner === "bot";
        const tongueColors = isEnemy
          ? [COLD_FLAME.enemyA, COLD_FLAME.enemyB]
          : [COLD_FLAME.wispA, COLD_FLAME.wispB];
        const flick = 1 + 0.14 * Math.sin(time * 11 + i * 1.7);

        if (group) {
          group.visible = true;
          group.position.set(p.x / S, 0.85, p.y / S);
          // yavaş dönüş — alev dilleri karakterin etrafında dolanıyor gibi
          group.rotation.y = time * 1.7 + i * 1.3;
        }
        if (core) {
          core.scale.setScalar(flick);
          const cm = core.material as THREE.MeshStandardMaterial;
          cm.emissiveIntensity = 2.3 + 0.7 * Math.sin(time * 9 + i);
        }
        if (aura) {
          aura.scale.setScalar(1 + 0.2 * Math.sin(time * 7 + i));
          const am = aura.material as THREE.MeshBasicMaterial;
          am.color.set(isEnemy ? COLD_FLAME.enemyA : COLD_FLAME.wispA);
          am.opacity = 0.28 + 0.12 * Math.sin(time * 9 + i * 2);
        }
        const tongues = flameTongues.current[si];
        if (tongues) {
          for (let k = 0; k < TONGUES; k++) {
            const t = tongues[k];
            if (!t) continue;
            const ph = time * 9 + k * 2.1 + i;
            t.scale.set(0.9 + 0.18 * Math.sin(ph * 1.3), 0.8 + 0.5 * Math.sin(ph), 0.9);
            t.position.y = 0.05 * HUD + 0.03 * Math.sin(ph * 0.8);
            t.rotation.z = 0.3 * Math.sin(ph * 0.7 + k);
            (t.material as THREE.MeshBasicMaterial).color.set(
              tongueColors[k % 2],
            );
          }
        }
        if (trailEl) {
          trailEl.visible = true;
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const len = Math.min(0.85 * HUD, sp * 0.05 * HUD);
          trailEl.position.set(
            (p.x - (p.vx / sp) * len * 0.6) / S,
            0.85,
            (p.y - (p.vy / sp) * len * 0.6) / S,
          );
          trailEl.scale.set(len, 0.05 * HUD, 0.05 * HUD);
          trailEl.rotation.y = Math.atan2(p.vy, p.vx);
          (trailEl.material as THREE.MeshBasicMaterial).color.set(
            isEnemy ? COLD_FLAME.enemyB : COLD_FLAME.wispB,
          );
        }
      }
    }

    for (let i = flameSlot; i < FLAME_POOL; i++) {
      const group = flameGroups.current[i];
      if (group) group.visible = false;
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
            flameGroups.current[i] = el;
          }}
        >
          {/* buzlu çekirdek */}
          <mesh
            ref={(el) => {
              flameCores.current[i] = el;
            }}
          >
            <sphereGeometry args={[0.12 * HUD, 16, 16]} />
            <meshStandardMaterial
              color={COLD_FLAME.core}
              emissive="#a78bfa"
              emissiveIntensity={2.4}
              roughness={0.25}
            />
          </mesh>
          {/* soğuk ışıma halesi (additive) */}
          <mesh
            ref={(el) => {
              flameAuras.current[i] = el;
            }}
          >
            <sphereGeometry args={[0.24 * HUD, 14, 14]} />
            <meshBasicMaterial
              color={COLD_FLAME.wispA}
              transparent
              opacity={0.32}
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
                position={[Math.cos(a) * 0.085 * HUD, 0.05 * HUD, Math.sin(a) * 0.085 * HUD]}
                rotation={[0, 0, Math.cos(a) * 0.32]}
                ref={(el) => {
                  if (!flameTongues.current[i]) flameTongues.current[i] = [];
                  flameTongues.current[i][k] = el;
                }}
              >
                <coneGeometry args={[0.07 * HUD, 0.28 * HUD, 8]} />
                <meshBasicMaterial
                  color={k % 2 === 0 ? COLD_FLAME.wispA : COLD_FLAME.wispB}
                  transparent
                  opacity={0.7}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            );
          })}
          {/* uçuş izi */}
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
        </group>
      ))}
    </group>
  );
}
