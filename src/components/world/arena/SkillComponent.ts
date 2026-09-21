// ⚔️ SkillComponent — bekleme süreleri (cooldown), menzil kuralları ve atış.
//
// Yetenek sisteminin TEK sahibi bu modüldür; iki arena (bot + PvP) da aynı
// tabloyu kullanır:
//
//   · `tickCooldown` / `tickSuperPassive` / `tickSamuraiPassive` — zamanlayıcılar
//     ve ŞARJ TABLOSU (zamanla dolan yetenek şarjları).
//   · `planBasicAttack` — düz vuruş: bekleme süresi, MAX_RANGE nişanı
//     (nişan > menzil içi otomatik kilit > bakış yönü), gövde dönüşü, vuruş
//     animasyonunun başlatılması ve çalıdan görünme.
//   · `castSuper` — süper yetenek tablosu (isik / simsek / sifa / ates / temel).
//     Her dal nişan yönünde ve EN FAZLA MAX_RANGE kadar etki eder; düşman
//     haritanın neresinde olursa olsun oraya giden bir atış yok.
//   · `castUltimate` — samuray 2. ultisi: gövde yönü + menzil sınırlı yarık.
//
// Arenaya özgü hasar ve ağ (PvP) katmanı `SkillHost` adaptörü üzerinden
// bağlanır: bu modül yalnızca kuralı ve görseli yönetir, hasarın nasıl
// uygulandığını bilmez.
import {
  AIM_TURN_HOLD_BASIC,
  ATK_CD,
  BUSH_REVEAL_MS,
  faceAimYaw,
  isSamuraiFighter,
  startAttackAnim,
  type BattleFighter,
} from "@/components/world/Arena3D";
import type { SoundName } from "@/lib/sounds";
import type { VfxBus } from "./VFXComponent";
import {
  MAX_RANGE_PX,
  aimState,
  aimedHit,
  bodyDir,
  rangePoint,
  resolveAim,
  type AimDir,
} from "./skillshot";

/** Işın (isik) yeteneğinin ulaşabildiği en uzak mesafe (px). */
export const BEAM_MAX_LEN = 560;
/** Süper yetenek çeşitleri — tabloda dönen dallar. */
export type SuperKind = "beam" | "dash" | "heal" | "fireball" | "pierce";
/** Mermi seçenekleri (spawn adaptörüne aynen geçirilir). */
export interface ProjOpts {
  r?: number;
  pierce?: boolean;
  speed?: number;
  explodeR?: number;
}

/**
 * Arenaya özgü uygulama katmanı. Bot arenası hasarı doğrudan uygular, PvP ise
 * aynı çağrılarda karşı cihaza olay gönderir — kural bu modülde kalır.
 */
export interface SkillHost {
  vfx: VfxBus;
  sound: (name: SoundName, opts?: { volume?: number; rate?: number }) => void;
  /** Nişan yönünde mermi doğurur. */
  spawn: (
    caster: BattleFighter,
    target: { x: number; y: number },
    dmg: number,
    opts?: ProjOpts,
  ) => void;
  /**
   * Işın ateşlendi — HER ZAMAN çağrılır (isabet etmese de). Böylece PvP karşı
   * cihaza ışını iletebilir, bot arenası yalnızca isabette hasar uygular.
   * `len` ışının menzili, `hit` menzil/açı içinde hedef var mı bilgisidir.
   */
  onBeam: (
    caster: BattleFighter,
    enemy: BattleFighter,
    aim: AimDir,
    len: number,
    hit: boolean,
  ) => void;
  /** Ulti başladığında (PvP rakibe haber verir; bot arenası boş bırakır). */
  onUltStart?: (caster: BattleFighter) => void;
  /** Çalı gizlenmesi gibi hâllerde otomatik kilidi kapatır. */
  canLock: (enemy: BattleFighter, caster: BattleFighter) => boolean;
}

