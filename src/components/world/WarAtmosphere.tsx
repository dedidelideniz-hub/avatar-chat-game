// WarAtmosphere — MOBA maç atmosferi (yalnızca görsel).
//
// Wild Rift / LoL Mobile referansındaki harita dilini kurar: bazalt zemin
// üzerinde akan LAV nehirleri, her üssün tepesinde yükselen KRİSTAL çekirdek
// (nexus) ve ondan yükselen ışık sütunu, süzülen kor parçacıkları ve volkanik
// gökyüzü. Üstüne zengin ortam katmanı biner:
//   • Bölgesel palet — haritanın kendi dokuları kırmızı üs yarısında koyu
//     turuncu-kırmızı, mavi üs yarısında berrak mavi-mora çekilir (MapPalette).
//   • Lane yolları + kenar ışıkları, üslerden merkeze enerji hatları.
//   • Taş sur/kaya/dikilitaş/kemer gibi çevre objeleri, mavi-mor kristal vadisİ
//     ve yansıtıcı su havuzu, hafif yansıtıcı zemin katmanı.
//   • Gölge düşüren tek yönlü ışık (ArenaShadowLight) — karakterler zemine
//     gölge bırakır (yalnızca `shadows` açık olan masaüstünde).
// Bloom zinciri ArenaPostFx'ten gelir: kristaller, lane çizgileri, lav ve
// yetenek efektleri etraflarına ışık saçar.
// Hiçbiri hareket/çarpışma sistemine girmez: her mesh
// `raycast={() => null}` ile dokunma (tap) katmanını geçirir.
//
// Koordinatlar Arena3D ile aynıdır (S = 50 px/birim; arena 34 x 22 birim).
// Bileşen BattleMapModel içinde haritanın KARDEŞİ olarak render edilir, yani
// haritanın fit dönüşümünden etkilenmez ve doğrudan arena uzayında durur.
import { useFrame } from "@react-three/fiber";
import { Environment, Lightformer, useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ArenaPostFx } from "./ArenaPostFx";

/** Savaş alanı GLB'sinin tek kaynağı (BattleMapModel de buradan okur). */
export const MAP_URL = "/models/5v5_game_map.glb";

const ARENA_W = 34;
const ARENA_D = 22;

/**
 * Deterministik rastgelelik (mulberry32). Parçacık/çakıl dağılımı render
 * sırasında üretilir; sabit tohumlu bir üretici kullanmak hem her yeniden
 * çizimde aynı sahneyi verir hem de React'in "saf bileşen" kuralını korur
 * (Math.random çağrısı render sırasında impure sayılır).
 */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Üs (nexus) konumları — -90° harita dönüşüyle: kırmızı (8, 2), mavi (26, 20). */
export const NEXUS = [
  { x: 8, z: 2, color: "#ff7a3c", core: "#ffd9b8", accent: "#ffb066" },
  { x: 26, z: 20, color: "#5ce1ff", core: "#d6f7ff", accent: "#a7f3ff" },
] as const;

