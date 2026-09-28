// 🔥 BombFuseFlame — bombanın AĞZINDAKİ (fünye ucundaki) CANLI ateş.
//
// NEDEN KOD, NEDEN DOKU DEĞİL: model dosyası (`comical_bomb.glb`) statiktir;
// içinde ne ışıyan uç ne alev animasyonu vardır. Ateş bu yüzden çalışma
// zamanında kurulur ve modelin fünye ucuna (ağzına) oturtulur:
//
//   · 4 katmanlı alev — sıcak taban (body), parlak çekirdek (core), yukarı
//     uzayan dil (tongue) ve çok soluk bir hâle (halo). Hepsi additif
//     sprite'tır; küre mesh'i DEĞİL (kaba beyaz küre şikâyeti tekrarlanmasın).
//   · TİTREME (flicker) — iki bileşen: hızlı düzensiz hedef değişimi + bu
//     hedefe yumuşak yaklaşma. Sinüs tek başına "mekanik" okunurdu.
//   · KOR PARÇACIKLARI — alevden kopup yükselen 3 minik additif kıvılcım;
//     "canlı" hissini veren şey alevin titremesinden çok bunlardır.
//   · FİTİL KIVILCIMLARI (SPARKLES) — fünye ucundan fışkıran minik turuncu/sarı
//     nokta parçacıkları (bkz. `createFuseSparks`): elde taşınırken fitil
//     HAFİFÇE saçar, tuzakta fitil kısaldıkça fışkırır ve bombanın yere
//     değmesi/kurulma anı bir tutam kıvılcımla vurgulanır.
//   · NOKTASAL IŞIK — fünye ucundan yumuşak turuncu ışık; eli ve bombanın
//     üstünü aydınlatır. Menzili bomba boyuyla ölçeklenir (haritayı boyamaz).
//
// ÖLÇÜ SÖZLEŞMESİ: tüm boyutlar bombanın dünya genişliğinden (`span`) türetilir.
// Konumlandığı kapsayıcı (bkz. `SamuraiBomb` → `pivot`) DÜNYA birimindedir, bu
// yüzden burada 1 birim = 1 dünya birimi; alev avuçla birlikte doğru ölçekte
// görünür ve skin/ölçek değişse de ayar gerekmez.
//
// Erişilebilirlik: `prefers-reduced-motion` açıksa titreme genliği kısılır
// (alev yine yanar, yalnızca sakin durur) — projedeki çim rüzgârıyla aynı kural.
import * as THREE from "three";

/* ------------------------------- doku ------------------------------------ */

/** Yumuşak radyal alev dokusu (bir kez üretilir, tüm bombalar paylaşır). */
let flameTexture: THREE.Texture | null = null;

function makeFlameTexture(): THREE.Texture {
  if (flameTexture) return flameTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    // Beyaz-sıcak çekirdek → amber → turuncu → tamamen saydam kenar.
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.26, "rgba(255,238,186,0.86)");
    g.addColorStop(0.6, "rgba(255,148,42,0.34)");
    g.addColorStop(1, "rgba(255,88,10,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  flameTexture = tex;
  return tex;
}

/** Animasyon kısıtlı mı? (yalnızca bir kez sorulur) */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/* ------------------------------ alev katmanı ------------------------------ */

export interface FuseFlame {
  /** Fünye ucuna oturtulacak kapsayıcı (dünya biriminde konumlanır). */
  group: THREE.Group;
  /** Kare başına ilerletir (`dt` saniye). */
  update(dt: number): void;
  /**
   * Alev tonunu TEHLİKEYE kaydırır (0 = amber/normal, 1 = kırmızı/alarm).
   * Yere bırakılan tuzakta fitil yanarken kullanılır: alev amberden kırmızıya
   * döner ("bu şey patlamak üzere") — ekstra ışık/mesh eklemeden, yalnız renk
   * ve parlaklıkla. Elde taşınan bomba 0'da bırakır (hep sıcak amber).
   */
  setAlert(amount: number): void;
  /**
   * TEK ATIM kıvılcım fışkırtması: bomba yere değdiğinde, tuzak kurulduğunda.
   * Kıvılcımlar sabit havuzdan karşılanır (bkz. `SPARK_POOL`); `power` hızı ve
   * boyu ölçekler (varsayılan 1).
   */
  burst(count: number, power?: number): void;
  dispose(): void;
}

/** Alevin normal (amber) ve alarm (kırmızı) tonları — `setAlert` aralarında geçer. */
const FLAME_CALM = {
  halo: "#ff5c12",
  body: "#ff8a1e",
  tongue: "#ffd25a",
  core: "#fff3c4",
  light: "#ff7a1e",
} as const;
const FLAME_ALERT = {
  halo: "#ff2408",
  body: "#ff3a12",
  tongue: "#ff8a3c",
  core: "#ffd0a0",
  light: "#ff2a10",
} as const;

interface Ember {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  life: number;
  max: number;
  vy: number;
  x: number;
  y: number;
  z: number;
  phase: number;
}

/**
 * Bomba ağzı için canlı alev kurar. `span` = bombanın dünya genişliği
 * (samuray bombası için `BOMB_TARGET_WORLD_SPAN`) — tüm ölçüler bundan türer.
 *
 * `options.light: true` → fünye ucunda NOKTA IŞIĞI da kurulur (çok pahalı,
 * bkz. aşağıdaki "IŞIK SAYISI" notu). VARSAYILAN KAPALI.
 */
