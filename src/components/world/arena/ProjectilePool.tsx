// ⚔️ Mermi havuzu.
//
// İki görünüm:
//   1) "Güçlü Vuruş" ana mermisi (varsayılan yetenek, her iki taraf da bunu
//      kullanır) → fiziksel ateş yerine antik büyüyle harmanlanmış soğuk /
//      ruhani bir alev oku:
//        · nabız gibi atan buzlu çekirdek + iki katman yumuşak ışıma,
//            · çevresinde dönen büyü halkaları (gyroscope),
//        · gövdeye yapışık, sürekli yalayan 3 alev dili,
//        · hız yönüne savrulan uzun alev kuyruğu,
//        · arkada uzayan iki kademeli kuyruklu yıldız izi,
//        · zemine vuran soğuk ışık lekesi,
//        · namludan çıkış anında genişleyip sönen bir ateşleme şimşeği.
//      Oyuncu buz mavisi, düşman eflatun tonundadır (kim kime atıyor belli kalsın).
//   2) Ateş Topu (süper, `explodeR`) → antik büyü halkaları ve alev dilleriyle
//      dönen, buzlu, animasyonlu soğuk alev küresi.
//
// Havuzlar ayrıdır: bir görünümü değiştirmek diğerini etkilemez.
import { useFrame } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useRef } from "react";
import * as THREE from "three";
import {
  BOLT_VFX,
  COLD_FLAME,
  HUD,
  isFireballProj,
  MUZZLE,
  PROJ_POOL,
  S,
  type BattleProj,
} from "./shared";
import { FIREBALL_RANGE_PX, MAX_RANGE_PX, rangeFade } from "./skillshot";

/** Aynı anda ekranda çizilecek en fazla ateş topu (süper). */
const FLAME_POOL = 4;
/** Ateş küresi başına alev dili sayısı. */
const TONGUES = 5;
/** Ateş küresi başına yükselen buz kırıntısı sayısı. */
const EMBERS = 3;
/** Ana mermi gövdesine yapışık yalayan alev dili sayısı. */
const BOLT_TONGUES = 3;
/** Namlu şimşeği yalnızca ilk slotlarda çizilir (aynı anda birkaç atış olur). */
const MUZZLE_POOL = 8;

/* Uçuş yönü hesaplarında kullanılan geçici nesneler (kare başına ayırma yok). */
const UP = new THREE.Vector3(0, 1, 0);
const dirVec = new THREE.Vector3();
const dirQuat = new THREE.Quaternion();

