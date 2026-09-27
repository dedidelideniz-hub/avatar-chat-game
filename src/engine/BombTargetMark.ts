// 🎯 BombTargetMark — fırlatılan bombanın ALTINDA, yere çizilen hedef alanı.
//
// NEDEN GEREKLİ: bomba atıldığında oyuncunun bilmesi gereken tek şey "nereye
// düşecek ve ne kadarını yakacak"tır. Eskiden zeminde yalnızca soluk bir sıcak
// leke vardı; atışın yarıçapı (3.3 birim) ise görünmüyordu — oyuncu kendi
// hasar alanını ancak patladıktan sonra okuyabiliyordu. Bu katman o boşluğu
// doldurur ve MOBA dilinin standart "hedef göstergesi"ni kurar:
//
//   · BEYAZ HEDEF ALANI — dönen kesikli bant + kesintisiz ince halka (gerçek
//     patlama yarıçapı: `grow` = `radius`). Bloom eşiğini geçer, her zeminde
//     okunur.
//   · KIRMIZI TEHLİKE HALKASI — alanın İÇİNDE, kalın ve 12 tikli: "buraya
//     basma" bilgisini beyazdan ayırır (renk körlüğünde bile tik sayısı kalır).
//     Üzerine artı işareti (crosshair) çizilir: alanın merkezi kaybolmaz.
//   · NİNJA SEMBOLÜ (shuriken) — merkezde YAVAŞÇA dönen 4 kanatlı yıldız.
//     Prosedürel canvas dokusudur (yazı tipi bağımlılığı yok: kanji glifi
//     olmayan cihazlarda "tofu" kutusu çizilmesin).
//   · NABIZ HALKASI — merkezden hedef sınırına doğru tekrar tekrar atar:
//     alan canlıdır, durgun bir dekal değildir.
//
// ⚠️ IŞIK YOK: katmanlar additif ve normal karışımın karışımıdır; nokta ışığı
// eklemek ışık sayısını değiştirip arenadaki tüm shader'ları yeniden derletir
// (bkz. `engine/BombFuseFlame` → "IŞIK SAYISI" notu).
//
// ÖLÇÜ: yarıçap DÜNYA birimidir ve çağıran tarafından gerçek hasar yarıçapından
// türetilir (bkz. `arena/bombKit` → `BOMB_THROW_BLAST_PX`), yani gösterge
// yalan söylemez.
import * as THREE from "three";

/** Düzlemin yarıçapa oranı: nabız/ışıma halkası taşabilsin diye küçük pay. */
const PLANE_SCALE = 1.06;
/** uv uzayında hedef alanının yarıçapı (düzlem yarısı = 1). */
const RING_UV = 1 / PLANE_SCALE;
/** Kırmızı tehlike halkasının hedef alanına oranı (alanın İÇİNDE durur). */
const DANGER_RATIO = 0.55;