export function createFuseFlame(
  span: number,
  options?: { light?: boolean },
): FuseFlame {
  const tex = makeFlameTexture();
  const motion = prefersReducedMotion() ? 0.25 : 1;
  const baseY = 0.1 * span; // alevin dip kotu (fünye ucunun hemen üstü)

  const group = new THREE.Group();
  group.renderOrder = 9;
  group.userData.isEquipment = true;

  const sprites: THREE.Sprite[] = [];
  const mats: THREE.SpriteMaterial[] = [];

  const mkSprite = (color: string, opacity: number): THREE.Sprite => {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      // Additif: ateş ışık yayar. Koyu zemin üstünde okunur, görüşü kapatmaz
      // (opaklıklar düşük tutuldu).
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.raycast = () => {};
    sprite.frustumCulled = false;
    sprite.renderOrder = 9;
    sprite.userData.isEquipment = true;
    group.add(sprite);
    sprites.push(sprite);
    mats.push(mat);
    return sprite;
  };
  /** Sprite'ın malzemesi (dört katmanın hepsi SpriteMaterial taşır). */
  const matOf = (s: THREE.Sprite) => s.material as THREE.SpriteMaterial;

  // Hâle (en soluk, en büyük): ateşin çevresine yayılan sıcak parıltı.
  const halo = mkSprite("#ff5c12", 0.15);
  // Gövde: alevin turuncu tabanı.
  const body = mkSprite("#ff8a1e", 0.85);
  // Dil: yukarı uzayan, hafif eğilen sarı dil.
  const tongue = mkSprite("#ffd25a", 0.75);
  // Çekirdek: en parlak, en küçük beyaz-sıcak nokta.
  const core = mkSprite("#fff3c4", 0.95);
  const haloMat = matOf(halo);
  const bodyMat = matOf(body);
  const tongueMat = matOf(tongue);
  const coreMat = matOf(core);

  // ⚠️ IŞIK SAYISI = KARE SÜRESİ. Aşağıdaki nokta ışığı VARSAYILAN OLARAK
  // KURULMAZ ve bu bilinçli bir performans kararıdır:
  //
  //   · three.js shader programı, sahnedeki ışık SAYISINA göre derlenir.
  //     Görünür bir nokta ışık eklenip çıkınca (bomba elden çıkınca, tuzak
  //     doğunca/patlayınca) sayı değişir ve arenadaki TÜM malzemeler yeniden
  //     derlenir. Bu, tam da yetenek/ulti kullanıldığı anda yüzlerce ms'lik
  //     bir donma olarak görünür.
  //   · Ateşi okunur kılan şey zaten ADDITIF sprite katmanlarıdır (bloom
  //     eşiğini geçerler, `toneMapped = false`); gerçek ışık yalnızca yakın
  //     yüzeyi ısıtır. Sahnedeki şampiyon/kolon ışıkları eli zaten aydınlatır.
  //
  // Işık yine de istenirse TEK bir örnekte açılabilir (anahtar açıkken ışık
  // sayısı sabit kalır, çünkü o örnek hiç gizlenmez).
  //
  // ŞİDDET NEDEN BU KADAR KÜÇÜK: three r155+ fiziksel ışık birimleri kullanır
  // (ışıma = şiddet / mesafe²). Alev elin ~0.1 birim uzağında olduğu için
  // şiddet 1 olsaydı aydınlanma güneş ışığının (≈1.6) onlarca katına çıkıp
  // eli bembeyaz yakardı. 0.014, tam elin üstünde güneşle yarışan sıcak bir
  // parıltı verir.
  const LIGHT_INTENSITY = 0.014;
  const light =
    options?.light === true
      ? new THREE.PointLight("#ff7a1e", LIGHT_INTENSITY, span * 6, 2)
      : null;
  if (light) {
    light.userData.isEquipment = true;
    group.add(light);
  }

  // Kor parçacıkları (alevden kopan minik kıvılcımlar).
  const embers: Ember[] = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: i === 0 ? "#fff0c0" : "#ff9a30",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.raycast = () => {};
    sprite.frustumCulled = false;
    sprite.renderOrder = 9;
    sprite.userData.isEquipment = true;
    group.add(sprite);
    mats.push(mat);
    embers.push({
      sprite,
      mat,
      life: Math.random() * 0.6,
      max: 0.6,
      vy: 0,
      x: 0,
      y: 0,
      z: 0,
      phase: Math.random() * Math.PI * 2,
    });
  }

  let time = Math.random() * 10;
  let flick = 1;
  let target = 1;
  let nextPick = 0;
  /** Tehlike tonu 0..1 (`setAlert`) — renk geçişi kare başına buradan okunur. */
  let alert = 0;
  // Kare başına ayırma yapmamak için ton çiftleri BİR KEZ kurulur.
  const calm = {
    halo: new THREE.Color(FLAME_CALM.halo),
    body: new THREE.Color(FLAME_CALM.body),
    tongue: new THREE.Color(FLAME_CALM.tongue),
    core: new THREE.Color(FLAME_CALM.core),
    light: new THREE.Color(FLAME_CALM.light),
  };
  const danger = {
    halo: new THREE.Color(FLAME_ALERT.halo),
    body: new THREE.Color(FLAME_ALERT.body),
    tongue: new THREE.Color(FLAME_ALERT.tongue),
    core: new THREE.Color(FLAME_ALERT.core),
    light: new THREE.Color(FLAME_ALERT.light),
  };

  /** Bir kor parçacığını alevin dibinde yeniden doğurur. */
  const respawn = (e: Ember) => {
    const ang = Math.random() * Math.PI * 2;
    const r = span * 0.08 * Math.random();
    e.x = Math.cos(ang) * r;
    e.z = Math.sin(ang) * r;
    e.y = baseY + span * 0.12;
    e.vy = span * (0.55 + Math.random() * 0.85);
    e.max = e.life = 0.45 + Math.random() * 0.5;
    e.phase = Math.random() * Math.PI * 2;
  };
  for (const e of embers) {
    respawn(e);
    e.life = Math.random() * e.max; // başlangıçta dağınık fazlar
  }

  // ⚡ FİTİL KIVILCIMLARI: fünye ucundan fışkıran minik nokta parçacıkları.
  // Tek `Points` = tek çizim çağrısı (bkz. `createFuseSparks`); alevle AYNI
  // kapsayıcıda durur, yani konumu/ölçeği alevden miras alınır.
  const sparks = createFuseSparks(span);
  group.add(sparks.group);

  const update = (dt: number) => {
    // Sekme arka plana düştüğünde alev ışınlanmasın.
    const d = Math.min(dt, 1 / 30);
    time += d;

    // Titreme: hızlı düzensiz hedefler + yumuşak yaklaşma (mekanik sinüs yok).
    if (time >= nextPick) {
      nextPick = time + 0.04 + Math.random() * 0.07;
      target = 0.62 + Math.random() * 0.62;
    }
    flick += (target - flick) * Math.min(1, d * (14 + 10 * motion));
    const amp = 1 - motion; // 0 = canlı, 1 = sakin (reduced-motion)
    const f = 1 + (flick - 1) * motion;

    // Hâle: ateşin çevresindeki ışıma. Bomba boyunu aşmayan ölçüde tutulur ve
    // tepede durur → karakterin üzerini kapatmaz (bkz. "görüş açıklığı" kuralı).
    haloMat.opacity = (0.11 + 0.07 * f) * (1 - 0.25 * amp);
    halo.scale.setScalar(span * (1.05 + 0.35 * f));
    halo.position.set(0, baseY + span * 0.32, 0);

    // Gövde: turuncu taban. Dikeyde hafif uzun (alev dili).
    bodyMat.opacity = 0.6 + 0.3 * f;
    body.scale.set(span * (0.6 + 0.18 * f), span * (0.78 + 0.3 * f), 1);
    body.position.set(0, baseY + span * 0.2, 0);

    // Çekirdek: beyaz-sıcak nokta, hafif seğirir. (Titreşim 1'i aşabildiği
    // için opaklık kırpılır — aksi hâlde değer 1.07'ye çıkıyordu.)
    coreMat.opacity = Math.min(1, 0.7 + 0.3 * f);
    core.scale.setScalar(span * (0.34 + 0.24 * f));
    core.position.set(
      Math.sin(time * 11.3) * 0.03 * span * motion,
      baseY + span * (0.22 + 0.06 * f),
      Math.cos(time * 9.1) * 0.03 * span * motion,
    );

    // Dil: yukarı uzayan sarı kısım; yavaşça sağa sola yalpa yapar.
    tongueMat.opacity = 0.5 + 0.35 * f;
    tongue.scale.set(span * 0.34, span * (0.44 + 0.6 * f), 1);
    tongue.position.set(
      Math.sin(time * 6.7) * 0.05 * span * motion,
      baseY + span * (0.4 + 0.14 * f),
      0,
    );
    // Sprite'ı kendi ekseninde yatırmak "yalayan alev" okuması verir.
    tongueMat.rotation = Math.sin(time * 7.9) * 0.22 * motion;

    // 🔴 TEHLİKE TONU: alarm arttıkça tüm katmanlar amberden kırmızıya kayar ve
    // alev biraz daha parlar ("fitil kısaldı" okuması). Elde taşınan bombada
    // `alert` 0 kaldığı için hiçbir şey değişmez.
    if (alert > 0) {
      haloMat.color.copy(calm.halo).lerp(danger.halo, alert);
      bodyMat.color.copy(calm.body).lerp(danger.body, alert);
      tongueMat.color.copy(calm.tongue).lerp(danger.tongue, alert);
      coreMat.color.copy(calm.core).lerp(danger.core, alert);
    }

    // Işık: titremeyle birlikte nefes alır.
    if (light) {
      light.color.copy(calm.light).lerp(danger.light, alert);
      light.intensity =
        LIGHT_INTENSITY * (0.6 + 0.8 * f) * (1 - 0.35 * amp) * (1 + 0.7 * alert);
      light.position.set(0, baseY + span * 0.3, 0);
    }

    // Kor parçacıkları: yükselir, hafifçe salınır, söner.
    for (const e of embers) {
      e.life -= d;
      if (e.life <= 0) {
        respawn(e);
        continue;
      }
      e.y += e.vy * d;
      // Yukarı çıkarken yavaşlar (alevden kopan korun davranışı).
      e.vy -= e.vy * 1.1 * d;
      const k = 1 - e.life / e.max;
      const sway = Math.sin(time * 5.4 + e.phase) * span * 0.12 * motion;
      e.sprite.position.set(e.x + sway * k, e.y, e.z + sway * 0.5 * k);
      e.sprite.scale.setScalar(span * (0.16 - 0.08 * k));
      const fade = 1 - k;
      e.mat.opacity = 0.9 * fade * fade;
    }

    // ⚡ Kıvılcımlar: alevin üstünden kopup giden ateş parçaları. `alert`
    // tuzakta 1'e çıkar → fitil kısaldıkça fışkırma SIKLAŞIR ve HIZLANIR;
    // elde taşınan bomba 0'da bıraktığı için fitil yalnızca hafifçe saçar.
    sparks.update(d, alert);
  };

  const setAlert = (amount: number) => {
    alert = THREE.MathUtils.clamp(amount, 0, 1);
  };

  const burst = (count: number, power?: number) => sparks.burst(count, power);

  const dispose = () => {
    group.removeFromParent();
    group.clear();
    for (const m of mats) m.dispose();
    sparks.dispose();
    light?.dispose();
  };

  // İlk kareyi hemen uygula (alev bir kare boyunca sıfır ölçekte kalmasın).
  update(1 / 60);
  // Fünye ilk karede boş görünmesin: havada birkaç kıvılcım zaten olsun.
  burst(4, 0.75);

  return { group, update, setAlert, burst, dispose };
}

