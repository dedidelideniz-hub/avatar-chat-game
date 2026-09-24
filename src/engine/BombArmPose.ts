// 🤹 BombArmPose — bombanın atılıp tutulmasını taşıyan KOL hareketi.
//
// SORUN (kullanıcı geri bildirimi): "Bomba oynuyor fakat kolları oynamıyor."
// Bomba elden ele geçerken iki el de idle klibinin bıraktığı yerde (kalça
// hizasında) duruyordu; top iki SABİT elin arasında süzülen bir küre gibi
// okunuyordu. Bombanın konumu el kemiklerinden türetildiği için kollar
// hareket etmedikçe atış da "havada asılı" görünür.
//
// ÇÖZÜM: her karede iki kol da HEDEF EL NOKTALARINA iki-kemik IK ile getirilir.
// Hedefler `BombJuggle` fazından sürülür:
//
//   ▸ tutan el    : topu göğüs önünde taşır, yakaladıktan sonra kısa bir
//                   "emiş" ile alçalıp toparlar,
//   ▸ fırlatan el : bırakıştan hemen sonra yükselir (takip), sonra iner,
//   ▸ yakalayan el: top gelirken uzanır, varış anında en yüksektedir.
//
// Bomba konumu bu pozdan SONRA okunduğu için (bkz. `SamuraiBomb` kare döngüsü)
// atış ile kol KENDİLİĞİNDEN senkron kalır — ayrı bir animasyon klibi, kemik
// eğrisi ya da zaman çizelgesi yok.
//
// NEDEN IK (sabit açı değil): hedef bir AÇI değil NOKTA'dır. Kemik eksenleri
// rig'den rig'e değişir; "şu eksende +0.3 rad" bir modelde kolu kaldırır,
// diğerinde burkar (aynı gerekçeyle `BattleStance` da açı yerine ölçüm yapar).
// IK ise yalnızca dünya konumlarıyla çalışır: kol boyları kemik konumlarından
// okunur, hedefe oturtulur. Sonuç: el TAM hedeflenen yerde olur, bomba avuçtan
// kaymaz ve top ekranda kalça hizasında asılı kalmaz.
//
// DİRSEK YÖNÜ: dirsek, karakterin KENDİ yan ekseninden türetilir (aşağı + dışa
// + hafif geriye) ve her karede hedef yönüne dik bileşeni alınır. Sabit bir
// dünya ekseni varsaymak kraliyet savaşçısı gibi ters çizilmiş rig'lerde
// dirseği gövdenin içine kıvırırdı; dinlenme pozundan ölçmek ise idle'da kol
// neredeyse düz olduğu için gürültülü bir sonuç verirdi.
//
// KAPSAM: yalnızca görsel katman. Klip çalmaya devam eder (bacaklar/gövde
// animasyonu bozulmaz); bu modül SADECE iki kol zincirini (üst kol + ön kol)
// hedefler ve klibi kesmez — animasyon kemikleri yazdıktan SONRA çalışır.
import * as THREE from "three";
import { JUGGLE_HOLD_FRAC, type JuggleSample } from "./BombJuggle";
import { leftHandBone, rightHandBone } from "./HandGrip";

/** Model uzayında yukarı (karakter +Y üzerinde durur). */
const WORLD_UP = new THREE.Vector3(0, 1, 0);
/**
 * Model uzayında karakterin BAKTIĞI yön.
 *
 * Samuray / Şövalye / `character.glb` +Z'ye bakar (bkz. Arena3D `FORWARD_POS_Z`
 * ve `BattleStance`); kraliyet savaşçısı ters çizilmiştir ama bomba katmanı ona
 * hiç bağlanmaz (`SamuraiBomb → BOMB_SKIN_URLS`), yani bu sabit güvenli.
 */
const MODEL_FORWARD = new THREE.Vector3(0, 0, 1);

/* ── Temel (taşıma) pozu — ölçüler KOL BOYUNUN katı ─────────────── */

