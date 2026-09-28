// 🎥 cameraShake — patlamaların kamerayı SARSTIĞI tek atımlık darbeler.
//
// NEDEN GEREKLİ: bir bomba patladığında ekranda kalan tek ipucu parlaklıktır;
// oyuncu "bunun altında kaldığını" GÖVDESİYLE hissetmez. Büyük AoE patlamaları
// (özellikle ulti) kamerayı sarsar — patlamanın ağırlığını anlatan şey karedir,
// alev değil. Ultinin "sağlam patladı" okuması bu katmandan gelir.
//
// NEDEN AYRI MODÜL: sarsıntıyı tetikleyen taraf SİMÜLASYONDUR (patlama veri
// yolu), uygulayan taraf ise KAMERADIR (`ArenaCamera`). İkisi arasında React
// state'i kurmak her patlamada yeniden çizim demek olurdu; burada
// `bombBlast`/`aimState` ile aynı desen kullanılır: paylaşılan mutable kuyruk,
// yazan simülasyon, okuyan render döngüsü.
//
// NEDEN DARBE (impulse), NEDEN SÜREKLİ SARSINTI DEĞİL: erken bir denemede
// sarsıntı "durum" olarak tutulmuş ve sahne bozuk görünmüştü — sürekli sallanan
// bir kamera haritayı oynatmak değil, okunmaz kılmaktır. Burada her patlama
// KENDİ ÖMRÜ OLAN bir darbe bırakır: tepe anında güçlü, karesel sönümle
// (bkz. `stepCameraShake`) hızla durur. Aynı anda birkaç patlama olursa darbeler
// TOPLANIR ama TOPLAM GENLİK SINIRLIDIR (`MAX_AMPLITUDE`), yani üst üste binen
// ultiler bile kamerayı ters çeviremez.
//
// MESAFE SÖNÜMÜ: uzaktaki bir tuzak, oyuncunun kendi ekranını sarsmamalıdır.
// Her darbenin bir `reach`i (etki yarıçapı, px) vardır ve genlik mesafeyle
// `1 / (1 + (d / reach)²)` oranında düşer. ULTİ bu yüzden oyunun her yerinden
// hissedilir (geniş reach + yüksek genlik), tuzak ise yalnız yakınında.
//
// Ölçü birimi: konumlar sim uzayıdır (dünya px) — çağıran `x`/`y`yi olduğu
// gibi geçirir, kamera kendi hedefiyle karşılaştırır.

/**
 * Sim px → dünya birimi. `ArenaCamera`/`Arena3D` ile AYNI olmak zorundadır;
 * burada yerel tutulur çünkü bu modül `shared`ten bağımsızdır (paylaşılan
 * ölçüyü içe almak patlama veri yolu ile döngüsel bağımlılık kurardı ve
 * kamera katmanının simülasyon katmanına bağlanması gerekmez).
 */
const S = 50;

/** Aynı anda izlenen en fazla darbe (eskisi düşer — kuyruk sınırlıdır). */
const MAX_IMPULSES = 6;
/** Bir darbenin ömrü (sn) — karesel sönümle bu sürede sıfıra iner. */
const IMPULSE_LIFE = 0.62;
/**
 * Genliğin birimi: dünya birimi cinsinden kamera kayması (1.0 = 1 birim ≈
 * dövüşçü gövdesinin 2/3'ü). Değerler bilinçli olarak KÜÇÜKTÜR: kamera
 * oyuncunun 6.7 birim uzağında durur, 0.2'lik bir kayma ekranda ~%10'luk bir
 * oynama demektir — "sarsıldı" der, haritayı okunmaz kılmaz.
 */
const MAX_AMPLITUDE = 0.24;
/** Sarsıntı frekansı (rad/sn) — genlik arttıkça biraz yükselir (daha sert). */
const SHAKE_SPEED = 34;

export interface ShakeSample {
  /** Kameraya eklenecek dünya kayması (birim). */
  x: number;
  y: number;
  z: number;
  /** Bakış ekseni çevresindeki YATIRMA (rad) — sarsıntıyı "titreme" yapan şey. */
  roll: number;
}

