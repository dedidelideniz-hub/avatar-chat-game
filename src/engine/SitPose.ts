/**
 * OTURMA POZU — rig'den bağımsız prosedürel bankta oturma.
 *
 * NEDEN PROSEDÜREL: oyundaki dört karakter GLB'sinin yalnızca biri
 * (`character.glb`) hazır bir "Sitting" klibi taşıyor; deri modelleri
 * (savaşçı/samuray/şövalye) taşımıyor. Hazır klip bankın yüksekliğine göre de
 * ayarlanamıyordu: minder 0.46 birim, oturan kalça 0.56 birim yükseklikte
 * (bkz. `constants.ts` BENCH_*). Bu yüzden
 * oturma pozu KEMİK YÖNLERİNDEN türetilir: kemiğin mevcut dünya yönü
 * ölçülür ve istenen yöne döndürülür — böylece her rig'de aynı sonuç çıkar
 * ve kemik eksenleri (local axis) hakkında hiçbir varsayım yapılmaz.
 *
 * RIG FARKLARI (ölçülerek doğrulandı, bkz. `scripts/check-bench-sit.ts`):
 *   • Mixamo derileri:  Hips → LeftUpLeg → LeftLeg → LeftFoot   (tek zincir)
 *   • character.glb   : Body → UpperLeg.L → LowerLeg.L          (uyluk/baldır)
 *                       ve AYAKLAR zincirin altında DEĞİL —
 *                       `Bone` kökü altında ayrı dururlar. Ayrıca
 *                       `Leg.L` adlı düğüm kemik değil, mesh'tir.
 * Bu yüzden: (1) baldır, altında ayak arayarak değil, AD SKORUYLA seçilir
 * ("LowerLeg" > "Leg"); (2) kemiğin ucu, alt kemik yoksa `_end` düğümünden
 * okunur; (3) ayak kemiği tüm iskelette aranır ve baldırın ucuna TAŞINIR —
 * böylece ayak, bacakla birlikte hareket eder.
 *
 * BenchSitController animasyonları durdurur, kaydedilmiş model pozundan
 * her kare deterministik oturma üretir ve kalkınca bütün dönüşümleri geri yükler.
 */
import * as THREE from "three";
import { BENCH_SEAT_TOP, SEAT_TRANSITION_SECONDS, SIT_LEAN } from "./constants";

export interface SitBones {
  hips: THREE.Bone | null;
  /** Omurga/göğüs kökü — otururken gövdeyi geriye yatırmak için. */
  spine: THREE.Bone | null;
  thighL: THREE.Bone | null;
  thighR: THREE.Bone | null;
  shinL: THREE.Bone | null;
  shinR: THREE.Bone | null;
  footL: THREE.Bone | null;
  footR: THREE.Bone | null;
}

const PELVIS_RE = /pelvis/;
const HIPS_RE = /hips|bip\d*hip/;
/** Üst bacak: "lowerleg"/"leftleg" bunlara takılmamalı. */
const THIGH_RE = /thigh|upleg|upperleg/;
/** Alt bacak — spesifik olan kazanır. */
const SHIN_STRONG_RE = /lowerleg|shin|knee/;
const SHIN_WEAK_RE = /leg/;
const FOOT_RE = /foot|ankle/;
/** Üç.js sentinel düğümleri (`_end`) kemik değildir. */
const SENTINEL_RE = /_end/;

/** Gerçek kemik mi? (mesh düğümleri aynı ismi taşıyabilir → elenir.) */
function isBone(obj: THREE.Object3D): boolean {
  return (obj as THREE.Bone).isBone === true && !SENTINEL_RE.test(obj.name.toLowerCase());
}

