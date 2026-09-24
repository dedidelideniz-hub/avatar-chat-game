import * as THREE from "three";

/* ── Hand grip module — Kraliyet Savaşçısı right hand ───────────── */
/* Everything about "how the royal sword sits in the right hand" lives
 * here, separate from the effect layer:
 *
 *   • GRIP                  measured constants (palm center, grip rotation)
 *   • applyFingerGrip       closed-fist pose on the right-hand finger chain
 *   • buildStructuralSword  procedural sword (instant fallback while the
 *                           Draco GLB loads — also the offline safety net)
 *   • markHandJoints        ?handDebug=1 debug markers on every joint
 *   • handBoneScale         avg world scale of a bone (for size math)
 *
 * All numbers marked MEASURED come from headless parsing of the skin
 * GLB the game renders (moda-savasci.glb; live Idle clip, t = 1.0s) —
 * not guesses. Runtime calibration (calibrateSwordGrip) re-derives the
 * grip from the live hand pose anyway, so these constants only seed the
 * very first frames before calibration lands.
 */

/* ── Kılıç KAPSAYICI GRUP ayarları (ince ayar) ──────────────────── */

/**
 * Kılıç GLB'nin origin'i saptta OLMADIĞI için kılıç doğrudan el bone'una
 * değil, bone'a bağlı boş bir kapsayıcı grup içine ekleniyor. Bu sabitler
 * kapsayıcı İÇİNDEKİ model offset'leridir — ince ayar için TEK yer.
 */
export const SWORD_CONTAINER_MODEL_POS: [number, number, number] = [0, 0, 0]; // sap avuç merkezinde
export const SWORD_CONTAINER_MODEL_ROT: [number, number, number] = [Math.PI / 2, 0, Math.PI / 2]; // GLB local ekseni: sap avuçta, uç yukarı/ileri
export const SWORD_CONTAINER_MODEL_SCALE = 0.5; // el boyutuna uygun küçültme

/* ── MEASURED grip constants ────────────────────────────────────── */

/** Kılıç görünürlüğü ve kavrama — MEASURED (moda-savasci.glb, Idle@1.0):
 *  El bone'unun DÜNYA ölçeği ≈ 0.00437; palm merkez (hand-local) y≈31.
 *  Kılıç kapsayıcısı el bone'una eklenir; model offsetleri burada tek yerde. */
export const HAND_AXES = {
  up: [0.315, -0.941, -0.125], // world UP in hand-local (MEASURED: moda-savasci.glb)
} as const;

/** Palm center = average of the finger-base bones, hand-local units.
 *  MEASURED on moda-savasci.glb: (0, 13.24, 0) — that rig carries only
 *  an Index chain, straight along +Y from the wrist. */
export const PALM_CENTER: [number, number, number] = [0, 13.24, 0]; // MEASURED: moda-savasci.glb

/** Sword origin = FIST CENTER (slightly below the knuckle line, 0.95×
 *  palm Y). The sword model's hilt band (modelY = 0.12) is translated
 *  onto this origin, so the grip sits INSIDE the fist. */
export const SWORD_GRIP_POS: [number, number, number] = [0, 11.72, 0]; // measured hand-space palm center

/** Euler mapping the sword's +Y blade axis to WORLD-UP at idle and the
 *  crossguard (+X) horizontal — MEASURED for moda-savasci.glb, verified
 *  (blade → (0,1,0), crossguard → (1,0,0) in world space). The previous
 *  value was measured on a DIFFERENT skin file and put the blade 107.7°
 *  off vertical (the sideways, unreadable "stick" look). */
export const SWORD_GRIP_ROT: [number, number, number] = [-0.9509, 1.2112, -2.032]; // MEASURED: moda-savasci.glb
export const SWORD_GRIP_SCALE = 0.68; // keep the blade readable beside the hand

/** Target sword length in WORLD units (character height ≈ 1.92). */
export const SWORD_TARGET_WORLD_LEN = 0.85;

/** Grip-band center along the sword model's +Y (both GLB and structural
 *  models are built so the hilt middle sits at modelY = 0.12). */
export const SWORD_GRIP_BAND_MODEL_Y = 0.12;

/* ── Helpers ────────────────────────────────────────────────────── */

/** Average world scale of a bone — used by legacy equipment measurements. */
export function handBoneScale(bone: THREE.Object3D): number {
  bone.updateWorldMatrix(true, false);
  const ws = bone.getWorldScale(new THREE.Vector3());
  return (ws.x + ws.y + ws.z) / 3 || 1e-6;
}

/** Conservative maximum world-axis scale for held-bomb normalization. */
export function handBoneMaxScale(bone: THREE.Object3D): number {
  bone.updateWorldMatrix(true, false);
  const ws = bone.getWorldScale(new THREE.Vector3());
  return Math.max(Math.abs(ws.x), Math.abs(ws.y), Math.abs(ws.z), 1e-6);
}

/* ── Live grip calibration (rig-independent) ─────────────────────── */

/** Pure-rotation world quaternion of a bone. Rig nodes bake scale into
 *  matrixWorld, so the quaternion must be extracted from NORMALIZED
 *  basis columns (a raw setFromRotationMatrix is wrong otherwise). */
export function handWorldQuat(hand: THREE.Object3D): THREE.Quaternion {
  hand.updateWorldMatrix(true, false);
  const m = hand.matrixWorld;
  const rm = new THREE.Matrix4().makeBasis(
    new THREE.Vector3().setFromMatrixColumn(m, 0).normalize(),
    new THREE.Vector3().setFromMatrixColumn(m, 1).normalize(),
    new THREE.Vector3().setFromMatrixColumn(m, 2).normalize(),
  );
  return new THREE.Quaternion().setFromRotationMatrix(rm);
}

