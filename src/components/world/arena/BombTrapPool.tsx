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
//   · YERE DEĞME ANI — bomba elden çıkıp yere indiği kare bir "ezilme +
//     toz halkası" ile vurgulanır; bırakma hareketi (bkz. `engine/BombArmPose`
//     → `applyBombActionPose`) böylece havada bitmez, yere OTURUR.
//   · KURULMA HALKASI — zeminde büyüyen bir halka fitilin ilerlemesini
//     gösterir (0 → tam yarıçap). Oyuncu "ne zaman hazır olacak" okur.
//   · KURULDU ANI — halka tam yarıçapa ulaştığı anda kısa bir "pop" halkası
//     dışa açılır: "artık hazır" bilgisi yalnızca rengin değişmesiyle değil,
//     bir OLAY olarak verilir.
//   · UYARI KOLONU — bombadan yükselen ince, additif bir ışık sütunu. Fitil
//     kısaldıkça güçlenir; kalabalık bir savaşta "burada bir tuzak var"
//     bilgisini yerden değil havadan verir (MOBA'daki tehlike telgrafı).
//   · ZEMİN SICAK LEKESİ — bombanın altında nabız atan sıcak disk; patlama
//     anına doğru büyür ve kırmızıya kayar.
//   · KOR PARÇACIKLARI — tuzak çevresinde yükselen küçük korlar; fitilin
//     ilerlemesiyle hızlanır (hareket = okunurluk).
//   · TEHLİKE DİSKİ — yalnız tuzak KURULUYKEN görünen soluk sıcak disk;
//     gerçek TETİK yarıçapına eşittir (`BOMB_TRAP_TRIGGER_PX`), yani düşmanın
//     hangi mesafede patlatacağını dürüstçe gösterir.
//   · SON UYARI — ömrü bitmek üzere olan tuzak (kendiliğinden patlayacak)
//     yanıp söner: hangi tuzak önce patlayacak, renkten çok RİTİMLE okunur.
//
// ⚠️ IŞIK YOK: tüm katmanlar additif malzemedir. Tuzak doğarken/patlarken
// görünür ışık SAYISI değişirse three.js arenadaki TÜM malzemeleri yeniden
// derler (yetenek kullanımındaki donmanın kaynağı buydu) — okunurluk bu yüzden
// ışıkla değil, additive katman + bloom ile kurulur.
//
// Slotlar önceden kurulur ve konum/ölçek dışında hiçbir şey yeniden yaratılmaz
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
import { BOMB_PALETTE, S } from "./shared";
import {
  BOMB_TRAP_ARM_S,
  BOMB_TRAP_TRIGGER_PX,
  bombTrapState,
  type BombTrap,
} from "./bombKit";

/** Aynı anda çizilecek en fazla tuzak (iki taraf toplamı). */
const TRAP_SLOTS = 6;

/** Gövde küresinin yarıçapı — tuzak tam bu kadar yukarıda durur (zemine oturur). */
const BOMB_REST_Y = BOMB_TARGET_WORLD_SPAN / 2;
/** Kurulma halkası ve tehlike diski. */
const RING = "#ffa53d";
const DANGER = "#ff5a1f";
/** Kor parçacıklarının sıcak ucu (paletle aynı ailedendir — bkz. `shared`). */
const SPARK = BOMB_PALETTE.spark;

/** Tetik yarıçapının dünya karşılığı (disk gerçek menzili göstersin). */
const TRIGGER_UNITS = BOMB_TRAP_TRIGGER_PX / S;

/** Uyarı kolonunun yüksekliği (dünya birimi). */
const BEAM_H = 2.6;
/** Yere değme ezilmesi + toz halkası ve kurulma "pop"unun süresi (sn). */
const LAND_S = 0.5;
const ARM_S = 0.55;
/** Ömrü bu süreden az kalan tuzak yanıp sönmeye başlar (kendiliğinden patlama). */
const EXPIRY_WARN_S = 1.8;
/** Bir tuzak çevresinde yükselen kor parçacığı sayısı. */
const SPARKS = 3;
/** Tek-atım zamanlayıcılarında "şu an oynamıyor" işareti. */
const IDLE = -1;