/** "left"/"right" ya da ".l"/"_L"/" L" gibi son eklerden tarafı çıkarır. */
function sideOf(rawName: string): "L" | "R" | null {
  if (/left/i.test(rawName)) return "L";
  if (/right/i.test(rawName)) return "R";
  // ÜÇ.JS AD TEMİZLİĞİ: GLTFLoader düğüm adlarını `sanitizeNodeName`den
  // geçirir ve NOKTAYI siler — `UpperLeg.L` → `UpperLegL`. `character.glb`
  // (varsayılan avatar) tam olarak böyle adlandırılmıştır; eski desen
  // (`l` harfinden önce harf olmayan sınır) bu adları göremediği için
  // oturma pozu HİÇ uygulanmıyordu. Bu yüzden ad SONUNDAKİ büyük L/R de
  // yan işareti sayılır ("UpperLegL", "FootR").
  if (/[LR]$/.test(rawName)) return rawName.endsWith("L") ? "L" : "R";
  // Zayıf desenler yalnızca küçük harfle anlamlı (`.`/`_` ile ayrılmış işaretler).
  const name = rawName.toLowerCase();
  if (/(^|[^a-z])l([^a-z]|$)/.test(name)) return "L";
  if (/(^|[^a-z])r([^a-z]|$)/.test(name)) return "R";
  return null;
}

/** Uyluk adı skoru — "upperleg"/"upleg" > "thigh". */
function thighScore(name: string): number {
  if (!THIGH_RE.test(name)) return -1;
  return /upperleg|upleg/.test(name) ? 2 : 1;
}

/** Baldır adı skoru — "LowerLeg"/"shin"/"knee" > "Leg"; uyluk isimleri elenir. */
function shinScore(name: string): number {
  if (THIGH_RE.test(name) || !(SHIN_WEAK_RE.test(name) || SHIN_STRONG_RE.test(name))) return -1;
  return SHIN_STRONG_RE.test(name) ? 2 : 1;
}

/**
 * Kemiğin UCU: önce alt kemik, yoksa `_end` düğümü. Uç, yön ölçümünde
 * referans alınır (diz/ayak bileği). `character.glb`de baldırın altında
 * kemik yoktur; orada `_end` düğümü kullanılır.
 */
export function tipOf(bone: THREE.Object3D): THREE.Object3D | null {
  // 1) Doğrudan alt kemik (diz / ayak bileği).
  for (const child of bone.children) {
    if (isBone(child)) return child;
  }
  // 2) Alt ağaçtaki ilk kemik.
  let descendant: THREE.Object3D | null = null;
  bone.traverse((obj) => {
    if (!descendant && obj !== bone && isBone(obj)) descendant = obj;
  });
  if (descendant) return descendant;
  // 3) `_end` düğümü (kemik ucunun konumunu taşır).
  for (const child of bone.children) {
    if (/_end$/.test(child.name)) return child;
  }
  let endNode: THREE.Object3D | null = null;
  bone.traverse((obj) => {
    if (!endNode && obj !== bone && /_end$/.test(obj.name)) endNode = obj;
  });
  return endNode;
}

