// Yürüme/koşma animasyonu ile gerçek dünya hızının senkronu.
//
// SORUN (ölçümle doğrulandı): klipler sabit hızda (timeScale = 1) oynuyordu.
// `character.glb` içindeki "Walking" klibi 0.958 sn sürüyor ve bir tam
// döngüde ayak, gövde yüksekliğinin ~0.42'si kadar öne-arkaya savruluyor;
// yani klip saniyede ~0.88 gövde boyu yer kat ediyor. Oyunda karakter ise
// 90 px/sn = 1.8 dünya birimi/sn hızla gidiyor; gövde yüksekliği dünya
// cinsinden 1.5 × 0.47 = 0.705 birim olduğu için bu saniyede ~2.55 gövde
// boyu eder. Klip bu yüzden hızlandırılmalıydı, çalmadığı için ayaklar
// zeminde kayıyordu ("ice skating").
//
// İKİNCİ SORUN: zırh/skin modellerindeki (Mixamo) klipler kalça (Hips)
// konum eğrilerini de taşıyor. Bu "root motion" oyunun kendi konum
// kontrolüne EKLENDİĞİ için karakter her adımda kendi kendine kayıp geri
// sıçrıyordu. Aşağıdaki `stripRootMotion` bunları budar (dikey salınım
// korunur), `measureStrideRatio` adım oranını modelden bir kez ölçer ve
// `walkTimeScale` her karede animasyon hızını gerçek hıza eşitler.
import * as THREE from "three";

/** Rig kökünün dünya ölçeği (FighterRig'in `<group ref={root} scale=...>`).
 *
 *  0.575 → 0.47 → 0.40 → 0.48: MOBA oranı. Dekoratif çevre objeleri %48
 *  küçültüldüğü için (bkz. `mapDecorScale`) dövüşçüler son adımda %20
 *  BÜYÜTÜLDÜ: karakter yerdeki taşların/çalıların yanında belirgin şekilde
 *  büyük ve detayları (zırh, kılıç, renk) net seçilir. Adım senkronu
 *  (`walkTimeScale`) bu sabiti okuduğu için ayak–zemin eşleşmesi yeni boyla
 *  otomatik olarak yeniden hesaplanır — ayak kayması geri gelmez. Baş-üstü
 *  can barı da aynı adımı `HEAD_UI_SCALE` ile izler. */
export const RIG_ROOT_SCALE = 0.48;

/** Ayak kemiği bulunamazsa kullanılan adım/gövde oranı (character.glb: 0.42). */
const DEFAULT_STRIDE_RATIO = 0.45;

/** Animasyon hızı sınırları — absüst veya ters timeScale olmaması için. */
const TIME_SCALE_MIN = 0.25;
const TIME_SCALE_MAX = 3.2;

/** Kalça/kök konum eğrisi taşıyan düğüm adları. */
const ROOTISH = /root|hips|armature|skeleton|pelvis/i;
/** Ayak parmak ucu / ayak kemikleri. */
const FOOTISH = /foot|toe/i;

/**
 * Kliplerdeki "root motion"u (kök/kalça konum eğrilerinin yatay kayması)
 * budar. Dikey salınım (Y) korunur, böylece yürüyüşün gövde sekmesi kalır.
 *
 * Klipler klonlanır ve değiştirilen eğrilerin dizileri kopyalanır: `useGLTF`
 * sonuçları önbelleğe alındığı için paylaşılan diziyi yerinde bozmak diğer
 * dövüşçüleri de etkilerdi.
 */
export function stripRootMotion(
  animations: readonly THREE.AnimationClip[],
): THREE.AnimationClip[] {
  return animations.map((clip) => {
    const clean = clip.clone();
    for (const track of clean.tracks) {
      if (!track.name.endsWith(".position")) continue;
      const nodeName = track.name.split(".")[0];
      if (!ROOTISH.test(nodeName)) continue;
      const src = track.values;
      const out = new Float32Array(src.length);
      out.set(src);
      const x0 = out[0];
      const z0 = out[2];
      for (let i = 0; i + 2 < out.length; i += 3) {
        out[i] = x0;
        out[i + 2] = z0;
      }
      track.values = out;
    }
    return clean;
  });
}