/* --------------------- fitil kıvılcımları (sparkles) ---------------------- */
// Fünye ucundan kopup fışkıran minik turuncu/sarı ateş parçacıkları.
//
// NEDEN GEREKLİ: yanan bir fitilin en güçlü "canlı" okuması alevin titremesi
// değil, kopup giden KIVILCIMLARDIR. Elde taşınan bombada fitil hafifçe saçar;
// yere bırakılan tuzakta fitil kısaldıkça fışkırma sıklaşır ve hızlanır, yani
// "birazdan patlar" bilgisi renkten bağımsız olarak HAREKETLE de verilir.
//
// NEDEN SPRITE DEĞİL `THREE.Points`: her sprite ayrı bir çizim çağrısıdır ve
// aynı anda 11 bomba canlı olabiliyor (elde 1 + havada 4 + yerde 6). 14
// sprite'lık bir kıvılcım bulutu kare başına 150'den fazla çizim çağrısı
// eklerdi; nokta bulutu hepsini TEK çağrıda çizer (boyut/renk köşe
// özniteliklerinden gelir).
//
// IŞIK YOK (bkz. `createFuseFlame` → "IŞIK SAYISI" notu): kıvılcımlar additif
// katmandır; nokta ışığı eklemek yetenek anındaki donmayı geri getirirdi.
//
// NOT: kıvılcımın fade/renk/boyut animasyonu CPU'dadır (14 parçacık için
// önemsiz), kırpma (twinkle) ise shader'dadır — böylece her kıvılcım kendi
// ritminde parlar ama kare başına yalnız 3 küçük tampon güncellenir.

/** Kıvılcım havuzu — kare başına CPU işi bu sayıyla SINIRLIDIR. */
const SPARK_POOL = 14;
/**
 * Nokta boyutunu piksele çeviren referans ölçek:
 * `piksel = dünyaÖlçüsü * (ölçek / mesafe)` (projedeki toz parçacıklarıyla
 * aynı desen, bkz. `GroundCrack` → `DEFAULT_PIXEL_SCALE`). Arena kamerası
 * yakın izometrik bir takip kamerasıdır (bkz. `ArenaCamera`); bomba kameradan
 * ~7-10 birim uzakta durur ve ölçek buna göre seçildi.
 */
