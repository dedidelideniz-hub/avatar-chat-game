// WarAtmosphere — MOBA maç atmosferi (yalnızca görsel).
//
// Wild Rift / LoL Mobile referansındaki harita dilini kurar: bazalt zemin
// üzerinde akan LAV nehirleri, her üssün tepesinde yükselen KRİSTAL çekirdek
// (nexus) ve ondan yükselen ışık sütunu, süzülen kor parçacıkları ve volkanik
// gökyüzü. Üstüne zengin ortam katmanı biner:
//   • Zemin — haritanın KENDİ dokuları (çimen/taş/toprak) korunur; yalnızca
//     sonradan binen yansıma ve kendinden parlama temizlenir (MapPalette).
//   • Lane yolları (taş/toprak şerit) + çok ince kenar ışıkları, üslerden
//     merkeze akan ince enerji hatları.
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

/* Lav nehirleri (yolu ve haritayı boydan boya kesen additive kor tüpleri)
   TAMAMEN KALDIRILDI: ekranda kırmızı/turuncu lazer şeritleri gibi okunuyor
   ve zemin dokusunu kapatıyorlardı. Lav artık yalnızca göl havuzları ve
   üs kristalleriyle temsil edilir. */

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
    // Kule (üs) kristali: parlak ortam ışığı altında bile sönük kalmasın diye
    // emissive yükseltildi — neredeyse "unlit" davranır, karanlıkta da gündüzde
    // de doygun renkte okunur ve bloom eşiğini geçip etrafına ışık saçar.
    if (crystalMat.current) {
      crystalMat.current.emissiveIntensity = 1.15 + 0.35 * pulse;
    }
    if (beam.current) {
      const mat = beam.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.06 + 0.02 * pulse;
      beam.current.scale.set(1 + 0.03 * pulse, 1, 1 + 0.03 * pulse);
    }
    if (haloRef.current) {
      (haloRef.current.material as THREE.SpriteMaterial).opacity =
        0.09 + 0.03 * pulse;
      haloRef.current.scale.setScalar(2.6 + 0.2 * pulse);
    }
    if (light.current) light.current.intensity = 0.5 + 0.18 * pulse;
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
            emissiveIntensity={1.15}
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
            emissiveIntensity={1.25}
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
            emissiveIntensity={1.0}
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
                emissiveIntensity={0.95}
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
        intensity={0.5}
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
        >
          {" "}
          <spriteMaterial
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
/* LANE YOLLARI (LaneRoads / LANES) TAMAMEN KALDIRILDI.                */
/* ------------------------------------------------------------------ */
/* Koridorun tam ortasına serilen düz gri tubeGeometry şeritleri haritanın
   kendi zemin kaplamasını (çimen/taş/toprak) örtüyordu; artık hiçbir yol
   overlay mesh'i yok. Zemin yalnızca haritanın kendi dokusu.
   Daha önce kaldırılanlar: kenar ışık çizgileri, akan enerji çekirdeği ve
   bunların üreticisi olan `offsetNodes`. */

/* Zeminin üstüne binen bölge auraları TAMAMEN KALDIRILDI: iki dev additive
   düzlem tüm arenayı kaplayıp zeminin kendi dokusunu (çimen/taş/toprak) neon
   bir peçeyle yıkıyordu — ekranı saran mor/mavi şeritlerin asıl kaynağı buydu.
   Bölgesel ayrım artık yalnızca lane yollarının kendi renklerinden ve üs
   kristallerinden okunuyor; zemine düzlemsel renk katmanı binmiyor. */

/* Kristal vadi TAMAMEN KALDIRILDI: yarı saydam mor su diski ve üzerinde
   süzülen kaplamasız mor oktahedronlar ("baklava" parçaları) ormanın üzerinde
   havada duran bozuk/debug parçalar gibi okunuyordu. Zemin artık haritanın
   kendi dokusu; bölgesel vurgu yalnızca üs kristalleri ve lavdan gelir. */

/* ------------------------------------------------------------------ */
/* Taş yapılar: duvarlar, kayalar, dikilitaşlar, kemerler              */
/* ------------------------------------------------------------------ */

/* Çevre suru (WALL_BLOCKS) KALDIRILDI: arena sınırının dışında kalan kırık
   taş küpler haritanın kenarında/üstünde havada duran kaplamasız kutular gibi
   görünüyordu. Çevre artık haritanın kendi kayaları ve dikilitaşlarıdır. */

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
  { x: 20.6, z: 14.6, glow: "#5ce1ff" },
  { x: 26.2, z: 12.4, glow: "#6fd8ff" },
  { x: 14.8, z: 6.4, glow: "#ff8a3c" },
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
          <mesh
            material={obeliskMat}
            position={[0, 0.85, 0]}
            castShadow
            raycast={() => null}
          >
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
      {/* Koridorun üstündeki kare taş/kemer kutuları KALDIRILDI: yolun
          tam üzerinde duruyor ve kaplamasız kutu gibi okunuyorlardı. */}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Yansımalar ve karakter gölgeleri                                    */
/* ------------------------------------------------------------------ */