/** The right-hand BONE of a clone, suffix-tolerant: plain Mixamo names
 *  ("mixamorigRightHand") and suffixed exports
 *  ("mixamorigRightHand_021") both resolve. */
export function rightHandBone(clone: THREE.Object3D): THREE.Object3D | null {
  let hand: THREE.Object3D | null = null;
  clone.traverse((o) => {
    if (hand || !(o as THREE.Bone).isBone) return;
    const n = o.name.toLowerCase();
    if (
      n === "mixamorigrighthand" ||
      (n.startsWith("mixamorigrighthand") && !/thumb|index|middle|ring|pinky/.test(n))
    ) {
      hand = o;
    }
  });
  return hand;
}

/** Sol el kemiği — `rightHandBone`'un aynası. Bomba sağ↔sol el arasında
 *  atıldığı için iki el de gerekir; ad eşleşmesi ve parmak filtresi aynıdır. */
export function leftHandBone(clone: THREE.Object3D): THREE.Object3D | null {
  let hand: THREE.Object3D | null = null;
  clone.traverse((o) => {
    if (hand || !(o as THREE.Bone).isBone) return;
    const n = o.name.toLowerCase();
    if (
      n === "mixamoriglefthand" ||
      (n.startsWith("mixamoriglefthand") && !/thumb|index|middle|ring|pinky/.test(n))
    ) {
      hand = o;
    }
  });
  return hand;
}

/** Suffix-tolerant finger-joint bones under one hand bone. End joints
 *  ("…_end") are excluded — they carry no geometry. */
export function fingerBonesOf(hand: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  hand.traverse((o) => {
    if (o === hand || !(o as THREE.Bone).isBone) return;
    if (/thumb|index|middle|ring|pinky/i.test(o.name) && !/_?end$/i.test(o.name)) out.push(o);
  });
  return out;
}

/** Phalanx index of a (possibly suffixed) finger bone name: 1–4, else 1. */
function phalanxOf(name: string): number {
  const m = name.match(/(\d)(?:_|$)/);
  return m ? Number(m[1]) : 1;
}

/** Live palm center from THIS rig's finger-base bones (falls back to
 *  the baked MEASURED constant when the rig exposes none). */
export function palmCenterLocal(hand: THREE.Object3D): THREE.Vector3 {
  const bases = hand.children.filter(
    (c) =>
      (c as THREE.Bone).isBone &&
      /thumb|index|middle|ring|pinky/i.test(c.name) &&
      !/_?end$/i.test(c.name),
  );
  if (!bases.length) return new THREE.Vector3(...PALM_CENTER);
  const avg = bases
    .reduce((v, b) => v.add(b.position), new THREE.Vector3())
    .divideScalar(bases.length);
  avg.y *= 0.95; // fist center sits just below the knuckle line
  return avg;
}

/**
 * Calibrate the sword grip from the hand's LIVE pose: blade vertical,
 * crossguard horizontal, hilt inside the fist. Called ONCE on the first
 * stationary frame (after the idle animation has settled); the grip then
 * stays FIXED in hand-local space, so the sword swings naturally with
 * the arm while walking and returns to vertical at rest. Works for any
 * rig — no baked per-file constants involved. Model-space rotation
 * lives in the pivot (SWORD_CONTAINER_MODEL_ROT) — calibration never
 * touches it, so the two can no longer fight each other.
 */
export function calibrateSwordGrip(hand: THREE.Object3D, sword: THREE.Object3D): void {
  sword.quaternion.copy(handWorldQuat(hand).invert());
  sword.position.copy(palmCenterLocal(hand));
  // Ölçek telafisini KORU: kalibrasyon yalnız pozisyon+rotasyon günceller,
  // ölçeğe dokunmaz (dev kılıç regresyonunu önler).
  sword.updateMatrixWorld(true);
}

/* ── Finger grip (closed fist) ──────────────────────────────────── */

/** Rest rotations per finger bone, captured the first time we pose it.
 *  Resetting to rest before applying keeps the pose idempotent even when
 *  the gear effect re-runs (equip changes, GLB swap, …). */
const fingerRest = new WeakMap<THREE.Object3D, THREE.Euler>();

/**
 * Adds a subtle closed-grip pose on top of the authored animation so the
 * hand reads as "holding" the sword. Idempotent: safe to call on every
 * gear attach. Never touches the mixer/clips. Bone lookup is
 * suffix-tolerant so rigs like moda-savasci.glb (Index1_00…) pose too.
 *
 * `scale` shrinks the pose for items a closed fist would clip through
 * (the bomb is held in a cupped hand — see `BOMB_FINGER_GRIP`).
 *
 * `handBone` verilirse o el pozlanır. Bomba artık sağ↔sol el arasında
 * atıldığı için İKİ elin de kavrama pozunda olması gerekir; verilmezse eski
 * davranış korunur (yalnız sağ el — kılıç katmanı bunu kullanır).
 */
export function applyFingerGrip(
  clone: THREE.Object3D,
  scale = 1,
  handBone?: THREE.Object3D | null,
): void {
  const hand = handBone ?? rightHandBone(clone);
  if (!hand) return;
  for (const bone of fingerBonesOf(hand)) {
    let rest = fingerRest.get(bone);
    if (!rest) {
      rest = bone.rotation.clone();
      fingerRest.set(bone, rest);
    }
    // Reset to rest, then apply the closed pose from a clean base.
    bone.rotation.copy(rest);
    const isThumb = /thumb/i.test(bone.name);
    const phalanx = phalanxOf(bone.name);
    const amount = (isThumb ? 0.18 : phalanx === 1 ? 0.16 : 0.22) * scale;
    bone.rotation.x += amount;
    bone.rotation.z += amount * 0.18;
  }
}