interface Impulse {
  x: number;
  y: number;
  /** Tepe genliği (dünya birimi). */
  amount: number;
  /** Etki yarıçapı (dünya px) — mesafe sönümü bununla ölçülür. */
  reach: number;
  /** Geçen süre (sn). */
  age: number;
  /** Faz kayması: aynı anda olan patlamalar aynı yöne sallanmasın. */
  phase: number;
}

const impulses: Impulse[] = [];

/**
 * Bir patlamanın kamera darbesini bırakır.
 *
 * `amount` tepe genliği (dünya birimi), `reach` etki yarıçapıdır (dünya px).
 * Çağıran bunları patlamanın GÜCÜNDEN türetir (bkz. `shared` →
 * `pushBombBlastFx`: tuzak 1×, fırlatılan bomba/ulti `power` katı).
 */
export function pushCameraShake(
  x: number,
  y: number,
  amount: number,
  reach: number,
): void {
  if (impulses.length >= MAX_IMPULSES) impulses.shift();
  impulses.push({
    x,
    y,
    amount,
    reach,
    age: 0,
    phase: Math.random() * Math.PI * 2,
  });
}

/** Sahne kurulurken: önceki maçtan kalan darbeler yeni arenaya taşınmasın. */
export function resetCameraShake(): void {
  impulses.length = 0;
}

/* Sarsıntı gürültüsü: tek sinüs "mekanik" okunur; farklı asal-benzeri
 * frekansların toplamı düzensiz bir titreme verir (fünye aleviyle aynı gerekçe).
 * Hepsi ±1 aralığında kalacak şekilde normalize edilmiştir (0.5+0.3+0.2). */
function noise(t: number): number {
  return (
    Math.sin(t) * 0.5 + Math.sin(t * 2.31 + 1.7) * 0.3 + Math.sin(t * 4.77 + 0.4) * 0.2
  );
}

/** Kare başına yeniden kullanılan örnek (tahsis yok). */
const sample: ShakeSample = { x: 0, y: 0, z: 0, roll: 0 };
/** Sarsıntının kendi saati — genlik 0'a inince sıfırlanır (tekrar başlarken
 *  faz sürekliliği gerekmez, ama kayma birikmesin diye tutulur). */
let clock = 0;

/**
 * Darbeleri bir adım ilerletir ve kameraya uygulanacak kaymayı döndürür.
 *
 * `camX`/`camZ` dünya birimidir (kameranın baktığı hedef) — mesafe sönümü
 * buna göre hesaplanır. Dönen nesne HER KARE AYNIDIR (yeniden kullanılır).
 */
export function stepCameraShake(
  dt: number,
  camX: number,
  camZ: number,
): ShakeSample {
  let amplitude = 0;
  let phase = 0;

  for (let i = impulses.length - 1; i >= 0; i--) {
    const imp = impulses[i];
    imp.age += dt;
    if (imp.age >= IMPULSE_LIFE) {
      impulses.splice(i, 1);
      continue;
    }
    // Mesafe sönümü: uzaktaki patlama kendi ekranını sarsmaz.
    const dist = Math.hypot(imp.x / S - camX, imp.y / S - camZ);
    const att = 1 / (1 + (dist / Math.max(1e-3, imp.reach / S)) ** 2);
    // Karesel sönüm: tepe anında sert, sonra hızla durur.
    const k = 1 - imp.age / IMPULSE_LIFE;
    amplitude += imp.amount * att * k * k;
    phase += imp.phase;
  }

  if (amplitude <= 0) {
    sample.x = 0;
    sample.y = 0;
    sample.z = 0;
    sample.roll = 0;
    clock = 0;
    return sample;
  }

  if (amplitude > MAX_AMPLITUDE) amplitude = MAX_AMPLITUDE;
  // Genlik arttıkça frekans da artar: küçük bir tuzak "küt" eder, ulti çarpar.
  clock += dt * SHAKE_SPEED * (0.7 + 0.6 * (amplitude / MAX_AMPLITUDE));

  sample.x = noise(clock + phase) * amplitude;
  sample.y = noise(clock * 1.37 + phase + 2.1) * amplitude * 0.75;
  sample.z = noise(clock * 0.91 + phase + 4.3) * amplitude * 0.6;
  // Yatırma (roll) en çok okunan bileşendir: kamera yalpalamadan sarsıntı
  // "kayma" gibi görünür.
  sample.roll = noise(clock * 1.13 + phase + 1.1) * amplitude * 0.09;
  return sample;
}