/* ------------------------------- zamanlayıcı ------------------------------ */

/* ⚡ ŞARJ TABLOSU — "yavaş yavaş süre ile dolan" yetenekler
 *
 * KURAL (tek kaynak, iki arena da bunu okur):
 *   · Düz vuruş (ana skil) şarj DEĞİLDİR: hızlı bir bekleme süresiyle
 *     (`ATK_CD`) sınırlı kalır.
 *   · Bunun dışındaki bütün yetenekler — SÜPER yetenek, Kraliyet ultisi ve
 *     yakın dövüş — zamanla AZAR AZAR dolar ve ancak %100'de kullanılabilir.
 *   · Dolum yavaştır: saniyede ~%6 (tam dolum ~17 sn). Vuruş başına kazanç da
 *     aynı ölçekte tutulur, böylece şarj ne tek başına hasara ne de tek başına
 *     zamana bağlı kalır — ikisi birlikte ilerler.
 *
 * Eski değerler (0.15–0.30/sn ve vuruş başına 0.26) barı birkaç saniyede
 * dolduruyordu: yetenek normal atıştan farksız hale geliyordu. Tablo, eski
 * hızın ~%40'ıdır (istenen "orta hız").
 */
/** SÜPER yeteneğin saniyedeki pasif dolum oranı (0..1). */
export const SUPER_CHARGE_PS = 0.06;
/** Kraliyet (samuray) ultisinin saniyedeki pasif dolum oranı (0..1). */
export const ULT_CHARGE_PS = 0.064;
/** Vuruş başına şarj kazancı: hasar veren taraf. */
export const SUPER_CHARGE_DEAL = 0.104;
export const ULT_CHARGE_DEAL = 0.104;
/** Vuruş başına şarj kazancı: hasar alan taraf (denge için yarısı). */
export const SUPER_CHARGE_TAKE = 0.048;
export const ULT_CHARGE_TAKE = 0.048;

/** Vuruş bekleme süresini ilerletir (süre bitince 0'da durur). */
export function tickCooldown(f: BattleFighter, dt: number): void {
  f.atkCd = Math.max(0, f.atkCd - dt);
}

/**
 * SÜPER yeteneğin şarjını zamanla doldurur (pasif dolum).
 *
 * `scale` yalnızca botun seviye farkını taşır (yüksek seviye biraz daha hızlı
 * dolar) — oyuncu 1 ile çağırır. Bar dolduğunda durur: %100'ün üstü yoktur.
 */
export function tickSuperPassive(
  f: BattleFighter,
  dt: number,
  scale = 1,
): void {
  if (f.superCharge >= 1) return;
  f.superCharge = Math.min(1, f.superCharge + dt * SUPER_CHARGE_PS * scale);
}

/** Kraliyet (samuray) 2. ultisi zamanla dolar (pasif şarj; bkz. şarj tablosu). */
export function tickSamuraiPassive(
  f: BattleFighter,
  dt: number,
  rate = ULT_CHARGE_PS,
): void {
  if (!isSamuraiFighter(f) || f.samuraiCharge >= 1) return;
  f.samuraiCharge = Math.min(1, f.samuraiCharge + dt * rate);
}

/* ---------------------------------- nişan --------------------------------- */

/** Yetenek butonunda basılı tutulan nişan vektörü (0/0 → otomatik). */
export function abilityAimInput(): { dx: number; dy: number } {
  return {
    dx: aimState.ability ? aimState.dx : 0,
    dy: aimState.ability ? aimState.dy : 0,
  };
}

/**
 * Nişanı menzil kuralıyla çözer. YETENEKLER için kural: **menzil çemberi
 * içinde düşman varsa nişan her durumda ona kilitlenir** (`preferLock`) — bu
 * hem süper yetenekler hem de Kraliyet Savaşçısı ultisi için geçerlidir
 * (`castUltimate` de bu fonksiyonu çağırır). Çember içinde düşman yoksa sıra:
 * elle nişan > gövdenin baktığı yön.
 */