/* ── Structural sword (instant fallback / offline net) ──────────── */

/**
 * Procedural arming sword built in the SAME model space as royal-kilic.glb
 * (total length ≈ 1.14 along +Y, hilt center at modelY = 0.12) so the
 * scale math and grip code are identical for both models. The effect layer
 * attaches this synchronously on the very first equip, then swaps in the
 * GLB the moment it finishes loading.
 */
export function buildStructuralSword(): THREE.Group {
  const sword = new THREE.Group();

  const steel = new THREE.MeshStandardMaterial({
    color: "#dfe7ef", metalness: 0.92, roughness: 0.16,
    emissive: "#9fd0ff", emissiveIntensity: 0.18,
  });
  const fullerMat = new THREE.MeshStandardMaterial({
    color: "#aab6c2", metalness: 0.85, roughness: 0.3,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: "#d9a53c", metalness: 0.85, roughness: 0.25,
    emissive: "#7a5510", emissiveIntensity: 0.25,
  });
  const leatherMat = new THREE.MeshStandardMaterial({
    color: "#4a2c14", roughness: 0.85, metalness: 0.05,
  });

  // Blade: flattened diamond (4-seg cone) from the guard up to the tip.
  const bladeLen = 0.94;
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.055, bladeLen, 4), steel);
  blade.scale.z = 0.22;
  blade.rotation.y = Math.PI / 4;
  blade.position.y = 0.05 + bladeLen / 2; // starts just above the guard
  sword.add(blade);

  // Fuller: two thin darker strips on the blade faces.
  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.62, 0.004), fullerMat);
  fuller.position.y = 0.38;
  sword.add(fuller);
  const fullerBack = fuller.clone();
  fullerBack.position.z = -0.009;
  fuller.position.z = 0.009;
  sword.add(fullerBack);

  // Crossguard: wide bar + rounded quillon tips.
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.045, 0.06), goldMat);
  guard.position.y = 0.045;
  sword.add(guard);
  const quillonGeo = new THREE.SphereGeometry(0.026, 8, 6);
  const qL = new THREE.Mesh(quillonGeo, goldMat);
  qL.position.set(-0.19, 0.045, 0);
  const qR = new THREE.Mesh(quillonGeo, goldMat);
  qR.position.set(0.19, 0.045, 0);
  sword.add(qL, qR);

  // Grip: leather-wrapped handle just below the guard.
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.13, 10), leatherMat);
  grip.position.y = -0.03;
  sword.add(grip);
  // Wrap rings.
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.029, 0.006, 6, 12),
      goldMat,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.07 + i * 0.035;
    sword.add(ring);
  }

  // Pommel: disc + finial cap at the very bottom.
  const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 14), goldMat);
  pommel.position.y = -0.105;
  sword.add(pommel);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), goldMat);
  cap.position.y = -0.125;
  sword.add(cap);

  return sword;
}

/* ── 🧨 BOMBA (Samuray skini) — kapsayıcı ayarları ────────────────── */

/**
 * Bomba da kılıçla AYNI zincirle tutulur:
 *
 *   el kemiği → `grip` (kemik ölçeğini 1'e indirir → içindeki birim = dünya
 *   birimi) → `pivot` (model-uzayı düzeltmesi) → model
 *
 * Fark: bombanın hizalanacak uzun bir ekseni yoktur, bu yüzden tek gereken
 * "fünye yukarı, gövde avuç içinde" duruşu. `calibrateSwordGrip` (aşağıdaki
 * `calibrateHandGrip` takma adı) kapsayıcının DÜNYA yönelimini kimliğe
 * çevirdiği için, pivot'ta ek düzeltme GEREKMEZ: model uzayında fünye +Y ise
 * dünyada da yukarı bakar (kılıcın dikey kalmasıyla aynı kural).
 */
/**
 * BOMBANIN A VUÇTA OTURMASI — el-yerel eksenlerde, ÖLÇÜLMÜŞ sabitler.
 *
 * ÖLÇÜM (skin-samuray.glb, Idle klibi — tek karelik statik poz):
 *   · el kemiği dünya ölçeği 0.00437 · avuç merkezi (hand-local) (0, 13.24, 0)
 *     ≈ 0.058 dünya birimi; parmak zinciri toplam ≈0.13 birim.
 *   · hand-local **+Y = PARMAK yönü** (parmak zinciri tam +Y boyunca uzanır).
 *   · hand-local **+Z = AVUÇ NORMALİ** (avucun baktığı yön). İki bağımsız
 *     ölçüm aynı ekseni verir: T-pose'da avuçlar aşağı bakar ve Z dünyada
 *     aşağıya düşer; ayrıca parmak zinciri Index3→Index4 adımında +Z'ye
 *     kıvrılır (parmaklar avucun İÇİNE doğru kıvrılır).
 *
 * Küre, avucun ÇUKURUNA oturur: topun merkezi avuç merkezinden avuç normali
 * boyunca ~bir yarıçap dışarıdadır. Merkez avuç merkezinde bırakılırsa top elin
 * İÇİNE saplanır — parmaklar topun ortasından geçer ve "eline saplanmış, yukarı
 * fırlamış" görüntüsü çıkar. BOMB_SEAT_OUT bu yüzden ≈ bomba yarıçapıdır.
 */
