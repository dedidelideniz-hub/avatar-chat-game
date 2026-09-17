// ⚔️ SlashTrail — kılıç izi (ribbon / trail shader).
//
// Düz vuruş, yetenek ve ulti salınımında bıçağın arkasında parlayan akıcı bir
// yay bırakır. Geometri tek bir düzlemdir (`planeGeometry`); yay, bükülme ve
// kesme ilerlemesi tamamen vertex/fragment shader'da üretilir:
//
//   · VERTEX — uv.x'i yay boyunca açıya çevirir (`uArc`), uv.y'yi yarıçapa
//     ekleyerek bandı kalınlaştırır (`uWidth`) ve yayı ileri eksen etrafında
//     eğer (`uTilt`): düz bir şerit yerine çapraz bir kılıç yayı.
//   · FRAGMENT — "uç" (uSweep) yay boyunca ilerler; ucun arkasında kalan
//     bant kuyruk uzunluğu (`uTail`) kadar parlarken söner. Bandın ortası
//     sıcak beyaz, kenarları yetenek rengidir → gerçek bir bıçak izi.
//
// Neden shader: kare başına geometri üretmek/yeniden hesaplamak yerine yalnızca
// iki uniform yazılır — tahsis yok, GC baskısı yok, tüm dövüşçüler aynı
// programı paylaşır (iki arena da aynı efekti görür).
//
// Tetikleyiciler (öncelik sırası):
//   1) ulti salınımı  → `samuraiUltT` (geniş, turuncu yay)
//   2) yetenek atışı  → `castFxT` (SkillComponent yazar, 1 → 0 iner)
//   3) düz vuruş      → `atkAnimT` (vuruş animasyonunun kendi saati)
// Salınım bitince yay kısa bir süre daha ilerleyip (uSweep > 1) tamamen
// söner, yani animasyon iptal edilse bile iz aniden kaybolmaz.
import { useFrame } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
// Yalnızca tip: Arena3D bu modülü çizer, modül Arena3D'yi çalışma zamanında
// içe aktarmaz (döngüsel bağımlılık olmaz).
import type { BattleFighter } from "@/components/world/Arena3D";

/* ------------------------------- palet ---------------------------------- */

type SwingKind = "basic" | "super" | "ult";

interface SwingLook {
  /** Bandın kenar rengi (yetenek kimliği). */
  color: string;
  /** Bandın sıcak çekirdeği. */
  hot: string;
  /** Yayın toplam açısı (radyan). */
  arc: number;
  /** Yay yarıçapı (rig birimi — model 1.5 birim). */
  radius: number;
  /** Bandın radyal kalınlığı. */
  width: number;
  /** Yayın ileri eksen etrafındaki eğimi (çapraz kesiş hissi). */
  tilt: number;
  /** Genel şiddet (bloom'u ne kadar besler). */
  intensity: number;
}

const LOOK: Record<SwingKind, SwingLook> = {
  // Düz vuruş: kısa, hızlı, soğuk mavi (karakterin kendi büyü paleti).
  basic: {
    color: "#7dd3fc",
    hot: "#ffffff",
    arc: 2.2,
    radius: 0.72,
    width: 0.2,
    tilt: 0.42,
    intensity: 0.85,
  },
  // Yetenek atışı: daha geniş yay, amber (süper yetenek rengi).
  super: {
    color: "#fcd34d",
    hot: "#fff7ed",
    arc: 2.6,
    radius: 0.78,
    width: 0.26,
    tilt: 0.34,
    intensity: 1,
  },
  // Ulti: gövdeyi saran en geniş yay, turuncu magma.
  ult: {
    color: "#fb923c",
    hot: "#fff1e6",
    arc: 3.3,
    radius: 0.92,
    width: 0.34,
    tilt: 0.2,
    intensity: 1.2,
  },
};