/** Ellerin omuzdan öne açılması. Göğsün önünde, gövdeye değmeyecek kadar. */
const BASE_FORWARD = 0.55;
/** Ellerin merkeze doğru çekilmesi (iki el gövdenin önünde buluşur). */
const BASE_IN = 0.12;
/** Omuz hizasının biraz altı — top göğsün önünde, göz hizasında okunur. */
const BASE_DOWN = 0.1;
/** Temel hedefin erişim sınırı (kol boyunun katı) — dirsek hep bükülü kalsın. */
const BASE_MAX = 0.82;

/* ── Atış/yakalama modülasyonu ──────────────────────────────────── */

/** Yükselen elin yukarı ve öne gidişi (kol boyunun katı). */
const LIFT_UP = 0.35;
const LIFT_FORWARD = 0.2;
/** Tutuş boyunca hafif salınım — poz donuk durmasın (karşı fazlı iki el). */
const SWAY_AMOUNT = 0.045;
const SWAY_SPEED = 1.9;
/** Yakalama "emişi": tutan el yakaladıktan sonra bir an alçalır. */
const CATCH_DIP = 0.16;
const CATCH_DIP_CENTER = 0.18;
const CATCH_DIP_SPAN = 0.2;
/** Emişin giriş rampası: yakalama ANINDA sıfırdan başlamalı (bkz. aşağıda). */
const CATCH_DIP_RISE = 0.08;
/** Fırlatan elin takibi: bırakıştan bu kadar sonra tepe yapar. */
const THROW_PEAK = 0.15;
const THROW_SPAN = 0.18;
/** Takip tepesinin yükselme süresi (bırakış anında sıfırdan başlar). */
const THROW_RISE = 0.09;
/** Uçuşun sonundan bu kadar önce yakalayan el uzanmaya başlar. */
const APPROACH_START = 0.24;

/** Dirsek yönü karışımı (aşağı / dışa / geriye), karakterin kendi eksenlerinde. */
const POLE_DOWN = 0.6;
const POLE_OUT = 0.7;
const POLE_BACK = 0.15;

/** Bir kolun IK zinciri (kemik orijinleri) + ölçülen segment boyları. */
export interface BombArmChain {
  shoulder: THREE.Object3D;
  upper: THREE.Object3D;
  fore: THREE.Object3D;
  hand: THREE.Object3D;
  /** Omuz-üst kol ucu (dirsek) uzunluğu — model birimi. */
  l1: number;
  /** Dirsek-el uzunluğu — model birimi. */
  l2: number;
  /** Dirseğin savrulacağı yön ipucu (model uzayı, birim vektör). */
  pole: THREE.Vector3;
}

export interface BombArmRig {
  right: BombArmChain;
  left: BombArmChain;
  /** Taşıma pozundaki el noktaları (model uzayı). */
  baseRight: THREE.Vector3;
  baseLeft: THREE.Vector3;
  /** Kol boyu (l1 + l2) — tüm ötelemeler bunun katı. */
  reach: number;
  /** Karakterin kendi ileri ekseni (model uzayı). */
  forward: THREE.Vector3;
}

/* ── Geçici vektörler (kare başına çöp yok) ─────────────────────── */

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const vDir = new THREE.Vector3();
const vPole = new THREE.Vector3();
const vElbow = new THREE.Vector3();
const vTarget = new THREE.Vector3();
const vTargetR = new THREE.Vector3();
const vTargetL = new THREE.Vector3();
const vBone = new THREE.Vector3();
const vChild = new THREE.Vector3();
const vNow = new THREE.Vector3();
const vWant = new THREE.Vector3();
const vBasisX = new THREE.Vector3();
const vBasisY = new THREE.Vector3();
const vBasisZ = new THREE.Vector3();
const mBasis = new THREE.Matrix4();
const qRot = new THREE.Quaternion();
const qParent = new THREE.Quaternion();
const qLocal = new THREE.Quaternion();