export const BOMB_SEAT_FINGER = 0.06; // avuçtan öne, kavrayan parmakların hizasına
/**
 * Oturma mesafesi — bomba YARIÇAPININ katı (dünya birimi).
 *
 * NEDEN "YARIÇAP + BOŞLUK" DEĞİL: önceki sürüm topu avuç merkezinden
 * `yarıçap + 0.045 (boşluk) + 0.03 (dışa)` kadar uzağa koyuyordu. Toplam
 * 0.235 birim, 0.16 yarıçaplı bir top için ~1.5 yarıçap eder ve ekran
 * görüntüsünde topun yüzeyi elle hiç temas etmiyordu: karakterin yanında
 * HAVADA ASILI bir küre gibi okunuyordu ("eliyle bomba hiç bağdaşmıyor").
 * 1.02 katında topun yüzeyi parmak/avuç dokusunun birkaç milim İÇİNE girer;
 * MOBA prop'larında doğru okunan temas budur — boşluk değil, hafif iç içe
 * geçme "kavranmış" hissi verir.
 *
 * Ölçekle AYNI referanstan türediği için (hedef çap) top hangi model olursa
 * olsun avuca aynı oranda oturur (bkz. `BOMB_SEAT_OUT`).
 */
export const BOMB_SEAT_RADIUS_FRAC = 1.02;
/**
 * Bombanın gövde silüetinden dışarı taşınması (dünya birimi, yatay).
 *
 * NEDEN: yerleştirme avuç NORMALİ boyunca yapıldığında, o eksen rig'e göre
 * gövdeye/içe dönebiliyor ve bomba elin ya da bacağın içine düşüyordu (elde
 * tutulmuyor, gövdeye yapışmış gibi okunuyordu). MOBA karakterlerinde prop her
 * zaman silüetin DIŞINDA durur; bu yüzden avuç çukurundan çıkan öteleme artık
 * karakter merkezinden ele giden dışa yön boyunca uygulanır.
 *
 * KÜÇÜK tutulur: asıl düzeltme YÖN'dür. Mesafeyi büyütmek bombanın el ile
 * temasını koparır ve "havada asılı" görüntü çıkarır (topun yüzeyi avuca
 * değmeli); bu yalnızca el mesh'inin küreye girmemesi için ince bir paydır.
 */
export const BOMB_CARRY_OUT = 0.012;
/** Hafif yukarı kaldırma — kalça/bacak hizasından ayrışsın. */
export const BOMB_CARRY_LIFT = 0.012;
/**
 * Fünyenin gövdeden UZAĞA yatış açısı (derece).
 *
 * Düz yukarı bakan bir fünye, tepe kamerasında kısalır ve uç detayları
 * görünmez; ayrıca karakterin silüetiyle çakışır. 30-35° dışa yatış, fünyeyi
 * gövdeden ayırıp kameraya yan gösterir (MOBA'ların standart çözümü).
 */
export const BOMB_TILT_OUT_DEG = 38;
/**
 * Bomba tutulurken parmak pozu: kapalı yumruk DEĞİL, topu S A R A N avuç.
 * Yumrukta parmaklar topun içine kıvrılır; ~0.45 katsayısı parmakları topun
 * yüzeyine yatırır (uçlar temas eder, içine girmez).
 */
export const BOMB_FINGER_GRIP = 0.45;
export const BOMB_CONTAINER_MODEL_SCALE = 1;

/**
 * Model uzayı: gövde merkezi ORİJİN'de, gövde çapı 2.08 birim (üretilen
 * `public/models/bomba.glb` ile birebir aynı — ekseni 2.08, yüksekliği 2.74).
 *
 * HEDEF DÜNYA ÇAPI = 0.32 birim (yaklaşık karakter boyunun beşte biri).
 *
 * NEDEN GERÇEKÇİ ÖLÇÜ (0.26) BIRAKILDI: kuş bakışı (top-down) MOBA/aksiyon
 * oyunlarında elde taşınan silah/bomba kasten gerçek boyutundan BÜYÜK
 * çizilir; oyuncu prop'u karakterin gövdesi, eli ve zemin karmaşasından
 * ayırt edebilmelidir. Önceki 0.52 değerinde, ekteki oyun görüntüsünde hâlâ
 * karakterin silüetini bastırıyordu. 0.32 çap, 1.48 birimlik karakterin
 * yaklaşık %22'sidir: elde seçilir ama artık karakterden büyük görünmez.
 *
 * Mermi/tuzak bombaları kendi oyun ölçülerini kullanır; elde tutulan model
 * yalnız okunurluk için hafif büyütülür, fakat tüm bombanın fitil dâhil silüeti
 * karakterin elinden ve gövdesinden küçük kalmalıdır.
 *
 * Gövde çapı 0.32'dir; fitil ve efektler de ayrıca kısaltılmıştır. Ölçek,
 * avuçtan dışarı oturma mesafesi ve aura yarıçapı aynı hedefi izler.
 */
