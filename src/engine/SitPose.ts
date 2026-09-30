/**
 * OTURMA POZU — rig'den bağımsız prosedürel bankta oturma (Sanalika tarzı).
 *
 * NEDEN PROSEDÜREL: oyundaki dört karakter GLB'sinin yalnızca biri
 * (`character.glb`) hazır bir "Sitting" klibi taşıyor; deri modelleri
 * (savaşçı/samuray/şövalye) taşımıyor. Hazır klip ayrıca bankın yüksekliğine
 * göre ayarlanamıyor. Bu yüzden oturma pozu KEMİK YÖNLERİNDEN türetilir:
 * kemiğin mevcut dünya yönü ölçülür ve istenen yöne döndürülür — böylece her
 * rig'de aynı sonuç çıkar ve kemik eksenleri (local axis) hakkında hiçbir
 * varsayım yapılmaz.
 *
 * OTURMA NASIL OKUNUR (hepsi dünya uzayında, rig'den bağımsız):
 *   1. KALÇA MİNDERE OTURUR. Kalça eklemi (uyluk kökleri) minderin üstüne
 *      `pad` kadar yükseltilir; `pad` = kalça dokusunun kalça eklemine göre
 *      derinliği ve MODELDEN ÖLÇÜLÜR (tıknaz avatarda ~0.06, ince insan
 *      riginde ~0.20). Kalça EKLEMİ mindere oturmaz; mindere değen kısım
 *      onun altındaki dokudur. Bu yüzden sabit bir yükseklik doğru değildir:
 *      tıknaz avatarı havada bırakır, ince rigi banka gömer.
 *   2. BACAKLAR BANKIN ÖNÜNDEN SARKAR. Uyluk öne ve biraz aşağı iner; eğim,
 *      diz minder hizasına (minder + 3 cm) gelecek şekilde bacak uzunluğundan
 *      hesaplanır (`thighDrop`), baldır dikey sarkar. Böylece karakter
 *      çömelmiş gibi değil, minderin ön kenarına oturmuş gibi okunur.
 *   3. GÖVDE hafifçe geriye yatıktır (`SIT_LEAN`), yüz caddeye dönüktür
 *      (`benchSeatYaw` → `0` / `π`).
 *   4. OTURURKEN HİÇBİR KLİP ÇALIŞMAZ (`mixer.stopAllAction()`); taban poz
 *      olarak idle'ın ilk karesi yakalanır. Kalkışta bütün dönüşümler
 *      kaydedilen hâline geri yüklenir ve idle yeniden başlar.
 *
 * RIG FARKLARI (ölçülerek doğrulandı, bkz. `scripts/check-bench-sit.ts`):
 *   • Mixamo derileri:  Hips → LeftUpLeg → LeftLeg → LeftFoot   (tek zincir)
 *   • character.glb   : Body → UpperLegL → LowerLegL            (uyluk/baldır)
 *                       ve AYAKLAR zincirin altında DEĞİL —
 *                       `Bone` kökü altında ayrı dururlar (bu yüzden ayak
 *                       baldırın ucuna konumla taşınır). Ayrıca `LegL` adlı
 *                       düğüm kemik değil, mesh'tir.
 * Bu yüzden: (1) baldır, altında ayak arayarak değil, AD SKORUYLA seçilir
 * ("LowerLeg" > "Leg"); (2) kemiğin ucu, alt kemik yoksa `_end` düğümünden
 * okunur; (3) ayak kemiği tüm iskelette aranır ve baldırın ucuna TAŞINIR.
 */
import * as THREE from "three";
import { BENCH_SEAT_TOP, SEAT_TRANSITION_SECONDS, SIT_LEAN } from "./constants";