const SPARK_PIXEL_SCALE = 700;
/**
 * Kıvılcımın piksel boyutu kırpılır: uzaktaki bombanın kıvılcımı bir piksellik
 * görünmez toza, çok yakındaki ise ekranı kaplayan bir beneğe dönüşmesin.
 * Alt sınır ayrıca bloom eşiğini geçmesini garantiler (kıvılcım PARLAMALI).
 */
const SPARK_MIN_PX = 1.6;
const SPARK_MAX_PX = 8;
/** Saniyede doğan kıvılcım: elde taşınan sakin fünye → tuzakta yanan fitil. */
const SPARK_RATE_CALM = 6;
const SPARK_RATE_ALERT = 20;
/** Yerçekimi (× span) ve hava direnci: kıvılcım bir yay çizer, sonra söner. */
const SPARK_GRAVITY = 6.2;
const SPARK_DRAG = 3.4;
/** Kıvılcımın sıcak (yeni doğmuş) ve soğumuş ucu — `BOMB_PALETTE` ailesi. */
const SPARK_HOT = "#fff2c0";
const SPARK_WARM = "#ff6a14";

const SPARK_VERT = `
attribute float aSize;
attribute float aAlpha;
attribute float aAge;
attribute float aSeed;
uniform float uScale;
uniform float uMinPx;
uniform float uMaxPx;
uniform float uTime;
varying float vAlpha;
varying float vAge;
void main() {
  // Her kıvılcım KENDİ ritminde kırpılır (aSeed): topluca sönseler tek bir
  // "parçacık sistemi" gibi okunurlardı — alevin titremesiyle aynı gerekçe.
  float twinkle = 0.55 + 0.45 * sin( uTime * ( 24.0 + aSeed * 30.0 ) + aSeed * 6.2831 );
  vAlpha = aAlpha * twinkle;
  vAge = aAge;
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  gl_PointSize = clamp( aSize * ( uScale / max( -mv.z, 0.001 ) ), uMinPx, uMaxPx );
  gl_Position = projectionMatrix * mv;
}
`;

const SPARK_FRAG = `
uniform vec3 uHot;
uniform vec3 uWarm;
varying float vAlpha;
varying float vAge;
void main() {
  // Yuvarlak, yumuşak kenarlı nokta: ortası sıcak çekirdek, kenarı sönük
  // (kare nokta "kesilmiş piksel" gibi dururdu).
  float d = length( gl_PointCoord - 0.5 ) * 2.0;
  float glow = 1.0 - smoothstep( 0.25, 1.0, d );
  float core = 1.0 - smoothstep( 0.0, 0.45, d );
  float a = glow * vAlpha;
  if ( a < 0.01 ) discard;
  // Renk SOĞUMAYI anlatır: yeni kopan kıvılcım beyaz-sıcak sarı, sonra
  // turuncuya düşer. Parlaklık RENGE yazılır — additif karışımda alfa
  // kırpılmasına takılmadan yanar (projedeki diğer additif katmanlarla aynı).
  vec3 col = mix( uWarm, uHot, smoothstep( 0.55, 1.0, core ) * ( 1.0 - vAge * 0.75 ) );
  gl_FragColor = vec4( col * ( 0.55 + 1.1 * core ), a );
}
`;

/** Havuzdaki tek bir kıvılcımın durumu (kare başına ayırma yapılmaz). */
interface SparkState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Kalan ömür ve toplam ömür (sn) — yaş `1 - life / max`. */
  life: number;
  max: number;
  /** Doğduğu andaki dünya ölçüsü (boyut yaşla küçülür). */
  size: number;
}

export interface FuseSparks {
  /** Fünye ucuna oturtulacak nokta bulutu (dünya biriminde konumlanır). */
  group: THREE.Points;
  /** Kare başına ilerletir; `alert` (0..1) kıvılcım yoğunluğunu belirler. */
  update(dt: number, alert: number): void;
  /** Tek atım fışkırtma (yere değme, kurulma anı). */
  burst(count: number, power?: number): void;
  dispose(): void;
}

/**
 * Fünye ucu için kıvılcım bulutu kurar. `span` = bombanın dünya genişliği
 * ailesinden gelen fünye ölçüsü (bkz. `createFuseFlame`) — tüm hız/boyut/yükseklik
 * değerleri bundan türer, dolayısıyla ölçek değişse de kıvılcım oransal kalır.
 */