/** İskeletten oturma için gereken kemikleri bulur. */
export function findSitBones(root: THREE.Object3D): SitBones {
  const out: SitBones = {
    hips: null,
    spine: null,
    thighL: null,
    thighR: null,
    shinL: null,
    shinR: null,
    footL: null,
    footR: null,
  };

  // ── Kalça: "pelvis" > "hips" ──
  let hipsScore = -1;
  root.traverse((obj) => {
    if (!isBone(obj)) return;
    const name = obj.name.toLowerCase();
    const score = PELVIS_RE.test(name) ? 2 : HIPS_RE.test(name) ? 1 : -1;
    if (score > hipsScore) {
      hipsScore = score;
      out.hips = obj as THREE.Bone;
    }
  });

  // ── Omurga: gövdeyi geriye yatırmak için.
  //    Sıra: "spine"/"chest" (3) > "torso" (2) > "body" (1).
  //    `character.glb`de göğüs kökü `Torso`, alt gövde kökü `Body`dir; ikisi
  //    de kemik olduğu için skor AYIRT EDİCİ olmalı — `Body` aşağı bakar,
  //    onu döndürmek gövde yerine bacak köklerini savurur.
  //    Hiçbiri yoksa gövde yatırılmaz, poz yine doğru çıkar.
  let spineScore = -1;
  root.traverse((obj) => {
    if (!isBone(obj)) return;
    const name = obj.name.toLowerCase();
    const score = /spine|chest/.test(name)
      ? 3
      : /torso/.test(name)
        ? 2
        : /^body/.test(name)
          ? 1
          : -1;
    if (score > spineScore) {
      spineScore = score;
      out.spine = obj as THREE.Bone;
    }
  });

  // ── Bacaklar: ad skoruyla bulunur. Uyluk TÜM iskelette aranır: bazı
  //    riglerde uyluklar `Hips`in altında değildir (`character.glb`de
  //    `Body` altında, `Hips` ile kardeş). ──
  for (const side of ["L", "R"] as const) {
    const scope: THREE.Object3D = root;
    let thigh: THREE.Bone | null = null;
    let thighScoreBest = -1;
    scope.traverse((obj) => {
      if (obj === scope || !isBone(obj)) return;
      // DİKKAT: yan işareti HAM addan okunur (üç.js ad temizliğinden sonra
      // `UpperLegL` gibi adlarda büyük L/R ayırt edicidir); skor ise küçük harfle.
      if (sideOf(obj.name) !== side) return;
      const score = thighScore(obj.name.toLowerCase());
      if (score > thighScoreBest) {
        thighScoreBest = score;
        thigh = obj as THREE.Bone;
      }
    });

    let shin: THREE.Bone | null = null;
    let shinScoreBest = -1;
    if (thigh) {
      const parent: THREE.Object3D = thigh;
      parent.traverse((obj) => {
        if (obj === parent || !isBone(obj)) return;
        if (sideOf(obj.name) !== side) return;
        const score = shinScore(obj.name.toLowerCase());
        if (score > shinScoreBest) {
          shinScoreBest = score;
          shin = obj as THREE.Bone;
        }
      });
    }

    // ── Ayak: bazı riglerde (character.glb) zincirin altında DEĞİL, tüm
    //    iskelette aranır. Önce baldırın altına bakılır. ──
    let foot: THREE.Bone | null = null;
    const footScope: THREE.Object3D = shin ?? thigh ?? scope;
    footScope.traverse((obj) => {
      if (foot || obj === footScope || !isBone(obj)) return;
      if (sideOf(obj.name) === side && FOOT_RE.test(obj.name.toLowerCase()))
        foot = obj as THREE.Bone;
    });
    if (!foot) {
      root.traverse((obj) => {
        if (foot || !isBone(obj)) return;
        if (sideOf(obj.name) === side && FOOT_RE.test(obj.name.toLowerCase()))
          foot = obj as THREE.Bone;
      });
    }

    if (side === "L") {
      out.thighL = thigh;
      out.shinL = shin;
      out.footL = foot;
    } else {
      out.thighR = thigh;
      out.shinR = shin;
      out.footR = foot;
    }
  }

  return out;
}

/** Oturma pozunun uygulanabilmesi için en az bir tam bacak zinciri var mı? */
export function canSit(bones: SitBones): boolean {
  return !!(
    (bones.thighL && bones.shinL && tipOf(bones.thighL) && tipOf(bones.shinL)) ||
    (bones.thighR && bones.shinR && tipOf(bones.thighR) && tipOf(bones.shinR))
  );
}