export function planAim(
  caster: BattleFighter,
  enemy: BattleFighter,
  host: SkillHost,
  input: { dx: number; dy: number } = abilityAimInput(),
): AimDir {
  return resolveAim(caster, enemy, input.dx, input.dy, {
    canLock: host.canLock(enemy, caster),
    preferLock: true,
  });
}

/* ------------------------------- düz vuruş -------------------------------- */

export interface BasicAttackPlan {
  /** Çözülen atış yönü (kilitliyse hedefe bakar). */
  aim: AimDir;
  /** Menzil sonundaki hedef noktası — mermi buraya nişanlanır. */
  end: { x: number; y: number };
}

/**
 * Düz vuruşu planlar ve uygular: bekleme süresi, animasyon, gövde dönüşü,
 * çalıdan görünme. `permitted` false ise (yükleme bitmedi / maç bitti / ölü)
 * hiçbir şey yapılmaz ve `null` döner.
 */
export function planBasicAttack(
  caster: BattleFighter,
  enemy: BattleFighter,
  host: SkillHost,
  permitted: boolean,
  aimX?: number,
  aimY?: number,
): BasicAttackPlan | null {
  // Yakın dövüş salınımı sırasında karakter köklenmiştir: düz vuruş yok.
  if (
    !permitted ||
    caster.hp <= 0 ||
    caster.dashT > 0 ||
    caster.meleeT > 0 ||
    caster.atkCd > 0
  )
    return null;
  caster.atkCd = ATK_CD;
  // Skillshot hedefi: nişan varsa tam o yön; yoksa yalnızca MENZİL İÇİNDEKİ
  // düşmana otomatik kilit; o da yoksa karakterin baktığı yön.
  const aim = resolveAim(caster, enemy, aimX, aimY, {
    canLock: host.canLock(enemy, caster),
  });
  const end = rangePoint(caster, aim);
  caster.facing = end.x >= caster.x ? 1 : -1;
  // 🎯 ATIŞ YÖNÜNE DÖNÜŞ: düz vuruşta gövde çözülen nişan yönüne döner
  // (elle nişan > menzil içi otomatik kilit > bakış yönü). Kilit, vuruş
  // animasyonu kadar açık kalır: yürürken ateş etsen de gövde hedefte kalır.
  faceAimYaw(caster, aim.x, aim.y, AIM_TURN_HOLD_BASIC);
  // Düz vuruş animasyonu: kısa köklenme (windup) + kesilebilir bitiş.
  startAttackAnim(caster);
  // Ateş etmek (çalıdan bile) karakteri bir an görünür kılar.
  caster.revealUntil = performance.now() + BUSH_REVEAL_MS;
  return { aim, end };
}

/* ------------------------------ süper yetenek ----------------------------- */

/** Işın yeteneği: nişan yönüne, menzil kadar; hasar yalnızca menzil/açı içinde. */
export function castBeam(
  caster: BattleFighter,
  enemy: BattleFighter,
  aim: AimDir,
  host: SkillHost,
): void {
  const ang = Math.atan2(aim.y, aim.x);
  const len = Math.min(BEAM_MAX_LEN, MAX_RANGE_PX);
  host.vfx.beam(
    caster.x,
    caster.y,
    caster.x + Math.cos(ang) * len,
    caster.y + Math.sin(ang) * len,
  );
  // Işın her durumda iletilir; hasar yalnızca menzil/açı içindeki hedefe işler.
  host.onBeam(
    caster,
    enemy,
    aim,
    len,
    aimedHit(caster, aim, enemy, { rangePx: len }),
  );
}

