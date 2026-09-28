/**
 * YAPRAK SALLANMASI — tamamen GPU'da (vertex shader), CPU'ya sıfır iş.
 *
 * İstem: "ağaç yaprakları hafifçe sallansın ama oyun kasmasın." Bunun için
 * kare başına instance matrisi güncellenmez; salınım materyalin vertex
 * shader'ına enjekte edilir:
 *
 *   · CPU maliyeti: kare başına TEK uniform yazımı (kaç ağaç olursa olsun aynı),
 *   · ek draw call / ek geometri / ek ışık YOK (shader bir kez derlenir),
 *   · GPU maliyeti: yalnızca yaprak kartlarının vertex'lerinde birkaç `sin()`.
 *
 * Salınım fazı ağacın KONUMUNDAN türeyir → komşu ağaçlar farklı ritimde
 * sallanır, hiçbiri diğeriyle aynı anda eğilmez.
 */
import * as THREE from "three";

export interface FoliageSwayOptions {
  /**
   * Tepe noktasındaki yatay salınım — NORMALİZE model biriminde (model boyu
   * 1 birime ölçeklendiği için `0.035 × ağaç boyu 2.4 ≈ 8 cm`).
   */
  amount?: number;
  /** Salınım hızı (rad/s): 0.9 ≈ 7 saniyelik yumuşak esinti. */
  speed?: number;
}

const DEFAULT_AMOUNT = 0.035;
const DEFAULT_SPEED = 0.9;

/** Bu anahtar, program önbelleğinde sallanan materyali normalden ayırır. */
const PROGRAM_CACHE_KEY = "vaelos-foliage-sway";

/**
 * TÜM sallanan materyallerin paylaştığı tek zaman uniformu: sahne kaç ağaç
 * olursa olsun kare başına tek yazım.
 */
const swayClock = { value: 0 };

/* ═══════════════════════════════════════════════════════════ */
/*  Vertex shader enjeksiyonu                                   */
/* ═══════════════════════════════════════════════════════════ */

const SWAY_HEADER = `
uniform float uSwayTime;
uniform float uSwayAmount;
uniform float uSwaySpeed;
`;

/**
 * `#include <begin_vertex>` sonrasında çalışır: `transformed` o noktada
 * nesne uzayında tanımlıdır (instancing çarpanı henüz uygulanmadı).
 */
const SWAY_BODY = `
  // Faz ağacın konumundan gelir: her ağaç kendi ritminde sallanır.
  // (Normalize modelde taban y = 0, tepe y = 1.)
#ifdef USE_INSTANCING
  vec2 swayAnchor = instanceMatrix[3].xz;
#else
  vec2 swayAnchor = vec2(0.0);
#endif
  float swayPhase = swayAnchor.x * 0.61 + swayAnchor.y * 0.47;
  // Tabanda sıfır, tepede en yüksek: gövde sabit durur, taç esner.
  float swayWeight = clamp(position.y, 0.0, 1.0);
  swayWeight *= swayWeight;
  float swayWave = sin(uSwayTime * uSwaySpeed + swayPhase)
    + 0.35 * sin(uSwayTime * uSwaySpeed * 2.3 + swayPhase * 1.7);
  transformed.x += swayWave * uSwayAmount * swayWeight;
  transformed.z += cos(uSwayTime * uSwaySpeed * 0.87 + swayPhase * 1.3)
    * uSwayAmount * swayWeight * 0.6;
`;

/**
 * Materyale hafif yaprak salınımı ekler. Model zaten 0..1 yüksekliğe normalize
 * edilmiş olmalı (bkz. `vegModelPrep.ts`), yoksa `position.y` ağırlığı yanlış
 * ölçeklenir.
 */
export function enableFoliageSway(
  material: THREE.Material,
  options: FoliageSwayOptions = {},
): void {
  const amount = options.amount ?? DEFAULT_AMOUNT;
  const speed = options.speed ?? DEFAULT_SPEED;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSwayTime = swayClock;
    shader.uniforms.uSwayAmount = { value: amount };
    shader.uniforms.uSwaySpeed = { value: speed };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>${SWAY_HEADER}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>${SWAY_BODY}`);
  };

  // three program'ı `customProgramCacheKey` ile önbelleğe alır ve
  // `onBeforeCompile` bu anahtara girmez; vermezsek aynı özellikli başka bir
  // materyalin (sallanmayan) programını kapabilir.
  material.customProgramCacheKey = () => PROGRAM_CACHE_KEY;
  material.needsUpdate = true;
}

/** Kare başına BİR kez çağrılır — tüm sallanan materyaller bu saati okur. */
export function tickFoliageSway(elapsedSeconds: number): void {
  swayClock.value = elapsedSeconds;
}

/** Teşhis: materyale salınım uygulanmış mı? */
export function hasFoliageSway(material: THREE.Material): boolean {
  return material.customProgramCacheKey() === PROGRAM_CACHE_KEY;
}
