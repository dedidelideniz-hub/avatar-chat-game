/**
 * VAELOS CADDESİ — "yaşayan şehir" detay katmanı.
 *
 * Caddeyi kutu binalar + düz zeminden kurtaran MODÜLER parçalar. Her parça
 * bağımsız bir bileşen; yerleşim verileri `constants.ts` içinde tutulur,
 * dokular `streetTextures.ts` içinde bir kez üretilip paylaşılır.
 *
 * Performans kuralları (mobil hedef):
 *   · Sahnedeki IŞIK SAYISI değişmez — tüm parıltı emissive + additive
 *     dokulardır (PointLight eklemek shader'ları yeniden derletir).
 *   · Çok sayıda tekrar eden parça (çöp kovası, tabela, çit, yaya geçidi)
 *     tek InstancedMesh ile çizilir → draw call sabit kalır.
 *   · Geometri/materyal modül düzeyinde paylaşılır.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  BUS_STOPS,
  CROSSWALKS,
  DIRECTION_SIGNS,
  FENCE_LINES,
  GRASS_GROUND_Y,
  TRASH_CANS,
  ZONE,
  WORLD_WIDTH,
  type BusStopDef,
  type DirectionSignDef,
} from "./constants";
import {
  makeAsphaltTexture,
  makeAwningTexture,
  makeGlowTexture,
  makePavementTexture,
  makeSignTexture,
} from "./streetTextures";
import { buildFenceLines } from "./fenceLine";

/* ═══════════════════════════════════════════════════════════ */
/*  Paylaşılan geometri / materyaller                          */
/* ═══════════════════════════════════════════════════════════ */

const GEO = {
  unitBox: new THREE.BoxGeometry(1, 1, 1),
  unitPlane: new THREE.PlaneGeometry(1, 1),
};

const MAT = {
  concrete: new THREE.MeshStandardMaterial({ color: "#b0a894", roughness: 0.9 }),
  metal: new THREE.MeshStandardMaterial({ color: "#4a5058", roughness: 0.5, metalness: 0.45 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: "#33383f", roughness: 0.55, metalness: 0.35 }),
  glass: new THREE.MeshStandardMaterial({
    color: "#bfe4f4",
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.34,
    side: THREE.DoubleSide,
  }),
  wood: new THREE.MeshStandardMaterial({ color: "#c49a60", roughness: 0.82 }),
  darkWood: new THREE.MeshStandardMaterial({ color: "#6b4a2c", roughness: 0.88 }),
  stripe: new THREE.MeshStandardMaterial({ color: "#ece6d8", roughness: 0.85 }),
  fence: new THREE.MeshStandardMaterial({ color: "#efe7d6", roughness: 0.78 }),
  binGreen: new THREE.MeshStandardMaterial({ color: "#3d6b52", roughness: 0.62, metalness: 0.18 }),
  binBlue: new THREE.MeshStandardMaterial({ color: "#2f5c8a", roughness: 0.62, metalness: 0.18 }),
  binLid: new THREE.MeshStandardMaterial({ color: "#2a3a34", roughness: 0.55, metalness: 0.3 }),
};

/**
 * Kaldırım/asfalt dokuları (Ground bileşeni kullanır).
 * Çim zemini kodla çizilmiyor: `public/models/grass_ground.glb` döşenir.
 */
export function useStreetGroundTextures() {
  return useMemo(() => {
    const pavement = makePavementTexture();
    const asphalt = makeAsphaltTexture();
    // Doku 2×2 dünya birimini kaplar → repeat boyuta göre.
    const sidewalkDepth = ZONE.northSidewalkBot - ZONE.northSidewalkTop; // 2.0
    const roadDepth = ZONE.roadBot - ZONE.roadTop; // 4.0
    pavement.repeat.set(WORLD_WIDTH / 2, sidewalkDepth / 2);
    asphalt.repeat.set(WORLD_WIDTH / 2, roadDepth / 2);
    return { pavement, asphalt };
  }, []);
}

/* ═══════════════════════════════════════════════════════════ */
/*  YAYA GEÇİDİ — asfalt üzerine beyaz şeritler                 */
/* ═══════════════════════════════════════════════════════════ */

