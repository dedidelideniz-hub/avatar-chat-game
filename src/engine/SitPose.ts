/**
 * OTURMA POZU — rig'den bağımsız prosedürel bankta oturma.
 *
 * NEDEN PROSEDÜREL: oyundaki dört karakter GLB'sinin yalnızca biri
 * (`character.glb`) hazır bir "Sitting" klibi taşıyor; deri modelleri
 * (savaşçı/samuray/şövalye) taşımıyor. Hazır klibi kullanmak, bankın çok
 * alçak (0.25 birim) olması yüzünden ayakları zemine gömüyordu. Bu yüzden
 * oturma pozu KEMİK YÖNLERİNDEN türetilir: kemiğin mevcut dünya yönü
 * ölçülür ve istenen yöne döndürülür — böylece her rig'de aynı sonuç çıkar
 * ve kemik eksenleri (local axis) hakkında hiçbir varsayım yapılmaz.
 *
 * RIG FARKLARI (ölçülerek doğrulandı, bkz. `scripts/check-bench-sit.ts`):
 *   • Mixamo derileri:  Hips → LeftUpLeg → LeftLeg → LeftFoot   (tek zincir)
 *   • character.glb   : Hips → UpperLeg.L → LowerLeg.L          (uyluk/baldır)
 *                       ve AYAKLAR zincirin altında DEĞİL —
 *                       `Bone` kökü altında ayrı dururlar. Ayrıca
 *                       `Leg.L` adlı düğüm kemik değil, mesh'tir.
 * Bu yüzden: (1) baldır, altında ayak arayarak değil, AD SKORUYLA seçilir
 * ("LowerLeg" > "Leg"); (2) kemiğin ucu, alt kemik yoksa `_end` düğümünden
 * okunur; (3) ayak kemiği tüm iskelette aranır ve baldırın ucuna TAŞINIR —
 * böylece ayak, bacakla birlikte hareket eder.
 *
 * KULLANIM SIRASI ÖNEMLİ: `applySitPose` her karede, `AnimationMixer`
 * güncellemesinden SONRA çağrılmalıdır (üst gövde idle klibinden gelir,
 * sadece bacaklar ve kök yüksekliği burada ezilir).
 */
import * as THREE from "three";

export interface SitBones {
  hips: THREE.Bone | null;
  thighL: THREE.Bone | null;
  thighR: THREE.Bone | null;
  shinL: THREE.Bone | null;
  shinR: THREE.Bone | null;
  footL: THREE.Bone | null;
  footR: THREE.Bone | null;
}

const PELVIS_RE = /pelvis/;
const HIPS_RE = /hips/;
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
function sideOf(name: string): "L" | "R" | null {
  if (/left/.test(name)) return "L";
  if (/right/.test(name)) return "R";
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
  if (THIGH_RE.test(name) || !SHIN_WEAK_RE.test(name)) return -1;
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

  // ── Bacaklar: ad skoruyla bulunur. Uyluk TÜM iskelette aranır: bazı
  //    riglerde uyluklar `Hips`in altında değildir (`character.glb`de
  //    `Body` altında, `Hips` ile kardeş). ──
  for (const side of ["L", "R"] as const) {
    const scope: THREE.Object3D = root;
    let thigh: THREE.Bone | null = null;
    let thighScoreBest = -1;
    scope.traverse((obj) => {
      if (obj === scope || !isBone(obj)) return;
      const name = obj.name.toLowerCase();
      if (sideOf(name) !== side) return;
      const score = thighScore(name);
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
        const name = obj.name.toLowerCase();
        if (sideOf(name) !== side) return;
        const score = shinScore(name);
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
      const name = obj.name.toLowerCase();
      if (sideOf(name) === side && FOOT_RE.test(name)) foot = obj as THREE.Bone;
    });
    if (!foot) {
      root.traverse((obj) => {
        if (foot || !isBone(obj)) return;
        const name = obj.name.toLowerCase();
        if (sideOf(name) === side && FOOT_RE.test(name)) foot = obj as THREE.Bone;
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

/* ── Yeniden kullanılan geçici nesneler (kare başına çöp üretmemek için) ── */
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _target = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _full = new THREE.Quaternion();
const _blended = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const _localQ = new THREE.Quaternion();
const _IDENTITY = new THREE.Quaternion();
const _thighDir = new THREE.Vector3();
const _shinDir = new THREE.Vector3();

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
  // Kalça, dizden biraz alçak kalır (alçak bank): uyluk neredeyse yatay ve
  // hafif yukarı, baldır öne açılı — ayaklar zemine ~1-3 cm yaklaşır, bu da
  // 50 px/birim ölçekte görünmez.
  _thighDir.set(0, 0.18, facing).normalize();
  _shinDir.set(0, -1, facing * 0.85).normalize();

  root.updateMatrixWorld(true);
  poseLeg(root, bones.thighL, bones.shinL, bones.footL, _thighDir, _shinDir, blend);
  poseLeg(root, bones.thighR, bones.shinR, bones.footR, _thighDir, _shinDir, blend);
}
