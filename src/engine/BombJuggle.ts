// 🤹 BombJuggle — elde tutulan bombanın SAĞ↔SOL el arasında atılması.
//
// NEDEN: bomba avuca sabitlendiğinde karakter "elinde bir şey taşıyan" heykel
// gibi duruyordu; MOBA/aksiyon karakterlerinde prop'un canlı olması gerekir.
// Bomba artık iki elin arasında durmadan atılır.
//
// R İ T İ M  (her bacak = TUTUŞ + ATIŞ):
//
//   ▸ tutuş  : top elde bekler (avuca oturmuş), yakalama ezilmesi toparlanır
//   ▸ atış   : yay çizerek diğer ele gider, havada takla atar
//   ▸ yakala : varışta ezilir, sonra tutuş fazına geçer
//
// NEDEN SABİT HIZLI BİR SALINIM DEĞİL: ilk sürüm kesintisiz bir sinüs eğrisiydi;
// top hiç durmadan sağa sola kaydığı için "elden ele ATILIYOR" değil, "iki elin
// arasında bir makaraya sarılıyor" gibi okunuyordu. Gerçek hokkabazlıkta top
// avuçta bir an DURUR, sonra fırlar. Tutuş fazı bu yüzden şart.
//
// ÖLÇÜ: bu modül SAF matematiktir (Three'den başka bağımlılığı yok) ve tüm
// mesafeler DÜNYA birimidir. Konumları çağıran verir; yani el kemiklerini
// animasyon (idle/yürüyüş klipleri) nereye taşırsa bomba o iki nokta arasında
// uçar — kol hareketiyle otomatik senkron kalır, ayrı bir animasyon klibi
// yazmaya gerek yoktur.
//
// YOL: düz bir çizgi DEĞİL, dışa doğru bükülen ikinci derece bir bezier'dir.
// Sebep: eller gövdenin iki yanındadır ve düz çizgi tam gövdenin içinden geçer;
// bomba karnın içinden geçiyormuş gibi görünürdü. `pull` yönü, karakterin
// merkezinden dışa doğru verilir.
import * as THREE from "three";

/** Topun bir elde BEKLEME süresi (sn) — yakalama ezilmesi bu sürede toparlanır. */
export const JUGGLE_HOLD_S = 0.42;
/** Havada geçen süre (sn). Kısa → telaşlı, uzun → ağır. */
export const JUGGLE_TOSS_S = 0.58;
/** Atış sırasında havada atılan tam tur (takla) sayısı. */
export const JUGGLE_SPINS = 1;
/**
 * Yayın tepe yüksekliği (dünya birimi) — ellerin ÜSTÜNDEN, gövdenin önünden
 * geçmesini sağlayan şey budur (eller gövdenin iki yanındayken bükülme yönü
 * tanımsızdır; bkz. `SamuraiBomb` kare döngüsü). Kol boyu ~0.5 birim olan bir
 * karakterde 0.24, topu kalça hizasından göğüs hizasına kaldırır.
 */
export const JUGGLE_ARC = 0.24;
/** Yolun gövdeden dışa bükülmesi (dünya birimi). */
export const JUGGLE_BEND = 0.1;
/** Yakalama/atış anındaki ezilme oranı (0.07 = %7). */
export const JUGGLE_CATCH_SQUASH = 0.07;
/** Uçuş ortasındaki hafif gerilme (bomba havada esner gibi). */
export const JUGGLE_FLIGHT_STRETCH = 0.04;
/** Tutuşta ezilmenin toparlanma süresi, tutuş fazının oranı olarak. */
const HOLD_RECOVER = 0.55;
/** Uçuş uçlarındaki temas penceresi (normalize birim). */
const CATCH_WINDOW = 0.16;

const UP = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();

export interface JuggleSample {
  /** Havadaki güncel konum (dünya). */
  position: THREE.Vector3;
  /** Uçuşun hangi fazında olduğumuz (0 = atış anı, 1 = yakalama anı). */
  tossT: number;
  /** Takla açısı (radyan) ve ekseni. */
  spinAngle: number;
  spinAxis: THREE.Vector3;
  /** Topun ölçek çarpanı (1 = normal, <1 ezik). */
  squash: number;
  /**
   * 0 = top `from` elinde, 1 = `to` elinde. YÖNELİM geçişi bunu izler: fünye,
   * topun bulunduğu elin kalibrasyonuna göre yatar (sağ elde sağa, sol elde
   * sola). Tutuş fazında tam 0 ya da tam 1'dir; konumla AYNI eğriyi izler.
   */
  handMix: number;
  /** true → top bir elde bekliyor (uçuşta değil). */
  holding: boolean;
  /** Topun hangi elde beklediği: +1 → `from`, -1 → `to`. */
  direction: number;
}

