// ⚔️ BattleStance — duran karakterin "savaşa hazır" duruşu.
//
// MOBA karakterleri dururken dimdik durmaz: hafif öne eğik, dizleri bükülü ve
// ağırlığı bir ayaktan diğerine akan bir poz sergiler. Bu modül o duruşu
// KEMİK katmanında uygular (yürüyüş/idle klibinin ÜSTÜNE biner, klibi kesmez).
//
// NEDEN ÖLÇÜM (sabit eksen yok):
//   Haritada dört farklı iskelet var — `character.glb` (FootL/FootR kök kemiğe
//   bağlı, kemik adları özgün), `skin-samuray` / `skin-sevalye` / `skin-savasci`
//   (Mixamo: hip → upLeg → leg → foot zinciri). Aynı açı, farklı rig'lerde
//   farklı eksene denk gelir; "şu eksende +0.3 rad" gibi sabit bir değer bir
//   rig'de diz büker, diğerinde bacağı burkar. Bu yüzden her kemik için
//     · dönme ekseni modelin KENDİ yan ekseninden (kemik-lokal) ölçülür,
//     · İŞARET ise hedefin gerçekten istenen yöne gidip gitmediği sınanarak
//       seçilir (diz için "ayak yukarı", kalça/omurga/kol için "hedef ileri").
//
// AYAK YERDE KALIR: diz büküldüğünde iskelette IK yok, yani gövde alçalmaz —
// ayaklar havaya kalkar. Bu yüzden tüm duruş açıları uygulanıp ayakların
// yükselme miktarı ÖLÇÜLÜR ve çağıran taraf gövdeyi tam o kadar indirir
// (`drop`), böylece karakter çömelmiş görünür ama ayakları yerden kesilmez.
//
// KAPSAM: yalnızca bağlantısı sağlam zincirler. `character.glb`'de ayaklar
// bacak kemiğinin çocuğu OLMADIĞI için onda diz bükülmez (bacak hedefleri
// otomatik atlanır, gövde/kol katmanı kalır); bu modelde duruş izlenimi
// Arena3D'deki gövde sargısı katmanı (öne eğilme + alçalma) taşır.
import * as THREE from "three";

/** İşaret/eksen sınaması için ölçüm açısı (rad). Tam açıya oranlanır. */
const PROBE_ANGLE = 0.35;
/** Ölçüm sonucu bu birimin altındaysa kemik etkisizdir (model birimi). */
const MIN_EFFECT = 0.004;

/** Tam duruştaki açılar (rad) — "hafif" tutulur, abartılı poz olmasın. */
const HIP_FLEX = 0.16; // uyluk öne (çömelmenin ilk yarısı)
const KNEE_FLEX = 0.3; // diz bükülmesi (~17°)
const SPINE_LEAN = 0.1; // gövde öne eğilmesi (~5.7°)
const ARM_READY = 0.12; // kollar hafif öne/hazır (~6.9°)

const cleanName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const scratchA = new THREE.Vector3();
const scratchQ = new THREE.Quaternion();
const scratchRoot = new THREE.Quaternion();
const scratchParent = new THREE.Quaternion();

/** Ölçülen kemik hedefi: kemik + kemik-lokal eksen + işaretli tam açı. */
export interface StanceTarget {
  bone: THREE.Object3D;
  axis: THREE.Vector3;
  angle: number;
}

export interface BattleStanceRig {
  targets: StanceTarget[];
  /** Duruş uygulanınca gövdenin indirilmesi gereken miktar (model birimi). */
  drop: number;
}

function boneChildren(bone: THREE.Object3D): THREE.Object3D[] {
  return bone.children.filter((child) => (child as THREE.Bone).isBone);
}

function subtreeSize(node: THREE.Object3D): number {
  let count = 0;
  node.traverse((child) => {
    if ((child as THREE.Bone).isBone) count += 1;
  });
  return count;
}

/** Ana zincir çocuğu: en büyük alt iskelete sahip çocuk kemik. */
function mainChild(bone: THREE.Object3D): THREE.Object3D | null {
  const kids = boneChildren(bone);
  if (!kids.length) return null;
  let best = kids[0];
  let bestSize = subtreeSize(best);
  for (const kid of kids) {
    const size = subtreeSize(kid);
    if (size > bestSize) {
      bestSize = size;
      best = kid;
    }
  }
  return best;
}

function findBone(
  root: THREE.Object3D,
  side: "left" | "right",
  pattern: RegExp,
): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((object) => {
    if (found || !(object as THREE.Bone).isBone) return;
    const name = cleanName(object.name);
    if (!pattern.test(name)) return;
    // Yan tespiti iki isimlendirmeyi de kapsar: "mixamorigLeftUpLeg" (tam söz)
    // ve "UpperLegL"/"FootL" (son harf).
    const isLeft = name.includes("left") || name.endsWith("l");
    const isRight = name.includes("right") || name.endsWith("r");
    if (side === "left" ? isLeft : isRight) found = object;
  });
  return found;
}

