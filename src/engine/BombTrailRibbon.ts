// 🎏 BombTrailRibbon — FIRLATILAN bombanın arkasında kalan KAVİSLİ iz (ribbon).
//
// NEDEN ŞERİT (RIBBON), NEDEN UZATILMIŞ KUTU DEĞİL: `ProjectilePool` bombanın
// hemen arkasına yapışık DÜZ bir kutu çizer — yönü gösterir ama bomba kavis
// yaptığında (menzil sonunda yavaşlarken, düşmana saparken) iz de düz kalır ve
// "havada süzülen cisim" hissi kaybolur. Şerit ise geçmiş KONUMLARDAN örülür:
// bomba nereye gittiyse iz oradan geçer, duman çöktükçe de aşağı doğru kavis
// yapar (bkz. `SAG`) — yani iz gerçekten BİR YÖRÜNGE anlatır.
//
// İKİ KATMAN (aynı nokta dizisinden, iki ayrı geometri):
//   · ÇEKİRDEK (additif): sıcak amber → beyaz-sarı; bombanın hemen arkasında
//     parlak, kuyruğa doğru söner. Bloom eşiğini geçer (bloom = ışıma).
//   · DUMAN (normal karışım, koyu): daha geniş, kuyruğa doğru AÇILIP dağılan
//     barut dumanı. Additif olamaz: siyahı ekleyerek koyulaştırmak mümkün
//     değil, dumanın "görmeyi kapatması" normal alfa karışımı ister.
//
// ÖLÇÜ SÖZLEŞMESİ: tüm değerler DÜNYA birimidir (bomba gövdesi 0.32 birim).
// Geometri dünya uzayında yazıldığı için grup hiç döndürülmez/ölçeklenmez;
// bombanın konumu `follow()` ile bildirilir.
//
// MALİYET: nokta sayısı sabittir (`SEGMENTS`), kare başına ayırma yoktur;
// 4 uçan bomba için toplam 8 küçük mesh (≈150 köşe) güncellenir.
import * as THREE from "three";

/** İzi oluşturan örnek (nokta) sayısı — kare başına maliyet bu sayıyla sabittir. */
const SEGMENTS = 18;
/** Yeni örnek için gereken en küçük hareket (birim): iz pürüzsüz kalır ama örnek çoğalmaz. */
const MIN_STEP = 0.07;
/** Bu mesafeden büyük atlama "yeni bomba" demektir (havuz slotu yeniden kullanıldı). */
const TELEPORT = 2.5;
/** Bir örneğin ömrü (sn) — duman bu sürede dağılır. */
const LIFE = 0.68;
/** Duman şeridinin KUYRUKTAKİ genişliği (birim) — kuyruğa doğru açılır. */
const SMOKE_WIDTH = 0.17;
/** Sıcak çekirdeğin BAŞTAKİ genişliği (birim). */
const CORE_WIDTH = 0.055;
/**
 * Dumanın çökme hızı (birim/sn) ve yanal türbülansı.
 * NEDEN GEREKLİ: bütün noktalar aynı yükseklikte tutulsaydı iz ekranda havada
 * asılı, düz bir şerit olarak okunurdu. Çökme + hafif yalpalama izi "arkada
 * kalan, dağılan duman" hâline getirir — kavis de buradan gelir.
 */
const SAG = 0.36;
const WANDER = 0.1;

/** Çekirdek: yeni kopan sıcak uçtan sönmekte olan kuyruğa. */
const CORE_HOT = "#fff4cf";
const CORE_WARM = "#ff8a2b";
/** Duman: taze (fitilden yeni çıkmış) ve dağılmış uç. */
const SMOKE_HEAD = "#6b6b6b";
const SMOKE_TAIL = "#2b2b2b";

/** İki katman da aynı köşe programını paylaşır (fark yalnız fragment'ta). */
const RIBBON_VERT = /* glsl */ `
attribute float aFade;
attribute float aHeat;
varying float vFade;
varying float vHeat;
void main() {
  vFade = aFade;
  vHeat = aHeat;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const CORE_FRAG = /* glsl */ `