export interface SitBones {
  hips: THREE.Bone | null;
  /** Omurga/göğüs kökü — otururken gövdeyi hafifçe geriye yatırmak için. */
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

/* ── Poz sabitleri ──────────────────────────────────────────────────── */

/** Diz, minderin bu kadar üstüne nişanlanır (dünya birimi). */
const KNEE_ABOVE_SEAT = 0.03;
/** Ayak betona girmesin: en alçak ayak yüksekliği. */
const FOOT_CLEARANCE = 0.02;
/** Uyluğun aşağı eğim sınırları (yön vektörünün Y bileşeni ≈ sinüs). */
const THIGH_DROP_MIN = 0.06;
const THIGH_DROP_MAX = 0.8;
/** Bacak uzunluğu ölçülemezse kullanılan eğim. */
export const SIT_THIGH_DROP_DEFAULT = 0.18;
/** Bacakların yanlara açılması (uyluk yönüne katılan yan bileşen). */
const SIT_SPLAY = 0.08;
/** Baldırın öne kaçması — tam dikey yerine hafif öne açık. */
const SIT_SHIN_FORWARD = 0.06;

/** Kalça payı ölçülemezse kullanılan değer (dünya birimi). */
export const SEAT_PAD_FALLBACK = 0.12;
/** Ölçülen payın sınırları — havada asılı kalmak ya da banka gömülmek yok. */
const SEAT_PAD_MIN = 0.05;
const SEAT_PAD_MAX = 0.25;
/**
 * Ölçüm bandı: kalça ekleminin ALTINDAKİ daire (dünya birimi).
 *
 * Daire (yön bandı değil): kalça ekleminin hemen altındaki yüzey oturma
 * yüzeyidir ve bu bölge pürüzsüz bir kabuk olduğu için ölçüm kararlıdır.
 * "Kalçanın gerisi" gibi yönlü bir bant, eğimli bir yüzeyi ortasından
 * kestiği için bandın sınırına göre sonucu 5–10 cm değiştiriyordu.
 */
const PAD_RADIUS = 0.13;
const PAD_DOWN = 0.4;

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