/**
 * Bir tam döngüde ayakların öne-arkaya savrulmasını (adım uzunluğu) gövde
 * yüksekliğine oran olarak ölçer. Modelden bir kez çağrılır; klip süresi
 * modele göre değiştiği için hız hesabı bu oran + klip süresi üzerinden
 * yapılır, yani her zırh/skin kendi kendini kalibre eder.
 */
export function measureStrideRatio(
  root: THREE.Object3D,
  clip: THREE.AnimationClip | null | undefined,
): number {
  if (!clip || clip.duration <= 0) return DEFAULT_STRIDE_RATIO;
  const feet: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (FOOTISH.test(o.name) && !/ik/i.test(o.name)) feet.push(o);
  });
  if (!feet.length) return DEFAULT_STRIDE_RATIO;

  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.play();
  const n = feet.length;
  const minX = new Float64Array(n).fill(Infinity);
  const maxX = new Float64Array(n).fill(-Infinity);
  const minZ = new Float64Array(n).fill(Infinity);
  const maxZ = new Float64Array(n).fill(-Infinity);
  const p = new THREE.Vector3();
  const SAMPLES = 32;
  for (let i = 0; i <= SAMPLES; i++) {
    mixer.setTime((clip.duration * i) / SAMPLES);
    root.updateMatrixWorld(true);
    for (let k = 0; k < n; k++) {
      feet[k].getWorldPosition(p);
      if (p.x < minX[k]) minX[k] = p.x;
      if (p.x > maxX[k]) maxX[k] = p.x;
      if (p.z < minZ[k]) minZ[k] = p.z;
      if (p.z > maxZ[k]) maxZ[k] = p.z;
    }
  }
  // Ölçüm bitti: pozu dinlenmeye al ve mixer'ı bırak.
  mixer.setTime(0);
  root.updateMatrixWorld(true);
  action.stop();
  mixer.uncacheRoot(root);

  let range = 0;
  for (let k = 0; k < n; k++) {
    range = Math.max(range, maxX[k] - minX[k], maxZ[k] - minZ[k]);
  }
  const box = new THREE.Box3().setFromObject(root);
  const height = box.max.y - box.min.y;
  if (!(height > 1e-4) || !(range > 1e-4)) return DEFAULT_STRIDE_RATIO;
  const ratio = range / height;
  // Ölçüm bozuksa (ör. yalnızca parmak kemikleri bulunduysa) varsayılana dön.
  if (ratio < 0.05 || ratio > 2.5) return DEFAULT_STRIDE_RATIO;
  return ratio;
}

/**
 * Gerçek hız / klibin kendi hızı oranını verir. Klip 1x hızda kendi kendine
 * saniyede `2 × strideRatio × dünya gövde yüksekliği / süre` kadar yol
 * kat ediyor; karakter bundan hızlı gidiyorsa animasyon da o oranda hızlanır.
 */
export function walkTimeScale(
  speedWorldPerSec: number,
  strideRatio: number,
  clipDuration: number,
  modelHeight = 1.5,
  rigScale = RIG_ROOT_SCALE,
): number {
  const worldHeight = modelHeight * rigScale;
  const impliedSpeed =
    (2 * strideRatio * worldHeight) / Math.max(clipDuration, 0.05);
  if (!(impliedSpeed > 1e-6)) return 1;
  const ratio = speedWorldPerSec / impliedSpeed;
  if (!Number.isFinite(ratio)) return 1;
  return Math.min(TIME_SCALE_MAX, Math.max(TIME_SCALE_MIN, ratio));
}
