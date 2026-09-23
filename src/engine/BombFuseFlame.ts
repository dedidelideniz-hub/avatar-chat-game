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
  dispose(): void;
}

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
 */
export function createFuseFlame(span: number): FuseFlame {
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

  // Nokta ışığı: fünye ucundan ışık verir, titrer. Menzil bomba boyuyla
  // ölçeklenir — haritayı aydınlatmaz, yalnız eli/bombayı ısıtır.
  //
  // ŞİDDET NEDEN BU KADAR KÜÇÜK: three r155+ fiziksel ışık birimleri kullanır
  // (ışıma = şiddet / mesafe²). Alev elin ~0.1 birim uzağında olduğu için
  // şiddet 1 olsaydı aydınlanma güneş ışığının (≈1.6) onlarca katına çıkıp
  // eli bembeyaz yakardı. 0.014, tam elin üstünde güneşle yarışan sıcak bir
  // parıltı verir.
  const LIGHT_INTENSITY = 0.014;
  const light = new THREE.PointLight("#ff7a1e", LIGHT_INTENSITY, span * 6, 2);
  light.userData.isEquipment = true;
  group.add(light);

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

    // Işık: titremeyle birlikte nefes alır.
    light.intensity = LIGHT_INTENSITY * (0.6 + 0.8 * f) * (1 - 0.35 * amp);
    light.position.set(0, baseY + span * 0.3, 0);

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
  };

  const dispose = () => {
    group.removeFromParent();
    group.clear();
    for (const m of mats) m.dispose();
    light.dispose();
  };

  // İlk kareyi hemen uygula (alev bir kare boyunca sıfır ölçekte kalmasın).
  update(1 / 60);

  return { group, update, dispose };
}

/* ------------------------ gövde hâlesi (okunurluk) ------------------------ */

export interface BombAura {
  /** Gövde merkezine oturtulacak kapsayıcı (dünya biriminde). */
  group: THREE.Group;
  update(dt: number): void;
  dispose(): void;
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
export function createBombAura(radius: number): BombAura {
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

  // Nokta ışığı: fünye aleviyle aynı ölçek kuralı (bkz. createFuseFlame →
  // LIGHT_INTENSITY yorumu): r155+ fiziksel birimlerde ışıma = şiddet / mesafe².
  // Prop ele yakın olduğu için ışık kontrollü yükseltilir: bomba yüzeyinde ve
  // elde hafif sıcak bir yansıma verir, fakat arenayı yıkayacak kadar güçlü değil.
  const LIGHT_INTENSITY = 0.018;
  const light = new THREE.PointLight("#ff4d16", LIGHT_INTENSITY, radius * 8, 2);
  light.userData.isEquipment = true;
  group.add(light);

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

    halo.scale.setScalar(radius * 2.2 * pulse);
    haloMat.opacity = 0.07 * pulse + 0.025 * motion;
    core.scale.setScalar(radius * 1.3 * pulse);
    coreMat.opacity = 0.11 * pulse + 0.025 * motion;
    light.intensity = LIGHT_INTENSITY * (0.75 + 0.45 * pulse);
  };

  const dispose = () => {
    group.removeFromParent();
    group.clear();
    for (const m of mats) m.dispose();
    light.dispose();
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