const cleanName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Kemik düğümünü KÖK-GÖRELİ (model uzayı) konuma çevirir. */
function localPos(
  clone: THREE.Object3D,
  node: THREE.Object3D,
  out: THREE.Vector3,
): THREE.Vector3 {
  node.getWorldPosition(out);
  return clone.worldToLocal(out);
}

/**
 * Düğümün ÖLÇEKTEN ARINDIK dünya rotasyonu. `getWorldQuaternion` ölçekli
 * matrisi ayrıştırdığı için (kemiklerde eksen başına ölçek var) yanlış sonuç
 * verebilir; burada taban vektörleri normalize edilip öyle okunur —
 * `HandGrip.handWorldQuat` ile aynı kural.
 */
function parentWorldQuat(node: THREE.Object3D, out: THREE.Quaternion): THREE.Quaternion {
  node.updateWorldMatrix(true, false);
  const e = node.matrixWorld.elements;
  const sx = Math.hypot(e[0], e[1], e[2]) || 1;
  const sy = Math.hypot(e[4], e[5], e[6]) || 1;
  const sz = Math.hypot(e[8], e[9], e[10]) || 1;
  vBasisX.set(e[0] / sx, e[1] / sx, e[2] / sx);
  vBasisY.set(e[4] / sy, e[5] / sy, e[6] / sy);
  vBasisZ.set(e[8] / sz, e[9] / sz, e[10] / sz);
  mBasis.makeBasis(vBasisX, vBasisY, vBasisZ);
  return out.setFromRotationMatrix(mBasis);
}

/**
 * `bone`u, çocuğu `target` noktasına bakacak şekilde döndürür.
 *
 * Matematik: b'nin dünya yönelimi Qp·q. İstenen, dünyada R (now → want) kadar
 * dönmüş hâli: R·Qp·q = Qp·X·q ⇒ X = Qp⁻¹·R·Qp. Yani dünya uzayındaki dönüş
 * ebeveyn uzayına eşlenir ve `premultiply` ile mevcut poZUN ÜSTÜNE biner.
 */
function aimBone(
  clone: THREE.Object3D,
  bone: THREE.Object3D,
  child: THREE.Object3D,
  target: THREE.Vector3,
): void {
  const parent = bone.parent;
  if (!parent) return;
  localPos(clone, bone, vBone);
  localPos(clone, child, vChild);
  vNow.copy(vChild).sub(vBone);
  vWant.copy(target).sub(vBone);
  if (vNow.lengthSq() < 1e-12 || vWant.lengthSq() < 1e-12) return;
  vNow.normalize();
  vWant.normalize();
  qRot.setFromUnitVectors(vNow, vWant);
  parentWorldQuat(parent, qParent);
  qLocal.copy(qParent).invert().multiply(qRot).multiply(qParent);
  bone.quaternion.premultiply(qLocal);
}

/**
 * İki kemikli zinciri (omuz → dirsek → el) hedefe oturtarır: önce dirseğin
 * yeri kosinüs teoremiyle bulunur, sonra üst kol dirseğe, ön kol hedefe
 * nişanlanır. Erişim dışındaki hedef kırpılır (kol gergin uzanır, kopmaz).
 */
