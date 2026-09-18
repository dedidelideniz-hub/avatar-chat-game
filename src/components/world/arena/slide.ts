// 🏃 Kapsül tabanlı, sürtünmesiz kayma hareketi (Internal Edge Bug çözümü).
//
// Eski hareket kodu tek bir "hedef noktayı dene, engelliyse hiç oynama"
// mantığıyla çalışıyordu. Bu iki sorun üretiyordu:
//
//   1. KARO DİKİŞİNE TAKILMA — zemin yüzlerce üçgen/mesh'ten rasterize
//      edildiği için iki karo arasında tek hücrelik görünmez engel kalabiliyor.
//      Tek adımlık test bu dikişe çarpar çarpmaz karakteri tamamen durduruyor
//      (düz yolda yürürken takılma).
//   2. DUVARA UZAKTAN YAPIŞMA — engel reddedildiği anda karakter bir önceki
//      karedeki konumda kalıyor, yani duvara değmeden ~1 karelik mesafe
//      uzakta donuyordu.
//
// Bu yardımcı Unity'nin Character Controller mantığını taklit eder:
//   • Capsule/Sphere base — tabanı yuvarlatılmış gövde gibi küçük pürüzlerin
//     ÜZERİNDEN kayar (`STEP_OFFSET` kadar küçültülmüş yarıçapla deneme).
//   • Friction = 0 — temas anında hız sıfırlanmaz: hareket, engelin teğetine
//     izdüşürülerek kaydırılır (smooth wall sliding).
//   • Sub-step — tek karedeki büyük yer değiştirme (dash) küçük parçalara
//     bölünür; hem tünelleme hem de tek karelik takılma engellenir.

/** Tek alt adımda en fazla bu kadar px ilerlenir (tünelleme/takılma önler). */
const MAX_SUB_STEP = 3;
/** Adım payı (step offset): engellendiğinde bu kadar küçültülmüş yarıçapla
 *  yeniden denenir — mikro dikişleri aşar.
 *
 *  4 px → 2 px: eski değer, erozyondan sonra ince kalan gerçek engel
 *  çekirdeklerini (haritadaki küçük kayalar) de "tırmanılabilir" sayıyordu;
 *  yani görselde duran kayanın içinden geçilebiliyordu. Kısılan değer hâlâ
 *  dikişleri aşar (engel maskesi artık yalnızca gerçek kaya/duvar/kule
 *  kütlelerinden gelir, arazi kırıntılarından değil) ama ince bir engeli
 *  geçirmez. */
const STEP_OFFSET = 2;
/** Bir alt adımda sırayla denenen ilerleme oranları: temas mesafesine kadar
 *  yaklaşmayı sağlar (engelin önünde boşlukta donma yok). */
const FRACTIONS = [1, 0.72, 0.5, 0.34, 0.22, 0.14, 0.08] as const;

export type BlockedTest = (x: number, y: number, r: number) => boolean;

/**
 * (x0, y0) noktasından (dx, dy) kadar gitmeyi dener ve çarpışmaya göre
 * düzeltilmiş yeni konumu döndürür. `blocked(x, y, r)` verilen yarıçapla
 * konumun engelli olup olmadığını söyler (BattleMapModel.hitsRockCollision).
 */
export function slideStep(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  blocked: BlockedTest,
  radius: number,
): { x: number; y: number; moved: boolean } {
  let x = x0;
  let y = y0;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-4) return { x, y, moved: false };

  const steps = Math.max(1, Math.ceil(dist / MAX_SUB_STEP));
  const sx = dx / steps;
  const sy = dy / steps;
  // Step offset yalnızca gerçekten engellendiğimizde devreye girer ve asla
  // gövdeyi engelin içine sokmaz: küçültülmüş yarıçap hâlâ engel TESTİNDEN
  // geçmek zorundadır.
  const stepRadius = Math.max(2, radius - STEP_OFFSET);
  let moved = false;

  for (let i = 0; i < steps; i++) {
    // 1) Doğal vektör — açık arazide tek deneme yeter.
    if (!blocked(x + sx, y + sy, radius)) {
      x += sx;
      y += sy;
      moved = true;
      continue;
    }
    // 2) Temas mesafesine kadar yaklaş: duvara değene kadar süzülür
    //    (sürtünmesiz yüzey; karakter engelin önünde havada kalmaz).
    let applied = false;
    for (const f of FRACTIONS) {
      if (f === 1) continue;
      if (!blocked(x + sx * f, y + sy * f, radius)) {
        x += sx * f;
        y += sy * f;
        moved = true;
        applied = true;
        break;
      }
    }
    if (applied) continue;
    // 3) Eksen bazlı kayma: engelin teğeti boyunca ilerleme (wall slide).
    //    İki eksen ayrı ayrı denenir, böylece köşede tamamen durulmaz.
    if (!blocked(x + sx, y, radius)) {
      x += sx;
      moved = true;
      applied = true;
    }
    if (!blocked(x, y + sy, radius)) {
      y += sy;
      moved = true;
      applied = true;
    }
    if (applied) continue;
    // 4) Step offset: tabanı yuvarlatılmış gövde gibi küçük eşikleri (arazi
    //    dikişi, kaldırım kenarı, ufak taş) aşmayı dene.
    for (const f of FRACTIONS) {
      if (!blocked(x + sx * f, y + sy * f, stepRadius)) {
        x += sx * f;
        y += sy * f;
        moved = true;
        break;
      }
    }
  }

  return { x, y, moved };
}