export function ProjectilePool({
  projsRef,
}: {
  projsRef: MutableRefObject<BattleProj[]>;
}) {
  // ── ana mermi (soğuk alev oku) ──
  const boltRoots = useRef<(THREE.Group | null)[]>([]); // konum + görünürlük
  const boltSpins = useRef<(THREE.Group | null)[]>([]); // dönen alev kümesi
  const boltCores = useRef<(THREE.Mesh | null)[]>([]);
  const boltGlows = useRef<(THREE.Mesh | null)[]>([]);
  const boltHalos = useRef<(THREE.Mesh | null)[]>([]);
  const boltRingA = useRef<(THREE.Mesh | null)[]>([]);
  const boltRingB = useRef<(THREE.Mesh | null)[]>([]);
  const boltTails = useRef<(THREE.Mesh | null)[]>([]);
  const boltNearTrails = useRef<(THREE.Mesh | null)[]>([]);
  const boltFarTrails = useRef<(THREE.Mesh | null)[]>([]);
  const boltTongues = useRef<(THREE.Mesh | null)[][]>([]);
  const boltGrounds = useRef<(THREE.Mesh | null)[]>([]);
  // ── namlu şimşeği (mermi ilk çıktığı an) ──
  const muzzleFlashes = useRef<(THREE.Mesh | null)[]>([]);
  const muzzleRings = useRef<(THREE.Mesh | null)[]>([]);

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
    let boltSlot = 0;

    for (let i = 0; i < PROJ_POOL; i++) {
      const p = list[i];
      const flame = isFireballProj(p); // süper: Ateş Topu
      const normal = !!p && !flame;
      const pal = p
        ? COLD_FLAME.bolt[p.owner === "player" ? "player" : "enemy"]
        : null;

      // ── namlu şimşeği: mermi yeni çıktıysa ateşlendiği noktada bir an ──
      if (i < MUZZLE_POOL) {
        const mf = muzzleFlashes.current[i];
        const mr = muzzleRings.current[i];
        const showMuzzle = normal && p && p.travelled < BOLT_VFX.muzzlePx;
        if (showMuzzle && p && pal) {
          const k = 1 - p.travelled / BOLT_VFX.muzzlePx; // 1 → 0
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const ox = (p.x - (p.vx / sp) * p.travelled) / S;
          const oz = (p.y - (p.vy / sp) * p.travelled) / S;
          if (mf) {
            mf.visible = true;
            // Namlu şimşeği merminin EL yüksekliğinde parlar (elden atış).
            mf.position.set(ox, MUZZLE.up, oz);
            const sc = (0.05 + 0.1 * (1 - k)) * HUD;
            mf.scale.setScalar(sc);
            const mat = mf.material as THREE.MeshBasicMaterial;
            mat.color.set(pal.halo);
            mat.opacity = k * 0.9;
          }
          if (mr) {
            mr.visible = true;
            mr.position.set(ox, MUZZLE.up - 0.1, oz);
            mr.scale.setScalar((0.055 + 0.16 * (1 - k)) * HUD);
            const mat = mr.material as THREE.MeshBasicMaterial;
            mat.color.set(pal.ring);
            mat.opacity = k * 0.7;
          }
        } else {
          if (mf && mf.visible) mf.visible = false;
          if (mr && mr.visible) mr.visible = false;
        }
      }

      // ── ana mermi gövdesi ──
      const root = boltRoots.current[boltSlot];
      if (normal && p && pal && root) {
        const si = boltSlot++;
        const spin = boltSpins.current[si];
        const core = boltCores.current[si];
        const glow = boltGlows.current[si];
        const halo = boltHalos.current[si];
        const ringA = boltRingA.current[si];
        const ringB = boltRingB.current[si];
        const tail = boltTails.current[si];
        const near = boltNearTrails.current[si];
        const far = boltFarTrails.current[si];
        const ground = boltGrounds.current[si];
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const dx = p.vx / sp;
        const dz = p.vy / sp;

        // Menzil sınırında sönme: mermi MAX_RANGE sonuna yaklaşınca küçülüp
        // kaybolur ("menzil sonunda sönüp yok olsun").
        const boltFade = rangeFade(
          p.travelled,
          p.explodeR ? FIREBALL_RANGE_PX : MAX_RANGE_PX,
        );
        root.visible = boltFade > 0.04;
        root.scale.setScalar(boltFade);
        root.position.set(p.x / S, MUZZLE.up, p.y / S);

        // Dönen alev kümesi: nabız gibi atan çekirdek + iki ışıma + halkalar +
        // yalayan alev dilleri.
        if (spin) {
          spin.rotation.y = time * 2.4 + i * 1.1;
          spin.rotation.z = 0.18 * Math.sin(time * 3.1 + i);
        }
        if (core) {
          core.scale.setScalar(1 + 0.16 * Math.sin(time * 17 + i * 2.1));
          const mat = core.material as THREE.MeshStandardMaterial;
          mat.color.set(pal.core);
          mat.emissive.set(pal.emissive);
          mat.emissiveIntensity = 3.2 + 1.2 * Math.sin(time * 14 + i);
        }
        if (glow) {
          glow.scale.setScalar(1 + 0.24 * Math.sin(time * 9 + i * 1.4));
          const mat = glow.material as THREE.MeshBasicMaterial;
          mat.color.set(pal.glow);
          mat.opacity = 0.42 + 0.16 * Math.sin(time * 11 + i);
        }
        if (halo) {
          halo.scale.setScalar(1 + 0.16 * Math.sin(time * 6 + i * 0.8));
          const mat = halo.material as THREE.MeshBasicMaterial;
          mat.color.set(pal.halo);
          mat.opacity = 0.16 + 0.08 * Math.sin(time * 7 + i * 0.6);
        }
        if (ringA) {
          ringA.rotation.x = Math.PI / 2 + 0.6 * Math.sin(time * 2.1 + i);
          ringA.rotation.y = time * 3.1;
          ringA.scale.setScalar(1 + 0.1 * Math.sin(time * 10 + i));
          const mat = ringA.material as THREE.MeshBasicMaterial;
          mat.color.set(pal.ring);
          mat.opacity = 0.55 + 0.3 * Math.sin(time * 12 + i * 2);
        }
        if (ringB) {
          ringB.rotation.x = time * -2.6;
          ringB.rotation.y = Math.PI / 3 + 0.6 * Math.cos(time * 1.7 + i);
          const mat = ringB.material as THREE.MeshBasicMaterial;
          mat.color.set(pal.wisp);
          mat.opacity = 0.4 + 0.25 * Math.sin(time * 9 + i * 1.5);
        }
        const tongues = boltTongues.current[si];
        if (tongues) {
          for (let k = 0; k < BOLT_TONGUES; k++) {
            const tg = tongues[k];
            if (!tg) continue;
            const ph = time * 11 + k * 2.1 + i;
            const a = (k / BOLT_TONGUES) * Math.PI * 2 + time * 2.2;
            const rad = (0.036 + 0.008 * Math.sin(ph * 0.8)) * HUD;
            tg.position.set(
              Math.cos(a) * rad,
              0.02 * HUD * Math.sin(ph * 0.9),
              Math.sin(a) * rad,
            );
            tg.rotation.z = -Math.cos(a) * 0.85;
            tg.rotation.x = Math.sin(a) * 0.85;
            const len = 1 + 0.45 * Math.sin(ph);
            tg.scale.set(
              0.85 + 0.18 * Math.cos(ph * 1.3),
              len,
              0.85 + 0.18 * Math.sin(ph),
            );
            const mat = tg.material as THREE.MeshBasicMaterial;
            mat.color.set(k % 2 === 0 ? pal.tail : pal.wisp);
            mat.opacity = 0.5 + 0.3 * Math.sin(ph * 1.1 + k);
          }
        }

        // Alev kuyruğu: uçuş yönünün tersine savrulur, hızla uzar.
        if (tail) {
          dirVec.set(dx, 0, dz);
          dirQuat.setFromUnitVectors(UP, dirVec);
          tail.quaternion.copy(dirQuat);
          const stretch = Math.min(1.55, 0.85 + sp / 1000);
          const sy = stretch * (0.92 + 0.22 * Math.sin(time * 16 + i));
          tail.scale.set(0.9 + 0.15 * Math.sin(time * 21 + i * 3), sy, 0.9);
          const off = (BOLT_VFX.tailLen * HUD * sy) / 2 + 0.05 * HUD;
          tail.position.set(-dirVec.x * off, 0, -dirVec.z * off);
          const mat = tail.material as THREE.MeshBasicMaterial;
          mat.color.set(pal.tail);
          mat.opacity = 0.55 + 0.25 * Math.sin(time * 18 + i * 2);
        }
        // Kuyruklu yıldız izi: biri kalın-parlak (yakın), diğeri ince-solgun (uzak).
        const trailLen = Math.min(BOLT_VFX.streak * HUD, sp * 0.02 * HUD);
        if (near) {
          near.position.set(
            -dx * (0.22 * HUD + trailLen * 0.5),
            0,
            -dz * (0.22 * HUD + trailLen * 0.5),
          );
          near.scale.set(trailLen, 0.025 * HUD, 0.025 * HUD);
          near.rotation.y = Math.atan2(-dz, dx);
          const mat = near.material as THREE.MeshBasicMaterial;
          mat.color.set(pal.trail);
          mat.opacity = 0.5 + 0.2 * Math.sin(time * 15 + i);
        }
        if (far) {
          const farLen = trailLen * 1.55;
          far.position.set(
            -dx * (0.22 * HUD + trailLen + farLen * 0.5),
            0,
            -dz * (0.22 * HUD + trailLen + farLen * 0.5),
          );
          far.scale.set(farLen, 0.014 * HUD, 0.014 * HUD);
          far.rotation.y = Math.atan2(-dz, dx);
          const mat = far.material as THREE.MeshBasicMaterial;
          mat.color.set(pal.wisp);
          mat.opacity = 0.22 + 0.12 * Math.sin(time * 13 + i);
        }
        // Zemindeki soğuk ışık lekesi (arena okunurluğu).
        if (ground) {
          ground.scale.setScalar(1 + 0.12 * Math.sin(time * 8 + i * 1.7));
          const mat = ground.material as THREE.MeshBasicMaterial;
          mat.color.set(pal.ground);
          mat.opacity = 0.3 + 0.12 * Math.sin(time * 8 + i);
        }
      } else if (root) {
        root.visible = false;
      }

      // ── Ateş Topu: animasyonlu soğuk alev küresi ──
      if (flame && p) {
        const si = flameSlot++;
        if (si >= FLAME_POOL) continue;
        const fRoot = flameRoots.current[si];
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

        if (fRoot) {
          const flameFade = rangeFade(
            p.travelled,
            p.explodeR ? FIREBALL_RANGE_PX : MAX_RANGE_PX,
          );
          fRoot.visible = flameFade > 0.04;
          fRoot.scale.setScalar(flameFade);
          fRoot.position.set(p.x / S, MUZZLE.up, p.y / S);
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
          (ringB.material as THREE.MeshBasicMaterial).color.set(
            COLD_FLAME.wispB,
          );
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
            (t.material as THREE.MeshBasicMaterial).color.set(
              tongueColors[k % 2],
            );
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
    for (let i = boltSlot; i < PROJ_POOL; i++) {
      const root = boltRoots.current[i];
      if (root && root.visible) root.visible = false;
    }
  });

  return (
    <group>
      {/* ══ "Güçlü Vuruş" ana mermisi — antik büyülü soğuk alev oku ══ */}
      {Array.from({ length: PROJ_POOL }).map((_, i) => (
        <group
          key={`bolt-${i}`}
          visible={false}
          ref={(el) => {
            boltRoots.current[i] = el;
          }}
        >
          {/* zemindeki soğuk ışık lekesi — mermi el hizasında uçtuğu için
              gölge lekesi de o yükseklikten zemine indirilir */}
          <mesh
            ref={(el) => {
              boltGrounds.current[i] = el;
            }}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.05 - MUZZLE.up, 0]}
            raycast={() => null}
          >
            <circleGeometry args={[BOLT_VFX.ground * HUD, 24]} />
            <meshBasicMaterial
              color={COLD_FLAME.bolt.player.ground}
              transparent
              opacity={0.3}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {/* kuyruklu yıldız izinin uzak (solgun) parçası */}
          <mesh
            ref={(el) => {
              boltFarTrails.current[i] = el;
            }}
            raycast={() => null}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial
              color={COLD_FLAME.bolt.player.wisp}
              transparent
              opacity={0.22}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          {/* kuyruklu yıldız izinin yakın (parlak) parçası */}
          <mesh
            ref={(el) => {
              boltNearTrails.current[i] = el;
            }}
            raycast={() => null}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial
              color={COLD_FLAME.bolt.player.trail}
              transparent
              opacity={0.5}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          {/* hız yönüne savrulan alev kuyruğu */}
          <mesh
            ref={(el) => {
              boltTails.current[i] = el;
            }}
            raycast={() => null}
          >
            <coneGeometry
              args={[BOLT_VFX.tailR * HUD, BOLT_VFX.tailLen * HUD, 12]}
            />
            <meshBasicMaterial
              color={COLD_FLAME.bolt.player.tail}
              transparent
              opacity={0.7}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          <group
            ref={(el) => {
              boltSpins.current[i] = el;
            }}
          >
            {/* dönen büyü halkaları */}
            <mesh
              ref={(el) => {
                boltRingA.current[i] = el;
              }}
              raycast={() => null}
            >
              <torusGeometry args={[0.088 * HUD, 0.006 * HUD, 6, 30]} />
              <meshBasicMaterial
                color={COLD_FLAME.bolt.player.ring}
                transparent
                opacity={0.7}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            <mesh
              ref={(el) => {
                boltRingB.current[i] = el;
              }}
              raycast={() => null}
            >
              <torusGeometry args={[0.062 * HUD, 0.005 * HUD, 6, 26]} />
              <meshBasicMaterial
                color={COLD_FLAME.bolt.player.wisp}
                transparent
                opacity={0.55}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            {/* dış hale (en geniş, en solgun) */}
            <mesh
              ref={(el) => {
                boltHalos.current[i] = el;
              }}
              raycast={() => null}
            >
              <sphereGeometry args={[BOLT_VFX.halo * HUD, 12, 12]} />
              <meshBasicMaterial
                color={COLD_FLAME.bolt.player.halo}
                transparent
                opacity={0.18}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            {/* iç ışıma */}
            <mesh
              ref={(el) => {
                boltGlows.current[i] = el;
              }}
              raycast={() => null}
            >
              <sphereGeometry args={[BOLT_VFX.glow * HUD, 14, 14]} />
              <meshBasicMaterial
                color={COLD_FLAME.bolt.player.glow}
                transparent
                opacity={0.45}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            {/* buzlu çekirdek */}
            <mesh
              ref={(el) => {
                boltCores.current[i] = el;
              }}
              raycast={() => null}
            >
              <sphereGeometry args={[BOLT_VFX.core * HUD, 16, 16]} />
              <meshStandardMaterial
                color={COLD_FLAME.bolt.player.core}
                emissive={COLD_FLAME.bolt.player.emissive}
                emissiveIntensity={3}
                roughness={0.2}
                toneMapped={false}
              />
            </mesh>
            {/* gövdeye yapışık, yalayan alev dilleri */}
            {Array.from({ length: BOLT_TONGUES }).map((_, k) => (
              <mesh
                key={`bt-${k}`}
                raycast={() => null}
                ref={(el) => {
                  if (!boltTongues.current[i]) boltTongues.current[i] = [];
                  boltTongues.current[i][k] = el;
                }}
              >
                <coneGeometry args={[0.028 * HUD, 0.11 * HUD, 8]} />
                <meshBasicMaterial
                  color={
                    k % 2 === 0
                      ? COLD_FLAME.bolt.player.tail
                      : COLD_FLAME.bolt.player.wisp
                  }
                  transparent
                  opacity={0.6}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            ))}
          </group>
        </group>
      ))}

      {/* ══ namlu şimşeği: merminin ateşlendiği noktada genişleyen halka ══ */}
      {Array.from({ length: MUZZLE_POOL }).map((_, i) => (
        <group key={`muzzle-${i}`}>
          <mesh
            ref={(el) => {
              muzzleRings.current[i] = el;
            }}
            visible={false}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => null}
          >
            <torusGeometry args={[1, 0.06, 6, 32]} />
            <meshBasicMaterial
              color={COLD_FLAME.bolt.player.ring}
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          <mesh
            ref={(el) => {
              muzzleFlashes.current[i] = el;
            }}
            visible={false}
            raycast={() => null}
          >
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial
              color={COLD_FLAME.bolt.player.halo}
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}

      {/* ══ Ateş Topu — antik büyüyle harmanlanmış soğuk alev küresi ══ */}
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