/**
 * Zamana göre atış fazını çözer. Döngü İKİ bacaktan oluşur (sağ→sol, sol→sağ),
 * yani bomba başladığı ele geri döner ve hareket kesintisiz görünür.
 */
export function sampleBombJuggle(
  from: THREE.Vector3,
  to: THREE.Vector3,
  pull: THREE.Vector3,
  time: number,
  out: JuggleSample,
): JuggleSample {
  const leg = JUGGLE_HOLD_S + JUGGLE_TOSS_S;
  const cycle = leg * 2;
  const wrapped = ((time % cycle) + cycle) % cycle;
  const forward = wrapped < leg;
  const phase = forward ? wrapped : wrapped - leg;

  const holding = phase < JUGGLE_HOLD_S;
  /** Uçuş ilerlemesi — tutuş fazında 0 (top elde durur). */
  const flightU = holding
    ? 0
    : THREE.MathUtils.clamp((phase - JUGGLE_HOLD_S) / JUGGLE_TOSS_S, 0, 1);
  // Takla: tutuşta son değerde (2π) DONAR. 2π ≡ 0 olduğu için top el değiştirirken
  // dönüş sıçramaz; her yeni atış sıfırdan başlar.
  const spinU = holding ? 1 : flightU;

  // Gidiş-dönüş: ikinci bacakta uç noktalar YER DEĞİŞTİRİR, yoksa ikinci atış da
  // aynı yöne gider ve animasyon "geri sarma" gibi görünür.
  const a = forward ? from : to;
  const b = forward ? to : from;

  // Yumuşak iniş/kalkış (smoothstep): el ile temas anlarında hız sıfıra yakın,
  // ortada hızlı — gerçek bir atışın hissi budur (lineer hareket robotik durur).
  const eased = flightU * flightU * (3 - 2 * flightU);
  out.position.lerpVectors(a, b, eased);
  out.position.y += Math.sin(Math.PI * flightU) * JUGGLE_ARC;
  out.position.addScaledVector(pull, Math.sin(Math.PI * flightU) * JUGGLE_BEND);

  // Tutuşta top avuca iyice oturur: küçük bir "yerleşme" hareketi (yakalayınca
  // hafif yukarı, sonra oturur) — statik duruş hissini kırar.
  if (holding) {
    out.position.y += Math.sin(Math.PI * (phase / JUGGLE_HOLD_S)) * 0.014;
  }

  // Takla: bomba UÇTUĞU YÖNE doğru yuvarlanır. Eksen, gidiş yönüne ve dünyaya
  // dik olduğu için her atışta takla yönü kendiliğinden doğru olur (geri dönüşte
  // geri yuvarlanır, ortada aniden ters dönmez).
  tmpDir.subVectors(b, a);
  if (tmpDir.lengthSq() < 1e-8) tmpDir.set(1, 0, 0);
  tmpDir.normalize();
  out.spinAxis.crossVectors(UP, tmpDir);
  if (out.spinAxis.lengthSq() < 1e-8) out.spinAxis.set(1, 0, 0);
  out.spinAxis.normalize();
  out.direction = forward ? 1 : -1;
  out.spinAngle = spinU * Math.PI * 2 * JUGGLE_SPINS;

  // Ezilme: yakalamadan sonra tutuş boyunca toparlanır; uçuşun iki ucunda
  // (atış/yakalama) en yüksek, ortada hafif gerilme.
  const catchAmt = holding
    ? Math.max(0, 1 - phase / (JUGGLE_HOLD_S * HOLD_RECOVER))
    : Math.max(0, 1 - (1 - flightU) / CATCH_WINDOW);
  out.squash =
    1 -
    JUGGLE_CATCH_SQUASH * catchAmt +
    JUGGLE_FLIGHT_STRETCH * Math.sin(Math.PI * flightU);

  // Yönelim geçişi konumla AYNI eğriyi izler: top uçarken fünye bir elin
  // yatışından diğerininkine yumuşakça geçer (slerp çağıranda yapılır).
  out.handMix = forward ? eased : 1 - eased;
  out.holding = holding;
  out.tossT = flightU;
  return out;
}
