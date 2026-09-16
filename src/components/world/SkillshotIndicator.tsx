// 🎯 Skillshot göstergesi — zeminde menzil çemberi + yön oku.
//
// LoL / Wild Rift tarzı nişan okunurluğu: butonu basılı tutunca karakterin
// etrafında maksimum menzili gösteren, kenarları kesikli ve hafifçe dönen bir
// çember; nişan yönüne doğru uzanan, üzerinde akan oklu bir şerit. Çemberin
// dışına doğru nabız gibi atan ikinci bir halka "menzil sınırı" hissini verir.
//
// Tamamen prosedürel (canvas) dokular kullanılır — dış varlık yok. Bütün
// durum `aimState` üzerinden okunduğu için nişan alırken React yeniden
// çizimi olmaz.
import { useFrame } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useMemo, useRef } from "react";
import * as THREE from "three";
// Tip yalnızca tip olarak içe aktarılır (çalışma zamanında döngüsel bağımlılık
// oluşmasın diye `import type`).
import type { BattleFighter } from "./Arena3D";
import { S } from "./arena/shared";
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

const RING_TEX_SIZE = 512;

/** Menzil çemberinin dokusu: kesikli bant + çok ince çekirdek + zayıf dolgu. */
function makeRangeTexture(): THREE.Texture {
  const size = RING_TEX_SIZE;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 4;

  // Dışa doğru solan İNCE hale: çemberin kenarı düz bir çizgi gibi durmasın,
  // ama zeminin üstünü kaplamasın.
  const halo = g.createRadialGradient(cx, cy, outer * 0.93, cx, cy, outer);
  halo.addColorStop(0, "rgba(255,255,255,0)");
  halo.addColorStop(0.75, "rgba(255,255,255,0.16)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = halo;
  g.beginPath();
  g.arc(cx, cy, outer, 0, Math.PI * 2);
  g.fill();

  // Kesikli bant: her 6. parça daha kalın ve parlak (yön okuma kolaylığı).
  const DASHES = 72;
  g.lineCap = "round";
  for (let i = 0; i < DASHES; i++) {
    const a0 = (i / DASHES) * Math.PI * 2;
    const a1 = a0 + ((Math.PI * 2) / DASHES) * 0.6;
    const strong = i % 6 === 0;
    g.strokeStyle = strong
      ? "rgba(255,255,255,0.95)"
      : "rgba(255,255,255,0.42)";
    g.lineWidth = strong ? size * 0.018 : size * 0.009;
    g.beginPath();
    g.arc(cx, cy, outer * 0.975, a0, a1);
    g.stroke();
  }

  // Çok ince sürekli çekirdek halka (çemberi net okutur).
  g.strokeStyle = "rgba(255,255,255,0.32)";
  g.lineWidth = size * 0.004;
  g.beginPath();
  g.arc(cx, cy, outer * 0.975, 0, Math.PI * 2);
  g.stroke();

  // İç dolgu YOK: çember yalnızca sınırı gösterir, zemini kaplamaz. Böylece
  // menzil alanı "ekranı kaplayan bir daire" gibi görünmez.

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Nabız halkası: tek, ince ve parlak bir çember (dışa doğru genişler). */
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
  const ring = useRef<THREE.Mesh>(null);
  const pulse = useRef<THREE.Mesh>(null);
  const shaft = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Mesh>(null);
  const lock = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const pulseMat = useRef<THREE.MeshBasicMaterial>(null);
  const shaftMat = useRef<THREE.MeshBasicMaterial>(null);
  const headMat = useRef<THREE.MeshBasicMaterial>(null);

  // Prosedürel dokular bir kez üretilir (canvas → CanvasTexture).
  const rangeTex = useMemo(() => makeRangeTexture(), []);
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
    if (ring.current && ring.current.visible !== showRing) {
      ring.current.visible = showRing;
    }
    if (pulse.current && pulse.current.visible !== ability) {
      pulse.current.visible = ability;
    }

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

    // ── menzil çemberi: hafif dönüş + nefes alan parlaklık ──
    if (ring.current) ring.current.rotation.z = -t * 0.26;
    if (ringMat.current) {
      ringMat.current.color.set(color);
      // Düz vuruşta çember daha soluk kalsın (sürekli ateş hâlinde ekranı
      // boğmasın), yetenek nişanında biraz daha belirgin olsun. Gün ışığı
      // seviyesi yükseldiği için taban opaklıklar bir tık arttı: çember
      // karanlıkta/gölgede kaybolmuyor, canlı mavi kalıyor.
      const base = ability ? 0.62 : 0.45;
      ringMat.current.opacity = base + 0.1 * Math.sin(t * 2.6);
    }
    // ── dışa doğru atan nabız halkası (menzil sınırı) ──
    if (pulse.current) {
      const k = (t * 0.55) % 1; // 0 → 1 döngü
      pulse.current.scale.setScalar(0.98 + k * 0.06);
      if (pulseMat.current) {
        pulseMat.current.color.set(color);
        pulseMat.current.opacity = (1 - k) * 0.5;
      }
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
    }
    // Chevron'lar hedefe doğru akar; şerit karaktere yakınken sönük,
    // menzil sonunda parlar (nerede biteceği okunur).
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
      {/* Maksimum menzil çemberi */}
      <mesh
        ref={ring}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.06, 0]}
        raycast={() => null}
      >
        <planeGeometry args={[R * 2, R * 2]} />
        <meshBasicMaterial
          ref={ringMat}
          map={rangeTex}
          color={AIM_COLORS.basic}
          transparent
          opacity={0.78}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* Dışa doğru genişleyen nabız halkası */}
      <mesh
        ref={pulse}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.07, 0]}
        raycast={() => null}
      >
        <planeGeometry args={[R * 2, R * 2]} />
        <meshBasicMaterial
          ref={pulseMat}
          map={pulseTex}
          color={AIM_COLORS.basic}
          transparent
          opacity={0.55}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
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
