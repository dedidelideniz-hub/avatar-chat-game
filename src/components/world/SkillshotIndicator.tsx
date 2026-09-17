// 🎯 Skillshot göstergesi — zeminde menzil çemberi + yön oku.
//
// LoL / Wild Rift tarzı nişan okunurluğu: butonu basılı tutunca karakterin
// etrafında maksimum menzili gösteren, dönen ve hafifçe parlayan bir çember;
// nişan yönüne doğru uzanan, üzerinde akan oklu bir şerit.
//
// Çember ARTIK custom shader'dır (bkz. ./arena/SkillIndicator.tsx): kesikli
// dönen bant, ince çekirdek halka, yumuşak ışıma ve dışa atan nabız halkası
// tek bir fragment shader'da analitik üretilir — canvas dokusu yok, piksel
// kaybı yok, bloom eşiğini doğrudan geçen gerçek bir ışıma var.
//
// Bütün durum `aimState` üzerinden okunduğu için nişan alırken React yeniden
// çizimi olmaz; konum ve uniform'lar TEK `useFrame` (paylaşılan delta) içinde
// tazelenir.
import { useFrame } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useMemo, useRef } from "react";
import * as THREE from "three";
// Tip yalnızca tip olarak içe aktarılır (çalışma zamanında döngüsel bağımlılık
// oluşmasın diye `import type`).
import type { BattleFighter } from "./Arena3D";
import { S } from "./arena/shared";
import {
  SkillIndicator,
  type SkillIndicatorHandle,
} from "./arena/SkillIndicator";
import {
  MAX_RANGE_UNITS,
  SKILLSHOT_WIDTH,
  aimState,
  resolveAim,
} from "./arena/skillshot";

/** Nişan türüne göre renk: düz vuruş soğuk mavi, yetenekler sıcak. */
const AIM_COLORS = {
  basic: "#7dd3fc",
  super: "#fcd34d",
  ult: "#fb923c",
} as const;
/** Kilitlenen hedefin rengi. */
const LOCK_COLOR = "#fde68a";