export const BOMB_MODEL_SPAN = 2.08;
export const BOMB_TARGET_WORLD_SPAN = 0.32;
/**
 * Avuçtan dışarı oturma mesafesi — bomba YARIÇAPINDAN türetilir.
 *
 * Bomba çapı `BOMB_TARGET_WORLD_SPAN`'e normalize edilir (bkz. SamuraiBomb),
 * dolayısıyla yarıçapı biliniyor ve öteleme hep aynı oranda kalır.
 *
 * İKİ UÇ ARASINDAKİ DENGE (ikisi de ekran görüntüsüyle doğrulandı):
 *   · ÇOK KÜÇÜK → top avucun/parmakların İÇİNE gömülür, "ele saplanmış" okunur.
 *   · ÇOK BÜYÜK → topun yüzeyi elle hiç temas etmez, karakterin yanında HAVADA
 *     ASILI bir küre gibi okunur ("eliyle bomba hiç bağdaşmıyor").
 * 1.02 yarıçap + `BOMB_CARRY_OUT` bu ikisinin ortasıdır: topun yüzeyi avuca
 * DEĞER, gövdeye doğru hafifçe oturur. `BOMB_SEAT_FINGER` ise topu avucun
 * içinden kavrayan parmakların hizasına taşır.
 *
 * TÜRETİLMİŞ DEĞER (bu yüzden burada, hedef ölçüden SONRA tanımlı): sabit sayı
 * yazılsaydı hedef ölçü değiştiğinde oturma ile ölçek birbirinden kopar ve
 * bomba elden kaçardı — bu hata bir kez yaşandı (gövde ölçüsü kaba kutudan
 * geldiği için küçük ölçeklenen bombada oturma mesafesi fazla kalıp topu
 * avuçtan dışarı taşırıyordu).
 */
export const BOMB_SEAT_OUT =
  BOMB_TARGET_WORLD_SPAN * 0.5 * BOMB_SEAT_RADIUS_FRAC; // = 0.1632
/**
 * ALEVİN ölçek referansı — bomba genişliğinden BAĞIMSIZ.
 *
 * NEDEN AYRI: alev bomba büyüdükçe birebir büyümemeli. Gerçekte fitil alevinin
 * boyu fitilin boyudur, bombanın çapı değil; `createFuseFlame` alevi `span`
 * katlarıyla kurduğu için bomba çapı (0.32) doğrudan verilseydi alev eli ve
 * omzu kapatacak kadar büyürdü. 0.13, gövdeden küçük kalan ve fünye ucunda
 * okunabilen ölçüdür.
 */
export const BOMB_FLAME_SPAN = 0.13;
/** Fitil ucunun kendinden ışıma şiddeti (bloom'u besler, ekranı sislemez). */
export const BOMB_FUSE_EMISSIVE = 2.6;
/**
 * GÖVDEYE kendinden ışıma (emissive) tabanı — bombanın elde "dikkat çekmesi".
 *
 * Kime uygulanır: yalnızca emissive DOKUSU OLMAYAN malzemelere (prosedürel
 * yedek + `bomba.glb`). Dokulu modelde (comical_bomb.glb) ışımayı doku + modelin
 * kendi `KHR_materials_emissive_strength` değeri taşır; oraya yazılan düz renk
 * siyah kısımlarda hiç görünmezdi (emissive = renk × doku).
 *
 * ŞİDDET NEDEN BU KADAR DÜŞÜK: amaç ateş/parlama değil, uzaktan okunurluk.
 * 0.12'de bomba kendi rengiyle okunur, karanlık çalılıkta kaybolmaz, gece
 * atmosferinde "yanıyor" gibi görünmez. Gövde ışığını asıl taşıyan şey
 * `createBombAura` (kızıl-turuncu hâle + zayıf nokta ışığı + kor parçacıkları)
 * ve fünye alevidir.
 */
export const BOMB_BODY_EMISSIVE = 0.12;
/** Gövde emissive rengi — sıcak kızıl-turuncu (fünye aleviyle aynı aile). */
export const BOMB_BODY_EMISSIVE_COLOR = "#ff4d16";
/** Model/üretilen dosyada fitil ucunu taşıyan malzeme adı. */
export const BOMB_FUSE_MATERIAL = "BombaFuseGlow";

/** `palmHoldPoint` için modül düzeyinde geçici vektörler (kare başına çöp yok). */
const handWorldScratchA = new THREE.Vector3();
const handWorldScratchB = new THREE.Vector3();
const handWorldScratchC = new THREE.Vector3();

/**
 * Bir elin AVUÇ merkezini DÜNYA uzayında, elde tutuş ötelemesiyle birlikte
 * döndürür:
 *
 *   avuç merkezi → parmak yönünde `BOMB_SEAT_FINGER` → gövdeden dışa
 *   `BOMB_SEAT_OUT + BOMB_CARRY_OUT` → hafif yukarı `BOMB_CARRY_LIFT`.
 *
 * NEDEN AYRI: hem kalibrasyon (tek el, el-yerel — `bombSeatLocal`) hem de atış
 * animasyonu (iki el, dünya uzayı) AYNI tutuş geometrisini kullanmalıdır; aksi
 * hâlde bomba elden ele geçerken konum atlar (aynı topun iki farklı yerde
 * durması gibi). Bu yüzden iki fonksiyon bilerek aynı sabitleri ve aynı sırayı
 * uygular — birini değiştiren diğerini de değiştirmelidir.
 * `palmCenterLocal` kemik ORİJİNİ değil avuçtur (kemik orijini bilekte kalır ve
 * bomba bileğe yapışık görünür).
 *
 * `outOutward` verilirse elin gövdeden dışa yönü (birim vektör) oraya yazılır;
 * atış yayının bükülmesi iki elin bu yönlerinin ortalamasından bulunur.
 */