export function createFuseSparks(span: number): FuseSparks {
  // Hareket azaltma: kıvılcım SAYISI ve HIZI kısılır (fünye yine saçar).
  const motion = prefersReducedMotion() ? 0.45 : 1;
  const baseY = 0.1 * span; // alevin dip kotu — kıvılcım oradan kopar

  const positions = new Float32Array(SPARK_POOL * 3);
  const sizes = new Float32Array(SPARK_POOL);
  const alphas = new Float32Array(SPARK_POOL);
  const ages = new Float32Array(SPARK_POOL);
  const seeds = new Float32Array(SPARK_POOL);
  for (let i = 0; i < SPARK_POOL; i++) seeds[i] = Math.random();

  const geometry = new THREE.BufferGeometry();
  const attribute = (array: Float32Array, itemSize: number, dynamic: boolean) => {
    const a = new THREE.BufferAttribute(array, itemSize);
    if (dynamic) a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  geometry.setAttribute("position", attribute(positions, 3, true));
  geometry.setAttribute("aSize", attribute(sizes, 1, true));
  geometry.setAttribute("aAlpha", attribute(alphas, 1, true));
  geometry.setAttribute("aAge", attribute(ages, 1, true));
  geometry.setAttribute("aSeed", attribute(seeds, 1, false));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: SPARK_PIXEL_SCALE },
      uMinPx: { value: SPARK_MIN_PX },
      uMaxPx: { value: SPARK_MAX_PX },
      uHot: { value: new THREE.Color(SPARK_HOT) },
      uWarm: { value: new THREE.Color(SPARK_WARM) },
    },
    vertexShader: SPARK_VERT,
    fragmentShader: SPARK_FRAG,
    transparent: true,
    depthWrite: false,
    // Additif + `toneMapped = false`: kıvılcım ışık yayar, görüşü kapatmaz ve
    // bloom eşiğini geçer (alev katmanlarıyla aynı kural).
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const group = new THREE.Points(geometry, material);
  group.raycast = () => {};
  group.frustumCulled = false;
  group.renderOrder = 10; // alev katmanlarının üstünde çizilsin
  group.userData.isEquipment = true;

  const sparks: SparkState[] = [];
  for (let i = 0; i < SPARK_POOL; i++) {
    sparks.push({ x: 0, y: baseY, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0 });
  }

  let time = Math.random() * 10;
  let emit = 0;

  /**
   * Bir kıvılcımı doğurur. Yuva: önce ÖLÜ kıvılcım, yoksa EN YAŞLI olan (havuz
   * sabit kalır — kare başına ayırma yok). `energy` hız/boyut/ömrü ölçekler:
   * 1 = fünyeden doğan normal kıvılcım, 1.4× = tek-atım fışkırtma.
   */
  const spawn = (energy: number) => {
    let index = -1;
    let oldest = Infinity;
    for (let i = 0; i < SPARK_POOL; i++) {
      const life = sparks[i].life;
      if (life <= 0) {
        index = i;
        break;
      }
      if (life < oldest) {
        oldest = life;
        index = i;
      }
    }
    if (index < 0) index = 0;
    const s = sparks[index];
    const ang = Math.random() * Math.PI * 2;
    const speed = span * (2.2 + Math.random() * 3.2) * energy * motion;
    // Kopma noktası: fünye ucunun hemen üstü, kılcal saçılmayla.
    const off = span * 0.06 * Math.random();
    s.x = Math.cos(ang) * off;
    s.z = Math.sin(ang) * off;
    s.y = baseY + span * (0.1 + Math.random() * 0.16);
    // Hız: dışa açılan koni + net bir yukarı pay (fünyeden fışkırma).
    const out = 0.35 + Math.random() * 0.75;
    s.vx = Math.cos(ang) * speed * out;
    s.vz = Math.sin(ang) * speed * out;
    s.vy = speed * (0.3 + Math.random() * 0.9);
    s.max = s.life = (0.26 + Math.random() * 0.3) * (0.85 + 0.25 * energy);
    s.size = span * (0.3 + Math.random() * 0.26) * (0.9 + 0.3 * energy);

    const at = index * 3;
    positions[at] = s.x;
    positions[at + 1] = s.y;
    positions[at + 2] = s.z;
    sizes[index] = s.size;
    alphas[index] = 0; // parlaklık ilk karede CPU'da hesaplanır
    ages[index] = 0;
  };

  const update = (dt: number, alert: number) => {
    const d = Math.min(dt, 1 / 30); // sekme arka planda kaldıysa ışınlanma olmasın
    time += d;
    material.uniforms.uTime.value = time;

    // Doğum hızı: elde taşınan sakin fünye hafifçe saçar; tuzakta fitil
    // kısaldıkça (`setAlert`) fışkırmaya döner. Kare başına doğum sınırlıdır
    // ki uzun bir kare (takılma) kıvılcım patlamasına dönüşmesin.
    const rate = (SPARK_RATE_CALM + (SPARK_RATE_ALERT - SPARK_RATE_CALM) * alert) * motion;
    emit = Math.min(emit + rate * d, 3);
    let born = 0;
    while (emit >= 1 && born < 4) {
      emit -= 1;
      spawn(1 + 0.35 * alert);
      born += 1;
    }

    for (let i = 0; i < SPARK_POOL; i++) {
      const s = sparks[i];
      if (s.life <= 0) {
        alphas[i] = 0;
        continue;
      }
      s.life -= d;
      if (s.life <= 0) {
        alphas[i] = 0;
        continue;
      }
      // Fizik: hava direnci (hız hızla düşer) + yerçekimi (kıvılcım yay çizer).
      const drag = Math.max(0, 1 - SPARK_DRAG * d);
      s.vx *= drag;
      s.vz *= drag;
      s.vy = s.vy * drag - SPARK_GRAVITY * span * d;
      s.x += s.vx * d;
      s.y += s.vy * d;
      s.z += s.vz * d;

      const k = 1 - s.life / s.max; // 0 = yeni doğdu, 1 = sönmek üzere
      const fade = 1 - k;
      const at = i * 3;
      positions[at] = s.x;
      positions[at + 1] = s.y;
      positions[at + 2] = s.z;
      // Boyut yaşla küçülür (kıvılcım yakıtını bitiriyor); parlaklık doğar
      // doğmaz yanar, sonra soğur — `pow` yerine çarpma (kare başına 14 kez).
      sizes[i] = s.size * (1 - 0.6 * k);
      ages[i] = k;
      alphas[i] = Math.min(1, k * 8) * fade * (0.55 + 0.45 * fade);
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
    geometry.attributes.aAlpha.needsUpdate = true;
    geometry.attributes.aAge.needsUpdate = true;
  };

  /** Tek atım: boş yuvaya sığdığı kadar kıvılcım fışkırtır. */
  const burst = (count: number, power = 1) => {
    const n = Math.min(Math.max(0, count), SPARK_POOL);
    for (let i = 0; i < n; i++) spawn(1.4 * power);
  };

  const dispose = () => {
    group.removeFromParent();
    geometry.dispose();
    material.dispose();
  };

  return { group, update, burst, dispose };
}

/* ------------------------ gövde hâlesi (okunurluk) ------------------------ */

export interface BombAura {
  /** Gövde merkezine oturtulacak kapsayıcı (dünya biriminde). */
  group: THREE.Group;
  update(dt: number): void;
  dispose(): void;
}

export interface BombAuraOptions {
  /**
   * Hâle nokta ışığı (VARSAYILAN KAPALI — bkz. `createFuseFlame` → "IŞIK
   * SAYISI" notu): ışık sayısı değişince arenadaki tüm shader'lar yeniden
   * derlenir ve bomba elden çıktığında/gizlendiğinde bu bir donma olarak
   * görünür. Okunurluğu additif hâle sprite'ları zaten sağlar.
   */
  light?: boolean;
}