/* Yansıtıcı zemin katmanı (ReflectiveFloor) KALDIRILDI: yolun üzerinde
   duran, çevre haritasını yansıtan yarı saydam düzlem ve benzeri kaplama
   panelleri zemini kirletiyordu. Yol artık haritanın kendi pürüzsüz
   taş/toprak dokusundan ibarettir. */

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
/* Savaş alanı zemini — haritanın KENDİ dokuları korunur, zemine neon ton
   çarpanı ve kendinden parlama uygulanmaz. */
/* ------------------------------------------------------------------ */

/** Harita materyallerinin "doğal zemin" olarak işaretlendiği userData anahtarı. */
const GROUND_MARK = "vaelosGround";

/**
 * Harita materyalini ZEMİN gibi davranmaya zorlar; dokusuna (diffuse/map)
 * dokunmaz. Amaç, kaplamaların "patlamış" görünmesini bitirmek:
 *
 *   • Işık almayan/eski tip bir materyal (MeshBasicMaterial vb.) yüzünden zemin
 *     boyanmış gibi düz duruyorsa MeshStandardMaterial'a yükseltilir; diffuse
 *     haritası ve rengi aynen taşınır.
 *   • Zemine sonradan binen çok sönük bölge ışıması tamamen geri alınır;
 *     haritanın kendi ışıması varsa yalnızca 1'in üstü kısılır. Yani "haritanın
 *     kendisi parlıyor" durumu biter — yalnızca yetenekler ve kristaller parlar.
 *   • Zemin ayna gibi davranmaz: roughness yükseltilir, metalness ve çevre
 *     yansıması düşürülür. Böylece taş/toprak/çimen dokusu okunur kalır ve
 *     çevre haritasının mor/mavi ışıkları zemine neon şerit olarak yansımaz.
 */
function normalizeGroundMaterial(source: THREE.Material): THREE.Material {
  if (source.userData?.[GROUND_MARK]) return source;
  const standard = source as THREE.MeshStandardMaterial;
  let material: THREE.Material = source;
  if (typeof standard.roughness !== "number") {
    // Işık almayan yüzey: dokusu korunarak standart materyale yükseltilir.
    const legacy = source as THREE.MeshBasicMaterial;
    material = new THREE.MeshStandardMaterial({
      name: legacy.name,
      map: legacy.map ?? null,
      color: legacy.color ? legacy.color.clone() : new THREE.Color(0xffffff),
      vertexColors: legacy.vertexColors,
      side: legacy.side,
      transparent: legacy.transparent,
      opacity: legacy.opacity,
      alphaTest: legacy.alphaTest,
    });
  }
  const std = material as THREE.MeshStandardMaterial;
  std.userData = { ...std.userData, [GROUND_MARK]: true };
  if (std.emissive) {
    const maxChannel = Math.max(std.emissive.r, std.emissive.g, std.emissive.b);
    if (std.emissiveIntensity <= 0.06 && maxChannel <= 0.25) {
      // Zemine sonradan binen çok sönük bölge ışıması (eski palet geçişinin
      // kalıntısı) tamamen silinir: zemin kendinden parlamaz.
      std.emissive.setRGB(0, 0, 0);
      std.emissiveIntensity = 0;
    } else if (std.emissiveIntensity > 1) {
      // Haritanın kendi (dokulu) ışıması kısılır ama silinmez.
      std.emissiveIntensity = 1;
    }
  }
  if (typeof std.roughness === "number") {
    std.roughness = Math.max(0.6, std.roughness);
  }
  if (typeof std.metalness === "number") {
    std.metalness = Math.min(0.25, std.metalness);
  }
  std.envMapIntensity = 0.15;
  return material;
}

/**
 * Haritanın yüklediği GLB'yi (drei önbelleğinden, kopya indirmeden) alır ve
 * yalnızca o modelin materyallerini doğal zemin diline çeker. Haritanın KENDİ
 * dokuları (çimen, taş, toprak) aynen korunur: burada artık ne renk çarpanı ne
 * bölgesel mor/mavi ton uygulanır — ikisi de zemini neon bir ızgaraya
 * çeviriyordu. Karakterler, kostümler ve çalılar etkilenmez, çünkü geçiş
 * yalnızca bu modelin kendi sahne grafiğinde çalışır.
 */
export function MapPalette() {
  const { scene } = useGLTF(MAP_URL);

  useEffect(() => {
    // Aynı materyal birden fazla mesh'te paylaşılabildiği için dönüşüm
    // önbelleğe alınır; her mesh için yeni materyal üretilmez.
    const converted = new WeakMap<THREE.Material, THREE.Material>();
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const list = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      list.forEach((entry, index) => {
        const cached = converted.get(entry);
        const out = cached ?? normalizeGroundMaterial(entry);
        if (!cached) converted.set(entry, out);
        list[index] = out;
      });
      mesh.material = Array.isArray(mesh.material) ? list : list[0];
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
      {/* Ortam detayı: taş yapılar (lane yolu kaplaması kaldırıldı) */}
      <StoneStructures />
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