/**
 * MİNDER TEMASI — kalça dokusunun kalça kemiğine göre derinliği.
 *
 * NEDEN ÖLÇÜLÜR: mindere değen kısım kalça KEMİĞİ değil, onun altındaki
 * kalça/uyluk DOKUSUDUR ve bu doku modelden modele değişir (tıknaz avatarda
 * kalça kemiği gövdenin içinde kalır, ince insan riginde ~0.10 birimdir).
 * Sabit bir yükseklik (eski `BENCH_SEAT_HEIGHT = 0.56`) tıknaz modellerde
 * karakteri bankın İÇİNE gömüyordu — ekran görüntüsündeki "bankın içine
 * geçmiş" görünüm. Bu ölçüm, `BENCH_SEAT_HEIGHT` sabitinin kalibrasyonudur ve
 * `scripts/check-sit-model-pose.ts` her avatar için hâlâ geçerli olduğunu
 * doğrular (ölçülen derinlik + minder üstü ≤ sabit).
 */
/** Ölçüm yapılamazsa (mesh/örnek yok) kullanılan güvenli değer. */
export const SEAT_CONTACT_FALLBACK = 0.15;
/** Ölçüm bandı: kalçanın altında kalan bu yarıçaptaki geometri (dünya birimi). */
const SEAT_CONTACT_RADIUS = 0.18;

const _measureP = new THREE.Vector3();
const _measureV = new THREE.Vector3();

/**
 * Kalça dokusunun kalça kemiğinin ne kadar altına indiğini ölçer (dünya
 * birimi) — OTURMA POZU UYGULANMIŞ iskelette çağrılmalıdır.
 *
 * BANT: kalçanın ±0.18 birim çevresindeki, kalçanın ALTINDAKİ geometri.
 * Baldır/ayak dışarıda kalsın diye alt sınır DİZ seviyesidir; diz kalçanın
 * üstüne çıkan modellerde (tıknaz avatarlar) bacaklar öne katlandığı için
 * alt sınır gerekmez.
 */
export function measureSeatContact(
  root: THREE.Object3D,
  bones: SitBones,
): number {
  if (!bones.hips) return SEAT_CONTACT_FALLBACK;
  root.updateMatrixWorld(true);
  const hips = bones.hips;
  hips.getWorldPosition(_measureP);
  const kneeBone = bones.thighL ? tipOf(bones.thighL) : null;
  const kneeY = kneeBone ? kneeBone.getWorldPosition(_measureV).y : _measureP.y;
  const lowerBound = kneeY < _measureP.y ? kneeY - 0.02 : _measureP.y - 0.45;
  let lowest = Infinity;
  root.traverse((obj) => {
    const mesh = obj as THREE.SkinnedMesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    const pos = mesh.geometry?.getAttribute?.("position") as
      | THREE.BufferAttribute
      | undefined;
    if (!pos) return;
    // Örnekleme: büyük modellerde (16k tepe) her 4. tepe yeterli.
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) {
      if ((mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh) {
        mesh.getVertexPosition(i, _measureV);
      } else {
        _measureV.fromBufferAttribute(pos, i);
      }
      mesh.localToWorld(_measureV);
      if (
        _measureV.y < _measureP.y &&
        _measureV.y > lowerBound &&
        Math.abs(_measureV.x - _measureP.x) < SEAT_CONTACT_RADIUS &&
        Math.abs(_measureV.z - _measureP.z) < SEAT_CONTACT_RADIUS &&
        _measureV.y < lowest
      ) {
        lowest = _measureV.y;
      }
    }
  });
  if (!Number.isFinite(lowest)) return SEAT_CONTACT_FALLBACK;
  return _measureP.y - lowest;
}

/* ── Yeniden kullanılan geçici nesneler (kare başına çöp üretmemek için) ── */
/** Modelin animasyon öncesi dönüşümleri; mesh düğümleri de animasyon alabilir. */
export function captureStandingPose(root: THREE.Object3D) {
  const transforms: { object: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }[] = [];
  root.traverse((object) => transforms.push({
    object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(),
  }));
  return () => {
    for (const t of transforms) {
      t.object.position.copy(t.position);
      t.object.quaternion.copy(t.quaternion);
      t.object.scale.copy(t.scale);
    }
    root.updateMatrixWorld(true);
  };
}

