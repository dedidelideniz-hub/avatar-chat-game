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
// HEDEFLER OMUZDAN SÜRÜLÜR (`carryRight`/`carryLeft` ofsetleri): sabit bir
// model noktası hedef olsaydı yürüyüşün dikey salınımı sırasında gövde
// yaylanırken eller (ve onlara bağlı bomba) havada asılı kalırdı — "tepsi
// taşıyan karakter" görüntüsü. Omuz her karede canlı okunur ve ölçülen avuç
// ofseti ona eklenir: eller gövdeyle birlikte yaylanır, göğüs önü geometrisi
// ise aynı kalır.
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
// animasyonu bozulmaz); bu modül SADECE iki kol zincirini (üst kol + ön kol) ve
// kavrayan PARMAKLARI hedefler, klibi kesmez — animasyon kemikleri yazdıktan
// SONRA çalışır.
//
// ✊ PARMAK KAVRAMASI (`applyFingerGrip`): `skin-samuray.glb`nin Idle/Walk/Run
// klipleri parmak kemiklerini de (Index1-3, iki elde) sürmektedir. Kavrama pozu
// bir kez, katman kurulurken verildiğinde ilk `mixer.update` onu siler — yani
// eller bombayı tutmaz, açık parmaklı kalır ve top elde değil, elin ÖNÜNDE
// duran bir küre gibi okunur. Bu yüzden kavrama HER KAREDE, animasyon kemikleri
// yazdıktan sonra tazelenir (klibin parmak animasyonu bilinçli olarak ezilir:
// hokkabazlık sırasında el sabit bir kavrama pozunda olmalıdır).
//
// Kavrama MİKTARI da fazdan sürülür: fırlatan el bırakıştan sonra açılır,
// yakalayan el top gelirken açılır ve top avuca değdiği anda kapanır. Yani
// parmaklar da top ve kol ile AYNI fazı okur (üçü ayrı ayrı senkronlanmaz).
import * as THREE from "three";
import { JUGGLE_HOLD_FRAC, type JuggleSample } from "./BombJuggle";
import {
  BOMB_FINGER_GRIP,
  applyFingerGrip,
  leftHandBone,
  rightHandBone,
} from "./HandGrip";

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

/* ── Parmak kavraması (atışla senkron) ──────────────────────────── */

/** Bırakış/yakalama anında parmakların açılma oranı (taban kavramanın katı). */
const GRIP_OPEN = 0.62;
/** Fırlatan el: açılmanın bırakıştan sonra tamamlanma süresi (leg oranı). */
const THROW_OPEN_RISE = 0.07;
/** Açılmanın tepe noktası (bırakıştan sonra) ve sönme genişliği. */
const THROW_OPEN_PEAK = 0.12;
const THROW_OPEN_SPAN = 0.2;
/** Yakalayan el: uçuşun sonundan bu kadar önce parmaklar açılmaya başlar. */
const CATCH_OPEN_START = 0.3;
/** Yakaladıktan sonra kapanışın tamamlanma süresi (tutuş oranı). */
const CATCH_CLOSE_SPAN = 0.18;

/* ── 🧨 Tek seferlik aksiyonlar (fırlatma / yere bırakma) ─────────── */

/** Fırlatma: hazırlık evresinin bitişi (aksiyon oranı). */
const THROW_WINDUP_END = 0.34;
/**
 * Hazırlık: el omzun ARKASINDA ve YUKARISINDA (kol boyunun katı, taşıma
 * noktasına eklenir).
 *
 * NEDEN 0.58 (eskiden 0.50): bomba AĞIR bir cisimdir; hazırlıkta el göğüs
 * hizasında kalırsa atış "avucu açıp bırakma" gibi okunur. Kol boyunun
 * %58'i kadar yükselen el, bombayı baş hizasının üstüne çıkarır ve savurma
 * için gerçek bir mesafe (dolayısıyla hız) kazandırır.
 */
const THROW_WINDUP_UP = 0.58;
const THROW_WINDUP_BACK = 0.46;
const THROW_WINDUP_OUT = 0.22;
/** Bırakış: el önde, göğüs hizasının biraz üstünde (kol savrulur). */
const THROW_RELEASE_FWD = 0.58;
const THROW_RELEASE_UP = 0.2;
const THROW_RELEASE_OUT = 0.06;
/** Takip: el gövdeyi geçip aşağı savrulur (gerçek atışta kol boşluğa düşer). */
const THROW_FOLLOW_FWD = 0.44;
const THROW_FOLLOW_DOWN = 0.34;
/**
 * Takibin bittiği ve hokkabazlığın tutuş başına dönüşün başladığı an.
 *
 * ÖLÇÜMLE SEÇİLDİ: 0.86'da dönüş penceresi yalnızca ~0.11 sn kaliyordu ve kol
 * kare başına 0.10 birim hareket ediyordu (hokkabazlığın kendi zirvesinin
 * ~3 katı, "kol geri savruluyor" gibi okunur). 0.78'de dönüş 0.18 sn'ye
 * çıkar, zirve 0.06 birime iner.
 */