/** Nabız halkası: tek, ince ve parlak bir çember (kilit işareti). */
function makePulseTexture(): THREE.Texture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2 - 4;
  const halo = g.createRadialGradient(
    size / 2,
    size / 2,
    r * 0.82,
    size / 2,
    size / 2,
    r,
  );
  halo.addColorStop(0, "rgba(255,255,255,0)");
  halo.addColorStop(0.72, "rgba(255,255,255,0.55)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = halo;
  g.beginPath();
  g.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.95)";
  g.lineWidth = size * 0.022;
  g.beginPath();
  g.arc(size / 2, size / 2, r * 0.99, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Ok şeridi: iki parlak kenar çizgisi + akan chevron'lar (u ekseninde). */
function makeArrowShaftTexture(): THREE.Texture {
  const w = 256;
  const h = 64;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const band = g.createLinearGradient(0, 0, 0, h);
  band.addColorStop(0, "rgba(255,255,255,0)");
  band.addColorStop(0.5, "rgba(255,255,255,0.5)");
  band.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = band;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.fillRect(0, 3, w, 2);
  g.fillRect(0, h - 5, w, 2);
  g.strokeStyle = "rgba(255,255,255,0.95)";
  g.lineWidth = 5;
  g.lineJoin = "round";
  for (let i = 0; i < 2; i++) {
    const x0 = 48 + i * 128;
    g.beginPath();
    g.moveTo(x0 - 20, 14);
    g.lineTo(x0, h / 2);
    g.lineTo(x0 - 20, h - 14);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Ok başı: yumuşak, parlak bir üçgen (yerde yatar). */
function makeArrowHeadTexture(): THREE.Texture {
  const size = 96;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0, "rgba(255,255,255,0.35)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.95)");
  grad.addColorStop(1, "rgba(255,255,255,0.85)");
  g.fillStyle = grad;
  g.strokeStyle = "rgba(255,255,255,0.9)";
  g.lineWidth = 3;
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(6, 6);
  g.lineTo(size - 6, size / 2);
  g.lineTo(6, size - 6);
  g.closePath();
  g.fill();
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Zemin nişan göstergesi. Yalnızca oyuncu rig'i için çizilir; konumunu her
 * karede dövüşçü ref'inden alır (React yeniden çizimi yok).
 */
export function SkillshotIndicator({
  fighter,
  other,
}: {
  fighter: MutableRefObject<BattleFighter>;
  other: MutableRefObject<BattleFighter>;
}) {
  const root = useRef<THREE.Group>(null);
  // Shader çemberi: uniform'lar sahne döngüsünden doğrudan yazılır.
  const indicator = useRef<SkillIndicatorHandle | null>(null);
  const shaft = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Mesh>(null);
  const lock = useRef<THREE.Mesh>(null);
  // Menzil ucuna doğru AKAN ok işareti (Skill Indicator Arrow).
  const tip = useRef<THREE.Mesh>(null);
  const tipMat = useRef<THREE.MeshBasicMaterial>(null);
  const shaftMat = useRef<THREE.MeshBasicMaterial>(null);
  const headMat = useRef<THREE.MeshBasicMaterial>(null);

  // Prosedürel dokular bir kez üretilir (canvas → CanvasTexture).
  const pulseTex = useMemo(() => makePulseTexture(), []);
  const shaftTex = useMemo(() => makeArrowShaftTexture(), []);
  const headTex = useMemo(() => makeArrowHeadTexture(), []);

  useFrame((state, dt) => {
    const g = root.current;
    if (!g) return;
    // Menzil çemberi hem YETENEK nişanında hem de DÜZ VURUŞ ateşinde görünür:
    // oyuncu normal atışta da menzilini görsün. Düz vuruşta çember daha soluk
    // çizilir ve nabız halkası kapanır (gereksiz görsel gürültü olmasın).
    // Yön oku yalnızca sürükleyerek nişan alındığında çıkar.
    const ability = aimState.ability;
    const basicAiming =
      aimState.basic && Math.hypot(aimState.basicDx, aimState.basicDy) > 0.15;
    const showRing = ability || aimState.basic;
    const active = showRing || basicAiming;
    if (g.visible !== active) g.visible = active;
    if (!active) return;

    const ring = indicator.current;
    if (ring && ring.mesh.visible !== showRing) ring.mesh.visible = showRing;

    const f = fighter.current;
    const o = other.current;
    const dx = ability ? aimState.dx : aimState.basicDx;
    const dy = ability ? aimState.dy : aimState.basicDy;
    // Kilit yalnızca menzil içinde devreye girer (resolveAim).
    const aim = resolveAim(f, o, dx, dy);
    const color = aim.locked
      ? LOCK_COLOR
      : ability
        ? AIM_COLORS[aimState.kind]
        : AIM_COLORS.basic;

    const px = f.x / S;
    const pz = f.y / S;
    g.position.set(px, 0, pz);

    const t = state.clock.elapsedTime;

    // ── menzil çemberi (custom shader): dönüş + nefes alan parlaklık ──
    if (ring) {
      const u = ring.uniforms;
      u.uTime.value = t;
      u.uColor.value.set(color);
      // Düz vuruşta çember daha soluk kalsın (sürekli ateş hâlinde ekranı
      // boğmasın), yetenek nişanında biraz daha belirgin olsun.
      const base = ability ? 0.62 : 0.45;
      u.uOpacity.value = base + 0.1 * Math.sin(t * 2.6);
      // Dışa yayılan ışıma: yetenekte daha geniş (bloom daha çok beslenir).
      u.uGlow.value = ability ? 0.34 : 0.16;
      // ── dışa doğru atan nabız halkası (menzil sınırı) ──
      // Düz vuruşta nabız kapalıdır (1 → söndü): sürekli ateş hâlinde ekranı
      // boğmasın. Yetenek nişanında 0→1 arası döner.
      u.uPulse.value = ability ? (t * 0.55) % 1 : 1;
    }

    // ── yön oku: karakterden menzil sonuna kadar ──
    const len = MAX_RANGE_UNITS;
    const ang = Math.atan2(-aim.y, aim.x); // yer düzleminde lokal açı
    if (shaft.current) {
      shaft.current.rotation.set(-Math.PI / 2, 0, ang);
      shaft.current.position.set(
        px + aim.x * len * 0.5,
        0.05,
        pz + aim.y * len * 0.5,
      );
      shaft.current.scale.set(len, SKILLSHOT_WIDTH, 1);
    }
    if (head.current) {
      head.current.rotation.set(-Math.PI / 2, 0, ang);
      head.current.position.set(px + aim.x * len, 0.06, pz + aim.y * len);
      // Ok başı nefes alır: hedef yönü durağan değil, canlı okunur.
      head.current.scale.setScalar(1 + 0.12 * Math.sin(t * 4.2));
    }
    // ── menzil ucundaki HAREKETLİ ok işareti ──
    // Karakterden menzil sınırına doğru akar, sınırda büyüyüp söner; döner
    // olması yönü tek bakışta okutur (LoL/Wild Rift yön oku davranışı).
    if (tip.current && tipMat.current) {
      const k = (t * 1.05) % 1;
      const along = 0.55 + 0.45 * k;
      tip.current.position.set(
        px + aim.x * len * along,
        0.07,
        pz + aim.y * len * along,
      );
      tip.current.rotation.z = -t * 2.2;
      tip.current.scale.setScalar(0.55 + 0.9 * k);
      tipMat.current.color.set(color);
      tipMat.current.opacity = (1 - k) * (1 - k) * 0.8;
    }
    // Chevron'lar hedefe doğru akar.
    const shaftMap = shaftMat.current?.map;
    if (shaftMap) shaftMap.offset.x -= dt * 1.15;
    if (shaftMat.current) {
      shaftMat.current.color.set(color);
      shaftMat.current.opacity = 0.5 + 0.18 * Math.sin(t * 3.4);
    }
    if (headMat.current) {
      headMat.current.color.set(color);
      headMat.current.opacity = 0.7 + 0.2 * Math.sin(t * 3.4);
    }

    // ── kilitlenen hedefin altında küçük halka ──
    const showLock = aim.locked;
    if (lock.current && lock.current.visible !== showLock) {
      lock.current.visible = showLock;
    }
    if (showLock && lock.current) {
      lock.current.position.set(o.x / S, 0.07, o.y / S);
      lock.current.rotation.z = t * 0.9;
      lock.current.scale.setScalar(1 + 0.06 * Math.sin(t * 5));
    }
  });

  const R = MAX_RANGE_UNITS;

  return (
    <group ref={root} visible={false}>
      {/* Maksimum menzil çemberi + nabız halkası (custom shader) */}
      <SkillIndicator handle={indicator} radius={R} />
      {/* Yön şeridi (okun gövdesi) */}
      <mesh ref={shaft} raycast={() => null}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={shaftMat}
          map={shaftTex}
          color={AIM_COLORS.basic}
          transparent
          opacity={0.62}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* Ok başı */}
      <mesh ref={head} raycast={() => null}>
        <planeGeometry args={[0.7, 0.7]} />
        <meshBasicMaterial
          ref={headMat}
          map={headTex}
          color={AIM_COLORS.basic}
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* Menzil ucuna akan hareketli ok işareti */}
      <mesh
        ref={tip}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.07, 0]}
        raycast={() => null}
      >
        <planeGeometry args={[1.1, 1.1]} />
        <meshBasicMaterial
          ref={tipMat}
          map={pulseTex}
          color={AIM_COLORS.basic}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* Menzil içinde kilitlenen hedefin işareti */}
      <mesh
        ref={lock}
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => null}
      >
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial
          map={pulseTex}
          color={LOCK_COLOR}
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