export function palmHoldPoint(
  hand: THREE.Object3D,
  reference: THREE.Object3D,
  outPoint: THREE.Vector3,
  outOutward?: THREE.Vector3 | null,
): THREE.Vector3 {
  hand.updateWorldMatrix(true, false);
  reference.updateWorldMatrix(true, false);
  outPoint.copy(palmCenterLocal(hand));
  hand.localToWorld(outPoint);

  // Parmak yönü (el-yerel +Y) dünya uzayında: topu avucun içinden kavrayan
  // parmakların hizasına taşır. `bombSeatLocal` da aynı kaydırmayı yapar.
  // Doğrudan matrixWorld'in 2. kolonu okunur (kemik yerel +Y = parmak yönü,
  // Mixamo standardı) — `handWorldQuat` gibi kuantarnyon kurmaya gerek yok.
  handWorldScratchC.setFromMatrixColumn(hand.matrixWorld, 1).normalize();
  outPoint.addScaledVector(handWorldScratchC, BOMB_SEAT_FINGER);

  // Dışa yön: kökten EL KEMİĞİNE giden yatay yön — kalibrasyonun
  // (`calibrateBombGrip`) kullandığı referansın AYNISI. Avuç noktasından
  // ölçmek, parmak kaydırması yüzünden birkaç derece sapıyordu ve top elden ele
  // geçerken (kalibrasyon ↔ atış animasyonu) küçük bir konum atlaması yaratırdı.
  const refPos = handWorldScratchA.setFromMatrixPosition(reference.matrixWorld);
  const handPos = handWorldScratchC.setFromMatrixPosition(hand.matrixWorld);
  const outward = handWorldScratchB.copy(handPos).sub(refPos).setY(0);
  if (outward.lengthSq() > 1e-8) {
    outward.normalize();
    outPoint.addScaledVector(outward, BOMB_SEAT_OUT + BOMB_CARRY_OUT);
  }
  outPoint.y += BOMB_CARRY_LIFT;
  outOutward?.copy(outward);
  return outPoint;
}

/**
 * Bombayı avuçta taşıyan nokta — el-yerel (kemik birimi) konum.
 *
 * Avuç merkezinden parmak yönünde (+Y) `BOMB_SEAT_FINGER`, dışa yönde
 * `BOMB_SEAT_OUT + BOMB_CARRY_OUT` ve hafif yukarı `BOMB_CARRY_LIFT` kadar
 * ötelenir. KEMİK uzayında olduğu için el/kol her hareket ettiğinde top avuçla
 * birlikte gider (kamera açısından bağımsız).
 *
 * Dışa yön avuç normalinden DEĞİL, karakter merkezinden ele giden yönden
 * gelir: bu rig'te avuç normali gövdeye dönük olduğu için topu bacağın/karının
 * içine sokuyordu (bkz. `calibrateBombGrip`).
 *
 * `palmHoldPoint` bunun DÜNYA uzayındaki eşidir ve AYNI sabitleri aynı sırayla
 * uygular (atış animasyonu onu kullanır) — biri değişirse diğeri de değişmeli,
 * yoksa top elden ele geçerken konum atlar.
 */
export function bombSeatLocal(
  hand: THREE.Object3D,
  /** Dünyada "gövdeden uzağa" yönü (bkz. `calibrateBombGrip`). */
  outwardWorld?: THREE.Vector3 | null,
): THREE.Vector3 {
  hand.updateWorldMatrix(true, false);
  const worldScale = hand.getWorldScale(new THREE.Vector3());
  const palm = palmCenterLocal(hand);
  const handQuat = handWorldQuat(hand);

  // Dışa yön: çağıran verirse onu kullan (karakter merkezinden ele giden yön),
  // yoksa avuç normalinin yatay bileşenine düş. Sabit bir eksen ASLA
  // kullanılmaz — rig'ler farklı yönlerde çizilmiş olabilir.
  const dir =
    outwardWorld && outwardWorld.lengthSq() > 1e-8
      ? outwardWorld.clone().normalize()
      : new THREE.Vector3(0, 0, 1).applyQuaternion(handQuat).setY(0);
  if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
  dir.normalize();

  // Dünya ötelemesi: avuç çukurundan dışa (yarıçap + pay) ve hafif yukarı.
  const worldOffset = dir
    .multiplyScalar(BOMB_SEAT_OUT + BOMB_CARRY_OUT)
    .add(new THREE.Vector3(0, BOMB_CARRY_LIFT, 0));

  // Dünya ötelemesini EL-YEREL birime çevir: önce el rotasyonunun tersi,
  // sonra eksen bazlı dünya ölçeği (tek bir ortalama ölçek, ölçekli kemiklerde
  // eksik kalır ve bomba yine ele gömülür).
  const local = worldOffset.applyQuaternion(handQuat.clone().invert());
  const s = new THREE.Vector3(
    Math.max(Math.abs(worldScale.x), 1e-6),
    Math.max(Math.abs(worldScale.y), 1e-6),
    Math.max(Math.abs(worldScale.z), 1e-6),
  );
  return new THREE.Vector3(
    palm.x + local.x / s.x,
    palm.y + local.y / s.y + BOMB_SEAT_FINGER / s.y,
    palm.z + local.z / s.z,
  );
}

/**
 * "Gövdeden uzağa" yatay yön (birim vektör): kökten EL KEMİĞİNE bakar.
 * Kol tam gövdenin önündeyse (yatay sapma yok) avuç normalinin yatay
 * bileşenine düşer — sabit/sahte bir eksen ASLA kullanılmaz.
 */
function outwardOf(
  hand: THREE.Object3D,
  reference: THREE.Object3D | null | undefined,
  out: THREE.Vector3,
): THREE.Vector3 {
  const handQuat = handWorldQuat(hand);
  out.set(0, 0, 0);
  if (reference) {
    reference.updateWorldMatrix(true, false);
    const handPos = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
    const refPos = new THREE.Vector3().setFromMatrixPosition(reference.matrixWorld);
    out.set(handPos.x - refPos.x, 0, handPos.z - refPos.z);
  }
  if (out.lengthSq() < 1e-6) {
    out.set(0, 0, 1).applyQuaternion(handQuat);
    out.y = 0;
  }
  if (out.lengthSq() < 1e-8) out.set(1, 0, 0);
  return out.normalize();
}