const THROW_FOLLOW_END = 0.78;
/** Boştaki kol hedefi gösterir (atış boyunca). */
const THROW_AIM_FWD = 0.5;
const THROW_AIM_UP = 0.08;
/** Gövde: hazırlıkta geriye yaslanır, bırakışta öne kapanır (rad). */
const THROW_LEAN_BACK = 0.13;
const THROW_LEAN_FWD = 0.3;
/**
 * 🌀 GÖVDE BURULMASI (twist) — atışı "düz itiş"ten ayıran hareket.
 *
 * NEDEN GEREKLİ: omurga yalnızca öne/geriye bükülünce (bow) atış iki boyutlu
 * bir ittirme gibi okunuyordu. Gerçek bir savurmada gövde ATIŞ TARAFINA döner
 * (kol kurulur), bırakışta ters yöne açılarak kolun savrulmasını taşır. Twist
 * göğsü döndürdüğü için omuzları da taşır; kollar hedeflerini CANLI omuzdan
 * aldığı için animasyon kendiliğinden senkron kalır — kola ayrı düzeltme yok.
 *
 * İŞARET: model uzayında +Y çevresindeki pozitif dönüş, bakış yönünü (+Z)
 * karakterin SOLUNA (+X) çevirir. Sağ elle atışta hazırlık bu yüzden NEGATİF
 * (gövde atış koluna döner), bırakış pozitiftir; sol elle atışta işaret
 * `holdSign` ile aynalanır.
 */
const THROW_TWIST_BACK = 0.4;
const THROW_TWIST_FWD = 0.48;
/** Yere bırakmada gövdenin hafif dönüşü: el yere inerken omuz öne açılır. */
const PLACE_TWIST = 0.22;
/**
 * Savurmanın "kamçı" üssü (hazırlık → bırakış geçişi).
 *
 * 1 = simetrik yumuşatma (kol yavaşça hızlanır, yavaşça durur). 2 = kol uzun
 * süre KURULU kalır ve son anda boşalır: tepe açısal hız ~1.5 katına çıkar,
 * yörünge (hangi noktalardan geçtiği) değişmez. `bow` de aynı eğriyi okur,
 * böylece gövde kolu birebir takip eder.
 */
const WHIP_POW = 2;

/** Yere bırakma: el omuzdan aşağı iner (erişim sınırına yakın) ve öne uzanır. */
const PLACE_DOWN = 0.97;
const PLACE_FWD = 0.28;
const PLACE_OUT = 0.14;
/**
 * Elin TOPU BIRAKTIKTAN sonra geri yükselmeye başladığı an (düşüş oranı).
 *
 * NEDEN BIRAKIŞTAN HEMEN SONRA: el top yere inene kadar aşağıda beklemek
 * zorunda değil — parmaklar açıldıktan sonra kol doğrulmaya başlayabilir. Bekleme
 * zorlanınca geri çekilme penceresi ~0.15 sn'ye sıkışıyor ve kol kare başına
 * 0.16 birim hareket ediyordu (ölçüldü; hokkabazlığın zirvesi ~0.04).
 */
const PLACE_STAND_AT = 0.5;
/** Denge kolu: gövde eğilirken diğer kol geriye/dışa açılır. */
const PLACE_BALANCE_BACK = 0.26;
const PLACE_BALANCE_OUT = 0.1;
const PLACE_BALANCE_UP = 0.06;
/**
 * Gövdenin öne eğilmesi (rad) — omurga zincirine dağıtılır.
 *
 * 0.5 (eskiden 0.42): bomba yere bırakılırken karakterin üstten bakması, hem
 * "bıraktığı yeri görüyor" okumasını verir hem de omzu alçalttığı için kolun
 * yere yetişme payını büyütür (kalan boşluğu düşüş kapatır).
 */
const PLACE_BOW = 0.5;
/**
 * Bombanın ELDEN ÇIKIP YERE DEĞMESİ arasındaki süre (aksiyon oranı).
 *
 * Yere değme anı SİM'den gelir (`BombActionFrame.land`): tuzak tam o anda
 * doğar ve elde tutulan bomba gizlenir. Bu sabit yalnızca düşüşün NE ZAMAN
 * başlayacağını belirler — ikisi ayrı yerde yazılsaydı top yere değmeden tuzak
 * doğar (iki bomba) ya da top havada asılı kalırdı.
 */