uniform vec3 uHot;
uniform vec3 uWarm;
varying float vFade;
varying float vHeat;
void main() {
  // Sıcaklık kareye değil KÖŞEYE yazılır: baş beyaz-sarı, kuyruk amber.
  float h = vHeat * vHeat; // üs yerine çarpma (piksel başına ucuz)
  float a = vFade * ( 0.3 + 0.7 * vHeat );
  if ( a < 0.004 ) discard;
  // Additif karışımda parlaklık RENGE yazılır (alfa kırpılmasına takılmaz).
  gl_FragColor = vec4( mix( uWarm, uHot, h ) * ( 0.6 + 0.9 * vHeat ), a );
}
`;

const SMOKE_FRAG = /* glsl */ `
uniform vec3 uHead;
uniform vec3 uTail;
varying float vFade;
varying float vHeat;
void main() {
  // Duman taze uçta yoğun, kuyrukta dağılmış (genişlik zaten kuyrukta artıyor).
  float a = vFade * ( 0.14 + 0.5 * vHeat );
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( mix( uTail, uHead, vHeat ), a );
}
`;

/** İzdeki tek örnek (nokta): konum + yaş. Kare başına ayırma yapılmaz. */
interface TrailPoint {
  x: number;
  y: number;
  z: number;
  age: number;
}

/** Bir şerit katmanı (çekirdek ya da duman) — kendi geometrisi ve tamponları. */
interface RibbonLayer {
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  fades: Float32Array;
  heats: Float32Array;
  /** Katmanın yarım genişlik tabanı (birim) — çekirdek ince, duman geniş. */
  halfWidth: number;
}

export interface BombTrailRibbon {
  /** Sahne köküne eklenir (konum/ölçek verilmez — geometri dünya uzayındadır). */
  group: THREE.Group;
  /** Bombanın dünya konumunu bildirir (birim). */
  follow(x: number, y: number, z: number): void;
  /** Kareyi ilerletir: yaşlanma, çökme, köşe yazımı. */
  update(dt: number): void;
  /** İzi hemen temizler (yeni bomba aynı slota düştüğünde). */
  clear(): void;
  dispose(): void;
}

/**
 * Şerit katmanını kurar. Köşeler her karede CPU'da yazılır (nokta sayısı sabit
 * ve küçük); indeks tamponu bir kez kurulur.
 */
function buildLayer(width: number): RibbonLayer {
  const vertices = SEGMENTS * 2;
  const positions = new Float32Array(vertices * 3);
  const fades = new Float32Array(vertices);
  const heats = new Float32Array(vertices);

  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3);
  position.setUsage(THREE.DynamicDrawUsage);
  const fade = new THREE.BufferAttribute(fades, 1);
  fade.setUsage(THREE.DynamicDrawUsage);
  const heat = new THREE.BufferAttribute(heats, 1);
  heat.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", position);
  geometry.setAttribute("aFade", fade);
  geometry.setAttribute("aHeat", heat);

  // Şerit: her örnek iki köşe (sol/sağ); ardışık örnekler dörtgenle bağlanır.
  const indices: number[] = [];
  for (let i = 0; i < SEGMENTS - 1; i++) {
    const a = i * 2;
    const b = (i + 1) * 2;
    indices.push(a, a + 1, b + 1, a, b + 1, b);
  }
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0); // iz boşken hiç çizilmesin
  return { geometry, positions, fades, heats, halfWidth: width * 0.5 };
}

/**
 * Uçan bomba için kavisli iz kurar. Çağıran her karede `follow()` ile konumu
 * bildirir ve `update(dt)` çağırır; bomba yok olduktan sonra da `update`
 * çağrılırsa iz kendiliğinden dağılıp kaybolur.
 */
export function createBombTrailRibbon(): BombTrailRibbon {
  const group = new THREE.Group();

  const coreLayer = buildLayer(CORE_WIDTH);
  const smokeLayer = buildLayer(SMOKE_WIDTH);

  const smokeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uHead: { value: new THREE.Color(SMOKE_HEAD) },
      uTail: { value: new THREE.Color(SMOKE_TAIL) },
    },
    vertexShader: RIBBON_VERT,
    fragmentShader: SMOKE_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    // Duman IŞIK YAYMAZ: normal karışım (siyahı ekleyerek koyulaştırmak
    // additifle mümkün değil).
    blending: THREE.NormalBlending,
  });

  const coreMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uHot: { value: new THREE.Color(CORE_HOT) },
      uWarm: { value: new THREE.Color(CORE_WARM) },
    },
    vertexShader: RIBBON_VERT,
    fragmentShader: CORE_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    // Sıcak çekirdek IŞIK YAYAR: additif + toneMapped=false (bloom eşiğini geçer).
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const smoke = new THREE.Mesh(smokeLayer.geometry, smokeMaterial);
  const core = new THREE.Mesh(coreLayer.geometry, coreMaterial);
  for (const mesh of [smoke, core]) {
    mesh.raycast = () => {};
    mesh.frustumCulled = false;
  }
  smoke.renderOrder = 6; // önce duman, sonra parlak çekirdek çizilsin
  core.renderOrder = 7;
  group.add(smoke, core);
  group.visible = false;

  /** Nokta dizisi: index 0 = BAŞ (en yeni konum), son index = kuyruk. */
  const points: TrailPoint[] = [];
  for (let i = 0; i < SEGMENTS; i++) points.push({ x: 0, y: 0, z: 0, age: LIFE });
  let head: TrailPoint | null = null;
  let time = 0;

  /** Başı yeni bir noktaya taşır: en eski örneği geri dönüştürür (sabit bellek). */
  const pushPoint = (x: number, y: number, z: number): TrailPoint | null => {
    const point = points.pop();
    if (!point) return null;
    point.x = x;
    point.y = y;
    point.z = z;
    point.age = 0;
    points.unshift(point);
    return point;
  };

  const clear = () => {
    head = null;
    for (const p of points) p.age = LIFE;
    group.visible = false;
    coreLayer.geometry.setDrawRange(0, 0);
    smokeLayer.geometry.setDrawRange(0, 0);
  };

  const follow = (x: number, y: number, z: number) => {
    if (!head) {
      head = pushPoint(x, y, z);
      return;
    }
    const step = Math.hypot(x - head.x, y - head.y, z - head.z);
    if (step > TELEPORT) {
      // Havuz slotu yeniden kullanıldı: yeni bomba, önceki izi bırakma.
      clear();
      head = pushPoint(x, y, z);
      return;
    }
    if (step < MIN_STEP) {
      // Yavaş hareket: yeni örnek açmadan başın konumunu tazele.
      head.x = x;
      head.y = y;
      head.z = z;
      head.age = 0;
      return;
    }
    const next = pushPoint(x, y, z);
    if (next) head = next;
  };

  /** İki köşeyi (sol/sağ) tamponlara yazar. */
  const writeVertices = (
    layer: RibbonLayer,
    index: number,
    cx: number,
    cy: number,
    cz: number,
    px: number,
    pz: number,
    half: number,
    fade: number,
    heat: number,
  ) => {
    const at = index * 6; // iki köşe × 3 bileşen
    layer.positions[at] = cx + px * half;
    layer.positions[at + 1] = cy;
    layer.positions[at + 2] = cz + pz * half;
    layer.positions[at + 3] = cx - px * half;
    layer.positions[at + 4] = cy;
    layer.positions[at + 5] = cz - pz * half;
    const vt = index * 2;
    layer.fades[vt] = fade;
    layer.fades[vt + 1] = fade;
    layer.heats[vt] = heat;
    layer.heats[vt + 1] = heat;
  };

  const update = (dt: number) => {
    const d = Math.min(dt, 1 / 20); // uzun karede iz kopmasın
    time += d;

    // 1) Yaşlanma + duman fiziği (çökme ve hafif yalpalama = kavis).
    let alive = 0;
    for (let i = 0; i < SEGMENTS; i++) {
      const p = points[i];
      if (p.age >= LIFE) continue;
      alive += 1;
      p.age += d;
      p.y -= SAG * d;
      p.x += Math.sin(time * 2.1 + i * 0.9) * WANDER * d;
      p.z += Math.cos(time * 1.7 + i * 1.3) * WANDER * d;
    }
    if (alive < 2) {
      // Çizilecek şerit yok: grubu gizle ama GEÇMİŞİ SİLME. İlk karede tek
      // nokta olur (alive = 1) ve `clear()` çağrılsaydı baş da düşerdi — iz
      // bir daha asla örülemezdi. Yalnız hiç canlı nokta yoksa baş sıfırlanır
      // (yeni bomba zaten `follow` içinde teleport kontrolüyle kurulur).
      if (group.visible) group.visible = false;
      coreLayer.geometry.setDrawRange(0, 0);
      smokeLayer.geometry.setDrawRange(0, 0);
      if (alive === 0) head = null;
      return;
    }
    group.visible = true;

    // 2) Köşeler: her örnek için ilerleme yönüne DİK yarım genişlik vektörü.
    for (let i = 0; i < SEGMENTS; i++) {
      const p = points[i];
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(SEGMENTS - 1, i + 1)];
      // Teğet: komşulardan (uçlarda mevcut tek komşudan).
      let tx = next.x - prev.x;
      let tz = next.z - prev.z;
      const len = Math.hypot(tx, tz);
      if (len < 1e-4) {
        tx = 0;
        tz = 1;
      } else {
        tx /= len;
        tz /= len;
      }
      const px = -tz; // XZ düzleminde teğete dik birim vektör
      const pz = tx;

      // Sönüm: yaş + kuyruğa doğru incelme (kuyruk uçta sıfıra iner → kopma yok).
      const k = i / (SEGMENTS - 1);
      const ageFade = Math.max(0, 1 - p.age / LIFE);
      const fade = ageFade * (1 - k * k);
      // Sıcaklık yalnız BAŞTA yüksek: kuyruk soğumuş dumandır.
      const heat = Math.max(0, 1 - k * 1.35) * ageFade;

      // Çekirdek başta kalın, kuyrukta ince; duman tam tersi (dağılarak açılır).
      const coreHalf = coreLayer.halfWidth * ageFade * (1 - k * 0.55);
      const smokeHalf = smokeLayer.halfWidth * ageFade * (0.45 + 0.75 * k);
      writeVertices(coreLayer, i, p.x, p.y, p.z, px, pz, coreHalf, fade, heat);
      writeVertices(smokeLayer, i, p.x, p.y, p.z, px, pz, smokeHalf, fade, heat);
    }

    for (const layer of [coreLayer, smokeLayer]) {
      layer.geometry.attributes.position.needsUpdate = true;
      layer.geometry.attributes.aFade.needsUpdate = true;
      layer.geometry.attributes.aHeat.needsUpdate = true;
      layer.geometry.setDrawRange(0, (SEGMENTS - 1) * 6);
    }
  };

  const dispose = () => {
    group.removeFromParent();
    group.clear();
    coreLayer.geometry.dispose();
    smokeLayer.geometry.dispose();
    coreMaterial.dispose();
    smokeMaterial.dispose();
  };

  return { group, follow, update, clear, dispose };
}