/**
 * Bombayı tutarken İSTENEN DÜNYA yönelimi: fünye düz yukarı değil, gövdeden
 * uzağa `BOMB_TILT_OUT_DEG` kadar yatıktır; fünyenin kendi eğimi (model +X) de
 * dışa bakar.
 *
 * NEDEN AYRI ve NEDEN HER KARE ÇAĞRILABİLİR: kol pozunu artık `BombArmPose`
 * IK ile sürüyor, yani elin dönüşü kare kare değişiyor. Yönelim elin ALTINA
 * el-yerel dondurulsaydı fünye elin dönüşüyle birlikte savrulur ve top-down
 * kamerada okunmaz hâle gelirdi. Bu yüzden fünye DÜNYA yönelimine kilitlenir ve
 * çağıran bunu her karede yeniden hesaplayabilir (uydurma sabit eksen yok;
 * yön yine ölçülen `outward`tan gelir). Kapsayıcıya DOKUNMAZ.
 */
export function bombGripWorldQuat(
  hand: THREE.Object3D,
  reference?: THREE.Object3D | null,
): THREE.Quaternion {
  hand.updateWorldMatrix(true, false);
  const outward = outwardOf(hand, reference, new THREE.Vector3());

  const tilt = THREE.MathUtils.degToRad(BOMB_TILT_OUT_DEG);
  const fuse = new THREE.Vector3(0, 1, 0)
    .multiplyScalar(Math.cos(tilt))
    .addScaledVector(outward, Math.sin(tilt))
    .normalize();

  // Fünyenin kendi eğimi (model +X) dışa baksın: X'i fünyeye dik, yatay dışa
  // en yakın vektör olarak seç. Böylece "komik bomba" eğik fitili de doğru
  // tarafa yatar; modelin fitili hangi eksende çizilmişse aynı kural işler.
  const xAxis = outward.clone().addScaledVector(fuse, -outward.dot(fuse));
  if (xAxis.lengthSq() < 1e-8) xAxis.set(1, 0, 0).addScaledVector(fuse, -fuse.x);
  xAxis.normalize();
  const zAxis = new THREE.Vector3().crossVectors(xAxis, fuse).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(xAxis, fuse, zAxis),
  );
}

/**
 * Bomba kapsayıcısını CANLI el pozundan hizalar (kılıç kalibrasyonunun bomba
 * karşılığı). İki parçalıdır ve ikisi de el-yerel olarak saklanır, yani kol
 * salındığında top elden kaymaz:
 *
 *  1. **Konum** (`bombSeatLocal`): top avucun çukuruna oturur.
 *  2. **Yönelim** (`bombGripWorldQuat`): fünye gövdeden uzağa yatık, okunur.
 *
 * `reference`, "dışa" yönünü türetmek için kullanılan karakter köküdür (klon).
 *
 * DÖNÜŞ DEĞERİ: hesaplanan "istenen dünya yönelimi" de döner. Bomba elde sabit
 * durmadığı için (bkz. `engine/BombJuggle`) çağıran onu kullanır.
 */
export function calibrateBombGrip(
  hand: THREE.Object3D,
  grip: THREE.Object3D,
  reference?: THREE.Object3D | null,
): THREE.Quaternion {
  hand.updateWorldMatrix(true, false);

  // 1) Avuçta oturma: avuç çukurundan DIŞA (gövdeden uzağa) — bomba elin ve
  // gövdenin içinde kalmaz, MOBA prop'u gibi silüetin dışında durur.
  grip.position.copy(bombSeatLocal(hand, outwardOf(hand, reference, new THREE.Vector3())));

  // 2) Yönelim: fünye okunur dünyada kalsın.
  const desired = bombGripWorldQuat(hand, reference);
  grip.quaternion.copy(handWorldQuat(hand)).invert().multiply(desired);
  grip.updateMatrixWorld(true);
  return desired;
}

/**
 * Prosedürel bomba — `public/models/bomba.glb` yüklenene kadar (ve dosya
 * bulunamazsa kalıcı olarak) eli boş bırakmaz. AYNI model uzayında üretilir:
 * gövde yarıçapı 1, fünye +Y, parlayan uç y ≈ 1.62. Böylece ölçek/hizalama
 * kodu GLB ile birebir aynıdır.
 */
export function buildStructuralBomb(): THREE.Group {
  const bomb = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: "#2a2d34", metalness: 0.72, roughness: 0.34,
    emissive: "#12161c", emissiveIntensity: 0.35,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: "#c9952f", metalness: 0.85, roughness: 0.28,
    emissive: "#6d4c0d", emissiveIntensity: 0.3,
  });
  const fuseMat = new THREE.MeshStandardMaterial({
    color: "#6b4a2a", metalness: 0.05, roughness: 0.9,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    name: BOMB_FUSE_MATERIAL,
    color: "#ff9a2e", metalness: 0, roughness: 0.5,
    emissive: "#ff7a18", emissiveIntensity: BOMB_FUSE_EMISSIVE,
    toneMapped: false,
  });

  // Gövde: hafif basık küre (GLB ile aynı ölçü).
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), bodyMat);
  body.scale.y = 0.96;
  bomb.add(body);

  // Ekvator + üst halka: pirinç bilezikler.
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.985, 0.055, 6, 20), brassMat);
  belt.rotation.x = Math.PI / 2;
  bomb.add(belt);
  const upper = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.045, 6, 18), brassMat);
  upper.rotation.x = Math.PI / 2;
  upper.position.y = 0.62;
  bomb.add(upper);

  // Boyun/kapak: fitilin çıktığı bilezik.
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.42, 0.26, 12),
    brassMat,
  );
  collar.position.y = 1.02;
  bomb.add(collar);

  // Fitil: hafif eğik ip.
  const fuse = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.075, 0.52, 8),
    fuseMat,
  );
  fuse.rotation.z = 0.16;
  fuse.position.set(0.03, 1.36, 0);
  bomb.add(fuse);

  // Yanan uç + kıvılcım: bloom'u besleyen iki küçük parlak parça.
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 6), glowMat);
  tip.position.set(0.075, 1.62, 0);
  bomb.add(tip);
  const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), glowMat);
  spark.position.set(0.14, 1.74, 0.03);
  bomb.add(spark);

  return bomb;
}