/** Beyaz hedef alanı (oyuncu) ve düşman bomba için kızıla çalan ton. */
const TINT_PLAYER = "#f8fafc";
const TINT_ENEMY = "#fecdd3";
/** Tehlike rengi: her iki tarafta da kırmızı (uyarı dili ortak kalsın). */
const DANGER_COLOR = "#ff2d2d";

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

  uniform float uTime;
  uniform float uRing;    // hedef alanının uv yarıçapı
  uniform float uDanger;  // kırmızı tehlike halkasının uv yarıçapı
  uniform float uOpacity; // genel şiddet (görünürlük/sönüm)
  uniform float uGlow;    // dışa yayılan ışıma (bloom beslemesi)
  uniform vec3 uTint;     // hedef alanı rengi
  uniform vec3 uDangerColor;

  /** Gaussian bant: keskin kenar yerine yumuşak sınır. */
  float band(float d, float w) {
    return exp(-(d * d) / (w * w));
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    // Alanın biraz ötesi tamamen boş: gösterge zemini boyamaz, sınırı gösterir.
    float outer = uRing * 1.04;
    if (r > outer) discard;

    float ang = atan(p.y, p.x);
    float spin = uTime * 0.62; // ılık dönüş: dinamik ama göz yormaz

    // 1) dönen kesikli bant — 36 ince ışın + 8 kalın tik
    float spokes = pow(0.5 + 0.5 * sin(ang * 36.0 + spin * 36.0), 6.0);
    float ticks = pow(0.5 + 0.5 * sin(ang * 8.0 + spin * 8.0), 3.0);
    float dashed = band(abs(r - uRing), uRing * 0.015) * (0.5 * spokes + 0.9 * ticks);
    // 2) kesintisiz ince halka — hedef sınırını NET okutur
    float core = band(abs(r - uRing), uRing * 0.006) * 0.85;
    // 3) sınıra yapışan yumuşak ışıma (bloom'a girer)
    float glow = band(abs(r - uRing), uRing * 0.05) * uGlow;

    // 4) KIRMIZI TEHLİKE HALKASI: kalın, 12 tikli; tikler ters yöne döner.
    float dangerTick = pow(0.5 + 0.5 * sin(ang * 12.0 - spin * 12.0), 4.0);
    float danger = band(abs(r - uDanger), uDanger * 0.055) * (1.0 + 1.1 * dangerTick);
    // 4b) artı işareti: merkezden dışa uzanan ince eksen çizgileri
    float cross = band(min(abs(p.x), abs(p.y)), uDanger * 0.012) *
      (1.0 - smoothstep(uDanger * 0.2, uDanger * 1.2, r)) * 0.8;

    // 5) dışa atan nabız halkası (merkezden hedef sınırına doğru, tekrar eder).
    // EASE-IN-OUT: ham fract doğrusal bir testere dişidir ve halka sıfırlanırken
    // "zıplar"; smoothstep eğrisi halkayı önce hızlandırıp sonra yavaşlatır,
    // parlaklık da sıfırlanma anında söndüğü için eklem görünmez.
    float raw = fract(uTime * 0.9);
    float pulse = raw * raw * (3.0 - 2.0 * raw);
    float ringPulse = band(abs(r - uRing * pulse), uRing * 0.012) * (1.0 - raw) * 0.78;

    // 6) çok hafif alan dolgusu: bölgeyi belli eder, görüşü kapatmaz.
    float wash = (1.0 - smoothstep(uRing * 0.25, uRing, r)) * 0.05;

    float light = dashed + core + glow + ringPulse + wash;
    float hot = danger + cross;
    vec3 col = uTint * light + uDangerColor * hot;
    float a = light + hot * 0.9;
    // Dış sınırda yumuşak kesilme.
    a *= 1.0 - smoothstep(uRing * 0.98, outer, r);
    a *= uOpacity;
    if (a < 0.003) discard;

    gl_FragColor = vec4(col, a);
  }
