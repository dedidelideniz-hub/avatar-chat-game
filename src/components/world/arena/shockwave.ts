// 💥 Şok dalgası diski — yeni `"shock"` efekt türünün zemindeki görünümü.
//
// NEDEN AYRI BİR TÜR: patlama halkaları (`"ring"`) ince bir TORUS'tur; yalnızca
// sınırı çizer, "havayı iten" kütleyi göstermez. Şok dalgası ise iki parçadan
// oluşur ve bu yüzden tek bir mesh içinde shader'la üretilir:
//
//   · CEPHE — merkezden dışa koşan İNCE ve PARLAK halka (basınç cephesinin
//     kendisi), bloom eşiğini geçer.
//   · KUYRUK — cephenin ARKASINDA kalan geniş, ÇOK SAYDAM disk: "tozlu hava
//     kütlesi". Saydamlık şart; opak bir disk zemini kapatır ve patlamayı
//     "boyanmış daire"ye çevirirdi.
//   · İÇ HALKA — cephe ilerlerken geride kalan zayıf kırınım halkası; dalganın
//     hacimli okunmasını sağlar (tek halka düz bir çizgi gibi durur).
//
// Diskin yerel yarıçapı 1'dir: çağıran mesh'i `grow` kadar ölçekler ve
// `uProgress`i 0→1 sürer (bkz. `Arena3D` → FxPool).
import * as THREE from "three";

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

  uniform float uProgress; // 0 → 1: cephenin diskin kenarına ilerlemesi
  uniform float uOpacity;  // genel şiddet (ömür boyunca söner)
  uniform vec3 uColor;

  /** Gaussian bant: keskin kenar yerine yumuşak geçiş. */
  float band(float d, float w) {
    return exp(-(d * d) / (w * w));
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    // Cephenin ÖNÜNE hiçbir şey çizilmez: dalga büyürken "açılır".
    if (r > uProgress + 0.02) discard;

    float front = band(abs(r - uProgress), 0.045);
    float wash = (1.0 - smoothstep(max(uProgress - 0.55, 0.0), uProgress, r)) * 0.17;
    float inner = band(abs(r - uProgress * 0.62), 0.022) * 0.4 * (1.0 - uProgress);

    float a = (front + wash + inner) * uOpacity;
    if (a < 0.004) discard;

    // Additif karışımda parlaklık RENGE yazılır (alfa kırpılmasına takılmaz).
    // Katsayılar YÜKSELTİLDİ (0.7/0.9 → 1.15/1.7): turuncu barut tonunun
    // lineer parlaklığı düşüktür ve eski değerler bloom eşiğinin altında
    // kalıyordu — dalganın ön cephesi artık gerçekten ışıyor (AAA patlama).
    gl_FragColor = vec4(uColor * (1.15 + 1.7 * front + 0.35 * inner), a);
  }
`;

/**
 * Şok dalgası diski için malzeme. Her havuz yuvası kendi malzemesini taşır
 * (uniform'lar yuva başına yazılır) ama shader programı paylaşılır.
 */
export function createShockwaveMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    // Additif + toneMapped=false: dalga her zeminde parlar ve bloom eşiğini
    // geçer (diğer zemin efektleriyle aynı kural).
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
    // Geniş bir disk zemine çok yakın durduğu için zemin engebeleri onu
    // yutabilir; derinlik ofseti yüzeyi öne çeker (bkz. `GroundCrack`).
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}