/**
 * Gövde hâlesi — elde tutulan bombayı kuş bakışı kamerada OKUNUR kılan sıcak
 * kızıl-turuncu ışıma katmanı.
 *
 * NEDEN GEREKLİ: 55° izometrik kamerada el, kol ve gövde aynı renk ailesinde
 * üst üste biner; bomba yalnızca kendi dokusuyla ayrışıyordu ve karakterin
 * silüeti içinde kayboluyordu. MoBA/aksiyon oyunlarında elde taşınan prop'a
 * bu yüzden HER ZAMAN hafif bir "aura" verilir: prop kadrajın neresinde olursa
 * olsun zeminden ve karakterden ayrışır.
 *
 * KATMANLAR (hepsi additif — ışık yayar, görüşü kapatmaz):
 *   · HALO: gövdenin ~3 katı geniş, çok soluk kızıl dış parıltı (asıl okunurluk
 *     bunu sağlar: kameranın bombayı FARKETMESİ),
 *   · ÇEKİRDEK: gövdenin ~1.6 katı, daha parlak turuncu iç parıltı,
 *   · NOKTASAL IŞIK: kızıl-turuncu, kısa menzilli — yalnız eli ve bombanın
 *     kendi yüzeyini ısıtır; haritayı/zeminı boyamaz (menzil = yarıçap × 8).
 *
 * NABIZ: nefes gibi yavaş (≈2.2 sn) açılıp kapanır — "canlı ama dikkat
 * dağıtmayan" denge. `prefers-reduced-motion` açıksa genlik %25'e düşer
 * (fünye aleviyle aynı kural).
 *
 * ÖLÇÜ: tüm boyutlar bombayı DÜNYA YARIÇAPINDAN (radius) türetilir; çağıran
 * kapsayıcı (bkz. `SamuraiBomb` → `pivot`) dünya birimindedir, yani ölçek
 * değişse de (skin/ölçü ayarı) hâle bombayla birlikte doğru kalır.
 */
export function createBombAura(
  radius: number,
  options?: BombAuraOptions,
): BombAura {
  const tex = makeFlameTexture();
  const motion = prefersReducedMotion() ? 0.25 : 1;

  const group = new THREE.Group();
  group.renderOrder = 8;
  group.userData.isEquipment = true;

  const mats: THREE.SpriteMaterial[] = [];
  const mk = (color: string, opacity: number): THREE.SpriteMaterial => {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false, // gövdenin içinden de okunsun (elde kapanmasın)
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    mats.push(mat);
    return mat;
  };

  const haloMat = mk("#ff2d0a", 0.08);
  const halo = new THREE.Sprite(haloMat);
  const coreMat = mk("#ff7a1e", 0.12);
  const core = new THREE.Sprite(coreMat);
  for (const s of [halo, core]) {
    s.raycast = () => {};
    s.frustumCulled = false;
    s.renderOrder = 8;
    s.userData.isEquipment = true;
    group.add(s);
  }

  // Nokta ışığı VARSAYILAN KAPALI (bkz. `createFuseFlame` → "IŞIK SAYISI"):
  // hâle, bomba ELDEN ÇIKTIĞINDA/gizlendiğinde de kapanıp açılabiliyordu ve
  // ışık sayısındaki her değişim arenadaki tüm shader'ları yeniden derletip
  // kare atamasına (donmaya) yol açıyordu. Okunurluk additif sprite'lardan gelir.
  const LIGHT_INTENSITY = 0.018;
  const light =
    options?.light === true
      ? new THREE.PointLight("#ff4d16", LIGHT_INTENSITY, radius * 8, 2)
      : null;
  if (light) {
    light.userData.isEquipment = true;
    group.add(light);
  }

  let time = Math.random() * 10;

  const update = (dt: number) => {
    time += Math.min(dt, 1 / 30);
    // İki farklı hızda sinüs: tek sinüs "mekanik" okunurdu (fünye aleviyle
    // aynı gerekçe). Genlik `motion` ile kısılır (reduced-motion).
    const pulse =
      1 +
      (Math.sin(time * 2.85) * 0.5 + Math.sin(time * 4.7 + 1.3) * 0.5) *
        0.12 *
        motion;

    // GÜÇLENDİRİLDİ (hâle 2.2 → 2.45, opaklıklar ~%35 yukarı): bomba 55°
    // izometrik kamerada karakterin silüeti içinde kaybolmasın diye okunurluk
    // payı büyütüldü. Katman additif olduğu için artış zemini aydınlatan bir
    // parıltıya değil, sıcak bir ışımaya dönüşür ve bloom eşiğini rahatça geçer.
    halo.scale.setScalar(radius * 2.45 * pulse);
    haloMat.opacity = 0.12 * pulse + 0.04 * motion;
    core.scale.setScalar(radius * 1.42 * pulse);
    coreMat.opacity = 0.18 * pulse + 0.045 * motion;
    if (light) light.intensity = LIGHT_INTENSITY * (0.75 + 0.45 * pulse);
  };

  const dispose = () => {
    group.removeFromParent();
    group.clear();
    for (const m of mats) m.dispose();
    light?.dispose();
  };

  // İlk kareyi hemen uygula (hâle bir kare boyunca sıfır ölçekte kalmasın).
  update(1 / 60);

  return { group, update, dispose };
}

/* ------------------------- ağız (fünye) noktası --------------------------- */

/** Fünye/ateş taşıyan düğümleri tanıyan ad kalıbı (malzeme veya mesh adı). */
const FUSE_RE = /fuse|fitil|wick|glow|flame|fire|ember|spark|alev/i;

/**
 * Bir malzeme/düğüm adı fünye ya da ateş ucuna mı işaret ediyor? Model
 * değişse de (comical_bomb / bomba / prosedürel) aynı kuralla bulunur.
 */
export const isFuseLikeName = (name: string): boolean => FUSE_RE.test(name);

/** Ölçümde taranacak en fazla köşe (büyük modellerde maliyet sınırı). */
const MEASURE_VERT_LIMIT = 20000;

/** Ölçülen gövde küresi (model kökünün uzayında). */
export interface BodyBall {
  center: THREE.Vector3;
  radius: number;
}

/**
 * GÖVDE YÜZEY KÖŞELERİ (model kökünün uzayında) — fitil/ateş mesh'leri HARİÇ.
 *
 * NEDEN GERÇEK KÖŞELER, `Box3.expandByObject` DEĞİL: o çağrı her mesh'in
 * kutusunu DÜNYA matrisiyle çarpıp yeniden eksen-hizalı kutuya çevirir. Model
 * döndürülmüşse (Sketchfab dışa aktarımları neredeyse hep döndürülmüştür) bu
 * kutu gerçek gövdeden KAT KAT büyük çıkar. Kullanıcının `comical_bomb.glb`
 * modelinde XZ genişliği 3.63 ölçülüyordu; gerçek gövde çapı 1.96 — yani bomba
 * 1.85 kat KÜÇÜK ölçeklenip elde "ufacık" kalıyordu ve avuçtan dışarı taşıyordu
 * (oturma mesafesi sabit, gövde küçük). Burada köşeler tek tek okunur: ölçek,
 * merkez ve ağız noktası gerçek geometriye göre hesaplanır.
 *
 * NEDEN YALNIZCA ÜÇGENLERİN KULLANDIĞI KÖŞELER: bazı dışa aktarımlarda
 * (Sketchfab bezier→mesh) yüzeyden kopuk, hiçbir üçgene bağlı olmayan köşeler
 * kalır. `comical_bomb.glb`'de 1182 köşenin 595'i böyleydi ve yüzeyin dışına
 * taşarak kutuyu şişiriyordu (Z aralığı −1.00…1.14; gerçek gövde −0.51…1.14).
 * İndeks varsa yalnızca indeksin gösterdiği köşeler okunur.
 */
