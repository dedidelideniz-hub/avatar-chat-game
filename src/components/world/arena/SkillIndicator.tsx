// 🎯 SkillIndicator — zemin üzerinde dönen, custom shader ile çizilen menzil
// göstergesi.
//
// Eskiden menzil çemberi canvas'a çizilmiş bir dokuydu (kesikli bant + ince
// çekirdek + ayrı bir nabız düzlemi). Artık hepsi TEK bir fragment shader
// içinde analitik olarak üretilir:
//
//   · dönen kesikli bant (24 ince ışın + 4 kalın tik)
//   · menzil sınırını net okutan ince çekirdek halka
//   · çembere yapışan yumuşak ışıma (bloom'a giren hale)
//   · dışa doğru atan nabız halkası (menzil sınırı hissi)
//
// Kazanç: dış varlık/doku yüklemesi yok, çember artık piksellenmiyor ve
// UnrealBloomPass eşiğini doğrudan geçen gerçek bir ışıma üretiyor. Bütün
// değerler uniform'dur; React durumu veya yeniden çizim tetiklenmez —
// güncellemeyi sahnenin tek `useFrame` (delta) döngüsü yapar.
import type { MutableRefObject } from "react";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** Menzil çemberinin düzlem yarıçapına oranı: nabız halkası taşabilsin diye pay. */
export const INDICATOR_PLANE_SCALE = 1.14;
/** uv uzayında menzil çemberinin yarıçapı (plane yarısı = 1). */
export const INDICATOR_RING_UV = 1 / INDICATOR_PLANE_SCALE;

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform float uTime;    // saniye — dönüş ve nefes için
  uniform float uRing;    // menzil çemberinin uv yarıçapı
  uniform float uPulse;   // 0..1 dışa atan nabız ilerlemesi
  uniform float uOpacity; // genel şiddet (nişan alırken artar)
  uniform float uGlow;    // dışa yayılan ışıma (bloom beslemesi)
  uniform vec3  uColor;

  /** Gaussian bant: merkezden uzaklaştıkça yumuşakça söner (keskin kenar yok). */
  float band(float d, float w) {
    return exp(-(d * d) / (w * w));
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    // Menzilin biraz ötesi tamamen boş kalsın: çember zemini kaplamaz,
    // yalnızca sınırı ve ışımasını gösterir.
    float outer = uRing * 1.16;
    if (r > outer) discard;

    float ang = atan(p.y, p.x);
    // Yavaş dönüş: bant fark edilir şekilde döner ama göz yormaz (~20°/sn).
    float spin = uTime * 0.35;

    // 1) dönen kesikli bant — 24 ince ışın + 4 kalın tik
    float spokes = pow(0.5 + 0.5 * sin(ang * 24.0 + spin * 24.0), 5.0);
    float ticks = pow(0.5 + 0.5 * sin(ang * 4.0 + spin * 4.0), 3.0);
    float dashed = band(abs(r - uRing), uRing * 0.013) * (0.42 * spokes + 0.85 * ticks);

    // 2) menzil sınırını net okutan ince çekirdek halka
    float core = band(abs(r - uRing), uRing * 0.005) * 0.8;

    // 3) çembere yapışan yumuşak ışıma (bloom'a giren hale)
    float glow = band(abs(r - uRing), uRing * 0.055) * uGlow;

    // 4) dışa atan nabız halkası — menzil sınırına doğru yayılıp söner
    float pr = uRing * (1.0 + 0.055 * uPulse);
    float pulse = band(abs(r - pr), uRing * 0.009) * (1.0 - uPulse) * 0.85;

    // 5) çok hafif iç ışıma: alanı boyamaz, çemberin içini belli eder.
    // (smoothstep'in kenarları KÜÇÜKTEN BÜYÜĞE verilir; ters sıra GLSL'de
    // tanımsız sonuç üretir.)
    float sheen = (1.0 - smoothstep(uRing * 0.4, uRing, r)) * 0.03;

    float a = (dashed + core + glow + pulse + sheen) * uOpacity;
    // Kenar yumuşatma: dış sınırda aniden kesilmesin.
    a *= 1.0 - smoothstep(uRing * 1.02, outer, r);
    if (a < 0.002) discard;

    gl_FragColor = vec4(uColor, a);
  }
`;

/** Shader uniform'ları — sahne döngüsü doğrudan yazar (React state yok). */
export interface SkillIndicatorUniforms {
  uTime: THREE.IUniform<number>;
  uRing: THREE.IUniform<number>;
  uPulse: THREE.IUniform<number>;
  uOpacity: THREE.IUniform<number>;
  uGlow: THREE.IUniform<number>;
  uColor: THREE.IUniform<THREE.Color>;
}

export interface SkillIndicatorHandle {
  /** Görünürlük ve konum bu mesh üzerinden yönetilir. */
  mesh: THREE.Mesh;
  /** Her karede yazılan shader uniform'ları (tahsis yok). */
  uniforms: SkillIndicatorUniforms;
}

/**
 * Zemin nişan dairesi. Konumlandırma ve uniform güncellemesi çağıran tarafta,
 * sahnenin tek kare döngüsünde yapılır (bkz. SkillshotIndicator).
 */
export function SkillIndicator({
  handle,
  /** Menzil (birim) — düzlem bu yarıçapa göre ölçeklenir. */
  radius,
}: {
  handle: MutableRefObject<SkillIndicatorHandle | null>;
  radius: number;
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uRing: { value: INDICATOR_RING_UV },
          uPulse: { value: 0 },
          uOpacity: { value: 0 },
          uGlow: { value: 0.3 },
          uColor: { value: new THREE.Color("#7dd3fc") },
        },
        transparent: true,
        depthWrite: false,
        // Additif + toneMapped=false: ACES tone mapping göstergenin parlaklığını
        // kısamaz, her koşulda canlı kalır ve bloom eşiğini geçer.
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  // Uniform okuma/yazma tipini tek yerde sabitler (her kare yazılan değerler).
  const uniforms = material.uniforms as unknown as SkillIndicatorUniforms;

  useEffect(
    () => () => {
      material.dispose();
    },
    [material],
  );

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.06, 0]}
      raycast={() => null}
      material={material}
      ref={(mesh) => {
        handle.current = mesh ? { mesh, uniforms } : null;
      }}
    >
      <planeGeometry
        args={[radius * 2 * INDICATOR_PLANE_SCALE, radius * 2 * INDICATOR_PLANE_SCALE]}
      />
    </mesh>
  );
}