function solveArm(clone: THREE.Object3D, chain: BombArmChain, target: THREE.Vector3): void {
  vTarget.copy(target);
  localPos(clone, chain.upper, vA);
  localPos(clone, chain.fore, vB);
  localPos(clone, chain.hand, vC);

  vDir.copy(vTarget).sub(vA);
  let d = vDir.length();
  if (d < 1e-6) {
    // Hedef tam omzun üstünde: yönü mevcut kol ekseninden al.
    vDir.copy(vC).sub(vA);
    d = vDir.length();
    if (d < 1e-6) return;
  }
  vDir.divideScalar(d);

  const { l1, l2 } = chain;
  const maxD = Math.max((l1 + l2) * 0.995, 1e-6);
  const minD = Math.min(Math.max(Math.abs(l1 - l2) * 1.3, 1e-6), maxD * 0.8);
  d = THREE.MathUtils.clamp(d, minD, maxD);

  // Dirsek yönü: ipucunun hedefe DİK bileşeni (dirseğin savrulacağı taraf).
  vPole.copy(chain.pole).addScaledVector(vDir, -chain.pole.dot(vDir));
  if (vPole.lengthSq() < 1e-9) vPole.set(0, -1, 0).addScaledVector(vDir, vDir.y);
  if (vPole.lengthSq() < 1e-9) vPole.set(1, 0, 0).addScaledVector(vDir, -vDir.x);
  vPole.normalize();

  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const alpha = Math.acos(cosA);
  vElbow
    .copy(vA)
    .addScaledVector(vDir, Math.cos(alpha) * l1)
    .addScaledVector(vPole, Math.sin(alpha) * l1);

  aimBone(clone, chain.upper, chain.fore, vElbow);
  // Kırpılmış hedefe nişanla: el tam olarak hedefte (erişilebilirse) durur.
  vTarget.copy(vA).addScaledVector(vDir, d);
  aimBone(clone, chain.fore, chain.hand, vTarget);
}

function findSideBone(
  clone: THREE.Object3D,
  side: "left" | "right",
  match: (name: string) => boolean,
): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  clone.traverse((node) => {
    if (found || !(node as THREE.Bone).isBone) return;
    const name = cleanName(node.name);
    if (!match(name)) return;
    const isLeft = name.includes("left") || name.endsWith("l");
    const isRight = name.includes("right") || name.endsWith("r");
    if (side === "left" ? isLeft : isRight) found = node;
  });
  return found;
}

/** Üst kol: "arm" içerir ama omuz/ön kol/el DEĞİL (`…ForeArm`/`…Shoulder`). */
const UPPER_ARM = (name: string) =>
  name.includes("arm") &&
  !name.includes("fore") &&
  !name.includes("shoulder") &&
  !name.includes("hand");
/** Ön kol: Mixamo `ForeArm`; "arm"+"fore" yazan türevler de yakalanır. */
const FORE_ARM = (name: string) => name.includes("forearm") || (name.includes("arm") && name.includes("fore"));
const SHOULDER = (name: string) => name.includes("shoulder");

/**
 * İskeletten iki kol zincirini çözer ve ölçer. El kemiği bilerek
 * `HandGrip`in çözücülerinden alınır: bomba kapsayıcısı TAM O kemiğe bağlıdır,
 * yani IK hedefi ile topun oturduğu kemik aynı olmak zorundadır.
 *
 * `null` dönerse (zincir eksik) çağıran katman kol pozunu tamamen atlar —
 * bomba yine çalışır, yalnızca eski "iki el arasında" hâline döner.
 */