function bodyPoints(root: THREE.Object3D): THREE.Vector3[] {
  root.updateWorldMatrix(true, true);
  const out: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (isFuseLikeName(o.name)) return;
    const list = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    if (list.some((m) => m && isFuseLikeName(m.name))) return;
    const geo = mesh.geometry as THREE.BufferGeometry | undefined;
    const pos = geo?.attributes?.position as THREE.BufferAttribute | undefined;
    if (!geo || !pos) return;
    const idx = geo.index;
    const count = idx ? idx.count : pos.count;
    // Örnekleme adımı: çok büyük modellerde kare başına maliyet patlamasın.
    const step = Math.max(1, Math.ceil(count / MEASURE_VERT_LIMIT));
    // Köşe BAŞINA BİR NOKTA: indeks tamponunda aynı köşe onlarca kez geçer
    // (paylaşılan üçgenler). Tekrarlar ölçümü değil bandın "kaç nokta var?"
    // kontrolünü bozar — bir bandın 2 gerçek köşesi 10 tekrarla dolu görünüp
    // sahte bir yarıçap üretebilirdi.
    const seen = new Set<number>();
    for (let i = 0; i < count; i += step) {
      const vi = idx ? idx.getX(i) : i;
      if (seen.has(vi)) continue;
      seen.add(vi);
      v.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
      out.push(v.clone());
    }
  });
  return out;
}

/**
 * Gövdenin SIKI (köşe bazlı) sınır kutusu — model kökünün uzayında.
 * `points` verilmişse yeniden taranmaz (aynı turda iki ölçüm yapılırken).
 * Gövde mesh'i yoksa tüm modele düşülür (el asla ölçüsüz kalmaz).
 */
function tightBox(
  root: THREE.Object3D,
  points?: THREE.Vector3[],
): THREE.Box3 {
  const pts = points ?? bodyPoints(root);
  if (!pts.length) return new THREE.Box3().setFromObject(root);
  const box = new THREE.Box3();
  for (const p of pts) box.expandByPoint(p);
  return box;
}

/**
 * Gövde genişliği (XZ) — SIKI köşe ölçümü; hiç bulunamazsa tüm model.
 * Yalnızca gövde mesh'lerinden: YANA/UZAĞA uzanan bir fitil ya da kıvılcım XZ
 * genişliğini şişirip bombayı olduğundan küçük ölçeklerdi.
 */
export function measureBodySpan(root: THREE.Object3D): number {
  // Gövde küresi ölçülebiliyorsa ÖLÇEK REFERANSI odur: avuçta oturma mesafesi
  // (`BOMB_SEAT_OUT` = normalize edilmiş gövde yarıçapı, bkz. HandGrip) ile
  // ölçek aynı referanstan gelirse bomba hangi model olursa olsun avuca değer.
  // Kutu genişliği kullanılırsa boyun/kapak gibi parçalar referansı büyütüp
  // bombayı avuçtan dışarı taşırır.
  const ball = measureBodyBall(root);
  if (ball) return ball.radius * 2;
  const size = tightBox(root).getSize(new THREE.Vector3());
  return Math.max(size.x, size.z);
}

/**
 * Gövde KÜRESİ ("en geniş kesit"): merkez + yarıçap, model kökünün uzayında.
 *
 * NEDEN KUTU MERKEZİ YETMEZ: bir bomba gövdesi + fitilden oluşur. Fitil tepeye
 * doğru uzadığı için tüm gövdenin KUTU MERKEZİ, kürenin merkezinin ÜSTÜNDE
 * kalır; bomba o noktadan avuca oturtulursa küre avucun İÇİNE gömülür (parmak
 * uçları topun içinden geçer). `comical_bomb.glb`'de kutu merkezi (−0.017,
 * 1.325, 0.310), kürenin merkezi ise (−0.017, 0.943, 0.366): arada 0.38 model
 * birimi var — ölçek 0.1325 olduğu için bomba avuca 0.05 dünya birimi, yani
 * YARIÇAPININ ~%38'i kadar gömülüyordu. Gözle de görülen "ele saplanmış"
 * görüntü buydu.
 *
 * YÖNTEM: gövde köşeleri EN UZUN eksende bantlara ayrılır (bir bomba için bu
 * eksen daima gövde+fitil yönüdür). Her bant için dik düzlemdeki SINIR KUTUSU
 * ölçülür: yarı genişlikler `ru`, `rv` ve merkez kutunun ortasıdır. EN GENİŞ
 * bant gövdenin ekvatorudur → yarıçapı gövde yarıçapı, merkezi gövde merkezidir.
 *
 * NEDEN AĞIRLIK MERKEZİ (ORTALAMA) DEĞİL, KUTU: model köşeleri düzgün dağılmaz
 * — `comical_bomb.glb`'de yoğunluk fitil tarafında toplanmıştı ve ortalama
 * tabanlı merkez her turda yukarı kayıyordu (y: 0.98 → 1.27 → 1.59). Kutu
 * ortası yoğunluktan bağımsızdır ve bu modelde gerçek merkezi tam verir:
 * merkez (−0.017, 0.943, 0.366), yarıçap 0.981 → çap 1.962 = modelin kendi X
 * açıklığı.
 *
 * Yedek modelde de (küre + pirinç bilezikler + boyun/kapak) aynı yöntem gövde
 * küresini bulur: en geniş bant ekvatordur, çap 2.08 çıkar — yani `HandGrip`'te
 * belgelenen model uzayı sözleşmesiyle birebir uyuşur.
 */
