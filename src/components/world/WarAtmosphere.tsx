// WarAtmosphere — MOBA maç atmosferi (yalnızca görsel).
//
// Wild Rift / LoL Mobile referansındaki harita dilini kurar: bazalt zemin
// üzerinde akan LAV nehirleri, her üssün tepesinde TAŞ kaide (kule gövdesi),
// onun üzerinde YUMUŞAK bir ışık kaynağı (parlama/lens flare) ve gökyüzüne
// yükselen ışık hüzmesi, süzülen kor parçacıkları ve volkanik gökyüzü. Üstüne zengin ortam katmanı biner:
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
//   • CANLI PALET — haritanın çimen/ağaç/patika/taş materyalleri doygunluğu
//     artırılmış (high-saturation low-poly) tona çekilir; kristal/büyü/ışıklı
//     objelere kendinden parlama (emissive 0.3) verilir (bkz. VIVID_*).
//   • KRİTİK NOKTA IŞIKLARI — kuleler ve nehir yatağı renkli, yumuşak nokta
//     ışıklarıyla çevresindeki zemini aydınlatır (bkz. CriticalPointLights).
// Hiçbiri hareket/çarpışma sistemine girmez: her mesh
// `raycast={() => null}` ile dokunma (tap) katmanını geçirir.
//
// Koordinatlar Arena3D ile aynıdır (S = 50 px/birim; arena 34 x 22 birim).
// Bileşen BattleMapModel içinde haritanın KARDEŞİ olarak render edilir, yani
// haritanın fit dönüşümünden etkilenmez ve doğrudan arena uzayında durur.
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, useGLTF } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ArenaPostFx } from "./ArenaPostFx";
import { DECOR_SCALE, scaleMapDecor } from "./mapDecorScale";
// 🌊 Akan su: zaman sürücüsü. Su materyalinin eşlenmesi çizilen klonun içinde
// (BattleMapModel) yapılır — harita glTF'inde su materyali bir arazi mesh'iyle
// paylaşıldığı için yerinde mutasyon o araziyi de dalgalandırırdı.
import { WaterFlow } from "./waterFlow";
import {
  makeStoneTexture,
  repairUntexturedStructureMaterials,
} from "./mapStoneRepair";

/** Savaş alanı GLB'sinin tek kaynağı (BattleMapModel de buradan okur). */
export const MAP_URL = "/models/5v5_game_map.glb";

const ARENA_W = 34;
const ARENA_D = 22; // arena kutusu (birim)

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

/**
 * Lens-flare şeridi (anamorfik parlama): ortada ince, uçlara doğru sönümlenen
 * yatay bir ışık bandı. Işık kaynağının tepesinde kaba bir kutu/kütle yerine
 * yumuşak bir parlama bırakmak için kullanılır; sprite olarak çizildiği için
 * her zaman kameraya bakar ve geometrisi yoktur.
 */