const CROSSWALK_STRIPES = 7;
const CROSSWALK_STRIPE_W = 0.14;
const CROSSWALK_STEP = 0.3;

export function StreetCrosswalks() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = CROSSWALKS.length * CROSSWALK_STRIPES;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const midZ = (ZONE.roadTop + ZONE.roadBot) / 2;
    const depth = (ZONE.roadBot - ZONE.roadTop) * 0.97;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    let i = 0;
    for (const cx of CROSSWALKS) {
      const start = -((CROSSWALK_STRIPES - 1) * CROSSWALK_STEP) / 2;
      for (let s = 0; s < CROSSWALK_STRIPES; s++) {
        m.compose(
          new THREE.Vector3(cx + start + s * CROSSWALK_STEP, 0.014, midZ),
          q,
          new THREE.Vector3(CROSSWALK_STRIPE_W, depth, 1),
        );
        mesh.setMatrixAt(i++, m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [count]);

  return (
    <instancedMesh ref={ref} args={[GEO.unitPlane, MAT.stripe, count]} receiveShadow />
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  LAMBA PARILTISI — ampul halesi + zemine düşen ışık havuzu  */
/*  (PointLight YOK: ışık sayısı sabit kalır)                  */
/* ═══════════════════════════════════════════════════════════ */

export function LampGlowFx() {
  const glow = makeGlowTexture();
  return (
    <>
      {/* Ampul halesi — kameraya bakan billboard (kamera yaw'ı sabit). */}
      <mesh position={[0.18, 1.62, 0.08]}>
        <planeGeometry args={[0.72, 0.72]} />
        <meshBasicMaterial
          map={glow}
          transparent
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* Zemine düşen yumuşak sıcak ışık havuzu. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.18, 0.022, 0]}>
        <planeGeometry args={[2.5, 2.5]} />
        <meshBasicMaterial
          map={glow}
          transparent
          opacity={0.26}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  ÇÖP KUTUSU                                                  */
/* ═══════════════════════════════════════════════════════════ */

function TrashCan3D({ x, z, recycling }: { x: number; z: number; recycling: boolean }) {
  const body = recycling ? MAT.binBlue : MAT.binGreen;
  return (
    <group position={[x, 0, z]}>
      {/* Gövde */}
      <mesh position={[0, 0.22, 0]} scale={[0.17, 0.44, 0.17]} material={body} castShadow>
        <cylinderGeometry args={[1, 0.92, 1, 10]} />
      </mesh>
      {/* Kapak */}
      <mesh position={[0, 0.46, 0]} scale={[0.19, 0.05, 0.19]} material={MAT.binLid}>
        <cylinderGeometry args={[1, 1, 1, 10]} />
      </mesh>
      {/* Kapak tutamağı */}
      <mesh position={[0, 0.5, 0]} scale={[0.05, 0.03, 0.05]} material={MAT.binLid}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
      </mesh>
      {/* Taban bileziği */}
      <mesh position={[0, 0.03, 0]} scale={[0.19, 0.04, 0.19]} material={MAT.metal}>
        <cylinderGeometry args={[1, 1, 1, 10]} />
      </mesh>
    </group>
  );
}

export function StreetTrashCans() {
  return (
    <>
      {TRASH_CANS.map((t, i) => (
        <TrashCan3D key={`${t.x}-${t.z}`} x={t.x} z={t.z} recycling={i % 2 === 1} />
      ))}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  OTOBÜS DURAĞI                                               */
/* ═══════════════════════════════════════════════════════════ */

function BusStop3D({ def }: { def: BusStopDef }) {
  const sign = makeSignTexture(`DURAK ${def.route}`, def.color, "#ffffff");
  const W = 1.8;
  const D = 0.72;
  const H = 1.44;
  const halfW = W / 2 - 0.08;

  return (
    <group position={[def.x, 0, def.z]}>
      {/* Ayaklar */}
      {[
        [-halfW, D / 2 - 0.06],
        [halfW, D / 2 - 0.06],
        [-halfW, -D / 2 + 0.06],
        [halfW, -D / 2 + 0.06],
      ].map(([px, pz]) => (
        <mesh key={`${px}-${pz}`} position={[px, H / 2, pz]} scale={[0.045, H, 0.045]} material={MAT.darkMetal} castShadow>
          <cylinderGeometry args={[1, 1, 1, 8]} />
        </mesh>
      ))}

      {/* Çatı */}
      <mesh position={[0, H + 0.04, 0]} scale={[W + 0.16, 0.07, D + 0.2]} material={MAT.darkWood} castShadow>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      {/* Çatı kenar bandı */}
      <mesh position={[0, H + 0.085, 0]} scale={[W + 0.2, 0.03, D + 0.24]} material={MAT.metal}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>

      {/* Arka cam panel */}
      <mesh position={[0, 0.72, -D / 2 + 0.04]} material={MAT.glass}>
        <boxGeometry args={[W - 0.2, 0.86, 0.02]} />
      </mesh>
      {/* Panel çerçevesi */}
      <mesh position={[0, 0.72, -D / 2 + 0.03]} scale={[W - 0.14, 0.06, 0.03]} material={MAT.metal}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>

      {/* Oturma bankı */}
      <mesh position={[0, 0.44, -D / 2 + 0.2]} scale={[W - 0.34, 0.05, 0.26]} material={MAT.wood} castShadow>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      {[-0.55, 0.55].map((lx) => (
        <mesh key={lx} position={[lx, 0.22, -D / 2 + 0.2]} scale={[0.035, 0.44, 0.22]} material={MAT.metal}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ))}

      {/* Hat tabelası — çatının üstünde */}
      <mesh position={[0, H + 0.34, 0]} scale={[0.78, 0.24, 0.03]} material={MAT.darkMetal} castShadow>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      <mesh position={[0, H + 0.34, 0.02]}>
        <planeGeometry args={[0.74, 0.21]} />
        <meshStandardMaterial map={sign} emissiveMap={sign} emissive="#ffffff" emissiveIntensity={0.35} roughness={0.6} />
      </mesh>
      {/* Tabela direkleri */}
      {[-0.3, 0.3].map((lx) => (
        <mesh key={lx} position={[lx, H + 0.14, 0]} scale={[0.03, 0.24, 0.03]} material={MAT.darkMetal}>
          <cylinderGeometry args={[1, 1, 1, 6]} />
        </mesh>
      ))}

      {/* Zaman çizelgesi panosu (yan taraf) */}
      <mesh position={[halfW + 0.12, 0.95, 0]} scale={[0.05, 0.5, D - 0.1]} material={MAT.metal}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
    </group>
  );
}

export function StreetBusStops() {
  return (
    <>
      {BUS_STOPS.map((def) => (
        <BusStop3D key={`${def.x}-${def.z}`} def={def} />
      ))}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  YÖN TABELASI                                                */
/* ═══════════════════════════════════════════════════════════ */

function DirectionSign3D({ def }: { def: DirectionSignDef }) {
  const textures = useMemo(
    () =>
      def.plates.map((p) => ({
        tex: makeSignTexture(p.text, "#1f2b38", "#ffffff", p.arrow),
        arrow: p.arrow,
      })),
    [def.plates],
  );

  return (
    <group position={[def.x, 0, def.z]}>
      {/* Taban */}
      <mesh position={[0, 0.035, 0]} scale={[0.13, 0.07, 0.13]} material={MAT.concrete}>
        <cylinderGeometry args={[1, 1.2, 1, 10]} />
      </mesh>
      {/* Direk */}
      <mesh position={[0, 0.95, 0]} scale={[0.035, 1.9, 0.035]} material={MAT.metal} castShadow>
        <cylinderGeometry args={[1, 1, 1, 8]} />
      </mesh>

      {textures.map((p, i) => {
        const y = 1.68 - i * 0.26;
        const ox = i % 2 === 0 ? 0.14 : -0.1;
        return (
          <group key={`${def.x}-${i}`} position={[ox, y, 0.03]}>
            {/* Plaka gövdesi */}
            <mesh scale={[0.66, 0.2, 0.03]} material={MAT.darkMetal} castShadow>
              <boxGeometry args={[1, 1, 1]} />
            </mesh>
            {/* Plaka yüzü — ok zaten dokunun içinde çizildi (döndürülmez,
                yoksa yazı ters gelir). */}
            <mesh position={[0, 0, 0.018]}>
              <planeGeometry args={[0.62, 0.17]} />
              <meshStandardMaterial
                map={p.tex}
                emissiveMap={p.tex}
                emissive="#ffffff"
                emissiveIntensity={0.28}
                roughness={0.65}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export function StreetDirectionSigns() {
  return (
    <>
      {DIRECTION_SIGNS.map((def) => (
        <DirectionSign3D key={`${def.x}-${def.z}`} def={def} />
      ))}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Yardımcılar                                                 */
/* ═══════════════════════════════════════════════════════════ */

/** Tohumlu PRNG — yerleşim/dağıtım her karede aynı kalsın (bitki örtüsü katmanı da kullanır). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ═══════════════════════════════════════════════════════════ */
/*  SINIR ÇİTİ — kaldırım ↔ çim hattı boyunca kesintisiz hat     */
/* ═══════════════════════════════════════════════════════════ */

export function StreetFences() {
  const slatRef = useRef<THREE.InstancedMesh>(null);
  const railRef = useRef<THREE.InstancedMesh>(null);

  // Tüm hatlar TEK listede: kaç hat ve kaç çıta olursa olsun 2 draw call.
  // Matematik `fenceLine.ts` içinde (saf) — uç uca, boşluksuz dizilim.
  const { slats, rails } = useMemo(() => buildFenceLines(FENCE_LINES), []);

  useLayoutEffect(() => {
    const slatMesh = slatRef.current;
    const railMesh = railRef.current;
    if (!slatMesh || !railMesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    slats.forEach((s, i) => {
      // Çıta tabanı TAM zemin seviyesi: 0.19 - 0.38/2 = 0 → havada durmaz,
      // zemine gömülmez (GRASS_GROUND_Y zemin yüzeyi).
      m.compose(new THREE.Vector3(s.x, 0.19 + GRASS_GROUND_Y, s.z), q, new THREE.Vector3(0.05, 0.38, 0.035));
      slatMesh.setMatrixAt(i, m);
    });
    rails.forEach((r, i) => {
      m.compose(new THREE.Vector3(r.x, 0.3 + GRASS_GROUND_Y, r.z), q, new THREE.Vector3(r.len, 0.045, 0.03));
      railMesh.setMatrixAt(i, m);
    });
    slatMesh.instanceMatrix.needsUpdate = true;
    railMesh.instanceMatrix.needsUpdate = true;
    // Örnekler cadde boyunca yayılıyor: kaba küre örnek matrislerinden
    // hesaplanmalı, yoksa hat kameradan çıkınca frustum'da elenip kaybolur.
    slatMesh.computeBoundingSphere();
    railMesh.computeBoundingSphere();
  }, [slats, rails]);

  return (
    <>
      <instancedMesh ref={slatRef} args={[GEO.unitBox, MAT.fence, slats.length]} castShadow />
      <instancedMesh ref={railRef} args={[GEO.unitBox, MAT.fence, rails.length]} />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  ÇATI DETAYI — klima / anten / su deposu / havalandırma      */
/* ═══════════════════════════════════════════════════════════ */

export function RoofDetail({
  kind,
  w,
  d,
  topY,
}: {
  kind?: "ac" | "antenna" | "tank" | "vent";
  w: number;
  d: number;
  /** Çatı yüzeyinin grup içindeki Y yüksekliği. */
  topY: number;
}) {
  if (!kind) return null;
  const ix = Math.min(w, d) * 0.24;

  if (kind === "antenna") {
    return (
      <group position={[ix, topY, 0]}>
        <mesh position={[0, 0.02, 0]} scale={[0.09, 0.04, 0.09]} material={MAT.metal}>
          <cylinderGeometry args={[1, 1, 1, 8]} />
        </mesh>
        <mesh position={[0, 0.36, 0]} scale={[0.018, 0.68, 0.018]} material={MAT.metal}>
          <cylinderGeometry args={[1, 1, 1, 6]} />
        </mesh>
        <mesh position={[0, 0.5, 0]} scale={[0.34, 0.02, 0.02]} material={MAT.darkMetal}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
        <mesh position={[0, 0.62, 0]} scale={[0.22, 0.02, 0.02]} material={MAT.darkMetal}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
        <mesh position={[0, 0.73, 0]} scale={[0.035, 0.035, 0.035]} material={MAT.metal}>
          <sphereGeometry args={[1, 6, 6]} />
        </mesh>
      </group>
    );
  }

  if (kind === "tank") {
    return (
      <group position={[ix, topY, 0]}>
        {[-0.11, 0.11].map((lz) => (
          <mesh key={lz} position={[0, 0.04, lz]} scale={[0.03, 0.08, 0.03]} material={MAT.darkMetal}>
            <cylinderGeometry args={[1, 1, 1, 6]} />
          </mesh>
        ))}
        <mesh position={[0, 0.28, 0]} scale={[0.2, 0.44, 0.2]} material={MAT.metal} castShadow>
          <cylinderGeometry args={[1, 1, 1, 10]} />
        </mesh>
        <mesh position={[0, 0.51, 0]} scale={[0.22, 0.035, 0.22]} material={MAT.concrete}>
          <cylinderGeometry args={[1, 1, 1, 10]} />
        </mesh>
      </group>
    );
  }

  if (kind === "vent") {
    return (
      <group position={[ix, topY, 0]}>
        <mesh position={[0, 0.1, 0]} scale={[0.1, 0.2, 0.1]} material={MAT.concrete}>
          <cylinderGeometry args={[1, 1, 1, 10]} />
        </mesh>
        <mesh position={[0, 0.22, 0]} scale={[0.15, 0.04, 0.15]} material={MAT.metal} castShadow>
          <cylinderGeometry args={[1, 1, 1, 10]} />
        </mesh>
      </group>
    );
  }

  // Klima ünitesi
  return (
    <group position={[ix, topY, 0]}>
      <mesh position={[0, 0.1, 0]} scale={[0.5, 0.2, 0.32]} material={MAT.metal} castShadow>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      <mesh position={[0, 0.21, 0]} scale={[0.44, 0.02, 0.26]} material={MAT.darkMetal}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      <mesh position={[0, 0.1, 0.17]} scale={[0.34, 0.13, 0.02]} material={MAT.darkMetal}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  DÜKKAN TENTESİ — bina cephesine asılan branda               */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Binanın ZEMİN KATINA asılan çizgili tente. Ahşap çerçeve + kumaş +
 * ön kenar bandı; kumaş dokusu renk çiftine göre önbelleğe alınır.
 */
export function ShopAwning({
  x,
  y,
  z,
  width,
  colorA,
  colorB,
}: {
  x: number;
  y: number;
  z: number;
  width: number;
  colorA: string;
  colorB: string;
}) {
  const cloth = makeAwningTexture(colorA, colorB);
  const depth = 0.62;
  const w = width * 0.94;

  const clothMat = useMemo(() => {
    const tex = cloth.clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    // Her desen bloğu 4 şerit → şerit genişliği ~0.2 birim (gerçek tente ölçüsü).
    tex.repeat.set(Math.max(1, Math.round(w / 0.9)), 1);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72, side: THREE.DoubleSide });
  }, [cloth, w]);

  return (
    <group position={[x, y, z]}>
      {/* Kumaş — öne doğru hafif eğimli */}
      <mesh position={[0, 0, depth / 2 - 0.03]} rotation={[0.32, 0, 0]} material={clothMat} castShadow>
        <boxGeometry args={[w, 0.03, depth]} />
      </mesh>
      {/* Ön kenar bandı (gölge) */}
      <mesh position={[0, -0.1, depth - 0.04]} rotation={[0.32, 0, 0]} material={MAT.darkWood}>
        <boxGeometry args={[w, 0.045, 0.05]} />
      </mesh>
      {/* Yan destek çubukları */}
      {[-w / 2 + 0.03, w / 2 - 0.03].map((sx) => (
        <mesh key={sx} position={[sx, -0.06, depth / 2 - 0.03]} rotation={[0.32, 0, 0]} material={MAT.darkWood}>
          <boxGeometry args={[0.035, 0.035, depth]} />
        </mesh>
      ))}
    </group>
  );
}