export function findBombArmRig(clone: THREE.Object3D): BombArmRig | null {
  const rightHand = rightHandBone(clone);
  const leftHand = leftHandBone(clone);
  if (!rightHand || !leftHand) return null;
  const rightShoulder = findSideBone(clone, "right", SHOULDER);
  const leftShoulder = findSideBone(clone, "left", SHOULDER);
  const rightUpper = findSideBone(clone, "right", UPPER_ARM);
  const leftUpper = findSideBone(clone, "left", UPPER_ARM);
  const rightFore = findSideBone(clone, "right", FORE_ARM);
  const leftFore = findSideBone(clone, "left", FORE_ARM);
  if (!rightShoulder || !leftShoulder || !rightUpper || !leftUpper) return null;
  if (!rightFore || !leftFore) return null;

  clone.updateWorldMatrix(true, false);
  clone.updateMatrixWorld(true);

  // Yan eksen: sağ omuzdan sol omuza. Model uzayında yukarı zaten +Y olduğu
  // için ileri eksen bu yan eksene dikleştirilir (uydurma eksen yok).
  localPos(clone, rightShoulder, vA);
  localPos(clone, leftShoulder, vB);
  const lateralAxis = vC.copy(vA).sub(vB).setY(0);
  if (lateralAxis.lengthSq() < 1e-10) return null;
  lateralAxis.normalize();
  // Kopya: geçici vektörler aşağıdaki ölçümlerde tekrar kullanılıyor.
  const lateral = lateralAxis.clone();
  const forward = MODEL_FORWARD.clone().addScaledVector(lateral, -MODEL_FORWARD.dot(lateral));
  if (forward.lengthSq() < 1e-10) return null;
  forward.normalize();

  const rightPos = vA.clone();
  const leftPos = vB.clone();
  // SEGMENT BOYLARI: IK zinciri omuzdan değil ÜST KOLDAN başlar (omuz kemiği
  // zincirin dışında kalır; onu da katmak dirseği yanlış yere koyardı).
  const segLen = (
    upper: THREE.Object3D,
    fore: THREE.Object3D,
    hand: THREE.Object3D,
  ): [number, number] => {
    const upperPos = localPos(clone, upper, new THREE.Vector3());
    const forePos = localPos(clone, fore, new THREE.Vector3());
    const handPos = localPos(clone, hand, new THREE.Vector3());
    return [forePos.distanceTo(upperPos), handPos.distanceTo(forePos)];
  };
  const [rightL1, rightL2] = segLen(rightUpper, rightFore, rightHand);
  const [leftL1, leftL2] = segLen(leftUpper, leftFore, leftHand);
  const reach = (rightL1 + rightL2 + leftL1 + leftL2) / 2;
  if (!(reach > 1e-4)) return null;

  // Dirsek ipucu: aşağı + dışa + hafif geriye. `sign` sağ el +1, sol el -1
  // (yan eksen sağa bakar), yani her iki el de kendi dışına doğru kırılır.
  const poleOf = (sign: number) =>
    new THREE.Vector3()
      .addScaledVector(WORLD_UP, -POLE_DOWN)
      .addScaledVector(lateral, sign * POLE_OUT)
      .addScaledVector(forward, -POLE_BACK)
      .normalize();
  const chain = (
    shoulder: THREE.Object3D,
    upper: THREE.Object3D,
    fore: THREE.Object3D,
    hand: THREE.Object3D,
    l1: number,
    l2: number,
    sign: number,
  ): BombArmChain => ({ shoulder, upper, fore, hand, l1, l2, pole: poleOf(sign) });

  const clampToReach = (shoulder: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 => {
    const offset = target.clone().sub(shoulder);
    const dist = offset.length();
    const max = reach * BASE_MAX;
    if (dist > max && dist > 1e-9) offset.multiplyScalar(max / dist);
    return shoulder.clone().add(offset);
  };
  // Taşıma noktası: omuzdan öne, merkeze doğru, biraz aşağı.
  const baseOf = (shoulder: THREE.Vector3, sign: number): THREE.Vector3 =>
    clampToReach(
      shoulder,
      shoulder
        .clone()
        .addScaledVector(forward, reach * BASE_FORWARD)
        .addScaledVector(lateral, -sign * reach * BASE_IN)
        .addScaledVector(WORLD_UP, -reach * BASE_DOWN),
    );

  return {
    right: chain(rightShoulder, rightUpper, rightFore, rightHand, rightL1, rightL2, 1),
    left: chain(leftShoulder, leftUpper, leftFore, leftHand, leftL1, leftL2, -1),
    baseRight: baseOf(rightPos, 1),
    baseLeft: baseOf(leftPos, -1),
    reach,
    forward,
  };
}

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Gauss tepesi — fazın belli bir anında yükselip sönen hareketler için. */
const bump = (x: number, center: number, span: number): number =>
  Math.exp(-Math.pow((x - center) / span, 2));

/**
 * Kol pozunu uygular. `sample` YALNIZCA faz alanlarını taşımalıdır
 * (`sampleJuggleTiming`); konum alanları burada kullanılmaz.
 *
 * Sıra önemli: bu fonksiyon avuç noktaları okunmadan ÖNCE çağrılmalıdır, yoksa
 * bomba bir önceki karenin kol pozisyonuna göre yerleşir (bir kare gecikme).
 */
export function applyBombArmPose(
  clone: THREE.Object3D,
  rig: BombArmRig,
  sample: JuggleSample,
  time: number,
): void {
  const hf = JUGGLE_HOLD_FRAC;
  const u = THREE.MathUtils.clamp(sample.legT, 0, 1);
  const holdU = Math.min(1, u / hf);

  /** Tutan el: yakalamadan sonra 1'den 0'a iner (topu taşıma noktasına indirir). */
  const holdLift = u < hf ? 1 - holdU : 0;
  // Fırlatan el: bırakış sonrası takip yükselmesi. Tepenin BIRAKIŞ ANINDA
  // sıfırdan başlaması şart (ramp), yoksa tutuştan çıkışta el bir karede
  // 0.13 birim zıplar — ölçümle yakalandı: kare başına maksimum hareket
  // 0.153 çıkmıştı; ramptan sonra en büyük adım 0.075'e indi ve artık
  // SÜREKLİ (tepe hâlâ keskin, ama zıplama değil: gerçek takip hareketi).
  const throwLift =
    u > hf ? bump(u, hf + THROW_PEAK, THROW_SPAN) * smoothstep(hf, hf + THROW_RISE, u) : 0;
  /** Yakalayan el: varışta en yüksekte olacak şekilde uzanır. */
  const reachLift = u > hf ? smoothstep(hf + APPROACH_START, 1, u) : 0;
  // Yakalama emişi: tutan el topu yakalayınca bir an alçalır. Girişi RAMPALI:
  // uçuş fazında emiş hiç uygulanmaz (0), yani yakalama anında sıfırdan
  // başlamazsa el bir karede ~0.06 birim düşer.
  const dip =
    u < hf
      ? CATCH_DIP *
        bump(holdU, CATCH_DIP_CENTER, CATCH_DIP_SPAN) *
        smoothstep(0, CATCH_DIP_RISE, holdU)
      : 0;

  // Bacak yönü: +1 ise `from` = SAĞ el (bkz. BombJuggle.direction). Bu bacakta
  // sağ el fırlatır/tutar, sol el yakalar; sonraki bacakta roller döner.
  const fromIsRight = sample.direction > 0;
  const liftRight = fromIsRight ? Math.max(holdLift, throwLift) : reachLift;
  const liftLeft = fromIsRight ? reachLift : Math.max(holdLift, throwLift);
  const dipRight = fromIsRight ? dip : 0;
  const dipLeft = fromIsRight ? 0 : dip;

  // Karşı fazlı hafif salınım: iki el aynı anda aynı yöne kaymasın (robotik durur).
  const sway = Math.sin(time * SWAY_SPEED) * SWAY_AMOUNT;

  // DİKKAT: hedef vektörleri `solveArm` içindeki geçici vektörlerle
  // PAYLAŞILAMAZ (solveArm onların içini kullanır) — ayrı tamponlar.
  vTargetR
    .copy(rig.baseRight)
    .addScaledVector(rig.forward, (liftRight * LIFT_FORWARD + sway) * rig.reach)
    .addScaledVector(WORLD_UP, (liftRight * LIFT_UP - dipRight) * rig.reach);
  vTargetL
    .copy(rig.baseLeft)
    .addScaledVector(rig.forward, (liftLeft * LIFT_FORWARD - sway) * rig.reach)
    .addScaledVector(WORLD_UP, (liftLeft * LIFT_UP - dipLeft) * rig.reach);

  solveArm(clone, rig.right, vTargetR);
  solveArm(clone, rig.left, vTargetL);
}
