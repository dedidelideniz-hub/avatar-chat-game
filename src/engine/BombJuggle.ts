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
//
// ZAMANLAMA / KONUM AYRIMI (`sampleJuggleTiming`): kol pozunu süren katman
// (`engine/BombArmPose`) için yalnızca FAZ bilgisi gerekir; uç noktalar ise
// ancak kollar pozlandıktan sonra okunabilir. Bu yüzden faz hesabı ayrı bir
// fonksiyona alındı: kol pozlanır → avuç noktaları okunur → konum onlardan
// türetilir. İki fonksiyon aynı `time` ile çağrıldığı için bomba ile kol
// daima aynı fazdadır (senkron bozulmaz).
import * as THREE from "three";

/* * Topun bir elde BEKLEME süresi (sn) — yakalama ezilmesi bu sürede toparlanır. */
export const JUGGLE_HOLD_S = 0.42;
/** Havada geçen süre (sn). Kısa → telaşlı, uzun → ağır. */
export const JUGGLE_TOSS_S = 0.58;
/** Atış sırasında havada atılan tam tur (takla) sayısı. */
export const JUGGLE_SPINS = 1;
/**
 * Bir bacağın (tutuş + atış) toplam süresi ve tutuşun bu süre içindeki oranı.
 *
 * Oran dışa açılır çünkü KOL POZU da bu iki fazın sınırında döner: fırlatan el
 * bırakıştan sonra yükselir, yakalayan el tutuşun sonunda uzanır
 * (bkz. `engine/BombArmPose`). Sabit bir sayı yazılsaydı süreler değiştiğinde
 * kol ile top birbirinden kayardı.
 */
export const JUGGLE_LEG_S = JUGGLE_HOLD_S + JUGGLE_TOSS_S;
export const JUGGLE_HOLD_FRAC = JUGGLE_HOLD_S / JUGGLE_LEG_S;
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
  /**
   * Bacağın tamamı içindeki konum: 0 = tutuşun başı, `JUGGLE_HOLD_FRAC` =
   * bırakış anı, 1 = yakalama anı. Kol pozunun faz anahtarıdır ve konumdan
   * BAĞIMSIZDIR (uç noktalar bilinmeden de okunabilir).
   */
  legT: number;
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

/** Faz hesabının çıktısı — konumdan bağımsız tüm ölçüler. */
interface JuggleTiming {
  holding: boolean;
  /** Tutuş fazının 0..1 ilerlemesi (tutuş değilse 0). */
  holdU: number;
  /** Uçuş ilerlemesi 0..1 (tutuşta 0). */
  flightU: number;
  /** Sönümlü (smoothstep) uçuş ilerlemesi — konum da bunu izler. */
  eased: number;
  /** true → bu bacak `from`dan `to`ya gider. */
  forward: boolean;
  /** Ezilme/gerilme katsayısı (1 = normal). */
  squash: number;
  /** Takla oranı 0..1 (tutuşta 1'e DONAR; 2π ≡ 0 olduğu için sıçrama olmaz). */
  spinU: number;
  legT: number;
}

/**
 * Zamana göre faz çözümü — TEK doğruluk kaynağı. `sampleBombJuggle` ve
 * `sampleJuggleTiming` bu fonksiyonun üstüne kurulur, böylece kol ile top aynı
 * fazı okur (iki ayrı hesap bir gün ayrışıp senkronu bozamaz).
 */
function resolveTiming(time: number): JuggleTiming {
  const cycle = JUGGLE_LEG_S * 2;
  const wrapped = ((time % cycle) + cycle) % cycle;
  const forward = wrapped < JUGGLE_LEG_S;
  const phase = forward ? wrapped : wrapped - JUGGLE_LEG_S;

  const holding = phase < JUGGLE_HOLD_S;
  const holdU = holding ? THREE.MathUtils.clamp(phase / JUGGLE_HOLD_S, 0, 1) : 0;
  /** Uçuş ilerlemesi — tutuş fazında 0 (top elde durur). */
  const flightU = holding
    ? 0
    : THREE.MathUtils.clamp((phase - JUGGLE_HOLD_S) / JUGGLE_TOSS_S, 0, 1);
  // Takla: tutuşta son değerde (2π) DONAR. 2π ≡ 0 olduğu için top el değiştirirken
  // dönüş sıçramaz; her yeni atış sıfırdan başlar.
  const spinU = holding ? 1 : flightU;

  // Yumuşak iniş/kalkış (smoothstep): el ile temas anlarında hız sıfıra yakın,
  // ortada hızlı — gerçek bir atışın hissidir (lineer hareket robotik durur).
  const eased = flightU * flightU * (3 - 2 * flightU);

  // Ezilme: yakalamadan sonra tutuş boyunca toparlanır; uçuşun iki ucunda
  // (atış/yakalama) en yüksek, ortada hafif gerilme.
  const catchAmt = holding
    ? Math.max(0, 1 - phase / (JUGGLE_HOLD_S * HOLD_RECOVER))
    : Math.max(0, 1 - (1 - flightU) / CATCH_WINDOW);
  const squash =
    1 -
    JUGGLE_CATCH_SQUASH * catchAmt +
    JUGGLE_FLIGHT_STRETCH * Math.sin(Math.PI * flightU);

  return {
    holding,
    holdU,
    flightU,
    eased,
    forward,
    squash,
    spinU,
    legT: holding
      ? holdU * JUGGLE_HOLD_FRAC
      : JUGGLE_HOLD_FRAC + flightU * (1 - JUGGLE_HOLD_FRAC),
  };
}

/**
 * Yalnızca ZAMANLAMA alanlarını doldurur (konum ve iki el GEREKMEZ).
 *
 * Kol pozu katmanı bunu kullanır: avuç noktaları ancak kollar pozlandıktan
 * sonra bilinebildiği için (bomba konumu onlardan türetilir) faz hesabı önce
 * yapılmalıdır. Aynı `time` ile `sampleBombJuggle` çağrıldığında iki sonuç
 * birebir aynı fazdadır.
 */
export function sampleJuggleTiming(time: number, out: JuggleSample): JuggleSample {
  const t = resolveTiming(time);
  out.legT = t.legT;
  out.tossT = t.flightU;
  out.holding = t.holding;
  out.direction = t.forward ? 1 : -1;
  out.handMix = t.forward ? t.eased : 1 - t.eased;
  out.spinAngle = t.spinU * Math.PI * 2 * JUGGLE_SPINS;
  out.squash = t.squash;
  return out;
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
  const t = resolveTiming(time);
  sampleJuggleTiming(time, out);

  // Gidiş-dönüş: ikinci bacakta uç noktalar YER DEĞİŞTİRİR, yoksa ikinci atış da
  // aynı yöne gider ve animasyon "geri sarma" gibi görünür.
  const a = t.forward ? from : to;
  const b = t.forward ? to : from;

  out.position.lerpVectors(a, b, t.eased);
  out.position.y += Math.sin(Math.PI * t.flightU) * JUGGLE_ARC;
  out.position.addScaledVector(pull, Math.sin(Math.PI * t.flightU) * JUGGLE_BEND);

  // Tutuşta top avuca iyice oturur: küçük bir "yerleşme" hareketi (yakalayınca
  // hafif yukarı, sonra oturur) — statik duruş hissini kırar.
  if (t.holding) {
    out.position.y += Math.sin(Math.PI * t.holdU) * 0.014;
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
  return out;
}