export const PLACE_FALL_SPAN = 0.26;

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
  /** Taşıma pozundaki el noktaları (model uzayı, ÖLÇÜM ANINDAKİ omuz pozisyonuna göre). */
  baseRight: THREE.Vector3;
  baseLeft: THREE.Vector3;
  /**
   * Taşıma noktasının OMUZ orijinine göre ofseti (model uzayı).
   *
   * NEDEN OFSET (sabit nokta değil): hedefler mutlak bir model noktası
   * olsaydı gövde salındığında (yürüyüş dikey salınımı, nefes, öne eğilme)
   * eller havada asılı kalır, bomba da onlarla birlikte sabit yükseklikte
   * süzülen bir tepsi gibi okunurdu. Omuz her karede CANLI okunup ofset ona
   * eklenir; böylece eller ve bomba gövdeyle birlikte yaylanır (kol boyu ve
   * göğüs önü geometrisi ise değişmez — ofset ölçüm anındaki farktır).
   */
  carryRight: THREE.Vector3;
  carryLeft: THREE.Vector3;
  /** Kol boyu (l1 + l2) — tüm ötelemeler bunun katı. */
  reach: number;
  /** Karakterin kendi ileri ekseni (model uzayı). */
  forward: THREE.Vector3;
  /**
   * Yan eksen: SAĞ omuzdan SOL omuza bakar (model uzayı). "Dışa" yön her el
   * için `sign * lateral`tir (sağ el +1, sol el -1) — taşıma noktasının
   * hesabıyla aynı kural, böylece aksiyon pozları da gövdeden uzağa açılır.
   */
  lateral: THREE.Vector3;
  /**
   * Omurga zinciri KÖKTEN YUKARIYA (`Spine → Spine1 → Spine2`). Aksiyonlarda
   * gövdeyi öne/geriye bükmek için kullanılır: tek kemik yerine zincire
   * DAĞITILIR, yoksa omurga tek yerden kırılmış gibi görünür.
   */
  spineChain: THREE.Object3D[];
  /** Omurga bükme ekseni (model uzayı) ve ÖLÇÜLEN işareti. */
  bowAxis: THREE.Vector3;
  bowSign: number;
  /**
   * Ayak/parmak kemikleri (varsa).
   *
   * NEDEN BURADA: yere bırakılan bombanın NEREYE düşeceğini bilmek için
   * karakterin zemin yüksekliği gerekir (bomba yarıçapı kadar yukarıda durur).
   * Zemin, "model kökü y = 0" varsayımıyla DEĞİL, en alçak ayak kemiğinin canlı
   * dünya konumundan okunur — böylece gövde alçalıp yükselse de (duruş, eğilme)
   * top yere doğru yere iner. Kemik bulunamazsa çağıran sabit bir zemine düşer.
   */
  feet: THREE.Object3D[];
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
const vShoulderR = new THREE.Vector3();
const vShoulderL = new THREE.Vector3();
const vCarryR = new THREE.Vector3();
const vCarryL = new THREE.Vector3();
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
const qModelRoot = new THREE.Quaternion();

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

/** Gövde bükme işaretini ölçen deneme açısı (rad). */
const PROBE_BOW = 0.32;

/**
 * `bone`u, çocuğu `target` noktasına bakacak şekilde döndürür.
 *
 * Matematik: b'nin MODEL-uzayı yönelimi Qp·q. İstenen, model uzayında R
 * (now → want) kadar dönmüş hâli: R·Qp·q = Qp·X·q ⇒ X = Qp⁻¹·R·Qp. Yani MODEL
 * uzayındaki dönüş ebeveyn uzayına eşlenir ve `premultiply` ile mevcut pozun
 * ÜSTÜNE biner.
 *
 * ⚠️ EBEVEYN ROTASYONU MODEL UZAYINDA OLMALI. Hedefler ve ölçüler
 * `localPos` ile klonun YEREL uzayında okunuyor; dönüşü dünya eksenlerinde
 * uygulamak yalnızca klonun dünya rotasyonu birimken doğru olur. Oysa
 * karakter kökü oyunda sürekli döner (yürüme yönü). Ölçüm: yaw = π/2 iken el
 * olması gereken yerden 0.27 birim, yaw = π iken 0.88 birim sapıyordu (kol
 * boyu 0.62) — yani kol, karakter döndüğü anda hedefin tersine savruluyordu
 * ("kollar oynamıyor" geri bildiriminin kökü). Bu yüzden ebeveyn rotasyonu
 * klonun kendi rotasyonuyla modele çevrilir: Qp_model = Qklon⁻¹ · Qp_dünya.
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
  // Dünya → model: klonun saf rotasyonunun tersiyle soldan çarp.
  parentWorldQuat(clone, qModelRoot);
  qParent.premultiply(qModelRoot.invert());
  qLocal.copy(qParent).invert().multiply(qRot).multiply(qParent);
  bone.quaternion.premultiply(qLocal);
}

/**
 * Kemiği MODEL uzayında bir eksen çevresinde döndürür.
 *
 * Klibin yazdığı poz EZİLMEZ, üstüne binilir: mixer her karede kemikleri
 * yeniden yazdığı için premultiply edilen dönüş birikmez. `aimBone` ile AYNI
 * eşleme kullanılır — model uzayındaki R dönüşü, kemiğin ebeveyn uzayına
 * X = Qp⁻¹·R·Qp olarak taşınır (Qp = ebeveynin MODEL-uzayı yönelimi; klonun
 * rotasyonu oyunda sürekli değiştiği için dünya uzayından çevrilir).
 */