export function measureBodyBall(root: THREE.Object3D): BodyBall | null {
  const pts = bodyPoints(root);
  if (pts.length < 16) return null;
  const box = tightBox(root, pts);
  const size = box.getSize(new THREE.Vector3());
  // Dilim ekseni = en uzun eksen.
  const axis = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
  const a = axis;
  const b = (axis + 1) % 3;
  const c = (axis + 2) % 3;
  const lo = box.min.getComponent(a);
  const hi = box.max.getComponent(a);
  const len = hi - lo;
  if (!(len > 0)) return null;

  const BANDS = 24;
  // Bant başına dik düzlem sınır kutusu (tek geçişte toplanır).
  type Band = { n: number; umin: number; umax: number; vmin: number; vmax: number; amin: number; amax: number };
  const bands: (Band | null)[] = new Array(BANDS).fill(null);
  /** Bir bandın "var olması" için gereken en az GERÇEK köşe sayısı: 2 köşeli
   *  bir bant (ör. fitilin en tepesi) sahte bir ekvator yarıçapı üretmesin. */
  const MIN_BAND_POINTS = 6;
  for (const p of pts) {
    const t = (p.getComponent(a) - lo) / len;
    const i = Math.min(BANDS - 1, Math.max(0, Math.floor(t * BANDS)));
    const u = p.getComponent(b);
    const v = p.getComponent(c);
    const av = p.getComponent(a);
    const band = bands[i];
    if (!band) {
      bands[i] = {
        n: 1,
        umin: u,
        umax: u,
        vmin: v,
        vmax: v,
        amin: av,
        amax: av,
      };
      continue;
    }
    band.n += 1;
    if (u < band.umin) band.umin = u;
    if (u > band.umax) band.umax = u;
    if (v < band.vmin) band.vmin = v;
    if (v > band.vmax) band.vmax = v;
    if (av < band.amin) band.amin = av;
    if (av > band.amax) band.amax = av;
  }

  let best: Band | null = null;
  let bestRadius = 0;
  for (const band of bands) {
    if (!band || band.n < MIN_BAND_POINTS) continue;
    const radius = Math.max((band.umax - band.umin) / 2, (band.vmax - band.vmin) / 2);
    if (radius > bestRadius) {
      bestRadius = radius;
      best = band;
    }
  }
  if (!best || !(bestRadius > 1e-6)) return null;

  const center = new THREE.Vector3();
  center.setComponent(a, (best.amin + best.amax) / 2);
  center.setComponent(b, (best.umin + best.umax) / 2);
  center.setComponent(c, (best.vmin + best.vmax) / 2);
  return { center, radius: bestRadius };
}

/**
 * Gövdenin MERKEZİ (model kökünün uzayında) — fünye hariç.
 *
 * NEDEN GEREKLİ: bomba avuca oturtulurken referans, gövdenin (kürenin)
 * merkezidir. Modelin origin'i kürenin merkezinde DEĞİLSE (Blender'da pivot
 * tabana konmuşsa) bomba avucun dışına kaçar ya da içine gömülür. Bu yüzden
 * merkez ölçülür ve model buna göre kaydırılır — modele özel sabit gerekmez.
 * Ölçülebilen bir gövde küresi varsa merkez ONUN merkezidir (bkz.
 * `measureBodyBall`); aksi hâlde sıkı kutunun merkezine düşülür.
 */
export function measureBodyCenter(root: THREE.Object3D): THREE.Vector3 {
  const ball = measureBodyBall(root);
  if (ball) return root.worldToLocal(ball.center.clone());
  // Ölçüm dünya uzayında yapılır; çağıran modelin KENDİ biriminde bekler.
  const center = tightBox(root).getCenter(new THREE.Vector3());
  return root.worldToLocal(center);
}

/**
 * Fünye YÖNÜ (model kökünün uzayında, birim vektör): ağız noktasından gövde
 * merkezine giden vektörün tersi. Modelin fitili hangi eksende çizilmiş olursa
 * olsun (yukarı, yana, eğik), bu yön bulunur ve fünye istenen dünya yönüne
 * hizalanır — bkz. `SamuraiBomb.mount` pivot rotasyonu.
 */
export function measureFuseDirection(root: THREE.Object3D): THREE.Vector3 {
  const dir = findFuseAnchor(root).sub(measureBodyCenter(root));
  if (dir.lengthSq() < 1e-10) return new THREE.Vector3(0, 1, 0);
  return dir.normalize();
}

/**
 * Modelin AĞIZ noktasını (fünyenin yanan ucu), model kökünün KENDİ uzayında
 * döndürür.
 *
 * İki strateji:
 *  1. Fünye/ateş olduğu belli mesh veya malzemeler varsa (ad kalıbı) hepsinin
 *     birleşik kutusunun TEPE merkezi kullanılır — yanan uç orasıdır.
 *  2. Ad ipucu yoksa modelin en üst noktası (kutu tepe merkezi) kullanılır;
 *     fünye her zaman yukarı bakar, dolayısıyla ağız orasıdır.
 *
 * Dönen nokta model köküne GÖRELİDİR: çağıran onu modelin ölçeğiyle çarparak
 * kapsayıcı uzayına taşır (bkz. `SamuraiBomb.mount`).
 */
export function findFuseAnchor(root: THREE.Object3D): THREE.Vector3 {
  root.updateWorldMatrix(true, true);

  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (found) return;
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (FUSE_RE.test(o.name)) {
      found = o;
      return;
    }
    const list = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const m of list) {
      if (m && FUSE_RE.test(m.name)) {
        found = o;
        return;
      }
    }
  });

  if (found) {
    // TÜM fitil/ateş parçalarının birleşik kutusu: tek tek bakıldığında
    // "komik bomba" gibi modellerde ilk bulunan parça fitilin ORTASI olabiliyor
    // (alev gövdenin üstünde değil ortasında yanıyormuş gibi görünür).
    const box = new THREE.Box3();
    let any = false;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [];
      if (!FUSE_RE.test(o.name) && !list.some((m) => m && FUSE_RE.test(m.name))) return;
      box.expandByObject(mesh);
      any = true;
    });
    if (any) {
      // Ağız = kümenin TEPESİ (yanan uç), ortası değil.
      return root.worldToLocal(
        new THREE.Vector3(
          (box.min.x + box.max.x) / 2,
          box.max.y,
          (box.min.z + box.max.z) / 2,
        ),
      );
    }
    const single = new THREE.Box3().setFromObject(found);
    return root.worldToLocal(single.getCenter(new THREE.Vector3()));
  }

  // Ad ipucu yok: ağız, gövdenin en üst noktasıdır (fünye daima yukarı bakar).
  // SIKI kutu kullanılır: kaba kutu döndürülmüş modellerde tepeden taşar ve
  // alev fünyenin ucunda değil havada yanardı.
  const box = tightBox(root);
  return root.worldToLocal(
    new THREE.Vector3(
      (box.min.x + box.max.x) / 2,
      box.max.y,
      (box.min.z + box.max.z) / 2,
    ),
  );
}