/**
 * Bir tuzak nesnesi İLK kez görüldüğünde (yere değdiği kare) ve KURULDUĞU anda
 * bir kez oynayan efektlerin defteri.
 *
 * NEDEN KİMLİK (WeakSet), NEDEN İNDEKS DEĞİL: sahne tuzak listesini her kare
 * YERİNDE sıkıştırır (bkz. `bombKit.stepBombTraps`), yani slot indeksi ile
 * tuzak eşleşmesi kararlı DEĞİLDİR — bir tuzak patlayınca sonraki tuzak
 * bir öncekinin indeksine kayar. İndekse göre "yeni tuzak" saymak, her
 * patlamada yanlış slota toz halkası oynatırdı. WeakSet nesneyi tutmaz,
 * tuzak listeden düştüğünde kaydı da kendiliğinden gider.
 */
const seenTraps = new WeakSet<BombTrap>();
const armedTraps = new WeakSet<BombTrap>();

/**
 * Erişilebilirlik: `prefers-reduced-motion` açıksa HIZLI KIRPMA kapatılır ve
 * kor parçacıkları yavaşlar (bkz. `engine/BombFuseFlame`, aynı kural).
 * Kırpma "yakında patlayacak" bilgisini taşır; hareket azaltmada bu bilgi
 * kaybolmaz, çünkü renk ve halka zaten kırmızıya kayar — yalnızca RİTM düşer.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function BombTrapPool() {
  const roots = useRef<(THREE.Group | null)[]>([]);
  /** Ezilme (squash) taşıyıcısı: `bodies`i sarar, yere değme anında ölçeklenir. */
  const squash = useRef<(THREE.Group | null)[]>([]);
  const bodies = useRef<(THREE.Group | null)[]>([]);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const discs = useRef<(THREE.Mesh | null)[]>([]);
  const glows = useRef<(THREE.Mesh | null)[]>([]);
  const beams = useRef<(THREE.Mesh | null)[]>([]);
  const landRings = useRef<(THREE.Mesh | null)[]>([]);
  const popRings = useRef<(THREE.Mesh | null)[]>([]);
  const sparks = useRef<(THREE.Mesh | null)[][]>(
    Array.from({ length: TRAP_SLOTS }, () => []),
  );
  /** Slotlara takılı bomba örnekleri (alevleri her kare ilerler). */
  const bodies2Instances = useRef<BombInstance[]>([]);
  /** Tek-atım zamanlayıcıları: tetiklenme anından bu yana geçen süre (sn). */
  const landT = useRef<number[]>(Array.from({ length: TRAP_SLOTS }, () => IDLE));
  const popT = useRef<number[]>(Array.from({ length: TRAP_SLOTS }, () => IDLE));
  // GLB arka planda gelince örnekler yeniden kurulur (yapısal → GLB geçişi).
  const [bombModelReady, setBombModelReady] = useState(0);
  /** Hareket azaltma tercihi (kare başına `matchMedia` çağırmamak için bir kez). */
  const calm = useRef(false);

  useEffect(() => {
    calm.current = prefersReducedMotion();
  }, []);

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
        landT.current[i] = IDLE;
        popT.current[i] = IDLE;
        continue;
      }
      root.visible = true;
      // Sim px → dünya: x/S yatay, y/S derinlik (arena ile aynı eşleme).
      root.position.set(trap.x / S, 0, trap.y / S);

      // ⏱️ TEK-ATIM EFEKTLERİN TETİKLENMESİ — kimlik üzerinden (bkz. WeakSet
      // notu): liste sıkıştırıldığı için indeks güvenilir değildir.
      if (!seenTraps.has(trap)) {
        seenTraps.add(trap);
        landT.current[i] = 0; // bomba şu anda yere değdi
      } else if (landT.current[i] !== IDLE) {
        landT.current[i] += dt;
      }
      if (trap.fuse <= 0) {
        if (!armedTraps.has(trap)) {
          armedTraps.add(trap);
          popT.current[i] = 0; // fitil bitti: tuzak kuruldu
        } else if (popT.current[i] !== IDLE) {
          popT.current[i] += dt;
        }
      }

      // Fitil ilerlemesi (0 → tam kurulmuş) ve nabız.
      const armed = trap.fuse <= 0;
      const k = armed ? 1 : 1 - trap.fuse / BOMB_TRAP_ARM_S;
      // Yanarken nabız fitil kısaldıkça HIZLANIR (gerilim); kurulunca sabit.
      const pulse = armed
        ? 0.55 + 0.45 * Math.sin(time * 8)
        : 0.25 + 0.75 * Math.abs(Math.sin(time * (3 + 12 * k)));

      // ⏳ ÖMRÜ BİTMEK ÜZERE: son saniyelerde tuzak yanıp söner. Renk tek başına
      // "yakında patlayacak" demek için yetersizdir (her tuzak kırmızıya kayar);
      // kırpma RİTMİ hangi tuzağın önce gideceğini söyler.
      const dying = Math.max(0, 1 - trap.ttl / EXPIRY_WARN_S);
      const blink =
        dying > 0 && !calm.current
          ? 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * (14 + 26 * dying) + i))
          : 1;

      // 🧨 YERE DEĞME: ezilme + toz halkası. Süre dolunca ölçek/opaklık tam
      // durumuna döner (tek-atım biterse zamanlayıcı IDLE'a çekilir).
      const lt = landT.current[i];
      let press = 0;
      if (lt !== IDLE) {
        const u = Math.min(1, lt / LAND_S);
        press = (1 - u) * (1 - u); // 1 → 0 (kare başına azalan darbe)
        if (u >= 1) landT.current[i] = IDLE;
      }
      const squashGroup = squash.current[i];
      if (squashGroup) {
        // Gövde merkezi ZEMİNDEN bir yarıçap yukarıda olduğu için ölçek tek
        // başına bombayı yere gömerdi; konum telafisi merkezi yerinde tutar.
        const sy = 1 - 0.22 * press;
        const sx = 1 + 0.16 * press;
        squashGroup.scale.set(sx, sy, sx);
        squashGroup.position.y = BOMB_REST_Y * (1 - sy);
      }
      const landRing = landRings.current[i];
      if (landRing) {
        landRing.visible = lt !== IDLE;
        if (landRing.visible) {
          const u = Math.min(1, lt / LAND_S);
          landRing.scale.setScalar(0.45 + 2.1 * u);
          (landRing.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.7;
        }
      }

      const spark = bodies2Instances.current[i];
      if (spark) {
        // 🔥 Fünye alevi modelin ÜSTÜNDE canlıdır: fitil kısaldıkça alev
        // amberden kırmızıya kayar, büyür ve kor parçacıkları saçar — "bu şey
        // patlamak üzere" okuması tek bir renk/mesh eklemeden gelir.
        spark.update(dt);
        spark.flame?.setAlert(armed ? 1 : k * 0.85);
        spark.flame?.group.scale.setScalar(
          (0.62 + 0.38 * k + 0.05 * pulse) * (0.9 + 0.1 * blink),
        );
      }

      const ring = rings.current[i];
      if (ring) {
        // Kurulma halkası: fitil boyunca büyür, kurulunca sabit kalır.
        const scale = Math.max(0.12, k);
        ring.scale.setScalar(scale);
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.color.set(armed ? DANGER : RING);
        mat.opacity = (armed ? 0.35 + 0.25 * pulse : 0.25 + 0.5 * k) * blink;
      }

      // 💥 KURULDU ANI: halka tam yarıçapa ulaşınca dışa açılan kısa bir
      // "pop" — kurulma artık bir olay olarak okunur.
      const popRing = popRings.current[i];
      const pt = popT.current[i];
      if (popRing) {
        popRing.visible = pt !== IDLE;
        if (popRing.visible) {
          const u = Math.min(1, pt / ARM_S);
          if (u >= 1) popT.current[i] = IDLE;
          popRing.scale.setScalar(0.5 + 2.4 * u);
          (popRing.material as THREE.MeshBasicMaterial).opacity =
            Math.pow(1 - u, 1.6) * 0.95;
        }
      }

      const glow = glows.current[i];
      if (glow) {
        // Zemin sıcak lekesi: bombanın altında nabız atar, patlamaya doğru
        // büyür. (Işık DEĞİL — additif disk; aydınlatma maliyeti yok.)
        const g = armed ? 0.75 + 0.25 * pulse : 0.25 + 0.75 * k;
        glow.scale.setScalar(0.85 + 0.25 * g + 0.06 * Math.sin(time * 6 + i));
        const mat = glow.material as THREE.MeshBasicMaterial;
        mat.color.set(armed ? DANGER : RING);
        mat.opacity = (0.1 + 0.28 * g) * blink;
      }

      const beam = beams.current[i];
      if (beam) {
        // Uyarı kolonu: fitil yanarken güçlenir, kurulunca sönük kalır (tuzak
        // kalabalığında görüşü kapatmasın), ömrü bitmek üzereyken yeniden
        // parlar ve kırpılır.
        const b = armed ? 0.18 + 0.22 * dying : 0.25 + 0.75 * k;
        const mat = beam.material as THREE.MeshBasicMaterial;
        mat.color.set(armed ? DANGER : RING);
        mat.opacity =
          (0.045 + 0.2 * b) *
          blink *
          (calm.current ? 1 : 0.82 + 0.18 * Math.sin(time * 21 + i * 1.7));
        // Yalnızca KALINLIK modüle edilir: yüksekliği ölçeklemek kolonu kendi
        // merkezinden kısaltır ve tabanı zeminden koparırdı (bomba ile kolon
        // arasında boşluk kalırdı).
        beam.scale.set(0.75 + 0.5 * b, 1, 0.75 + 0.5 * b);
        beam.rotation.y = time * 0.5 + i;
      }

      const rows = sparks.current[i];
      for (let s = 0; s < SPARKS; s++) {
        const em = rows[s];
        if (!em) continue;
        // Korlar yükselirken spiral çizer; hız fitille artar (hareket =
        // okunurluk: duran bir parçacık "donmuş sahne" hissi verir).
        const speed = (0.4 + 0.9 * k) * (calm.current ? 0.25 : 1);
        const ph = (time * speed + s / SPARKS) % 1;
        const ang = time * 1.7 + s * 2.1 + i;
        const rad = 0.34 * (1 - ph * 0.55);
        em.position.set(
          Math.cos(ang) * rad,
          ph * 1.5 + 0.1,
          Math.sin(ang) * rad,
        );
        em.rotation.set(ang * 1.3, ang, 0);
        em.scale.setScalar((0.032 + 0.02 * (1 - ph)) * (0.7 + 0.6 * k));
        const mat = em.material as THREE.MeshBasicMaterial;
        mat.color.set(s % 2 === 0 ? SPARK : BOMB_PALETTE.flame);
        mat.opacity = (1 - ph) * (0.45 + 0.5 * k) * blink;
      }

      const disc = discs.current[i];
      if (disc) {
        // Tehlike diski yalnızca KURULU tuzakta görünür ve yavaşça nabız atar.
        disc.visible = armed;
        if (armed) {
          const s = 1 + 0.06 * Math.sin(time * 3 + i);
          disc.scale.setScalar(s);
          (disc.material as THREE.MeshBasicMaterial).opacity =
            (0.08 + 0.05 * pulse) * blink;
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

          {/* zemin sıcak lekesi: bombanın altında nabız atan sıcak disk */}
          <mesh
            ref={(el) => {
              glows.current[i] = el;
            }}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.02, 0]}
            raycast={() => null}
          >
            <circleGeometry args={[0.52, 24]} />
            <meshBasicMaterial
              color={RING}
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {/* uyarı kolonu: bombadan yükselen ince additif ışık sütunu */}
          <mesh
            ref={(el) => {
              beams.current[i] = el;
            }}
            position={[0, BEAM_H / 2, 0]}
            raycast={() => null}
          >
            <cylinderGeometry args={[0.05, 0.3, BEAM_H, 14, 1, true]} />
            <meshBasicMaterial
              color={RING}
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
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

          {/* yere değme toz halkası (tek atım) */}
          <mesh
            ref={(el) => {
              landRings.current[i] = el;
            }}
            visible={false}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.055, 0]}
            raycast={() => null}
          >
            <ringGeometry args={[0.5, 0.64, 28]} />
            <meshBasicMaterial
              color={BOMB_PALETTE.smoke}
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* kuruldu "pop" halkası (tek atım) */}
          <mesh
            ref={(el) => {
              popRings.current[i] = el;
            }}
            visible={false}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.07, 0]}
            raycast={() => null}
          >
            <ringGeometry args={[0.5, 0.62, 32]} />
            <meshBasicMaterial
              color={RING}
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* kor parçacıkları: tuzak çevresinde yükselir */}
          {Array.from({ length: SPARKS }).map((_, s) => (
            <mesh
              key={`spark-${s}`}
              raycast={() => null}
              ref={(el) => {
                sparks.current[i][s] = el;
              }}
            >
              <octahedronGeometry args={[1, 0]} />
              <meshBasicMaterial
                color={SPARK}
                transparent
                opacity={0}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          ))}

          {/* 🧨 ELDEKİ MODELİN AYNISI — samurayın bombası. Örnek imperatif
              takılır (bkz. yukarıdaki etki); konum yalnız dikeyde kayar:
              gövde küresinin merkezi zeminden bir yarıçap yukarıda durur.
              `squash` zarfı yere değme darbesinin ezilmesini taşır. */}
          <group
            ref={(el) => {
              squash.current[i] = el;
            }}
          >
            <group
              ref={(el) => {
                bodies.current[i] = el;
              }}
            />
          </group>
        </group>
      ))}
    </group>
  );
}