function rotateBoneModel(
  clone: THREE.Object3D,
  bone: THREE.Object3D,
  axisModel: THREE.Vector3,
  angle: number,
): void {
  const parent = bone.parent;
  if (!parent || !angle) return;
  qRot.setFromAxisAngle(axisModel, angle);
  parentWorldQuat(parent, qParent);
  parentWorldQuat(clone, qModelRoot);
  qParent.premultiply(qModelRoot.invert());
  qLocal.copy(qParent).invert().multiply(qRot).multiply(qParent);
  bone.quaternion.premultiply(qLocal);
}

/**
 * Omurgayı model uzayında `axis` çevresinde `angle` kadar büker (pozitif =
 * karakterin baktığı yöne doğru) ve açıyı zincire DAĞITIR: kök kemik en çok,
 * uçtaki en az döner. Tek kemikten bükmek omurgayı ortadan kırılmış gibi
 * gösterirdi; dağıtım hem ölçümde hem kare döngüsünde aynıdır.
 */
function applyBow(
  clone: THREE.Object3D,
  chain: THREE.Object3D[],
  axis: THREE.Vector3,
  angle: number,
): void {
  const n = chain.length;
  if (!n || !angle) return;
  const total = (n * (n + 1)) / 2;
  for (let i = 0; i < n; i++) {
    rotateBoneModel(clone, chain[i], axis, (angle * (n - i)) / total);
  }
}

/**
 * Omurgayı model uzayında `axis` çevresinde BURAR (twist) ve ağırlığı YUKARI
 * doğru ARTAN biçimde dağıtır: kalça neredeyse sabit kalır, burulmayı göğüs
 * taşır.
 *
 * NEDEN `applyBow` İLE AYNI DAĞITIM DEĞİL: bow kök ağırlıklıdır (aşağıdan
 * bükmek "belden eğilme" okuması verir). Twisted ise gövde kendi etrafında
 * döner ve dönüşü taşıması gereken yer omuzlardır: kalçadan burulsaydı ayaklar
 * da karakterle birlikte kaymış gibi görünürdü (yürüyüş klibi ayakları yere
 * sabitler, üst gövde döner).
 */