/** Yetenek kullanımında izin toplam ömrü (sn): `castFxT` 1 → 0 bu sürede iner. */
const CAST_FX_TIME = 0.34;
/** Ulti salınımının iz süresi (sn). */
const ULT_FX_TIME = 0.5;
/** Salınım bittikten sonra yayın kaç saniyede kaybolduğu. */
const FADE_TIME = 0.17;
/** Kuyruk uzunluğu (yayın uv uzayında uçtan geriye payı). */
const TAIL = 0.46;
/** Sönüm bittiğinde ulaşılan sweep değeri (bant yaydan tamamen çıkar). */
const SWEEP_END = 1.32;
/** İzin durduğu yükseklik (göğüs hizası, rig birimi). */
const ORIGIN_Y = 0.92;

/* ------------------------------- shader --------------------------------- */

const VERTEX_SHADER = /* glsl */ `
  uniform float uArc;     // toplam yay açısı
  uniform float uRadius;  // yay yarıçapı
  uniform float uWidth;   // bandın radyal kalınlığı
  uniform float uTilt;    // ileri eksen etrafındaki eğim
  varying vec2 vUv;

  void main() {
    vUv = uv;
    // uv.x: yay boyunca (−arc/2 … +arc/2), a = 0 → lokal +Z (karakterin önü).
    float a = (uv.x - 0.5) * uArc;
    float r = uRadius + (uv.y - 0.5) * uWidth;
    float px = sin(a) * r;
    float pz = cos(a) * r;
    // Eğim: (x, 0) düzlemini Z ekseni etrafında döndürür → yay bir ucu
    // yukarıda, diğeri aşağıda durur (gerçek bir kılıç salınımı gibi).
    float ct = cos(uTilt);
    float st = sin(uTilt);
    vec3 local = vec3(px * ct, px * st, pz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform float uSweep;    // 0..~1.32: bıçağın ucunun yay üzerindeki konumu
  uniform float uTail;     // ucun arkasındaki kuyruk uzunluğu
  uniform float uOpacity;  // genel şiddet
  uniform vec3  uColor;    // yetenek rengi
  uniform vec3  uHot;      // sıcak çekirdek
  varying vec2 vUv;

  void main() {
    // Uçtan geriye olan uzaklık: d > 0 → bıçak bu noktadan geçti.
    float d = uSweep - vUv.x;
    if (d < 0.0) discard;                       // bıçağın önü boş kalır

    float lead = smoothstep(0.0, 0.035, d);     // ucun yumuşak kenarı
    float tail = 1.0 - smoothstep(0.0, uTail, d); // kuyruk sönümü
    // Bandın merkezi parlak, kenarları sıcak renge çalar.
    float band = 1.0 - abs(vUv.y - 0.5) * 2.0;
    if (band <= 0.0) discard;
    float core = pow(band, 2.6);

    vec3 col = mix(uColor, uHot, core);
    float a = lead * tail * (0.28 + 0.85 * core) * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
  }
`;

interface SwingUniforms {
  uSweep: THREE.IUniform<number>;
  uTail: THREE.IUniform<number>;
  uOpacity: THREE.IUniform<number>;
  uColor: THREE.IUniform<THREE.Color>;
  uHot: THREE.IUniform<THREE.Color>;
  uArc: THREE.IUniform<number>;
  uRadius: THREE.IUniform<number>;
  uWidth: THREE.IUniform<number>;
  uTilt: THREE.IUniform<number>;
}

/**
 * Bir dövüşçünün kılıç izi. Rig kökünün İÇİNE çizilir; konum/yön/ölçek zaten
 * rig grubundan geldiği için burada yalnızca yay ve zamanlama yönetilir.
 */
