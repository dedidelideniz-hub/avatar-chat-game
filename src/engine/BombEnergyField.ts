// 🧨 BombEnergyField — elde tutulan bombanın GÜÇ ÇEKİRDEĞİ katmanı.
//
// NEDEN GEREKLİ: `createBombAura` bombayı kadrajda okunur kılar ama STATİKTİR
// (nefes alan iki sprite). Oysa MOBA/aksiyon oyunlarında elde taşınan bir bomba
// "canlı bir enerji kaynağı" gibi davranır: gövdenin çevresinde dönen halkalar,
// fitilden yükselen duman, gövdede nabız gibi atan bir ısı. Bu katman o dilin
// eksik yarısını kurar — bomba artık elde tutulan bir cisim değil, çalışan bir
// düzenek gibi okunur.
//
// KATMANLAR:
//   · HALKALAR (2 torus): gövdenin çevresinde ZIT yönlerde döner, eğimleri de
//     farklıdır. Bu yüzden bomba hokkabazlıkta takla atarken hacimli bir
//     "jiroskop kafesi" gibi okunurlar; tek halka düz bir çember gibi kalırdı.
//   · DALGA (torus): periyodik olarak gövdenin çevresinden dışa yayılan sönümlü
//     bir enerji boşalması. Tehlike tonu (`alert`) periyodu kısaltır, dalgayı
//     büyütür ve tonu amberden kızıla çevirir — yere bırakılan tuzakta fitil
//     kısaldıkça nabız sıklaşır ("birazdan patlar" bilgisi HAREKETLE verilir).
//   · DUMAN (2 sprite): fitil ucundan yükselen sıcak duman. Alev ve kıvılcım
//     katmanları ateşi anlatır, ama yanan bir fitilin okumasının yarısı dumandır;
//     dumansız alev cılız kalıyordu.
//   · ISI NABZI: gövde malzemelerinin `emissiveIntensity`si nefes alır. Ek
//     çizim çağrısı YOKTUR (yalnız malzeme özelliği yazılır) ve tehlike tonuyla
//     birlikte ısı yükselir.
//
// ⚠️ BURADA NOKTA IŞIĞI YOKTUR — ve bu bilinçli bir karardır (bkz.
// `BombFuseFlame` → "IŞIK SAYISI"): three.js her malzemenin shader programını
// sahnedeki ışık SAYISINA göre derler, dolayısıyla görünür bir ışık eklenip
// çıkarılınca (bomba elden çıkınca, tuzak doğunca/patlayınca) arenadaki TÜM
// malzemeler yeniden derlenir ve tam yetenek anında yüzlerce ms'lik bir donma
// görünür. Tüm katmanlar unlit + additif olduğu için bloom eşiğini geçer ve
// zaten parlak okunur.
//
// PAYLAŞIM: birim torus geometrileri ve duman dokusu modül düzeyinde BİR KEZ
// üretilir (11 bomba örneği aynı geometriyi kullanır). Malzemeler ise örnek
// başına klonlanır — tehlike tonu örnek başına farklıdır (elde amber, yerde
// kızıl) — ama parametreleri aynı olduğu için yeni shader derlemesi olmaz.
//
// Erişilebilirlik: `prefers-reduced-motion` açıksa dönüş/nabız genliği kısılır
// (halkalar yine döner, yalnızca sakin durur) — projedeki diğer katmanlarla
// aynı kural.
import * as THREE from "three";

/** Animasyon kısıtlı mı? (projedeki diğer VFX katmanlarıyla aynı kural) */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/* ------------------------------- doku ------------------------------------ */

/** Yumuşak duman lekesi (bir kez üretilir, tüm bombalar paylaşır). */
let smokeTexture: THREE.Texture | null = null;