function applyTwist(
  clone: THREE.Object3D,
  chain: THREE.Object3D[],
  axis: THREE.Vector3,
  angle: number,
): void {
  const n = chain.length;
  if (!n || !angle) return;
  const total = (n * (n + 1)) / 2;
  for (let i = 0; i < n; i++) {
    rotateBoneModel(clone, chain[i], axis, (angle * (i + 1)) / total);
  }
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

  const baseRight = baseOf(rightPos, 1);
  const baseLeft = baseOf(leftPos, -1);

  // ── OMURGA ZİNCİRİ: omzun ataları arasından "spine" adlı kemikler, kökten
  // yukarıya sıralı. Ad kalıbı kullanılır (Mixamo `Spine/Spine1/Spine2`); hiç
  // bulunamazsa gövde bükülmesi atlanır, aksiyonlar yalnız kollarla oynar.
  const spineChain: THREE.Object3D[] = [];
  for (let node: THREE.Object3D | null = rightUpper; node; node = node.parent) {
    if ((node as THREE.Bone).isBone && cleanName(node.name).includes("spine")) {
      spineChain.unshift(node);
    }
  }

  // Ayak/parmak kemikleri: zemin referansı (bomba düşüşü kullanır).
  const feet: THREE.Object3D[] = [];
  clone.traverse((node) => {
    if (!(node as THREE.Bone).isBone) return;
    const name = cleanName(node.name);
    if (name.includes("foot") || name.includes("toe") || name.includes("ankle")) {
      feet.push(node);
    }
  });

  // Gövde eğilme ekseni: yan eksen (sağ→sol). İŞARET VARSAYILMAZ, ÖLÇÜLÜR —
  // aynı eksende ters yönde çizilmiş bir rig'de +açı gövdeyi geriye yatırırdı
  // (bkz. `BattleStance` → `pickTarget`, aynı gerekçe). Deneme dönüşü omurga
  // zincirine dağıtılır ve göğsün İLERİ gidip gitmediğine bakılır.
  const bowAxis = lateral.clone();
  let bowSign = 1;
  if (spineChain.length) {
    const chest = vA.clone().add(vB).multiplyScalar(0.5);
    const saved = spineChain.map((bone) => bone.quaternion.clone());
    applyBow(clone, spineChain, bowAxis, PROBE_BOW);
    clone.updateMatrixWorld(true);
    localPos(clone, rightShoulder, vA);
    localPos(clone, leftShoulder, vB);
    const probe = vA.add(vB).multiplyScalar(0.5).sub(chest);
    bowSign = probe.dot(forward) >= 0 ? 1 : -1;
    spineChain.forEach((bone, i) => bone.quaternion.copy(saved[i]));
    clone.updateMatrixWorld(true);
    localPos(clone, rightShoulder, vA);
    localPos(clone, leftShoulder, vB);
  }

  return {
    right: chain(rightShoulder, rightUpper, rightFore, rightHand, rightL1, rightL2, 1),
    left: chain(leftShoulder, leftUpper, leftFore, leftHand, leftL1, leftL2, -1),
    baseRight,
    baseLeft,
    carryRight: baseRight.clone().sub(rightPos),
    carryLeft: baseLeft.clone().sub(leftPos),
    reach,
    forward,
    lateral,
    spineChain,
    bowAxis,
    bowSign,
    feet,
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

  // Hedefler OMUZDAN türetilir: omuz canlı okunur (gövde salınımı/yürüyüş
  // yaylanması) ve ölçülen avuç ofseti ona eklenir. Sabit bir model noktası
  // kullanılsaydı gövde altında hareket ederken ellerle birlikte bomba da
  // havada asılı kalırdı.
  localPos(clone, rig.right.shoulder, vShoulderR);
  localPos(clone, rig.left.shoulder, vShoulderL);
  vCarryR.copy(rig.carryRight).add(vShoulderR);
  vCarryL.copy(rig.carryLeft).add(vShoulderL);

  // DİKKAT: hedef vektörleri `solveArm` içindeki geçici vektörlerle
  // PAYLAŞILAMAZ (solveArm onların içini kullanır) — ayrı tamponlar.
  vTargetR
    .copy(vCarryR)
    .addScaledVector(rig.forward, (liftRight * LIFT_FORWARD + sway) * rig.reach)
    .addScaledVector(WORLD_UP, (liftRight * LIFT_UP - dipRight) * rig.reach);
  vTargetL
    .copy(vCarryL)
    .addScaledVector(rig.forward, (liftLeft * LIFT_FORWARD - sway) * rig.reach)
    .addScaledVector(WORLD_UP, (liftLeft * LIFT_UP - dipLeft) * rig.reach);

  solveArm(clone, rig.right, vTargetR);
  solveArm(clone, rig.left, vTargetL);

  // ✊ PARMAKLAR: aynı fazdan sürülür. Fırlatan el bırakıştan hemen sonra
  // açılır (tepe bırakışın ~%12'si kadar sonra, girişi rampalı olduğu için
  // bırakış anında sıfırdan başlar → bir karede açılmaz), yakalayan el top
  // yaklaşırken açılır ve tutuşun başında kapanır (tutuş başındaki değer
  // uçuşun sonundaki değerle AYNI: 1 → döngü sınırında zıplama yok).
  const throwOpen =
    u > hf ? bump(u, hf + THROW_OPEN_PEAK, THROW_OPEN_SPAN) * smoothstep(hf, hf + THROW_OPEN_RISE, u) : 0;
  const catchOpen =
    u > hf
      ? smoothstep(1 - CATCH_OPEN_START, 0.97, u)
      : 1 - smoothstep(0, CATCH_CLOSE_SPAN, holdU);
  const gripRight = BOMB_FINGER_GRIP * (1 - GRIP_OPEN * (fromIsRight ? throwOpen : catchOpen));
  const gripLeft = BOMB_FINGER_GRIP * (1 - GRIP_OPEN * (fromIsRight ? catchOpen : throwOpen));
  applyFingerGrip(clone, gripRight, rig.right.hand);
  applyFingerGrip(clone, gripLeft, rig.left.hand);
}

/* ── 🧨 AKSİYON POZU (fırlatma / yere bırakma / boş el) ───────────── */

/**
 * Tek seferlik aksiyonun kemik katmanına girdisi.
 *
 * Hokkabazlık (`applyBombArmPose`) SÜREKLİ bir döngüdür; bunlar ise başı ve
 * sonu olan hareketlerdir — fırlatma (`throw`) ve yere bırakma (`place`)
 * sırasında döngü tamamen durur, sonra temiz bir başlangıçtan (`juggleTime = 0`)
 * devam eder. `empty` ise bomba elden çıktıktan sonraki ara hâldir: eller
 * taşıma noktasında durur, çünkü karakter o an bomba TAŞIMAZ.
 */
export interface BombActionPoseInput {
  kind: "throw" | "place" | "empty";
  /** Aksiyonun 0..1 ilerlemesi. */
  progress: number;
  /** Bombanın ELDEN ÇIKTIĞI ilerleme (bırakış/toprağa bırakma anı). */
  release: number;
  /** true → bomba SAĞ elde, yani aksiyonu yapan el sağdır. */
  right: boolean;
  /**
   * Aksiyona GİRİŞ harmanı: 0 = eski kol pozu, 1 = tam aksiyon pozu.
   *
   * NEDEN: yetenek hokkabazlığın ORTASINDA (top havadayken, el uzanmışken)
   * basılabilir. Poz bir karede aksiyonun başlangıcına atlarsa kol ve bomba
   * ışınlanmış gibi görünür; çağıran kısa bir rampa boyunca ellerin BULUNDUĞU
   * noktayı (`from`) geçirir ve poz oradan aksiyona akar.
   */
  intro?: number;
  /** `intro` harmanının başlangıç noktaları (model uzayı, `clone.worldToLocal`). */
  from?: { right: THREE.Vector3; left: THREE.Vector3 } | null;
}

/** Hedef noktayı (ileri / yukarı / dışa) katsayılarından kurar — tahsis yok. */
function setTarget(
  out: THREE.Vector3,
  base: THREE.Vector3,
  rig: BombArmRig,
  sign: number,
  fwd: number,
  up: number,
  side: number,
): void {
  out
    .copy(base)
    .addScaledVector(rig.forward, fwd * rig.reach)
    .addScaledVector(WORLD_UP, up * rig.reach)
    .addScaledVector(rig.lateral, side * sign * rig.reach);
}

/**
 * Fırlatma / yere bırakma / boş el pozunu uygular.
 *
 * NEDEN TEK FONKSİYON: üç hâl de aynı iki eli, aynı kavrama katmanını ve aynı
 * gövde eğilmesini sürer; ayrı fonksiyonlara bölünseydi "hangi el tutuyor" ve
 * "parmaklar hangi oranda kapalı" bilgisi üç yerde ayrı ayrı türetilirdi.
 *
 * SIRA ŞART (çağıran için de): kol pozlandıktan SONRA avuç noktaları okunur —
 * bomba konumu elden türetiliyor (bkz. `SamuraiBomb` kare döngüsü).
 */
export function applyBombActionPose(
  clone: THREE.Object3D,
  rig: BombArmRig,
  input: BombActionPoseInput,
  time: number,
): void {
  const p = THREE.MathUtils.clamp(input.progress, 0, 1);
  const release = THREE.MathUtils.clamp(input.release, 0.06, 0.96);
  /** Aksiyonu yapan elin yan işareti (sağ +1 / sol -1) ve tersi. */
  const holdSign = input.right ? 1 : -1;
  const offSign = -holdSign;
  const sway = Math.sin(time * SWAY_SPEED) * SWAY_AMOUNT;

  // Hedefler ve kavramalar SKALER katsayı olarak toplanır (taşıma noktasına
  // göre ileri/yukarı/dışa). NEDEN SKALER: aksiyonun sonunda eller hokkabazlığın
  // TUTUŞ BAŞINA dönmek zorundadır (`endK`), yani iki farklı pozun aynı bazda
  // harmanlanması gerekir; vektör tutulsaydı iki kez omuz/ofset hesabı yapılır
  // ve harman yanlış bazda olurdu.
  let fwdHold = 0;
  let upHold = 0;
  let outHold = 0;
  let fwdOff = 0;
  let upOff = 0;
  let outOff = 0;
  /** Tutan / boştaki elin kavrama oranı (1 = tam kavrama). */
  let gripHold = 1;
  let gripOff = 1;

  // ── GÖVDE: önce eğilme, sonra kollar. Kolların hedefleri omuza GÖRE
  // kurulduğu için eğilen gövdeyle birlikte inerler (ayrı bir telafi yok).
  let bow = 0;
  /** Gövdenin kendi ekseni çevresindeki burulması (rad, model +Y). */
  let twist = 0;
  /** Sonda hokkabazlığın tutuş başına dönüş oranı (0 = aksiyon pozu). */
  let endK = 1;

  if (input.kind === "throw") {
    // ── FIRLATMA ────────────────────────────────────────────────
    // Hazırlıkta geriye yaslan, bırakışta öne kapan, takipte doğrul.
    const windup = smoothstep(0, THROW_WINDUP_END, p);
    // Kamçı: kol uzun süre kurulu kalır, sonra boşalır (bkz. `WHIP_POW`).
    const whip = Math.pow(smoothstep(THROW_WINDUP_END, release, p), WHIP_POW);
    const follow = smoothstep(release, THROW_FOLLOW_END, p);
    const settle = smoothstep(THROW_FOLLOW_END, 1, p);
    bow =
      ((1 - whip) * -THROW_LEAN_BACK * windup + whip * THROW_LEAN_FWD) *
      (1 - settle);
    // Gövde: hazırlıkta atış koluna doğru DÖNER (kol kurulur), bırakışta
    // açılıp ters yöne savrulur ve takip boyunca orada kalır; son harman
    // (`settle`) burulmayı da sıfıra getirir, yoksa hokkabazlık başlarken
    // gövde bir karede eski yönüne sıçrardı.
    twist =
      ((-(1 - whip) * THROW_TWIST_BACK * windup + whip * THROW_TWIST_FWD) *
        (1 - settle)) *
      holdSign;
    endK = settle;
    // Hedef, taşıma noktasından başlar ve üç anahtar noktayı sırayla geçer:
    // hazırlık (arkada/yukarı) → bırakış (önde, tam kol) → takip (aşağı).
    // Parçalı lerp'ler C0 sürekli olduğu için poz sıçramaz; her parçanın kendi
    // yumuşatması hareketi kamçı gibi hızlandırır.
    fwdHold = -THROW_WINDUP_BACK * windup;
    upHold = THROW_WINDUP_UP * windup;
    outHold = THROW_WINDUP_OUT * windup;
    fwdHold = THREE.MathUtils.lerp(fwdHold, THROW_RELEASE_FWD, whip);
    upHold = THREE.MathUtils.lerp(upHold, THROW_RELEASE_UP, whip);
    outHold = THREE.MathUtils.lerp(outHold, THROW_RELEASE_OUT, whip);
    if (p > release) {
      fwdHold = THREE.MathUtils.lerp(fwdHold, THROW_FOLLOW_FWD, follow);
      upHold = THREE.MathUtils.lerp(upHold, -THROW_FOLLOW_DOWN, follow);
      outHold = THREE.MathUtils.lerp(outHold, THROW_RELEASE_OUT, follow);
    }
    // Boştaki kol HEDEFİ GÖSTERİR: atış boyunca nişan yönüne uzanır, takipte
    // gevşer.
    const point =
      smoothstep(0, THROW_WINDUP_END, p) *
      (1 - smoothstep(release, THROW_FOLLOW_END, p));
    fwdOff = THROW_AIM_FWD * point;
    upOff = THROW_AIM_UP * point;
    // Tutan el bırakışta açılır, boştaki el işaret ederken gevşek kalır.
    gripHold = 1 - GRIP_OPEN * smoothstep(release, release + 0.1, p);
    gripOff = 1 - 0.55 * point;
  } else if (input.kind === "place") {
    // ── YERE BIRAKMA ────────────────────────────────────────────
    // El omuzdan aşağı iner (erişimin sınırına kadar), parmaklar topu bırakır
    // ve el geri çekilir. Kol yere TAM yetişemez (omuzun yerden yüksekliği kol
    // boyundan fazladır); kalan boşluğu bombanın düşüşü kapatır (bkz.
    // `SamuraiBomb` → düşüş eğrisi), yani top yine yere kadar iner.
    // El, bırakışa kadar AŞAĞI iner (rampa tam bırakışta biter), sonra
    // doğrulur; gövde de el ile birlikte kalkar.
    const stand = Math.min(
      0.96,
      release + PLACE_FALL_SPAN * PLACE_STAND_AT,
    );
    const rise = 1 - smoothstep(stand, 1, p);
    const down = smoothstep(0, release, p) * rise;
    bow = PLACE_BOW * smoothstep(0, release, p) * rise;
    // Gövde hafifçe atış koluna döner: el yere inerken omuz öne açılır, karakter
    // bombayı önüne bırakır gibi okunur. İşaret atış eliyle aynalanır.
    twist = -PLACE_TWIST * down * holdSign;
    // Top yere değdikten sonra "boş el" duruşuna yumuşak geçiş.
    endK = smoothstep(stand, 1, p);
    fwdHold = PLACE_FWD * down;
    upHold = -PLACE_DOWN * down;
    outHold = PLACE_OUT * down;
    fwdOff = -PLACE_BALANCE_BACK * down;
    upOff = PLACE_BALANCE_UP * down;
    outOff = PLACE_BALANCE_OUT * down;
    // Parmaklar bırakıştan biraz ÖNCE açılır (top elden düşmeye başlarken
    // parmaklar açık olmalı), denge kolu hafifçe açılır.
    gripHold = 1 - GRIP_OPEN * smoothstep(release - 0.1, release, p);
    gripOff = 1 - 0.35 * down;
  }

  // ── SON HARMAN: aksiyon pozundan hokkabazlığın TUTUŞ BAŞINA ──────
  // NEDEN: aksiyon bitince hokkabazlık `juggleTime = 0`dan, yani tutuşun ilk
  // karesinden devam eder. O karede tutan el (sağ) `LIFT_FORWARD`/`LIFT_UP`
  // kadar yukarı ve önde, boştaki el taşıma noktasında ve parmakları
  // `1 - GRIP_OPEN` oranında açıktır. Bu harman olmasaydı kol, aksiyon bittiği
  // karede bir anda 0.2 birim yukarı zıplardı.
  // (`empty` bu harmanı endK = 1 ile baştan uygular: aksiyonun kendisi yoktur,
  // yalnızca tutuş başı pozu ve salınım kalır.)
  fwdHold = THREE.MathUtils.lerp(fwdHold, LIFT_FORWARD, endK);
  upHold = THREE.MathUtils.lerp(upHold, LIFT_UP, endK);
  outHold = THREE.MathUtils.lerp(outHold, 0, endK);
  fwdOff = THREE.MathUtils.lerp(fwdOff, 0, endK);
  upOff = THREE.MathUtils.lerp(upOff, 0, endK);
  outOff = THREE.MathUtils.lerp(outOff, 0, endK);
  gripHold = THREE.MathUtils.lerp(gripHold, 1, endK);
  gripOff = THREE.MathUtils.lerp(gripOff, 1 - GRIP_OPEN, endK);
  // Salınım: hokkabazlıkta olduğu gibi eller karşı fazlı nefes alır (aksiyon
  // sırasında da sürer, yoksa poz "donuk" okunur ve bittiği karede sıçrardı).
  fwdHold += sway;
  fwdOff -= sway;

  // Gövde eğilmesi: kollar pozlanmadan ÖNCE (hedefler omuza göre kurulur).
  applyBow(clone, rig.spineChain, rig.bowAxis, rig.bowSign * bow);
  // Burulma bow ile AYNI sırada ve omuzlar okunmadan önce. Eksen model
  // yukarısıdır (+Y): rig ters çizilmiş olsa bile "gövdeyi kendi etrafında
  // döndür" anlamı değişmez; işaret atış eline (`holdSign`) bağlıdır.
  applyTwist(clone, rig.spineChain, WORLD_UP, twist);

  // Omuzlar CANLI okunur (gövde eğilmesinden SONRA): hedefler gerçek omuz
  // konumuna göre kurulur, yoksa eğilen gövdede eller geride kalırdı.
  localPos(clone, rig.right.shoulder, vShoulderR);
  localPos(clone, rig.left.shoulder, vShoulderL);
  vCarryR.copy(rig.carryRight).add(vShoulderR);
  vCarryL.copy(rig.carryLeft).add(vShoulderL);

  if (input.right) {
    setTarget(vTargetR, vCarryR, rig, holdSign, fwdHold, upHold, outHold);
    setTarget(vTargetL, vCarryL, rig, offSign, fwdOff, upOff, outOff);
  } else {
    setTarget(vTargetL, vCarryL, rig, holdSign, fwdHold, upHold, outHold);
    setTarget(vTargetR, vCarryR, rig, offSign, fwdOff, upOff, outOff);
  }
  // Giriş harmanı: hedefler, aksiyon başlarken ellerin BULUNDUĞU noktadan
  // aksiyon pozuna akar (tek karede atlama olmaz).
  const intro = THREE.MathUtils.clamp(input.intro ?? 1, 0, 1);
  if (input.from && intro < 1) {
    vTargetR.lerp(input.from.right, 1 - intro);
    vTargetL.lerp(input.from.left, 1 - intro);
  }
  solveArm(clone, rig.right, vTargetR);
  solveArm(clone, rig.left, vTargetL);
  // ✊ Kavramalar: aksiyonu yapan el / boştaki el — sonda HOKKABAZLIK
  // düzenine döner (hangi elle atılmış olursa olsun; döngü sağdan başlar).
  applyFingerGrip(clone, BOMB_FINGER_GRIP * gripHold, input.right ? rig.right.hand : rig.left.hand);
  applyFingerGrip(clone, BOMB_FINGER_GRIP * gripOff, input.right ? rig.left.hand : rig.right.hand);
}