export function SlashTrail({
  fighter,
  /** Vuruş animasyonunun toplam süresi (Arena3D'deki ATK_ANIM). */
  swingTime,
}: {
  fighter: MutableRefObject<BattleFighter>;
  swingTime: number;
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          uSweep: { value: 0 },
          uTail: { value: TAIL },
          uOpacity: { value: 0 },
          uColor: { value: new THREE.Color(LOOK.basic.color) },
          uHot: { value: new THREE.Color(LOOK.basic.hot) },
          uArc: { value: LOOK.basic.arc },
          uRadius: { value: LOOK.basic.radius },
          uWidth: { value: LOOK.basic.width },
          uTilt: { value: LOOK.basic.tilt },
        },
        transparent: true,
        depthWrite: false,
        // Additif + toneMapped=false: ACES tone mapping izi kısamaz, iz her
        // zeminde canlı kalır ve UnrealBloomPass eşiğini geçer.
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const u = material.uniforms as unknown as SwingUniforms;
  const group = useRef<THREE.Group>(null);
  const prevUlt = useRef(0);
  const prevCast = useRef(0);
  const st = useRef({
    sweep: 0,
    active: false,
    fade: 0,
    kind: "basic" as SwingKind,
  });

  useEffect(
    () => () => {
      material.dispose();
    },
    [material],
  );

  useFrame((state, dt) => {
    const f = fighter.current;
    const time = state.clock.elapsedTime;
    const s = st.current;

    // ── tetikleyiciler ──────────────────────────────────────────────────
    let progress = -1; // <0 → bu karede aktif salınım yok
    let kind: SwingKind = "basic";

    const ultOn = f.samuraiUltT > 0;
    const castFx = f.castFxT ?? 0;
    if (ultOn && prevUlt.current <= 0) s.fade = 0; // yeni salınım: kuyruğu sıfırla
    if (castFx > 0 && prevCast.current <= 0) s.fade = 0;
    prevUlt.current = ultOn ? 1 : 0;
    prevCast.current = castFx > 0 ? 1 : 0;

    if (ultOn) {
      // Ulti: salınımın kendisi `samuraiUltT` sayacıyla ilerliyor.
      progress = Math.min(1, Math.max(0, 1 - f.samuraiUltT / ULT_FX_TIME));
      kind = "ult";
    } else if (castFx > 0) {
      // Yetenek: castFxT 1 → 0 iner; sayaç burada (tek sahibi) azalır.
      f.castFxT = Math.max(0, castFx - dt / CAST_FX_TIME);
      progress = 1 - castFx;
      kind = "super";
    } else if (f.atkAnimT > 0) {
      // Düz vuruş: animasyonun kendi saati (iptal edilirse anında biter).
      progress = Math.min(1, Math.max(0, 1 - f.atkAnimT / swingTime));
      kind = "basic";
    }

    // ── sweep ilerlemesi ────────────────────────────────────────────────
    if (progress >= 0) {
      s.active = true;
      s.fade = 0;
      s.kind = kind;
      s.sweep = progress;
    } else if (s.active) {
      // Salınım bitti: yay biraz daha ilerleyip yaydan tamamen çıkar.
      s.fade += dt;
      s.sweep = 1 + (s.fade / FADE_TIME) * (SWEEP_END - 1);
      if (s.sweep >= SWEEP_END) s.active = false;
    }

    const g = group.current;
    if (!g) return;
    if (!s.active) {
      if (g.visible) g.visible = false;
      return;
    }
    if (!g.visible) g.visible = true;

    // ── uniform yazımı (kare başına 8 skaler; tahsis yok) ───────────────
    const look = LOOK[s.kind];
    u.uSweep.value = s.sweep;
    // Kuyruk, salınımın ortasında en uzun; bitişte kısalıp kaybolur.
    u.uTail.value = TAIL * Math.min(1, 0.35 + s.sweep * 0.9);
    u.uOpacity.value =
      look.intensity * (1 - Math.max(0, (s.sweep - 1) / (SWEEP_END - 1)));
    u.uColor.value.set(look.color);
    u.uHot.value.set(look.hot);
    if (u.uArc.value !== look.arc) {
      u.uArc.value = look.arc;
      u.uRadius.value = look.radius;
      u.uWidth.value = look.width;
      u.uTilt.value = look.tilt;
    }
    // İzin yüksekliği salınım boyunca hafifçe alçalır: kılıç yayı gövdede
    // yukarıdan aşağı süpürüyormuş gibi okunur.
    g.position.y =
      ORIGIN_Y - 0.06 * Math.min(1, s.sweep) + 0.02 * Math.sin(time * 9);
  });

  return (
    <group
      ref={group}
      visible={false}
      position={[0, ORIGIN_Y, 0]}
      raycast={() => null}
    >
      <mesh material={material} raycast={() => null}>
        {/* 48 dilim: yay pürüzsüz, bant kenarı tırtıksız. */}
        <planeGeometry args={[1, 1, 48, 1]} />
      </mesh>
    </group>
  );
}