/**
 * Model uzayı YAN eksenini (karakterin sağ/sol çizgisi) kemik-lokal uzaya
 * çevirir. Eksen `root`un kendi dönüşünden alınır: rig dönerken (yaw) ölçüm
 * geçersizleşmez, çünkü hem model kökü hem kemik ebeveyni birlikte döner.
 */
function lateralAxis(
  root: THREE.Object3D,
  bone: THREE.Object3D,
): THREE.Vector3 {
  bone.parent?.updateWorldMatrix(true, false);
  const parentQ = (bone.parent ?? root)
    .getWorldQuaternion(scratchParent)
    .invert();
  root.getWorldQuaternion(scratchRoot);
  return scratchA
    .set(1, 0, 0)
    .applyQuaternion(scratchRoot)
    .applyQuaternion(parentQ)
    .normalize()
    .clone();
}

/** Modele göre yerel konum (ölçümler karakterin kendi uzayında yapılır). */
function localPos(
  root: THREE.Object3D,
  node: THREE.Object3D,
  out: THREE.Vector3,
): THREE.Vector3 {
  node.getWorldPosition(out);
  return root.worldToLocal(out);
}

/** Kemik `angle` kadar yan eksende döndürülünce `tip` yerel olarak kayar. */
function displacement(
  root: THREE.Object3D,
  bone: THREE.Object3D,
  tip: THREE.Object3D,
  axis: THREE.Vector3,
  angle: number,
): THREE.Vector3 {
  const rest = bone.quaternion.clone();
  bone.quaternion.premultiply(scratchQ.setFromAxisAngle(axis, angle).clone());
  root.updateMatrixWorld(true);
  const moved = localPos(root, tip, new THREE.Vector3());
  bone.quaternion.copy(rest);
  root.updateMatrixWorld(true);
  return moved;
}

/**
 * İki işaret sınanır ve `score`u YÜKSEK olan seçilir (istenen yöne gerçekten
 * götüren işaret). Etki ölçüm eşiğinin altındaysa kemik atlanır — böylece
 * zinciri kopuk ya da etkisiz kemikler pozu bozmaz.
 */
function pickTarget(
  root: THREE.Object3D,
  bone: THREE.Object3D,
  tip: THREE.Object3D,
  fullAngle: number,
  score: (delta: THREE.Vector3) => number,
): StanceTarget | null {
  const axis = lateralAxis(root, bone);
  const before = localPos(root, tip, new THREE.Vector3());
  const plus = displacement(root, bone, tip, axis, PROBE_ANGLE).sub(before);
  const minus = displacement(root, bone, tip, axis, -PROBE_ANGLE).sub(before);
  const scorePlus = score(plus);
  const scoreMinus = score(minus);
  const best = Math.max(scorePlus, scoreMinus);
  if (best < MIN_EFFECT) return null;
  return {
    bone,
    axis,
    angle: fullAngle * (scorePlus >= scoreMinus ? 1 : -1),
  };
}

/**
 * Duruş hedeflerini iskeletten bulur ve ölçer. `slamRig` (RoyalSlam) omurga ve
 * üst kol kemiklerini zaten çözdüğü için burada ondan yararlanılır.
 *
 * `forwardLocal`: karakterin KENDİ ileri ekseni (model kökü uzayında). Varsayılan
 * modellerde +z, Kraliyet Savaşçısı'nda -z'dir (bkz. Arena3D `modelTurn`).
 */