`;

/** Shuriken dokusu (bir kez üretilir, tüm işaretler paylaşır). */
let shurikenTexture: THREE.Texture | null = null;

function makeShurikenTexture(): THREE.Texture {
  if (shurikenTexture) return shurikenTexture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const c = size / 2;
    ctx.translate(c, c);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(255,255,255,0.85)";
    ctx.shadowBlur = size * 0.09;
    // 4 kanatlı yıldız: 4 uzun uç (kıvrık), 4 iç çukur — shuriken silüeti.
    const outer = c * 0.94;
    const inner = c * 0.3;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? outer : inner;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    // Kanatların içe bakan kenarlarını belirginleştir (yıldız "keskin" okunsun).
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = size * 0.014;
    ctx.stroke();
    // Merkez deliği: gerçek shuriken'deki halka (doku delinir).
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(0, 0, c * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  shurikenTexture = texture;
  return texture;
}

export interface BombTargetMark {
  /** Zemine yerleştirilecek kapsayıcı (y = 0). */
  group: THREE.Group;
  /**
   * Dünya konumu + şiddet. `intensity` 0 → gizli, 1 → tam parlak
   * (uçuşun sonunda `rangeFade` ile sönmesi için).
   */
  setPose(x: number, z: number, intensity: number): void;
  /**
   * Görünürlüğü yumuşakça sıfıra indirir; KONUMU DEĞİŞTİRMEZ. Uçuş bittiğinde
   * çağrılır: gösterge olduğu yerde söner (merkeze zıplamaz).
   */
  release(): void;
  /** Her karede: dönüş, nabız ve şiddet uygulaması. */
  update(dt: number, time: number): void;
  /** Oyuncu/düşman ayrımı (alan tonu). Tehlike halkası her zaman kırmızıdır. */
  setTint(color: string): void;
  dispose(): void;
}

/**
 * Verilen DÜNYA yarıçapı için hedef göstergesi kurar (yarıçap gerçek patlama
 * yarıçapı olmalıdır — gösterge hasar alanını dürüstçe anlatsın).
 */
export function createBombTargetMark(radius: number): BombTargetMark {
  const group = new THREE.Group();
  group.visible = false;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRing: { value: RING_UV },
      uDanger: { value: RING_UV * DANGER_RATIO },
      uOpacity: { value: 0 },
      uGlow: { value: 0.3 },
      uTint: { value: new THREE.Color(TINT_PLAYER) },
      uDangerColor: { value: new THREE.Color(DANGER_COLOR) },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    // Additif + toneMapped=false: arena aydınlığı göstergenin parlaklığını
    // kısamaz ve bloom eşiğini her koşulda geçer (menzil çemberiyle aynı kural).
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
    // Gösterge geniş ve ZEMİNE ÇOK YAKIN bir düzlemdir: zemin engebeleri onu
    // yutmasın diye derinlik ofseti verilir (bkz. `GroundCrack` zemin şeritleri).
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2 * PLANE_SCALE, radius * 2 * PLANE_SCALE),
    material,
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.055; // zeminin hemen üstünde (z-fighting yok)
  disc.raycast = () => {};

  // Merkezdeki ninja sembolü: shuriken. Sprite'tır → her zaman kameraya bakar.
  const shurikenMaterial = new THREE.SpriteMaterial({
    map: makeShurikenTexture(),
    color: DANGER_COLOR,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const shuriken = new THREE.Sprite(shurikenMaterial);
  /** Sembolün temel ölçeği: nabız bu değer etrafında salınır. */
  const baseScale = radius * 0.58;
  shuriken.scale.setScalar(baseScale);
  shuriken.position.y = 0.09;
  shuriken.raycast = () => {};
  shuriken.frustumCulled = false;

  group.add(disc, shuriken);

  /** Hedef şiddeti (uçuşta 1, kaybolurken 0). Görünürlük bunu İZLEYEREK yumuşar. */
  let target = 0;
  let current = 0;

  const setPose = (x: number, z: number, intensity: number) => {
    group.position.set(x, 0, z);
    target = intensity;
  };

  // Sönme KONUMU KORUR: uçuş bitince gösterge yerinde dağılır, merkeze atlamaz.
  const release = () => {
    target = 0;
  };

  const update = (dt: number, time: number) => {
    // ALFA YUMUŞATMA: hedef şiddete üstel yaklaşma + hafif sine "nefesi".
    // Böylece gösterge sertçe açılıp kapanmaz; görünürken de canlı kalır.
    // Görünürlük kararı BURADADIR (setPose değil): kaybolma da yumuşak olur.
    const approach = 1 - Math.exp(-dt * 10);
    current += (target - current) * approach;
    const breath = 0.9 + 0.1 * Math.sin(time * 2.0);
    const visible = current * breath;
    const on = visible > 0.01;
    if (group.visible !== on) group.visible = on;
    if (!on) return;

    material.uniforms.uTime.value = time;
    material.uniforms.uOpacity.value = visible;
    shurikenMaterial.opacity = 0.85 * visible;
    // Işıma: ease-in-out bir sine nefesi (0.24 → 0.46 arası yumuşak salınım).
    material.uniforms.uGlow.value =
      0.24 + 0.22 * (0.5 + 0.5 * Math.sin(time * 1.9));
    // Shuriken DİNAMİK döner: sabit tur yerine hızlanıp yavaşlayan bir oran
    // (0.9 → 2.0 rad/sn) — ninja sembolü canlı okunur.
    const rate = 0.9 + 1.1 * (0.5 + 0.5 * Math.sin(time * 1.7));
    shurikenMaterial.rotation += dt * rate;
    // Nabız atan ölçek: sembol nefes alıyormuş gibi hafifçe büyüyüp küçülür.
    shuriken.scale.setScalar(baseScale * (1 + 0.08 * Math.sin(time * 2.6)));
  };

  const setTint = (color: string) => {
    material.uniforms.uTint.value.set(color);
  };

  const dispose = () => {
    group.removeFromParent();
    group.clear();
    disc.geometry.dispose();
    material.dispose();
    shurikenMaterial.dispose();
  };

  return { group, setPose, release, update, setTint, dispose };
}

/** Oyuncu/düşman bombası için hazır tonlar (çağıran `setTint`e verir). */
export const BOMB_MARK_TINTS = {
  player: TINT_PLAYER,
  enemy: TINT_ENEMY,
} as const;