/* ── Debug: hand joint markers (?handDebug=1) ───────────────────── */

/**
 * Marks every right-hand joint with a colored sphere so the grip math can
 * be verified in-game. Enabled ONLY with ?handDebug=1 in the URL — the
 * old sticky localStorage flag kept painting colored spheres on the hand
 * forever, which polluted the character look long after debugging ended.
 * Colors: red = hand origin, yellow = thumb chain, cyan = fingers,
 * magenta = palm center (where the sword grip sits).
 * Returns null when the debug flag is off.
 */
export function markHandJoints(clone: THREE.Object3D): THREE.Group | null {
  if (typeof window === "undefined") return null;
  const sp = new URLSearchParams(window.location.search);
  if (sp.get("handDebug") !== "1") return null;

  const group = new THREE.Group();
  group.name = "_handDebugMarkers";
  const mark = (bone: THREE.Object3D, color: string, radius: number) => {
    // Author size in WORLD units: scale each sphere by 1/boneWorldScale.
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshBasicMaterial({ color, depthWrite: false }),
    );
    const ws = handBoneScale(bone);
    s.scale.setScalar(radius / ws);
    s.userData.isEquipment = true;
    s.frustumCulled = false;
    bone.add(s);
  };

  const hand = rightHandBone(clone);
  if (!hand) return group;
  mark(hand, "#ff3355", 0.05);
  for (const bone of fingerBonesOf(hand)) {
    mark(bone, /thumb/i.test(bone.name) ? "#ffd23c" : "#39c6ff", 0.028);
  }
  // Palm center marker (magenta) — where the grip band should land.
  const palm = new THREE.Mesh(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshBasicMaterial({ color: "#ff3ce0", depthWrite: false }),
  );
  palm.scale.setScalar(0.06 / handBoneScale(hand));
  palm.position.copy(palmCenterLocal(hand));
  palm.userData.isEquipment = true;
  palm.frustumCulled = false;
  hand.add(palm);
  return group;
}

/* ── Structural fingers ─────────────────────────────────────────── */

/**
 * Many skin rigs ship little to no modeled finger geometry — rotating
 * the finger BONES (applyFingerGrip) then moves nothing visible, so the
 * fist never reads as "gripping". This builds simple segmented fingers
 * as meshes PARENTED TO THE BONE CHAIN: they follow every animation and
 * the closed-grip pose renders a real fist around the sword hilt.
 *
 * Segment lengths come from the rig itself (each joint's bone child
 * position), so proportions match any skeleton — suffix-tolerant lookup
 * covers rigs like moda-savasci.glb (Index1_00…) that only expose one
 * finger chain.
 *
 * Returns the created meshes (caller adds them to the cleanup list).
 *
 * `handBone` verilirse o el için kurulur (bomba her iki elde de gezdiği için
 * iki el de parmak geometrisi ister); verilmezse yalnız sağ el.
 */
export function buildFingerMeshes(
  clone: THREE.Object3D,
  handBone?: THREE.Object3D | null,
): THREE.Mesh[] {
  const hand = handBone ?? rightHandBone(clone);
  if (!hand) return [];
  const glove = new THREE.MeshStandardMaterial({
    color: "#6b4527", roughness: 0.75, metalness: 0.08,
  });
  const knuckle = new THREE.MeshStandardMaterial({
    color: "#7a5230", roughness: 0.7, metalness: 0.08,
  });
  const created: THREE.Mesh[] = [];

  for (const bone of fingerBonesOf(hand)) {
    // Segment length = distance to the next joint (child bone position).
    const next = bone.children.find(
      (c) => (c as THREE.Bone).isBone && !/_?end$/i.test(c.name),
    );
    const segLen = next
      ? next.position.length()
      : Math.max(bone.position.length() * 0.8, 2.0); // tip segment
    const isThumb = /thumb/i.test(bone.name);
    const phalanx = phalanxOf(bone.name);
    const radius = (isThumb ? 0.95 : 0.82) * (next ? (phalanx === 1 ? 1 : 0.9) : 0.8);

    const seg = new THREE.Mesh(
      new THREE.CapsuleGeometry(radius, Math.max(segLen - radius * 1.6, 0.4), 4, 8),
      next ? glove : knuckle,
    );
    // Bones run along local +Y (Mixamo): span from this joint toward the child.
    seg.position.y = segLen / 2;
    // Parmak meshleri normal depth-test ile çizilir (renderOrder YOK):
    // böylece kılıç sapını sararak "tutuyor" görünürler, kılıç üstlerini
    // kapatmaz. Palm segmentleri kavrama bandının (modelY 0.12) hemen
    // üstünde biter — sap içte, parmaklar önde.
    seg.userData.isEquipment = true;
    seg.frustumCulled = false;
    bone.add(seg);
    created.push(seg);
  }
  return created;
}