/** Tek oturma yaşam döngüsü: giriş → sabit referanstan poz → eksiksiz kalkış. */
export class BenchSitController {
  seated = false;
  private elapsed = 0;
  private contact = 0.2;
  private measured = false;
  private restoreSeat: (() => void) | null = null;
  private anchor = new THREE.Vector3();
  private other = new THREE.Vector3();
  private correction = new THREE.Vector3();

  private root: THREE.Object3D;
  private bones: SitBones;
  private restore: () => void;

  constructor(root: THREE.Object3D, bones: SitBones, restore: () => void) {
    this.root = root;
    this.bones = bones;
    this.restore = restore;
  }

  sitOnBench(mixer: THREE.AnimationMixer, idle?: THREE.AnimationAction | null) {
    mixer.stopAllAction();
    mixer.timeScale = 1;
    this.restore();
    // Kollar bind/T pozunda kalmasın: idle'ın ilk karesini bir kez örnekle,
    // sonra eylemi gerçekten durdur. Otururken hiçbir klip çalışmaz.
    if (idle) {
      idle.reset().play();
      mixer.update(0);
    }
    this.restoreSeat = captureStandingPose(this.root);
    mixer.stopAllAction();
    this.restoreSeat();
    this.measured = false;
    this.elapsed = 0;
    this.seated = true;
    this.contact = 0.2;
  }

  unsit(mixer: THREE.AnimationMixer) {
    if (!this.seated) return;
    mixer.stopAllAction();
    this.restore();
    mixer.timeScale = 1;
    this.seated = false;
  }