function makeSmokeTexture(): THREE.Texture {
  if (smokeTexture) return smokeTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    // TEK radyal gradyan "havuz topu" gibi durur; üst üste binmiş, kaydırılmış
    // üç leke dumanın düzensiz kütlesini verir (piksel gürültüsü eklemeden).
    const blobs = [
      { x: 0.5, y: 0.56, r: 0.36, a: 0.5 },
      { x: 0.37, y: 0.44, r: 0.26, a: 0.4 },
      { x: 0.63, y: 0.62, r: 0.24, a: 0.34 },
    ];
    for (const b of blobs) {
      const cx = b.x * size;
      const cy = b.y * size;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.r * size);
      g.addColorStop(0, `rgba(255,255,255,${b.a})`);
      g.addColorStop(0.55, `rgba(255,255,255,${b.a * 0.45})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  smokeTexture = tex;
  return tex;
}

/* ----------------------------- geometri ---------------------------------- */

/**
 * BİRİM torus (yarıçap 1, verilen boru kalınlığı) — önbellekli.
 * Örnekler bu geometriyi ölçekleyerek kullanır: `scale = istenen yarıçap`.
 * Boru kalınlığı da aynı oranda ölçeklendiği için halka bombayla birlikte
 * oransal kalır ve modele özel sabit gerekmez.
 */
const torusCache = new Map<number, THREE.TorusGeometry>();

function unitTorus(tube: number): THREE.TorusGeometry {
  const cached = torusCache.get(tube);
  if (cached) return cached;
  // Düşük segment sayısı bilinçli: halka ekranda ince bir çizgi olarak okunur,
  // 6×48 = 288 dörtgen fazlasıyla yeter (tek örnek başına 3 halka var).
  const geo = new THREE.TorusGeometry(1, tube, 6, 48);
  geo.userData.sharedBombEnergy = true;
  torusCache.set(tube, geo);
  return geo;
}

/* ------------------------------ katmanlar -------------------------------- */

export interface BombEnergyFieldOptions {
  /**
   * Isı nabzının süreceği gövde malzemeleri (`emissiveIntensity`).
   *
   * ⚠️ Fünye/ateş malzemeleri BURAYA VERİLMEMELİDİR: onların ışıması zaten
   * kendi katmanında (`BOMB_FUSE_EMISSIVE`) çok yüksektir ve nabız onları
   * ekranı yakan bir beneğe çevirirdi. Çağıran yalnız gövde malzemelerini geçer
   * (bkz. `BombModel` → `createBombInstance`).
   */
  bodyMaterials?: THREE.MeshStandardMaterial[];
  /**
   * Fitil ucunun KÖK-YEREL konumu (dünya birimi) — duman oradan yükselir.
   * Verilmezse gövdenin üstü (+Y) varsayılır.
   */
  fuseOffset?: THREE.Vector3 | null;
}

export interface BombEnergyField {
  /** Gövde merkezine oturtulacak kapsayıcı (kök uzayında, dünya birimi). */
  group: THREE.Group;
  /**
   * Kare başına ilerletir; `alert` (0..1) tehlike tonudur.
   *
   * Dönüş: bu karede YENİ bir şok dalgası ateşlendiyse `true`. Çağıran bunu
   * boşalmanın duyulabilir/görülebilir anına bağlar (bkz. `BombModel` →
   * `update`: dalga ateşlenirken fünye bir tutam kıvılcım saçar). Böylece
   * halkalar, dalga ve kıvılcım TEK bir nabzın üç ayrı okuması olur.
   */
  update(dt: number, alert?: number): boolean;
  dispose(): void;
}

/* --- ölçüler (hepsi bomba çapına `span` oranıdır, modele özel sabit yok) --- */
/** Birinci halkanın yarıçapı (gövde yarıçapının hemen dışında durur). */
const RING_A_R = 0.78;
/** İkinci halka biraz daha geniş ve daha sönük: kafese hacim verir. */
const RING_B_R = 0.97;
/** Şok dalgasının başlangıç yarıçapı. */
const WAVE_R = 0.72;
/** Halka ve dalga boru kalınlıkları (birim torus ölçeğiyle çarpılır). */
const RING_TUBE = 0.03;
const WAVE_TUBE = 0.026;
/** Halkaların dönüş hızları (rad/sn) — zıt yönlü, farklı eğimli. */
const SPIN_A = 0.95;
const SPIN_B = -0.72;
/** Şok dalgasının periyodu (sn): sakin elde yavaş, alarmda sık. */
const WAVE_PERIOD_CALM = 2.1;
const WAVE_PERIOD_ALERT = 0.9;
/** Dalganın kaç katına büyüdüğü (alert ile artar). */
const WAVE_GROW = 0.85;
/** Duman lekesi sayısı (havuz sabittir — kare başına ayırma yok). */
const WISP_COUNT = 2;
const WISP_LIFE = 0.85;
/** Renkler: normal (amber) ve alarm (kızıl) tonları. */
const RING_CALM_A = "#ff8a2a";
const RING_CALM_B = "#ffd98a";
const RING_HOT_A = "#ff3a12";
const RING_HOT_B = "#ff9a3c";
const WISP_COLOR = "#c9b09a";
/** Gövde ısı nabzı: nefes genliği ve alarmda çarpan. */
const BODY_PULSE = 0.55;
const BODY_ALERT = 1.6;

interface Wisp {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  life: number;
  max: number;
}

/**
 * Gövde çevresine güç çekirdeği kurar.
 *
 * `span` = bombanın DÜNYA çapı (`BOMB_TARGET_WORLD_SPAN`); tüm ölçüler ondan
 * türer, yani skin/ölçek değişse de katman bombayla birlikte doğru kalır.
 * Çağıran kapsayıcı (bkz. `BombModel` → `root`) dünya birimindedir.
 */
export function createBombEnergyField(
  span: number,
  options?: BombEnergyFieldOptions,
): BombEnergyField {
  const motion = prefersReducedMotion() ? 0.3 : 1;
  const group = new THREE.Group();
  group.renderOrder = 8;
  group.userData.isEquipment = true;

  const mats: THREE.Material[] = [];
  const ringMat = (color: string, opacity: number): THREE.MeshBasicMaterial => {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      // Halka ince bir çizgi: her yüzü aynı parlaklıkta okunsun (arka yarısı
      // kaybolmasın), bu yüzden DoubleSide.
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    mats.push(mat);
    return mat;
  };

  const ringA = new THREE.Mesh(unitTorus(RING_TUBE), ringMat(RING_CALM_A, 0.4));
  const ringB = new THREE.Mesh(unitTorus(RING_TUBE), ringMat(RING_CALM_B, 0.28));
  const wave = new THREE.Mesh(unitTorus(WAVE_TUBE), ringMat(RING_CALM_A, 0.3));
  const ringAMat = ringA.material as THREE.MeshBasicMaterial;
  const ringBMat = ringB.material as THREE.MeshBasicMaterial;
  const waveMat = wave.material as THREE.MeshBasicMaterial;

  // Başlangıç eğimleri: iki halka da gövdeyi "kafes" gibi sarmalı. Dalga ise
  // fünye eksenine DİK düzlemde yatar (ekvatordan dışa yayılan boşalma).
  ringA.rotation.set(1.15, 0, 0);
  ringB.rotation.set(-0.6, 0, 0.85);
  wave.rotation.set(Math.PI / 2, 0, 0);
  for (const mesh of [ringA, ringB, wave]) {
    mesh.raycast = () => {}; // tıklama düzlemini engellemesin
    mesh.frustumCulled = false; // kemik animasyonunda bir an kaybolmasın
    mesh.userData.isEquipment = true;
    mesh.renderOrder = 8;
    group.add(mesh);
  }
  ringA.scale.setScalar(span * RING_A_R);
  ringB.scale.setScalar(span * RING_B_R);
  wave.scale.setScalar(span * WAVE_R);

  // 💨 Duman: fitil ucundan yükselen sıcak leke. Additif DEĞİL — duman ışık
  // yaymaz, ışığı keser; additif olsaydı zemini aydınlatan bir parıltı gibi
  // okunurdu. Bu yüzden normal karışım + düşük opaklık.
  const wispTex = makeSmokeTexture();
  const fuseHost = options?.fuseOffset?.clone() ?? new THREE.Vector3(0, span * 0.5, 0);
  const wisps: Wisp[] = [];
  for (let i = 0; i < WISP_COUNT; i++) {
    const mat = new THREE.SpriteMaterial({
      map: wispTex,
      color: WISP_COLOR,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    mats.push(mat);
    const sprite = new THREE.Sprite(mat);
    sprite.raycast = () => {};
    sprite.frustumCulled = false;
    sprite.renderOrder = 9;
    sprite.userData.isEquipment = true;
    group.add(sprite);
    wisps.push({
      sprite,
      mat,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 0,
      life: 0,
      max: 1,
    });
  }

  /** Bir duman lekesini fitil ucunda yeniden doğurur (havuz sabit kalır). */
  const respawn = (w: Wisp) => {
    const ang = Math.random() * Math.PI * 2;
    const r = span * 0.07 * Math.random();
    w.x = fuseHost.x + Math.cos(ang) * r;
    w.z = fuseHost.z + Math.sin(ang) * r;
    w.y = fuseHost.y + span * 0.05;
    // Fitilden kopan duman önce hızlı yükselir, sonra yavaşlar (aşağıda
    // sönümleme var) ve hafifçe yana savrulur.
    w.vx = (Math.random() - 0.5) * span * 0.3;
    w.vz = (Math.random() - 0.5) * span * 0.3;
    w.vy = span * (0.4 + Math.random() * 0.42);
    w.size = span * (0.36 + Math.random() * 0.22);
    w.max = w.life = WISP_LIFE * (0.75 + Math.random() * 0.55);
  };
  for (const w of wisps) {
    respawn(w);
    w.life = Math.random() * w.max; // dağınık fazlar: ikisi birlikte sönmesin
  }

  // Gövde ısı nabzı: her malzemenin TABAN ışıması bir kez saklanır, nabız
  // tabana oranla uygulanır (aksi hâlde her karede değer katlanarak büyürdü).
  const bodyMats = options?.bodyMaterials ?? [];
  const bodyBase = new Map<THREE.MeshStandardMaterial, number>();
  for (const m of bodyMats) bodyBase.set(m, m.emissiveIntensity);

  const calmA = new THREE.Color(RING_CALM_A);
  const calmB = new THREE.Color(RING_CALM_B);
  const hotA = new THREE.Color(RING_HOT_A);
  const hotB = new THREE.Color(RING_HOT_B);

  let time = Math.random() * 10;
  let waveT = 0;
  let alert = 0;

  const update = (dt: number, nextAlert = alert): boolean => {
    alert = THREE.MathUtils.clamp(nextAlert, 0, 1);
    const d = Math.min(dt, 1 / 30); // sekmeye dönüldüğünde ışınlanma olmasın
    time += d;

    // Titreme: sabit parlayan bir çekirdek "cam" gibi okunur; iki farklı hızda
    // sinüs onu canlı tutar (fünye aleviyle aynı gerekçe).
    const flick =
      1 +
      (Math.sin(time * 5.3) * 0.5 + Math.sin(time * 8.1 + 1.7) * 0.5) *
        0.22 *
        motion;

    // --- HALKALAR: zıt yönlü dönüş + yavaş eğim salınımı ------------------
    // (Dönüş yalnız kendi ekseninde olsaydı simetrik halkada GÖRÜNMEZDİ; bu
    // yüzden dönüş, eğimi de sürekli değiştirir — kafes "nefes alıp döner".)
    const a = span * RING_A_R * (1 + 0.05 * alert);
    const b = span * RING_B_R * (1 + 0.05 * alert);
    ringA.rotation.set(
      1.15 + Math.sin(time * 0.75) * 0.3 * motion,
      time * SPIN_A * motion,
      Math.sin(time * 0.5 + 1.2) * 0.24 * motion,
    );
    ringB.rotation.set(
      -0.6 + Math.cos(time * 0.62) * 0.32 * motion,
      time * SPIN_B * motion,
      0.85 + Math.sin(time * 0.44) * 0.22 * motion,
    );
    ringA.scale.setScalar(a);
    ringB.scale.setScalar(b);
    // Alarmda halkalar ısınır (amber → kızıl) ve parlar.
    ringAMat.color.copy(calmA).lerp(hotA, alert);
    ringBMat.color.copy(calmB).lerp(hotB, alert);
    ringAMat.opacity = Math.min(1, 0.42 * flick * (1 + 0.6 * alert));
    ringBMat.opacity = Math.min(1, 0.27 * flick * (1 + 0.55 * alert));

    // --- ŞOK DALGASI: periyodik dışa yayılan boşalma ----------------------
    // Fitil kısaldıkça (`alert`) periyot kısalır, dalga büyür: "birazdan
    // patlar" bilgisi RENK ve HAREKETLE birlikte verilir.
    const period = THREE.MathUtils.lerp(
      WAVE_PERIOD_CALM,
      WAVE_PERIOD_ALERT,
      alert,
    );
    waveT += d;
    let emitted = false;
    if (waveT >= period) {
      waveT %= period;
      emitted = true;
    }
    const u = waveT / period;
    wave.scale.setScalar(
      span * WAVE_R * (1 + WAVE_GROW * (0.55 + 0.45 * alert) * u),
    );
    wave.rotation.x = Math.PI / 2 + Math.sin(time * 0.6) * 0.12 * motion;
    waveMat.color.copy(calmA).lerp(hotA, alert);
    // Sönüm: dalga dışa açılırken SAYDAMLAŞIR. Doğrusal bir sönüm "makine gibi"
    // dururdu (dalga yolun sonuna kadar aynı parlaklıkta kalır); karesel sönüm
    // enerjinin boşaldığını okutur.
    const fade = 1 - u;
    waveMat.opacity = Math.min(1, fade * fade * (0.5 + 0.4 * alert));

    // --- DUMAN: yükselir, yavaşlar, genişler, söner -----------------------
    for (const w of wisps) {
      w.life -= d;
      if (w.life <= 0) {
        respawn(w);
        continue;
      }
      const drag = Math.max(0, 1 - 1.6 * d);
      w.vx *= drag;
      w.vz *= drag;
      w.vy *= drag;
      w.x += w.vx * d;
      w.y += w.vy * d;
      w.z += w.vz * d;
      const k = 1 - w.life / w.max; // 0 = yeni doğdu, 1 = sönmek üzere
      w.sprite.position.set(w.x, w.y, w.z);
      // Duman yükselirken GENİŞLER ve dağılır (gerçek dumanın imzası).
      w.sprite.scale.setScalar(w.size * (0.62 + 0.75 * k));
      w.mat.rotation = k * 0.7 * (w === wisps[0] ? 1 : -1);
      // Yumuşak giriş + karesel çıkış: leke bir karede belirip kaybolmasın.
      w.mat.opacity = Math.min(1, k * 6) * (1 - k) * (1 - k) * (0.3 + 0.18 * alert);
    }

    // --- ISI NABZI (ek çizim yok) ----------------------------------------
    if (bodyMats.length) {
      const heat =
        1 + BODY_PULSE * Math.sin(time * 2.6) * motion + BODY_ALERT * alert;
      for (const m of bodyMats) {
        const base = bodyBase.get(m);
        if (base !== undefined) m.emissiveIntensity = base * heat;
      }
    }

    return emitted;
  };

  const dispose = () => {
    group.removeFromParent();
    group.clear();
    // Geometriler PAYLAŞILIR (modül önbelleği) — burada serbest bırakılmaz.
    for (const m of mats) m.dispose();
  };

  // İlk kareyi hemen uygula (halkalar bir kare boyunca sıfır ölçekte kalmasın).
  update(1 / 60, 0);

  return { group, update, dispose };
}