/** Soft radial glow shared by embers, sun, lava haze and nexus light. */
function makeGlowTexture(color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.35, color);
    grad.addColorStop(0.7, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

/** Dikey sönüm gradyanı — kristal ışık sütunu ve kor sütunları için. */
function makePillarTexture(color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  if (g) {
    const grad = g.createLinearGradient(0, 256, 0, 0);
    grad.addColorStop(0, color);
    grad.addColorStop(0.25, color);
    grad.addColorStop(0.72, "rgba(0,0,0,0.10)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 256);
    // dikey yarıklar: sütunu tek parça ışık yerine lifli gösterir
    for (let i = 0; i < 16; i += 2) {
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(i, 0, 1, 256);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Lav akışı dokusu — yatay damarlar; `offset.x` kaydırılarak akıtılır. */
function makeFlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  const rnd = makeRng(90210);
  if (g) {
    g.fillStyle = "#200400";
    g.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 46; i++) {
      const y = rnd() * 64;
      const w = 20 + rnd() * 90;
      const x = rnd() * 256;
      const grad = g.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, rnd() < 0.25 ? "#fff3c4" : "#ff8a2b");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(x, y, w, 1 + rnd() * 3.4);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Lav nehirleri — zeminde akan kor damarları.                        */
/* ------------------------------------------------------------------ */

/** (x, z) düğümleri. Ana hat iki üssü birleştiren koridordur. */
const LAVA_RIVERS: [number, number][][] = [
  [
    [1.5, 2.4],
    [7, 6.4],
    [13, 9.6],
    [19, 13.4],
    [24.4, 16.6],
    [28.5, 19.6],
  ],
  [
    [-2, 12.5],
    [4, 14.6],
    [10.5, 16.4],
    [17, 17.6],
    [23.5, 18.2],
    [29, 18.4],
  ],
  [
    [2, 19.5],
    [6.5, 17.4],
    [11, 13.6],
    [15.5, 9.4],
    [19, 6.2],
    [23, 4.2],
  ],
];

const RIVER_TUBE_SEGMENTS = 120;
const RIVER_RADIAL = 8;

function LavaRivers() {
  const flow = useMemo(() => makeFlowTexture(), []);
  const wideFlow = useMemo(() => {
    const tex = flow.clone();
    tex.needsUpdate = true;
    return tex;
  }, [flow]);

  const curves = useMemo(
    () =>
      LAVA_RIVERS.map(
        (nodes) =>
          new THREE.CatmullRomCurve3(
            nodes.map(([x, z]) => new THREE.Vector3(x, 0.06, z)),
          ),
      ),
    [],
  );

  useFrame((_, dt) => {
    flow.offset.x -= dt * 0.16;
    wideFlow.offset.x -= dt * 0.1;
  });

  return (
    <group>
      {curves.map((curve, i) => (
        <group key={i}>
          {/* geniş, yumuşak kor halesi — bloom hissi */}
          <mesh raycast={() => null}>
            <tubeGeometry
              args={[curve, RIVER_TUBE_SEGMENTS, 0.85, RIVER_RADIAL, false]}
            />
            <meshBasicMaterial
              map={wideFlow}
              color="#ff5f14"
              transparent
              opacity={0.2}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          {/* parlak lav çekirdeği */}
          <mesh raycast={() => null}>
            <tubeGeometry
              args={[curve, RIVER_TUBE_SEGMENTS, 0.36, RIVER_RADIAL, false]}
            />
            <meshBasicMaterial
              map={flow}
              color="#ffb347"
              transparent
              opacity={0.88}
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

/** Lav gölleri: zemin oyuklarında nabız gibi parlayan kor havuzları. */
const LAVA_POOLS = [
  { x: 3.2, z: 9.5, r: 2.5 },
  { x: 30.5, z: 11.5, r: 2.2 },
  { x: 16.5, z: 2.4, r: 1.9 },
  { x: 13.5, z: 20.2, r: 2.0 },
];

/**
 * Lav göllerinden sahneye vuran turuncu nokta ışıkları. Referanstaki gibi
 * magma kanalları zemini gerçekten aydınlatsın diye her havuza bir ışık
 * konur ve nabız gibi soluyarak canlı kalır.
 */
function MagmaLights() {
  const refs = useRef<(THREE.PointLight | null)[]>([]);

  useFrame(() => {
    const t = performance.now() / 1000;
    for (let i = 0; i < LAVA_POOLS.length; i++) {
      const light = refs.current[i];
      if (!light) continue;
      // Işık bütçesi: havuz ışıkları sahneyi tek başına aydınlatmaz, sadece
      // çukurun kenarını belli eder (eskiden 0.95 ile tüm zemini yıkıyordu).
      light.intensity = 0.34 + 0.1 * Math.sin(t * 1.7 + i * 2.1);
    }
  });

  return (
    <>
      {LAVA_POOLS.map((p, i) => (
        <pointLight
          key={`magma-${i}`}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[p.x, 0.62, p.z]}
          color="#ff6a1f"
          intensity={0.34}
          distance={6.5}
          decay={2}
        />
      ))}
    </>
  );
}

function LavaPools() {
  const tex = useMemo(() => makeGlowTexture("rgba(255,120,30,1)"), []);
  const refs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const t = performance.now() / 1000;
    for (let i = 0; i < LAVA_POOLS.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.11 + 0.035 * Math.sin(t * 1.5 + i * 1.7);
      m.scale.setScalar(1 + 0.05 * Math.sin(t * 1.1 + i));
    }
  });

  return (
    <group>
      {LAVA_POOLS.map((p, i) => (
        <group key={i} position={[p.x, 0.05, p.z]}>
          <mesh
            ref={(el) => {
              refs.current[i] = el;
            }}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => null}
          >
            <planeGeometry args={[p.r * 2.0, p.r * 2.0]} />
            <meshBasicMaterial
              map={tex}
              color="#ff8c2e"
              transparent
              opacity={0.12}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          {/* çatlaklı kenar halkası */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <ringGeometry args={[p.r * 0.72, p.r * 0.85, 40]} />
            <meshBasicMaterial
              color="#ff8a3c"
              transparent
              opacity={0.13}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Kristal çekirdek (nexus) — referanstaki ana görsel öğe.             */
/* ------------------------------------------------------------------ */

function NexusCrystal({
  x,
  z,
  color,
  core,
  accent,
}: {
  x: number;
  z: number;
  color: string;
  core: string;
  accent: string;
}) {
  const spin = useRef<THREE.Group>(null);
  const shards = useRef<THREE.Group>(null);
  const crystalMat = useRef<THREE.MeshStandardMaterial>(null);
  const beam = useRef<THREE.Mesh>(null);
  const rings = useRef<THREE.Group>(null);
  const runes = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);

  const beamTex = useMemo(
    () => makePillarTexture("rgba(255,255,255,0.85)"),
    [],
  );
  const glowTex = useMemo(() => makeGlowTexture("rgba(180,230,255,1)"), []);
  const haloRef = useRef<THREE.Sprite>(null);

  useFrame((_, dt) => {
    const t = performance.now() / 1000;
    if (spin.current) {
      spin.current.rotation.y += dt * 0.45;
      spin.current.position.y = 0.95 + Math.sin(t * 1.2) * 0.07;
    }
    if (shards.current) {
      shards.current.rotation.y -= dt * 0.9;
      shards.current.rotation.z = Math.sin(t * 0.7) * 0.08;
    }
    if (rings.current) rings.current.rotation.y += dt * 0.25;
    if (runes.current) runes.current.rotation.y -= dt * 0.12;
    const pulse = 0.78 + 0.22 * Math.sin(t * 1.8);
    // Kristal, sütun, hale ve nokta ışık İLK sürümdeki değerlerin çok
    // altında: dört katman birlikte bloom eşiğini aşıp üssü bembeyaz bir
    // lekeye çeviriyordu. Artık hepsi "parlar ama taşmaz" seviyesinde.
    if (crystalMat.current) {
      crystalMat.current.emissiveIntensity = 0.4 + 0.2 * pulse;
    }
    if (beam.current) {
      const mat = beam.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.03 + 0.016 * pulse;
      beam.current.scale.set(1 + 0.03 * pulse, 1, 1 + 0.03 * pulse);
    }
    if (haloRef.current) {
      (haloRef.current.material as THREE.SpriteMaterial).opacity =
        0.05 + 0.02 * pulse;
      haloRef.current.scale.setScalar(2.6 + 0.2 * pulse);
    }
    if (light.current) light.current.intensity = 0.34 + 0.14 * pulse;
  });

  return (
    <group position={[x, 0, z]}>
      {/* zemin platformu: rün halkaları + dönen yaylar */}
      <group ref={rings} position={[0, 0.06, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <ringGeometry args={[1.72, 1.86, 64]} />
          <meshBasicMaterial
            color={accent}
            transparent
            opacity={0.19}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <ringGeometry args={[1.3, 1.36, 64]} />
          <meshBasicMaterial
            color={core}
            transparent
            opacity={0.12}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      </group>
      <group ref={runes} position={[0, 0.05, 0]}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh
            key={i}
            rotation={[-Math.PI / 2, 0, (i * Math.PI) / 3]}
            raycast={() => null}
          >
            <ringGeometry args={[1.95, 2.05, 24, 1, 0, Math.PI / 4]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.18}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>

      {/* ışık sütunu (gökyüzüne uzanan huzme) */}
      <mesh ref={beam} position={[0, 3.7, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.46, 0.74, 7.4, 16, 1, true]} />
        <meshBasicMaterial
          map={beamTex}
          color={color}
          transparent
          opacity={0.03}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* yumuşak hale */}
      <sprite ref={haloRef} position={[0, 1.5, 0]} raycast={() => null}>
        <spriteMaterial
          map={glowTex}
          color={color}
          transparent
          opacity={0.08}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>

      {/* kristal gövde: altıgen prizma + uçlar */}
      <group ref={spin} position={[0, 0.95, 0]}>
        <mesh castShadow raycast={() => null}>
          <cylinderGeometry args={[0.46, 0.62, 1.5, 6, 1]} />
          <meshStandardMaterial
            ref={crystalMat}
            color={core}
            emissive={color}
            emissiveIntensity={0.55}
            roughness={0.12}
            metalness={0.15}
            transparent
            opacity={0.92}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 1.15, 0]} raycast={() => null}>
          <coneGeometry args={[0.46, 1.0, 6]} />
          <meshStandardMaterial
            color={core}
            emissive={color}
            emissiveIntensity={0.6}
            roughness={0.1}
            transparent
            opacity={0.94}
            toneMapped={false}
          />
        </mesh>
        <mesh
          position={[0, -1.0, 0]}
          rotation={[Math.PI, 0, 0]}
          raycast={() => null}
        >
          <coneGeometry args={[0.62, 0.7, 6]} />
          <meshStandardMaterial
            color={core}
            emissive={color}
            emissiveIntensity={0.45}
            roughness={0.14}
            transparent
            opacity={0.9}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* yörüngede dönen kristal parçaları */}
      <group ref={shards} position={[0, 1.35, 0]}>
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[
                Math.cos(a) * 1.45,
                Math.sin(a * 1.7) * 0.35,
                Math.sin(a) * 1.45,
              ]}
              rotation={[0.4, a, 0.3]}
              raycast={() => null}
            >
              <octahedronGeometry args={[0.22, 0]} />
              <meshStandardMaterial
                color={core}
                emissive={accent}
                emissiveIntensity={0.4}
                roughness={0.2}
                transparent
                opacity={0.85}
                toneMapped={false}
              />
            </mesh>
          );
        })}
      </group>

      {/* üs kristali: referanstaki gibi doygun turuncu/cyan bir ışık yayar */}
      <pointLight
        ref={light}
        position={[0, 2.6, 0]}
        color={color}
        distance={8}
        decay={2}
        intensity={0.34}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Işıklandırma — arenanın turuncu/cyan karşıtlığı.                    */
/* ------------------------------------------------------------------ */

/**
 * Haritanın kendi dolgu ışığı nötr kaldığı için atmosferin rengi buradan
 * gelir: lav tarafından sıcak ana ışık, karşı kenardan buzlu rim ışığı.
 * Dövüşçülerin ve zeminin üzerinde referanstaki turuncu↔cyan karşıtlığını
 * kurar; her yönlü ışık gibi simülasyona dokunmaz.
 */
function VolcanicKeyLight() {
  const warm = useRef<THREE.DirectionalLight>(null);
  const cool = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    const t = performance.now() / 1000;
    // Arena3D'nin ana ışığı ArenaCamera paletinde sıcak tona çevrildiği
    // için bu iki ışık ince bir renk dolgusudur (parlaklığı şişirmez).
    // Şiddetler ölçülü: sahneyi turuncuya yıkayan asıl katman bunlardı.
    if (warm.current) warm.current.intensity = 0.2 + 0.035 * Math.sin(t * 0.9);
    if (cool.current)
      cool.current.intensity = 0.12 + 0.025 * Math.sin(t * 1.3 + 2);
  });
  return (
    <>
      {/* `mobaLight` işareti: ArenaCamera'nın palet geçişi bu ışıklara
          dokunmaz (kendi renk/siddetlerini burada korurlar). */}
      <directionalLight
        ref={warm}
        userData={{ mobaLight: true }}
        position={[20, 12, -10]}
        color="#ff9c3f"
        intensity={0.2}
      />
      <directionalLight
        ref={cool}
        userData={{ mobaLight: true }}
        position={[-14, 9, 18]}
        color="#49daff"
        intensity={0.12}
      />
    </>
  );
}

/**
 * Prosedürel çevre haritası (Environment + Lightformer).
 *
 * Şampiyonların ve kristalin ışığı gerçekten YANSITMASI için sahneye bir
 * environment map gerekir: bir yanda lavdan gelen turuncu, karşıda cyan bir
 * ışık levhası. Ağdan HDRI indirilmez (offline/güvenli) — `frames={1}` ile
 * yalnızca bir kez 96px'lik bir küpe pişirilir, yani kare başına maliyeti yok.
 * `environmentIntensity` düşük tutulur: amaç atmosferi aydınlatmak değil
 * metallere yansıma vermek, bu yüzden kontrast korunur.
 */
function ArenaEnvironment() {
  return (
    <Environment resolution={96} frames={1} environmentIntensity={0.26}>
      <Lightformer
        form="rect"
        intensity={0.85}
        color="#ff8a2b"
        scale={[12, 5, 1]}
        position={[7, 3, -7]}
        target={[0, 0, 0]}
      />
      <Lightformer
        form="rect"
        intensity={0.6}
        color="#3fd8ff"
        scale={[10, 4, 1]}
        position={[-7, 2.5, 7]}
        target={[0, 0, 0]}
      />
      <Lightformer
        form="circle"
        intensity={0.25}
        color="#ffe3bd"
        scale={5}
        position={[0, 7, 0]}
        target={[0, 0, 0]}
      />
    </Environment>
  );
}

/* ------------------------------------------------------------------ */
/* Kor parçacıkları ve volkanik gökyüzü.                               */
/* ------------------------------------------------------------------ */

const EMBER_COUNT = 54;
/** Kor tohumları: sabit tohumlu üreticiden (render sırasında saf kalır). */
const emberSeeds = (() => {
  const rnd = makeRng(1337);
  return Array.from({ length: EMBER_COUNT }, () => ({
    x: rnd() * ARENA_W,
    z: rnd() * ARENA_D,
    y: rnd() * 4.5,
    speed: 0.16 + rnd() * 0.42,
    phase: rnd() * Math.PI * 2,
    size: 0.05 + rnd() * 0.13,
    cold: rnd() < 0.18,
  }));
})();

function WarEmbers() {
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  const seed = useRef(emberSeeds);
  const warmTex = useMemo(() => makeGlowTexture("rgba(255,182,86,1)"), []);
  const coldTex = useMemo(() => makeGlowTexture("rgba(150,230,255,1)"), []);
  const respawn = useRef(makeRng(4242));

  useFrame((_, dt) => {
    const now = performance.now() / 1000;
    for (let i = 0; i < EMBER_COUNT; i++) {
      const s = refs.current[i];
      const p = seed.current[i];
      if (!s) continue;
      p.y += p.speed * dt;
      p.x += Math.sin(now * 0.6 + p.phase) * dt * 0.22;
      p.z += Math.cos(now * 0.5 + p.phase * 1.3) * dt * 0.16;
      if (p.y > 5.2) {
        p.y = 0.08;
        p.x = respawn.current() * ARENA_W;
        p.z = respawn.current() * ARENA_D;
      }
      s.position.set(p.x, p.y, p.z);
      const flicker = 0.5 + 0.5 * Math.sin(now * 3.4 + p.phase * 4);
      (s.material as THREE.SpriteMaterial).opacity = flicker * 0.45;
      s.scale.set(p.size, p.size, 1);
    }
  });

  return (
    <group>
      {emberSeeds.map((ember, i) => (
        <sprite
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          raycast={() => null}
        >            <spriteMaterial
              map={ember.cold ? coldTex : warmTex}
              color={ember.cold ? "#9fe8ff" : "#ffb050"}
              transparent
              opacity={0.45}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      ))}
    </group>
  );
}

/** Volkanik gökyüzü: ufukta kor parıltısı, dönen tanrı ışınları ve kül. */
function BattleSky() {
  const raysRef = useRef<THREE.Group>(null);
  const ashRef = useRef<THREE.Points>(null);
  const sunTex = useMemo(() => makeGlowTexture("rgba(255,150,80,1)"), []);

  const ash = useMemo(() => {
    const count = 260;
    const rnd = makeRng(777);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rnd() - 0.5) * 90;
      positions[i * 3 + 1] = 2 + rnd() * 34;
      positions[i * 3 + 2] = (rnd() - 0.5) * 90;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  useFrame((_, dt) => {
    if (raysRef.current) raysRef.current.rotation.z += dt * 0.035;
    if (ashRef.current) {
      ashRef.current.rotation.y += dt * 0.02;
      const pos = ashRef.current.geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i += 1) {
        const y = pos.getY(i) - dt * (0.35 + (i % 5) * 0.06);
        pos.setY(i, y < 1.5 ? 34 : y);
      }
      pos.needsUpdate = true;
    }
  });

  return (
    <>
      {/* ufuktaki volkanik parıltı */}
      <group position={[-12, 7.5, -14]}>
        <group ref={raysRef}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <mesh
              key={i}
              rotation={[-Math.PI / 2, 0, (i * Math.PI) / 4]}
              raycast={() => null}
            >
              <planeGeometry args={[12, 0.5]} />
              <meshBasicMaterial
                color="#ff9a4d"
                transparent
                opacity={0.022}
                blending={THREE.AdditiveBlending}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
        <sprite scale={[5.5, 5.5, 1]} raycast={() => null}>
          <spriteMaterial
            map={sunTex}
            color="#ff8a44"
            transparent
            opacity={0.16}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      </group>
      {/* süzülen kül */}
      <points ref={ashRef} geometry={ash} raycast={() => null}>
        <pointsMaterial
          color="#ffbb8a"
          size={0.14}
          sizeAttenuation
          transparent
          opacity={0.2}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </>
  );
}

/** Zemin altı kor sızıntısı: haritanın çevresini saran sıcak parıltı. */
function GroundHaze() {
  const tex = useMemo(() => makeGlowTexture("rgba(255,110,40,1)"), []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const t = performance.now() / 1000;
    (ref.current.material as THREE.MeshBasicMaterial).opacity =
      0.024 + 0.008 * Math.sin(t * 0.8);
  });
  return (
    <mesh
      ref={ref}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[ARENA_W / 2, -0.4, ARENA_D / 2]}
      raycast={() => null}
    >
      <planeGeometry args={[ARENA_W * 3.2, ARENA_D * 3.2]} />
      <meshBasicMaterial
        map={tex}
        color="#ff6a1f"
        transparent
        opacity={0.018}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Lane yolları — netleştirilmiş, kenarları ışıyan koridor.           */
/* ------------------------------------------------------------------ */

/**
 * Düğüm listesini teğete DİK yönde kaydırır. Yolun iki kenar çizgisi bu
 * kaydırılmış eğrilerden çizilir; böylece koridor "yol" olarak okunur.
 */
function offsetNodes(
  nodes: [number, number][],
  dist: number,
): THREE.Vector3[] {
  return nodes.map(([x, z], i) => {
    const prev = nodes[Math.max(0, i - 1)];
    const next = nodes[Math.min(nodes.length - 1, i + 1)];
    const tx = next[0] - prev[0];
    const tz = next[1] - prev[1];
    const len = Math.hypot(tx, tz) || 1;
    return new THREE.Vector3(x + (-tz / len) * dist, 0.1, z + (tx / len) * dist);
  });
}

/**
 * Üç koridor: üst (sıcak amber), orta (mor), alt (buz mavisi). Renkler
 * haritanın iki yarısının paletiyle uyumlu — kırmızı yanda sıcak, mavi yanda
 * soğuk/berrak tonlar.
 */
const LANES: { nodes: [number, number][]; road: string; glow: string }[] = [
  {
    nodes: [
      [2.5, 4],
      [7.5, 7.6],
      [13, 10.8],
      [18.5, 14],
      [24, 17.2],
      [29.5, 20.2],
    ],
    road: "#a97a4e",
    glow: "#ffb469",
  },
  {
    nodes: [
      [-2.5, 10.5],
      [4, 13],
      [10, 15.4],
      [16.5, 16.6],
      [23, 17.2],
      [29.5, 17.4],
    ],
    road: "#6d6ba8",
    glow: "#b49aff",
  },
  {
    nodes: [
      [2.5, 18.5],
      [7, 16.6],
      [11.5, 13.2],
      [16, 9.2],
      [20.5, 6.4],
      [25.5, 4.6],
    ],
    road: "#5c7fa8",
    glow: "#6fd8ff",
  },
];

function LaneRoads() {
  // Tek akış dokusu: her lane kendi rengini materyal `color`'ından alır.
  const tex = useMemo(() => makeFlowTexture(), []);
  const curves = useMemo(
    () =>
      LANES.map(
        (lane) =>
          new THREE.CatmullRomCurve3(
            lane.nodes.map(([x, z]) => new THREE.Vector3(x, 0.11, z)),
          ),
      ),
    [],
  );
  const edges = useMemo(
    () =>
      LANES.flatMap((lane) => [
        new THREE.CatmullRomCurve3(offsetNodes(lane.nodes, 1.5)),
        new THREE.CatmullRomCurve3(offsetNodes(lane.nodes, -1.5)),
      ]),
    [],
  );

  useFrame((_, dt) => {
    tex.offset.x -= dt * 0.09;
  });

  return (
    <group>
      {curves.map((curve, i) => (
        <group key={i}>
          {/* Yol gövdesi: yansıtıcı, hafif parlak taş şerit (ışığı yansıtır). */}
          <mesh scale={[1, 0.055, 1]} receiveShadow raycast={() => null}>
            <tubeGeometry args={[curve, 150, 1.55, 10, false]} />
            <meshStandardMaterial
              map={tex}
              color={LANES[i].road}
              roughness={0.28}
              metalness={0.55}
              envMapIntensity={1.3}
              transparent
              opacity={0.92}
              depthWrite={false}
            />
          </mesh>
          {/* Yolun enerji çekirdeği: bloom besleyen ince ışık hattı. */}
          <mesh raycast={() => null}>
            <tubeGeometry args={[curve, 150, 0.16, 8, false]} />
            <meshBasicMaterial
              map={tex}
              color={LANES[i].glow}
              transparent
              opacity={0.42}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      {/* Kenar çizgileri: koridorun sınırı uzaktan da okunur. */}
      {edges.map((curve, i) => (
        <mesh key={`edge${i}`} raycast={() => null}>
          <tubeGeometry args={[curve, 150, 0.075, 6, false]} />
          <meshBasicMaterial
            color={LANES[Math.floor(i / 2)].glow}
            transparent
            opacity={0.5}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Enerji hatları + bölge auraları (renk doygunluğu)                   */
/* ------------------------------------------------------------------ */

/** Üslerden arenanın merkezine akan enerji hatları (kor ↔ kristal). */
function EnergyLines() {
  const tex = useMemo(() => makeFlowTexture(), []);
  const curves = useMemo(() => {
    const mid = new THREE.Vector3(ARENA_W / 2, 0.14, ARENA_D / 2);
    return NEXUS.map(
      (n, i) =>
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(n.x, 0.14, n.z),
          new THREE.Vector3(
            (n.x + mid.x) / 2 + (i === 0 ? 1.6 : -1.6),
            0.14,
            (n.z + mid.z) / 2 + (i === 0 ? -1.3 : 1.3),
          ),
          mid,
        ]),
    );
  }, []);
  const refs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((_, dt) => {
    tex.offset.x -= dt * 0.35;
    const t = performance.now() / 1000;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      (m.material as THREE.MeshBasicMaterial).opacity =
        0.55 + 0.25 * Math.sin(t * 2.4 + i * Math.PI);
    }
  });

  return (
    <group>
      {curves.map((curve, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          raycast={() => null}
        >
          <tubeGeometry args={[curve, 90, 0.2, 8, false]} />
          <meshBasicMaterial
            map={tex}
            color={NEXUS[i]?.color ?? "#ff7a3c"}
            transparent
            opacity={0.6}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Bölge auraları: kırmızı yarı KOYU TURUNCU-KIRMIZI, mavi yarı BERRAK
 * MAVİ-MOR. Zemin tek tip kalmıyor; iki yarının rengi ayrı okunuyor.
 */
function ZoneAuras() {
  const warmTex = useMemo(() => makeGlowTexture("rgba(255,72,20,1)"), []);
  const coldTex = useMemo(() => makeGlowTexture("rgba(146,118,255,1)"), []);
  const warmRef = useRef<THREE.Mesh>(null);
  const coldRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const t = performance.now() / 1000;
    // Bölge auraları artık zemin detayını yıkamıyor: iki dev additive düzlem
    // tüm arenayı kapladığında kare turuncu-mor bir sise dönüşüyordu. Şimdi
    // her aura kendi yarısına oturur ve şiddeti yarıya indirildi.
    if (warmRef.current) {
      (warmRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.028 + 0.01 * Math.sin(t * 0.9);
    }
    if (coldRef.current) {
      (coldRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.032 + 0.01 * Math.sin(t * 1.1 + 1.5);
    }
  });

  return (
    <group>
      <mesh
        ref={warmRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[9, 0.045, 7]}
        raycast={() => null}
      >
        <planeGeometry args={[19, 15]} />
        <meshBasicMaterial
          map={warmTex}
          color="#ff3d12"
          transparent
          opacity={0.028}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh
        ref={coldRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[25.5, 0.045, 14]}
        raycast={() => null}
      >
        <planeGeometry args={[17, 15]} />
        <meshBasicMaterial
          map={coldTex}
          color="#7c5cff"
          transparent
          opacity={0.032}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Kristal/su bölgesi (mavi-mor yarı) + yansımalar                     */
/* ------------------------------------------------------------------ */

const GROVE = [
  { x: 23.5, z: 8.5, s: 1.5 },
  { x: 26.8, z: 6.4, s: 1.1 },
  { x: 28.8, z: 10.2, s: 0.9 },
  { x: 21.4, z: 4.4, s: 1.3 },
  { x: 29.2, z: 14.6, s: 1.0 },
  { x: 20.4, z: 11.8, s: 0.8 },
];

/**
 * Berrak mavi-mor kristal vadisİ: ayna gibi bir su/kristal havuzu ve
 * etrafında yükselen kristaller. Havuz metalness 0.9 + çok düşük roughness
 * ile sahnenin çevre haritasını gerçekten yansıtır.
 */
function CrystalGrove() {
  const shards = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const t = performance.now() / 1000;
    for (let i = 0; i < GROVE.length; i++) {
      const m = shards.current[i];
      if (!m) continue;
      const g = GROVE[i];
      m.position.y = g.s * 0.5 + Math.sin(t * 1.4 + i * 1.7) * 0.08;
      m.rotation.y += 0.004;
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.9 + 0.4 * Math.sin(t * 2 + i);
    }
  });

  return (
    <group>
      {/* Su/kristal havuzu — yansıtıcı yüzey */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[25, 0.06, 9]}
        raycast={() => null}
      >
        <circleGeometry args={[6.6, 56]} />
        <meshStandardMaterial
          color="#2a1f5e"
          emissive="#3b2a8c"
          emissiveIntensity={0.22}
          roughness={0.06}
          metalness={0.92}
          envMapIntensity={1.8}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>
      {GROVE.map((c, i) => (
        <mesh
          key={i}
          ref={(el) => {
            shards.current[i] = el;
          }}
          position={[c.x, c.s * 0.5, c.z]}
          rotation={[0.1, i * 0.7, 0.12]}
          scale={c.s}
          castShadow
          raycast={() => null}
        >
          <octahedronGeometry args={[0.42, 0]} />
          <meshStandardMaterial
            color="#c8b6ff"
            emissive="#8b5cff"
            emissiveIntensity={1.05}
            roughness={0.07}
            metalness={0.35}
            envMapIntensity={1.7}
            transparent
            opacity={0.9}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Taş yapılar: duvarlar, kayalar, dikilitaşlar, kemerler              */
/* ------------------------------------------------------------------ */

/** Duvar blokaları: arenanın çevresini saran kırık taş sur. */
const WALL_BLOCKS = (() => {
  const rnd = makeRng(20240);
  const out: {
    x: number;
    z: number;
    w: number;
    h: number;
    d: number;
    r: number;
  }[] = [];
  for (let x = -1.6; x < ARENA_W + 1.6; x += 2.2) {
    for (const z of [-1.5, ARENA_D + 1.5]) {
      out.push({
        x: x + (rnd() - 0.5) * 0.6,
        z,
        w: 1.6 + rnd() * 0.7,
        h: 0.6 + rnd() * 1.5,
        d: 1.2 + rnd() * 0.5,
        r: (rnd() - 0.5) * 0.14,
      });
    }
  }
  for (let z = -1.6; z < ARENA_D + 1.6; z += 2.5) {
    for (const x of [-1.5, ARENA_W + 1.5]) {
      out.push({
        x,
        z: z + (rnd() - 0.5) * 0.6,
        w: 1.2 + rnd() * 0.5,
        h: 0.5 + rnd() * 1.2,
        d: 1.6 + rnd() * 0.7,
        r: (rnd() - 0.5) * 0.14,
      });
    }
  }
  return out;
})();

/** Haritanın köşelerindeki kaya kütleleri (oyun alanını boş bırakır). */
const BOULDERS = (() => {
  const rnd = makeRng(5150);
  const spots: [number, number][] = [
    [1.5, 1.5],
    [5.5, 20.5],
    [15.5, 1.2],
    [32.5, 20.4],
    [32.8, 2.2],
    [11, 20.6],
  ];
  return spots.flatMap(([bx, bz]) =>
    Array.from({ length: 3 }, () => ({
      x: bx + (rnd() - 0.5) * 2.6,
      z: bz + (rnd() - 0.5) * 2.6,
      s: 0.5 + rnd() * 0.9,
      r: rnd() * Math.PI,
    })),
  );
})();

/** Koridor boyunca duran, tepesinde rün taşıyan dikilitaşlar. */
const OBELISKS: { x: number; z: number; glow: string }[] = [
  { x: 5.2, z: 8.8, glow: "#ff8a3c" },
  { x: 9.6, z: 12.4, glow: "#ff6a1f" },
  { x: 20.6, z: 14.6, glow: "#8b5cff" },
  { x: 26.2, z: 12.4, glow: "#6fd8ff" },
  { x: 14.8, z: 6.4, glow: "#7c5cff" },
  { x: 30.6, z: 7.4, glow: "#5ce1ff" },
];

function StoneStructures() {
  const stone = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3b3742",
        roughness: 0.86,
        metalness: 0.18,
        envMapIntensity: 0.7,
      }),
    [],
  );
  const obeliskMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#4a4452",
        roughness: 0.7,
        metalness: 0.3,
        envMapIntensity: 0.9,
      }),
    [],
  );
  const runeRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const t = performance.now() / 1000;
    for (let i = 0; i < OBELISKS.length; i++) {
      const m = runeRefs.current[i];
      if (!m) continue;
      m.rotation.y += 0.01;
      (m.material as THREE.MeshStandardMaterial).emissiveIntensity =
        1.1 + 0.5 * Math.sin(t * 2.2 + i * 1.4);
    }
  });

  return (
    <group>
      {/* çevre suru */}
      {WALL_BLOCKS.map((b, i) => (
        <mesh
          key={`wall${i}`}
          material={stone}
          position={[b.x, b.h / 2, b.z]}
          rotation={[0, b.r, 0]}
          castShadow
          receiveShadow
          raycast={() => null}
        >
          <boxGeometry args={[b.w, b.h, b.d]} />
        </mesh>
      ))}
      {/* kaya kütleleri */}
      {BOULDERS.map((b, i) => (
        <mesh
          key={`rock${i}`}
          material={stone}
          position={[b.x, b.s * 0.42, b.z]}
          rotation={[b.r * 0.3, b.r, b.r * 0.2]}
          scale={[b.s, b.s * 0.8, b.s]}
          castShadow
          receiveShadow
          raycast={() => null}
        >
          <icosahedronGeometry args={[0.62, 0]} />
        </mesh>
      ))}
      {/* dikilitaşlar + tepelerindeki rün taşı */}
      {OBELISKS.map((o, i) => (
        <group key={`ob${i}`} position={[o.x, 0, o.z]}>
          <mesh material={obeliskMat} position={[0, 0.85, 0]} castShadow raycast={() => null}>
            <cylinderGeometry args={[0.18, 0.34, 1.7, 6]} />
          </mesh>
          <mesh
            ref={(el) => {
              runeRefs.current[i] = el;
            }}
            position={[0, 1.92, 0]}
            raycast={() => null}
          >
            <octahedronGeometry args={[0.26, 0]} />
            <meshStandardMaterial
              color="#f4ecff"
              emissive={o.glow}
              emissiveIntensity={1.2}
              roughness={0.12}
              metalness={0.3}
              toneMapped={false}
            />
          </mesh>
          {/* Her dikilitaşa nokta ışık EKLENMEZ: altı ışık daha mobil GPU'da
              tüm gölgeli yüzeyler için kare maliyetini şişirirdi. Rün taşı
              kendi emissive'i + bloom ile zaten çevresine ışık saçıyor. */}
        </group>
      ))}
      {/* koridoru taçlandıran taş kemerler */}
      {[8.5, 25.5].map((x, i) => (
        <group key={`arch${i}`} position={[x, 0, 15.6]} rotation={[0, i === 0 ? 0.5 : -0.5, 0]}>
          <mesh material={obeliskMat} position={[-1.9, 1.1, 0]} castShadow raycast={() => null}>
            <boxGeometry args={[0.45, 2.2, 0.45]} />
          </mesh>
          <mesh material={obeliskMat} position={[1.9, 1.1, 0]} castShadow raycast={() => null}>
            <boxGeometry args={[0.45, 2.2, 0.45]} />
          </mesh>
          <mesh material={obeliskMat} position={[0, 2.1, 0]} castShadow raycast={() => null}>
            <torusGeometry args={[1.95, 0.26, 8, 18, Math.PI]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Yansımalar ve karakter gölgeleri                                    */
/* ------------------------------------------------------------------ */

/**
 * İnce yansıtıcı katman: taş zeminin üzerinde çok düşük opaklıkta metalik
 * bir düzlem durur ve çevre haritasını yansıtır — "ıslak taş" hissi. Zemin
 * detayını gizlememesi için opaklığı düşüktür.
 */
function ReflectiveFloor() {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[ARENA_W / 2, 0.03, ARENA_D / 2]}
      raycast={() => null}
    >
      <planeGeometry args={[ARENA_W, ARENA_D]} />
      <meshStandardMaterial
        color="#0b1020"
        metalness={0.9}
        roughness={0.2}
        envMapIntensity={1.5}
        transparent
        opacity={0.16}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * Karakter gölgeleri: Arena3D'nin ışıkları gölge düşürmez (castShadow yok),
 * bu yüzden gölge düşüren tek yönlü ışık buradan gelir. Zayıf cihazlarda
 * (pointer: coarse) hiç eklenmez — gölge haritası maliyeti mobilde istenmez,
 * ayrıca Canvas'ın `shadows` bayrağı da orada kapalıdır.
 */
function ArenaShadowLight() {
  const coarse = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches,
    [],
  );
  if (coarse) return null;
  return <ArenaShadowCaster />;
}

/**
 * Gölge düşüren ışığın kendisi. Hedefi arenanın MERKEZİNE kilitlenir: yönlü
 * ışığın varsayılan hedefi (0, 0, 0) haritanın köşesinde kalırdı ve gölge
 * kamerasının çerçevesi arenanın yarısını dışarıda bırakırdı.
 */
function ArenaShadowCaster() {
  const ref = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const light = ref.current;
    if (!light) return;
    // Hedef nesne sahne grafiğinin dışında durduğu için dünya matrisi elle
    // tazelenir; aksi halde ışık hâlâ orijine bakar ve gölge çerçevesi
    // arenanın dışına kayar.
    const target = new THREE.Object3D();
    target.position.set(ARENA_W / 2, 0, ARENA_D / 2);
    target.updateMatrixWorld();
    light.target = target;
  }, []);
  return (
    <directionalLight
      ref={ref}
      userData={{ mobaLight: true }}
      position={[ARENA_W / 2 + 14, 20, ARENA_D / 2 - 10]}
      color="#ffe6c8"
      intensity={0.46}
      castShadow
      shadow-mapSize={[1024, 1024]}
      shadow-camera-left={-24}
      shadow-camera-right={24}
      shadow-camera-top={24}
      shadow-camera-bottom={-24}
      shadow-camera-near={1}
      shadow-camera-far={64}
      shadow-bias={-0.0009}
      shadow-normalBias={0.02}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Savaş alanı paleti — haritanın kendi dokuları bazalt tonuna çekilir. */
/* ------------------------------------------------------------------ */

/**
 * Haritanın yüklediği GLB'yi (drei önbelleğinden, kopya indirmeden) alır ve
 * yalnızca o modelin materyallerini volkanik palete çeker: doku korunur,
 * renk doygunluğu yükseltilir ve bölgeye göre renklendirilir — kırmızı üs
 * yarısı koyu turuncu-kırmızı, mavi üs yarısı berrak mavi-mor. Böylece
 * cangıl yeşili yerine iki bölgeli bir MOBA arazisi okunur. Karakterler,
 * kostümler ve çalılar etkilenmez, çünkü geçiş yalnızca bu modelin kendi
 * sahne grafiğinde çalışır.
 */
export function MapPalette() {
  const { scene } = useGLTF(MAP_URL);

  useEffect(() => {
    // BÖLGESEL PALET: her mesh'in dünya konumuna göre iki ton arasında
    // yumuşak geçiş yapılır.
    //   • kırmızı üs yarısı (x≈4)  → koyu turuncu-kırmızı
    //   • mavi üs yarısı   (x≈30)  → berrak mavi-mor
    // Tek tip gri çarpan artık yok: arazi iki yarıda farklı renkte okunur ve
    // renk doygunluğu yükseldi (nötr çarpan 0.76 civarı, bölge tonu üstüne).
    const warm = new THREE.Color(0.94, 0.82, 0.74);
    const cool = new THREE.Color(0.76, 0.82, 0.98);
    const neutral = new THREE.Color(0.72, 0.71, 0.73);
    const warmEmissive = new THREE.Color(0x33_09_03);
    const coolEmissive = new THREE.Color(0x08_0c_33);
    const world = new THREE.Vector3();
    const zone = new THREE.Color();

    scene.updateMatrixWorld(true);
    // Bölge ekseni: harita sahneye ROT_Y = -90° ile oturtulduğu için arenanın
    // X ekseni model uzayında -Z'ye karşılık gelir (R_y(-90°)·(x,z) = (-z, x)).
    // Bu yüzden bölge ayrımı modelin Z ekseni üzerinden yapılır; kırmızı üs
    // büyük Z tarafında, mavi üs küçük Z tarafındadır. Ölçek ofsetini bilmek
    // gerekmesin diye aralık modelin kendi sınır kutusundan türetilir.
    const bounds = new THREE.Box3().setFromObject(scene);
    const zMin = bounds.min.z;
    const zSpan = Math.max(1, bounds.max.z - zMin);
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      mesh.getWorldPosition(world);
      // 0 → kırmızı yarı (lav), 1 → mavi yarı (kristal/su). Ramp hafif
      // sıkıştırılır (0.08…0.9 aralığı): kenarlardaki fazladan geometri
      // yüzünden sınır kutusu büyürse bile iki bölge tam doygunluğa ulaşır.
      const t = THREE.MathUtils.clamp(
        (bounds.max.z - world.z) / zSpan / 0.82 - 0.1,
        0,
        1,
      );
      zone.copy(warm).lerp(cool, t).multiply(neutral);
      const list = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const entry of list) {
        const material = entry as THREE.MeshStandardMaterial;
        // Aynı materyal birden fazla mesh'te paylaşılabildiği için işaretlenir.
        if (material.userData?.volcanicPalette) continue;
        material.userData = { ...material.userData, volcanicPalette: true };
        material.color?.multiply(zone);
        // Yansıma: zemin hafif metalik ve daha pürüzsüz — ışığı yansıtır.
        if (typeof material.roughness === "number") {
          material.roughness = Math.max(0.34, material.roughness * 0.9);
        }
        if (typeof material.metalness === "number") {
          material.metalness = Math.min(0.9, material.metalness + 0.1);
        }
        // Bölgenin rengi çok hafif bir ışıma olarak da zeminin kendisinden
        // gelir (kırmızı yanda kor, mavi yanda kristal ışıması).
        material.emissive = warmEmissive.clone().lerp(coolEmissive, t);
        material.emissiveIntensity = 0.05;
        // Çevre haritası yansımaları bu kez İSTENİYOR (yansıtıcı zemin),
        // ama 1.0'ın altında kalır ki doku detayı yıkanmasın.
        if (typeof material.envMapIntensity === "number") {
          material.envMapIntensity = 0.45;
        }
      }
    });
  }, [scene]);

  return null;
}

/**
 * Rendered by the battle map so it lands inside the Arena3D Canvas as a
 * sibling of the map (not affected by the map's fit transform).
 */
export function WarAtmosphere() {
  return (
    <>
      {/* Bloom zinciri (RenderPass → UnrealBloomPass → OutputPass) */}
      <ArenaPostFx />
      <ArenaEnvironment />
      <ArenaShadowLight />
      <VolcanicKeyLight />
      <MagmaLights />
      <GroundHaze />
      {/* Renk doygunluğu: iki yarının bölge auraları + yansıtıcı zemin */}
      <ZoneAuras />
      <ReflectiveFloor />
      {/* Ortam detayı: netleşmiş lane yolları, enerji hatları, taş yapılar */}
      <LaneRoads />
      <EnergyLines />
      <CrystalGrove />
      <StoneStructures />
      <LavaRivers />
      <LavaPools />
      {NEXUS.map((n) => (
        <NexusCrystal
          key={n.color}
          x={n.x}
          z={n.z}
          color={n.color}
          core={n.core}
          accent={n.accent}
        />
      ))}
      <WarEmbers />
      <BattleSky />
    </>
  );
}