  update(inner: THREE.Group, group: THREE.Group, facing: 1 | -1, dt: number) {
    if (!this.seated) return;
    this.elapsed = Math.min(SEAT_TRANSITION_SECONDS, this.elapsed + dt);
    const t = this.elapsed / SEAT_TRANSITION_SECONDS;
    const blend = t * t * (3 - 2 * t);
    this.restoreSeat?.();
    inner.position.x = 0;
    inner.position.z = 0;
    inner.rotation.x = 0;
    group.updateMatrixWorld(true);
    if (canSit(this.bones)) applySitPose(this.root, this.bones, facing, blend);
    else inner.rotation.x = -SIT_LEAN * blend;
    group.updateMatrixWorld(true);

    // Hips bazı riglerde uyluklarla kardeştir: gerçek pelvis merkezi iki
    // uyluğun başlangıcıdır, dekoratif Hips düğümünün yüksekliği değildir.
    const { thighL, thighR, hips } = this.bones;
    if (thighL && thighR) {
      thighL.getWorldPosition(this.anchor);
      thighR.getWorldPosition(this.other);
      this.anchor.add(this.other).multiplyScalar(0.5);
    } else if (hips) hips.getWorldPosition(this.anchor);
    else this.anchor.set(group.position.x, group.position.y + 0.9, group.position.z);

    if (t === 1 && hips && !this.measured) {
      this.measured = true;
      hips.getWorldPosition(this.other);
      this.contact = Math.max(0.2, measureSeatContact(this.root, this.bones) + this.anchor.y - this.other.y);
    }
    this.correction.set(group.position.x, BENCH_SEAT_TOP + this.contact, group.position.z);
    group.worldToLocal(this.correction);
    group.worldToLocal(this.anchor);
    this.correction.sub(this.anchor).multiplyScalar(blend);
    inner.position.add(this.correction);
    group.updateMatrixWorld(true);
  }
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _target = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _full = new THREE.Quaternion();
const _blended = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const _localQ = new THREE.Quaternion();
const _IDENTITY = new THREE.Quaternion();
const _thighDirL = new THREE.Vector3();
const _thighDirR = new THREE.Vector3();
const _shinDirL = new THREE.Vector3();
const _shinDirR = new THREE.Vector3();
const _sitForward = new THREE.Vector3();
const _sitLateral = new THREE.Vector3();
const _thighPosL = new THREE.Vector3();
const _thighPosR = new THREE.Vector3();
const _modelRight = new THREE.Vector3(1, 0, 0);


/** Ayak kemiklerinin duruş (taban) konumu — bir kez yakalanır. */
const basePosition = new WeakMap<THREE.Object3D, THREE.Vector3>();
function basePositionOf(bone: THREE.Object3D): THREE.Vector3 {
  let base = basePosition.get(bone);
  if (!base) {
    base = bone.position.clone();
    basePosition.set(bone, base);
  }
  return base;
}

/** Kemiği, `target` yönüne bakan eksenini `desired` yönüne çevirecek şekilde döndürür. */
function rotateBoneToward(
  root: THREE.Object3D,
  bone: THREE.Bone,
  tip: THREE.Object3D | null,
  desired: THREE.Vector3,
  blend: number,
) {
  if (!tip || blend <= 0) return;
  bone.getWorldPosition(_a);
  tip.getWorldPosition(_b);
  _b.sub(_a);
  if (_b.lengthSq() < 1e-10) return; // kemikler üst üste → yön tanımsız
  _b.normalize();

  _full.setFromUnitVectors(_b, desired);
  if (blend < 1) _blended.copy(_IDENTITY).slerp(_full, blend);
  else _blended.copy(_full);

  const parent = bone.parent;
  if (!parent) return;
  parent.getWorldQuaternion(_parentQ);
  // Dünya uzayındaki Δ dönüşünü kemiğin YEREL uzayına taşı:
  //   q_local' = (Q_parent⁻¹ · Δ · Q_parent) · q_local
  _localQ.copy(_parentQ).invert().multiply(_blended).multiply(_parentQ);
  bone.quaternion.premultiply(_localQ);

  // Sonraki ölçüm (baldır) bu dönüşü görmeli.
  root.updateMatrixWorld(true);
}

/**
 * Kemiği dünya uzayındaki `target` noktasına taşır.
 *
 * ADDITIVE DEĞİL, mutlak: konum = taban + (hedef − taban) × blend. Böylece
 * fonksiyon İDEMPOTENT olur — aynı karede iki kez çağrılsa ya da mixer
 * konumu her karede sıfırlasa bile kemik titremez/zıplamaz.
 *
 * `character.glb`de ayak kemikleri baldırın altında olmadığı için bacak
 * dönerken ayaklar geride kalırdı; bu onları baldırın ucuna taşır. Mixamo
 * riglerinde hedef ≈ taban olduğundan hiçbir değişiklik yapılmaz.
 */
function alignBoneToPoint(
  bone: THREE.Bone,
  target: THREE.Vector3,
  blend: number,
): void {
  const parent = bone.parent;
  if (!parent) return;
  // Dünya noktasını ebeveynin YEREL uzayına çevir (ölçek dâhil).
  _delta.copy(target);
  parent.worldToLocal(_delta);
  const base = basePositionOf(bone);
  bone.position.set(
    base.x + (_delta.x - base.x) * blend,
    base.y + (_delta.y - base.y) * blend,
    base.z + (_delta.z - base.z) * blend,
  );
}

function poseLeg(
  root: THREE.Object3D,
  thigh: THREE.Bone | null,
  shin: THREE.Bone | null,
  foot: THREE.Bone | null,
  thighDir: THREE.Vector3,
  shinDir: THREE.Vector3,
  blend: number,
) {
  if (!thigh || !shin) return;
  rotateBoneToward(root, thigh, tipOf(thigh), thighDir, blend);
  const shinTip = tipOf(shin);
  rotateBoneToward(root, shin, shinTip, shinDir, blend);
  // Ayak, baldırın ucuna taşınır (ayak zaten oradaysa kayma yoktur).
  if (foot && shinTip) {
    shinTip.getWorldPosition(_target);
    alignBoneToPoint(foot, _target, blend);
    root.updateMatrixWorld(true);
  }
}

/**
 * Bacakları oturma pozuna getirir. `blend` = 0 → hiç dokunmaz (ayakta),
 * 1 → tam oturma pozu. Her karede çağrılır.
 *
 * @param facing Bankın baktığı yön (+1 = +Z, -1 = -Z).
 */
export function applySitPose(
  root: THREE.Object3D,
  bones: SitBones,
  facing: 1 | -1,
  blend: number,
) {
  if (blend <= 0) return;
  // Riglerin yerel X eksenleri farklıdır. Dünya uzayında yatay uyluk +
  // dikey baldır hedeflemek, her rigde -90°/+90° diz kırmanın karşılığıdır.
  root.updateMatrixWorld(true);
  const forward = _sitForward.set(0, 0, facing);
  let lateralLengthSq = 0;
  if (bones.thighL && bones.thighR) {
    bones.thighL.getWorldPosition(_thighPosL);
    bones.thighR.getWorldPosition(_thighPosR);
    _sitLateral.subVectors(_thighPosL, _thighPosR).setY(0);
    lateralLengthSq = _sitLateral.lengthSq();
  }
  if (lateralLengthSq < 1e-8) {
    root.getWorldQuaternion(_parentQ);
    _sitLateral.copy(_modelRight).applyQuaternion(_parentQ).setY(0);
  }
  _sitLateral.normalize();
  _thighDirL.copy(forward).addScaledVector(_sitLateral, 0.12).setY(-0.04).normalize();
  _thighDirR.copy(forward).addScaledVector(_sitLateral, -0.12).setY(-0.04).normalize();
  _shinDirL.copy(_sitLateral).multiplyScalar(0.04).addScaledVector(forward, 0.04).setY(-1).normalize();
  _shinDirR.copy(_sitLateral).multiplyScalar(-0.04).addScaledVector(forward, 0.04).setY(-1).normalize();
  root.updateMatrixWorld(true);
  // GÖVDE GERİYE (bank oturuşu): sırt arkalığa yaslanır, gövde dik durmaz.
  // Omurga döndürülür — kalça/ bacaklar aşağıda AYRICA mutlak yönlerle
  // ayarlandığı için bu dönüş pozu bozmaz (sadece üst gövdeyi yatırır).
  leanTorso(root, bones.spine ?? bones.hips, facing, blend);
  poseLeg(root, bones.thighL, bones.shinL, bones.footL, _thighDirL, _shinDirL, blend);
  poseLeg(root, bones.thighR, bones.shinR, bones.footR, _thighDirR, _shinDirR, blend);
}

/**
 * Üst gövdeyi bank oturuşuna uygun şekilde geriye yatırır.
 *
 * MUTLAK HEDEF: omurganın dünya yönü "yukarı, `SIT_LEAN` kadar geriye
 * yatık" yönüne çevrilir — açı eklemek gibi birikmediği için fonksiyon
 * İDEMPOTENT kalır (her kare çağrılabilir). Omurga dikey değilse (tanınmayan
 * rig) hiç dokunulmaz; poz yine geçerli olur.
 */
function leanTorso(
  root: THREE.Object3D,
  bone: THREE.Bone | null,
  facing: 1 | -1,
  blend: number,
): void {
  if (!bone || blend <= 0) return;
  const tip = tipOf(bone);
  if (!tip) return;
  bone.getWorldPosition(_a);
  tip.getWorldPosition(_b);
  _b.sub(_a);
  if (_b.lengthSq() < 1e-10) return;
  _b.normalize();
  if (_b.y < 0.5) return; // omurga dikey değil → yatırmaya kalkma
  _target.set(0, Math.cos(SIT_LEAN), -facing * Math.sin(SIT_LEAN));
  rotateBoneToward(root, bone, tip, _target, blend);
}