export function findBattleStance(
  root: THREE.Object3D,
  slamRig: {
    spine: THREE.Object3D | null;
    head: THREE.Object3D | null;
    leftUpper: THREE.Object3D | null;
    rightUpper: THREE.Object3D | null;
  },
  forwardLocal: THREE.Vector3,
): BattleStanceRig {
  root.updateMatrixWorld(true);
  const targets: StanceTarget[] = [];
  const feet: THREE.Object3D[] = [];

  // ── BACAKLAR: kalça (uyluk öne) + diz (ayak yukarı) ──
  for (const side of ["left", "right"] as const) {
    const thigh = findBone(root, side, /(?:upleg|upperleg|thigh)/);
    if (!thigh) continue;
    const shin = mainChild(thigh);
    if (!shin) continue;
    const foot = mainChild(shin);
    // Zincir gerçekten ayağa iniyor mu? (character.glb'de ayak kök kemiğe
    // bağlı olduğu için burada elenir — diz bükmek ayağı koparırdı.)
    if (!foot || !/foot|ankle|toe/.test(cleanName(foot.name))) continue;
    const hip = pickTarget(root, thigh, shin, HIP_FLEX, (d) =>
      d.dot(forwardLocal),
    );
    if (hip) targets.push(hip);
    const knee = pickTarget(root, shin, foot, KNEE_FLEX, (d) => d.y);
    if (knee) targets.push(knee);
    feet.push(foot);
  }

  // ── OMURGA: gövde hafif öne ──
  if (slamRig.spine && slamRig.head) {
    const lean = pickTarget(
      root,
      slamRig.spine,
      slamRig.head,
      SPINE_LEAN,
      (d) => d.dot(forwardLocal),
    );
    if (lean) targets.push(lean);
  }

  // ── KOLLAR: eller hafif öne/ileride (tetikte) ──
  for (const upper of [slamRig.leftUpper, slamRig.rightUpper]) {
    if (!upper) continue;
    const fore = mainChild(upper);
    const hand = fore ? (mainChild(fore) ?? fore) : null;
    if (!hand) continue;
    const ready = pickTarget(
      root,
      upper,
      hand,
      ARM_READY,
      (d) => d.dot(forwardLocal) + d.y * 0.5,
    );
    if (ready) targets.push(ready);
  }

  if (!targets.length) return { targets, drop: 0 };

  // ── DÜŞÜŞ (drop): tüm açılar uygulanınca ayakların yükselmesi ──
  // Ölçüm tek seferliktir; kare döngüsünde yalnızca açı oranı değişir.
  const saved = targets.map((target) => target.bone.quaternion.clone());
  const base = feet.map((foot) => localPos(root, foot, new THREE.Vector3()));
  for (const target of targets) {
    target.bone.quaternion.premultiply(
      scratchQ.setFromAxisAngle(target.axis, target.angle).clone(),
    );
  }
  root.updateMatrixWorld(true);
  let maxRise = 0;
  let minRise = Number.POSITIVE_INFINITY;
  feet.forEach((foot, index) => {
    const now = localPos(root, foot, new THREE.Vector3());
    const rise = now.y - base[index].y;
    maxRise = Math.max(maxRise, rise);
    minRise = Math.min(minRise, rise);
  });
  if (!Number.isFinite(minRise)) minRise = maxRise;
  // ÖLÇÜM: iki ayak AYNI kadar yükselmiyor (idle pozunda ağırlık bir ayakta)
  // — diz+kalça açıları eşit olsa bile fark 15-55 mm'ye çıkıyor. Tam maksimumu
  // indirmek diğer ayağı yere gömüyordu (55 mm ≈ gövdenin %3'ü). Ortalamanın
  // %90'ı alınır: bir ayak birkaç mm havada kalır, hiçbiri yere batmaz.
  let drop = 0.45 * (maxRise + minRise);
  targets.forEach((target, index) => {
    target.bone.quaternion.copy(saved[index]);
  });
  root.updateMatrixWorld(true);

  return { targets, drop };
}

/**
 * Duruşu `k` oranıyla uygular (0 = hareket/yürüyüş, 1 = tam duruş) ve gövdenin
 * indirilmesi gereken miktarı döndürür. Her karede çağrılır: animasyon klipi
 * kemikleri zaten yazdığı için burada EK (premultiply) dönüş uygulanır, yani
 * yürüyüş animasyonu bozulmaz, pozu üstüne biner.
 */
export function applyBattleStance(
  rig: BattleStanceRig | null,
  k: number,
): number {
  if (!rig || k <= 0.001) return 0;
  for (const target of rig.targets) {
    target.bone.quaternion.premultiply(
      scratchQ.setFromAxisAngle(target.axis, target.angle * k),
    );
  }
  return rig.drop * k;
}

/**
 * Ölçülen alçalma miktarı DÖVÜŞÇÜ BAŞINA burada tutulur.
 *
 * Kemikler `Arena3D → GlbFighterBodyCore` (modeli yükleyen bileşen) içinde,
 * gövde katmanı ise bir üst bileşende (`FighterRig → bodyWrap`) durur. Anahtar
 * dövüşçü ref nesnesidir; böylece oyuncu ile bot farklı model kullansa da her
 * biri kendi ölçümünü alır.
 */
const dropByFighter = new WeakMap<object, number>();

/** Kemik katmanını kuran bileşen ölçtüğü değeri buraya yazar. */
export function publishStanceDrop(fighterKey: object, drop: number): void {
  dropByFighter.set(fighterKey, drop);
}

/**
 * Yalnızca ALÇALMA taşıyan rig görünümü: kemik dönüşü uygulamaz (kemikler
 * zaten gövde bileşeninde döndürülür), gövdeyi ölçülen kadar indirmek için
 * `drop`u canlı okur. `Arena3D → FighterRig` bunu kullanır.
 */
export function stanceDropRig(fighterKey: object): BattleStanceRig {
  return {
    targets: [],
    get drop() {
      return dropByFighter.get(fighterKey) ?? 0;
    },
  };
}