/** Şimşek yeteneği: nişan yönüne dash (düşmanın konumuna değil). */
export function startDash(
  caster: BattleFighter,
  aim: AimDir,
  host: SkillHost,
): void {
  caster.dashVX = aim.x;
  caster.dashVY = aim.y;
  caster.dashT = 0.32;
  caster.dashHit = false;
  host.vfx.ring(caster.x, caster.y - 40, 60, "#a5f3fc", 0.35);
  host.vfx.ring(caster.x, caster.y - 60, 40, "#e0f2fe", 0.3);
}

/** Şifa yeteneği: karakterin kendi canını doldurur + yeşil aura. */
function castHeal(caster: BattleFighter, host: SkillHost): void {
  const heal = Math.round(caster.maxHp * 0.45);
  caster.hp = Math.min(caster.maxHp, caster.hp + heal);
  host.vfx.text(caster.x, caster.y - 135, `+${heal}`, "#4ade80");
  host.vfx.ring(caster.x, caster.y - 40, 70, "#86efac", 0.5);
  host.vfx.ring(caster.x, caster.y - 40, 45, "#bbf7d0", 0.4);
}

/**
 * Süper yeteneği kullanır. `aim` verilmezse menzil kuralıyla çözülür.
 * Şarj her durumda sıfırlanır (yeteneğin kullanıldığı an).
 */
export function castSuper(
  caster: BattleFighter,
  enemy: BattleFighter,
  host: SkillHost,
  aim?: AimDir,
): { kind: SuperKind } {
  // `aim` verilmezse (bot) menzil kuralı: yalnızca menzil içi otomatik kilit,
  // yoksa gövdenin baktığı yön. Oyuncu tarafında `planAim` (basılı tutulan
  // nişan vektörü) açıkça geçirilir.
  const dir =
    aim ??
    resolveAim(caster, enemy, 0, 0, { canLock: host.canLock(enemy, caster) });
  // 🎯 Yetenek nişanına dönüş: kilit, karakter dururken de yürürken de
  // gövdeyi atış/hedef yönüne çevirir (şifa gibi kendine kullanılan
  // yeteneklerde de sadece bakışı bozmaz — yön zaten bakıştan gelir).
  faceAimYaw(caster, dir.x, dir.y);
  caster.superCharge = 0;
  // Kılıç izi (SlashTrail) için görsel tetik: 1 → 0 sayacı rig'de iner.
  // Oyun mantığına etkisi yoktur; yalnızca "yetenek kullanıldı" anını çizer.
  caster.castFxT = 1;
  host.sound("super", { volume: 0.9 });
  host.vfx.smoke(caster.x, caster.y - 20, 4, 80);
  switch (caster.ability.id) {
    case "isik":
      castBeam(caster, enemy, dir, host);
      return { kind: "beam" };
    case "simsek":
      host.sound("dash");
      startDash(caster, dir, host);
      return { kind: "dash" };
    case "sifa":
      castHeal(caster, host);
      return { kind: "heal" };
    case "ates":
      // Ateş Topu: nişan yönünde MENZİL sonunda patlar.
      host.spawn(caster, rangePoint(caster, dir), 320, {
        r: 17,
        speed: 290,
        explodeR: 130,
      });
      return { kind: "fireball" };
    default: {
      // Temel — delici güçlü atış: nişan yönünde, menzil sonuna kadar.
      host.spawn(caster, rangePoint(caster, dir), 240, {
        r: 20,
        pierce: true,
        speed: 400,
      });
      return { kind: "pierce" };
    }
  }
}

/* ---------------------------------- ulti --------------------------------- */

/**
 * Samuray 2. ultisi. Gövde nişan yönüne döner (yatay: facing, dikey: vy) →
 * kılıç ve yarık aynı yöne gider. Yön sırası: nişan > menzil içi düşman >
 * bakış yönü. Uygun değilse `null` döner.
 */
