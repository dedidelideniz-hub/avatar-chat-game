// 🧨 BombTrapPool — yere bırakılan bomba tuzaklarının 3B katmanı.
//
// KURAL katmanı `arena/bombKit` içindedir (fitil, tetik yarıçapı, ömür);
// burada yalnızca GÖRSEL vardır ve liste her kare ref'ten okunur — React
// state'i kullanılmaz, yani tuzak bırakmak/patlamak hiçbir yeniden çizim
// yapmaz (projeksiyon/efekt havuzlarıyla aynı desen).
//
// Bir tuzak ne anlatmalı:
//   · YERDE DURAN BOMBA — samurayın ELİNDEKİ ve HAVADA UÇAN modelin BİREBİR
//     aynısı (`engine/BombModel`): gövde küre merkezi zemine oturur, fünye
//     yukarı bakar. Oyuncunun okuması gereken şey "bu benim bombam, buraya
//     bıraktım" — bu yüzden ayrı bir prosedürel küre ÇİZİLMEZ.
//   · FİTİL — alev modele canlı olarak kurulur (titrer, kor parçacıkları
//     saçar); fitil yandıkça alev amberden KIRMIZIYA kayar (`setAlert`) ve
//     kurulduğunda (fuse = 0) tam tehlike tonunda sabitlenir.
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
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  createBombInstance,
  subscribeBombSource,
  type BombInstance,
} from "@/engine/BombModel";
import { BOMB_TARGET_WORLD_SPAN } from "@/engine/HandGrip";
import { S } from "./shared";
import {
  BOMB_TRAP_ARM_S,
  BOMB_TRAP_TRIGGER_PX,
  bombTrapState,
} from "./bombKit";

/** Aynı anda çizilecek en fazla tuzak (iki taraf toplamı). */
const TRAP_SLOTS = 6;

/** Gövde küresinin yarıçapı — tuzak tam bu kadar yukarıda durur (zemine oturur). */
const BOMB_REST_Y = BOMB_TARGET_WORLD_SPAN / 2;
/** Kurulma halkası ve tehlike diski. */
const RING = "#ffa53d";
const DANGER = "#ff5a1f";

/** Tetik yarıçapının dünya karşılığı (disk gerçek menzili göstersin). */
const TRIGGER_UNITS = BOMB_TRAP_TRIGGER_PX / S;

export function BombTrapPool() {
  const roots = useRef<(THREE.Group | null)[]>([]);
  const bodies = useRef<(THREE.Group | null)[]>([]);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const discs = useRef<(THREE.Mesh | null)[]>([]);
  /** Slotlara takılı bomba örnekleri (alevleri her kare ilerler). */
  const bodies2Instances = useRef<BombInstance[]>([]);
  // GLB arka planda gelince örnekler yeniden kurulur (yapısal → GLB geçişi).
  const [bombModelReady, setBombModelReady] = useState(0);

  // `load: false` — yüklemeyi samurayın kendi katmanı başlatır (bkz. havuzların
  // ortak kuralı: `engine/BombModel` → `subscribeBombSource`).
  useEffect(
    () => subscribeBombSource(() => setBombModelReady((n) => n + 1), { load: false }),
    [],
  );

  // 🧨 Tuzak da samurayın SİLAHIDIR: yerde duran cisim eldeki/havadaki modelin
  // birebir aynısıdır (`engine/BombModel`). Fünye alevi NOKTA IŞIĞI OLMADAN
  // kurulur: tuzak doğunca/patlayınca görünür ışık sayısı değişir ve three.js
  // arenadaki TÜM malzemeleri yeniden derlerdi (yetenek kullanımındaki donma).
  // Okunurluğu additif alev/hâle katmanları, kurulma halkası ve tehlike diski
  // taşır; alev bloom eşiğini geçtiği için karanlık zeminde de parlar.
  useEffect(() => {
    const mounted: BombInstance[] = [];
    for (const body of bodies.current) {
      if (!body) continue;
      const instance = createBombInstance({ flame: true, flameLight: false });
      body.add(instance.root);
      instance.root.position.y = BOMB_REST_Y;
      mounted.push(instance);
    }
    bodies2Instances.current = mounted;
    return () => {
      bodies2Instances.current = [];
      for (const instance of mounted) instance.dispose();
    };
  }, [bombModelReady]);

  useFrame((state, dt) => {
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

      const spark = bodies2Instances.current[i];
      if (spark) {
        // 🔥 Fünye alevi modelin ÜSTÜNDE canlıdır: fitil kısaldıkça alev
        // amberden kırmızıya kayar, büyür ve kor parçacıkları saçar — "bu şey
        // patlamak üzere" okuması tek bir renk/mesh eklemeden gelir.
        spark.update(dt);
        spark.flame?.setAlert(armed ? 1 : k * 0.85);
        spark.flame?.group.scale.setScalar(0.62 + 0.38 * k + 0.05 * pulse);
      }

      const ring = rings.current[i];
      if (ring) {
        // Kurulma halkası: fitil boyunca büyür, kurulunca sabit kalır.
        const scale = Math.max(0.12, k);
        ring.scale.setScalar(scale);
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.color.set(armed ? DANGER : RING);
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

          {/* 🧨 ELDEKİ MODELİN AYNISI — samurayın bombası. Örnek imperatif
              takılır (bkz. yukarıdaki etki); konum yalnız dikeyde kayar:
              gövde küresinin merkezi zeminden bir yarıçap yukarıda durur. */}
          <group
            ref={(el) => {
              bodies.current[i] = el;
            }}
          />
        </group>
      ))}
    </group>
  );
}