  // ── Omurga: gövdeyi hafifçe geriye yatırmak için.
  //    Sıra: "spine"/"chest" (3) > "torso" (2) > "body" (1).
  //    `character.glb`de göğüs kökü `Torso_1`, alt gövde kökü `Body`dir; ikisi
  //    de kemik olduğu için skor AYIRT EDİCİ olmalı — `Body` aşağı bakar,
  //    onu döndürmek gövde yerine bacak köklerini savurur.
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
    let thigh: THREE.Bone | null = null;
    let thighScoreBest = -1;
    root.traverse((obj) => {
      if (obj === root || !isBone(obj)) return;
      // DİKKAT: yan işareti HAM addan okunur (üç.js ad temizliğinden sonra
      // `UpperLegL` gibi adlarda büyük L/R ayırt edicidir); skor küçük harfle.
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
      const scope: THREE.Object3D = thigh;
      scope.traverse((obj) => {
        if (obj === scope || !isBone(obj)) return;
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
    const footScope: THREE.Object3D = shin ?? thigh ?? root;
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

/** Modelin bütün dönüşümlerini yakalar; dönen fonksiyon onları geri yükler. */
export function captureStandingPose(root: THREE.Object3D) {
  const transforms: {
    object: THREE.Object3D;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    scale: THREE.Vector3;
  }[] = [];
  root.traverse((object) =>
    transforms.push({
      object,
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
    }),
  );
  return () => {
    for (const t of transforms) {
      t.object.position.copy(t.position);
      t.object.quaternion.copy(t.quaternion);
      t.object.scale.copy(t.scale);
    }
    root.updateMatrixWorld(true);
  };
}

/* ── Yeniden kullanılan geçici nesneler (kare başına çöp üretmemek için) ── */
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _pelvis = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _target = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _full = new THREE.Quaternion();
const _blended = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const _localQ = new THREE.Quaternion();
const _IDENTITY = new THREE.Quaternion();
const _forward = new THREE.Vector3();
const _lateral = new THREE.Vector3();
const _thighDirL = new THREE.Vector3();
const _thighDirR = new THREE.Vector3();
const _shinDirL = new THREE.Vector3();
const _shinDirR = new THREE.Vector3();
const _modelRight = new THREE.Vector3(1, 0, 0);

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Uyluğun aşağı eğimi — DİZ MİNDER HİZASINA gelsin diye bacak uzunluğundan
 * hesaplanır.
 *
 * NEDEN: uyluk tam yatay olduğunda diz kalça ile aynı yükseklikte kalır ve
 * karakter "dizlerini toplamış/çömelmiş" gibi okunur (ölçüldü: kalça 0.61 ·
 * diz 0.68). Gerçek bank oturuşunda uyluk öne ve AŞAĞI iner, diz minder
 * hizasına düşer, baldır dikey sarkar.
 *
 * @param pelvisY Kalça ekleminin hedef dünya yüksekliği (minder + pay).
 */
export function thighDrop(pelvisY: number, thighLen: number, shinLen: number): number {
  if (thighLen <= 1e-5) return SIT_THIGH_DROP_DEFAULT;
  // Diz mindere nişanlanır…
  const kneeTarget = (pelvisY - (BENCH_SEAT_TOP + KNEE_ABOVE_SEAT)) / thighLen;
  // …ama ayak betona girmesin (baldır dikey sarkar).
  const footFloor = (pelvisY - shinLen - FOOT_CLEARANCE) / thighLen;
  return clamp(Math.min(kneeTarget, footFloor), THIGH_DROP_MIN, THIGH_DROP_MAX);
}

/**
 * KALÇA PAYI — kalça dokusunun kalça eklemine göre derinliği.
 *
 * Kalça EKLEMİ mindere oturmaz; mindere değen kısım onun altındaki ve biraz
 * gerisindeki dokudur. Bu doku modelden modele çok değişir: ölçülen değerler
 * `character` 0.06 · `skin-samuray` 0.07 · `skin-savasci` 0.20 (dünya
 * birimi). Sabit bir yükseklik tıknaz avatarı minderin ÜSTÜNDE havada
 * bırakıyordu (ekran görüntüsündeki "oturmuyor" görünümü), ince rigi ise
 * bankın içine gömüyordu.
 *
 * Ölçüm, kalça ekleminin ALTINDAKİ dairede yapılır: mindere değen yüzey
 * (but/kalça altı) tam oradadır. Poz UYGULANDIKTAN SONRA çağrılmalıdır.
 *
 * @param pelvis Kalça ekleminin DÜNYA konumu.
 */
export function measureSeatPad(
  root: THREE.Object3D,
  pelvis: THREE.Vector3,
): number {
  root.updateMatrixWorld(true);
  let lowest = Infinity;
  root.traverse((obj) => {
    const mesh = obj as THREE.SkinnedMesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    const pos = mesh.geometry?.getAttribute?.("position") as
      | THREE.BufferAttribute
      | undefined;
    if (!pos) return;
    // Örnekleme YOĞUN: ölçüm oturma başına BİR kez yapılır (kare başına
    // değil) ama seyrek örnekleme giysinin/bacağın en alçak tepesini
    // kaçırıp kalçayı havada bırakabiliyordu (ölçüldü: 0.20 yerine 0.30).
    const step = Math.max(1, Math.floor(pos.count / 12000));
    for (let i = 0; i < pos.count; i += step) {
      if ((mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh) {
        mesh.getVertexPosition(i, _a);
      } else {
        _a.fromBufferAttribute(pos, i);
      }
      mesh.localToWorld(_a);
      const dx = _a.x - pelvis.x;
      const dz = _a.z - pelvis.z;
      if (dx * dx + dz * dz > PAD_RADIUS * PAD_RADIUS) continue;
      const below = pelvis.y - _a.y;
      if (below <= 0 || below > PAD_DOWN) continue;
      if (_a.y < lowest) lowest = _a.y;
    }
  });
  if (!Number.isFinite(lowest)) return NaN;
  return pelvis.y - lowest;
}

/**
 * Ölçülen payı GÜVENİLİR aralığa süzer.
 *
 * SORUN: kalça ekleminin altında aşağı sarkan giysi (samuray hakaması,
 * şövalye zırhı) da ölçüme girer. Olduğu gibi kullanılırsa karakter mindere
 * hiç İNMEZ — ölçüldü: `skin-samuray` 0.28 · `skin-sevalye` 0.29, yani
 * uyluğu kadar. Oysa oyuncu karakterin banka OTURDUĞUNU görmek ister: kalça
 * aşağı inmeli, diz kırılmalı, bacaklar sarkmalı.
 *
 * Bu yüzden pay, uyluk boyunun %60'ı ile sınırlanır (insan kalça dokusu
 * uyluğun yarısından derin olamaz). Sarkan giysi bu durumda çıtanın birkaç
 * santim içinden geçer — oyunlarda olağan ve "havada asılı kalmaktan" çok
 * daha az rahatsız edicidir.
 */
function plausiblePad(raw: number, thighLen: number): number {
  if (!Number.isFinite(raw)) return SEAT_PAD_FALLBACK;
  const cap = thighLen > 1e-4 ? thighLen * 0.6 : SEAT_PAD_MAX;
  return clamp(raw, SEAT_PAD_MIN, Math.min(SEAT_PAD_MAX, cap));
}

/** Kemiği, `tip`e bakan ekseni `desired` yönüne çevirecek şekilde döndürür. */
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

/**
 * Kemiği dünya uzayındaki `target` noktasına taşır.
 *
 * ADDITIVE DEĞİL, mutlak: konum = taban + (hedef − taban) × blend. Böylece
 * fonksiyon İDEMPOTENT olur — aynı karede iki kez çağrılsa bile titremez.
 *
 * `character.glb`de ayak kemikleri baldırın altında olmadığı için bacak
 * dönerken ayaklar geride kalırdı; bu onları baldırın ucuna taşır. Mixamo
 * riglerinde hedef ≈ taban olduğundan hiçbir değişiklik yapılmaz.
 */
function alignBoneToPoint(bone: THREE.Bone, target: THREE.Vector3, blend: number): void {
  const parent = bone.parent;
  if (!parent) return;
  _offset.copy(target);
  parent.worldToLocal(_offset);
  const base = basePositionOf(bone);
  bone.position.set(
    base.x + (_offset.x - base.x) * blend,
    base.y + (_offset.y - base.y) * blend,
    base.z + (_offset.z - base.z) * blend,
  );
}

/**
 * Bir bacak zincirini oturma pozuna getirir: uyluk `thighDir`e, baldır
 * `shinDir`e döner; ayak baldırın ucuna taşınır ve tabanı yere paralel
 * (`footDir`) hâle getirilir.
 */
function poseLeg(
  root: THREE.Object3D,
  thigh: THREE.Bone | null,
  shin: THREE.Bone | null,
  foot: THREE.Bone | null,
  thighDir: THREE.Vector3,
  shinDir: THREE.Vector3,
  footDir: THREE.Vector3,
  blend: number,
) {
  if (!thigh || !shin) return;
  rotateBoneToward(root, thigh, tipOf(thigh), thighDir, blend);
  const shinTip = tipOf(shin);
  rotateBoneToward(root, shin, shinTip, shinDir, blend);
  if (foot) {
    if (shinTip) {
      shinTip.getWorldPosition(_target);
      alignBoneToPoint(foot, _target, blend);
      root.updateMatrixWorld(true);
    }
    // Ayak tabanı yere paralel kalsın (baldırdan gelen eğimi al).
    rotateBoneToward(root, foot, tipOf(foot), footDir, blend);
  }
}

/**
 * Bacakları oturma pozuna getirir. `blend` = 0 → hiç dokunmaz (ayakta),
 * 1 → tam oturma pozu. Her karede çağrılabilir (İDEMPOTENT).
 *
 * @param facing Bankın baktığı yön (+1 = +Z, -1 = -Z).
 * @param drop Uyluğun aşağı eğimi (bkz. `thighDrop`).
 */
export function applySitPose(
  root: THREE.Object3D,
  bones: SitBones,
  facing: 1 | -1,
  blend: number,
  drop = SIT_THIGH_DROP_DEFAULT,
) {
  if (blend <= 0) return;
  // Riglerin yerel X eksenleri farklıdır. Dünya uzayında uyluğu öne-aşağı,
  // baldırı aşağı hedeflemek, her rigde "diz kırıldı" demenin karşılığıdır.
  root.updateMatrixWorld(true);
  const forward = _forward.set(0, 0, facing);

  // Yan eksen, uyluk köklerinin GERÇEK konumundan ölçülür (rig'in X'i değil).
  let lateralLengthSq = 0;
  if (bones.thighL && bones.thighR) {
    bones.thighL.getWorldPosition(_a);
    bones.thighR.getWorldPosition(_b);
    _lateral.subVectors(_a, _b).setY(0);
    lateralLengthSq = _lateral.lengthSq();
  }
  if (lateralLengthSq < 1e-8) {
    root.getWorldQuaternion(_parentQ);
    _lateral.copy(_modelRight).applyQuaternion(_parentQ).setY(0);
  }
  _lateral.normalize();

  const cosDrop = Math.sqrt(Math.max(0, 1 - drop * drop));
  _thighDirL
    .copy(forward)
    .multiplyScalar(cosDrop)
    .addScaledVector(_lateral, SIT_SPLAY)
    .setY(-drop)
    .normalize();
  _thighDirR
    .copy(forward)
    .multiplyScalar(cosDrop)
    .addScaledVector(_lateral, -SIT_SPLAY)
    .setY(-drop)
    .normalize();
  _shinDirL.copy(forward).multiplyScalar(SIT_SHIN_FORWARD).addScaledVector(_lateral, 0.03).setY(-1).normalize();
  _shinDirR.copy(forward).multiplyScalar(SIT_SHIN_FORWARD).addScaledVector(_lateral, -0.03).setY(-1).normalize();

  // Gövde: sırt arkalığa yaslanır, dik durmaz (bkz. `leanTorso`).
  leanTorso(root, bones.spine ?? bones.hips, facing, blend);

  _desired.copy(forward);
  poseLeg(root, bones.thighL, bones.shinL, bones.footL, _thighDirL, _shinDirL, _desired, blend);
  poseLeg(root, bones.thighR, bones.shinR, bones.footR, _thighDirR, _shinDirR, _desired, blend);
}

/**
 * Üst gövdeyi bank oturuşuna uygun şekilde hafifçe geriye yatırır.
 *
 * MUTLAK HEDEF: omurganın dünya yönü "yukarı, `SIT_LEAN` kadar geriye
 * yatık" yönüne çevrilir — açı eklemek gibi birikmediği için fonksiyon
 * İDEMPOTENT kalır. Omurga dikey değilse (tanınmayan rig) hiç dokunulmaz.
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
  _desired.set(0, Math.cos(SIT_LEAN), -facing * Math.sin(SIT_LEAN));
  rotateBoneToward(root, bone, tip, _desired, blend);
}

/* ════════════════════════════════════════════════════════════════════════
   OTURMA YAŞAM DÖNGÜSÜ
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Tek oturma yaşam döngüsü: giriş → sabit tabandan deterministik poz → kalkış.
 *
 * - `sitOnBench`: bütün klipleri DURDURUR, idle'ın ilk karesini taban alır
 *   (kollar doğal kalsın), sonra klibi gerçekten durdurur. Otururken hiçbir
 *   animasyon kemikleri ezmez.
 * - `update`: her karede tabandan poz üretir, kalçayı mindere oturtur.
 * - `unsit`: bütün dönüşümleri kaydedilen hâline geri yükler (kemikler eğik
 *   kalmaz) ve animasyon yeniden başlatılabilir olur.
 */
export class BenchSitController {
  /** Şu anda bankta mı? */
  seated = false;
  /** Poz karışımı 0→1 (`SEAT_TRANSITION_SECONDS`). */
  private blend = 0;
  /** Ölçülen kalça payı. */
  private pad = SEAT_PAD_FALLBACK;
  /** Ölçülen paya yumuşak yaklaşan UYGULANAN pay (sıçrama olmasın). */
  private appliedPad = SEAT_PAD_FALLBACK;
  private padMeasured = false;
  /** Oturma tabanı: idle'ın ilk karesinin dönüşümleri. */
  private baseline: (() => void) | null = null;

  private readonly root: THREE.Object3D;
  private readonly bones: SitBones;
  private readonly restore: () => void;

  constructor(root: THREE.Object3D, bones: SitBones, restore: () => void) {
    this.root = root;
    this.bones = bones;
    this.restore = restore;
  }

  /** Banka otur — animasyonları durdur ve doğal duruşu taban al. */
  sitOnBench(mixer: THREE.AnimationMixer, idle?: THREE.AnimationAction | null): void {
    mixer.stopAllAction();
    mixer.timeScale = 1;
    this.restore(); // yazılı (bind) dönüşümler
    // Kollar bind/T pozunda kalmasın: idle'ın ilk karesini bir kez örnekle.
    // DİKKAT: yürüyüşten çıkan `fadeOut` aksiyonun AĞIRLIĞINI 0 bırakır;
    // ağırlık geri verilmezse `mixer.update(0)` hiçbir şey uygulamaz ve taban
    // poz bind (T) pozu olur — oturan karakterin kolları öne uzanmış kalır.
    if (idle) {
      idle.reset();
      idle.setEffectiveWeight(1);
      idle.play();
      mixer.update(0);
    }
    this.baseline = captureStandingPose(this.root);
    mixer.stopAllAction(); // otururken hiçbir klip çalışmaz
    this.baseline();
    this.seated = true;
    this.blend = 0;
    this.pad = SEAT_PAD_FALLBACK;
    this.appliedPad = SEAT_PAD_FALLBACK;
    this.padMeasured = false;
  }

  /** Kalk — bütün dönüşümleri geri yükle (kemikler eğik kalmaz). */
  unsit(mixer: THREE.AnimationMixer): void {
    if (!this.seated) return;
    mixer.stopAllAction();
    mixer.timeScale = 1;
    this.baseline = null;
    this.seated = false;
    this.blend = 0;
    this.restore();
  }

  /** Bacak kemik uzunluğu (dönüşümden bağımsız, dünya birimi). */
  private boneLength(bone: THREE.Bone | null): number {
    if (!bone) return 0;
    const tip = tipOf(bone);
    if (!tip) return 0;
    bone.getWorldPosition(_a);
    tip.getWorldPosition(_b);
    return _a.distanceTo(_b);
  }

  /** Kalça ekleminin (iki uyluk kökünün ortası) dünya konumu. */
  private pelvisWorld(out: THREE.Vector3): boolean {
    const { thighL, thighR, hips } = this.bones;
    if (thighL && thighR) {
      thighL.getWorldPosition(out);
      thighR.getWorldPosition(_b);
      out.add(_b).multiplyScalar(0.5);
      return true;
    }
    const single = thighL ?? thighR;
    if (single) {
      single.getWorldPosition(out);
      return true;
    }
    if (hips) {
      hips.getWorldPosition(out);
      return true;
    }
    return false;
  }

  /**
   * Her karede çağrılır. `inner` = modelin ölçek/konum grubu,
   * `group` = karakterin dünya konumunu/yönünü taşıyan dış grup.
   */
  update(inner: THREE.Group, group: THREE.Group, facing: 1 | -1, dt: number): void {
    if (!this.seated) return;
    this.baseline?.();
    inner.position.x = 0;
    inner.position.z = 0;
    inner.rotation.x = 0;
    group.updateMatrixWorld(true);

    this.blend = Math.min(1, this.blend + dt / SEAT_TRANSITION_SECONDS);
    const k = this.blend * this.blend * (3 - 2 * this.blend);

    const thighLen = Math.max(
      this.boneLength(this.bones.thighL),
      this.boneLength(this.bones.thighR),
    );
    const shinLen = Math.max(
      this.boneLength(this.bones.shinL),
      this.boneLength(this.bones.shinR),
    );

    // ── İskelet yoksa: gövdeyi geriye yatır, kalça pivotunu alçalt ──
    if (!canSit(this.bones)) {
      inner.rotation.x = -SIT_LEAN * k;
      inner.position.y -= SEAT_PAD_FALLBACK * k;
      return;
    }

    // ── Poz ──
    const pelvisY = BENCH_SEAT_TOP + this.appliedPad;
    applySitPose(
      this.root,
      this.bones,
      facing,
      k,
      thighDrop(pelvisY, thighLen, shinLen),
    );

    // ── Kalçayı mindere oturt (konum dünya uzayında, sonra gruba çevrilir) ──
    if (!this.pelvisWorld(_pelvis)) return;
    _target.set(group.position.x, pelvisY, group.position.z);
    group.worldToLocal(_target);
    _offset.copy(_pelvis);
    group.worldToLocal(_offset);
    inner.position.add(_target.sub(_offset).multiplyScalar(k));
    group.updateMatrixWorld(true);

    // ── Kalça payını ÖLÇ (geçiş bitince bir kez) ve yumuşakça uygula ──
    // `_pelvis` DÜNYA uzayındadır (konum düzeltmesi onu değiştirmez).
    if (!this.padMeasured && this.blend >= 0.999) {
      this.padMeasured = true;
      // DİKKAT: `_pelvis` konum düzeltmesinden ÖNCE okunmuştu. Ölçüm, model
      // mindere yerleştirildikten SONRAKİ kalçaya göre yapılmalıdır; aksi
      // hâlde daire kalçanın altında değil, yarım birim yukarısında kalır ve
      // ölçüm anlamsız çıkar (ölçüldü: 0.12 yerine 0.07 / 0.20 yerine 0.40).
      this.pelvisWorld(_pelvis);
      this.pad = plausiblePad(measureSeatPad(this.root, _pelvis), thighLen);
    }
    this.appliedPad += (this.pad - this.appliedPad) * Math.min(1, 9 * dt);
  }
}