function makeStreakTexture() {
  const w = 256;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (g) {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const ny = (y - h / 2) / (h / 2);
      const falloffY = Math.exp(-ny * ny * 26);
      for (let x = 0; x < w; x++) {
        const nx = (x - w / 2) / (w / 2);
        const falloffX = Math.exp(-nx * nx * 3.2);
        const a = Math.max(0, Math.min(1, falloffX * falloffY));
        const i = (y * w + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(img, 0, 0);
  }
  return new THREE.CanvasTexture(canvas);
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

/* ------------------------------------------------------------------ */
/* KRİTİK NOKTA IŞIKLARI (dynamic point lighting)                      */
/* ------------------------------------------------------------------ */
/* Haritanın kritik noktalarını renkli, yumuşak nokta ışıklarıyla
   aydınlatır: KULELER (kırmızı üs → sıcak turuncu, mavi üs → buz mavisi) ve
   NEHİR YATAĞI (serin cyan). Böylece zeminde yol/nehir boyunca renkli ışık
   havuzları okunur ve "her yere eşit dağılmış ışık" hissi kırılır.

   NEDEN İSİMDEN BULUNUR (sabit koordinat tablosu değil): harita GLB'si
   asenkron yüklenir ve mesh adları gerçek yerleşimi taşır (Station/Tower =
   kule, River/Water = nehir). Sabit koordinatlar harita güncellendiğinde
   duvarın veya boşluğun üstüne düşerdi; isimden bulma kendini düzeltir.

   IŞIK BÜTÇESİ: en fazla 4 nokta (dokunmatikte 2). Her nokta ışığı kare
   başına tüm ışık alan yüzeylere maliyet eklediği için sayı kasıtlı küçük
   tutulur; şiddetler ArenaPostFx'in 0.5 tavanının altındadır ve `distance`
   ile sınırlıdır (uzaktaki zemin gereksiz aydınlanmaz). */
const CRITICAL_TOWER_RE = /(?:station|tower)/i;
const CRITICAL_RIVER_RE = /(?:river|water|stream|lake|pond|creek|canal)/i;

interface CriticalLight {
  x: number;
  y: number;
  z: number;
  color: string;
  intensity: number;
  distance: number;
  kind: "tower" | "river";
  /** Kümeleme için önem ölçüsü (kule: yükseklik, nehir: alan). */
  weight: number;
}

/** Kule rengi: takım adı kırmızı ise sıcak, mavi ise buzlu. */
function towerLightColor(semantic: string): string {
  if (/red|orange|fire|magma/i.test(semantic)) return "#ff7a3c";
  if (/blue|cyan|ice|frost/i.test(semantic)) return "#5ce1ff";
  return "#a9b8ff";
}

/** Yakın adaylar tek ışıkta birleştirilir (aynı kulenin 5 parçası → 1 ışık). */
function pickUniqueLights(list: CriticalLight[], radius = 5): CriticalLight[] {
  const out: CriticalLight[] = [];
  for (const candidate of [...list].sort((a, b) => b.weight - a.weight)) {
    if (
      out.some(
        (kept) =>
          Math.hypot(kept.x - candidate.x, kept.z - candidate.z) < radius,
      )
    )
      continue;
    out.push(candidate);
  }
  return out;
}

/** Sahnedeki kuleleri ve nehir yatağını bulup en fazla `max` nokta ışığı seçer. */
function collectCriticalLights(
  scene: THREE.Object3D,
  max: number,
): CriticalLight[] {
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const towers: CriticalLight[] = [];
  const rivers: CriticalLight[] = [];

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;
    const names: string[] = [];
    let node: THREE.Object3D | null = mesh;
    for (let i = 0; node && i < 6; node = node.parent, i++) {
      if (node.name) names.push(node.name);
    }
    const semantic = names.join("/");
    const isTower = CRITICAL_TOWER_RE.test(semantic);
    const isRiver = !isTower && CRITICAL_RIVER_RE.test(semantic);
    if (!isTower && !isRiver) return;

    box.setFromObject(mesh);
    if (box.isEmpty()) return;
    box.getSize(size);
    // Zemin decal'i / kaide değil, gerçekten yükselen kule aranır.
    if (isTower && size.y < 1) return;

    const x = (box.min.x + box.max.x) / 2;
    const z = (box.min.z + box.max.z) / 2;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;

    if (isTower) {
      towers.push({
        x,
        // Işık kulenin gövde ortasına yakın durur: zemini ve kaideyi yalar.
        y: Math.min(2.6, box.min.y + size.y * 0.5),
        z,
        color: towerLightColor(semantic),
        intensity: 0.46,
        distance: 9,
        kind: "tower",
        weight: size.y,
      });
    } else {
      rivers.push({
        x,
        // Nehir yatağı ışığı su yüzeyinin hemen üstünde durur.
        y: Math.max(0.32, box.min.y + 0.28),
        z,
        color: "#59d8ff",
        intensity: 0.4,
        distance: 7.5,
        kind: "river",
        weight: size.x * size.z,
      });
    }
  });

  const uniqueTowers = pickUniqueLights(towers);
  const uniqueRivers = pickUniqueLights(rivers, 6);
  // Yarım bütçe kulelere, kalanı nehre: 4 → 2 kule + 2 nehir, 2 → 1 + 1.
  const towerQuota = Math.min(
    uniqueTowers.length,
    Math.max(1, Math.round(max / 2)),
  );
  return [
    ...uniqueTowers.slice(0, towerQuota),
    ...uniqueRivers.slice(0, Math.max(0, max - towerQuota)),
  ];
}

function CriticalPointLights() {
  const scene = useThree((s) => s.scene);
  const coarse = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches,
    [],
  );
  const [lights, setLights] = useState<CriticalLight[]>([]);
  const done = useRef(false);
  const tries = useRef(0);

  useFrame(() => {
    // Harita asenkron yüklendiği için birkaç kare boyunca denenir; bulununca
    // arama tamamen durur (kare maliyeti ~0).
    if (done.current || tries.current > 300) return;
    tries.current += 1;
    const found = collectCriticalLights(scene, coarse ? 2 : 4);
    if (found.length === 0) return;
    done.current = true;
    setLights(found);
    console.log(
      `[vivid] kritik nokta ışıkları: ${found.length} nokta (` +
        found.map((l) => l.kind).join(", ") +
        ")",
    );
  });

  return (
    <>
      {lights.map((light, i) => (
        <pointLight
          key={`critical-${i}`}
          position={[light.x, light.y, light.z]}
          color={light.color}
          intensity={light.intensity}
          distance={light.distance}
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
/* Üs ışık kulesi (nexus) — referanstaki ana görsel öğe.               */
/*                                                                     */
/* Kule = TAŞ gövde (haritanın taş dokusu) + tepesinde YUMUŞAK IŞIK    */
/* KAYNAĞI (çekirdek parlama + geniş hale + lens-flare şeridi) ve      */
/* gökyüzüne uzanan hüzme. Katı, kaba beyaz kristal kütlesi kaldırıldı: */
/* eskiden prizma/koniler `toneMapped=false` ile bembeyaz bir kutu gibi */
/* patlıyordu. Yeni ışık kaynağı yalnızca additive sprite katmanlarıdır;*/
/* geometrisi olmadığı için "kutu" izlenimi vermez.                    */
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
  const beam = useRef<THREE.Mesh>(null);
  const rings = useRef<THREE.Group>(null);
  const runes = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  /** Yumuşak parlama katmanları: sıcak çekirdek + geniş hale + flare şeritleri. */
  const coreRef = useRef<THREE.Sprite>(null);
  const haloRef = useRef<THREE.Sprite>(null);
  const streakRef = useRef<THREE.Sprite>(null);
  const streakVRef = useRef<THREE.Sprite>(null);

  const beamTex = useMemo(
    () => makePillarTexture("rgba(255,255,255,0.85)"),
    [],
  );
  const glowTex = useMemo(() => makeGlowTexture("rgba(180,230,255,1)"), []);
  const streakTex = useMemo(() => makeStreakTexture(), []);
  // Taş gövde (kule kaidesi): prosedürel taş dokusu `mapStoneRepair` ile AYNI
  // üreticiden gelir, yani haritanın kendi taş yapılarıyla aynı dilde durur.
  const crownMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: makeStoneTexture(),
        roughness: 0.88,
        metalness: 0.08,
        envMapIntensity: 0.32,
      }),
    [],
  );

  useFrame((_, dt) => {
    const t = performance.now() / 1000;
    if (rings.current) rings.current.rotation.y += dt * 0.25;
    if (runes.current) runes.current.rotation.y -= dt * 0.12;
    const pulse = 0.78 + 0.22 * Math.sin(t * 1.8);
    // Işık kaynağı artık KATI bir kristal kütlesi değil, yumuşak bir parlama
    // yığınıdır: keskin "kaba beyaz kutu" izlenimi veren prizma ve koniler
    // kaldırıldı. Kalan katmanlar sıcak çekirdek + geniş hale + ince lens
    // flare şeritleri; hepsi additive sprite, yani geometrisi ve kenarı yok.
    if (coreRef.current) {
      (coreRef.current.material as THREE.SpriteMaterial).opacity =
        0.4 + 0.12 * pulse;
      coreRef.current.scale.setScalar(0.82 + 0.1 * pulse);
    }
    if (haloRef.current) {
      (haloRef.current.material as THREE.SpriteMaterial).opacity =
        0.11 + 0.04 * pulse;
      haloRef.current.scale.setScalar(3.2 + 0.35 * pulse);
    }
    if (streakRef.current) {
      (streakRef.current.material as THREE.SpriteMaterial).opacity =
        0.22 + 0.08 * pulse;
      streakRef.current.scale.set(5.2 + 0.5 * pulse, 0.44, 1);
    }
    if (streakVRef.current) {
      (streakVRef.current.material as THREE.SpriteMaterial).opacity =
        0.1 + 0.04 * pulse;
      streakVRef.current.scale.set(0.4, 2.8 + 0.4 * pulse, 1);
    }
    if (beam.current) {
      const mat = beam.current.material as THREE.MeshBasicMaterial;
      // Hüzme KORUNUR: yalnızca kaidenin tepesinden başlar ve gövdeyi
      // bembeyaz örtmesin diye bir tık daha saydamdır.
      mat.opacity = 0.055 + 0.022 * pulse;
      beam.current.scale.set(1 + 0.03 * pulse, 1, 1 + 0.03 * pulse);
    }
    if (light.current) light.current.intensity = 0.32 + 0.12 * pulse;
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

      {/* ışık sütunu (gökyüzüne uzanan huzme) — kaidenin tepesinden başlar */}
      <mesh ref={beam} position={[0, 4.35, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.38, 0.64, 6.3, 16, 1, true]} />
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

      {/* TAŞ GÖVDE (kule kaidesi): hüzmenin çıktığı gövde artık kaba beyaz bir
          kristal kütlesi değil, haritanın taş dokusuyla kaplı bir kaide. */}
      <mesh
        position={[0, 0.26, 0]}
        material={crownMat}
        castShadow
        receiveShadow
        raycast={() => null}
      >
        <cylinderGeometry args={[0.66, 0.9, 0.52, 8, 1]} />
      </mesh>
      <mesh
        position={[0, 0.72, 0]}
        material={crownMat}
        castShadow
        receiveShadow
        raycast={() => null}
      >
        <cylinderGeometry args={[0.5, 0.68, 0.42, 8, 1]} />
      </mesh>
      <mesh
        position={[0, 1.04, 0]}
        material={crownMat}
        castShadow
        receiveShadow
        raycast={() => null}
      >
        <cylinderGeometry args={[0.56, 0.5, 0.24, 8, 1]} />
      </mesh>

      {/* IŞIK KAYNAĞI — yalnızca yumuşak parlama (lens flare), katı kütle yok */}
      <sprite ref={haloRef} position={[0, 1.35, 0]} raycast={() => null}>
        <spriteMaterial
          map={glowTex}
          color={color}
          transparent
          opacity={0.12}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={streakVRef} position={[0, 1.35, 0]} raycast={() => null}>
        <spriteMaterial
          map={streakTex}
          color={core}
          transparent
          opacity={0.1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={streakRef} position={[0, 1.35, 0]} raycast={() => null}>
        <spriteMaterial
          map={streakTex}
          color={accent}
          transparent
          opacity={0.28}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={coreRef} position={[0, 1.35, 0]} raycast={() => null}>
        <spriteMaterial
          map={glowTex}
          color={core}
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>

      {/* üssün aydınlatması: ışık kaynağından yumuşak, renkli bir dolgu */}
      <pointLight
        ref={light}
        position={[0, 2.1, 0]}
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
      {/* Kritik nokta ışıkları: kuleler + nehir yatağı (renkli nokta ışıkları
          zemini kendi renkleriyle aydınlatır). */}
      <CriticalPointLights />
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
function GroundHaze() { // zemin altı kor sızıntısı
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

/* ------------------------------------------------------------------ */
/* DEKORASYON DÜZENLEMESİ: objeler yolların ortasında durmaz          */
/*                                                                    */
/* Kaya kütleleri ve dikilitaşlar eskiden ana hattın (kırmızı üs →     */
/* mavi üs) tam üzerine düşebiliyordu; geçitler daralıyor ve oyuncu    */
/* görsel olarak yolu kapanmış sanıyordu. Aşağıdaki yardımcı her       */
/* dekoratif objeyi hattan LATERAL olarak dışa iter: obje yoldan       */
/* çıkar, koridorun kenarına yerleşir. Kollar/kaya sayısı da azaltıldı. */

/** Ana hat: iki üssü birleştiren koridor (bkz. NEXUS). */
const LANE_A = NEXUS[0];
const LANE_B = NEXUS[1];
/** Dekoratif objenin ana hattan en az uzaklığı (3D birim). */
const LANE_CLEAR = 2.7;

function pushOffLane(
  x: number,
  z: number,
  clear = LANE_CLEAR,
): [number, number] {
  const dx = LANE_B.x - LANE_A.x;
  const dz = LANE_B.z - LANE_A.z;
  const len = Math.hypot(dx, dz) || 1;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(
    0,
    Math.min(1, ((x - LANE_A.x) * dx + (z - LANE_A.z) * dz) / len2),
  );
  const ox = x - (LANE_A.x + t * dx);
  const oz = z - (LANE_A.z + t * dz);
  const dist = Math.hypot(ox, oz);
  if (dist >= clear) return [x, z];
  if (dist < 0.001) {
    // Tam hat üzerinde: hat normali boyunca arenanın dışına doğru it.
    const nx = -dz / len;
    const nz = dx / len;
    const midX = (LANE_A.x + LANE_B.x) / 2;
    const midZ = (LANE_A.z + LANE_B.z) / 2;
    const sign = (x - midX) * nx + (z - midZ) * nz >= 0 ? 1 : -1;
    return [x + nx * clear * sign, z + nz * clear * sign];
  }
  const push = (clear - dist) / dist;
  return [x + ox * push, z + oz * push];
}

/** Yol kenarına serpiştirilen küçük kaya kütleleri (3 → 2, dağılım daraltıldı). */
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
    Array.from({ length: 2 }, () => {
      const x = bx + (rnd() - 0.5) * 1.7;
      const z = bz + (rnd() - 0.5) * 1.7;
      const [px, pz] = pushOffLane(x, z);
      return {
        x: px,
        z: pz,
        s: 0.5 + rnd() * 0.9,
        r: rnd() * Math.PI,
      };
    }),
  );
})();

/** Koridor boyunca duran, tepesinde rün taşıyan dikilitaşlar (yol kenarına). */
const OBELISKS: { x: number; z: number; glow: string }[] = [
  { x: 5.2, z: 8.8, glow: "#ff8a3c" },
  { x: 9.6, z: 12.4, glow: "#ff6a1f" },
  { x: 20.6, z: 14.6, glow: "#5ce1ff" },
  { x: 26.2, z: 12.4, glow: "#6fd8ff" },
  { x: 14.8, z: 6.4, glow: "#ff8a3c" },
  { x: 30.6, z: 7.4, glow: "#5ce1ff" },
].map((o) => {
  const [x, z] = pushOffLane(o.x, o.z);
  return { ...o, x, z };
});

function StoneStructures() {
  const stone = useMemo(
    () =>
      // Doygunluk yükseltildi: nötr gri-mor kaya kütleleri "ışıksız beton"
      // gibi okunuyordu; artık sıcak-kahve bir taş tonu (canlı paletle uyumlu).
      new THREE.MeshStandardMaterial({
        color: "#574535",
        roughness: 0.86,
        metalness: 0.18,
        envMapIntensity: 0.7,
      }),
    [],
  );
  const obeliskMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#6a5560",
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
  return (
    <>
      <ArenaShadowCaster />
      <MapShadowFlags />
    </>
  );
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
  // Gölge çerçevesi sıkılaştırıldı: kamera yakınlaştığı için (bkz.
  // ArenaCamera → DIST_P/DIST_L) karakter ekranda ~2 kat büyük ve eski
  // 48 birimlik gevşek çerçeve + 1024² harita gölge kenarlarını blok blok
  // gösteriyordu. Çerçeve arenayı (34×22) kaplayacak kadar daraltıldı
  // (±16), harita iki katına çıkarıldı → texel yoğunluğu ~4 kat: karakter
  // gölgesi artık keskin, gölge düşüren nesneler yine kadrajda kalır.
  return (
    <directionalLight
      ref={ref}
      userData={{ mobaLight: true }}
      position={[ARENA_W / 2 + 14, 20, ARENA_D / 2 - 10]}
      color="#ffe6c8"
      intensity={1.45}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-19}
      shadow-camera-right={19}
      shadow-camera-top={19}
      shadow-camera-bottom={-19}
      shadow-camera-near={1}
      shadow-camera-far={70}
      shadow-bias={-0.0006}
      shadow-normalBias={0.03}
    />
  );
}

/*
 * GÖLGENİN ŞİDDETİ NEDEN ARTIRILDI (0.46 → 1.45):
 * Sahnedeki düz dolgu ışığı (ambient/hemisfer) o kadar yüksekti ki bu ışık
 * gölge bıraksa bile gölge okunmuyordu — "her yere eşit dağılmış ışık".
 * Artık dolgu ArenaCamera tarafında kısıldı, ana ışık burada güçlendirildi:
 * gölge sahnenin gerçek "biçim" bilgisi olur (Wild Rift'teki net temas
 * gölgesi). Gölge çerçevesi arena genişliğine göre ±19'a alındı; 2048²
 * haritada texel ~1.9 cm, karakter ve kaya gölgeleri keskin kalır.
 *
 * NOT: haritanın kendisi gölge ALMIYORSA (receiveShadow) bu ışık görünmez
 * iş yapar; zemin/bayır/alıcı bayrakları `MapShadowFlags` kurar.
 */

/**
 * HARİTA GÖLGE BAYRAKLARI (receive / cast).
 *
 * Gölge düşüren ışık baştan beri vardı ama harita mesh'lerinin HİÇBİRİ
 * varsayılan `receiveShadow = false` durumundan çıkmamıştı: karakterin ve
 * kulelerin gölgesi düşecek bir yüzey bulamıyordu, bu yüzden zemin ile
 * karakter birbirinin üzerine yapışık görünüyordu. Aynı şekilde kaya/kule/
 * duvar kütleleri de gölge DÜŞÜRMÜYORDU.
 *
 * Bu geçiş, adı haritanın kendi sözlüğüne uyan mesh'leri ikiye ayırır:
 *   • zemin ve alçak yüzeyler (terrain, ground, decal, nehir, yol, çimen):
 *     gölge ALICI.
 *   • yükselen kütleler (kaya, kule, duvar, üs, dikilitaş, istasyon, ada):
 *     alıcı + VERİCİ — birbirlerinin ve zeminin üzerine gölge bırakırlar.
 *
 * Yalnızca görsel bayraklar: fizik, çarpışma ızgarası, hasar ve ağ sistemi
 * etkilenmez. Harita asenkron yüklendiği için birkaç kare boyunca denenir,
 * mesh bulununca arama tamamen durur (kare maliyeti ~0).
 */
const SHADOW_RECEIVE_RE =
  /(?:terrain|ground|decal|river|water|bridge|crossing|path|lane|grass|cliff|rock|boulder|tower|wall|props|sculpture|station|island|block|base)/i;
const SHADOW_CAST_RE =
  /(?:rock|boulder|tower|wall|props|sculpture|station|island|block|base)/i;

function MapShadowFlags() {
  const scene = useThree((s) => s.scene);
  const done = useRef(false);
  const tries = useRef(0);
  useFrame(() => {
    if (done.current || tries.current > 300) return;
    tries.current += 1;
    let receivers = 0;
    let casters = 0;
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      const names: string[] = [];
      let node: THREE.Object3D | null = mesh;
      while (node) {
        if (node.name) names.push(node.name);
        node = node.parent;
      }
      const key = names.join("/");
      if (!SHADOW_RECEIVE_RE.test(key)) return;
      mesh.receiveShadow = true;
      receivers += 1;
      if (!SHADOW_CAST_RE.test(key)) return;
      mesh.castShadow = true;
      casters += 1;
    });
    if (receivers === 0) return;
    done.current = true;
    console.log(
      `[shadow] harita gölge bayrakları: ${receivers} alıcı / ${casters} verici mesh`,
    );
  });
  return null;
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

/* ------------------------------------------------------------------ */
/* CANLI PALET (High-Saturation Low-Poly)                              */
/* ------------------------------------------------------------------ */
/* Haritanın kendi dokuları (çimen, ağaç kabuğu, toprak, taş) korunur ama iki
   katmanla CANLI hâle getirilir:

   1) DOYGUNLUK — materyalin fragment gölgelendiricisine, dokunun uygulandığı
      noktadan hemen sonra küçük bir doygunluk/değer geçişi enjekte edilir:
      rengin kendi parlaklığı etrafında doygunluk açılır (patikalarda değer
      hafifçe kısılır → "koyu kahve patika"). Doku kaynağı, UV ve ışık
      hesabı değişmez; yalnızca okunan albedo canlanır. Bu, düz renkli
      (dokusuz) yüzeylerde ek olarak materyal renginin HSL doygunluğuyla da
      desteklenir.
   2) KENDİNDEN PARLAMA (emissive) — adı kristal/büyü/rün/lamba olan objeler
      kendi renginde yumuşak bir ışıma alır (emissiveIntensity 0.3): bloom
      eşiğinin altında kalır, yani "her yeri saran sis" oluşmaz ama kristaller
      karanlıkta okunur.

   Yalnızca GÖRSELDİR: fizik, çarpışma ızgarası, hasar ve menzil etkilenmez.
   Su yüzeyleri hariç tutulur (kendi akan-su yamasını taşırlar), additif efekt
   katmanlarına da dokunulmaz. */

/** Doygunluğu açılan, haritanın kendi dokusuyla gelen materyal işareti. */
const VIVID_MARK = "vaelosVivid";
/** Kristal/büyü objelerinin kendinden parlama şiddeti (istenen: 0.3). */
const VIVID_EMISSIVE = 0.3;

/** Çim / ağaç / çalı — en canlı yeşil bandı. */
const VIVID_FOLIAGE_RE =
  /(grass|foliage|leaf|leaves|tree|bush|shrub|plant|fern|reed|mushroom|underbrush|groundcover|flower|vine|moss|canopy|stump|trunk)/i;
/** Patika / yol / toprak — daha doygun ve daha KOYU kahve. */
const VIVID_PATH_RE =
  /(path|trail|road|lane|dirt|soil|track|walkway|crossing|bridge|sand|mud|plaza)/i;
/** Taş / kaya / kule / duvar / üs — nötr griye düşmesin diye hafif doygunluk. */
const VIVID_STONE_RE =
  /(rock|boulder|cliff|stone|wall|tower|block|base|station|island|perimeter|ruin|pillar|arch|sculpture|monument|stair)/i;
/** Kristal / büyü / ışıklı objeler — kendinden parlama alır. */
const VIVID_GLOW_RE =
  /(crystal|gem|rune|magic|arcane|portal|shrine|altar|energy|glow|lamp|lantern|neon|orb|prism|relic|beacon|torch|brazier|sigil|emblem)/i;

interface VividTone {
  /** Doygunluk çarpanı (1 = dokunun kendisi). */
  sat: number;
  /** Parlaklık çarpanı (< 1 patikaları koyulaştırır). */
  val: number;
  /** Kendinden parlama verilsin mi? */
  emissive: boolean;
}

/** Adına göre canlı palet tonu. */
function vividToneFor(semantic: string): VividTone {
  if (VIVID_GLOW_RE.test(semantic)) return { sat: 1.3, val: 1.04, emissive: true };
  if (VIVID_FOLIAGE_RE.test(semantic))
    return { sat: 1.45, val: 1.06, emissive: false };
  if (VIVID_PATH_RE.test(semantic)) return { sat: 1.3, val: 0.84, emissive: false };
  if (VIVID_STONE_RE.test(semantic)) return { sat: 1.2, val: 0.98, emissive: false };
  return { sat: 1.16, val: 1, emissive: false };
}

/**
 * Dokunun ortalama rengi (8×8'e küçültüp okur). Kendinden parlama rengi,
 * objenin gerçekte hangi renkse o renkte ışıması için kullanılır; doku
 * okunamıyorsa (sıkıştırılmış/asenkron) `null` döner ve yedek palete düşülür.
 */
function averageTextureColor(texture: THREE.Texture): THREE.Color | null {
  const image = texture?.image as (CanvasImageSource & { width?: number }) | null;
  if (!image) return null;
  try {
    const size = 8;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    const n = data.length / 4;
    return new THREE.Color().setRGB(
      r / n / 255,
      g / n / 255,
      b / n / 255,
      THREE.SRGBColorSpace,
    );
  } catch {
    return null;
  }
}

/**
 * Kristal/büyü objesinin ışıma rengi: mümkünse objenin KENDİ rengi, sonra
 * dokusunun ortalama rengi, en son ada uygun tema rengi. Renk her durumda
 * biraz daha doygun ve orta parlaklığa çekilir ki ışıma "kirli gri" olmasın.
 */
function vividGlowColor(
  std: THREE.MeshStandardMaterial,
  semantic: string,
): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  const boost = (color: THREE.Color): THREE.Color => {
    color.getHSL(hsl);
    return new THREE.Color().setHSL(
      hsl.h,
      Math.min(1, hsl.s * 1.3 + 0.18),
      Math.max(0.44, Math.min(0.7, hsl.l)),
    );
  };
  const color = std.color as THREE.Color | undefined;
  if (color) {
    color.getHSL(hsl);
    if (hsl.s > 0.07) return boost(color.clone());
  }
  const avg = std.map ? averageTextureColor(std.map as THREE.Texture) : null;
  if (avg) return boost(avg);
  if (/red|orange|fire|lava|ember|magma/i.test(semantic))
    return new THREE.Color("#ff8a4a");
  if (/blue|cyan|ice|frost|water/i.test(semantic))
    return new THREE.Color("#6fe4ff");
  if (/green|nature|life|forest/i.test(semantic))
    return new THREE.Color("#8ef08a");
  if (/purple|violet|void|shadow|dark/i.test(semantic))
    return new THREE.Color("#b48cff");
  return new THREE.Color("#8fe6ff");
}