export function castUltimate(
  caster: BattleFighter,
  enemy: BattleFighter,
  host: SkillHost,
  permitted = true,
): AimDir | null {
  if (
    !permitted ||
    caster.hp <= 0 ||
    !isSamuraiFighter(caster) ||
    caster.samuraiCharge < 1 ||
    caster.samuraiUltT > 0 ||
    // Yakın dövüşle çakışmasın: kılıç aynı anda iki pozu süremez.
    caster.meleeT > 0
  )
    return null;
  const aim = planAim(caster, enemy, host);
  caster.samuraiCharge = 0;
  // İz, ulti salınımının kendi sayacıyla (samuraiUltT) çizilir; ek tetik yok.
  caster.castFxT = 0;
  caster.samuraiUltT = 0.82;
  caster.samuraiUltHit = false;
  caster.facing = aim.x >= 0 ? 1 : -1;
  caster.vy = Math.abs(aim.y) > 0.5 ? (aim.y > 0 ? 1 : -1) : 0;
  // 🎯 Ulti boyunca gövde tam hedef açısına kilitlenir: facing/vy 4 yöne
  // yuvarlandığı için çaprazdaki hedefe kılıç savrulması düzelir.
  faceAimYaw(caster, aim.x, aim.y, 0.82);
  host.sound("super", { volume: 1, rate: 0.72 });
  host.vfx.ring(caster.x, caster.y, 90, "#fbbf24", 0.55);
  host.vfx.smoke(caster.x, caster.y, 5, 100);
  host.onUltStart?.(caster);
  return aim;
}

export interface UltCrackPath {
  /** Kılıcın yere indiği nokta (karakterin önü). */
  impactX: number;
  impactY: number;
  /** Yarığın bittiği nokta (en fazla MAX_RANGE). */
  x2: number;
  y2: number;
  dirX: number;
  dirY: number;
  /** Yarığın hasar menzili (px) — `aimedHit` ile aynı sınır. */
  reach: number;
}

/**
 * Ulti yarığının geometrisi: çizgi karakterin ÖNÜNDEN başlar ve verilen yöne
 * en fazla MAX_RANGE ilerler (eskiden düşmanın konumuna, haritanın öbür ucuna
 * uzuyordu).
 */
export function ultCrackPath(
  caster: BattleFighter,
  dirX?: number,
  dirY?: number,
): UltCrackPath {
  if (dirX === undefined || dirY === undefined) {
    // Yön verilmediyse gövdenin baktığı tam açı (restYaw) kullanılır.
    const body = bodyDir(caster);
    dirX = body.x;
    dirY = body.y;
  }
  const reach = MAX_RANGE_PX;
  return {
    impactX: caster.x + dirX * 50,
    impactY: caster.y + dirY * 50,
    x2: caster.x + dirX * reach,
    y2: caster.y + dirY * reach,
    dirX,
    dirY,
    reach,
  };
}

/**
 * Yarığın görsel + ses patlaması. İki arena da (bot + PvP) aynı efekti
 * kullanır; dönüş değeri ağ olayı ve hasar için kullanılır.
 */
export function emitUltCrack(
  caster: BattleFighter,
  dirX: number,
  dirY: number,
  host: SkillHost,
  opts: { smokeCount?: number; smokeGrow?: number; trail?: boolean } = {},
): UltCrackPath {
  const path = ultCrackPath(caster, dirX, dirY);
  host.vfx.crack(path.impactX, path.impactY, path.x2, path.y2);
  host.vfx.burst(path.impactX, path.impactY, 90, "#fbbf24", 0.4);
  const smokeCount = opts.smokeCount ?? 4;
  if (smokeCount > 0) {
    host.vfx.smoke(
      path.impactX,
      path.impactY,
      smokeCount,
      opts.smokeGrow ?? 80,
    );
  }
  if (opts.trail) {
    for (let s = 1; s <= 3; s++) {
      host.vfx.smoke(
        path.impactX + dirX * 55 * s,
        path.impactY + dirY * 55 * s,
        2,
        70,
      );
    }
  }
  return path;
}
