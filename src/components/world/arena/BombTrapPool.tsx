// 🧨 BombTrapPool — yere bırakılan bomba tuzaklarının 3B katmanı.
//
// KURAL katmanı `arena/bombKit` içindedir (fitil, tetik yarıçapı, ömür);
// burada yalnızca GÖRSEL vardır ve liste her kare ref'ten okunur — React
// state'i kullanılmaz, yani tuzak bırakmak/patlamak hiçbir yeniden çizim
// yapmaz (projeksiyon/efekt havuzlarıyla aynı desen).
//
// Bir tuzak ne anlatmalı:
//   · YERDE DURAN BOMBA — koyu demir gövde + pirinç bilezik (eldeki bombayla
//     aynı dil, "bu benim bombam" okunsun), tepe sinde yanan fitil ucu.
//   · FİTİL — uç, fitil yandıkça HIZLANAN bir nabızla parlar; tuzak
//     kurulduğunda (fuse = 0) nabız sabitlenir ve renk kırmızıya kayar.
//   · KURULMA HALKASI — zeminde büyüyen bir halka fitilin ilerlemesini
//     gösterir (0 → tam yarıçap). Oyuncu "ne zaman hazır olacak" okur.
//   · TEHLİKE DİSKİ — yalnız tuzak KURULUYKEN görünen soluk sıcak disk;
//     gerçek TETİK yarıçapına eşittir (`BOMB_TRAP_TRIGGER_PX`), yani düşmanın
//     hangi mesafede patlatacağını dürüstçe gösterir.
//
// Slotlar önceden kurulur ve konum dışında hiçbir şey yeniden yaratılmaz
// (mobilde kare başına ayırma yok).
//
// LİSTE NEREDEN: sahne kendi tuzak listesini `bombTrapState`e bağlar
// (bkz. `bombKit.bindBombTraps`) — bu bileşen prop almaz, her kare paylaşılan
// mutable listeyi okur (`aimState` ile aynı desen).
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { S } from "./shared";
import {
  BOMB_TRAP_ARM_S,
  BOMB_TRAP_TRIGGER_PX,
  bombTrapState,
} from "./bombKit";

/** Aynı anda çizilecek en fazla tuzak (iki taraf toplamı). */
const TRAP_SLOTS = 6;

/** Demir gövde / pirinç bilezik — eldeki bombayla aynı palet. */
const IRON = "#2b2f38";
const BRASS = "#c9952f";
/** Fitil ucu: yanarken amber, kurulduğunda kırmızı (tehlike). */
const SPARK_ARMING = "#ffb347";
const SPARK_ARMED = "#ff4d2d";
/** Kurulma halkası ve tehlike diski. */
const RING = "#ffa53d";
const DANGER = "#ff5a1f";

/** Tetik yarıçapının dünya karşılığı (disk gerçek menzili göstersin). */
const TRIGGER_UNITS = BOMB_TRAP_TRIGGER_PX / S;

export function BombTrapPool() {
  const roots = useRef<(THREE.Group | null)[]>([]);
  const sparks = useRef<(THREE.Mesh | null)[]>([]);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const discs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((state) => {
    const traps = bombTrapState.traps;
    const time = state.clock.elapsedTime;

    for (let i = 0; i < TRAP_SLOTS; i++) {
      const root = roots.current[i];
      if (!root) continue;
      const trap = traps[i];
      if (!trap) {
        if (root.visible) root.visible = false;
        continue;
      }
      root.visible = true;
      // Sim px → dünya: x/S yatay, y/S derinlik (arena ile aynı eşleme).
      root.position.set(trap.x / S, 0, trap.y / S);

      // Fitil ilerlemesi (0 → tam kurulmuş) ve nabız.
      const armed = trap.fuse <= 0;
      const k = armed ? 1 : 1 - trap.fuse / BOMB_TRAP_ARM_S;
      // Yanarken nabız fitil kısaldıkça HIZLANIR (gerilim); kurulunca sabit.
      const pulse = armed
        ? 0.55 + 0.45 * Math.sin(time * 8)
        : 0.25 + 0.75 * Math.abs(Math.sin(time * (3 + 12 * k)));

      const spark = sparks.current[i];
      if (spark) {
        spark.scale.setScalar(0.7 + 0.6 * pulse);
        const mat = spark.material as THREE.MeshBasicMaterial;
        mat.color.set(armed ? SPARK_ARMED : SPARK_ARMING);
        mat.opacity = 0.55 + 0.45 * pulse;
      }

      const ring = rings.current[i];
      if (ring) {
        // Kurulma halkası: fitil boyunca büyür, kurulunca sabit kalır.
        const scale = Math.max(0.12, k);
        ring.scale.setScalar(scale);
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.color.set(armed ? SPARK_ARMED : RING);
        mat.opacity = armed ? 0.35 + 0.25 * pulse : 0.25 + 0.5 * k;
      }

      const disc = discs.current[i];
      if (disc) {
        // Tehlike diski yalnızca KURULU tuzakta görünür ve yavaşça nabız atar.
        disc.visible = armed;
        if (armed) {
          const s = 1 + 0.06 * Math.sin(time * 3 + i);
          disc.scale.setScalar(s);
          (disc.material as THREE.MeshBasicMaterial).opacity =
            0.08 + 0.05 * pulse;
        }
      }
    }
  });

  return (
    <group>
      {Array.from({ length: TRAP_SLOTS }).map((_, i) => (
        <group
          key={`trap-${i}`}
          visible={false}
          ref={(el) => {
            roots.current[i] = el;
          }}
        >
          {/* tehlike diski: gerçek tetik yarıçapı (yalnız kuruluyken) */}
          <mesh
            ref={(el) => {
              discs.current[i] = el;
            }}
            visible={false}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.035, 0]}
            raycast={() => null}
          >
            <circleGeometry args={[TRIGGER_UNITS, 30]} />
            <meshBasicMaterial
              color={DANGER}
              transparent
              opacity={0.1}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {/* kurulma halkası: fitil ilerlemesi */}
          <mesh
            ref={(el) => {
              rings.current[i] = el;
            }}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.045, 0]}
            raycast={() => null}
          >
            <ringGeometry args={[0.44, 0.52, 30]} />
            <meshBasicMaterial
              color={RING}
              transparent
              opacity={0.4}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* gövde: hafif yere gömülü demir küre */}
          <mesh position={[0, 0.17, 0]} raycast={() => null}>
            <sphereGeometry args={[0.2, 16, 12]} />
            <meshStandardMaterial
              color={IRON}
              metalness={0.72}
              roughness={0.35}
              emissive="#12161c"
              emissiveIntensity={0.3}
            />
          </mesh>
          {/* pirinç bilezik */}
          <mesh
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0.17, 0]}
            raycast={() => null}
          >
            <torusGeometry args={[0.2, 0.028, 6, 22]} />
            <meshStandardMaterial
              color={BRASS}
              metalness={0.85}
              roughness={0.28}
              emissive="#6d4c0d"
              emissiveIntensity={0.3}
            />
          </mesh>
          {/* fitil ucu — tuzak kurulunca kırmızıya kayar */}
          <mesh
            ref={(el) => {
              sparks.current[i] = el;
            }}
            position={[0, 0.44, 0]}
            raycast={() => null}
          >
            <sphereGeometry args={[0.07, 10, 8]} />
            <meshBasicMaterial
              color={SPARK_ARMING}
              transparent
              opacity={0.9}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