/**
 * Bir harita materyaline canlı palet tonunu uygular (materyal başına BİR kez;
 * paylaşılan materyaller `converted` önbelleğiyle tek geçişte işlenir).
 */
function applyVividTone(material: THREE.Material, semantic: string): void {
  if (material.userData?.[VIVID_MARK]) return;
  // Additif efekt katmanları ve akan su kendi görsel dilini taşır.
  if (material.blending === THREE.AdditiveBlending) return;
  if (material.userData?.vaelosWater) return;

  const tone = vividToneFor(semantic);
  const std = material as THREE.MeshStandardMaterial;
  material.userData = { ...material.userData, [VIVID_MARK]: true };

  // (1) Düz renkli (dokusuz) yüzeylerde renk doğrudan HSL'de doyurulur.
  const color = std.color as THREE.Color | undefined;
  if (color) {
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    if (hsl.s > 0.04) {
      color.setHSL(
        hsl.h,
        Math.min(1, hsl.s * Math.min(tone.sat, 1.35)),
        Math.min(1, hsl.l * (tone.val > 1 ? tone.val : 1) * (tone.val < 1 ? 0.94 : 1)),
      );
    }
  }

  // (2) Dokulu yüzeyler için doygunluk gölgelendiriciye enjekte edilir: doku,
  //     UV ve ışık hesabı değişmez; yalnızca okunan albedo canlanır.
  if (!std.onBeforeCompile) {
    const sat = tone.sat.toFixed(3);
    const val = tone.val.toFixed(3);
    std.onBeforeCompile = (shader) => {
      // `map_fragment` her ışık alan materyalde bulunur (meshbasic dâhil);
      // bulunmazsa hiçbir şey yapılmaz — shader yaması güvenli kalır.
      if (!shader.fragmentShader.includes("#include <map_fragment>")) return;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        // CANLI PALET: dokunun kendi parlaklığı etrafında doygunluk açılır ve
        // (patikalarda) değer kısılır — yüksek doygunluklu low-poly okunuşu.
        float vividLum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
        diffuseColor.rgb = clamp(
          mix( vec3( vividLum ), diffuseColor.rgb, ${sat} ) * ${val},
          0.0,
          1.0
        );`,
      );
    };
    // Ton başına ayrı program: aynı parametreli başka bir materyal bu yamayı
    // yanlışlıkla paylaşmasın.
    std.customProgramCacheKey = () => `vaelos-vivid-${sat}-${val}`;
    std.needsUpdate = true;
  }

  // (3) Kristal / büyü / ışıklı objeler: kendi renginde yumuşak kendinden
  //     parlama. Yoğunluk 0.3'te kalır (bloom eşiğinin altı).
  if (tone.emissive && std.emissive) {
    std.emissive.copy(vividGlowColor(std, semantic));
    std.emissiveIntensity = VIVID_EMISSIVE;
    std.needsUpdate = true;
  }
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

  // LAYOUT effect (useEffect değil): dekor ölçeklemesi engel ızgarası
  // (`buildCollisionGrid`) kurulmadan ÖNCE çalışmak ZORUNDA, yoksa küçülen
  // kayanın etrafında eski (büyük) engel hücreleri "görünmez duvar" olarak
  // kalır. BattleMapGuard bu bileşeni haritadan ÖNCE render eder ve layout
  // effect'ler ağaç sırasına göre çalıştığı için sıra garantidir.
  useLayoutEffect(() => {
    // KAPLAMASIZ YAPI ONARIMI (önce çalışır): dokusu olmayan / dokusu
    // okunamayan kule ve dikilitaş mesh'leri sahneye siyah-koyu mor bir kütle
    // olarak düşer; bunlara prosedürel taş kaplaması atanır. Materyaller
    // render edilen klonla PAYLAŞILDIĞI için değişiklik yerinde yapılır ve
    // zemin geçişinden ÖNCE uygulanır (zemin geçişi eski tip materyalleri
    // yeni örneklerle değiştirdiği için sıra önemlidir).
    // Görsel-only — collider maskesi ve fizik etkilenmez.
    repairUntexturedStructureMaterials(scene);

    // DEKOR ÖLÇEKLEMESİ: ağaç / çalı / orman çimi / kaya / yer propları %48
    // küçültülür. Geometri kaynak sahne ile çizilen klon arasında
    // PAYLAŞILDIĞI için ekrandaki harita da aynı anda küçülür; engel ızgarası
    // bu çağrıdan sonra kurulduğu için görsel ile fizik tutarlı kalır.
    const decor = scaleMapDecor(scene);
    console.log(
      `[mapDecorScale] ${decor.groups} grup / ${decor.meshes} mesh ` +
        `× ${DECOR_SCALE} küçültüldü`,
    );

    // Aynı materyal birden fazla mesh'te paylaşılabildiği için dönüşüm
    // önbelleğe alınır; her mesh için yeni materyal üretilmez.
    const converted = new WeakMap<THREE.Material, THREE.Material>();
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const list = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      // İsim zinciri (mesh → kök): canlı palet tonu ve ışıma kararı bu
      // semantik addan okunur (harita mesh adları İngilizce anahtar taşır).
      const names: string[] = [];
      let node: THREE.Object3D | null = mesh;
      for (let i = 0; node && i < 8; node = node.parent, i++) {
        if (node.name) names.push(node.name);
      }
      const semantic = names.join("/");
      list.forEach((entry, index) => {
        const cached = converted.get(entry);
        const out = cached ?? normalizeGroundMaterial(entry);
        if (!cached) {
          converted.set(entry, out);
          applyVividTone(out, semantic);
        }
        list[index] = out;
      });
      mesh.material = Array.isArray(mesh.material) ? list : list[0];
    });
  }, [scene]);

  // Akış sürücüsü: paylaşılan zaman uniform'unu ilerletir (tek useFrame).
  return <WaterFlow />;
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
